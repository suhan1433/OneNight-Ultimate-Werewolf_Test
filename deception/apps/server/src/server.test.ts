import { test } from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { createApp } from "./server.js";
import type { Action, RoomView, Session } from "@deception/shared";

async function harness() {
  let now = 1_800_000_000_000;
  const app = createApp({ now: () => now, scheduler: false });
  await new Promise<void>((resolve) =>
    app.http.listen(0, "127.0.0.1", resolve),
  );
  const port = (app.http.address() as { port: number }).port;
  const clients: {
    socket: Socket;
    view: RoomView | null;
    packets: RoomView[];
    receivedAt: number[];
  }[] = [];
  async function client() {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      forceNew: true,
    });
    const entry = {
      socket,
      view: null as RoomView | null,
      packets: [] as RoomView[],
      receivedAt: [] as number[],
    };
    socket.on("state", (view: RoomView) => {
      entry.view = view;
      entry.packets.push(view);
      entry.receivedAt.push(performance.now());
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    clients.push(entry);
    return entry;
  }
  async function send<T = unknown>(
    entry: (typeof clients)[number],
    event: string,
    payload: unknown = {},
  ): Promise<T> {
    return new Promise((resolve, reject) =>
      entry.socket
        .timeout(3_000)
        .emit(
          event,
          payload,
          (
            err: Error | null,
            reply: { ok: boolean; data: T; error: string },
          ) => {
            if (err) reject(err);
            else if (!reply.ok) reject(new Error(reply.error));
            else resolve(reply.data);
          },
        ),
    );
  }
  async function command(entry: (typeof clients)[number], action: Action) {
    await send(entry, "command", { id: `test-${Math.random()}`, action });
  }
  async function step(ms: number) {
    now += ms;
    app.schedule();
    await flush();
  }
  async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  async function game(count = 6) {
    const players = [];
    const sessions: Session[] = [];
    const host = await client();
    players.push(host);
    const session = await send<Session>(host, "create", { name: "형사1" });
    sessions.push(session);
    for (let i = 1; i < count; i++) {
      const c = await client();
      sessions.push(
        await send<Session>(c, "join", {
          code: session.code,
          name: `형사${i + 1}`,
        }),
      );
      players.push(c);
    }
    for (const p of players) await send(p, "ready", { ready: true });
    await send(host, "start");
    await step(3_000);
    for (const p of players) await command(p, { type: "confirmRole" });
    await flush();
    return { players, host, session, sessions };
  }
  return {
    app,
    client,
    send,
    command,
    step,
    flush,
    game,
    close: async () => {
      clients.forEach((c) => c.socket.disconnect());
      await app.close();
    },
  };
}

test("M2 lobby code, chat, host-only kick, seat order and leave", async () => {
  const h = await harness();
  try {
    const host = await h.client();
    const guest = await h.client();
    const session = await h.send<Session>(host, "create", { name: "방장" });
    assert.match(session.code, /^\d{4}$/);
    const guestSession = await h.send<Session>(guest, "join", {
      code: session.code,
      name: "손님",
    });
    await h.send(guest, "chat", {
      text: "<script>alert(1)</script>",
      channel: "public",
    });
    await h.flush();
    assert.equal(host.view!.chat.at(-1)!.text, "<script>alert(1)</script>");
    await assert.rejects(h.send(guest, "kick", { playerId: session.playerId }));
    await h.send(host, "seats", {
      ids: [guestSession.playerId, session.playerId],
    });
    await h.flush();
    assert.equal(host.view!.members[0].id, guestSession.playerId);
    const kicked = new Promise((resolve) =>
      guest.socket.once("kicked", resolve),
    );
    await h.send(host, "kick", { playerId: guestSession.playerId });
    await kicked;
    await assert.rejects(h.send(guest, "chat", { text: "session invalid" }));
    await assert.rejects(h.send(guest, "resume", guestSession));
    await h.send(host, "leave");
  } finally {
    await h.close();
  }
});
test("M2 reconnect requires token; stale socket loses authority", async () => {
  const h = await harness();
  try {
    const host = await h.client();
    const session = await h.send<Session>(host, "create", { name: "형사" });
    const next = await h.client();
    await assert.rejects(
      h.send(next, "resume", {
        ...session,
        token: "invalid-token-does-not-match",
      }),
    );
    const replaced = new Promise((resolve) =>
      host.socket.once("replaced", resolve),
    );
    await h.send(next, "resume", session);
    await replaced;
    assert.equal(next.view!.selfId, session.playerId);
    assert.equal(next.view!.members.length, 1);
    assert.equal(next.view!.members[0].connected, true);
  } finally {
    await h.close();
  }
});

test("M2 lobby settings reset readiness and reject incompatible roles", async () => {
  const h = await harness();
  try {
    const host = await h.client();
    const session = await h.send<Session>(host, "create", { name: "방장" });
    const guests = [];
    for (let i = 0; i < 3; i++) {
      const guest = await h.client();
      await h.send(guest, "join", { code: session.code, name: `손님${i}` });
      guests.push(guest);
    }
    for (const p of [host, ...guests])
      await h.send(p, "ready", { ready: true });
    await h.flush();
    const settings = { ...host.view!.settings, cardsPerKind: 3 };
    await assert.rejects(
      h.send(guests[0], "settings", { settings, forensicChoice: null }),
    );
    await assert.rejects(
      h.send(host, "settings", {
        settings: { ...settings, accomplice: true, witness: true },
        forensicChoice: null,
      }),
    );
    await h.send(host, "settings", { settings, forensicChoice: null });
    await h.flush();
    assert.ok(host.view!.members.every((p) => !p.ready));
    assert.equal(host.view!.settings.cardsPerKind, 3);
    await assert.rejects(h.send(host, "start"));
  } finally {
    await h.close();
  }
});
test("M2 actor spoofing and client scheduler commands rejected", async () => {
  const h = await harness();
  try {
    const { host, players } = await h.game(6);
    const bad = players.find(
      (p) => p.view!.game!.private.myRole === "investigator",
    )!;
    const murderer = players.find(
      (p) => p.view!.game!.private.myRole === "murderer",
    )!;
    const card = murderer.view!.game!.players.find(
      (p) => p.id === murderer.view!.selfId,
    )!.cards;
    await h.step(3_000);
    await assert.rejects(
      h.send(bad, "command", {
        id: "spoof",
        actorId: murderer.view!.selfId,
        action: {
          type: "crimeSelect",
          clueId: card.find((c) => c.kind === "clue")!.id,
          meansId: card.find((c) => c.kind === "means")!.id,
        },
      }),
    );
    await assert.rejects(
      h.send(host, "settings", {
        settings: host.view!.settings,
        forensicChoice: null,
      }),
    );
    await assert.rejects(h.command(host, { type: "advance" }));
  } finally {
    await h.close();
  }
});
test("M2 socket payload privacy, fixed night timing, chat permissions, solve and rematch", async () => {
  const h = await harness();
  try {
    const { host, players } = await h.game(6);
    const getRole = (role: string) =>
      players.find((p) => p.view!.game!.private.myRole === role)!;
    const murderer = getRole("murderer");
    const forensic = getRole("forensic");
    const investigator = getRole("investigator");
    const publicPlayer = investigator.view!.game!.players.find(
      (p) => p.id === murderer.view!.selfId,
    )!;
    await h.step(3_000);
    const before = investigator.packets.length;
    await h.command(murderer, {
      type: "crimeSelect",
      clueId: publicPlayer.cards.find((c) => c.kind === "clue")!.id,
      meansId: publicPlayer.cards.find((c) => c.kind === "means")!.id,
    });
    await h.flush();
    assert.equal(
      investigator.packets.length,
      before,
      "private selection must not send an event to uninvolved clients",
    );
    assert.equal(investigator.view!.game!.phase, "CRIME_NIGHT");
    await h.step(36_999);
    assert.equal(investigator.view!.game!.phase, "CRIME_NIGHT");
    await h.step(1);
    assert.equal(investigator.view!.game!.phase, "SCENE_INTRO");
    const arrivalTimes = players.map((p) => p.receivedAt.at(-1)!);
    assert.ok(
      Math.max(...arrivalTimes) - Math.min(...arrivalTimes) < 50,
      "scheduled night broadcast arrival spread under 50ms on local server",
    );
    await h.command(forensic, { type: "chooseLocation", tileId: forensic.view!.game!.tiles[0].id });
    await assert.rejects(h.send(investigator, "chat", { text: "too early" }));
    const firstTile = forensic.view!.game!.tiles[0];
    await h.command(forensic, {
      type: "placeMarker",
      tileId: firstTile.id,
      option: 0,
    });
    await h.send(investigator, "chat", { text: "이 단서가 수상해요." });
    await assert.rejects(h.send(forensic, "chat", { text: "hint" }));
    await h.flush();
    for (const packet of investigator.packets) {
      if (!packet.game) continue;
      const payload = JSON.stringify(packet.game);
      for (const key of [
        "solution",
        "roles",
        "murdererId",
        "accompliceId",
        "rng",
        "deck",
      ])
        assert.equal(payload.includes(`"${key}":`), false, key);
    }
    const solution = forensic.view!.game!.private.solution!;
    await h.command(investigator, { type: "startSolve" });
    await h.command(investigator, {
      type: "commitSolve",
      targetId: solution.murdererId,
      clueId: solution.clueId,
      meansId: solution.meansId,
    });
    await h.flush();
    assert.equal(investigator.view!.game!.phase, "RESULT");
    assert.equal(investigator.view!.game!.winner, "investigators");
    assert.ok(investigator.view!.game!.revealedRoles);
    await h.send(host, "rematch");
    await h.flush();
    assert.equal(host.view!.game, null);
    assert.ok(host.view!.members.every((p) => !p.ready));
  } finally {
    await h.close();
  }
});
test("M2 forensic disconnect pauses night and restores timers on resume", async () => {
  const h = await harness();
  try {
    const { host, players, sessions } = await h.game(6);
    const forensic = players.find(
      (p) => p.view!.game!.private.myRole === "forensic",
    )!;
    const oldDeadline = forensic.view!.game!.timer.deadline!;
    forensic.socket.disconnect();
    await h.flush();
    const observer = players.find((p) => p !== forensic)!;
    assert.ok(observer.view!.pausedAt !== null);
    await h.step(30_000);
    assert.equal(observer.view!.game!.timer.deadline, oldDeadline);
    assert.equal(observer.view!.game!.phase, "CRIME_NIGHT");
    await assert.rejects(
      h.send(observer, "command", {
        id: "pause",
        action: { type: "confirmRole" },
      }),
    );
    const resumed = await h.client();
    await h.send(resumed, "resume", sessions[players.indexOf(forensic)]);
    await h.flush();
    assert.equal(resumed.view!.pausedAt, null);
    assert.equal(resumed.view!.game!.timer.deadline, oldDeadline + 30_000);
    resumed.socket.disconnect();
    await h.flush();
    await h.step(60_000);
    const actualHost = players.find(
      (p) => p.view?.selfId === observer.view!.hostId,
    )!;
    await h.send(actualHost, "abort");
    await h.flush();
    assert.equal(actualHost.view!.game, null);
    assert.ok(host);
  } finally {
    await h.close();
  }
});

test("M2 explicit departures before crime selection retain a renderable result", async () => {
  const h = await harness();
  try {
    const { players } = await h.game(4);
    const forensic = players.find(
      (p) => p.view!.game!.private.myRole === "forensic",
    )!;
    for (const p of players.filter((p) => p !== forensic))
      await h.send(p, "leave");
    await h.flush();
    assert.equal(forensic.view!.game!.phase, "RESULT");
    assert.ok(forensic.view!.game!.solution?.clueId);
    assert.equal(forensic.view!.pausedAt, null);
  } finally {
    await h.close();
  }
});


test("test bots: host authority, capacity, readiness, removal and room cleanup", async () => {
  const h = await harness();
  try {
    const host = await h.client();
    const guest = await h.client();
    const session = await h.send<Session>(host, "create", { name: "방장" });
    await h.send(guest, "join", { code: session.code, name: "손님" });
    await assert.rejects(h.send(guest, "addBot"));
    for (let i = 0; i < 10; i++) await h.send(host, "addBot");
    await h.flush();
    assert.equal(host.view!.members.length, 12);
    assert.ok(host.view!.members.filter((m) => m.isBot).every((m) => m.ready && m.connected));
    await assert.rejects(h.send(host, "addBot"));
    const bot = host.view!.members.find((m) => m.isBot)!;
    assert.equal("token" in bot, false);
    await h.send(host, "kick", { playerId: bot.id });
    await h.send(host, "settings", { settings: host.view!.settings, forensicChoice: null });
    await h.flush();
    assert.ok(host.view!.members.filter((m) => m.isBot).every((m) => m.ready));
    assert.ok(host.view!.members.filter((m) => !m.isBot).every((m) => !m.ready));
    await h.send(host, "leave");
    await h.flush();
    assert.equal(guest.view!.hostId, guest.view!.selfId);
    await h.send(guest, "leave");
    const newcomer = await h.client();
    await assert.rejects(h.send(newcomer, "join", { code: session.code, name: "새 손님" }));
  } finally { await h.close(); }
});

for (const count of [4, 8])
  test(`test bots: one human and ${count - 1} bots complete three rounds and rematch`, async () => {
    const h = await harness();
    try {
      const host = await h.client();
      await h.send(host, "create", { name: "혼자 테스트" });
      for (let i = 1; i < count; i++) await h.send(host, "addBot");
      await h.flush();
      const bot = host.view!.members.find((m) => m.isBot)!;
      await h.send(host, "settings", { settings: host.view!.settings, forensicChoice: bot.id });
      await h.send(host, "ready", { ready: true });
      await h.send(host, "start");
      await assert.rejects(h.send(host, "addBot"));
      await h.step(3_000);
      await h.command(host, { type: "confirmRole" });
      await h.step(1_500);
      assert.equal(host.view!.game!.phase, "CRIME_NIGHT");
      for (let i = 0; i < 250 && host.view!.game!.phase !== "RESULT"; i++) {
        const game = host.view!.game!;
        if (game.phase === "PRESENTATION" && game.presenterId === host.view!.selfId)
          await h.command(host, { type: "endPresentation" });
        if (game.phase === "REVERSAL" && game.private.myRole === "murderer") {
          const target = game.players.find((p) => p.id !== host.view!.selfId && p.id !== game.forensicId && p.id !== game.private.accompliceId)!;
          await h.command(host, { type: "reversalPick", targetId: target.id });
        }
        await h.step(1_500);
      }
      assert.equal(host.view!.game!.phase, "RESULT");
      assert.ok(host.view!.game!.solution);
      assert.ok(host.view!.game!.history.some((e) => e.type === "replace"));
      assert.ok(host.view!.chat.some((m) => m.text.includes("[테스트 봇]")));
      await h.send(host, "rematch");
      await h.flush();
      assert.equal(host.view!.game, null);
      assert.ok(host.view!.members.filter((m) => m.isBot).every((m) => m.ready));
      assert.equal(host.view!.members.find((m) => !m.isBot)!.ready, false);
    } finally { await h.close(); }
  });
