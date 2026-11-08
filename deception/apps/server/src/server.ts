import { createServer as createHttpServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { Server, type Socket } from "socket.io";
import { createActor, fromTransition } from "xstate";
import { z } from "zod";
import {
  applyCommand,
  canChat,
  commandSchema,
  createGame,
  defaultSettings,
  departPlayer,
  forensicId,
  project,
  roleId,
  settingsSchema,
  tick,
  type Command,
  type GameState,
  type LobbyMember,
  type ChatMessage,
  type RoomView,
  type Session,
  type Settings,
} from "@deception/shared";

type ActorEvent =
  | { type: "COMMAND"; command: Command; now: number }
  | { type: "TICK"; now: number }
  | { type: "SYNC"; game: GameState };
function makeActor(game: GameState) {
  return createActor(
    fromTransition(
      (
        context: { game: GameState; error: string | null },
        event: ActorEvent,
      ) => {
        try {
          return {
            game:
              event.type === "SYNC"
                ? event.game
                : event.type === "TICK"
                  ? tick(context.game, event.now)
                  : applyCommand(context.game, event.command, event.now),
            error: null,
          };
        } catch (error) {
          return {
            ...context,
            error: error instanceof Error ? error.message : "INVALID_ACTION",
          };
        }
      },
      { game, error: null },
    ),
  ).start();
}
interface Member extends LobbyMember {
  token: string;
  socketId: string | null;
  disconnectedAt: number | null;
}
interface Room {
  code: string;
  hostId: string;
  members: Member[];
  settings: Settings;
  manualRoles: boolean;
  forensicChoice: string | null;
  actor: ReturnType<typeof makeActor> | null;
  chat: ChatMessage[];
  pausedAt: number | null;
  updatedAt: number;
}
const nicknameSchema = z.string().trim().min(1).max(20);
const codeSchema = z.string().regex(/^\d{4}$/);
const idSchema = z.string().min(1).max(100);

export function createApp(
  options: { origin?: string; now?: () => number; scheduler?: boolean } = {},
) {
  const now = options.now ?? Date.now;
  const rooms = new Map<string, Room>();
  const limits = new Map<string, { at: number; count: number }>();
  const webRoot = resolve(
    fileURLToPath(new URL("../../web/dist/", import.meta.url)),
  );
  const http = createHttpServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, game: "neon-casefiles" }));
      return;
    }
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    let path: string;
    try {
      path = resolve(
        webRoot,
        `.${decodeURIComponent((req.url ?? "/").split("?")[0])}`,
      );
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (path !== webRoot && !path.startsWith(webRoot + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!existsSync(path) || !statSync(path).isFile())
      path = resolve(webRoot, "index.html");
    if (!existsSync(path)) {
      res.writeHead(404);
      res.end("Run pnpm build or use the Vite dev server.");
      return;
    }
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".webmanifest": "application/manifest+json",
      ".png": "image/png",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(path).pipe(res);
  });
  const io = new Server(http, {
    maxHttpBufferSize: 16_384,
    cors: options.origin ? { origin: options.origin.split(",") } : undefined,
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin) return callback(null, true);
      try {
        const allowed = options.origin?.split(",") ?? [];
        callback(
          null,
          allowed.includes(origin) || new URL(origin).host === req.headers.host,
        );
      } catch {
        callback(null, false);
      }
    },
  });
  const current = (room: Room) =>
    room.actor?.getSnapshot().context.game ?? null;
  function rate(key: string, max = 30, window = 10_000) {
    const t = now();
    const old = limits.get(key);
    const value = !old || t - old.at >= window ? { at: t, count: 0 } : old;
    if (++value.count > max)
      throw new Error("메시지를 너무 빠르게 보냈습니다. 잠시 기다려 주세요.");
    limits.set(key, value);
  }
  function view(room: Room, member: Member): RoomView {
    const game = current(room);
    const role = game?.roles[member.id];
    return {
      code: room.code,
      hostId: room.hostId,
      selfId: member.id,
      members: room.members.map(({ id, name, seat, connected, ready }) => ({
        id,
        name,
        seat,
        connected,
        ready,
      })),
      settings: { ...room.settings },
      forensicChoice: room.forensicChoice,
      game: game ? project(game, member.id) : null,
      chat: room.chat
        .filter(
          (m) =>
            m.channel === "public" ||
            role === "murderer" ||
            role === "accomplice",
        )
        .map((m) => ({ ...m })),
      serverNow: now(),
      pausedAt: room.pausedAt,
      abortAvailableAt: room.pausedAt === null ? null : room.pausedAt + 60_000,
    };
  }
  function emit(room: Room) {
    for (const member of room.members)
      if (member.socketId)
        io.to(member.socketId).emit("state", view(room, member));
  }
  function sync(room: Room, game: GameState) {
    room.actor!.send({ type: "SYNC", game });
  }
  function normalizeLobby(room: Room) {
    room.members.forEach((m, i) => {
      m.seat = i;
      m.ready = false;
    });
    if (room.members.length < 6 || !room.manualRoles) {
      const defaults = defaultSettings(room.members.length);
      room.settings.accomplice = defaults.accomplice;
      room.settings.witness = defaults.witness;
    }
    if (!room.members.some((m) => m.id === room.forensicChoice))
      room.forensicChoice = null;
    if (!room.members.some((m) => m.id === room.hostId))
      room.hostId =
        room.members.find((m) => m.connected)?.id ?? room.members[0]?.id ?? "";
  }
  function session(socket: Socket): { room: Room; member: Member } {
    const room = rooms.get(socket.data.code);
    const member = room?.members.find(
      (m) => m.id === socket.data.playerId && m.socketId === socket.id,
    );
    if (!room || !member)
      throw new Error("유효한 방 세션이 없습니다. 다시 입장해 주세요.");
    return { room, member };
  }
  function bind(socket: Socket, room: Room, member: Member): Session {
    const previous = member.socketId;
    member.socketId = socket.id;
    member.connected = true;
    member.disconnectedAt = null;
    socket.data.code = room.code;
    socket.data.playerId = member.id;
    if (previous && previous !== socket.id) {
      io.to(previous).emit("replaced", {
        message: "다른 탭에서 이 플레이어로 접속했습니다.",
      });
      io.sockets.sockets.get(previous)?.disconnect(true);
    }
    const game = current(room);
    if (game) {
      const next = structuredClone(game);
      next.players.find((p) => p.id === member.id)!.connected = true;
      if (room.pausedAt !== null && member.id === forensicId(next)) {
        const delta = now() - room.pausedAt;
        if (next.timer.deadline !== null) next.timer.deadline += delta;
        if (next.nightStartedAt !== null) next.nightStartedAt += delta;
        if (next.solveLock) next.solveLock.expiresAt += delta;
        next.now = now();
        room.pausedAt = null;
      }
      sync(room, next);
    }
    room.updatedAt = now();
    emit(room);
    return { code: room.code, playerId: member.id, token: member.token };
  }
  function newMember(name: string, seat: number): Member {
    return {
      id: randomUUID(),
      name,
      seat,
      ready: false,
      connected: false,
      token: randomBytes(32).toString("base64url"),
      socketId: null,
      disconnectedAt: null,
    };
  }
  io.on("connection", (socket) => {
    function handle(name: string, fn: (payload: any) => unknown) {
      socket.on(name, (payload: unknown, ack?: (response: unknown) => void) => {
        try {
          rate(`socket:${socket.id}`);
          const data = fn(payload);
          ack?.({ ok: true, data });
        } catch (error) {
          ack?.({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "요청을 처리할 수 없습니다.",
          });
        }
      });
    }
    handle("create", (payload) => {
      const { name } = z
        .object({ name: nicknameSchema })
        .strict()
        .parse(payload);
      if (socket.data.code) throw new Error("현재 방에서 먼저 나가 주세요.");
      if (rooms.size >= 500)
        throw new Error("현재 생성 가능한 방 수를 초과했습니다.");
      let code = String(randomInt(1000, 10000));
      while (rooms.has(code)) code = String(randomInt(1000, 10000));
      const member = newMember(name, 0);
      const room: Room = {
        code,
        hostId: member.id,
        members: [member],
        settings: defaultSettings(1),
        manualRoles: false,
        forensicChoice: null,
        actor: null,
        chat: [],
        pausedAt: null,
        updatedAt: now(),
      };
      rooms.set(code, room);
      return bind(socket, room, member);
    });
    handle("join", (payload) => {
      const { code, name } = z
        .object({ code: codeSchema, name: nicknameSchema })
        .strict()
        .parse(payload);
      if (socket.data.code) throw new Error("현재 방에서 먼저 나가 주세요.");
      const room = rooms.get(code);
      if (!room || current(room))
        throw new Error("대기 중인 방을 찾을 수 없습니다.");
      if (room.members.length >= 12) throw new Error("방이 가득 찼습니다.");
      if (room.members.some((m) => m.name === name))
        throw new Error("방 안에 같은 닉네임이 있습니다.");
      const member = newMember(name, room.members.length);
      room.members.splice(randomInt(0, room.members.length + 1), 0, member);
      normalizeLobby(room);
      return bind(socket, room, member);
    });
    handle("resume", (payload) => {
      const value = z
        .object({
          code: codeSchema,
          playerId: idSchema,
          token: z.string().min(20).max(100),
        })
        .strict()
        .parse(payload);
      const room = rooms.get(value.code);
      const member = room?.members.find(
        (m) => m.id === value.playerId && m.token === value.token,
      );
      if (!room || !member) throw new Error("이전 세션이 만료됐습니다.");
      if (socket.data.code && socket.data.code !== room.code)
        throw new Error("현재 방에서 먼저 나가 주세요.");
      if (socket.data.playerId && socket.data.playerId !== member.id)
        throw new Error("현재 플레이어로 먼저 나가 주세요.");
      return bind(socket, room, member);
    });
    handle("ready", (payload) => {
      const { ready } = z
        .object({ ready: z.boolean() })
        .strict()
        .parse(payload);
      const { room, member } = session(socket);
      if (current(room)) throw new Error("이미 게임이 진행 중입니다.");
      member.ready = ready;
      emit(room);
    });
    handle("settings", (payload) => {
      const value = z
        .object({
          settings: settingsSchema,
          forensicChoice: idSchema.nullable(),
        })
        .strict()
        .parse(payload);
      const { room, member } = session(socket);
      if (current(room) || member.id !== room.hostId)
        throw new Error("방장만 대기실 설정을 바꿀 수 있습니다.");
      if (
        room.members.length < 6 &&
        (value.settings.accomplice || value.settings.witness)
      )
        throw new Error("공범과 목격자는 6인 이상에서 사용합니다.");
      if (
        value.forensicChoice &&
        !room.members.some((m) => m.id === value.forensicChoice)
      )
        throw new Error("지정할 법의학자를 찾을 수 없습니다.");
      room.settings = value.settings;
      room.manualRoles = true;
      room.forensicChoice = value.forensicChoice;
      room.members.forEach((m) => {
        m.ready = false;
      });
      emit(room);
    });
    handle("seats", (payload) => {
      const { ids } = z
        .object({ ids: z.array(idSchema).min(1).max(12) })
        .strict()
        .parse(payload);
      const { room, member } = session(socket);
      if (
        current(room) ||
        member.id !== room.hostId ||
        ids.length !== room.members.length ||
        new Set(ids).size !== ids.length ||
        !ids.every((id) => room.members.some((m) => m.id === id))
      )
        throw new Error("좌석을 변경할 수 없습니다.");
      room.members = ids.map((id) => room.members.find((m) => m.id === id)!);
      normalizeLobby(room);
      emit(room);
    });
    handle("start", () => {
      const { room, member } = session(socket);
      if (member.id !== room.hostId || current(room))
        throw new Error("방장만 게임을 시작할 수 있습니다.");
      if (
        room.members.length < 4 ||
        !room.members.every((m) => m.ready && m.connected)
      )
        throw new Error("4명 이상 입장하고 모두 준비해야 합니다.");
      let game = createGame({
        players: room.members.map((m) => ({ id: m.id, name: m.name })),
        settings: room.settings,
        seed: randomBytes(16).toString("hex"),
        now: now(),
        ...(room.forensicChoice ? { forensicId: room.forensicChoice } : {}),
      });
      // The lobby already owns seating; use that order for clockwise presentations.
      game.players.forEach((p) => {
        p.seat = room.members.findIndex((m) => m.id === p.id);
      });
      game.players.sort((a, b) => a.seat - b.seat);
      const fs = game.players.find(
        (p) => game.roles[p.id] === "forensic",
      )!.seat;
      game.presentationOrder = [...game.players]
        .sort(
          (a, b) =>
            ((a.seat - fs + game.players.length) % game.players.length) -
            ((b.seat - fs + game.players.length) % game.players.length),
        )
        .filter((p) => game.roles[p.id] !== "forensic")
        .map((p) => p.id);
      room.actor = makeActor(game);
      room.chat = [];
      room.updatedAt = now();
      emit(room);
    });
    handle("command", (payload) => {
      const { room, member } = session(socket);
      if (!room.actor || room.pausedAt !== null)
        throw new Error("게임이 없거나 일시정지 중입니다.");
      const parsed = commandSchema.omit({ actorId: true }).parse(payload);
      if (parsed.action.type === "advance")
        throw new Error("서버 전용 명령입니다.");
      room.actor.send({
        type: "COMMAND",
        command: { ...parsed, actorId: member.id },
        now: now(),
      });
      const snapshot = room.actor.getSnapshot().context;
      if (snapshot.error) throw new Error(snapshot.error);
      room.updatedAt = now();
      // Night commands only update entitled recipients. All clients get scheduled heartbeats.
      if (parsed.action.type === "crimeSelect") {
        for (const m of room.members)
          if (
            m.socketId &&
            ["forensic", "murderer", "accomplice"].includes(
              snapshot.game.roles[m.id],
            )
          )
            io.to(m.socketId).emit("state", view(room, m));
      } else if (
        parsed.action.type !== "confirmRole" ||
        snapshot.game.phase === "CRIME_NIGHT"
      )
        emit(room);
    });
    handle("chat", (payload) => {
      const value = z
        .object({
          text: z.string().trim().min(1).max(300),
          channel: z.enum(["public", "criminals"]).default("public"),
        })
        .strict()
        .parse(payload);
      const { room, member } = session(socket);
      rate(`chat:${member.id}`, 6, 5_000);
      const game = current(room);
      if (
        room.pausedAt !== null ||
        (game
          ? !canChat(game, member.id, value.channel)
          : value.channel !== "public")
      )
        throw new Error("지금은 이 채널에 발언할 수 없습니다.");
      room.chat.push({
        id: randomUUID(),
        playerId: member.id,
        name: member.name,
        text: value.text,
        at: now(),
        channel: value.channel,
      });
      room.chat = room.chat.slice(-200);
      room.updatedAt = now();
      if (value.channel === "public") emit(room);
      else
        for (const m of room.members)
          if (
            m.socketId &&
            ["murderer", "accomplice"].includes(game!.roles[m.id])
          )
            io.to(m.socketId).emit("state", view(room, m));
    });
    handle("kick", (payload) => {
      const { playerId } = z
        .object({ playerId: idSchema })
        .strict()
        .parse(payload);
      const { room, member } = session(socket);
      if (current(room) || member.id !== room.hostId || playerId === member.id)
        throw new Error("방장만 대기실에서 다른 사람을 추방할 수 있습니다.");
      const target = room.members.find((m) => m.id === playerId);
      if (!target) throw new Error("이미 나간 플레이어입니다.");
      if (target.socketId) {
        const targetSocket = io.sockets.sockets.get(target.socketId);
        targetSocket?.emit("kicked", {
          message: "방장이 대기실에서 내보냈습니다.",
        });
        if (targetSocket) {
          delete targetSocket.data.code;
          delete targetSocket.data.playerId;
        }
      }
      room.members = room.members.filter((m) => m.id !== playerId);
      normalizeLobby(room);
      emit(room);
    });
    handle("leave", () => {
      const { room, member } = session(socket);
      const game = current(room);
      if (game && game.phase !== "RESULT") {
        const next = departPlayer(
          game,
          member.id,
          room.pausedAt === null ? now() : game.now,
        );
        if (member.id === forensicId(next) && next.phase !== "RESULT")
          room.pausedAt ??= now();
        if (next.phase === "RESULT") room.pausedAt = null;
        sync(room, next);
      }
      room.members = room.members.filter((m) => m.id !== member.id);
      delete socket.data.code;
      delete socket.data.playerId;
      normalizeLobby(room);
      if (!room.members.length) {
        room.actor?.stop();
        rooms.delete(room.code);
      } else emit(room);
    });
    handle("rematch", () => {
      const { room, member } = session(socket);
      const game = current(room);
      if (member.id !== room.hostId || game?.phase !== "RESULT")
        throw new Error("방장만 결과 화면에서 대기실로 돌아갈 수 있습니다.");
      const oldForensic = forensicId(game);
      room.actor?.stop();
      room.actor = null;
      room.pausedAt = null;
      room.chat = [];
      normalizeLobby(room);
      room.forensicChoice =
        room.members[
          (Math.max(
            0,
            room.members.findIndex((m) => m.id === oldForensic),
          ) +
            1) %
            room.members.length
        ]?.id ?? null;
      emit(room);
    });
    handle("abort", () => {
      const { room, member } = session(socket);
      if (
        member.id !== room.hostId ||
        room.pausedAt === null ||
        now() < room.pausedAt + 60_000
      )
        throw new Error(
          "법의학자 연결이 끊긴 뒤 60초가 지나면 방장이 중단할 수 있습니다.",
        );
      room.actor?.stop();
      room.actor = null;
      room.pausedAt = null;
      room.chat = [];
      normalizeLobby(room);
      emit(room);
    });
    socket.on("disconnect", () => {
      const room = rooms.get(socket.data.code);
      const member = room?.members.find(
        (m) => m.id === socket.data.playerId && m.socketId === socket.id,
      );
      if (!room || !member) return;
      member.connected = false;
      member.socketId = null;
      member.disconnectedAt = now();
      const game = current(room);
      if (game && game.phase !== "RESULT") {
        const next = structuredClone(game);
        next.players.find((p) => p.id === member.id)!.connected = false;
        if (member.id === forensicId(game)) room.pausedAt ??= now();
        sync(room, next);
      }
      if (room.hostId === member.id)
        room.hostId = room.members.find((m) => m.connected)?.id ?? member.id;
      room.updatedAt = now();
      emit(room);
    });
  });
  let heartbeatAt = now();
  function schedule() {
    const time = now();
    const heartbeat = time - heartbeatAt >= 1_000;
    if (heartbeat) heartbeatAt = time;
    for (const room of rooms.values()) {
      if (
        !room.members.some((m) => m.connected) &&
        time - room.updatedAt > 30 * 60_000
      ) {
        room.actor?.stop();
        rooms.delete(room.code);
        continue;
      }
      let game = current(room);
      if (!game || room.pausedAt !== null) {
        if (heartbeat) emit(room);
        continue;
      }
      const before = game.version;
      // Preserve the disconnected presenter's allotted 15-second grace.
      const presenterPlayer =
        game.phase === "PRESENTATION"
          ? game.players.find(
              (p) => p.id === game!.presentationOrder[game!.presentationIndex],
            )
          : null;
      const presenter = presenterPlayer
        ? room.members.find((m) => m.id === presenterPlayer.id)
        : null;
      if (presenterPlayer?.departed) {
        const next = structuredClone(game);
        next.timer.deadline = time;
        sync(room, next);
      } else if (
        presenter &&
        !presenter.connected &&
        presenter.disconnectedAt !== null
      ) {
        if (time < presenter.disconnectedAt + 15_000) {
          const next = structuredClone(game);
          next.timer.deadline = presenter.disconnectedAt + 15_000;
          sync(room, next);
        } else {
          const next = structuredClone(game);
          next.timer.deadline = time;
          sync(room, next);
        }
      }
      room.actor!.send({ type: "TICK", now: time });
      game = current(room)!;
      if (game.version !== before || heartbeat) emit(room);
    }
    for (const [key, value] of limits)
      if (time - value.at > 60_000) limits.delete(key);
  }
  const interval =
    options.scheduler === false ? null : setInterval(schedule, 100);
  return {
    http,
    io,
    schedule,
    close: async () => {
      if (interval) clearInterval(interval);
      for (const room of rooms.values()) room.actor?.stop();
      await new Promise<void>((resolveClose) => io.close(() => resolveClose()));
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApp({ origin: process.env.WEB_ORIGIN });
  const port = Number(process.env.PORT ?? 3004);
  app.http.listen(port, "0.0.0.0", () =>
    console.log(`네온 사건파일 서버: http://localhost:${port}`),
  );
  process.on("SIGTERM", () => {
    void app.close();
  });
  process.on("SIGINT", () => {
    void app.close();
  });
}
