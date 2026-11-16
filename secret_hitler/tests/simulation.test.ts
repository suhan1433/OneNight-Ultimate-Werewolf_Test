import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  transition,
  gameView,
  botAction,
} from "../packages/rules-engine/src/index.js";
import type { Policy } from "../packages/shared-types/src/index.js";
function rng(seed: number) {
  let v = seed;
  return () => {
    v = (Math.imul(1664525, v) + 1013904223) >>> 0;
    return v / 4294967296;
  };
}
test(
  "20,000회 무작위 게임: 5~10인 완주 및 매 전이 정책 17장·색별 총량·트랙 불변식",
  { timeout: 300000 },
  () => {
    let transitions = 0;
    const outcomes = { liberal: 0, fascist: 0 };
    for (let run = 1; run <= 20000; run++) {
      const random = rng(run),
        n = 5 + (run % 6);
      let s = createGame(
        Array.from({ length: n }, (_, i) => ({
          id: `p${i}`,
          name: `의원${i}`,
          avatar: i,
        })),
        random,
      );
      let steps = 0;
      while (s.phase !== "finished") {
        const ids =
          s.phase === "night"
            ? s.players
                .filter((p) => !s.acknowledged.includes(p.id))
                .map((p) => p.id)
            : s.phase === "voting"
              ? s.players
                  .filter((p) => p.alive && !(p.id in s.votes))
                  .map((p) => p.id)
              : s.phase === "chancellor_enact"
                ? [s.chancellor!]
                : [s.president];
        assert(ids.length > 0, `stuck in ${s.phase}`);
        const id = ids[Math.floor(random() * ids.length)],
          a = botAction(gameView(s, id), id);
        assert(a, `no action in ${s.phase}`);
        if (a?.type === "vote") a.ja = random() > 0.25;
        if (
          a?.type === "enact" &&
          s.fascist >= 5 &&
          !s.vetoDenied &&
          random() < 0.15
        ) {
          s = transition(s, id, { type: "request_veto" }, random);
        } else s = transition(s, id, a!, random);
        const cards = [...s.deck, ...s.discard, ...s.hand];
        assert.equal(cards.length + s.liberal + s.fascist, 17);
        for (const policy of ["liberal", "fascist"] as Policy[])
          assert.equal(
            cards.filter((p) => p === policy).length + s[policy],
            policy === "liberal" ? 6 : 11,
          );
        assert(
          s.liberal <= 5 && s.fascist <= 6 && s.tracker >= 0 && s.tracker < 3,
        );
        assert(s.players.filter((p) => p.alive).length >= 3);
        assert(++steps < 1500);
        transitions++;
      }
      outcomes[s.winner!]++;
      if (run % 5000 === 0) console.log(`Completed ${run} games`);
    }
    console.log(JSON.stringify({ games: 20000, transitions, outcomes }));
  },
);
