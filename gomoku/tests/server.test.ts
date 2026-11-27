import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { createGameServer } from "../server/app.js";
const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
test("2인 즉시 시작·착수 동기화·권한·세션 복구·양쪽 재대국 동의·퇴장", async () => {
  const service = createGameServer();
  const sockets: Socket[] = [];
  await new Promise<void>((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  const port = (service.server.address() as any).port;
  async function connect() {
    const s = io(`http://127.0.0.1:${port}`, {
      path: "/api/gomoku/socket",
      transports: ["websocket"],
      forceNew: true,
    });
    sockets.push(s);
    await new Promise<void>((resolve) => s.once("connect", () => resolve()));
    return s;
  }
  const ask = (s: Socket, event: string, data: object = {}) =>
    s.timeout(2000).emitWithAck(event, data);
  try {
    const a = await connect(),
      b = await connect(),
      stranger = await connect();
    let av: any, bv: any;
    a.on("state", (v) => (av = v));
    b.on("state", (v) => (bv = v));
    const room = await ask(a, "room:create", { name: "흑" });
    assert.equal(room.ok, true);
    assert.equal(av.game, null);
    assert.equal(JSON.stringify(av).includes(room.token), false);
    assert.equal(
      (
        await ask(stranger, "session:resume", {
          code: room.code,
          token: "wrong",
        })
      ).ok,
      false,
    );
    const joined = await ask(b, "room:join", {
      name: "백",
      code: room.code.toLowerCase(),
    });
    assert.equal(joined.ok, true);
    await wait();
    assert.equal(av.game.phase, "turn");
    assert.equal(av.game.turn, room.playerId);
    assert.equal(
      (await ask(stranger, "room:join", { name: "제삼자", code: room.code }))
        .ok,
      false,
    );
    assert.equal(
      (await ask(b, "game:action", { type: "place", cell: 112 })).ok,
      false,
    );
    assert.equal(
      (await ask(a, "game:action", { type: "buy", slot: 0 })).ok,
      false,
    );
    assert.equal(
      (await ask(a, "game:action", { type: "place", cell: 112 })).ok,
      true,
    );
    await wait();
    assert.deepEqual(av.game, bv.game);
    assert.equal(bv.game.turn, joined.playerId);
    assert.equal(
      (await ask(a, "game:action", { type: "place", cell: 113 })).ok,
      false,
    );
    assert.equal(
      (await ask(b, "game:action", { type: "place", cell: 112 })).ok,
      false,
    );
    b.disconnect();
    await wait();
    assert.equal(av.seats[1].connected, false);
    const c = await connect();
    let cv: any;
    c.on("state", (v) => (cv = v));
    assert.equal((await ask(c, "session:resume", joined)).ok, true);
    await wait();
    assert.equal(cv.game.board[112], room.playerId);
    assert.equal(cv.self, joined.playerId);
    await ask(c, "game:action", { type: "surrender" });
    await wait();
    assert.equal(av.game.winner, room.playerId);
    await ask(a, "room:rematch");
    assert.equal(av.game.phase, "result");
    await ask(c, "room:rematch");
    await wait();
    assert.equal(av.game.phase, "turn");
    assert.equal(av.game.turn, joined.playerId);
    assert.equal(av.game.ply, 0);
    await ask(a, "game:action", { type: "surrender" });
    await ask(c, "room:rematch");
    c.disconnect();
    await wait();
    await ask(a, "room:rematch");
    assert.equal(av.game.phase, "result");
    const d = await connect();
    assert.equal((await ask(d, "session:resume", joined)).ok, true);
    await wait();
    assert.equal(av.game.phase, "turn");
    assert.equal(av.game.turn, room.playerId);
    await ask(d, "room:leave");
    await wait();
    assert.equal(av.game.reason, "기권");
    assert.equal((await ask(a, "room:rematch")).ok, false);
    await ask(a, "room:leave");
    assert.equal(service.rooms.size, 0);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await service.close();
  }
});
test("AI 즉시 시작·자동 응수·준비 없이 재대국", async () => {
  const service = createGameServer();
  await new Promise<void>((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  const s = io(`http://127.0.0.1:${(service.server.address() as any).port}`, {
    path: "/api/gomoku/socket",
    transports: ["polling"],
    upgrade: false,
  });
  try {
    await new Promise<void>((resolve) => s.once("connect", () => resolve()));
    const ask = (event: string, data = {}) =>
      s.timeout(2000).emitWithAck(event, data);
    const room = await ask("room:create", { name: "나", bot: true });
    assert.equal(service.rooms.get(room.code)!.game!.phase, "turn");
    await ask("game:action", { type: "place", cell: 112 });
    await wait(800);
    assert.equal(service.rooms.get(room.code)!.game!.ply, 2);
    await ask("game:action", { type: "surrender" });
    await ask("room:rematch");
    await wait(800);
    assert.equal(service.rooms.get(room.code)!.game!.ply, 1);
    assert.equal(service.rooms.get(room.code)!.game!.turn, room.playerId);
  } finally {
    s.disconnect();
    await service.close();
  }
});
