import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  reduce,
  expire,
  winningCells,
  five,
  traitCounts,
  score,
  gameView,
  player,
  maxMana,
  rollCost,
  rerollPrice,
} from "../shared/engine.js";
import { HEROES, HERO, TRAITS, ODDS, COPIES } from "../shared/data.js";
import type { Game, Stone, Unit, Action } from "../shared/types.js";
const names = [
  { id: "a", name: "하늘" },
  { id: "b", name: "바람" },
];
function setup() {
  const g = createGame(names, 1234, 0);
  g.phase = "turn";
  g.ply = 10;
  g.turn = g.players[0].id;
  g.deadline = 30000;
  g.players.forEach((p) => {
    p.mana = 20;
    p.gold = 100;
    p.level = 8;
  });
  return g;
}
function stone(
  g: Game,
  cell: number,
  owner: string,
  hero = "plain",
  extra: Partial<Stone> = {},
) {
  const h = HERO[hero];
  const s: Stone = {
    uid: `s${cell}`,
    hero,
    owner,
    star: 1,
    copies: h ? 1 : 0,
    paid: h?.cost || 0,
    placed: 0,
    protectedUntil: 0,
    sealedUntil: 0,
    shield: false,
    shieldRegen: 0,
    cooldown: 0,
    uses: 0,
    tokenUntil: 0,
    ...extra,
  };
  g.board[cell] = s;
  if (h) g.pool[hero]--;
  return s;
}
const ids = (g: Game) => [g.turn, g.players.find((p) => p.id !== g.turn)!.id];
function give(g: Game, id: string, hero: string, extra: Partial<Unit> = {}) {
  const u = {
    uid: `b${++g.serial}`,
    hero,
    star: 1,
    copies: 1,
    paid: HERO[hero].cost,
    ...extra,
  };
  player(g, id).bench.push(u);
  g.pool[hero]--;
  return u;
}
test("시드 재현 · 13×13 · 시작 선후공 보정", () => {
  const a = createGame(names, 934, 0),
    b = createGame(names, 934, 0);
  assert.deepEqual(a, b);
  assert.equal(a.board.length, 169);
  assert.equal(a.players[0].gold, 5);
  assert.equal(a.players[1].gold, 8);
  assert.equal(a.players[0].mana, 0);
  assert.equal(a.players[1].mana, 2);
  assert.equal(a.phase, "prep");
  assert.equal(a.deadline, 20000);
});
test("다섯 방향 경계·장목 및 착수 승리", () => {
  for (const [start, delta] of [
    [26, 1],
    [5, 13],
    [0, 14],
    [12, 12],
  ]) {
    let g = setup();
    const [id] = ids(g);
    for (let n = 0; n < 4; n++) stone(g, start + n * delta, id);
    g = reduce(g, id, { type: "place", cell: start + 4 * delta }, 0);
    assert.equal(g.winner, id);
    assert.equal(g.winLine.length, 5);
  }
  let g = setup();
  const [id] = ids(g);
  for (let n = 0; n < 6; n++) stone(g, 13 + n, id);
  assert.equal(five(g, id).length, 6);
  g = setup();
  for (const c of [11, 12, 13, 14, 15]) stone(g, c, g.turn);
  assert.equal(five(g, g.turn).length, 0);
});
test("착수 1회와 턴 소유 검증 · 순수 reducer 원본 보존", () => {
  const g = setup(),
    [id, enemy] = ids(g);
  assert.throws(() => reduce(g, enemy, { type: "place", cell: 84 }), /차례/);
  assert.throws(() => reduce(g, id, { type: "place", cell: 169 }), /교차점/);
  const before = structuredClone(g);
  const n = reduce(g, id, { type: "place", cell: 84 });
  assert.deepEqual(g, before);
  assert.throws(() => reduce(n, id, { type: "place", cell: 85 }), /이미 착수/);
  assert.throws(() => reduce(g, id, { type: "end" }), /돌을 한 개/);
  assert.equal(n.board[84]?.hero, "plain");
});
test("예고 1: 제거로 열린 승부처는 같은 턴 사용 불가 · 상대 반응 후 허용", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  stone(g, 0, id, "assassin");
  for (const c of [80, 81, 82, 83]) stone(g, c, id);
  stone(g, 84, enemy);
  g = reduce(g, id, { type: "skill", source: 0, target: 84 }, 0);
  assert.ok(player(g, id).barred[84] > g.ply);
  assert.throws(() => reduce(g, id, { type: "place", cell: 84 }), /예고 규칙/);
  g = reduce(g, id, { type: "place", cell: 30 }, 0);
  g = reduce(g, id, { type: "end" }, 0);
  g = reduce(g, enemy, { type: "place", cell: 50 }, 0);
  g = reduce(g, enemy, { type: "end" }, 0);
  g = reduce(g, id, { type: "ready" }, 0);
  g = reduce(g, enemy, { type: "ready" }, 0);
  g = reduce(g, id, { type: "place", cell: 84 }, 0);
  assert.equal(g.winner, id);
});
test("예고 2: 스킬로 만든 직접 5목은 다음 자기 턴 시작까지 유예", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  stone(g, 0, id, "illusionist");
  for (const c of [80, 81, 82, 83]) stone(g, c, id);
  stone(g, 84, enemy);
  stone(g, 97, id);
  g = reduce(
    g,
    id,
    { type: "skill", source: 0, target: 97, destination: 84 },
    0,
  );
  assert.equal(five(g, id).length, 5);
  assert.equal(g.phase, "turn");
  g = reduce(g, id, { type: "place", cell: 30 }, 0);
  g = reduce(g, id, { type: "end" }, 0);
  assert.equal(g.phase, "turn");
  g = reduce(g, enemy, { type: "place", cell: 50 }, 0);
  g = reduce(g, enemy, { type: "end" }, 0);
  g = reduce(g, id, { type: "ready" }, 0);
  g = reduce(g, enemy, { type: "ready" }, 0);
  assert.equal(g.winner, id);
  assert.match(g.reason, /예고/);
});
test("예고 3: 이기는 칸에 토큰·밀기 금지, 직접 방어 착수 허용", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  for (const c of [80, 81, 82, 83]) stone(g, c, enemy);
  stone(g, 0, id, "summoner");
  assert.ok(winningCells(g, enemy).includes(84));
  assert.throws(
    () => reduce(g, id, { type: "skill", source: 0, target: 84 }),
    /승부처/,
  );
  stone(g, 1, id, "ember");
  stone(g, 97, enemy);
  assert.throws(
    () =>
      reduce(g, id, { type: "skill", source: 1, target: 97, destination: 84 }),
    /승부처/,
  );
  g = reduce(g, id, { type: "place", cell: 84 });
  assert.equal(g.board[84]?.owner, id);
});
test("예고 4: 방금 둔 돌은 다음 상대 턴까지 제거·봉인·교환으로부터 보호", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  stone(g, 0, enemy, "assassin");
  g = reduce(g, id, { type: "place", cell: 84 }, 0);
  g = reduce(g, id, { type: "end" }, 0);
  assert.throws(
    () => reduce(g, enemy, { type: "skill", source: 0, target: 84 }, 0),
    /보호/,
  );
});
test("예고 5: 전설의 기사 추가 착수로 5목 완성 금지 · 한 턴 1스킬", () => {
  let g = setup();
  const [id] = ids(g);
  stone(g, 0, id, "legend");
  for (const c of [80, 81, 82, 83]) stone(g, c, id);
  assert.throws(
    () => reduce(g, id, { type: "skill", source: 0, target: 84 }),
    /5목/,
  );
  assert.equal(g.board[84], null);
  g = reduce(g, id, { type: "skill", source: 0, target: 100 });
  assert.ok(g.board[100]);
  assert.throws(
    () => reduce(g, id, { type: "skill", source: 0, target: 101 }),
    /모두 사용/,
  );
});
test("방패는 제거 1회 무효 · 봉인 라인 제외 · 토큰은 정령왕만 연결", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  stone(g, 0, id, "assassin");
  stone(g, 84, enemy, "guard", { shield: true });
  let next = reduce(g, id, { type: "skill", source: 0, target: 84 });
  assert.ok(next.board[84]);
  assert.equal(next.board[84]?.shield, false);
  g = setup();
  for (const c of [80, 81, 82, 83]) stone(g, c, g.turn);
  stone(g, 84, g.turn, "token", { tokenUntil: 30 });
  assert.equal(five(g, g.turn).length, 0);
  stone(g, 97, g.turn, "earthKing");
  assert.ok(five(g, g.turn).length);
  g.board[82]!.sealedUntil = 20;
  assert.equal(five(g, g.turn).length, 0);
});
test("시간 정지: 상대 스킬·마나 획득 정지, 직접 착수 허용", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  stone(g, 0, id, "timeLord");
  stone(g, 1, enemy, "timeThief");
  player(g, enemy).mana = 3;
  g = reduce(g, id, { type: "skill", source: 0 });
  g = reduce(g, id, { type: "place", cell: 84 });
  g = reduce(g, id, { type: "end" });
  assert.throws(
    () => reduce(g, enemy, { type: "skill", source: 1 }),
    /시간 정지/,
  );
  g = reduce(g, enemy, { type: "place", cell: 85 });
  g = reduce(g, enemy, { type: "end" });
  assert.equal(player(g, enemy).mana, 3);
});
test("준비는 양쪽 완료 시 조기 전환 · 라운드 정산 이자·XP", () => {
  let g = createGame(names, 55, 0);
  const [a, b] = g.players.map((p) => p.id);
  player(g, a).gold = 25;
  g = reduce(g, a, { type: "ready" }, 0);
  assert.equal(g.phase, "prep");
  g = reduce(g, b, { type: "ready" }, 0);
  g = reduce(g, a, { type: "place", cell: 84 }, 0);
  g = reduce(g, a, { type: "end" }, 0);
  g = reduce(g, b, { type: "place", cell: 85 }, 0);
  g = reduce(g, b, { type: "end" }, 0);
  assert.equal(g.round, 2);
  assert.equal(player(g, a).gold, 32);
  assert.equal(player(g, a).level, 3);
  assert.equal(player(g, a).xp, 2);
  assert.equal(player(g, a).mana, 2);
});
test("공유 풀 보존 · 상점 리롤 반환 · ★2/★3 합성 · 판매 총액", () => {
  let g = createGame(names, 12, 0);
  const p = g.players[0],
    id = p.id;
  p.gold = 100;
  for (const h of p.shop) if (h) g.pool[h]++;
  p.shop = ["guard", "guard", "guard", null, null];
  g.pool.guard -= 3;
  for (const slot of [0, 1, 2]) g = reduce(g, id, { type: "buy", slot });
  assert.equal(player(g, id).bench.length, 1);
  assert.equal(player(g, id).bench[0].star, 2);
  assert.equal(player(g, id).bench[0].copies, 3);
  const uid = player(g, id).bench[0].uid;
  const gold = player(g, id).gold;
  g = reduce(g, id, { type: "sell", uid });
  assert.equal(player(g, id).gold, gold + 3);
  for (const h of HEROES) {
    let count =
      g.pool[h.id] +
      g.players.reduce(
        (n, p) =>
          n +
          p.shop.filter((x) => x === h.id).length +
          p.bench
            .filter((u) => u.hero === h.id)
            .reduce((m, u) => m + u.copies, 0),
        0,
      );
    assert.equal(count, COPIES[h.cost]);
  }
  const snapshot = structuredClone(g);
  g = reduce(g, id, { type: "reroll" });
  assert.equal(player(g, id).gold, player(snapshot, id).gold - 2);
});
test("상점 레벨별 확률, 24명 로스터·특성 도달·가치/마나 상한 검증", () => {
  assert.equal(HEROES.length, 24);
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((c) => HEROES.filter((h) => h.cost === c).length),
    [7, 6, 5, 4, 2],
  );
  const budget = [0, 2, 3.5, 5, 7, 9],
    manaCap = [0, 2, 4, 5, 5, 7];
  for (const h of HEROES) {
    assert.ok(h.value <= budget[h.cost] * 1.1, h.name);
    assert.ok(h.mana <= manaCap[h.cost], h.name);
  }
  for (const t of Object.keys(TRAITS) as (keyof typeof TRAITS)[]) {
    assert.ok(
      HEROES.filter((h) => h.traits.includes(t)).length >=
        TRAITS[t].steps.at(-1)!,
    );
  }
  const g = setup();
  for (const [level, odds] of Object.entries(ODDS)) {
    assert.equal(
      odds.reduce((a, b) => a + b),
      100,
    );
    const counts = [0, 0, 0, 0, 0];
    for (let n = 0; n < 100000; n++) counts[rollCost(g, Number(level)) - 1]++;
    for (let i = 0; i < 5; i++)
      assert.ok(
        Math.abs(counts[i] / 1000 - odds[i]) < 1,
        `Lv${level} ${i + 1}코`,
      );
  }
});
test("특성은 고유 석혼, 봉인 제외 · 용병대장 군단 2명", () => {
  const g = setup();
  const id = g.turn;
  stone(g, 0, id, "guard");
  stone(g, 1, id, "guard");
  stone(g, 2, id, "captain");
  assert.equal(traitCounts(g, id).guardian, 1);
  assert.equal(traitCounts(g, id).legion, 3);
  g.board[2]!.sealedUntil = 20;
  assert.equal(traitCounts(g, id).legion, 1);
});
test("상단 계열 수입 +4 제한 · 리롤 할인", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  for (const [c, h] of [
    [0, "pickpocket"],
    [1, "dealer"],
    [2, "captain"],
    [3, "tycoon"],
  ] as const)
    stone(g, c, id, h);
  assert.equal(rerollPrice(g, player(g, id)), 0);
  player(g, id).merchantGold = 3;
  const u = give(g, id, "pickpocket");
  g = reduce(g, id, { type: "place", cell: 50, uid: u.uid });
  assert.equal(player(g, id).merchantGold, 4);
  g = reduce(g, id, { type: "end" });
  g = reduce(g, enemy, { type: "place", cell: 52 });
  const before = player(g, id).gold;
  g = reduce(g, enemy, { type: "end" });
  assert.equal(player(g, id).gold - before, 10);
});
test("증강: 후공 최초 후보 4개 · 비상금 반영 · 비공개 view", () => {
  let g = setup();
  g.round = 2;
  const [id, enemy] = ids(g);
  player(g, id).placed = true;
  g = reduce(g, id, { type: "end" }, 0);
  g = reduce(g, enemy, { type: "place", cell: 85 }, 0);
  g = reduce(g, enemy, { type: "end" }, 0);
  assert.equal(g.phase, "augment");
  assert.equal(g.players[1].choices.length, 4);
  const second = g.players[1];
  assert.ok(second.choices.includes("cash"));
  const gold = second.gold;
  g = reduce(g, second.id, { type: "augment", id: "cash" }, 0);
  assert.equal(player(g, second.id).gold, gold + 8);
  const v = gameView(g, id);
  assert.equal("pool" in v, false);
  assert.equal("seed" in v, false);
  const other = v.players.find((p) => p.id !== id)!;
  assert.equal("shop" in other, false);
  assert.equal("bench" in other, false);
  assert.equal("choices" in other, false);
  assert.ok(v.players.find((p) => p.id === id)?.shop);
});
test("제단: 후공 우선 · 1-2-1 · 무료 획득 및 공유 풀 반환", () => {
  let g = setup();
  g.round = 3;
  const [id, enemy] = ids(g);
  player(g, id).placed = true;
  g = reduce(g, id, { type: "end" }, 0);
  g = reduce(g, enemy, { type: "place", cell: 85 }, 0);
  g = reduce(g, enemy, { type: "end" }, 0);
  assert.equal(g.phase, "altar");
  assert.deepEqual(g.altarOrder, [
    g.players[1].id,
    g.players[0].id,
    g.players[0].id,
    g.players[1].id,
  ]);
  const golds = g.players.map((p) => p.gold);
  for (let n = 0; n < 4; n++) {
    g = reduce(
      g,
      g.altarOrder[g.altarStep],
      { type: "altar", slot: g.altar.findIndex(Boolean) },
      0,
    );
  }
  assert.equal(g.phase, "prep");
  assert.deepEqual(
    g.players.map((p) => p.gold),
    golds,
  );
  assert.equal(
    g.players.reduce((n, p) => n + p.bench.length, 0),
    4,
  );
});
test("타임아웃 대리 착수는 4목 방어 우선 · 누적3회 기권", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  for (const c of [0, 1, 2, 3]) stone(g, c, enemy);
  g.deadline = 1;
  g = expire(g, 2);
  assert.equal(g.board[4]?.owner, id);
  assert.equal(player(g, id).timeouts, 1);
  g.turn = id;
  player(g, id).timeouts = 2;
  g.phase = "turn";
  g.deadline = 1;
  g = expire(g, 2);
  assert.equal(g.winner, enemy);
  assert.equal(g.phase, "result");
});
test("스킬 실패는 마나·상태를 변경하지 않음 · 잘못된 요청 거부", () => {
  const g = setup(),
    [id] = ids(g);
  stone(g, 0, id, "thunder");
  const before = structuredClone(g);
  assert.throws(() => reduce(g, id, { type: "skill", source: 0, target: 84 }));
  assert.deepEqual(g, before);
  assert.throws(() => reduce(g, id, { type: "buy", slot: -1 }), /준비/);
  assert.equal(maxMana(g.players[0]), 10);
});

test("밀기·교환·폭풍의 실제 좌표 변화 및 방패 처리", () => {
  let g = setup();
  let [id, enemy] = ids(g);
  stone(g, 0, id, "ember");
  stone(g, 84, enemy);
  g = reduce(g, id, { type: "skill", source: 0, target: 84, destination: 85 });
  assert.equal(g.board[84], null);
  assert.equal(g.board[85]?.owner, enemy);
  g = setup();
  [id, enemy] = ids(g);
  stone(g, 0, id, "illusionist");
  stone(g, 83, id);
  stone(g, 84, enemy, "guard", { shield: true });
  g = reduce(g, id, { type: "skill", source: 0, target: 83, destination: 84 });
  assert.equal(g.board[83]?.owner, id);
  assert.equal(g.board[84]?.shield, false);
  g = setup();
  [id, enemy] = ids(g);
  stone(g, 0, id, "storm");
  stone(g, 85, enemy);
  stone(g, 71, id);
  g = reduce(g, id, { type: "skill", source: 0, target: 84 });
  assert.equal(g.board[85], null);
  assert.equal(g.board[86]?.owner, enemy);
  assert.equal(g.board[58]?.owner, id);
});
test("심판자 봉인 · ★2 지속 증가 · ★3 범위/대상 확장", () => {
  let g = setup();
  let [id, enemy] = ids(g);
  stone(g, 0, id, "judge", { star: 2 });
  for (const c of [80, 81, 82]) stone(g, c, enemy);
  g = reduce(g, id, { type: "skill", source: 0, target: 81 });
  assert.equal(g.board[80]?.sealedUntil, g.ply + 4);
  assert.equal(score(g, enemy), 0);
  g = setup();
  [id, enemy] = ids(g);
  stone(g, 0, id, "thunder", { star: 3 });
  stone(g, 84, enemy);
  stone(g, 85, enemy);
  g = reduce(g, id, { type: "skill", source: 0, target: 84 });
  assert.ok(g.board[84]!.sealedUntil > g.ply);
  assert.ok(g.board[85]!.sealedUntil > g.ply);
});
test("토큰은 방패 대상 제외 · 봉인 지속/토큰 소멸을 복기에 저장", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  stone(g, 84, id, "knight");
  stone(g, 85, id, "token", { tokenUntil: 12 });
  g = reduce(g, id, { type: "skill", source: 84 });
  assert.equal(g.board[85]?.shield, false);
  g = reduce(g, id, { type: "place", cell: 0 });
  g = reduce(g, id, { type: "end" });
  g = reduce(g, enemy, { type: "place", cell: 10 });
  g = reduce(g, enemy, { type: "end" });
  assert.equal(g.board[85], null);
  assert.ok(
    g.frames.some((f) =>
      f.changes.some((c) => c.cell === 85 && c.stone === null),
    ),
  );
  const board: (Stone | null)[] = Array(169).fill(null); // Test fixture stones predate recorded frames; replay changes still include removals.
  for (const frame of g.frames)
    for (const change of frame.changes) board[change.cell] = change.stone;
  assert.equal(board[85], null);
});
test("12종 증강 효과 및 선택 요건", () => {
  for (const id of [
    "cash",
    "shields",
    "mana",
    "emblem",
    "interest",
    "chain",
    "level",
    "promote",
    "twins",
    "counter",
    "golden",
    "contract",
  ]) {
    let g = setup();
    const p = g.players[0];
    g.phase = "augment";
    g.round = 7;
    p.choices = [id];
    g.players[1].choices = ["cash"];
    stone(g, 84, p.id, "guard");
    give(g, p.id, "guard", { star: id === "twins" ? 2 : 1 });
    const gold = p.gold,
      level = p.level;
    if (id === "level") p.level = 5;
    g = reduce(g, p.id, { type: "augment", id, trait: "guardian" });
    const n = player(g, p.id);
    assert.ok(n.augments.includes(id));
    assert.equal(n.choices.length, 0);
    if (id === "cash") assert.equal(n.gold, gold + 8);
    if (id === "shields") assert.equal(n.shields, 3);
    if (id === "emblem") assert.equal(n.emblem, "guardian");
    if (id === "level") {
      assert.equal(n.level, 6);
      assert.equal(n.levelPenaltyUntil, 9);
    }
    if (id === "promote") assert.equal(n.bench[0].star, 2);
    if (id === "twins") assert.equal(n.bench[0].star, 3);
    if (id === "golden") assert.equal(n.goldenUntil, 11);
    if (id === "contract") {
      assert.equal(n.maxManaPenalty, 1);
      assert.equal(HERO[n.bench[1].hero].cost, 5);
    }
  }
});
test("반격 태세는 1회 · 4 시간술사는 양쪽 모두 4라운드마다 완충", () => {
  let g = setup();
  const [id, enemy] = ids(g);
  player(g, enemy).augments = ["counter"];
  stone(g, 80, id);
  stone(g, 81, id);
  g = reduce(g, id, { type: "place", cell: 82 });
  assert.equal(player(g, enemy).counterUsed, true);
  assert.ok(g.board[80]!.sealedUntil > g.ply);
  for (const index of [0, 1]) {
    g = setup();
    g.round = 4;
    const owner = g.players[index].id;
    g.turn = owner;
    const p = player(g, owner);
    p.mana = 0;
    p.placed = true;
    for (const [c, h] of [
      [0, "clock"],
      [1, "thunder"],
      [2, "watcher"],
      [3, "archmage"],
    ] as const)
      stone(g, c, owner, h);
    g = reduce(g, owner, { type: "end" });
    assert.equal(player(g, owner).mana, maxMana(player(g, owner)));
  }
});

test("5코 횟수 제한은 동일 석혼 여러 개에도 플레이어별 게임 전체 공유", () => {
  let g = setup();
  const [id] = ids(g);
  stone(g, 0, id, "legend");
  stone(g, 1, id, "legend");
  player(g, id).legendUses = 2;
  assert.throws(
    () => reduce(g, id, { type: "skill", source: 0, target: 80 }),
    /모두 사용/,
  );
  assert.throws(
    () => reduce(g, id, { type: "skill", source: 1, target: 80 }),
    /모두 사용/,
  );
  g = setup();
  stone(g, 0, id, "timeLord");
  stone(g, 1, id, "timeLord");
  g = reduce(g, id, { type: "skill", source: 0 });
  player(g, id).skills = 0;
  assert.throws(() => reduce(g, id, { type: "skill", source: 1 }), /이미 사용/);
});
test("12회째 리롤은 현재 레벨의 최고 코스트 석혼을 보장", () => {
  let g = setup();
  g.phase = "prep";
  const p = player(g, g.turn);
  p.rerolls = 11;
  g = reduce(g, p.id, { type: "reroll" });
  assert.equal(HERO[player(g, p.id).shop[0]!].cost, 5);
});
