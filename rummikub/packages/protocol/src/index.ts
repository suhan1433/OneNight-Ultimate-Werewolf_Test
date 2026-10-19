import { z } from 'zod';
import type { Meld, RuleConfig, Tile } from '@rummikub/rules';
export type Phase = 'lobby' | 'dealing' | 'playing' | 'roundEnd' | 'matchEnd';
export interface PlayerView { id: string; name: string; seat: number; connected: boolean; isBot: boolean; ready: boolean; hasInitialMeld: boolean; score: number; handCount: number }
export interface PublicView { roomId: string; playerId: string; hostId: string; phase: Phase; config: RuleConfig; players: PlayerView[]; hand: Tile[]; table: Meld[]; tableTiles: Tile[]; poolCount: number; turn: { playerId: string; deadline: number } | null; version: number; message: string; roundWinnerId?: string }
export interface Ack<T = object> { ok: boolean; data?: T; error?: string }
const configSchema = z.object({ initialMeldMin: z.number().int().min(1).max(104).optional(), turnSeconds: z.number().int().min(20).max(600).optional(), penaltyDraw: z.number().int().min(1).max(10).optional(), jokerPenalty: z.number().int().min(1).max(100).optional(), jokerReuse: z.enum(['free', 'newMeld', 'newMeldFromHand']).optional(), allowJokerMeldManipulation: z.boolean().optional(), allowTwoJokersInMeld: z.boolean().optional(), allowManipulationOnInitialMeldTurn: z.boolean().optional() });
export const roomCreateSchema = z.object({ name: z.string().trim().min(1).max(16), maxPlayers: z.number().int().min(2).max(4), config: configSchema.optional(), clientSeq: z.number().int().nonnegative() });
export const roomJoinSchema = z.object({ roomId: z.string().trim().length(6).transform(value => value.toUpperCase()), name: z.string().trim().min(1).max(16), playerId: z.string().optional(), sessionToken: z.string().optional(), clientSeq: z.number().int().nonnegative() });
export const roomActionSchema = z.object({ roomId: z.string().length(6), clientSeq: z.number().int().nonnegative() });
export const roomTimerSchema = roomActionSchema.extend({ turnSeconds: z.number().int().min(20).max(600) });
export const roomKickSchema = roomActionSchema.extend({ playerId: z.string().uuid() });
export const commitSchema = roomActionSchema.extend({ version: z.number().int().nonnegative(), table: z.array(z.object({ id: z.string().min(1).max(80), type: z.enum(['group', 'run']), tiles: z.array(z.object({ tileId: z.number().int().min(0).max(105), represents: z.object({ color: z.enum(['black', 'red', 'blue', 'orange']), value: z.number().int().min(1).max(13) }).optional() })).min(3) })), hand: z.array(z.number().int().min(0).max(105)) });
export type RoomCreate = z.infer<typeof roomCreateSchema>; export type RoomJoin = z.infer<typeof roomJoinSchema>; export type TurnCommit = z.infer<typeof commitSchema>;
