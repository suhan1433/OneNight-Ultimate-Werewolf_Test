import { test } from "node:test";
import assert from "node:assert/strict";
import { content } from "./content.js";
import {
  applyCommand,
  createGame,
  defaultSettings,
  departPlayer,
  forensicId,
  presenterId,
  roleId,
  roleSet,
  tick,
} from "./engine.js";
import { canChat, project } from "./projection.js";
import { simulate, type Scenario } from "./simulator.js";
import type { Action, GameState, Settings } from "./types.js";

const roster = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `형사${i + 1}` }));
const create = (n = 8, options: Partial<Settings> = {}, seed = "unit-seed") =>
  createGame({
    players: roster(n),
    seed,
    now: 0,
    settings: { ...defaultSettings(n), ...options },
  });
let commandCount = 0;
function act(
  s: GameState,
  actorId: string,
  action: Action,
  now = s.now,
): GameState {
  return applyCommand(s, { id: `cmd-${commandCount++}`, actorId, action }, now);
}
function night(n = 8, options: Partial<Settings> = {}): GameState {
  let s = tick(create(n, options), 3_000);
  for (const p of s.players) s = act(s, p.id, { type: "confirmRole" });
  return s;
}
function select(s: GameState): GameState {
  const p = s.players.find((p) => p.id === roleId(s, "murderer"))!;
  return act(
    s,
    p.id,
    {
      type: "crimeSelect",
      clueId: p.cards.find((c) => c.kind === "clue")!.id,
      meansId: p.cards.find((c) => c.kind === "means")!.id,
    },
    s.nightStartedAt! + 3_000,
  );
}
function investigation(n = 8, options: Partial<Settings> = {}): GameState {
  let s = select(night(n, options));
  s = tick(s, s.nightStartedAt! + 40_000);
  return tick(s, s.now + 3_000);
}
function markAll(s: GameState): GameState {
  for (const tile of s.tiles)
    if (s.markers[tile.id] === undefined)
      s = act(s, forensicId(s), {
        type: "placeMarker",
        tileId: tile.id,
        option: 2,
      });
  return s;
}
function presentations(s: GameState): GameState {
  return act(markAll(s), forensicId(s), { type: "beginPresentations" });
}
function endRound(s: GameState): GameState {
  while (s.phase === "PRESENTATION")
    s = act(s, presenterId(s)!, { type: "endPresentation" });
  return s;
}
function solver(s: GameState): string {
  return s.players.find((p) => s.roles[p.id] === "investigator")!.id;
}
function correctSolve(s: GameState): GameState {
  const id = solver(s);
  s = act(s, id, { type: "startSolve" });
  return act(s, id, {
    type: "commitSolve",
    targetId: s.solution!.murdererId,
    clueId: s.solution!.clueId,
    meansId: s.solution!.meansId,
  });
}
function wrongSolve(s: GameState, id = solver(s)): GameState {
  const target = s.players.find(
    (p) => p.id !== id && s.roles[p.id] === "investigator",
  )!;
  s = act(s, id, { type: "startSolve" });
  return act(s, id, {
    type: "commitSolve",
    targetId: target.id,
    clueId: target.cards.find((c) => c.kind === "clue")!.id,
    meansId: target.cards.find((c) => c.kind === "means")!.id,
  });
}

for (const n of [4, 5, 6, 8, 12])
  test(`1.2 role assignment ${n} players`, () => {
    const s = create(n);
    const roles = Object.values(s.roles);
    assert.equal(roles.filter((r) => r === "forensic").length, 1);
    assert.equal(roles.filter((r) => r === "murderer").length, 1);
    assert.equal(roles.includes("accomplice"), n >= 6);
    assert.equal(roles.includes("witness"), n >= 8);
  });
for (const cardsPerKind of [3, 4, 5] as const)
  test(`1.3 unique card deal ${cardsPerKind} per kind at 12 players`, () => {
    const s = create(12, { cardsPerKind });
    const cards = s.players.flatMap((p) => p.cards);
    assert.equal(cards.length, 11 * cardsPerKind * 2);
    assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
    for (const p of s.players) {
      if (s.roles[p.id] === "forensic") {
        assert.deepEqual(p.cards, []);
        assert.equal(p.hasBadge, false);
      } else {
        assert.equal(p.hasBadge, true);
        assert.equal(
          p.cards.filter((c) => c.kind === "clue").length,
          cardsPerKind,
        );
        assert.equal(
          p.cards.filter((c) => c.kind === "means").length,
          cardsPerKind,
        );
      }
    }
  });
test("1.2 invalid role settings and population rejected", () => {
  for (const n of [0, 3, 13, 4.5])
    assert.throws(() => roleSet(n, defaultSettings(n)));
  assert.throws(() => roleSet(4, { ...defaultSettings(4), accomplice: true }));
  assert.throws(() => create(8, { accomplice: false, witness: true }));
});
test("1.2 optional roles can be disabled", () => {
  const s = create(12, { accomplice: false, witness: false });
  assert.equal(
    Object.values(s.roles).filter((r) => r === "investigator").length,
    10,
  );
});
test("1.12 seeded seating, assignment and cards are deterministic", () => {
  assert.deepEqual(create(), create());
  assert.notDeepEqual(create(8, {}, "different").players, create().players);
  assert.deepEqual(
    create().players.map((p) => p.seat),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
});
test("4.3 designated forensic and input identity validation", () => {
  const s = createGame({
    players: roster(6),
    seed: "fixed",
    now: 0,
    forensicId: "p4",
  });
  assert.equal(forensicId(s), "p4");
  assert.throws(() =>
    createGame({
      players: roster(6),
      seed: "fixed",
      now: 0,
      forensicId: "absent",
    }),
  );
  assert.throws(() =>
    createGame({
      players: [...roster(4), roster(4)[0]!],
      seed: "fixed",
      now: 0,
    }),
  );
  assert.throws(() =>
    createGame({ players: roster(4), seed: "fixed", now: NaN }),
  );
});
test("4.4 role confirmations gate the night and duplicate confirmations are harmless", () => {
  let s = tick(create(), 3_000);
  assert.equal(s.phase, "ROLE_REVEAL");
  s = act(s, s.players[0]!.id, { type: "confirmRole" });
  s = act(s, s.players[0]!.id, { type: "confirmRole" });
  assert.equal(s.confirmed.length, 1);
  assert.equal(s.phase, "ROLE_REVEAL");
});
test("4.4 fixed night windows even after early choice and without witness", () => {
  for (const n of [4, 8]) {
    let s = night(n);
    const start = s.nightStartedAt!;
    const murderer = s.players.find((p) => s.roles[p.id] === "murderer")!;
    const action: Action = {
      type: "crimeSelect",
      clueId: murderer.cards.find((c) => c.kind === "clue")!.id,
      meansId: murderer.cards.find((c) => c.kind === "means")!.id,
    };
    assert.throws(() => act(s, murderer.id, action), /NIGHT_WINDOW/);
    s = select(s);
    assert.equal(s.timer.deadline, start + 40_000);
    assert.equal(tick(s, start + 39_999).phase, "CRIME_NIGHT");
    assert.equal(tick(s, start + 40_000).phase, "SCENE_INTRO");
    assert.throws(() => act(s, murderer.id, action), /SOLUTION_LOCKED/);
  }
});
test("4.4 murderer timeout deterministically selects valid own cards", () => {
  const s = night();
  const a = tick(s, s.nightStartedAt! + 28_000);
  assert.ok(a.solution);
  assert.deepEqual(a.solution, tick(s, s.nightStartedAt! + 28_000).solution);
  assert.equal(a.phase, "CRIME_NIGHT");
  assert.equal(tick(s, s.nightStartedAt! + 40_000).phase, "SCENE_INTRO");
});
test("1.4 only murderer can choose own clue and means", () => {
  const s = tick(night(), 6_000);
  const m = roleId(s, "murderer")!;
  assert.throws(
    () =>
      act(s, solver(s), { type: "crimeSelect", clueId: "bad", meansId: "bad" }),
    /INVALID_ROLE_OR_PHASE/,
  );
  assert.throws(
    () => act(s, m, { type: "crimeSelect", clueId: "bad", meansId: "bad" }),
    /INVALID_CARDS/,
  );
});
test("1.5 initial scene has location, cause, four hints, six options each", () => {
  const s = investigation();
  assert.equal(s.tiles.length, 6);
  assert.equal(s.tiles.filter((t) => t.kind === "location").length, 1);
  assert.equal(s.tiles.filter((t) => t.kind === "cause").length, 1);
  assert.equal(s.tiles.filter((t) => t.kind === "hint").length, 4);
  assert.ok(s.tiles.every((t) => t.options.length === 6));
});
test("1.5 forensic chooses a location during scene intro", () => {
  const s = tick(select(night()), 43_000);
  const location = content.tiles.filter((t) => t.kind === "location")[1]!;
  assert.equal(
    act(s, forensicId(s), { type: "chooseLocation", tileId: location.id })
      .tiles[0]!.id,
    location.id,
  );
  assert.throws(() =>
    act(s, solver(s), { type: "chooseLocation", tileId: location.id }),
  );
});
test("1.5 marker cannot move, duplicate, use seventh tile or invalid option", () => {
  let s = investigation();
  const tileId = s.tiles[0]!.id;
  assert.throws(() =>
    act(s, solver(s), { type: "placeMarker", tileId, option: 0 }),
  );
  s = act(s, forensicId(s), { type: "placeMarker", tileId, option: 0 });
  assert.throws(
    () => act(s, forensicId(s), { type: "placeMarker", tileId, option: 1 }),
    /MARKER_IMMUTABLE/,
  );
  assert.throws(
    () =>
      act(s, forensicId(s), {
        type: "placeMarker",
        tileId: "unknown",
        option: 1,
      }),
    /INVALID_TILE/,
  );
  assert.throws(() =>
    act(s, forensicId(s), {
      type: "placeMarker",
      tileId: s.tiles[1]!.id,
      option: 6,
    }),
  );
  assert.throws(() => act(s, forensicId(s), { type: "beginPresentations" }));
  s = markAll(s);
  assert.equal(Object.keys(s.markers).length, 6);
  assert.equal(s.phase, "EVIDENCE_COLLECTION");
  assert.equal(tick(s, s.now + 10_000).phase, "PRESENTATION");
});
test("1.12 presentation order starts clockwise after forensic", () => {
  const s = presentations(investigation());
  const seat = s.players.find((p) => p.id === forensicId(s))!.seat;
  assert.deepEqual(
    s.presentationOrder,
    Array.from({ length: 7 }, (_, i) => s.players[(seat + i + 1) % 8]!.id),
  );
  assert.equal(presenterId(s), s.presentationOrder[0]);
  assert.throws(
    () => act(s, forensicId(s), { type: "endPresentation" }),
    /NOT_PRESENTER/,
  );
});
test("1.5 R2 and R3 replacement recovers marker and protects location/cause", () => {
  let s = investigation();
  for (const round of [2, 3]) {
    s = endRound(presentations(s));
    assert.equal(s.round, round);
    assert.equal(s.phase, "ROUND_TRANSITION");
    for (const t of s.tiles.filter((t) => t.kind !== "hint"))
      assert.throws(
        () => act(s, forensicId(s), { type: "replaceTile", tileId: t.id }),
        /PROTECTED_TILE/,
      );
    const old = s.tiles.find((t) => t.kind === "hint")!.id;
    const incoming = s.pendingTile!.id;
    s = act(s, forensicId(s), { type: "replaceTile", tileId: old });
    assert.equal(Object.keys(s.markers).length, 5);
    assert.equal(s.markers[old], undefined);
    assert.equal(s.markers[incoming], undefined);
    s = act(s, forensicId(s), {
      type: "placeMarker",
      tileId: incoming,
      option: 5,
    });
    assert.equal(Object.keys(s.markers).length, 6);
    assert.equal(s.tiles.length, 6);
  }
});
test("1.6 wrong solve spends badge, gives no partial feedback, retains presentation", () => {
  let s = wrongSolve(investigation());
  const id = solver(s);
  assert.equal(s.players.find((p) => p.id === id)!.hasBadge, false);
  assert.throws(() => act(s, id, { type: "startSolve" }), /NO_BADGE/);
  const record = project(s, id).history.find((e) => e.type === "solve")!;
  assert.equal(record.correct, false);
  assert.equal(record.solution, undefined);
  s = presentations(s);
  assert.ok(s.presentationOrder.includes(id));
});
test("1.6 murderer and accomplice have solve attempts; forensic does not", () => {
  const s = investigation();
  for (const role of ["murderer", "accomplice"] as const)
    assert.equal(
      act(s, roleId(s, role)!, { type: "startSolve" }).phase,
      "SOLVING",
    );
  assert.throws(
    () => act(s, forensicId(s), { type: "startSolve" }),
    /NO_BADGE/,
  );
});
test("1.6 cannot target self or cards owned by different players", () => {
  let s = investigation();
  const id = solver(s);
  s = act(s, id, { type: "startSolve" });
  assert.throws(
    () =>
      act(s, id, {
        type: "commitSolve",
        targetId: id,
        clueId: s.solution!.clueId,
        meansId: s.solution!.meansId,
      }),
    /INVALID_TARGET/,
  );
  const other = s.players.find(
    (p) => p.id !== id && s.roles[p.id] === "investigator",
  )!;
  assert.throws(
    () =>
      act(s, id, {
        type: "commitSolve",
        targetId: other.id,
        clueId: s.solution!.clueId,
        meansId: s.solution!.meansId,
      }),
    /INVALID_CARDS/,
  );
  assert.equal(s.players.find((p) => p.id === id)!.hasBadge, true);
});
test("1.6 matching only one card is an incorrect solve", () => {
  let s = investigation(6);
  const id = solver(s);
  const murderer = s.players.find((p) => p.id === s.solution!.murdererId)!;
  s = act(s, id, { type: "startSolve" });
  s = act(s, id, {
    type: "commitSolve",
    targetId: murderer.id,
    clueId: s.solution!.clueId,
    meansId: murderer.cards.find(
      (c) => c.kind === "means" && c.id !== s.solution!.meansId,
    )!.id,
  });
  assert.equal(s.phase, "EVIDENCE_COLLECTION");
  assert.equal(s.history.at(-1)!.correct, false);
});
test("1.7 correct solve without witness wins immediately", () => {
  const s = correctSolve(investigation(6));
  assert.equal(s.phase, "RESULT");
  assert.equal(s.winner, "investigators");
});
test("1.12 solve lock is first-come, timer pauses, cancel does not spend badge", () => {
  const initial = presentations(investigation());
  const id = solver(initial);
  const deadline = initial.timer.deadline!;
  let s = act(initial, id, { type: "startSolve" }, initial.now + 5_000);
  assert.equal(s.timer.deadline, null);
  assert.throws(
    () => act(s, roleId(s, "murderer")!, { type: "startSolve" }),
    /SOLVE_LOCKED/,
  );
  assert.throws(
    () => act(s, roleId(s, "murderer")!, { type: "cancelSolve" }),
    /NOT_SOLVER/,
  );
  s = act(s, id, { type: "cancelSolve" }, s.now + 7_000);
  assert.equal(s.timer.deadline, deadline + 7_000);
  assert.equal(s.players.find((p) => p.id === id)!.hasBadge, true);
  assert.equal(presenterId(s), presenterId(initial));
});
test("1.12 solve wizard expires at 20 seconds without spending badge", () => {
  let s = presentations(investigation());
  const id = solver(s);
  s = act(s, id, { type: "startSolve" });
  const locked = s;
  s = tick(s, s.now + 20_000);
  assert.equal(s.phase, "PRESENTATION");
  assert.equal(s.solveLock, null);
  assert.equal(s.players.find((p) => p.id === id)!.hasBadge, true);
  assert.throws(
    () =>
      act(
        locked,
        id,
        {
          type: "commitSolve",
          targetId: locked.solution!.murdererId,
          clueId: locked.solution!.clueId,
          meansId: locked.solution!.meansId,
        },
        locked.now + 20_000,
      ),
    /NOT_SOLVER/,
  );
});
test("1.7 every badge exhausted wins for criminals", () => {
  const result = simulate({
    players: 6,
    seed: "badges",
    scenario: "exhausted",
  });
  assert.equal(result.winner, "criminals");
  assert.equal(result.state.reason, "BADGES_EXHAUSTED");
  assert.ok(result.state.players.every((p) => !p.hasBadge));
});
test("1.12 final third presentation expires all attempts without grace period", () => {
  const result = simulate({
    players: 12,
    seed: "last-chance",
    scenario: "final-round",
  });
  assert.equal(result.state.round, 3);
  assert.equal(result.state.reason, "FINAL_PRESENTATION_ENDED");
  assert.ok(result.state.players.every((p) => !p.hasBadge));
  assert.equal(
    result.state.history.filter((e) => e.type === "presentation").length,
    33,
  );
});

test("9 early departures exhaust badges with a valid result before crime selection", () => {
  let s = create(4);
  const before = structuredClone(s);
  for (const p of s.players.filter((p) => s.roles[p.id] !== "forensic"))
    s = departPlayer(s, p.id, s.now);
  assert.equal(s.phase, "RESULT");
  assert.equal(s.winner, "criminals");
  assert.ok(s.solution);
  assert.equal(
    project(s, forensicId(s)).solution?.murdererId,
    roleId(s, "murderer"),
  );
  assert.ok(before.players.every((p) => !p.departed));
});

test("9 explicit departure cancels own solve and skips the current presentation", () => {
  let s = presentations(investigation());
  const id = presenterId(s)!;
  s = act(s, id, { type: "startSolve" });
  s = departPlayer(s, id, s.now);
  assert.equal(s.solveLock, null);
  assert.equal(s.players.find((p) => p.id === id)!.hasBadge, false);
  assert.notEqual(presenterId(s), id);
  assert.ok(s.players.find((p) => p.id === id)!.cards.length > 0);
});
test("1.8 witness reversal accepts only murderer and eligible targets", () => {
  const s = correctSolve(investigation());
  assert.equal(s.phase, "REVERSAL");
  assert.equal(s.timer.deadline, s.now + 60_000);
  assert.throws(
    () =>
      act(s, roleId(s, "accomplice")!, {
        type: "reversalPick",
        targetId: roleId(s, "witness")!,
      }),
    /INVALID_ROLE_OR_PHASE/,
  );
  for (const role of ["forensic", "murderer", "accomplice"] as const)
    assert.throws(
      () =>
        act(s, roleId(s, "murderer")!, {
          type: "reversalPick",
          targetId: roleId(s, role)!,
        }),
      /INVALID_TARGET/,
    );
});
for (const [scenario, winner] of [
  ["reversal-win", "criminals"],
  ["reversal-loss", "investigators"],
  ["reversal-timeout", "investigators"],
] as const)
  test(`1.8 ${scenario}`, () => {
    assert.equal(
      simulate({ players: 8, seed: "witness", scenario }).winner,
      winner,
    );
  });
test("1.12 event effects discard events and still draw a replacement in same round", () => {
  let s = endRound(presentations(investigation(8, { events: true })));
  assert.equal(s.eventsAdded, true);
  assert.ok(s.pendingTile?.kind === "hint");
  s = act(s, forensicId(s), {
    type: "replaceTile",
    tileId: s.tiles.find((t) => t.kind === "hint")!.id,
  });
  s = presentations(s);
  s.deck = [
    ...content.tiles.filter((t) => t.kind === "event").map((t) => ({ ...t })),
    ...s.deck,
  ];
  s = endRound(s);
  assert.equal(s.round, 3);
  assert.ok(s.pendingTile?.kind === "hint");
  assert.equal(s.roundPresentationSeconds, null);
  assert.ok(s.history.filter((e) => e.type === "event").length >= 6);
  assert.ok(s.tiles.every((t) => t.kind !== "event"));
});
test("1.10 finite, unlimited and scheduler presentation timers", () => {
  for (const seconds of [20, 30, 45, 60, null] as const) {
    let s = presentations(investigation(8, { presentationSeconds: seconds }));
    assert.equal(
      s.timer.deadline,
      seconds === null ? null : s.now + seconds * 1_000,
    );
    const previous = presenterId(s);
    if (seconds !== null) {
      const version = s.version;
      s = tick(s, s.timer.deadline!);
      assert.notEqual(presenterId(s), previous);
      assert.ok(s.version > version);
    } else assert.equal(presenterId(tick(s, s.now + 100_000)), previous);
  }
});
test("8 pure reducer, immutable content and idempotent commands", () => {
  const s = investigation();
  const before = structuredClone(s);
  const cmd = {
    id: "same-packet",
    actorId: forensicId(s),
    action: { type: "placeMarker", tileId: s.tiles[0]!.id, option: 0 } as const,
  };
  const next = applyCommand(s, cmd, s.now);
  assert.deepEqual(s, before);
  assert.deepEqual(applyCommand(next, cmd, next.now), next);
  assert.equal(Object.keys(create().markers).length, 0);
});
test("8 malformed actions, unknown users, clock rewind and disconnected actors rejected", () => {
  const s = investigation();
  assert.throws(
    () => act(s, "unknown", { type: "startSolve" }),
    /INVALID_ACTOR/,
  );
  assert.throws(() => tick(s, s.now - 1), /CLOCK_REWIND/);
  assert.throws(() => tick(s, NaN), /CLOCK_REWIND/);
  assert.throws(() =>
    applyCommand(
      s,
      { id: "bad", actorId: solver(s), action: { type: "hax" } } as never,
      s.now,
    ),
  );
  assert.throws(() => act(s, solver(s), { type: "advance" }), /SERVER_ONLY/);
  s.players.find((p) => p.id === solver(s))!.connected = false;
  assert.throws(
    () => act(s, solver(s), { type: "startSolve" }),
    /INVALID_ACTOR/,
  );
});
test("10 original content counts, uniqueness and label budgets", () => {
  for (const kind of ["clue", "means"]) {
    const cards = content.cards.filter((c) => c.kind === kind);
    assert.ok(cards.length >= 60);
    assert.equal(new Set(cards.map((c) => c.label)).size, cards.length);
    assert.ok(cards.every((c) => c.label.length <= 10));
  }
  assert.equal(content.tiles.filter((t) => t.kind === "location").length, 3);
  assert.equal(content.tiles.filter((t) => t.kind === "cause").length, 1);
  assert.ok(content.tiles.filter((t) => t.kind === "hint").length >= 14);
  assert.equal(content.tiles.filter((t) => t.kind === "event").length, 6);
  const ids = [...content.cards, ...content.tiles].map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("1.9 chat: no discussion before first marker and forensic is silent", () => {
  let s = investigation();
  assert.equal(canChat(s, solver(s)), false);
  s = act(s, forensicId(s), {
    type: "placeMarker",
    tileId: s.tiles[0]!.id,
    option: 0,
  });
  assert.equal(canChat(s, solver(s)), true);
  assert.equal(canChat(s, forensicId(s)), false);
  assert.equal(canChat(s, "unknown"), false);
  assert.equal(canChat(s, roleId(s, "murderer")!, "criminals"), false);
});
test("1.9 presentation chat allows only current speaker; solve locks all public chat", () => {
  let s = presentations(investigation());
  for (const p of s.players)
    assert.equal(canChat(s, p.id), p.id === presenterId(s));
  s = act(s, solver(s), { type: "startSolve" });
  assert.ok(s.players.every((p) => !canChat(s, p.id)));
});
test("1.9 reversal chat is private to murderer and accomplice", () => {
  const s = correctSolve(investigation());
  for (const p of s.players) {
    assert.equal(canChat(s, p.id), false);
    assert.equal(
      canChat(s, p.id, "criminals"),
      ["murderer", "accomplice"].includes(s.roles[p.id]!),
    );
  }
});
test("8 investigator projection excludes solution, secret roles, deck and PRNG", () => {
  const s = investigation();
  const before = structuredClone(s);
  const view = project(s, solver(s));
  const payload = JSON.stringify(view);
  for (const field of [
    "solution",
    "roles",
    "rng",
    "deck",
    "witnessCandidates",
    "murdererId",
    "accompliceId",
    "confirmed",
    "processedCommands",
  ])
    assert.equal(payload.includes(`"${field}":`), false, field);
  assert.equal(view.private.myRole, "investigator");
  assert.equal(view.forensicId, forensicId(s));
  assert.throws(() => project(s, "toString"), /UNKNOWN_PLAYER/);
  view.players[0]!.cards.splice(0);
  assert.deepEqual(s, before);
});
test("4.4 private choice creates no public projection signal for uninvolved players", () => {
  const before = tick(night(), 6_000);
  const after = select(before);
  assert.deepEqual(
    project(before, solver(before)),
    project(after, solver(after)),
  );
  assert.equal(after.version, before.version);
});
test("4.4 witness sees only shuffled pair after fixed witness boundary", () => {
  const s = select(night());
  const witness = roleId(s, "witness")!;
  assert.deepEqual(project(s, witness).private, { myRole: "witness" });
  const view = project(tick(s, s.nightStartedAt! + 28_000), witness);
  assert.deepEqual(
    new Set(view.private.witnessCandidates),
    new Set([roleId(s, "murderer"), roleId(s, "accomplice")]),
  );
  assert.equal(view.private.solution, undefined);
  assert.equal(view.private.murdererId, undefined);
  assert.equal(view.private.accompliceId, undefined);
});
test("8 privileged projections reveal only entitled intelligence", () => {
  const s = investigation();
  for (const role of ["forensic", "murderer", "accomplice"] as const) {
    const view = project(s, roleId(s, role)!);
    assert.deepEqual(view.private.solution, s.solution);
    assert.equal(view.private.murdererId, s.solution!.murdererId);
    assert.equal(view.revealedRoles, undefined);
  }
});
test("8 result reveals all roles and solution for reconstruction", () => {
  const s = correctSolve(investigation(6));
  const view = project(s, solver(s));
  assert.deepEqual(view.revealedRoles, s.roles);
  assert.deepEqual(view.solution, s.solution);
});

for (let n = 4; n <= 12; n++) {
  for (const scenario of ["solved", "exhausted", "final-round"] as const)
    test(`11 headless ${n} players ${scenario}`, () => {
      const result = simulate({ players: n, seed: `bots-${n}`, scenario });
      assert.equal(result.state.phase, "RESULT");
      assert.equal(
        result.winner,
        scenario === "solved" ? "investigators" : "criminals",
      );
      assert.ok(result.steps < 500);
    });
}
test("11 seeded scenario stress matrix across events and difficulties", () => {
  for (let seed = 0; seed < 20; seed++) {
    for (const n of [4, 6, 8, 12]) {
      for (const cardsPerKind of [3, 4, 5] as const) {
        const scenarios: Scenario[] = ["solved", "exhausted", "final-round"];
        if (n >= 8)
          scenarios.push("reversal-win", "reversal-loss", "reversal-timeout");
        for (const scenario of scenarios) {
          const result = simulate({
            players: n,
            seed: `stress-${seed}`,
            scenario,
            settings: { ...defaultSettings(n), cardsPerKind, events: true },
          });
          assert.equal(result.state.phase, "RESULT");
          assert.equal(
            result.winner,
            ["exhausted", "final-round", "reversal-win"].includes(scenario)
              ? "criminals"
              : "investigators",
          );
          assert.equal(result.state.tiles.length, 6);
        }
      }
    }
  }
});
