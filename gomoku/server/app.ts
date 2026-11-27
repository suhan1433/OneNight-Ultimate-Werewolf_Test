import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { Server, type Socket } from "socket.io";
import { resolve } from "node:path";
import { createGame, reduce, bestMove } from "../shared/engine.js";
import type { Game, Action } from "../shared/types.js";
interface Seat {
  id: string;
  name: string;
  token: string;
  socketId: string | null;
  connected: boolean;
  bot: boolean;
  rematch: boolean;
}
interface Room {
  code: string;
  seats: Seat[];
  game: Game | null;
  updated: number;
  botAt: number;
}
export function createGameServer(
  options: { staticDir?: string; now?: () => number } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  const server = http.createServer(app);
  const io = new Server(server, {
    path: "/api/gomoku/socket",
    maxHttpBufferSize: 12000,
    cors: {
      origin: process.env.WEB_ORIGIN?.split(",").map((x) => x.trim()) || false,
    },
  });
  const rooms = new Map<string, Room>(),
    now = options.now || Date.now;
  for (const path of ["/health", "/api/gomoku/health"])
    app.get(path, (_req, res) => res.json({ ok: true, game: "gomoku" }));
  if (options.staticDir) {
    app.use("/gomoku", express.static(resolve(options.staticDir)));
    app.get("/", (_req, res) => res.redirect("/gomoku/"));
  }
  function current(socket: Socket) {
    const r = rooms.get(socket.data.code),
      p = r?.seats.find(
        (p) => p.id === socket.data.playerId && p.socketId === socket.id,
      );
    if (!r || !p) throw Error("방에 다시 접속하세요.");
    return { r, p };
  }
  function send(r: Room) {
    for (const p of r.seats)
      if (p.socketId)
        io.to(p.socketId).emit("state", {
          code: r.code,
          self: p.id,
          game: r.game,
          seats: r.seats.map(({ token: _, socketId: __, ...s }) => s),
        });
  }
  function bind(socket: Socket, r: Room, p: Seat) {
    if (p.socketId && p.socketId !== socket.id) {
      const old = io.sockets.sockets.get(p.socketId);
      old?.emit("replaced");
      old?.disconnect(true);
    }
    p.socketId = socket.id;
    p.connected = true;
    socket.data.code = r.code;
    socket.data.playerId = p.id;
    r.updated = now();
  }
  function seat(value: unknown, bot = false): Seat {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 16)
      throw Error("이름은 1~16자로 입력하세요.");
    return {
      id: randomUUID(),
      name: value.trim(),
      token: randomBytes(32).toString("hex"),
      socketId: null,
      connected: true,
      bot,
      rematch: bot,
    };
  }
  function start(r: Room, rematch = false) {
    const players = rematch ? [...r.game!.players].reverse() : r.seats;
    r.game = createGame(players.map((p) => ({ id: p.id, name: p.name })));
    r.seats.forEach((p) => (p.rematch = p.bot));
    r.botAt = now() + 500;
  }
  const credentials = (r: Room, p: Seat) => ({
    code: r.code,
    token: p.token,
    playerId: p.id,
  });
  io.on("connection", (socket) => {
    let windowAt = now(),
      requests = 0;
    function on(event: string, fn: (data: any) => object) {
      socket.on(event, (data, ack) => {
        if (typeof ack !== "function") return;
        try {
          if (now() - windowAt > 10000) {
            windowAt = now();
            requests = 0;
          }
          if (++requests > 100)
            throw Error("요청이 너무 빠릅니다. 잠시 기다려 주세요.");
          if (!data || typeof data !== "object" || Array.isArray(data))
            throw Error("잘못된 요청입니다.");
          ack({ ok: true, ...fn(data) });
        } catch (error) {
          ack({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "요청을 처리하지 못했습니다.",
          });
        }
      });
    }
    on("room:create", (data) => {
      if (socket.data.code) throw Error("현재 방을 먼저 나가세요.");
      if (rooms.size >= 500)
        throw Error("서버가 혼잡합니다. 잠시 후 다시 시도하세요.");
      const p = seat(data.name);
      let code: string;
      do {
        code = randomBytes(3).toString("hex").toUpperCase();
      } while (rooms.has(code));
      const r: Room = {
        code,
        seats: [p],
        game: null,
        updated: now(),
        botAt: 0,
      };
      if (data.bot === true) {
        r.seats.push(seat("AI", true));
        start(r);
      }
      rooms.set(code, r);
      bind(socket, r, p);
      send(r);
      return credentials(r, p);
    });
    on("room:join", (data) => {
      if (socket.data.code) throw Error("현재 방을 먼저 나가세요.");
      const code =
          typeof data.code === "string" ? data.code.trim().toUpperCase() : "",
        r = rooms.get(code);
      if (!r) throw Error("방 코드를 확인하세요.");
      if (r.game || r.seats.length >= 2)
        throw Error("이미 대국이 시작된 방입니다.");
      const p = seat(data.name);
      r.seats.push(p);
      bind(socket, r, p);
      start(r);
      send(r);
      return credentials(r, p);
    });
    on("session:resume", (data) => {
      if (socket.data.code) throw Error("이미 연결된 좌석이 있습니다.");
      const r = rooms.get(data.code),
        p = r?.seats.find(
          (p) =>
            !p.bot && typeof data.token === "string" && p.token === data.token,
        );
      if (!r || !p) throw Error("이전 대국이 만료되었습니다.");
      bind(socket, r, p);
      if (
        r.game?.phase === "result" &&
        r.seats.length === 2 &&
        r.seats.every((s) => s.rematch && s.connected)
      )
        start(r, true);
      send(r);
      return credentials(r, p);
    });
    on("game:action", (data) => {
      const { r, p } = current(socket);
      if (!r.game) throw Error("상대가 입장하면 대국이 시작됩니다.");
      if (data.type !== "place" && data.type !== "surrender")
        throw Error("알 수 없는 행동입니다.");
      r.game = reduce(r.game, p.id, data as Action);
      r.updated = now();
      r.botAt = now() + 500;
      send(r);
      return {};
    });
    on("room:rematch", () => {
      const { r, p } = current(socket);
      if (r.game?.phase !== "result" || r.seats.length !== 2)
        throw Error("두 대국자가 있는 결과 화면에서 다시 시작하세요.");
      p.rematch = true;
      if (r.seats.every((s) => s.rematch && s.connected)) start(r, true);
      r.updated = now();
      send(r);
      return {};
    });
    on("room:leave", () => {
      const { r, p } = current(socket);
      if (r.game?.phase === "turn")
        r.game = reduce(r.game, p.id, { type: "surrender" });
      r.seats = r.seats.filter((s) => s.id !== p.id);
      delete socket.data.code;
      delete socket.data.playerId;
      r.updated = now();
      if (!r.seats.some((s) => !s.bot)) rooms.delete(r.code);
      else send(r);
      return {};
    });
    socket.on("disconnect", () => {
      const r = rooms.get(socket.data.code),
        p = r?.seats.find((p) => p.socketId === socket.id);
      if (r && p) {
        p.connected = false;
        p.socketId = null;
        r.updated = now();
        send(r);
      }
    });
  });
  const timer = setInterval(() => {
    for (const [code, r] of rooms) {
      if (
        !r.seats.some((p) => p.connected && !p.bot) &&
        now() - r.updated > 30 * 60000
      ) {
        rooms.delete(code);
        continue;
      }
      const bot = r.seats.find((p) => p.bot);
      if (
        bot &&
        r.game?.phase === "turn" &&
        r.game.turn === bot.id &&
        now() >= r.botAt &&
        r.seats.some((p) => !p.bot && p.connected)
      ) {
        r.game = reduce(r.game, bot.id, {
          type: "place",
          cell: bestMove(r.game, bot.id),
        });
        r.updated = now();
        send(r);
      }
    }
  }, 100);
  timer.unref();
  async function close() {
    clearInterval(timer);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (server.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return { app, server, io, rooms, close };
}
