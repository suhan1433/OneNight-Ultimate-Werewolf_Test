export type Clan = 'rose' | 'beast' | 'secret';
export type Affiliation = 'rose' | 'beast' | 'unknown';
export type AbilityId = 'elder' | 'assassin' | 'harlequin' | 'alchemist' | 'mentalist' | 'guardian' | 'berserker' | 'mage' | 'courtesan' | 'inquisitor';
export type Token = { kind: 'rank'; value: number | 'fleur' } | { kind: 'affiliation'; value: Affiliation };
export type Phase = 'lobby' | 'role_reveal' | 'clue_reveal' | 'action' | 'attack_target' | 'intervention_offer' | 'intervention_decide' | 'token_select' | 'ability_decide' | 'ability_input' | 'result' | 'error';
export type AbilityInputKind = 'assassin_target' | 'harlequin_targets' | 'alchemist_effect' | 'mentalist_target' | 'guardian_target' | 'mage_target' | 'courtesan_target' | 'inquisitor_curses';

export interface Character { clan: Clan; rank: number | null; name: string; affiliations: Affiliation[]; clue: 'rose' | 'beast'; ability: AbilityId; }
export interface Equipment { shields: string[]; swords: string[]; staffs: number; fans: number; quill: boolean; }
export interface BloodBoundPlayer { id: string; nickname: string; sessionToken: string; socketId: string | null; connected: boolean; ready: boolean; roleConfirmed: boolean; clueConfirmed: boolean; character: Character | null; tokens: Token[]; equipment: Equipment; curse?: 'true' | 'false'; isBot?: boolean; }
export interface AttackContext { attackerId: string; targetId: string; offers: string[]; intervenerId?: string; actualTargetId?: string; }
export interface PendingWound { targetId: string; sourceId: string; forceRank?: boolean; bypassShield?: boolean; after?: 'transfer_to_target' | 'continue'; originalAttack?: boolean; }
export interface PendingAbility { actorId: string; ability: AbilityId; context: { intervened?: boolean; originalTargetId?: string; attackerId?: string; stage?: string; targetId?: string }; }
export interface ResolutionFrame { kind: 'wound' | 'ability'; wound?: PendingWound; ability?: PendingAbility; }
export interface GameEvent { id: string; type: string; actorId?: string; visibility: 'public' | 'private'; audience?: string[]; message: string; at: number; data?: Record<string, unknown>; }
export interface VictoryResult { capturedPlayer: string; captor: string; captorClan: Clan; capturedClan: Clan; currentLeaders: { rose: string | null; beast: string | null }; winningClan: 'rose' | 'beast' | 'secret'; inquisitorOverride: boolean; victoryReason: string; }
export interface BloodBoundRoom { roomCode: string; hostId: string; maxPlayers: number; players: BloodBoundPlayer[]; phase: Phase; seed: number; rngState: number; daggerHolderId: string | null; attack?: AttackContext; pendingWound?: PendingWound; pendingAbility?: PendingAbility; resolutionStack: ResolutionFrame[]; publicLog: GameEvent[]; privateLog: GameEvent[]; harlequinViews: Record<string, string[]>; curseDistributed: boolean; pairSequence: number; result?: VictoryResult; createdAt: number; updatedAt: number; lobbyExpiresAt?: number | null; allOfflineExpiresAt?: number | null; resultExpiresAt?: number | null; error?: string; }
export type BloodBoundAction =
 | { type: 'START'; actorId: string }
 | { type: 'ROLE_CONFIRM'; actorId: string }
 | { type: 'CLUE_CONFIRM'; actorId: string }
 | { type: 'PASS'; actorId: string; targetId: string }
 | { type: 'ATTACK'; actorId: string; targetId: string }
 | { type: 'INTERVENE_OFFER'; actorId: string }
 | { type: 'INTERVENE_DECIDE'; actorId: string; intervenerId?: string }
 | { type: 'TOKEN_SELECT'; actorId: string; token: Token }
 | { type: 'ABILITY_DECIDE'; actorId: string; use: boolean }
 | { type: 'ABILITY_INPUT'; actorId: string; kind: AbilityInputKind; targetIds?: string[]; choice?: 'wound' | 'heal'; curses?: Record<string, 'true' | 'false'> }
 | { type: 'HARLEQUIN_ACK'; actorId: string };
export type ReduceResult = { state: BloodBoundRoom; events: GameEvent[] } | { error: string };

export interface PublicPlayer { id: string; nickname: string; connected: boolean; ready: boolean; roleConfirmed: boolean; clueConfirmed: boolean; tokens: Token[]; wounds: number; equipment: Equipment; isBot: boolean; }
export interface ClientGameState { roomCode: string; playerId: string; hostId: string; maxPlayers: number; phase: Phase; seed: number; daggerHolderId: string | null; players: PublicPlayer[]; activePlayerId: string | null; attack?: Omit<AttackContext, 'attackerId'> & { attackerId: string }; offers?: string[]; privateCharacter: Character | null; visibleClue?: { fromPlayerId: string; clue: 'rose' | 'beast' }; harlequinCards?: Character[]; pendingAbility?: { actorId: string; ability: AbilityId; context: PendingAbility['context'] }; permittedActions: string[]; publicLog: GameEvent[]; result?: VictoryResult; revealedCharacters?: Array<{ id: string; character: Character; curse?: 'true' | 'false' }>; }
export interface Ack<T = unknown> { ok: boolean; data?: T; error?: string; }
