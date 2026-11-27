import type { Action, Game, Player } from "./types.js";
export const SIZE = 15;
const directions = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];
export function createGame(players: Player[], _seed = 0, _now = 0): Game {
  if (
    players.length !== 2 ||
    !players[0].id ||
    !players[1].id ||
    players[0].id === players[1].id
  )
    throw Error("두 명의 서로 다른 대국자가 필요합니다.");
  return {
    players: players.map((p) => ({ ...p })),
    board: Array(SIZE * SIZE).fill(null),
    phase: "turn",
    turn: players[0].id,
    ply: 0,
    lastCell: null,
    winner: null,
    reason: "",
    winLine: [],
  };
}
export function lineAt(
  board: Game["board"],
  cell: number,
  owner: string,
): number[] {
  if (board[cell] !== owner) return [];
  for (const [dx, dy] of directions) {
    const line = [cell];
    for (const sign of [-1, 1]) {
      let x = (cell % SIZE) + dx * sign,
        y = Math.floor(cell / SIZE) + dy * sign;
      while (
        x >= 0 &&
        x < SIZE &&
        y >= 0 &&
        y < SIZE &&
        board[y * SIZE + x] === owner
      ) {
        line.push(y * SIZE + x);
        x += dx * sign;
        y += dy * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return [];
}
export function reduce(game: Game, id: string, action: Action): Game {
  if (!game.players.some((p) => p.id === id)) throw Error("대국자가 아닙니다.");
  if (game.phase === "result") throw Error("이미 끝난 대국입니다.");
  const opponent = game.players.find((p) => p.id !== id)!;
  if (action.type === "surrender")
    return {
      ...game,
      phase: "result",
      winner: opponent.id,
      reason: "기권",
      winLine: [],
    };
  if (action.type !== "place") throw Error("알 수 없는 행동입니다.");
  if (game.turn !== id) throw Error("상대 차례입니다.");
  const cell = action.cell;
  if (!Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE)
    throw Error("판 안의 교차점을 선택하세요.");
  if (game.board[cell]) throw Error("이미 돌이 놓인 자리입니다.");
  const board = [...game.board];
  board[cell] = id;
  const winLine = lineAt(board, cell, id),
    draw = board.every(Boolean);
  return {
    ...game,
    board,
    ply: game.ply + 1,
    lastCell: cell,
    winLine,
    turn: opponent.id,
    phase: winLine.length || draw ? "result" : "turn",
    winner: winLine.length ? id : null,
    reason: winLine.length ? "오목 완성" : draw ? "무승부" : "",
  };
}
// Win immediately, block an immediate loss, then extend open lines near existing stones.
export function bestMove(game: Game, id: string): number {
  const enemy = game.players.find((p) => p.id !== id)!.id;
  const empty = game.board.flatMap((s, c) => (s ? [] : [c]));
  if (!empty.length) return -1;
  if (empty.length === SIZE * SIZE) return Math.floor((SIZE * SIZE) / 2);
  for (const owner of [id, enemy])
    for (const cell of empty) {
      const board = [...game.board];
      board[cell] = owner;
      if (lineAt(board, cell, owner).length) return cell;
    }
  function strength(cell: number, owner: string) {
    let score = 0;
    for (const [dx, dy] of directions) {
      let length = 1,
        open = 0;
      for (const sign of [-1, 1]) {
        let x = (cell % SIZE) + dx * sign,
          y = Math.floor(cell / SIZE) + dy * sign;
        while (
          x >= 0 &&
          x < SIZE &&
          y >= 0 &&
          y < SIZE &&
          game.board[y * SIZE + x] === owner
        ) {
          length++;
          x += dx * sign;
          y += dy * sign;
        }
        if (
          x >= 0 &&
          x < SIZE &&
          y >= 0 &&
          y < SIZE &&
          !game.board[y * SIZE + x]
        )
          open++;
      }
      if (open) score += Math.pow(8, length - 1) * open;
    }
    return score;
  }
  return empty.reduce((best, cell) => {
    const value = (c: number) =>
      strength(c, id) * 1.1 +
      strength(c, enemy) -
      (Math.abs((c % SIZE) - 7) + Math.abs(Math.floor(c / SIZE) - 7)) * 0.05;
    return value(cell) > value(best) ? cell : best;
  });
}
