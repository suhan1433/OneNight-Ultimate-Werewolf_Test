import type { Trait } from "./data.js";
export interface Unit {
  uid: string;
  hero: string;
  star: number;
  copies: number;
  paid: number;
}
export interface Stone extends Unit {
  owner: string;
  placed: number;
  protectedUntil: number;
  sealedUntil: number;
  shield: boolean;
  shieldRegen: number;
  cooldown: number;
  uses: number;
  tokenUntil: number;
  guardianGift?: boolean;
}
export interface Player {
  id: string;
  name: string;
  gold: number;
  xp: number;
  level: number;
  mana: number;
  bench: Unit[];
  shop: (string | null)[];
  augments: string[];
  choices: string[];
  augmentRerolls: number;
  emblem: Trait | null;
  shields: number;
  shieldUsed: boolean;
  ready: boolean;
  placed: boolean;
  skills: number;
  casts: number;
  timeouts: number;
  merchantGold: number;
  rerolls: number;
  roundRerolls: number;
  frozenUntil: number;
  levelPenaltyUntil: number;
  goldenUntil: number;
  maxManaPenalty: number;
  legendUses: number;
  timeLordUsed: boolean;
  counterUsed: boolean;
  assassinUsed: boolean;
  barred: Record<number, number>;
}
export type Phase = "prep" | "turn" | "augment" | "altar" | "result";
export interface GameEvent {
  id: number;
  type: string;
  text: string;
  player?: string;
  cells?: number[];
  round: number;
  ply: number;
}
export interface ReplayFrame {
  round: number;
  ply: number;
  actor: string;
  label: string;
  changes: { cell: number; stone: Stone | null }[];
}
export interface Game {
  seed: number;
  serial: number;
  players: Player[];
  board: (Stone | null)[];
  pool: Record<string, number>;
  phase: Phase;
  round: number;
  ply: number;
  turn: string;
  deadline: number;
  prepSeconds: number;
  turnSeconds: number;
  altar: (string | null)[];
  altarOrder: string[];
  altarStep: number;
  winner: string | null;
  reason: string;
  winLine: number[];
  events: GameEvent[];
  frames: ReplayFrame[];
  replayEnabled: boolean;
  history: { round: number; player: string; cell: number; hero: string }[];
  tension: number;
}
export type Action =
  | { type: "buy"; slot: number }
  | { type: "sell"; uid: string }
  | { type: "reroll" }
  | { type: "xp" }
  | { type: "ready" }
  | { type: "place"; cell: number; uid?: string }
  | { type: "skill"; source: number; target?: number; destination?: number }
  | { type: "shield"; cell: number }
  | { type: "end" }
  | { type: "augment"; id: string; trait?: Trait; uid?: string }
  | { type: "augmentReroll" }
  | { type: "altar"; slot: number }
  | { type: "surrender" };
export interface PublicPlayer
  extends Omit<Player, "bench" | "shop" | "choices" | "barred"> {
  benchCount: number;
  traits: Partial<Record<Trait, number>>;
  bench?: Unit[];
  shop?: (string | null)[];
  choices?: string[];
}
export interface GameView extends Omit<Game, "pool" | "seed" | "players"> {
  players: PublicPlayer[];
  winningCells: Record<string, number[]>;
  threats: Record<string, { cells: number[]; open: number; size: number }[]>;
  barredCells: number[];
}
