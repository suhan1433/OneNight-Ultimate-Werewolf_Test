export type Role =
  | "forensic"
  | "murderer"
  | "accomplice"
  | "witness"
  | "investigator";
export type Phase =
  | "DEAL"
  | "ROLE_REVEAL"
  | "CRIME_NIGHT"
  | "SCENE_INTRO"
  | "EVIDENCE_COLLECTION"
  | "PRESENTATION"
  | "ROUND_TRANSITION"
  | "SOLVING"
  | "REVERSAL"
  | "RESULT";
export type Team = "investigators" | "criminals";
export interface Settings {
  cardsPerKind: 3 | 4 | 5;
  events: boolean;
  presentationSeconds: 20 | 30 | 45 | 60 | null;
  accomplice: boolean;
  witness: boolean;
}
export interface Card {
  id: string;
  kind: "clue" | "means";
  label: string;
  icon: string;
}
export type EventEffect = "shorten" | "lengthen" | "untimed";
export interface SceneTile {
  id: string;
  kind: "location" | "cause" | "hint" | "event";
  title: string;
  options: string[];
  eventText?: string | undefined;
  effect?: EventEffect | undefined;
}
export interface Player {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  departed: boolean;
  hasBadge: boolean;
  cards: Card[];
}
export interface Solution {
  murdererId: string;
  clueId: string;
  meansId: string;
}
export interface Timer {
  deadline: number | null;
}
export interface SolveLock {
  playerId: string;
  expiresAt: number;
  previousPhase: "EVIDENCE_COLLECTION" | "PRESENTATION" | "ROUND_TRANSITION";
  remainingMs: number | null;
}
export interface RecordEntry {
  at: number;
  round: number;
  type: "marker" | "replace" | "presentation" | "solve" | "event" | "result";
  playerId?: string;
  tileId?: string;
  option?: number;
  correct?: boolean;
  solution?: Solution;
  team?: Team;
}
/** SERVER ONLY: never broadcast this object. Use project(). */
export interface GameState {
  startedAt: number;
  phase: Phase;
  round: number;
  version: number;
  now: number;
  rng: number;
  settings: Settings;
  players: Player[];
  roles: Record<string, Role>;
  confirmed: string[];
  solution: Solution | null;
  witnessCandidates: string[];
  nightStartedAt: number | null;
  tiles: SceneTile[];
  deck: SceneTile[];
  markers: Record<string, number>;
  pendingTile: SceneTile | null;
  presentationOrder: string[];
  presentationIndex: number;
  timer: Timer;
  eventsAdded: boolean;
  roundPresentationSeconds: number | null;
  solveLock: SolveLock | null;
  winner: Team | null;
  reason: string | null;
  history: RecordEntry[];
  processedCommands: string[];
}
export type Action =
  | { type: "advance" }
  | { type: "confirmRole" }
  | { type: "crimeSelect"; clueId: string; meansId: string }
  | { type: "chooseLocation"; tileId: string }
  | { type: "placeMarker"; tileId: string; option: number }
  | { type: "beginPresentations" }
  | { type: "endPresentation" }
  | { type: "replaceTile"; tileId: string }
  | { type: "startSolve" }
  | { type: "cancelSolve" }
  | { type: "commitSolve"; targetId: string; clueId: string; meansId: string }
  | { type: "reversalPick"; targetId: string };
export interface Command {
  id: string;
  actorId: string;
  action: Action;
}
export interface PrivateIntel {
  myRole: Role;
  solution?: Solution;
  murdererId?: string;
  accompliceId?: string;
  witnessCandidates?: string[];
  isSolving?: boolean;
}
export interface GameView {
  startedAt: number;
  phase: Phase;
  round: number;
  version: number;
  settings: Settings;
  players: Player[];
  forensicId: string;
  tiles: SceneTile[];
  markers: Record<string, number>;
  pendingTile: SceneTile | null;
  presenterId: string | null;
  presentationOrder: string[];
  timer: Timer;
  nightStartedAt: number | null;
  solveLock: { expiresAt: number } | null;
  winner: Team | null;
  reason: string | null;
  history: RecordEntry[];
  private: PrivateIntel;
  revealedRoles?: Record<string, Role>;
  solution?: Solution;
}
