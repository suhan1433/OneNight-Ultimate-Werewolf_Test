import http from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { Server, type Socket } from "socket.io";
import { resolve } from "node:path";
import {
  createGame,
  reduce,
  expire,
  gameView,
  player,
  bestMove,
  skillCost,
  winningCells,
  threatLines,
} from "../shared/engine.js";
import { HERO } from "../shared/data.js";
import type { Game, Action } from "../shared/types.js";
interface Seat {
  id: string;
  name: string;
  token: string;
  socketId: string | null;
  connected: boolean;
  ready: boolean;
  bot: boolean;
  left?: boolean;
}
interface Room {
  code: string;
  host: string;
  seats: Seat[];
  game: Game | null;
  public: boolean;
  created: number;
  updated: number;
  botAt: number;
  tutorial: boolean;
  chat: { id: string; name: string; text: string; at: number }[];
}
const ACTIONS = new Set([
  "buy",
  "sell",
  "reroll",
  "xp",
  "ready",
  "place",
  "skill",
  "shield",
  "end",
  "augment",
  "augmentReroll",
  "altar",
  "surrender",
]);
const cleanName = (value: unknown) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 16)
    throw Error("닉네임은 1~16자로 입력하세요.");
  return value.trim();
};
export function createGameServer(
  options: { staticDir?: string; now?: () => number } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  const server = http.createServer(app);
  const origins = process.env.WEB_ORIGIN?.split(",").map((x) => x.trim());
  const io = new Server(server, {
    path: "/api/gomoku/socket",
    maxHttpBufferSize: 12000,
    cors: { origin: origins || false },
    transports: ["websocket", "polling"],
  });
  const rooms = new Map<string, Room>();
  const now = options.now || Date.now;
  app.get("/health", (_req, res) =>
    res.json({ ok: true, game: "gomoku", rooms: rooms.size }),
  );
  app.get("/api/gomoku/health", (_req, res) =>
    res.json({ ok: true, game: "gomoku" }),
  );
  if (options.staticDir) {
    app.use("/gomoku", express.static(resolve(options.staticDir)));
    app.get("/", (_req, res) => res.redirect("/gomoku/"));
  }
  function current(socket: Socket) {
    const r = rooms.get(socket.data.code);
    const p = r?.seats.find(
      (p) =>
        p.id === socket.data.playerId && !p.left && p.socketId === socket.id,
    );
    if (!r || !p) throw Error("대기실에 다시 접속하세요.");
    return { r, p };
  }
  function view(r: Room, p: Seat) {
    return {
      code: r.code,
      host: r.host,
      self: p.id,
      public: r.public,
      tutorial: r.tutorial,
      serverTime: now(),
      seats: r.seats
        .filter((s) => !s.left)
        .map(({ token: _, socketId: __, ...s }) => s),
      chat: r.chat,
      game: r.game ? gameView(r.game, p.id) : null,
    };
  }
  function send(r: Room) {
    for (const p of r.seats) {
      if (p.socketId && !p.left) io.to(p.socketId).emit("state", view(r, p));
    }
    r.updated = now();
  }
  function list() {
    return [...rooms.values()]
      .filter(
        (r) => r.public && !r.game && r.seats.filter((s) => !s.left).length < 2,
      )
      .map((r) => ({
        code: r.code,
        hostName: r.seats.find((p) => p.id === r.host)?.name || "대국자",
        count: r.seats.filter((s) => !s.left).length,
      }));
  }
  function bind(socket: Socket, r: Room, p: Seat) {
    if (p.socketId && p.socketId !== socket.id) {
      const old = io.sockets.sockets.get(p.socketId);
      if (old) {
        old.emit("replaced");
        old.disconnect(true);
      }
    }
    p.socketId = socket.id;
    p.connected = true;
    socket.data.code = r.code;
    socket.data.playerId = p.id;
    socket.join(r.code);
  }
  function seat(name: string, bot = false): Seat {
    return {
      id: randomUUID(),
      name,
      bot,
      token: randomBytes(32).toString("hex"),
      socketId: null,
      connected: true,
      ready: bot,
    };
  }
  function makeRoom(socket: Socket, data: any) {
    if (socket.data.code) throw Error("현재 방을 먼저 나가세요.");
    if (rooms.size >= 500)
      throw Error("서버가 혼잡합니다. 잠시 후 다시 시도하세요.");
    let code = "";
    do {
      code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
    } while (rooms.has(code));
    const p = seat(cleanName(data.name));
    const r: Room = {
      code,
      host: p.id,
      seats: [p],
      game: null,
      public: data.public === true,
      created: now(),
      updated: now(),
      botAt: 0,
      tutorial: data.tutorial === true,
      chat: [],
    };
    if (data.bot === true) r.seats.push(seat("달빛 사범", true));
    rooms.set(code, r);
    bind(socket, r, p);
    send(r);
    io.emit("rooms", list());
    return { code, token: p.token, playerId: p.id };
  }
  function start(r: Room) {
    if (r.game) throw Error("이미 진행 중인 대국입니다.");
    const seats = r.seats.filter((s) => !s.left);
    if (seats.length !== 2 || seats.some((p) => !p.connected || !p.ready))
      throw Error("두 대국자 모두 연결된 상태에서 준비해야 합니다.");
    r.game = createGame(
      seats.map((p) => ({ id: p.id, name: p.name })),
      randomBytes(4).readUInt32BE(),
      now(),
      { ruleset: "focused", prepSeconds: 25, turnSeconds: 45 },
    );
    r.botAt = now() + 1000;
  }
  function leave(socket: Socket) {
    const { r, p } = current(socket);
    if (r.game && r.game.phase !== "result")
      r.game = reduce(r.game, p.id, { type: "surrender" }, now());
    p.left = true;
    p.connected = false;
    p.socketId = null;
    socket.leave(r.code);
    delete socket.data.code;
    delete socket.data.playerId;
    const remaining = r.seats.filter((s) => !s.left && !s.bot);
    if (!remaining.length) rooms.delete(r.code);
    else {
      if (r.host === p.id) r.host = remaining[0].id;
      send(r);
    }
    io.emit("rooms", list());
  }
  function botAction(g: Game, id: string): Action | null {
    const p = player(g, id);
    if (g.phase === "prep") {
      const slot = p.shop.findIndex(
        (h) => h && HERO[h].cost <= p.gold && p.bench.length < 7,
      );
      if (slot >= 0 && p.bench.length < 3) return { type: "buy", slot };
      return p.ready ? null : { type: "ready" };
    }
    if (g.phase === "augment" && p.choices.length) {
      for (const id of p.choices) {
        try {
          reduce(g, p.id, { type: "augment", id }, now());
          return { type: "augment", id };
        } catch {}
      }
      return null;
    }
    if (g.phase === "altar" && g.altarOrder[g.altarStep] === id) {
      const slot = g.altar.findIndex((h) => h && p.bench.length < 9);
      return slot >= 0 ? { type: "altar", slot } : null;
    }
    if (g.phase !== "turn" || g.turn !== id) return null;
    if (g.ruleset === "focused" && p.skills === 0 && !winningCells(g, id).length) {
      const enemy = g.players.find(other => other.id !== id)!.id;
      const value = (state: Game) => {
        const strength = (who: string) => winningCells(state, who).length * 200 + threatLines(state, who).filter(l => l.open > 0).reduce((n,l) => n + l.size * l.size * l.open, 0);
        return strength(id) - strength(enemy);
      };
      let best: Action | null = null, bestValue = value(g) + 5;
      for (let source = 0; source < 169; source++) {
        const stone = g.board[source];
        if (!stone || stone.owner !== id || stone.cooldown || stone.sealedUntil > g.ply || !["push", "seal"].includes(HERO[stone.hero]?.op)) continue;
        for (let target = 0; target < 169; target++) {
          if (!g.board[target] || g.board[target]!.owner === id) continue;
          const destinations = HERO[stone.hero].op === "push" ? g.board.flatMap((s,c) => !s && Math.max(Math.abs(c % 13 - target % 13),Math.abs(Math.floor(c / 13)-Math.floor(target / 13))) === 1 ? [c] : []) : [undefined];
          for (const destination of destinations) {
            const action: Action = { type: "skill", source, target, destination };
            try {
              const candidate = reduce(g,id,action,now()), score = value(candidate);
              if (score > bestValue) { best = action; bestValue = score; }
            } catch {}
          }
        }
      }
      if (best) return best;
    }
    if (!p.placed) {
      const cell = bestMove(g, id);
      const guarded = g.board.some((s,c) => s?.owner === id && !s.shield && Math.max(Math.abs(c % 13 - cell % 13),Math.abs(Math.floor(c / 13)-Math.floor(cell / 13))) <= 1);
      const unit = g.ruleset === "focused" ? p.bench.find(u => u.hero === "guard" && guarded) || p.bench.find(u => HERO[u.hero].type === "active" && !g.board.some(s => s?.owner === id && s.hero === u.hero)) : p.bench[0];
      return cell >= 0 ? { type: "place", cell, uid: unit?.uid } : null;
    }
    if (g.ruleset === "focused") return { type: "end" };
    if (p.skills === 0) {
      for (let source = 0; source < 169; source++) {
        const s = g.board[source];
        if (
          !s ||
          s.owner !== id ||
          HERO[s.hero]?.type !== "active" ||
          s.cooldown ||
          p.mana < skillCost(g, p, s)
        )
          continue;
        const op = HERO[s.hero].op;
        if (["freeze", "stealMana", "shieldAll"].includes(op)) {
          const a: Action = { type: "skill", source };
          try {
            reduce(g, id, a, now());
            return a;
          } catch {}
        }
        if (["remove", "seal", "judge"].includes(op)) {
          for (let target = 0; target < 169; target++) {
            if (g.board[target]?.owner === id || !g.board[target]) continue;
            const a: Action = { type: "skill", source, target };
            try {
              reduce(g, id, a, now());
              return a;
            } catch {}
          }
        }
      }
    }
    return { type: "end" };
  }
  io.on("connection", (socket) => {
    let windowAt = now(),
      requests = 0,
      lastChat = 0;
    function on(event: string, fn: (data: any) => any) {
      socket.on(event, (data, ack) => {
        if (typeof ack !== "function") return;
        try {
          if (now() - windowAt > 10000) {
            requests = 0;
            windowAt = now();
          }
          if (++requests > 100)
            throw Error("요청이 너무 빠릅니다. 잠시 기다려 주세요.");
          if (!data || typeof data !== "object" || Array.isArray(data))
            throw Error("잘못된 요청입니다.");
          ack({ ok: true, ...fn(data) });
        } catch (e) {
          ack({
            ok: false,
            error:
              e instanceof Error ? e.message : "요청을 처리하지 못했습니다.",
          });
        }
      });
    }
    on("room:create", (data) => makeRoom(socket, data));
    on("room:join", (data) => {
      if (socket.data.code) throw Error("현재 방을 먼저 나가세요.");
      const code =
        typeof data.code === "string" ? data.code.trim().toUpperCase() : "";
      const r = rooms.get(code);
      if (!r) throw Error("방을 찾을 수 없습니다. 코드를 확인하세요.");
      if (r.game) throw Error("이미 대국이 시작된 방입니다.");
      if (r.seats.filter((s) => !s.left).length >= 2)
        throw Error("두 좌석이 모두 찼습니다.");
      const name = cleanName(data.name);
      if (r.seats.some((s) => !s.left && s.name === name))
        throw Error("상대와 다른 닉네임을 사용하세요.");
      const p = seat(name);
      r.seats.push(p);
      bind(socket, r, p);
      send(r);
      io.emit("rooms", list());
      return { code: r.code, token: p.token, playerId: p.id };
    });
    on("session:resume", (data) => {
      if (socket.data.code) throw Error("이미 연결된 좌석이 있습니다.");
      const r = rooms.get(data.code);
      const p = r?.seats.find(
        (s) =>
          !s.left &&
          !s.bot &&
          typeof data.token === "string" &&
          s.token === data.token,
      );
      if (!r || !p)
        throw Error("이전 좌석이 만료되었습니다. 새 대기실에 입장하세요.");
      bind(socket, r, p);
      send(r);
      return { code: r.code, token: p.token, playerId: p.id };
    });
    on("room:ready", () => {
      const { r, p } = current(socket);
      if (r.game) throw Error("대기실에서만 준비할 수 있습니다.");
      p.ready = !p.ready;
      send(r);
      return {};
    });
    on("room:bot", () => {
      const { r, p } = current(socket);
      if (r.host !== p.id || r.game)
        throw Error("대기실의 방장만 변경할 수 있습니다.");
      const bot = r.seats.find((s) => s.bot);
      if (bot) r.seats = r.seats.filter((s) => !s.bot);
      else {
        if (r.seats.filter((s) => !s.left).length >= 2)
          throw Error("빈 좌석이 없습니다.");
        r.seats.push(seat("달빛 사범", true));
      }
      send(r);
      io.emit("rooms", list());
      return {};
    });
    on("room:start", () => {
      const { r, p } = current(socket);
      if (r.host !== p.id) throw Error("방장만 대국을 시작할 수 있습니다.");
      start(r);
      send(r);
      io.emit("rooms", list());
      return {};
    });
    on("room:rematch", () => {
      const { r, p } = current(socket);
      if (r.host !== p.id || r.game?.phase !== "result")
        throw Error("결과 화면에서 방장만 대기실로 돌아갈 수 있습니다.");
      r.game = null;
      r.seats = r.seats.filter((s) => !s.left);
      r.seats.forEach((s) => (s.ready = s.bot));
      send(r);
      io.emit("rooms", list());
      return {};
    });
    on("room:leave", () => {
      leave(socket);
      return {};
    });
    on("rooms:list", () => ({ rooms: list() }));
    on("chat:send", (data) => {
      const { r, p } = current(socket);
      if (now() - lastChat < 800)
        throw Error("채팅은 잠시 간격을 두고 보내 주세요.");
      if (
        typeof data.text !== "string" ||
        !data.text.trim() ||
        data.text.length > 200
      )
        throw Error("메시지는 1~200자로 입력하세요.");
      lastChat = now();
      r.chat.push({
        id: randomUUID(),
        name: p.name,
        text: data.text.trim(),
        at: now(),
      });
      r.chat = r.chat.slice(-60);
      send(r);
      return {};
    });
    on("game:action", (data) => {
      const { r, p } = current(socket);
      if (!r.game) throw Error("대국이 시작되지 않았습니다.");
      if (!ACTIONS.has(data.type)) throw Error("알 수 없는 행동입니다.");
      const expired = expire(r.game, now());
      if (expired !== r.game) {
        r.game = expired;
        send(r);
      }
      r.game = reduce(r.game, p.id, data as Action, now());
      send(r);
      return {};
    });
    socket.on("disconnect", () => {
      const r = rooms.get(socket.data.code);
      const p = r?.seats.find((p) => p.id === socket.data.playerId);
      if (p && p.socketId === socket.id) {
        p.connected = false;
        p.socketId = null;
        send(r!);
      }
      io.emit("rooms", list());
    });
  });
  const timer = setInterval(() => {
    const time = now();
    for (const [code, r] of rooms) {
      if (
        !r.seats.some((s) => s.connected && !s.bot && !s.left) &&
        time - r.updated > 30 * 60 * 1000
      ) {
        rooms.delete(code);
        continue;
      }
      if (!r.game || r.game.phase === "result") continue;
      let changed = false;
      const expired = expire(r.game, time);
      if (expired !== r.game) {
        r.game = expired;
        changed = true;
      }
      if (time >= r.botAt) {
        const bot = r.seats.find((s) => s.bot);
        if (bot) {
          const action = botAction(r.game, bot.id);
          if (action) {
            try {
              r.game = reduce(r.game, bot.id, action, time);
              changed = true;
            } catch {}
          }
        }
        r.botAt = time + 750;
      }
      if (changed) send(r);
    }
  }, 250);
  timer.unref();
  async function close() {
    clearInterval(timer);
    await new Promise<void>((r) => io.close(() => r()));
    if (server.listening)
      await new Promise<void>((r) => server.close(() => r()));
  }
  return { app, server, io, rooms, close };
}
