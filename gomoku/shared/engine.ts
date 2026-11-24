import {
  HERO,
  HEROES,
  TACTICAL_HEROES,
  TACTICAL_RANGE,
  TRAITS,
  ODDS,
  XP,
  COPIES,
  AUGMENTS,
  AUGMENT,
  type Trait,
} from "./data.js";
import type { Action, Game, GameView, Player, Stone, Unit } from "./types.js";
export const SIZE = 13;
export const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];
const valid = (cell: number) =>
  Number.isInteger(cell) && cell >= 0 && cell < 169;
const xy = (cell: number) => [cell % 13, Math.floor(cell / 13)];
export const distance = (a: number, b: number) =>
  Math.max(
    Math.abs((a % 13) - (b % 13)),
    Math.abs(Math.floor(a / 13) - Math.floor(b / 13)),
  );
const coord = (x: number, y: number) =>
  x >= 0 && x < 13 && y >= 0 && y < 13 ? y * 13 + x : -1;
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(message);
}
export function random(g: Game) {
  let x = g.seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  g.seed = x >>> 0;
  return g.seed / 4294967296;
}
function pick<T>(g: Game, values: T[]): T {
  requireRule(values.length, "사용 가능한 후보가 없습니다.");
  return values[Math.floor(random(g) * values.length)];
}
function shuffle<T>(g: Game, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function event(
  g: Game,
  type: string,
  text: string,
  player?: string,
  cells?: number[],
) {
  g.events.push({
    id: ++g.serial,
    type,
    text,
    player,
    cells,
    round: g.round,
    ply: g.ply,
  });
  if (g.events.length > 150) g.events.shift();
}
export function player(g: Game, id: string) {
  const p = g.players.find((p) => p.id === id);
  requireRule(p, "플레이어를 찾을 수 없습니다.");
  return p;
}
export function opponent(g: Game, id: string) {
  return g.players.find((p) => p.id !== id)!;
}
export function maxMana(p: Pick<Player, "level" | "maxManaPenalty">) {
  return p.level + 2 - p.maxManaPenalty;
}
function mana(p: Player, n: number) {
  p.mana = Math.max(0, Math.min(maxMana(p), p.mana + n));
}
export function traitCounts(
  g: Game,
  id: string,
): Partial<Record<Trait, number>> {
  const counts: Partial<Record<Trait, number>> = {};
  if (g.ruleset === "focused") return counts;
  const seen = new Set<string>();
  for (const s of g.board) {
    if (
      !s ||
      s.owner !== id ||
      s.tokenUntil ||
      s.sealedUntil > g.ply ||
      !HERO[s.hero] ||
      seen.has(s.hero)
    )
      continue;
    seen.add(s.hero);
    for (const t of HERO[s.hero].traits) counts[t] = (counts[t] || 0) + 1;
    if (s.hero === "captain") counts.legion = (counts.legion || 0) + 1;
  }
  const p = player(g, id);
  if (p.emblem && (counts[p.emblem] || 0) > 0)
    counts[p.emblem] = (counts[p.emblem] || 0) + 1;
  return counts;
}
const has = (g: Game, id: string, t: Trait, n: number) =>
  (traitCounts(g, id)[t] || 0) >= n;
const activeStones = (g: Game, id: string, hero?: string) =>
  g.board
    .map((s, i) => ({ s, i }))
    .filter(
      (o): o is { s: Stone; i: number } =>
        !!o.s &&
        o.s.owner === id &&
        o.s.sealedUntil <= g.ply &&
        (!hero || o.s.hero === hero),
    );
function connects(g: Game, cell: number, id: string) {
  const s = g.board[cell];
  if (!s || s.owner !== id || s.sealedUntil > g.ply) return false;
  if (!s.tokenUntil) return true;
  return activeStones(g, id, "earthKing").some((o) => distance(cell, o.i) <= 1);
}
export function lineAt(g: Game, cell: number, id: string): number[] {
  if (!connects(g, cell, id)) return [];
  const [x, y] = xy(cell);
  for (const [dx, dy] of DIRS) {
    const line = [cell];
    for (const sign of [-1, 1]) {
      for (let k = 1; k < 13; k++) {
        const c = coord(x + dx * k * sign, y + dy * k * sign);
        if (c < 0 || !connects(g, c, id)) break;
        line.push(c);
      }
    }
    if (line.length >= 5) return line.sort((a, b) => a - b);
  }
  return [];
}
export function five(g: Game, id: string) {
  for (let c = 0; c < 169; c++) {
    const l = lineAt(g, c, id);
    if (l.length) return l;
  }
  return [];
}
export function winningCells(g: Game, id: string) {
  const result: number[] = [];
  for (let c = 0; c < 169; c++) {
    if (g.board[c]) continue;
    g.board[c] = makeStone(g, id, null);
    if (lineAt(g, c, id).length) result.push(c);
    g.board[c] = null;
  }
  return result;
}
export function threatLines(g: Game, id: string) {
  const lines: { cells: number[]; open: number; size: number }[] = [];
  for (let c = 0; c < 169; c++) {
    if (!connects(g, c, id)) continue;
    const [x, y] = xy(c);
    for (const [dx, dy] of DIRS) {
      const prev = coord(x - dx, y - dy);
      if (prev >= 0 && connects(g, prev, id)) continue;
      const cells = [c];
      let k = 1;
      while (true) {
        const n = coord(x + dx * k, y + dy * k);
        if (n < 0 || !connects(g, n, id)) break;
        cells.push(n);
        k++;
      }
      const end = coord(x + dx * k, y + dy * k);
      const open =
        Number(prev >= 0 && !g.board[prev]) + Number(end >= 0 && !g.board[end]);
      if (cells.length >= 3) lines.push({ cells, open, size: cells.length });
    }
  }
  return lines;
}
export function score(g: Game, id: string) {
  return threatLines(g, id).reduce(
    (n, l) =>
      n +
      ((l.size === 3 && l.open === 2) || (l.size === 4 && l.open >= 1) ? 2 : 0),
    0,
  );
}
function updateTension(g: Game) {
  const lines = g.players.flatMap((p) => threatLines(g, p.id));
  g.tension = Math.min(
    1,
    0.15 * lines.filter((l) => l.size === 3 && l.open === 2).length +
      0.4 * Number(lines.some((l) => l.size >= 4)) +
      0.1 * Number(g.players.some((p) => p.mana === maxMana(p))),
  );
}
function makeStone(g: Game, id: string, u: Unit | null): Stone {
  return {
    ...(u || {
      uid: `plain-${g.ply}-${id}`,
      hero: "plain",
      star: 1,
      copies: 0,
      paid: 0,
    }),
    owner: id,
    placed: g.ply,
    protectedUntil: g.ply + 1,
    sealedUntil: 0,
    shield: false,
    shieldRegen: 0,
    cooldown: 0,
    uses: 0,
    tokenUntil: 0,
  };
}
function finish(
  g: Game,
  winner: string | null,
  reason: string,
  line: number[] = [],
) {
  g.phase = "result";
  g.winner = winner;
  g.reason = reason;
  g.winLine = line;
  g.deadline = 0;
  event(
    g,
    "FINAL_MOVE",
    winner ? `${player(g, winner).name} 승리 · ${reason}` : reason,
    winner || undefined,
    line,
  );
}
function merchantGold(g: Game, p: Player, n: number) {
  const value = Math.min(4 - p.merchantGold, n);
  p.gold += value;
  p.merchantGold += value;
}
function newUnit(g: Game, id: string, copies = 1, paid = HERO[id].cost): Unit {
  return { uid: `u${++g.serial}`, hero: id, star: 1, copies, paid };
}
function merge(g: Game, p: Player) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const h of HEROES) {
      for (
        let star = 1;
        star <= (h.cost === 1 ? 2 : h.cost === 5 ? 0 : 1);
        star++
      ) {
        const list = p.bench.filter((u) => u.hero === h.id && u.star === star);
        if (list.length < 3) continue;
        const selected = list.slice(0, 3);
        p.bench = p.bench.filter((u) => !selected.includes(u));
        const u = {
          ...selected[0],
          star: star + 1,
          copies: selected.reduce((n, u) => n + u.copies, 0),
          paid: selected.reduce((n, u) => n + u.paid, 0),
        };
        p.bench.push(u);
        event(
          g,
          "MERGE",
          `${p.name} · ${h.name} ${"★".repeat(u.star)} 합성`,
          p.id,
        );
        changed = true;
      }
    }
  }
}
function canReceive(p: Player, id: string) {
  return (
    p.bench.length < 9 ||
    (HERO[id].cost < 5 &&
      p.bench.filter((u) => u.hero === id && u.star === 1).length >= 2)
  );
}
function receive(g: Game, p: Player, id: string, paid = HERO[id].cost) {
  requireRule(g.ruleset === "focused" ? p.bench.length < 6 : canReceive(p, id), "벤치가 가득 찼습니다. 먼저 판매해 주세요.");
  p.bench.push(newUnit(g, id, 1, paid));
  if (g.ruleset !== "focused") merge(g, p);
}
function draw(g: Game, cost: number) {
  const available = HEROES.filter(
    (h) => h.cost === cost && (g.pool[h.id] || 0) > 0,
  );
  if (!available.length) return null;
  let total = available.reduce((n, h) => n + g.pool[h.id], 0),
    r = random(g) * total;
  for (const h of available) {
    r -= g.pool[h.id];
    if (r < 0) {
      g.pool[h.id]--;
      return h.id;
    }
  }
  return null;
}
export function rollCost(g: Game, level: number) {
  let r = random(g) * 100;
  const odds = ODDS[level];
  for (let i = 0; i < 5; i++) {
    r -= odds[i];
    if (r < 0) return i + 1;
  }
  return 1;
}
function highest(p: Player) {
  return ODDS[p.level].reduce((n, v, i) => (v ? i + 1 : n), 1);
}
function rollShop(g: Game, p: Player, guarantee = false) {
  for (const id of p.shop) if (id) g.pool[id]++;
  p.shop = [];
  for (let i = 0; i < 5; i++) {
    const cost =
      i === 0 && (guarantee || p.goldenUntil >= g.round)
        ? highest(p)
        : rollCost(g, p.level);
    let id = draw(g, cost);
    if (!id) {
      for (let c = cost - 1; c >= 1 && !id; c--) id = draw(g, c);
    }
    p.shop.push(id);
  }
}
function levelUp(p: Player) {
  while (p.level < 8 && p.xp >= XP[p.level + 1]) p.level++;
  mana(p, 0);
}
function choiceList(g: Game, p: Player) {
  let tier = g.round === 3 ? 1 : g.round === 7 ? 2 : 3;
  const candidates = shuffle(
    g,
    AUGMENTS.filter((a) => a.tier === tier).map((a) => a.id),
  );
  const count = g.round === 3 && p.id === g.players[1].id ? 4 : 3;
  const result = candidates.slice(0, count);
  if (score(g, p.id) < score(g, opponent(g, p.id).id) && tier < 3) {
    const higher = pick(
      g,
      AUGMENTS.filter((a) => a.tier === tier + 1),
    );
    result[result.length - 1] = higher.id;
  }
  if (new Set(result.map((id) => AUGMENT[id].category)).size < 2) {
    const replacement = candidates.find(
      (id) =>
        !result.includes(id) &&
        AUGMENT[id].category !== AUGMENT[result[0]].category,
    );
    if (replacement) result[0] = replacement;
  }
  return result;
}
function startPrep(g: Game, now: number) {
  g.phase = "prep";
  g.deadline = now + g.prepSeconds * 1000;
  g.players.forEach((p) => (p.ready = false));
  event(g, "PREP", `제 ${g.round} 라운드 · 준비`);
}
function startRound(g: Game, now: number) {
  if (g.ruleset === "focused") {
    if ((g.round - 1) % 4 !== 0) {
      beginTurn(g, g.players[0], now);
      return;
    }
    for (const p of g.players) {
      for (const id of p.shop) if (id) g.pool[id]++;
      p.shop = TACTICAL_HEROES.map((id) => {
        if (g.pool[id] <= 0) return null;
        g.pool[id]--;
        return id;
      });
      if (g.round > 1) p.gold += 4;
    }
    event(g, "SUPPLY", "보급 · 보호, 밀기, 봉인 중 다음 공격에 필요한 돌을 고르세요.");
    startPrep(g, now);
    return;
  }
  g.players.forEach((p) => {
    p.merchantGold = 0;
    p.roundRerolls = 0;
    p.ready = false;
    rollShop(g, p);
  });
  event(
    g,
    "ROUND_START",
    g.round === 5
      ? "제2막 · 격돌"
      : g.round === 11
        ? "제3막 · 결전"
        : `제 ${g.round} 라운드`,
  );
  if ([3, 7, 11].includes(g.round)) {
    g.phase = "augment";
    g.deadline = now + 20000;
    g.players.forEach((p) => {
      p.choices = choiceList(g, p);
      p.augmentRerolls = 1 + Number(has(g, p.id, "merchant", 4));
    });
    event(g, "AUGMENT_START", "별의 힘이 내려옵니다. 증강을 선택하세요.");
  } else if ([4, 8, 12].includes(g.round)) {
    g.phase = "altar";
    g.deadline = now + 15000;
    const tier = g.round / 4;
    g.altar = Array.from({ length: 4 }, () =>
      draw(g, tier + (random(g) < 0.5 ? 0 : 1)),
    );
    const a =
      score(g, g.players[0].id) < score(g, g.players[1].id)
        ? g.players[0]
        : g.players[1];
    const b = opponent(g, a.id);
    g.altarOrder = [a.id, b.id, b.id, a.id];
    g.altarStep = 0;
    event(g, "ALTAR_START", "운명의 제단 · 뒤진 대국자부터 선택합니다.");
    skipEmptyAltar(g, now);
  } else startPrep(g, now);
}
export function createGame(
  names: { id: string; name: string }[],
  seed = Date.now(),
  now = Date.now(),
  settings: { prepSeconds: number; turnSeconds: number; ruleset?: "classic" | "focused" } = { prepSeconds: 20, turnSeconds: 30 },
): Game {
  requireRule(names.length === 2, "대국에는 두 명이 필요합니다.");
  const g: Game = {
    seed: seed >>> 0 || 1,
    serial: 0,
    players: [],
    board: Array(169).fill(null),
    pool: Object.fromEntries(HEROES.map((h) => [h.id, COPIES[h.cost]])),
    phase: "prep",
    round: 1,
    ply: 0,
    turn: "",
    deadline: 0,
    ruleset: "classic",
    ...settings,
    altar: [],
    altarOrder: [],
    altarStep: 0,
    winner: null,
    reason: "",
    winLine: [],
    events: [],
    frames: [],
    replayEnabled: true,
    history: [],
    tension: 0,
  };
  const seats = shuffle(g, [...names]);
  g.players = seats.map((n, i) => ({
    ...n,
    gold: i === 0 ? 5 : 8,
    xp: 0,
    level: 2,
    mana: i === 0 ? 0 : 2,
    bench: [],
    shop: [],
    augments: [],
    choices: [],
    augmentRerolls: 0,
    emblem: null,
    shields: 0,
    shieldUsed: false,
    ready: false,
    placed: false,
    skills: 0,
    casts: 0,
    timeouts: 0,
    merchantGold: 0,
    rerolls: 0,
    roundRerolls: 0,
    frozenUntil: -1,
    levelPenaltyUntil: 0,
    goldenUntil: 0,
    maxManaPenalty: 0,
    legendUses: 0,
    timeLordUsed: false,
    counterUsed: false,
    assassinUsed: false,
    barred: {},
  }));
  if (g.ruleset === "focused") {
    for (const p of g.players) {
      p.gold = 3;
      p.mana = 4;
      for (const id of TACTICAL_HEROES) {
        g.pool[id]--;
        receive(g, p, id, 0);
      }
    }
  }
  g.turn = g.players[0].id;
  event(
    g,
    "COIN",
    g.ruleset === "focused" ? `${g.players[0].name} 선공 · 양쪽 모두 보호·밀기·봉인 석혼으로 시작합니다.` : `금화는 ${g.players[0].name}에게. 흑석 선공 · 백석 후공 보정 +3골드 / +2마나`,
  );
  startRound(g, now);
  return g;
}
function alliedNeighbors(g: Game, c: number, id: string) {
  return activeStones(g, id).filter((o) => o.i !== c && distance(c, o.i) <= 1);
}
function breakShield(g: Game, s: Stone) {
  s.shield = false;
  s.shieldRegen = g.ply + 3;
  if (has(g, s.owner, "guardian", 6)) mana(player(g, s.owner), 2);
}
function protectedStone(g: Game, s: Stone) {
  return s.protectedUntil >= g.ply;
}
function seal(g: Game, c: number, turns: number, ignoreProtection = false) {
  const s = g.board[c];
  if (!s || (!ignoreProtection && protectedStone(g, s))) return false;
  if (s.shield) {
    breakShield(g, s);
    return true;
  }
  if (
    HERO[s.hero]?.traits.includes("legion") &&
    has(g, s.owner, "legion", 2) &&
    alliedNeighbors(g, c, s.owner).length >= 2
  )
    return false;
  s.sealedUntil = g.ply + turns + 1;
  event(
    g,
    "SEAL_APPLIED",
    `${player(g, s.owner).name}의 돌이 ${turns}턴 봉인됩니다.`,
    s.owner,
    [c],
  );
  return true;
}
function remove(g: Game, c: number) {
  const s = g.board[c];
  if (!s || protectedStone(g, s)) return false;
  if (s.shield) {
    breakShield(g, s);
    return true;
  }
  g.pool[s.hero] = (g.pool[s.hero] || 0) + s.copies;
  g.board[c] = null;
  event(g, "REMOVE", "석혼이 가루로 흩어집니다.", s.owner, [c]);
  return true;
}
function winningBefore(g: Game) {
  return Object.fromEntries(
    g.players.map((p) => [p.id, new Set(winningCells(g, p.id))]),
  );
}
function telegraph(g: Game, before: Record<string, Set<number>>) {
  for (const p of g.players) {
    const newly = winningCells(g, p.id).filter((c) => !before[p.id].has(c));
    for (const c of newly) p.barred[c] = g.ply + 2;
    if (newly.length)
      event(
        g,
        "TELEGRAPH",
        "예고 · 새로 열린 승부처는 상대 반응 후 사용할 수 있습니다.",
        p.id,
        newly,
      );
  }
}
function safeDestination(g: Game, c: number) {
  return (
    valid(c) &&
    !g.board[c] &&
    !g.players.some((p) => winningCells(g, p.id).includes(c))
  );
}
function spawn(g: Game, p: Player, c: number, turns: number) {
  requireRule(safeDestination(g, c), "승부처에는 토큰을 소환할 수 없습니다.");
  const s = makeStone(g, p.id, null);
  s.uid = `token-${++g.serial}`;
  s.hero = "token";
  s.tokenUntil = g.ply + turns + Number(has(g, p.id, "spirit", 2)) + 1;
  s.protectedUntil = -1;
  g.board[c] = s;
  event(g, "TOKEN", "정령 토큰 소환", p.id, [c]);
}
function push(g: Game, source: number, destination: number) {
  const s = g.board[source];
  if (!s || protectedStone(g, s) || !safeDestination(g, destination))
    return false;
  if (s.shield) {
    breakShield(g, s);
    return true;
  }
  g.board[destination] = s;
  g.board[source] = null;
  event(g, "PUSH", "충격파가 돌을 밀어냅니다.", s.owner, [source, destination]);
  return true;
}
function passiveShields(g: Game) {
  for (const p of g.players) {
    for (const { s, i } of activeStones(g, p.id)) {
      if (s.tokenUntil) continue;
      const guardian =
        HERO[s.hero]?.traits.includes("guardian") &&
        has(g, p.id, "guardian", 2);
      const fortress = activeStones(g, p.id, "fortress").some(
        (o) => distance(i, o.i) <= 1 && o.i !== i,
      );
      if (guardian && !s.guardianGift) {
        s.shield = true;
        s.guardianGift = true;
      }
      if (
        (fortress || (guardian && has(g, p.id, "guardian", 4))) &&
        !s.shield &&
        s.shieldRegen <= g.ply
      ) {
        s.shield = true;
      }
    }
  }
}
function deploy(g: Game, p: Player, c: number, s: Stone) {
  const h = HERO[s.hero];
  if (!h) return;
  const scale = s.star >= 2 ? 1.5 : 1;
  switch (h.op) {
    case "shieldNeighbor": {
      const near = alliedNeighbors(g, c, p.id).filter(o => g.ruleset !== "focused" || (!o.s.shield && !o.s.tokenUntil)).slice(0, s.star >= 3 ? 2 : 1);
      near.filter((o) => !o.s.tokenUntil).forEach((o) => (o.s.shield = true));
      break;
    }
    case "gold":
      merchantGold(g, p, Math.ceil(scale));
      break;
    case "smoke": {
      const blanks = Array.from({ length: 169 }, (_, i) => i).filter(
        (i) => distance(i, c) <= 2 && safeDestination(g, i),
      );
      if (blanks.length) {
        const first = pick(g, blanks);
        spawn(g, p, first, Math.ceil(2 * scale));
        if (s.star >= 3) {
          const second = blanks.find(
            (i) => i !== first && safeDestination(g, i),
          );
          if (second !== undefined) spawn(g, p, second, Math.ceil(2 * scale));
        }
      }
      break;
    }
    case "breakShield":
      activeStones(g, opponent(g, p.id).id)
        .filter(
          (o) => distance(c, o.i) <= 1 && o.s.shield && !protectedStone(g, o.s),
        )
        .slice(0, s.star >= 3 ? 2 : 1)
        .forEach((o) => breakShield(g, o.s));
      break;
  }
  passiveShields(g);
}
function counter(g: Game, actor: Player) {
  const other = opponent(g, actor.id);
  if (!other.augments.includes("counter") || other.counterUsed) return;
  const line = threatLines(g, actor.id).find(
    (l) => (l.size === 3 && l.open === 2) || l.size >= 4,
  );
  if (line) {
    other.counterUsed = true;
    const target =
      line.cells.find((c) => g.board[c]!.protectedUntil < g.ply) ??
      line.cells[0];
    seal(g, target, 1, true);
    event(g, "COUNTER", "반격 태세 · 즉시 봉인", other.id, [target]);
  }
}
function place(g: Game, p: Player, a: Extract<Action, { type: "place" }>) {
  requireRule(!p.placed, "이번 턴에는 이미 착수했습니다.");
  requireRule(valid(a.cell) && !g.board[a.cell], "빈 교차점을 선택하세요.");
  requireRule(
    !(p.barred[a.cell] > g.ply),
    "예고 규칙: 상대의 반응이 지난 다음 턴부터 착수할 수 있습니다.",
  );
  let u: Unit | null = null;
  if (a.uid) {
    const index = p.bench.findIndex((u) => u.uid === a.uid);
    requireRule(index >= 0, "선택한 석혼이 벤치에 없습니다.");
    u = p.bench.splice(index, 1)[0];
  }
  const s = makeStone(g, p.id, u);
  g.board[a.cell] = s;
  p.placed = true;
  g.history.push({ round: g.round, player: p.id, cell: a.cell, hero: s.hero });
  event(
    g,
    "PLACE_STONE",
    `${p.name} · ${String.fromCharCode(65 + (a.cell % 13))}${13 - Math.floor(a.cell / 13)} ${HERO[s.hero]?.name || "플레인 스톤"}`,
    p.id,
    [a.cell],
  );
  const winning = lineAt(g, a.cell, p.id);
  counter(g, p);
  if (winning.length && lineAt(g, a.cell, p.id).length) {
    finish(g, p.id, "다섯 개의 돌이 하나의 선을 이었습니다.", winning);
    return;
  }
  if (HERO[s.hero]) {
    const before = winningBefore(g);
    deploy(g, p, a.cell, s);
    telegraph(g, before);
  } else passiveShields(g);
  if (!g.board.some((c) => !c))
    finish(g, null, "보드가 가득 찼습니다. 무승부입니다.");
}
export function skillCost(g: Game, p: Player, s: Stone, target?: number) {
  const h = HERO[s.hero];
  if (!h) return 99;
  if (has(g, p.id, "mage", 6) && (p.casts + 1) % 3 === 0) return 0;
  let n = h.mana - Number(has(g, p.id, "mage", 4)) + Number(p.skills > 0);
  if (
    valid(target ?? -1) &&
    activeStones(g, opponent(g, p.id).id, "watcher").some(
      (o) => distance(o.i, target!) <= 2,
    )
  )
    n++;
  return Math.max(1, n);
}
function cast(g: Game, p: Player, a: Extract<Action, { type: "skill" }>) {
  requireRule(valid(a.source), "스킬을 사용할 석혼을 선택하세요.");
  const s = g.board[a.source];
  requireRule(
    s && s.owner === p.id && s.sealedUntil <= g.ply,
    "봉인되지 않은 아군 석혼을 선택하세요.",
  );
  const h = HERO[s.hero];
  requireRule(h?.type === "active", "액티브 스킬이 없는 돌입니다.");
  requireRule(p.frozenUntil < g.ply, "시간 정지 중에는 스킬을 쓸 수 없습니다.");
  requireRule(
    p.skills < (p.augments.includes("chain") ? 2 : 1),
    "이번 턴의 스킬을 모두 사용했습니다.",
  );
  const ignore =
    s.cooldown > 0 && has(g, p.id, "assassin", 4) && !p.assassinUsed;
  requireRule(!s.cooldown || ignore, "아직 쿨다운 중입니다.");
  requireRule(
    h.op !== "extra" || p.legendUses < 2,
    "추가 착수를 모두 사용했습니다.",
  );
  requireRule(
    h.op !== "freeze" || !p.timeLordUsed,
    "시간 정지를 이미 사용했습니다.",
  );
  const c = a.target ?? -1;
  const t = valid(c) ? g.board[c] : null;
  if (g.ruleset === "focused" && TACTICAL_RANGE[s.hero]) {
    requireRule(valid(c) && distance(a.source, c) <= TACTICAL_RANGE[s.hero], `이 석혼의 스킬은 주변 ${TACTICAL_RANGE[s.hero]}칸 안에서 사용할 수 있습니다.`);
  }
  const cost = skillCost(g, p, s, c);
  requireRule(p.mana >= cost, `마나가 부족합니다. 필요 마나 ${cost}`);
  const before = winningBefore(g);
  const scale = s.star >= 2 ? 1.5 : 1;
  const turns = Math.ceil(2 * scale);
  if (["push", "seal", "remove", "judge"].includes(h.op)) {
    requireRule(t && t.owner !== p.id, "상대 돌을 선택하세요.");
    requireRule(!protectedStone(g, t), "방금 둔 돌은 상대 턴 동안 보호됩니다.");
  }
  switch (h.op) {
    case "push":
      requireRule(
        valid(a.destination ?? -1) && distance(c, a.destination!) <= 1,
        "대상과 인접한 도착 칸을 선택하세요.",
      );
      requireRule(
        push(g, c, a.destination!),
        "승부처 또는 빈 칸이 아닌 곳으로 밀 수 없습니다.",
      );
      break;
    case "shieldAll":
      activeStones(g, p.id)
        .filter(
          (o) =>
            !o.s.tokenUntil &&
            o.i !== a.source &&
            distance(a.source, o.i) <= (s.star >= 3 ? 2 : 1),
        )
        .forEach((o) => (o.s.shield = true));
      break;
    case "seal": {
      requireRule(seal(g, c, turns), "해당 돌은 봉인 면역입니다.");
      if (s.star >= 3) {
        const extra = activeStones(g, opponent(g, p.id).id).find(
          (o) => o.i !== c && distance(c, o.i) <= 1 && !protectedStone(g, o.s),
        );
        if (extra) seal(g, extra.i, turns);
      }
      break;
    }
    case "remove": {
      requireRule(remove(g, c), "해당 돌은 제거할 수 없습니다.");
      if (s.star >= 3) {
        const extra = activeStones(g, opponent(g, p.id).id).find(
          (o) => o.i !== c && distance(c, o.i) <= 1 && !protectedStone(g, o.s),
        );
        if (extra) remove(g, extra.i);
      }
      break;
    }
    case "swap": {
      requireRule(t && t.owner === p.id, "교환할 아군 돌을 먼저 선택하세요.");
      const d = a.destination ?? -1;
      const enemy = valid(d) ? g.board[d] : null;
      requireRule(enemy && enemy.owner !== p.id, "교환할 적 돌을 선택하세요.");
      requireRule(
        distance(c, d) <=
          3 + Number(has(g, p.id, "illusion", 2)) + Number(s.star >= 3),
        "교환 사거리 밖입니다.",
      );
      requireRule(
        !protectedStone(g, t) && !protectedStone(g, enemy),
        "착수 보호 중인 돌은 교환할 수 없습니다.",
      );
      if (t.shield) breakShield(g, t);
      else if (enemy.shield) breakShield(g, enemy);
      else [g.board[c], g.board[d]] = [g.board[d], g.board[c]];
      break;
    }
    case "token":
      spawn(g, p, c, Math.ceil(3 * scale));
      if (s.star >= 3) {
        const extra = Array.from({ length: 169 }, (_, i) => i).find(
          (i) => distance(c, i) <= 1 && safeDestination(g, i),
        );
        if (extra !== undefined) spawn(g, p, extra, Math.ceil(3 * scale));
      }
      break;
    case "storm": {
      requireRule(valid(c), "폭풍의 중심을 선택하세요.");
      const [x, y] = xy(c);
      const moves = g.board
        .map((s, i) => ({ s, i }))
        .filter(
          (o) => o.s && distance(c, o.i) <= (s.star >= 3 ? 2 : 1) && o.i !== c,
        );
      for (const o of moves) {
        const [tx, ty] = xy(o.i);
        const d = coord(tx + Math.sign(tx - x), ty + Math.sign(ty - y));
        if (d >= 0) push(g, o.i, d);
      }
      break;
    }
    case "stealMana":
      mana(opponent(g, p.id), -Math.ceil(2 * scale));
      break;
    case "judge": {
      const line = threatLines(g, t!.owner).find(
        (l) =>
          l.cells.includes(c) &&
          ((l.size === 3 && l.open === 2) || l.size >= 4),
      );
      requireRule(line, "열린 3 이상인 상대 라인을 선택하세요.");
      requireRule(
        line.cells.some((c) => !protectedStone(g, g.board[c]!)),
        "보호 중인 라인입니다.",
      );
      line.cells.forEach((c) => seal(g, c, turns));
      break;
    }
    case "extra": {
      requireRule(valid(c) && !g.board[c], "추가 착수할 빈 칸을 선택하세요.");
      requireRule(
        !(p.barred[c] > g.ply),
        "예고된 승부처에는 추가 착수할 수 없습니다.",
      );
      g.board[c] = makeStone(g, p.id, null);
      g.board[c]!.uid = `extra-${++g.serial}`;
      if (lineAt(g, c, p.id).length) {
        g.board[c] = null;
        throw Error("추가 착수로 5목을 완성할 수 없습니다.");
      }
      break;
    }
    case "freeze":
      opponent(g, p.id).frozenUntil = g.ply + 1;
      break;
    default:
      throw Error("사용 가능한 액티브 스킬이 아닙니다.");
  }
  p.mana -= cost;
  if (ignore) p.assassinUsed = true;
  s.uses++;
  if (h.op === "extra") p.legendUses++;
  if (h.op === "freeze") p.timeLordUsed = true;
  s.cooldown = Math.max(
    h.cooldown ? 1 : 0,
    h.cooldown -
      Number(has(g, p.id, "chrono", 2)) -
      Number(has(g, p.id, "assassin", 3)),
  );
  p.skills++;
  p.casts++;
  if (["remove", "seal", "judge"].includes(h.op) && has(g, p.id, "assassin", 2))
    mana(p, 1);
  if (p.skills === 1 && activeStones(g, p.id, "archmage").length) mana(p, 1);
  if (h.traits.includes("illusion") && has(g, p.id, "illusion", 4))
    mana(opponent(g, p.id), -1);
  event(
    g,
    "SKILL_CAST",
    `${p.name} · ${h.name}의 ${h.op === "freeze" ? "시간 정지" : "스킬"} 사용`,
    p.id,
    [a.source, ...(valid(c) ? [c] : [])],
  );
  telegraph(g, before);
  passiveShields(g);
  counter(g, p);
}
function tickEffects(g: Game) {
  for (let c = 0; c < 169; c++) {
    const s = g.board[c];
    if (!s) continue;
    if (s.tokenUntil && s.tokenUntil <= g.ply) {
      if (
        has(g, s.owner, "spirit", 4) &&
        player(g, s.owner).frozenUntil < g.ply
      )
        mana(player(g, s.owner), 2);
      g.board[c] = null;
      event(g, "TOKEN_EXPIRED", "정령 토큰이 사라집니다.", s.owner, [c]);
    }
  }
  passiveShields(g);
}
function beginTurn(g: Game, p: Player, now: number) {
  g.phase = "turn";
  g.turn = p.id;
  g.deadline = now + g.turnSeconds * 1000;
  p.placed = false;
  p.skills = 0;
  p.shieldUsed = false;
  for (const { s } of activeStones(g, p.id))
    s.cooldown = Math.max(0, s.cooldown - 1);
  tickEffects(g);
  const line = five(g, p.id);
  if (line.length) {
    finish(g, p.id, "예고한 5목이 상대의 반응 후에도 유지되었습니다.", line);
    return;
  }
  event(g, "TURN", `${p.name}의 한 수`, p.id);
}
function settle(g: Game) {
  if (g.ruleset === "focused") return;
  for (const p of g.players) {
    const interest = Math.min(
      p.augments.includes("interest") ? 8 : 5,
      Math.floor(p.gold / 10),
    );
    const behind = score(g, opponent(g, p.id).id) - score(g, p.id);
    const catchup = behind >= 4 ? 2 : behind > 0 ? 1 : 0;
    p.gold += 5 + interest + catchup;
    p.xp += 2;
    levelUp(p);
    const merchant = traitCounts(g, p.id).merchant || 0;
    merchantGold(
      g,
      p,
      (merchant >= 4 ? 3 : merchant >= 2 ? 1 : 0) +
        activeStones(g, p.id, "tycoon").reduce(
          (n, o) => n + Math.ceil(2 * (o.s.star >= 2 ? 1.5 : 1)),
          0,
        ),
    );
    if (
      has(g, p.id, "legion", 6) &&
      threatLines(g, p.id).some((l) =>
        l.cells.some((c) => HERO[g.board[c]!.hero]?.traits.includes("legion")),
      )
    )
      merchantGold(g, p, 1);
    for (const { s: clock } of activeStones(g, p.id, "clock")) {
      const cooling = activeStones(g, p.id).find((o) => o.s.cooldown > 0);
      if (cooling)
        cooling.s.cooldown = Math.max(
          0,
          cooling.s.cooldown - Math.ceil(clock.star >= 2 ? 1.5 : 1),
        );
    }
    event(
      g,
      "INCOME",
      `${p.name} · 수입 ${5 + interest + catchup}G${catchup ? ` (추격 +${catchup})` : ""} · Lv.${p.level}`,
      p.id,
    );
  }
}
function endTurn(g: Game, p: Player, now: number) {
  requireRule(p.placed, "돌을 한 개 놓은 뒤 턴을 마칠 수 있습니다.");
  if (p.frozenUntil < g.ply) {
    let extra =
      Number(has(g, p.id, "mage", 2)) +
      Number(p.augments.includes("mana")) +
      activeStones(g, p.id, "soldier")
        .filter((o) => alliedNeighbors(g, o.i, p.id).length >= 2)
        .reduce((n, o) => n + Math.ceil(o.s.star >= 2 ? 1.5 : 1), 0) +
      Number(
        has(g, p.id, "legion", 4) &&
          threatLines(g, p.id).some(
            (l) =>
              l.cells.filter((c) =>
                HERO[g.board[c]!.hero]?.traits.includes("legion"),
              ).length >= 3,
          ),
      );
    mana(p, 2 + extra - Number(p.levelPenaltyUntil >= g.round));
    if (has(g, p.id, "chrono", 4) && g.round % 4 === 0) p.mana = maxMana(p);
  }
  g.ply++;
  if (p.id === g.players[0].id) beginTurn(g, g.players[1], now);
  else {
    settle(g);
    g.round++;
    tickEffects(g);
    startRound(g, now);
  }
  updateTension(g);
}
function selectAugment(
  g: Game,
  p: Player,
  a: Extract<Action, { type: "augment" }>,
  now: number,
) {
  requireRule(p.choices.includes(a.id), "제시된 증강 중 하나를 선택하세요.");
  const id = a.id;
  if (id === "emblem") {
    const counts = traitCounts(g, p.id);
    const selected = a.trait || (Object.keys(counts)[0] as Trait | undefined);
    requireRule(
      selected && counts[selected],
      "보드에 존재하는 특성을 선택하세요.",
    );
    p.emblem = selected;
  }
  if (id === "promote" || id === "twins") {
    const eligible = p.bench.filter((u) =>
      id === "promote"
        ? u.star === 1 && HERO[u.hero].cost <= 3
        : u.star === 2 && HERO[u.hero].cost !== 5,
    );
    let u = eligible.find((u) => u.uid === a.uid) || eligible[0];
    requireRule(
      u,
      "승급할 수 있는 벤치 석혼이 없습니다. 다른 증강을 선택하세요.",
    );
    u.star++;
  }
  if (id === "contract") {
    requireRule(p.bench.length < 9, "벤치에 빈 칸이 필요합니다.");
    const h = draw(g, 5);
    requireRule(h, "공유 풀에 5코 석혼이 없습니다.");
    receive(g, p, h, 0);
    p.maxManaPenalty++;
    mana(p, 0);
  }
  if (id === "cash") p.gold += 8;
  if (id === "shields") p.shields += 3;
  if (id === "level") {
    if (p.level < 8) {
      p.xp = XP[p.level + 1];
      p.level++;
    }
    p.levelPenaltyUntil = g.round + 2;
  }
  if (id === "golden") p.goldenUntil = g.round + 4;
  p.augments.push(id);
  p.choices = [];
  event(g, "AUGMENT_CHOSEN", `${p.name} · ${AUGMENT[id].name}`, p.id);
  if (g.players.every((p) => !p.choices.length)) startPrep(g, now);
}
function skipEmptyAltar(g: Game, now: number) {
  while (
    g.altarStep < 4 &&
    (!g.altar.some(Boolean) ||
      !g.altar.some(
        (id) => id && canReceive(player(g, g.altarOrder[g.altarStep]), id),
      ))
  )
    g.altarStep++;
  if (g.altarStep >= 4) {
    for (const id of g.altar) if (id) g.pool[id]++;
    g.altar = [];
    startPrep(g, now);
  } else g.deadline = now + 15000;
}
function altarPick(g: Game, p: Player, slot: number, now: number) {
  requireRule(
    g.altarOrder[g.altarStep] === p.id,
    "상대가 제단을 선택하고 있습니다.",
  );
  const id = g.altar[slot];
  requireRule(id, "제단의 석혼을 선택하세요.");
  receive(g, p, id, 0);
  g.altar[slot] = null;
  g.altarStep++;
  event(g, "ALTAR_PICK", `${p.name} · 제단에서 ${HERO[id].name} 선택`, p.id);
  skipEmptyAltar(g, now);
}
export function rerollPrice(g: Game, p: Player) {
  return p.goldenUntil >= g.round
    ? 0
    : Math.max(
        0,
        2 -
          Number(has(g, p.id, "merchant", 3)) -
          Number(
            p.roundRerolls === 0 && activeStones(g, p.id, "dealer").length > 0,
          ),
      );
}
function apply(g: Game, id: string, a: Action, now: number) {
  const p = player(g, id);
  requireRule(g.phase !== "result", "대국이 종료되었습니다.");
  if (a.type === "surrender") {
    finish(g, opponent(g, id).id, `${p.name}이 기권했습니다.`);
    return;
  }
  if (a.type === "augment" || a.type === "augmentReroll") {
    requireRule(
      g.phase === "augment" && p.choices.length,
      "지금은 증강 선택 시간이 아닙니다.",
    );
    if (a.type === "augment") selectAugment(g, p, a, now);
    else {
      requireRule(p.augmentRerolls > 0, "증강 리롤을 모두 사용했습니다.");
      p.augmentRerolls--;
      p.choices = choiceList(g, p);
    }
    return;
  }
  if (a.type === "altar") {
    requireRule(g.phase === "altar", "제단이 열려 있지 않습니다.");
    altarPick(g, p, a.slot, now);
    return;
  }
  if (["buy", "sell", "reroll", "xp", "ready"].includes(a.type)) {
    requireRule(g.phase === "prep", "상점은 준비 시간에만 사용할 수 있습니다.");
    requireRule(g.ruleset !== "focused" || !["reroll", "xp"].includes(a.type), "전술 오목에서는 보급 석혼만 구매할 수 있습니다.");
    requireRule(g.ruleset !== "focused" || a.type === "ready" || !p.ready, "보급 준비를 마쳤습니다. 상대를 기다려 주세요.");
    switch (a.type) {
      case "buy": {
        requireRule(
          Number.isInteger(a.slot) && a.slot >= 0 && a.slot < 5,
          "올바른 상점 칸을 선택하세요.",
        );
        const h = p.shop[a.slot];
        requireRule(h, "이미 구매한 석혼입니다.");
        requireRule(p.gold >= HERO[h].cost, "골드가 부족합니다.");
        receive(g, p, h);
        p.gold -= HERO[h].cost;
        p.shop[a.slot] = null;
        break;
      }
      case "sell": {
        const i = p.bench.findIndex((u) => u.uid === a.uid);
        requireRule(i >= 0, "벤치에서 판매할 석혼을 선택하세요.");
        const u = p.bench.splice(i, 1)[0];
        p.gold += u.paid;
        g.pool[u.hero] += u.copies;
        break;
      }
      case "reroll": {
        const price = rerollPrice(g, p);
        requireRule(p.gold >= price, "리롤할 골드가 부족합니다.");
        p.gold -= price;
        p.rerolls++;
        p.roundRerolls++;
        rollShop(g, p, p.rerolls % 12 === 0);
        break;
      }
      case "xp":
        requireRule(
          p.gold >= 4 && p.level < 8,
          "경험치 구매에는 4골드가 필요합니다 (최대 Lv.8).",
        );
        p.gold -= 4;
        p.xp += 4;
        levelUp(p);
        break;
      case "ready":
        p.ready = true;
        if (g.players.every((p) => p.ready)) beginTurn(g, g.players[0], now);
        break;
    }
    return;
  }
  requireRule(
    g.phase === "turn" && g.turn === id,
    "지금은 내 차례가 아닙니다.",
  );
  switch (a.type) {
    case "place":
      place(g, p, a);
      break;
    case "skill":
      cast(g, p, a);
      break;
    case "end":
      endTurn(g, p, now);
      break;
    case "shield": {
      const s = g.board[a.cell];
      requireRule(
        p.shields > 0 && !p.shieldUsed,
        "이번 턴에 사용할 방패가 없습니다.",
      );
      requireRule(
        s && s.owner === id && !s.tokenUntil,
        "아군 돌을 선택하세요.",
      );
      requireRule(!s.shield, "이미 방패가 있습니다.");
      s.shield = true;
      p.shields--;
      p.shieldUsed = true;
      event(g, "SHIELD", "단단한 시작 · 방패 부착", id, [a.cell]);
      break;
    }
  }
  updateTension(g);
}
function recordFrame(before: Game, after: Game, actor: string, label: string) {
  if (!after.replayEnabled) return;
  const changes = after.board.flatMap((stone, cell) =>
    JSON.stringify(stone) !== JSON.stringify(before.board[cell])
      ? [{ cell, stone: stone ? structuredClone(stone) : null }]
      : [],
  );
  if (changes.length)
    after.frames.push({
      round: after.round,
      ply: after.ply,
      actor,
      label,
      changes,
    });
}
export function tacticalOutcome(before: Game, after: Game, id: string): string[] {
  const enemy = opponent(before, id).id;
  const result: string[] = [];
  const oldWins = winningCells(before, enemy), newWins = winningCells(after, enemy);
  if (oldWins.length && newWins.length < oldWins.length)
    result.push(newWins.length ? `상대의 5목 완성 자리 ${oldWins.length - newWins.length}곳을 막았습니다` : "상대의 즉시 5목 위협을 막았습니다");
  const size = (g: Game, who: string) => Math.max(0, ...threatLines(g, who).filter(l => l.open > 0).map(l => l.size));
  const oldLines = threatLines(before, enemy).filter(l => l.size >= 3 && l.open > 0);
  const newLines = threatLines(after, enemy);
  const broken = oldLines.filter(l => !newLines.some(next => l.cells.every(c => next.cells.includes(c))));
  if (broken.length) result.push(`상대 ${Math.max(...broken.map(l => l.size))}목 연결을 끊었습니다`);
  const shieldsBroken = before.board.filter(s => s?.owner === enemy && s.shield).length - after.board.filter(s => s?.owner === enemy && s.shield).length;
  if (shieldsBroken > 0) result.push(`상대 방패 ${shieldsBroken}개를 파괴했습니다 · 연결은 유지됩니다`);
  const ownBefore = size(before, id), ownAfter = size(after, id);
  if (ownAfter >= 3 && ownAfter > ownBefore) result.push(`내 ${ownAfter}목 공격을 만들었습니다`);
  const shields = after.board.filter(s => s?.owner === id && s.shield).length - before.board.filter(s => s?.owner === id && s.shield).length;
  if (shields > 0) result.push(`아군 돌 ${shields}개를 방패로 보호합니다`);
  if (after.winner === id) result.push("5목 완성 · 승리");
  return result;
}

export function reduce(g: Game, id: string, a: Action, now = Date.now()): Game {
  const next = structuredClone(g);
  apply(next, id, a, now);
  if (g.ruleset === "focused" && (a.type === "place" || a.type === "skill")) {
    const outcome = tacticalOutcome(g, next, id);
    const fallback = a.type === "place" ? "돌을 놓았습니다. 다음 연결과 상대의 대응을 살펴보세요." : "판이 바뀌었습니다. 다음 공격에 쓸 길을 살펴보세요.";
    event(next, "TACTICAL_RESULT", outcome.join(" · ") || fallback, id, a.type === "place" ? [a.cell] : [a.source, ...(a.target === undefined ? [] : [a.target])]);
  }
  recordFrame(
    g,
    next,
    id,
    a.type === "place"
      ? "착수"
      : a.type === "skill"
        ? "스킬"
        : a.type === "end"
          ? "턴 종료"
          : a.type === "shield"
            ? "방패"
            : a.type,
  );
  return next;
}
export function bestMove(g: Game, id: string) {
  const p = player(g, id);
  const wins = winningCells(g, id).filter((c) => !(p.barred[c] > g.ply));
  if (wins.length) return wins[0];
  const blocks = winningCells(g, opponent(g, id).id).filter(
    (c) => !(p.barred[c] > g.ply),
  );
  if (blocks.length) return blocks[0];
  let best = -1,
    bestValue = -Infinity;
  for (let c = 0; c < 169; c++) {
    if (g.board[c] || p.barred[c] > g.ply) continue;
    let n = 0;
    const [x, y] = xy(c);
    for (const owner of [id, opponent(g, id).id])
      for (const [dx, dy] of DIRS) {
        let count = 1,
          open = 0;
        for (const sign of [-1, 1]) {
          let k = 1;
          while (k < 5) {
            const pos = coord(x + dx * k * sign, y + dy * k * sign);
            if (pos < 0) break;
            if (connects(g, pos, owner)) {
              count++;
              k++;
            } else {
              open += Number(!g.board[pos]);
              break;
            }
          }
        }
        n +=
          Math.pow(count, 3) *
          (open === 2 ? 2 : open === 1 ? 1 : 0.15) *
          (owner === id ? 1.1 : 1);
      }
    n += 8 - distance(c, 84);
    if (n > bestValue) {
      best = c;
      bestValue = n;
    }
  }
  return best;
}
export function expire(g: Game, now = Date.now()): Game {
  if (g.phase === "result" || now < g.deadline) return g;
  let next = structuredClone(g);
  if (next.phase === "prep") beginTurn(next, next.players[0], now);
  else if (next.phase === "turn") {
    const p = player(next, next.turn);
    p.timeouts++;
    event(next, "TIMEOUT", `${p.name} 시간 초과 (${p.timeouts}/3)`, p.id);
    if (p.timeouts >= 3)
      finish(next, opponent(next, p.id).id, "시간 초과가 3회 누적되었습니다.");
    else {
      if (!p.placed) {
        const c = bestMove(next, p.id);
        if (c < 0) finish(next, null, "합법적인 착수 자리가 없습니다.");
        else place(next, p, { type: "place", cell: c });
      }
      if ((next.phase as string) !== "result") endTurn(next, p, now);
    }
  } else if (next.phase === "augment") {
    for (const p of next.players) {
      if (!p.choices.length) continue;
      let done = false;
      for (const id of p.choices) {
        try {
          const candidate = structuredClone(next);
          selectAugment(
            candidate,
            player(candidate, p.id),
            { type: "augment", id },
            now,
          );
          next = candidate;
          done = true;
          break;
        } catch {}
      }
      if (!done) {
        const q = player(next, p.id);
        q.choices = [];
        event(
          next,
          "AUGMENT_SKIPPED",
          `${q.name} · 선택 가능한 증강이 없어 8골드를 받습니다.`,
          q.id,
        );
        q.gold += 8;
      }
    }
    if (
      next.players.every((p) => !p.choices.length) &&
      next.phase === "augment"
    )
      startPrep(next, now);
  } else if (next.phase === "altar") {
    const p = player(next, next.altarOrder[next.altarStep]);
    const slot = next.altar.findIndex((id) => id && canReceive(p, id));
    if (slot >= 0) altarPick(next, p, slot, now);
    else skipEmptyAltar(next, now);
  }
  recordFrame(g, next, g.turn, "시간 경과");
  return next;
}
export function gameView(g: Game, id: string): GameView {
  const { pool: _, seed: __, players, ...rest } = structuredClone(g);
  return {
    ...rest,
    players: players.map((p) => {
      const { bench, shop, choices, barred: ___, ...publicP } = p;
      return {
        ...publicP,
        benchCount: bench.length,
        traits: traitCounts(g, p.id),
        ...(p.id === id ? { bench, shop, choices } : {}),
      };
    }),
    threats: Object.fromEntries(
      players.map((p) => [p.id, threatLines(g, p.id)]),
    ),
    winningCells: Object.fromEntries(
      players.map((p) => [p.id, winningCells(g, p.id)]),
    ),
    barredCells: Object.entries(player(g, id).barred)
      .filter(([, expiry]) => expiry > g.ply)
      .map(([c]) => Number(c)),
  };
}
