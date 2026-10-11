export type RoleType =
  | 'werewolf' | 'alpha_wolf' | 'mystic_wolf' | 'dream_wolf' | 'minion'
  | 'apprentice_tanner' | 'seer' | 'apprentice_seer' | 'robber'
  | 'witch' | 'troublemaker' | 'drunk' | 'insomniac' | 'journalist'
  | 'doppelganger' | 'shield_bearer' | 'villager' | 'mason' | 'hunter'
  | 'bodyguard' | 'prince' | 'cursed' | 'tanner';

export type Faction = 'village' | 'werewolf' | 'minion' | 'tanner';
export type Phase = 'lobby' | 'card_reveal' | 'night' | 'day' | 'voting' | 'result';
export type NightActionKind = 'none' | 'inspect_player' | 'inspect_center' | 'inspect_players' | 'swap_player' | 'swap_players' | 'swap_center' | 'protect' | 'confirm';

/** Profile character IDs accepted by the server and shared with every client. */
export const AVATAR_IDS = [
  'wolf', 'fox', 'owl', 'cat', 'rabbit', 'bear', 'bat', 'deer',
  'frog', 'lion', 'panda', 'octopus', 'raccoon', 'penguin', 'boar', 'turtle',
] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export interface RoleDefinition {
  id: RoleType; name: string; emoji: string; description: string; faction: Faction;
  nightOrder: number | null; nightAction: NightActionKind; winCondition: string; canActAtNight: boolean; maxCount: number;
}
export interface Player {
  id: string; nickname: string; sessionToken: string; socketId: string | null;
  originalRole: RoleType | null; currentRole: RoleType | null; isReady: boolean;
  hasConfirmedCard: boolean; hasActedTonight: boolean; vote: string | null; connected: boolean;
  /** Selected profile character. Optional for rooms saved before profiles existed. */
  avatar?: AvatarId;
  /** Server-controlled participant used only in test bot rooms. */
  isBot?: boolean;
  /** Server timestamp used to resolve a player who does not return after a grace period. */
  disconnectedAt?: number | null;
}
export interface CenterCard { id: string; role: RoleType; originalRole: RoleType; }
export interface NightCommand { type: 'confirm' | 'inspect_player' | 'inspect_center' | 'inspect_centers' | 'swap_player' | 'swap_players' | 'swap_center' | 'protect'; targetPlayerIds?: string[]; centerIndexes?: number[]; }
export interface NightAction {
  id: string; role: RoleType; playerIds: string[]; actedPlayerIds: string[]; order: number;
  startedAt: number; expiresAt: number; status: 'pending' | 'active' | 'completed' | 'timeout' | 'skipped'; copied?: boolean;
}
export interface NightActionLog { actionId: string; role: RoleType; playerId?: string; status: string; at: number; }
/** A private snapshot of a night action, captured when its owner performs it. */
export interface PrivateNightAction { role: RoleType; result: Record<string, unknown>; }
export interface ChatMessage { id: string; playerId: string; nickname: string; text: string; at: number; }
export interface GameResult {
  winners: Faction[]; executedIds: string[]; voteCounts: Record<string, number>;
  /** Raw ballots each player received, before role effects such as Prince or Bodyguard. */
  receivedVoteCounts: Record<string, number>;
  votes: Record<string, string>; players: Array<{ id: string; nickname: string; originalRole: RoleType; currentRole: RoleType }>;
}
export interface Room {
  roomCode: string; hostId: string; maxPlayers: number; players: Player[]; selectedRoles: RoleType[];
  /** A room pre-filled with server-controlled test bots. */
  botMode?: boolean;
  centerCards: CenterCard[]; phase: Phase; nightActionQueue: NightAction[]; currentNightActionIndex: number;
  actionTimeLimitSeconds: number; dayTimeLimitSeconds: number; ttsEnabled: boolean; nightLog: NightActionLog[];
  votes: Record<string, string>; voteStartRequests: string[]; processedRequestIds: string[]; chat: ChatMessage[]; publicReveals: string[];
  privateResults: Record<string, Record<string, unknown>>;
  /** Choices collected during the simultaneous night-input window. */
  pendingNightCommands?: Record<string, NightCommand>;
  /** Brief private-result window shown after ordered night resolution. */
  nightResolutionExpiresAt?: number | null;
  /** Never broadcast: each player only receives their own entries. */
  privateNightActions: Record<string, PrivateNightAction[]>;
  protectedPlayerId: string | null; dayExpiresAt: number | null; result: GameResult | null;
  /** Internal retention deadlines. Kept optional so rooms saved before this policy remain readable. */
  lobbyExpiresAt?: number | null; allOfflineExpiresAt?: number | null; resultExpiresAt?: number | null;
  createdAt: number; updatedAt: number;
}
export interface PublicPlayer { id: string; nickname: string; avatar?: AvatarId; isReady: boolean; hasConfirmedCard: boolean; connected: boolean; isHost: boolean; hasVoted: boolean; isBot: boolean; }
export interface ClientGameState {
  roomCode: string; playerId: string; hostId: string; maxPlayers: number; phase: Phase; selfRole: RoleType | null;
  /** Monotonic-enough server revision used to discard delayed Socket packets. */
  stateVersion: number;
  botMode: boolean;
  players: PublicPlayer[]; selectedRoles: RoleType[]; currentNightAction: Omit<NightAction, 'playerIds' | 'actedPlayerIds'> | null;
  isNightActor: boolean; actionContext?: Record<string, unknown>; actionResult?: Record<string, unknown>; nightActions: PrivateNightAction[];
  votesCompleted: number; dayVoteRequests: number; hasRequestedDayVote: boolean; totalPlayers: number; dayExpiresAt: number | null; serverNow: number; chat: ChatMessage[]; lobbyChat: ChatMessage[];
  publicReveals: string[]; settings: { actionTimeLimitSeconds: number; dayTimeLimitSeconds: number };
  result: GameResult | null;
  nightEndsAt?: number | null;
  /** While set, ordered night effects are complete and private results are being shown before dawn. */
  nightResolutionEndsAt?: number | null;
}
export interface Ack<T = unknown> { ok: boolean; data?: T; error?: string; }
