export type Party = "liberal" | "fascist";
export type Role = Party | "hitler";
export type Policy = Party;
export type Power = "investigate" | "special_election" | "peek" | "execute";
export type Phase =
  | "night"
  | "nomination"
  | "voting"
  | "vote_result"
  | "president_discard"
  | "chancellor_enact"
  | "veto"
  | "executive"
  | "finished";
export type Action =
  | { type: "acknowledge" }
  | { type: "nominate"; target: string }
  | { type: "select_target"; target: string }
  | { type: "vote"; ja: boolean }
  | { type: "discard"; index: number }
  | { type: "enact"; index: number }
  | { type: "request_veto" }
  | { type: "answer_veto"; accept: boolean }
  | { type: "power"; target?: string }
  | { type: "confirm_power" };
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  alive: boolean;
  investigated: boolean;
  notHitler: boolean;
}
export interface PublicEvent {
  id: number;
  round: number;
  type: string;
  text: string;
  policy?: Policy;
  president?: string;
  chancellor?: string;
  votes?: Record<string, boolean>;
  target?: string;
}
export interface SecretRecord {
  actor: string;
  action: Action;
  round: number;
  phase: Phase;
  hand: Policy[];
  roles?: Record<string, Role>;
}
export interface GameState {
  phase: Phase;
  version: number;
  phaseVersion: number;
  round: number;
  players: (PublicPlayer & { role: Role })[];
  president: string;
  chancellor: string | null;
  previousGovernment: { president: string; chancellor: string } | null;
  specialResume: string | null;
  votes: Record<string, boolean>;
  acknowledged: string[];
  selectedTarget: string | null;
  deck: Policy[];
  discard: Policy[];
  hand: Policy[];
  liberal: number;
  fascist: number;
  tracker: number;
  power: Power | null;
  vetoDenied: boolean;
  privateResults: Record<
    string,
    { target?: string; party?: Party; policies?: Policy[] }
  >;
  events: PublicEvent[];
  secrets: SecretRecord[];
  winner: Party | null;
  winReason: string | null;
}
export interface GameView {
  phase: Phase;
  version: number;
  round: number;
  players: PublicPlayer[];
  president: string;
  chancellor: string | null;
  previousGovernment: GameState["previousGovernment"];
  liberal: number;
  fascist: number;
  tracker: number;
  deckCount: number;
  discardCount: number;
  power: Power | null;
  vetoEnabled: boolean;
  vetoDenied: boolean;
  acknowledged: string[];
  selectedTarget: string | null;
  voted: string[];
  selfRole?: Role;
  knownPlayers: { id: string; role: Role }[];
  hand?: Policy[];
  privateResult?: { target?: string; party?: Party; policies?: Policy[] };
  eligibleChancellors: string[];
  eligibleTargets: string[];
  events: PublicEvent[];
  winner: Party | null;
  winReason: string | null;
  revealedRoles?: Record<string, Role>;
  replay?: SecretRecord[];
}
export interface Member {
  id: string;
  name: string;
  avatar: number;
  ready: boolean;
  connected: boolean;
  bot: boolean;
  spectator: boolean;
}
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  time: number;
}
export interface RoomView {
  code: string;
  version: number;
  selfId: string;
  hostId: string;
  members: Member[];
  settings: { maxPlayers: number; timerSeconds: number; language: "ko" | "en" };
  paused: boolean;
  game: GameView | null;
  chat: ChatMessage[];
  deadline: number | null;
}
export type Ack<T = unknown> =
  { ok: true; data: T } | { ok: false; error: string };
