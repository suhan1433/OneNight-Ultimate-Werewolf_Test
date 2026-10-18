import { randomBytes, randomUUID } from 'node:crypto';
import { createDeck, defaultRuleConfig, seededShuffle, scoreRound, scoreStalemate, tileMap, validateMeld, validateTurn, type Meld, type RuleConfig, type Tile, type TileId, type TurnSnapshot } from '@rummikub/rules';
import type { Phase, PlayerView, PublicView } from '@rummikub/protocol';

export interface Player { id: string; name: string; seat: number; connected: boolean; isBot: boolean; ready: boolean; hasInitialMeld: boolean; score: number; token: string; socketId: string | null; lastSeq: number }
export interface GameRoom { roomId: string; hostId: string; maxPlayers: number; phase: Phase; config: RuleConfig; seed: string; deck: Tile[]; players: Player[]; hands: Record<string, TileId[]>; pool: TileId[]; table: Meld[]; turn: { playerId: string; startedAt: number; deadline: number; snapshot: TurnSnapshot } | null; version: number; message: string; passCount: number; roundWinnerId?: string }
export interface GameStore { get(id: string): GameRoom | undefined; set(room: GameRoom): void; delete(id: string): void; values(): IterableIterator<GameRoom> }
export class MemoryGameStore implements GameStore { private rooms = new Map<string, GameRoom>(); get(id: string) { return this.rooms.get(id); } set(room: GameRoom) { this.rooms.set(room.roomId, room); } delete(id: string) { this.rooms.delete(id); } values() { return this.rooms.values(); } }
export const roomCode = () => { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(''); };
const token = () => randomBytes(24).toString('base64url');
const snapshot = (room: GameRoom, player: Player): TurnSnapshot => ({ table: structuredClone(room.table), hand: [...room.hands[player.id]!], hasInitialMeld: player.hasInitialMeld });
const nextPlayer = (room: GameRoom, playerId: string) => { const index = room.players.findIndex(player => player.id === playerId); return room.players[(index + 1) % room.players.length]!; };
const tileLookup = (room: GameRoom) => tileMap(room.deck);
export function createRoom(id: string, name: string, maxPlayers: number, config: Partial<RuleConfig> = {}): { room: GameRoom; player: Player } {
  const host: Player = { id: randomUUID(), name, seat: 0, connected: true, isBot: false, ready: false, hasInitialMeld: false, score: 0, token: token(), socketId: null, lastSeq: -1 };
  const room: GameRoom = { roomId: id, hostId: host.id, maxPlayers, phase: 'lobby', config: { ...defaultRuleConfig, ...config }, seed: randomUUID(), deck: createDeck(), players: [host], hands: { [host.id]: [] }, pool: [], table: [], turn: null, version: 0, message: 'Neon Parlor is open. Invite your friends.', passCount: 0 };
  return { room, player: host };
}
export function joinRoom(room: GameRoom, name: string, previous?: { playerId?: string; sessionToken?: string }): Player {
  const restored = room.players.find(player => player.id === previous?.playerId && player.token === previous?.sessionToken);
  if (restored) { restored.connected = true; return restored; }
  if (room.phase !== 'lobby' || room.players.length >= room.maxPlayers) throw Error('이 방에는 지금 입장할 수 없습니다.');
  if (room.players.some(player => player.name.toLowerCase() === name.toLowerCase())) throw Error('같은 닉네임이 이미 있습니다.');
  const player: Player = { id: randomUUID(), name, seat: room.players.length, connected: true, isBot: false, ready: false, hasInitialMeld: false, score: 0, token: token(), socketId: null, lastSeq: -1 };
  room.players.push(player); room.hands[player.id] = []; room.version += 1; room.message = `${name} joined the lounge.`; return player;
}
export function fillBots(room: GameRoom, ownerId: string) { if (room.hostId !== ownerId || room.phase !== 'lobby') throw Error('방장만 봇을 추가할 수 있습니다.'); while (room.players.length < room.maxPlayers) { const number = room.players.filter(player => player.isBot).length + 1; const bot: Player = { id: randomUUID(), name: `Neon Bot ${number}`, seat: room.players.length, connected: true, isBot: true, ready: true, hasInitialMeld: false, score: 0, token: '', socketId: null, lastSeq: -1 }; room.players.push(bot); room.hands[bot.id] = []; } room.version += 1; room.message = 'Empty chairs were filled with Neon Bots.'; }
export function toggleReady(room: GameRoom, playerId: string) { const player = getPlayer(room, playerId); if (room.phase !== 'lobby') throw Error('대기실에서만 준비할 수 있습니다.'); if (!player.isBot) player.ready = !player.ready; room.version += 1; }
export function startGame(room: GameRoom, ownerId: string) {
  if (room.hostId !== ownerId || room.phase !== 'lobby') throw Error('방장만 게임을 시작할 수 있습니다.');
  if (room.players.length < 2) throw Error('2명 이상이어야 합니다.'); if (!room.players.every(player => player.ready)) throw Error('모든 플레이어가 준비해야 합니다.');
  room.phase = 'dealing'; room.seed = randomUUID(); room.deck = createDeck(); const shuffled = seededShuffle(room.deck.map(tile => tile.id), room.seed); room.pool = shuffled;
  room.table = []; room.passCount = 0; room.roundWinnerId = undefined;
  room.players.forEach(player => { room.hands[player.id] = room.pool.splice(0, 14); player.hasInitialMeld = false; });
  room.phase = 'playing'; const starter = room.players[Math.floor(Math.random() * room.players.length)]!; beginTurn(room, starter); room.version += 1; room.message = `${starter.name}'s turn. First meld needs ${room.config.initialMeldMin} points.`;
}
export function getPlayer(room: GameRoom, id: string) { const player = room.players.find(item => item.id === id); if (!player) throw Error('잘못된 플레이어 세션입니다.'); return player; }
export function beginTurn(room: GameRoom, player: Player) { const now = Date.now(); room.turn = { playerId: player.id, startedAt: now, deadline: now + room.config.turnSeconds * 1000, snapshot: snapshot(room, player) }; }
function rotate(room: GameRoom, completedBy: Player, message: string) { const next = nextPlayer(room, completedBy.id); beginTurn(room, next); room.version += 1; room.message = message; }
export function commitTurn(room: GameRoom, playerId: string, version: number, table: Meld[], hand: TileId[]) {
  const player = getPlayer(room, playerId); if (room.phase !== 'playing' || room.turn?.playerId !== playerId) throw Error('지금은 당신의 차례가 아닙니다.'); if (version !== room.version) throw Error('게임 상태가 바뀌었습니다. 다시 동기화했습니다.');
  const result = validateTurn({ before: room.turn.snapshot, after: { table, hand }, config: room.config, tiles: room.deck }); if (!result.ok) throw Error(result.reason);
  room.table = structuredClone(table); room.hands[playerId] = [...hand]; if (!player.hasInitialMeld) player.hasInitialMeld = true; room.passCount = 0;
  if (hand.length === 0) { endRound(room, player.id, `${player.name}: RUMMIKUB!`); return; } rotate(room, player, `${player.name} completed a meld.`);
}
export function drawTurn(room: GameRoom, playerId: string) {
  const player = getPlayer(room, playerId); if (room.phase !== 'playing' || room.turn?.playerId !== playerId) throw Error('지금은 당신의 차례가 아닙니다.');
  const drawn = room.pool.pop(); if (drawn !== undefined) { room.hands[player.id]!.push(drawn); room.passCount = 0; rotate(room, player, `${player.name} drew a tile.`); return; }
  room.passCount += 1; if (room.passCount >= room.players.length) { const result = scoreStalemate(room.hands, room.deck, room.config.jokerPenalty); applyRound(room, result.winnerId, result.deltas, 'The pool is empty: lowest rack wins.'); } else rotate(room, player, `${player.name} passed; the pool is empty.`);
}
export function resetTurn(room: GameRoom, playerId: string) { if (room.turn?.playerId !== playerId) throw Error('지금은 당신의 차례가 아닙니다.'); const saved = room.turn.snapshot; room.table = structuredClone(saved.table); room.hands[playerId] = [...saved.hand]; room.version += 1; room.message = 'Your draft was reset.'; }
export function timeoutTurn(room: GameRoom) { if (room.phase !== 'playing' || !room.turn || room.turn.deadline > Date.now()) return false; const player = getPlayer(room, room.turn.playerId); const original = room.turn.snapshot; room.table = structuredClone(original.table); room.hands[player.id] = [...original.hand]; for (let i = 0; i < room.config.penaltyDraw; i += 1) { const drawn = room.pool.pop(); if (drawn !== undefined) room.hands[player.id]!.push(drawn); }
  rotate(room, player, `${player.name} timed out and drew ${room.config.penaltyDraw}.`); return true;
}
function endRound(room: GameRoom, winnerId: string, message: string) { const result = scoreRound(room.hands, winnerId, room.deck, room.config.jokerPenalty); applyRound(room, winnerId, result.deltas, message); }
function applyRound(room: GameRoom, winnerId: string, deltas: Record<string, number>, message: string) { room.players.forEach(player => { player.score += deltas[player.id] ?? 0; }); room.phase = 'roundEnd'; room.turn = null; room.roundWinnerId = winnerId; room.version += 1; room.message = message; }
export function returnLobby(room: GameRoom, ownerId: string) { if (room.hostId !== ownerId || (room.phase !== 'roundEnd' && room.phase !== 'matchEnd')) throw Error('방장만 대기실로 돌아갈 수 있습니다.'); room.phase = 'lobby'; room.table = []; room.pool = []; room.turn = null; room.players.forEach(player => { player.ready = player.isBot; player.hasInitialMeld = false; player.score = 0; room.hands[player.id] = []; }); room.version += 1; room.message = 'Back in the lounge.'; }
export function publicView(room: GameRoom, playerId: string): PublicView {
  const self = getPlayer(room, playerId); const lookup = tileLookup(room); const hand = room.hands[playerId]!.map(id => lookup.get(id)).filter((tile): tile is Tile => Boolean(tile));
  const players: PlayerView[] = room.players.map(player => ({ id: player.id, name: player.name, seat: player.seat, connected: player.connected, isBot: player.isBot, ready: player.ready, hasInitialMeld: player.hasInitialMeld, score: player.score, handCount: room.hands[player.id]?.length ?? 0 }));
  const tableTiles = room.table.flatMap(meld => meld.tiles.map(entry => lookup.get(entry.tileId)).filter((tile): tile is Tile => Boolean(tile)));
  return { roomId: room.roomId, playerId, hostId: room.hostId, phase: room.phase, config: room.config, players, hand, table: structuredClone(room.table), tableTiles, poolCount: room.pool.length, turn: room.turn ? { playerId: room.turn.playerId, deadline: room.turn.deadline } : null, version: room.version, message: room.message, ...(room.roundWinnerId ? { roundWinnerId: room.roundWinnerId } : {}) };
}
export function botAction(room: GameRoom): boolean {
  if (room.phase !== 'playing' || !room.turn) return false; const bot = getPlayer(room, room.turn.playerId); if (!bot.isBot) return false; const lookup = tileLookup(room); const ids = room.hands[bot.id]!;
  for (let a = 0; a < ids.length; a += 1) for (let b = a + 1; b < ids.length; b += 1) for (let c = b + 1; c < ids.length; c += 1) { const sample = [ids[a]!, ids[b]!, ids[c]!].map(id => lookup.get(id)!); const meld = validateMeld(sample, room.config.allowTwoJokersInMeld, `bot-${Date.now()}`); if (meld.ok) { const candidate = [...room.table, meld.meld]; const hand = ids.filter(id => !meld.meld.tiles.some(entry => entry.tileId === id)); const check = validateTurn({ before: room.turn.snapshot, after: { table: candidate, hand }, config: room.config, tiles: room.deck }); if (check.ok) { commitTurn(room, bot.id, room.version, candidate, hand); return true; } } }
  drawTurn(room, bot.id); return true;
}
