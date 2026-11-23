import { writeFileSync, mkdirSync } from "node:fs";
import {
  createGame,
  reduce,
  bestMove,
  player,
  random,
  traitCounts,
} from "../shared/engine.js";
import { HERO } from "../shared/data.js";
import type { Action, Game } from "../shared/types.js";
const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ||
  fallback;
const games = Number(arg("games", "100")),
  mode = arg("mode", "tactics");
if (!Number.isInteger(games) || games < 1 || games > 100000)
  throw Error("--games는 1~100000입니다.");
const stats = {
  games: 0,
  mode,
  firstWins: 0,
  secondWins: 0,
  draws: 0,
  totalRounds: 0,
  totalTurns: 0,
  totalCasts: 0,
  earlyEnds: 0,
  heroAppearances: {} as Record<string, number>,
  traitAppearances: {} as Record<string, number>,
  augmentPicks: {} as Record<string, number>,
};
const start = Date.now();
function tryAction(g: Game, id: string, a: Action) {
  try {
    return reduce(g, id, a, 0);
  } catch {
    return null;
  }
}
for (let run = 1; run <= games; run++) {
  let g = createGame(
      [
        { id: "first", name: "흑백 사범" },
        { id: "second", name: "청옥 사범" },
      ],
      run * 173,
      0,
    ),
    steps = 0;
  g.replayEnabled = false;
  while (g.phase !== "result" && steps++ < 1500) {
    if (g.phase === "prep") {
      for (const entry of g.players) {
        const id = entry.id;
        let p = player(g, id);
        if (mode === "tactics") {
          const candidates = p.shop
            .map((h, slot) => ({ h, slot }))
            .filter((o) => o.h && HERO[o.h].cost <= p.gold)
            .sort((a, b) => HERO[b.h!].cost - HERO[a.h!].cost);
          for (const { slot } of candidates.slice(0, 2)) {
            const next = tryAction(g, id, { type: "buy", slot });
            if (next) g = next;
          }
          p = player(g, id);
          if (p.gold >= 8 && p.level < 8) g = reduce(g, id, { type: "xp" }, 0);
        }
        if (!player(g, id).ready && g.phase === "prep")
          g = reduce(g, id, { type: "ready" }, 0);
      }
      continue;
    }
    if (g.phase === "augment") {
      for (const entry of g.players) {
        const p = player(g, entry.id);
        for (const id of p.choices) {
          const next = tryAction(g, p.id, { type: "augment", id });
          if (next) {
            g = next;
            break;
          }
        }
        if (player(g, p.id).choices.length) {
          player(g, p.id).choices = [];
          player(g, p.id).gold += 8;
        }
      }
      if (g.players.every((p) => !p.choices.length) && g.phase === "augment") {
        g.phase = "prep";
      }
      continue;
    }
    if (g.phase === "altar") {
      const p = player(g, g.altarOrder[g.altarStep]);
      let success = false;
      for (let slot = 0; slot < 4; slot++) {
        const n = tryAction(g, p.id, { type: "altar", slot });
        if (n) {
          g = n;
          success = true;
          break;
        }
      }
      if (!success) {
        g.altarStep++;
        if (g.altarStep >= 4) {
          g.altar = [];
          g.phase = "prep";
        }
      }
      continue;
    }
    const id = g.turn,
      p = player(g, id);
    if (!p.placed) {
      let cell: number = -1;
      if (mode === "plain") {
        const blanks = g.board
          .map((s, c) => (s ? -1 : c))
          .filter((c) => c >= 0);
        cell = blanks[Math.floor(random(g) * blanks.length)];
      } else cell = bestMove(g, id);
      if (cell === undefined || cell < 0) {
        g.phase = "result";
        break;
      }
      g = reduce(
        g,
        id,
        {
          type: "place",
          cell,
          uid: mode === "tactics" ? p.bench[0]?.uid : undefined,
        },
        0,
      );
      stats.totalTurns++;
      continue;
    }
    if (mode === "tactics" && p.skills === 0) {
      let cast = false;
      for (let source = 0; source < 169 && !cast; source++) {
        const s = g.board[source];
        if (
          !s ||
          s.owner !== id ||
          HERO[s.hero]?.type !== "active" ||
          s.cooldown
        )
          continue;
        const op = HERO[s.hero].op;
        let targets: number[] = [];
        if (["freeze", "stealMana", "shieldAll"].includes(op)) targets = [-1];
        else if (["remove", "seal", "judge"].includes(op))
          targets = g.board
            .map((s, i) => (s && s.owner !== id ? i : -1))
            .filter((i) => i >= 0);
        else if (["extra", "token"].includes(op)) {
          const c = bestMove(g, id);
          if (c >= 0) targets = [c];
        }
        for (const target of targets) {
          const n = tryAction(g, id, {
            type: "skill",
            source,
            target: target >= 0 ? target : undefined,
          });
          if (n) {
            g = n;
            cast = true;
            break;
          }
        }
      }
      if (cast) continue;
    }
    g = reduce(g, id, { type: "end" }, 0);
  }
  if (steps >= 1500) throw Error(`자가대국 ${run}: 전이가 끝나지 않았습니다.`);
  if (g.winner === g.players[0].id) stats.firstWins++;
  else if (g.winner === g.players[1].id) stats.secondWins++;
  else stats.draws++;
  stats.games++;
  stats.totalRounds += g.round;
  stats.totalCasts += g.players.reduce((n, p) => n + p.casts, 0);
  if (g.round < 8) stats.earlyEnds++;
  for (const h of new Set(g.history.map((m) => m.hero).filter((h) => HERO[h])))
    stats.heroAppearances[h] = (stats.heroAppearances[h] || 0) + 1;
  for (const p of g.players) {
    for (const t of Object.keys(traitCounts(g, p.id)))
      stats.traitAppearances[t] = (stats.traitAppearances[t] || 0) + 1;
    for (const a of p.augments)
      stats.augmentPicks[a] = (stats.augmentPicks[a] || 0) + 1;
  }
  if (run % 1000 === 0)
    console.log(`${run}/${games} games · ${Date.now() - start} ms`);
}
const result = {
  ...stats,
  averageRounds: stats.totalRounds / games,
  skillUseRatio: stats.totalCasts / Math.max(1, stats.totalTurns),
  firstWinRate: stats.firstWins / games,
  elapsedMs: Date.now() - start,
  notice:
    "휴리스틱/무작위 봇 결과이며 사람의 승률이나 밸런스 검증을 대신하지 않습니다.",
};
mkdirSync(new URL("../artifacts/", import.meta.url), { recursive: true });
writeFileSync(
  new URL(`../artifacts/simulation-${mode}.json`, import.meta.url),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
