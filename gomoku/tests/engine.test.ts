import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIZE,
  createGame,
  reduce,
  bestMove,
  lineAt,
} from "../shared/engine.js";
const players = [
  { id: "black", name: "흑" },
  { id: "white", name: "백" },
];
test("15×15 오목: 한 번의 착수로 차례 전환, 원본 보존, 잘못된 착수 거부", () => {
  const game = createGame(players);
  assert.equal(game.board.length, 225);
  const next = reduce(game, "black", { type: "place", cell: 112 });
  assert.equal(next.turn, "white");
  assert.equal(next.ply, 1);
  assert.equal(next.board[112], "black");
  assert.equal(game.board[112], null);
  assert.throws(() => reduce(game, "white", { type: "place", cell: 0 }));
  assert.throws(() => reduce(game, "stranger", { type: "surrender" }));
  assert.throws(() => reduce(next, "white", { type: "place", cell: 112 }));
  for (const cell of [-1, 225, 1.5, NaN, "12", null, undefined])
    assert.throws(() =>
      reduce(game, "black", { type: "place", cell: cell as number }),
    );
  for (const type of [
    "buy",
    "skill",
    "ready",
    "end",
    "augment",
    "xp",
    "shield",
  ])
    assert.throws(() => reduce(game, "black", { type } as any));
  assert.throws(() => createGame(players.slice(0, 1)));
  assert.throws(() => createGame([players[0], players[0]]));
});
test("가로·세로·양 대각선 승리와 장목, 가장자리 줄바꿈 오판 방지", () => {
  for (const cells of [
    [0, 1, 2, 3, 4],
    [0, 15, 30, 45, 60],
    [0, 16, 32, 48, 64],
    [14, 28, 42, 56, 70],
    [0, 1, 2, 3, 4, 5],
  ]) {
    const game = createGame(players);
    for (const cell of cells.slice(0, -1)) game.board[cell] = "black";
    const next = reduce(game, "black", { type: "place", cell: cells.at(-1)! });
    assert.equal(next.winner, "black");
    assert.equal(next.phase, "result");
    assert.equal(next.winLine.length, cells.length);
    assert.throws(() => reduce(next, "white", { type: "place", cell: 200 }));
  }
  const game = createGame(players);
  for (const cell of [13, 14, 15, 16, 17]) game.board[cell] = "black";
  assert.deepEqual(lineAt(game.board, 15, "black"), []);
});
test("무승부와 기권, AI 즉시 승리·방어·첫 수", () => {
  const game = createGame(players);
  game.board = game.board.map((_, c) =>
    ((c % SIZE) + Math.floor(c / SIZE) * 2) % 4 < 2 ? "black" : "white",
  );
  game.board[224] = null;
  game.ply = 224;
  const draw = reduce(game, "black", { type: "place", cell: 224 });
  assert.equal(draw.phase, "result");
  assert.equal(draw.winner, null);
  assert.equal(draw.reason, "무승부");
  assert.equal(
    reduce(createGame(players), "white", { type: "surrender" }).winner,
    "black",
  );
  assert.equal(bestMove(createGame(players), "black"), 112);
  for (const owner of ["black", "white"]) {
    const g = createGame(players);
    for (const cell of [0, 1, 2, 3]) g.board[cell] = owner;
    assert.equal(bestMove(g, "black"), 4);
  }
  const full = createGame(players);
  full.board.fill("black");
  assert.equal(bestMove(full, "black"), -1);
});
