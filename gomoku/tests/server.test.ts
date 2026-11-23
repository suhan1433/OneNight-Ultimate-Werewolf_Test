import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { createGameServer } from "../server/app.js";
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
test("실제 2인 Socket.IO 대국: 방 권한·정보 은닉·착수 동기화·재접속·재대국", async () => {
  const service = createGameServer();
  await new Promise<void>((r) => service.server.listen(0, "127.0.0.1", r));
  const port = (service.server.address() as any).port;
  const sockets: Socket[] = [];
  async function connect() {
    const s = io(`http://127.0.0.1:${port}`, {
      path: "/api/gomoku/socket",
      transports: ["websocket"],
      forceNew: true,
    });
    sockets.push(s);
    await new Promise<void>((r) => s.on("connect", () => r()));
    return s;
  }
  const ask = (s: Socket, e: string, d: object = {}) =>
    s.timeout(3000).emitWithAck(e, d);
  try {
    const a = await connect(),
      b = await connect(),
      intruder = await connect();
    let av: any, bv: any;
    a.on("state", (v) => (av = v));
    b.on("state", (v) => (bv = v));
    const create = await ask(a, "room:create", { name: "주인", public: true });
    assert.equal(create.ok, true);
    assert.match(create.code, /^[0-9A-F]{6}$/);
    assert.ok(create.token);
    assert.equal(
      (
        await ask(intruder, "session:resume", {
          code: create.code,
          token: "nope",
        })
      ).ok,
      false,
    );
    const join = await ask(b, "room:join", { name: "손님", code: create.code });
    assert.equal(join.ok, true);
    await wait();
    assert.equal(bv.seats.length, 2);
    assert.equal(JSON.stringify(bv).includes(create.token), false);
    assert.equal(
      (await ask(intruder, "room:join", { name: "침입자", code: create.code }))
        .ok,
      false,
    );
    assert.equal((await ask(b, "room:start")).ok, false);
    assert.equal((await ask(a, "room:start")).ok, false);
    await ask(a, "room:ready");
    await ask(b, "room:ready");
    assert.equal((await ask(a, "room:start")).ok, true);
    await wait();
    assert.equal(av.game.phase, "prep");
    assert.equal(bv.game.phase, "prep");
    for (const [v, id] of [
      [av, create.playerId],
      [bv, join.playerId],
    ]) {
      const mine = v.game.players.find((p: any) => p.id === id),
        enemy = v.game.players.find((p: any) => p.id !== id);
      assert.equal(mine.shop.length, 5);
      assert.equal("shop" in enemy, false);
      assert.equal("bench" in enemy, false);
      assert.equal("choices" in enemy, false);
      assert.equal("pool" in v.game, false);
      assert.equal("seed" in v.game, false);
    }
    assert.equal((await ask(b, "game:action", { type: "UNKNOWN" })).ok, false);
    await ask(a, "game:action", { type: "ready" });
    await ask(b, "game:action", { type: "ready" });
    await wait();
    const first = av.game.turn === create.playerId ? a : b,
      second = first === a ? b : a;
    assert.equal(
      (await ask(second, "game:action", { type: "place", cell: 84 })).ok,
      false,
    );
    assert.equal(
      (await ask(first, "game:action", { type: "place", cell: 84 })).ok,
      true,
    );
    await wait();
    assert.deepEqual(av.game.board, bv.game.board);
    assert.ok(av.game.board[84]);
    assert.equal(
      (await ask(first, "game:action", { type: "place", cell: 85 })).ok,
      false,
    );
    assert.equal((await ask(first, "game:action", { type: "end" })).ok, true);
    await ask(a, "chat:send", { text: "안녕하세요 <script>text</script>" });
    await wait();
    assert.equal(bv.chat.at(-1).text, "안녕하세요 <script>text</script>");
    b.disconnect();
    await wait();
    assert.equal(
      av.seats.find((s: any) => s.id === join.playerId).connected,
      false,
    );
    const c = await connect();
    let cv: any;
    c.on("state", (v) => (cv = v));
    assert.equal((await ask(c, "session:resume", join)).ok, true);
    await wait();
    assert.equal(cv.self, join.playerId);
    assert.ok(cv.game.board[84]);
    assert.equal(
      cv.game.players.find((p: any) => p.id === join.playerId).shop.length,
      5,
    );
    assert.equal((await ask(c, "game:action", { type: "surrender" })).ok, true);
    await wait();
    assert.equal(cv.game.phase, "result");
    assert.equal(av.game.winner, create.playerId);
    assert.equal((await ask(c, "room:rematch")).ok, false);
    assert.equal((await ask(a, "room:rematch")).ok, true);
    await wait();
    assert.equal(av.game, null);
    assert.equal(cv.game, null);
    assert.equal((await ask(a, "room:leave")).ok, true);
    await wait();
    assert.equal(cv.host, join.playerId);
    assert.equal(cv.seats.length, 1);
    assert.equal((await ask(c, "room:bot")).ok, true);
    await wait();
    assert.equal(cv.seats[1].bot, true);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await service.close();
  }
});
