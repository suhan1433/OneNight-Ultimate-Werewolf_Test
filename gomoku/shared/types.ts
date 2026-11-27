export interface Player {
  id: string;
  name: string;
}
export interface Game {
  players: Player[];
  board: (string | null)[];
  phase: "turn" | "result";
  turn: string;
  ply: number;
  lastCell: number | null;
  winner: string | null;
  reason: string;
  winLine: number[];
}
export type Action = { type: "place"; cell: number } | { type: "surrender" };
export type GameView = Game;
