import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPractice,
  practiceInput,
  practiceStep,
  LEARNER,
  COACH,
  LESSONS,
  type PracticeState,
} from "../src/lesson-model";
import { player, traitCounts, winningCells } from "../shared/engine";
function complete(lesson: number) {
  let s = createPractice(lesson);
  for (let i = 0; !s.complete && i < 15; i++) {
    const step = practiceStep(s);
    s = practiceInput(s, {
      kind: step.kind,
      cell: step.cell,
      uid:
        step.kind === "unit"
          ? player(s.game, LEARNER).bench.find((u) => u.hero === step.hero)?.uid
          : undefined,
      id: step.kind === "augment" ? "cash" : undefined,
      slot: step.kind === "altar" ? 0 : undefined,
    });
  }
  assert.equal(s.complete, true, LESSONS[lesson].title);
  return s;
}
test("first lesson requires ready, preview, placement and end-turn in order", () => {
  let s = createPractice(0);
  const blocked = practiceInput(s, { kind: "confirm" });
  assert.equal(blocked.step, 0);
  assert.deepEqual(blocked.game, s.game);
  s = practiceInput(s, { kind: "ready" });
  assert.equal(s.game.turn, LEARNER);
  const wrong = practiceInput(s, { kind: "cell", cell: 85 });
  assert.equal(wrong.step, s.step);
  assert.equal(wrong.game.board[85], null);
  assert.match(wrong.message, /G7/);
  s = complete(0);
  assert.equal(s.game.board[84]?.owner, LEARNER);
  assert.equal(s.game.turn, COACH);
  assert.equal(player(s.game, LEARNER).mana, 2);
});
test("blocking lesson removes the opponent winning square", () => {
  const before = createPractice(1);
  assert.deepEqual(winningCells(before.game, COACH), [85]);
  const after = complete(1);
  assert.equal(after.game.board[85]?.owner, LEARNER);
  assert.deepEqual(winningCells(after.game, COACH), []);
  assert.equal(after.game.winner, null);
});
test("shop lesson spends real gold and moves the purchased hero from bench to board", () => {
  const s = complete(2);
  assert.equal(player(s.game, LEARNER).gold, 3);
  assert.equal(player(s.game, LEARNER).bench.length, 0);
  assert.equal(s.game.board[84]?.hero, "thunder");
  assert.equal(s.game.turn, COACH);
});
test("seal lesson consumes mana, applies seal and still requires a normal placement", () => {
  let s = createPractice(3);
  for (const input of [
    { kind: "cell", cell: 97 },
    { kind: "skill" },
    { kind: "cell", cell: 84 },
    { kind: "cast" },
  ] as const)
    s = practiceInput(s, input);
  assert.equal(player(s.game, LEARNER).mana, 0);
  assert.ok(s.game.board[84]!.sealedUntil > s.game.ply);
  assert.equal(s.complete, false);
  assert.equal(player(s.game, LEARNER).placed, false);
  s = complete(3);
  assert.equal(player(s.game, LEARNER).casts, 1);
  assert.equal(player(s.game, LEARNER).mana, 2);
  assert.equal(s.game.board[85]?.owner, LEARNER);
  assert.equal(s.game.board[97]?.cooldown, 2);
});
test("trait lesson activates guardians and grants real shields", () => {
  const s = complete(4);
  assert.equal(traitCounts(s.game, LEARNER).guardian, 2);
  assert.equal(s.game.board[84]?.shield, true);
  assert.equal(s.game.board[97]?.shield, true);
});
test("five-stone lesson completes a real win, with no end-turn required", () => {
  const s = complete(5);
  assert.equal(s.game.phase, "result");
  assert.equal(s.game.winner, LEARNER);
  assert.equal(s.game.winLine.length, 5);
});
test("augmentation and altar lessons change resources according to the engine", () => {
  const a = complete(6);
  assert.equal(player(a.game, LEARNER).gold, 13);
  assert.deepEqual(player(a.game, LEARNER).augments, ["cash"]);
  const b = complete(7);
  assert.equal(player(b.game, LEARNER).gold, 5);
  assert.equal(player(b.game, LEARNER).bench[0].hero, "guard");
  assert.equal(player(b.game, LEARNER).bench[0].paid, 0);
  assert.equal(b.game.altarOrder[b.game.altarStep], COACH);
});
test("lessons can restart independently and reject wrong choices without advancing", () => {
  const s = createPractice(6);
  const wrong = practiceInput(s, { kind: "augment", id: "mana" });
  assert.equal(wrong.step, 0);
  assert.equal(player(wrong.game, LEARNER).gold, 5);
  assert.equal(wrong.game, s.game);
  const reset = createPractice(0);
  assert.equal(reset.step, 0);
  assert.equal(reset.game.board.filter(Boolean).length, 0);
  assert.equal(player(reset.game, LEARNER).gold, 5);
  assert.equal(complete(0).game.board[84]?.owner, LEARNER);
  assert.equal(reset.game.board[84], null);
});
