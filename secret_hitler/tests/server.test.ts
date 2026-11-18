import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import { createGameServer } from "../apps/server/src/server.js";
import type { RoomView } from "../packages/shared-types/src/index.js";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
function call(s: Socket, name: string, data: unknown = {}): Promise<any> {
  return new Promise((resolve, reject) =>
    s
      .timeout(5000)
      .emit(name, data, (err: unknown, r: any) =>
        err ? reject(err) : r.ok ? resolve(r.data) : reject(Error(r.error)),
      ),
  );
}
async function connect(port: number) {
  const s = io(`http://127.0.0.1:${port}`, {
    path: "/secret_hitler/socket.io",
    transports: ["websocket"],
    forceNew: true,
  });
  await new Promise<void>((resolve, reject) => {
    s.once("connect", resolve);
    s.once("connect_error", reject);
  });
  return s;
}
async function wait(check: () => boolean) {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await delay(10);
  }
  throw Error("Timed out waiting for room state");
}

test(
  "실제 Socket.IO: 5인 준비·게임·필터링·중복 입력·관전·재접속·봇 대체·끝까지 완주·재시작 복구",
  { timeout: 30000 },
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "secret-hitler-"));
    let instance = createGameServer({ dataDir, botDelayMs: 2 });
    await new Promise<void>((r) => instance.server.listen(0, "127.0.0.1", r));
    let port = (instance.server.address() as any).port;
    const clients: Socket[] = [];
    const states = new Map<Socket, RoomView>();
    const track = (s: Socket) => {
      clients.push(s);
      s.on("ROOM_STATE", (v) => states.set(s, v));
      return s;
    };
    try {
      const host = track(await connect(port));
      const session = await call(host, "CREATE_ROOM", {
        name: "호스트",
        avatar: 0,
      });
      const credentials: any[] = [session];
      for (let i = 1; i < 5; i++) {
        const s = track(await connect(port));
        credentials.push(
          await call(s, "JOIN_ROOM", {
            code: session.code,
            name: `의원${i}`,
            avatar: i,
          }),
        );
      }
      await assert.rejects(call(clients[1], "START"), /호스트/);
      for (const s of clients) await call(s, "READY", { ready: true });
      await call(host, "START");
      await wait(() =>
        clients.every((s) => states.get(s)?.game?.phase === "night"),
      );
      for (const s of clients) {
        const v = states.get(s)!;
        assert(!JSON.stringify(v).includes("tokenHash"));
        assert.equal(
          v.game?.knownPlayers.length,
          v.game?.selfRole === "liberal" ? 0 : 1,
        );
      }
      const observer = track(await connect(port));
      await call(observer, "JOIN_ROOM", {
        code: session.code,
        name: "관전자",
        avatar: 9,
        spectator: true,
      });
      await wait(() => !!states.get(observer)?.game);
      assert.equal(states.get(observer)?.game?.selfRole, undefined);
      await assert.rejects(
        call(observer, "CHAT", { text: "누설 시도" }),
        /발언/,
      );
      await assert.rejects(
        call(observer, "ACTION", {
          requestId: randomUUID(),
          version: 0,
          action: { type: "acknowledge" },
        }),
        /생존/,
      );
      for (const s of clients.slice(0, 5))
        await call(s, "ACTION", {
          requestId: randomUUID(),
          version: states.get(s)!.game!.version,
          action: { type: "acknowledge" },
        });
      await wait(() => states.get(host)?.game?.phase === "nomination");
      const g = states.get(host)!.game!;
      const president = clients.find(
        (s) => states.get(s)?.selfId === g.president,
      )!;
      await call(president, "ACTION", {
        requestId: randomUUID(), version: g.version,
        action: { type: "select_target", target: g.eligibleChancellors[0] },
      });
      await wait(() => states.get(observer)?.game?.selectedTarget === g.eligibleChancellors[0]);
      const action = {
        requestId: randomUUID(),
        version: states.get(president)!.game!.version,
        action: { type: "nominate", target: g.eligibleChancellors[0] },
      };
      await call(president, "ACTION", action);
      await call(president, "ACTION", action);
      assert.equal(states.get(host)?.game?.phase, "voting");
      await assert.rejects(
        call(president, "ACTION", { ...action, requestId: randomUUID() }),
        /갱신/,
      );
      for (const s of clients.slice(0, 5))
        await call(s, "ACTION", {
          requestId: randomUUID(),
          version: states.get(s)!.game!.version,
          action: { type: "vote", ja: true },
        });
      await wait(() => states.get(host)?.game?.phase === "vote_result");
      assert.equal(states.get(host)?.deadline, null);
      const resultVersion = states.get(host)!.game!.version;
      await Promise.all(clients.slice(0, 4).map((s) => call(s, "ACTION", {
        requestId: randomUUID(), version: resultVersion,
        action: { type: "acknowledge" },
      })));
      await wait(() => states.get(host)?.game?.acknowledged.length === 4);
      await delay(80);
      assert.equal(states.get(host)?.game?.phase, "vote_result");
      await call(clients[4], "ACTION", {
        requestId: randomUUID(), version: resultVersion,
        action: { type: "acknowledge" },
      });
      await wait(() => states.get(host)?.game?.phase === "president_discard");
      for (const s of clients.slice(0, 5))
        assert.equal(
          states.get(s)?.game?.hand?.length,
          states.get(s)?.selfId === g.president ? 3 : undefined,
        );
      const victim = clients[4];
      victim.disconnect();
      await wait(() => states.get(host)?.paused === true);
      const resumed = track(await connect(port));
      await call(resumed, "RESUME", credentials[4]);
      await wait(() => states.get(host)?.paused === false);
      const bad = track(await connect(port));
      await assert.rejects(
        call(bad, "RESUME", { ...credentials[4], token: "x".repeat(43) }),
        /再|재접속/,
      );
      bad.disconnect();
      resumed.disconnect();
      await wait(() => states.get(host)?.paused === true);
      await call(host, "HOST_DECISION", { decision: "replace" });
      await wait(() => !states.get(host)?.paused);
      for (const s of clients.slice(1, 4)) s.disconnect();
      await wait(() => states.get(host)?.paused === true);
      await call(host, "HOST_DECISION", { decision: "replace" });
      // Drive the single human only from their authorized client view.
      const { botAction } =
        await import("../packages/rules-engine/src/index.js");
      for (let i = 0; i < 500; i++) {
        const v = states.get(host)!;
        if (v.game?.phase === "finished") break;
        const a = v.game && botAction(v.game, v.selfId);
        if (a)
          await call(host, "ACTION", {
            version: v.game!.version,
            requestId: randomUUID(),
            action: a,
          });
        await delay(12);
      }
      assert.equal(states.get(host)?.game?.phase, "finished");
      assert(states.get(host)?.game?.revealedRoles);
      assert.equal(states.get(observer)?.game?.replay, undefined);
      const snapshots = readFileSync(join(dataDir, `${session.code}.jsonl`), "utf8").trim().split("\n");
      assert.equal(snapshots.length, 1);
      assert.deepEqual(JSON.parse(snapshots[0]).state.game.secrets, []);
      await instance.close();
      instance = createGameServer({ dataDir, botDelayMs: 2 });
      await new Promise<void>((r) => instance.server.listen(0, "127.0.0.1", r));
      port = (instance.server.address() as any).port;
      const recovered = track(await connect(port));
      await call(recovered, "RESUME", session);
      await wait(() => states.get(recovered)?.game?.phase === "finished");
      assert.deepEqual(
        states.get(recovered)?.game?.revealedRoles,
        states.get(host)?.game?.revealedRoles,
      );
    } finally {
      clients.forEach((s) => s.disconnect());
      await instance.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
);

test("서버 레이트 제한과 손상된 입력 거절", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "secret-hitler-limit-"));
  const server = createGameServer({ dataDir });
  await new Promise<void>((r) => server.server.listen(0, "127.0.0.1", r));
  const s = await connect((server.server.address() as any).port);
  try {
    await assert.rejects(
      call(s, "CREATE_ROOM", { name: "", avatar: 99 }),
      /입력/,
    );
    for (let i = 0; i < 20; i++)
      await assert.rejects(
        call(s, "JOIN_ROOM", { code: "AAAAAA", name: "test", avatar: 0 }),
        /찾을/,
      );
    await assert.rejects(
      call(s, "JOIN_ROOM", { code: "AAAAAA", name: "test", avatar: 0 }),
      /너무 많/,
    );
  } finally {
    s.disconnect();
    await server.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
test(
  "동시 6개 방 부하: 5·6·7·8·9·10인 실제 네트워크 완주, 방 간 격리",
  { timeout: 30000 },
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "secret-hitler-load-"));
    const instance = createGameServer({ dataDir, botDelayMs: 2 });
    await new Promise<void>((r) => instance.server.listen(0, "127.0.0.1", r));
    const port = (instance.server.address() as any).port,
      clients: Socket[] = [],
      views = new Map<Socket, RoomView>(),
      latencies: number[] = [];
    const started = Date.now();
    try {
      for (let n = 5; n <= 10; n++) {
        const s = await connect(port);
        clients.push(s);
        s.on("ROOM_STATE", (v) => views.set(s, v));
        await call(s, "CREATE_ROOM", { name: `호스트${n}`, avatar: n });
        for (let i = 1; i < n; i++) await call(s, "ADD_BOT");
        await call(s, "READY", { ready: true });
        await call(s, "START");
      }
      const { botAction } =
        await import("../packages/rules-engine/src/index.js");
      await Promise.all(
        clients.map(async (s) => {
          for (let step = 0; step < 1000; step++) {
            const v = views.get(s)!;
            assert.equal(
              v.members.filter((m) => !m.spectator).length,
              v.game!.players.length,
            );
            if (v.game?.phase === "finished") return;
            const a = v.game && botAction(v.game, v.selfId);
            if (a) {
              const begin = Date.now();
              try {
                await call(s, "ACTION", {
                  version: v.game!.version,
                  requestId: randomUUID(),
                  action: a,
                });
                latencies.push(Date.now() - begin);
              } catch (e) {
                if (!String(e).includes("갱신")) throw e;
              }
            }
            await delay(10);
          }
          throw Error("Game did not finish");
        }),
      );
      assert.equal(new Set(clients.map((s) => views.get(s)?.code)).size, 6);
      latencies.sort((a, b) => a - b);
      console.log(
        JSON.stringify({
          rooms: 6,
          players: 45,
          elapsedMs: Date.now() - started,
          actions: latencies.length,
          actionP95Ms: latencies[Math.floor(latencies.length * 0.95)],
        }),
      );
    } finally {
      clients.forEach((s) => s.disconnect());
      await instance.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
);
test("서버 재시작: 진행 중 일시정지 복구와 끊긴 저널 마지막 줄 복구", async () => {
  const { appendFileSync } = await import("node:fs");
  const dataDir = mkdtempSync(join(tmpdir(), "secret-hitler-recovery-"));
  let instance = createGameServer({ dataDir, botDelayMs: 2 });
  await new Promise<void>((r) => instance.server.listen(0, "127.0.0.1", r));
  let s = await connect((instance.server.address() as any).port);
  let view: RoomView | null = null;
  s.on("ROOM_STATE", (v) => {
    view = v;
  });
  try {
    const session = await call(s, "CREATE_ROOM", {
      name: "복구 의원",
      avatar: 0,
    });
    for (let i = 0; i < 4; i++) await call(s, "ADD_BOT");
    await call(s, "READY", { ready: true });
    await call(s, "START");
    await instance.close();
    s.disconnect();
    appendFileSync(join(dataDir, `${session.code}.jsonl`), ' {"broken":');
    instance = createGameServer({ dataDir, botDelayMs: 2 });
    await new Promise<void>((r) => instance.server.listen(0, "127.0.0.1", r));
    s = await connect((instance.server.address() as any).port);
    s.on("ROOM_STATE", (v) => {
      view = v;
    });
    await call(s, "RESUME", session);
    await wait(() => !!view?.game && !view.paused);
    assert.equal((view as RoomView | null)?.game?.phase, "night");
    await instance.close();
    s.disconnect();
    instance = createGameServer({ dataDir, botDelayMs: 2 });
    await new Promise<void>((r) => instance.server.listen(0, "127.0.0.1", r));
    s = await connect((instance.server.address() as any).port);
    await call(s, "RESUME", session);
  } finally {
    s.disconnect();
    await instance.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
test("전원 이탈 후 먼저 복귀한 참가자가 호스트를 승계하여 일시정지 해제 가능", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "secret-hitler-host-")),
    instance = createGameServer({ dataDir, botDelayMs: 2 });
  await new Promise<void>((r) => instance.server.listen(0, "127.0.0.1", r));
  const port = (instance.server.address() as any).port,
    a = await connect(port),
    b = await connect(port);
  let last: RoomView | null = null;
  let resumed: Socket | undefined;
  try {
    const session = await call(a, "CREATE_ROOM", {
      name: "원 의장",
      avatar: 0,
    });
    await call(b, "JOIN_ROOM", {
      code: session.code,
      name: "새 의장",
      avatar: 1,
    });
    b.on("ROOM_STATE", (v) => {
      last = v;
    });
    for (let i = 0; i < 3; i++) await call(a, "ADD_BOT");
    await call(a, "READY", { ready: true });
    await call(b, "READY", { ready: true });
    await call(a, "START");
    a.disconnect();
    await wait(() => !!last?.paused && last.hostId !== session.id);
    b.disconnect();
    await delay(30);
    resumed = await connect(port);
    resumed.on("ROOM_STATE", (v) => {
      last = v;
    });
    await call(resumed, "RESUME", session);
    await wait(() => last?.hostId === session.id && last?.paused === true);
    await call(resumed, "HOST_DECISION", { decision: "replace" });
    await wait(() => last?.paused === false);
  } finally {
    a.disconnect();
    b.disconnect();
    resumed?.disconnect();
    await instance.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
