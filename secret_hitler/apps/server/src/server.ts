import http from "node:http";
import {
  randomBytes,
  randomInt,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import express from "express";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import {
  botAction,
  canChat,
  createGame,
  gameView,
  transition,
} from "../../../packages/rules-engine/src/index.js";
import type {
  Action,
  ChatMessage,
  GameState,
  Member,
  RoomView,
} from "../../../packages/shared-types/src/index.js";

type StoredMember = Member & { tokenHash: string };
interface Room {
  code: string;
  version: number;
  hostId: string;
  members: StoredMember[];
  settings: RoomView["settings"];
  game: GameState | null;
  chat: ChatMessage[];
  paused: boolean;
  deadline: number | null;
  updated: number;
  created: number;
  processed: Record<string, number>;
}
const random = () => randomInt(0, 0x100000000) / 0x100000000;
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const codeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);
const profileSchema = z.object({
  name: z.string().trim().min(1).max(20),
  avatar: z.number().int().min(0).max(11),
});
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("acknowledge") }),
  z.object({ type: z.literal("nominate"), target: z.string().max(80) }),
  z.object({ type: z.literal("vote"), ja: z.boolean() }),
  z.object({
    type: z.literal("discard"),
    index: z.number().int().min(0).max(2),
  }),
  z.object({ type: z.literal("enact"), index: z.number().int().min(0).max(1) }),
  z.object({ type: z.literal("request_veto") }),
  z.object({ type: z.literal("answer_veto"), accept: z.boolean() }),
  z.object({ type: z.literal("power"), target: z.string().max(80).optional() }),
  z.object({ type: z.literal("confirm_power") }),
]);
export interface ServerOptions {
  dataDir?: string;
  botDelayMs?: number;
  allowedOrigins?: string[];
  maxRooms?: number;
}
export function createGameServer(options: ServerOptions = {}) {
  const app = express(),
    server = http.createServer(app);
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    next();
  });
  const origins =
    options.allowedOrigins ??
    (
      process.env.WEB_ORIGIN ?? "http://localhost:5179,http://127.0.0.1:5179"
    ).split(",");
  const io = new Server(server, {
    path: "/secret_hitler/socket.io",
    maxHttpBufferSize: 16000,
    cors: { origin: origins },
    allowRequest: (req, cb) => {
      const origin = req.headers.origin;
      let sameOrigin = false;
      try {
        sameOrigin = !!origin && new URL(origin).host === req.headers.host;
      } catch {}
      cb(null, !origin || origins.includes(origin) || sameOrigin);
    },
  });
  const rooms = new Map<string, Room>(),
    sessions = new Map<string, Socket>(),
    attempts = new Map<string, { count: number; until: number }>();
  const roomSchedules = new Map<string, number>();
  const dataDir = options.dataDir ?? resolve(process.cwd(), ".data");
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const file = (code: string) => join(dataDir, `${code}.jsonl`);
  // Append-only write-ahead records: each committed event carries a recovery snapshot.
  function persist(room: Room, command: string, actor: string | null) {
    const fd = openSync(file(room.code), "a", 0o600);
    try {
      appendFileSync(
        fd,
        JSON.stringify({ at: Date.now(), command, actor, state: room }) + "\n",
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
  for (const name of readdirSync(dataDir))
    if (/^[A-HJ-NP-Z2-9]{6}\.jsonl$/.test(name)) {
      const lines = readFileSync(join(dataDir, name), "utf8")
        .trimEnd()
        .split("\n");
      // Recover the last complete durable record if a final write was interrupted.
      for (let i = lines.length - 1; i >= 0; i--)
        try {
          const r = JSON.parse(lines[i]).state as Room;
          if (Date.now() - r.updated > 24 * 60 * 60 * 1000) {
            unlinkSync(join(dataDir, name));
            break;
          }
          if (i < lines.length - 1)
            writeFileSync(
              join(dataDir, name),
              lines.slice(0, i + 1).join("\n") + "\n",
              { mode: 0o600 },
            );
          r.members.forEach((p) => {
            if (!p.bot) p.connected = false;
          });
          r.paused = !!r.game && r.game.phase !== "finished";
          r.deadline = null;
          rooms.set(r.code, r);
          break;
        } catch {}
    }
  function paused(room: Room) {
    return (
      !!room.game &&
      room.game.phase !== "finished" &&
      room.members.some(
        (m) =>
          !m.bot &&
          !m.spectator &&
          !m.connected &&
          room.game!.players.some((p) => p.id === m.id && p.alive),
      )
    );
  }
  function view(r: Room, id: string): RoomView {
    return {
      code: r.code,
      version: r.version,
      selfId: id,
      hostId: r.hostId,
      members: r.members.map(({ tokenHash, ...m }) => ({ ...m })),
      settings: { ...r.settings },
      paused: r.paused,
      game: r.game ? gameView(r.game, id) : null,
      chat: structuredClone(r.chat),
      deadline: r.deadline,
    };
  }
  function broadcast(r: Room) {
    for (const p of r.members) {
      const s = sessions.get(p.id);
      if (s) s.emit("ROOM_STATE", view(r, p.id));
    }
  }
  function commit(room: Room, command: string, actor: string | null) {
    room.updated = Date.now();
    room.version++;
    room.paused = paused(room);
    if (
      room.paused ||
      !room.game ||
      room.game.phase === "finished" ||
      room.game.phase === "night" ||
      room.settings.timerSeconds === 0
    )
      room.deadline = null;
    else if (!room.deadline)
      room.deadline = Date.now() + room.settings.timerSeconds * 1000;
    persist(room, command, actor);
    rooms.set(room.code, room);
    broadcast(room);
  }
  function current(socket: Socket) {
    const r = rooms.get(socket.data.code),
      id = socket.data.id as string;
    if (
      !r ||
      !id ||
      sessions.get(id) !== socket ||
      !r.members.some((p) => p.id === id)
    )
      throw Error("유효한 방 세션이 아닙니다.");
    return { r, id };
  }
  function isHost(r: Room, id: string) {
    if (r.hostId !== id) throw Error("호스트만 실행할 수 있습니다.");
  }
  function limit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    let entry = attempts.get(key);
    if (!entry || entry.until <= now) {
      entry = { count: 0, until: now + windowMs };
      attempts.set(key, entry);
    }
    if (++entry.count > max)
      throw Error("요청이 너무 많습니다. 잠시 후 다시 시도하십시오.");
  }
  function bind(socket: Socket, code: string, id: string) {
    const old = sessions.get(id);
    sessions.set(id, socket);
    socket.data.code = code;
    socket.data.id = id;
    if (old && old.id !== socket.id) {
      old.emit("SESSION_REPLACED");
      old.disconnect(true);
    }
  }
  function unbound(socket: Socket) {
    if (socket.data.code) throw Error("현재 방에서 나간 뒤 시도하십시오.");
  }
  function step(r: Room, id: string, action: Action) {
    const old = r.game!;
    r.game = transition(old, id, action, random);
    if (old.phase !== r.game.phase || old.president !== r.game.president)
      r.deadline = null;
  }
  const connections = new Map<string, number>();
  io.use((socket, next) => {
    const ip = socket.handshake.address;
    const count = connections.get(ip) ?? 0;
    if (count >= 60) return next(Error("동시 연결 한도를 초과했습니다."));
    connections.set(ip, count + 1);
    next();
  });
  io.on("connection", (socket) => {
    const on = (name: string, handler: (data: any) => unknown) =>
      socket.on(name, (data: unknown, ack?: Function) => {
        try {
          limit(`socket:${socket.id}`, 100, 10000);
          const result = handler(data);
          if (typeof ack === "function") ack({ ok: true, data: result });
        } catch (e) {
          const message =
            e instanceof z.ZodError
              ? "입력 형식이 올바르지 않습니다."
              : e instanceof Error
                ? e.message
                : "요청을 처리하지 못했습니다.";
          if (typeof ack === "function") ack({ ok: false, error: message });
        }
      });
    on("CREATE_ROOM", (data) => {
      unbound(socket);
      limit(`create:${socket.handshake.address}`, 8, 60000);
      if (rooms.size >= (options.maxRooms ?? 300))
        throw Error("방이 가득 찼습니다.");
      const { language, ...profile } = profileSchema
        .extend({ language: z.enum(["ko", "en"]).default("ko") })
        .parse(data);
      let code: string;
      do {
        code = Array.from(
          { length: 6 },
          () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt(32)],
        ).join("");
      } while (rooms.has(code) || existsSync(file(code)));
      const id = randomUUID(),
        token = randomBytes(32).toString("base64url");
      const r: Room = {
        code,
        version: 0,
        hostId: id,
        members: [
          {
            ...profile,
            id,
            tokenHash: hash(token),
            ready: false,
            connected: true,
            bot: false,
            spectator: false,
          },
        ],
        settings: { maxPlayers: 10, timerSeconds: 0, language },
        game: null,
        chat: [],
        paused: false,
        deadline: null,
        updated: Date.now(),
        created: Date.now(),
        processed: {},
      };
      persist(r, "create", id);
      rooms.set(code, r);
      bind(socket, code, id);
      broadcast(r);
      return { code, id, token };
    });
    on("JOIN_ROOM", (data) => {
      unbound(socket);
      limit(`join:${socket.handshake.address}`, 20, 60000);
      const d = profileSchema
          .extend({ code: codeSchema, spectator: z.boolean().default(false) })
          .parse(data),
        source = rooms.get(d.code);
      if (!source) throw Error("방을 찾을 수 없습니다.");
      const r = structuredClone(source);
      if (r.game && !d.spectator)
        throw Error("진행 중인 방은 관전으로 입장하십시오.");
      if (
        !d.spectator &&
        r.members.filter((p) => !p.spectator).length >= r.settings.maxPlayers
      )
        throw Error("방이 가득 찼습니다.");
      if (r.members.length >= 30) throw Error("관전 인원 한도를 초과했습니다.");
      const id = randomUUID(),
        token = randomBytes(32).toString("base64url");
      r.members.push({
        id,
        name: d.name,
        avatar: d.avatar,
        tokenHash: hash(token),
        ready: false,
        connected: true,
        bot: false,
        spectator: d.spectator,
      });
      commit(r, "join", id);
      bind(socket, r.code, id);
      broadcast(r);
      return { code: r.code, id, token };
    });
    on("RESUME", (data) => {
      limit(`resume:${socket.handshake.address}`, 30, 60000);
      const d = z
        .object({
          code: codeSchema,
          id: z.string().uuid(),
          token: z.string().min(32).max(100),
        })
        .parse(data);
      if (
        socket.data.code &&
        (socket.data.code !== d.code || socket.data.id !== d.id)
      )
        throw Error("현재 방에서 나간 뒤 시도하십시오.");
      const source = rooms.get(d.code),
        p = source?.members.find((p) => p.id === d.id),
        candidate = hash(d.token);
      if (
        !source ||
        !p ||
        !timingSafeEqual(Buffer.from(p.tokenHash), Buffer.from(candidate))
      )
        throw Error("재접속 정보를 확인할 수 없습니다.");
      if (p.bot)
        throw Error("봇으로 대체된 자리입니다. 관전으로 입장하십시오.");
      const r = structuredClone(source);
      r.members.find((p) => p.id === d.id)!.connected = true;
      if (
        !r.members.some((p) => p.id === r.hostId && p.connected && !p.bot) &&
        !r.members.find((p) => p.id === d.id)!.spectator
      )
        r.hostId = d.id;
      commit(r, "resume", d.id);
      bind(socket, r.code, d.id);
      broadcast(r);
      return { code: d.code, id: d.id, token: d.token };
    });
    on("READY", (data) => {
      const { r: source, id } = current(socket),
        r = structuredClone(source);
      if (r.game) throw Error("대기실에서만 가능합니다.");
      const p = r.members.find((p) => p.id === id)!;
      if (p.spectator) throw Error("관전자는 준비할 수 없습니다.");
      p.ready = z.object({ ready: z.boolean() }).parse(data).ready;
      commit(r, "ready", id);
      return null;
    });
    on("SETTINGS", (data) => {
      const { r: source, id } = current(socket);
      isHost(source, id);
      if (source.game) throw Error("대기실에서만 가능합니다.");
      const settings = z
        .object({
          maxPlayers: z.number().int().min(5).max(10),
          timerSeconds: z.union([
            z.literal(0),
            z.literal(30),
            z.literal(60),
            z.literal(120),
          ]),
          language: z.enum(["ko", "en"]),
        })
        .parse(data);
      if (
        source.members.filter((p) => !p.spectator).length > settings.maxPlayers
      )
        throw Error("참가자보다 적게 설정할 수 없습니다.");
      const r = structuredClone(source);
      r.settings = settings;
      r.members.forEach((p) => {
        if (!p.bot) p.ready = false;
      });
      commit(r, "settings", id);
      return null;
    });
    on("ADD_BOT", () => {
      const { r: source, id } = current(socket);
      isHost(source, id);
      if (source.game) throw Error("대기실에서만 가능합니다.");
      if (
        source.members.filter((p) => !p.spectator).length >=
        source.settings.maxPlayers
      )
        throw Error("방이 가득 찼습니다.");
      const r = structuredClone(source),
        bots = r.members.filter((p) => p.bot).length;
      r.members.push({
        id: randomUUID(),
        name: `훈련 의원 ${bots + 1}`,
        avatar: (bots + 3) % 12,
        ready: true,
        connected: true,
        bot: true,
        spectator: false,
        tokenHash: "",
      });
      commit(r, "add_bot", id);
      return null;
    });
    on("KICK", (data) => {
      const { r: source, id } = current(socket);
      isHost(source, id);
      if (source.game) throw Error("게임 중에는 강퇴할 수 없습니다.");
      const target = z.object({ id: z.string().uuid() }).parse(data).id;
      if (target === id) throw Error("호스트는 자신을 강퇴할 수 없습니다.");
      const r = structuredClone(source);
      r.members = r.members.filter((p) => p.id !== target);
      commit(r, "kick", id);
      const s = sessions.get(target);
      sessions.delete(target);
      if (s) {
        delete s.data.code;
        delete s.data.id;
        s.emit("REMOVED");
      }
      return null;
    });
    on("START", () => {
      const { r: source, id } = current(socket);
      isHost(source, id);
      if (source.game) throw Error("이미 시작되었습니다.");
      const players = source.members.filter((p) => !p.spectator);
      if (players.some((p) => !p.ready || !p.connected))
        throw Error("전원 연결 및 준비 완료가 필요합니다.");
      const r = structuredClone(source);
      r.game = createGame(players, random);
      r.chat = [];
      commit(r, "start", id);
      return null;
    });
    on("ACTION", (data) => {
      const { r: source, id } = current(socket);
      const d = z
        .object({
          version: z.number().int().min(0),
          requestId: z.string().uuid(),
          action: actionSchema,
        })
        .parse(data);
      const key = `${id}:${d.requestId}`;
      if (source.processed[key]) return null;
      if (!source.game || source.paused)
        throw Error("현재 게임을 진행할 수 없습니다.");
      const simultaneous =
        d.action.type === "vote" || d.action.type === "acknowledge";
      if (
        d.version > source.game.version ||
        d.version <
          (simultaneous ? source.game.phaseVersion : source.game.version)
      )
        throw Error("상태가 갱신되었습니다. 현재 화면에서 다시 선택하십시오.");
      const r = structuredClone(source);
      step(r, id, d.action);
      r.processed[key] = Date.now();
      if (Object.keys(r.processed).length > 2000)
        r.processed = Object.fromEntries(
          Object.entries(r.processed).slice(-1000),
        );
      commit(r, "action", id);
      return null;
    });
    on("CHAT", (data) => {
      const { r: source, id } = current(socket);
      limit(`chat:${id}`, 6, 10000);
      const { text } = z
        .object({ text: z.string().trim().min(1).max(500) })
        .parse(data);
      if (source.game && !canChat(source.game, id))
        throw Error("현재 발언할 수 없습니다.");
      const r = structuredClone(source),
        p = r.members.find((p) => p.id === id)!;
      r.chat.push({
        id: randomUUID(),
        playerId: id,
        name: p.name,
        text,
        time: Date.now(),
      });
      r.chat = r.chat.slice(-100);
      commit(r, "chat", id);
      return null;
    });
    on("HOST_DECISION", (data) => {
      const { r: source, id } = current(socket);
      isHost(source, id);
      if (!source.game || source.game.phase === "finished")
        throw Error("진행 중인 게임이 없습니다.");
      const d = z
          .object({ decision: z.enum(["wait", "replace", "end"]) })
          .parse(data),
        r = structuredClone(source);
      if (d.decision === "replace") {
        if (!r.paused) throw Error("연결이 끊긴 참가자가 없습니다.");
        r.members
          .filter((p) => !p.connected && !p.spectator)
          .forEach((p) => {
            p.bot = true;
            p.connected = true;
            p.tokenHash = "";
          });
      } else if (d.decision === "end") {
        r.game!.phase = "finished";
        r.game!.winReason = "호스트가 게임을 종료했습니다.";
        r.game!.winner = null;
      }
      commit(r, `host_${d.decision}`, id);
      return null;
    });
    on("REMATCH", () => {
      const { r: source, id } = current(socket);
      isHost(source, id);
      if (source.game?.phase !== "finished")
        throw Error("결과 화면에서만 가능합니다.");
      const r = structuredClone(source);
      r.game = null;
      r.deadline = null;
      r.chat = [];
      r.processed = {};
      r.members.forEach((p) => (p.ready = p.bot));
      commit(r, "rematch", id);
      return null;
    });
    on("LEAVE", () => {
      const { r: source, id } = current(socket),
        r = structuredClone(source);
      if (
        !r.game ||
        r.game.phase === "finished" ||
        r.members.find((p) => p.id === id)?.spectator
      )
        r.members = r.members.filter((p) => p.id !== id);
      else r.members.find((p) => p.id === id)!.connected = false;
      if (r.hostId === id)
        r.hostId =
          r.members.find(
            (p) => p.id !== id && !p.bot && p.connected && !p.spectator,
          )?.id ?? r.hostId;
      commit(r, "leave", id);
      sessions.delete(id);
      delete socket.data.code;
      delete socket.data.id;
      return null;
    });
    socket.on("disconnect", () => {
      const ip = socket.handshake.address,
        count = (connections.get(ip) ?? 1) - 1;
      if (count > 0) connections.set(ip, count);
      else connections.delete(ip);
      const id = socket.data.id as string;
      if (!id || sessions.get(id) !== socket) return;
      sessions.delete(id);
      const source = rooms.get(socket.data.code);
      if (!source) return;
      const r = structuredClone(source),
        p = r.members.find((p) => p.id === id);
      if (!p) return;
      p.connected = false;
      // A connected participant can resolve pauses when the original host disconnects.
      if (r.hostId === id)
        r.hostId =
          r.members.find(
            (p) => p.id !== id && !p.bot && p.connected && !p.spectator,
          )?.id ?? id;
      try {
        commit(r, "disconnect", id);
      } catch (e) {
        console.error("Could not persist disconnect", e);
      }
    });
  });
  let ticking = false;
  const ticker = setInterval(
    () => {
      if (ticking) return;
      ticking = true;
      try {
        const now = Date.now();
        for (const [key, v] of attempts)
          if (v.until < now) attempts.delete(key);
        for (const source of rooms.values()) {
          const ttl =
            source.game && source.game.phase !== "finished"
              ? 86400000
              : 3600000;
          if (now - source.updated > ttl) {
            rooms.delete(source.code);
            roomSchedules.delete(source.code);
            for (const p of source.members) {
              const s = sessions.get(p.id);
              if (s) {
                s.emit("REMOVED");
                delete s.data.id;
                delete s.data.code;
                sessions.delete(p.id);
              }
            }
            if (existsSync(file(source.code))) unlinkSync(file(source.code));
            continue;
          }
          if (!source.game || source.paused || source.game.phase === "finished")
            continue;
          if (now < (roomSchedules.get(source.code) ?? 0)) continue;
          let selected: { id: string; action: Action } | null = null;
          for (const p of source.members.filter((p) => p.bot)) {
            const action = botAction(gameView(source.game, p.id), p.id);
            if (action) {
              selected = { id: p.id, action };
              break;
            }
          }
          if (!selected && source.deadline && source.deadline <= now) {
            for (const p of source.members.filter((p) => !p.spectator)) {
              const action = botAction(gameView(source.game, p.id), p.id);
              if (action) {
                if (action.type === "vote") action.ja = false;
                selected = { id: p.id, action };
                break;
              }
            }
          }
          if (selected) {
            const r = structuredClone(source);
            step(r, selected.id, selected.action);
            commit(r, "automatic_action", selected.id);
            roomSchedules.set(r.code, now + (options.botDelayMs ?? 900));
          }
        }
      } catch (e) {
        console.error("Game scheduler failed", e);
      } finally {
        ticking = false;
      }
    },
    Math.min(options.botDelayMs ?? 250, 250),
  );
  ticker.unref();
  app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));
  const clientDist = fileURLToPath(
    new URL("../../client/dist", import.meta.url),
  );
  if (existsSync(clientDist)) {
    app.use(
      "/secret_hitler",
      express.static(clientDist, { index: "index.html" }),
    );
    app.get("/", (_req, res) => res.redirect("/secret_hitler/"));
    app.get("/secret_hitler/*", (_req, res) =>
      res.sendFile(join(clientDist, "index.html")),
    );
  }
  return {
    app,
    server,
    io,
    close: async () => {
      clearInterval(ticker);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
