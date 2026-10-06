import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '@werewolf/shared';
import { MAX_ROOMS, appendChat, canCreateRoom, clearChat, clearVotes, consumeRateLimit, deleteRoom, getChatHistory, getRoom, getVotes, recordVote, removeVotesForPlayer, saveRoom, sweepExpiredRooms, withRoomLock } from './redis.js';

const makeRoom = (roomCode: string, lobbyExpiresAt = Date.now() + 60_000): Room => ({
  roomCode, hostId: 'host', maxPlayers: 3, players: [], selectedRoles: [], centerCards: [], phase: 'lobby',
  nightActionQueue: [], currentNightActionIndex: 0, actionTimeLimitSeconds: 8, dayTimeLimitSeconds: 300,
  ttsEnabled: true, nightLog: [], votes: {}, voteStartRequests: [], processedRequestIds: [], chat: [],
  publicReveals: [], privateResults: {}, privateNightActions: {}, protectedPlayerId: null, dayExpiresAt: null, result: null,
  lobbyExpiresAt, allOfflineExpiresAt: null, resultExpiresAt: null, createdAt: Date.now(), updatedAt: Date.now(),
});

afterEach(async () => {
  vi.useRealTimers();
  // Test room codes are unique to this file; delete all possible cap entries.
  await Promise.all(Array.from({ length: MAX_ROOMS }, (_, index) => deleteRoom(`TTL${index}`)));
  await deleteRoom('TTLONE'); await deleteRoom('TTLEXP');
});

describe('in-memory TTL cleanup', () => {
  it('deletes all room-scoped rate-limit and processed entries with the room', async () => {
    const room = makeRoom('TTLONE');
    await saveRoom(room, 'same-request');
    expect(await consumeRateLimit(room.roomCode, 'chat:player', 1, 60)).toBe(true);
    await deleteRoom(room.roomCode);
    await saveRoom(makeRoom(room.roomCode));
    expect(await consumeRateLimit(room.roomCode, 'chat:player', 1, 60)).toBe(true);
    await withRoomLock(room.roomCode, (_locked, alreadyProcessed) => expect(alreadyProcessed).toBe(false), 'same-request');
  });

  it('clears separately stored ballots before a rematch', async () => {
    const room = makeRoom('TTLONE');
    await recordVote(room.roomCode, 'host', 'player-2');
    expect(await getVotes(room.roomCode)).toEqual({ host: 'player-2' });

    await clearVotes(room.roomCode);

    expect(await getVotes(room.roomCode)).toEqual({});
  });

  it('clears separately stored day chat before a rematch', async () => {
    const room = makeRoom('TTLONE');
    await appendChat(room.roomCode, { id: 'old-message', playerId: 'host', nickname: 'Host', text: '지난 게임 메시지', at: Date.now() });
    expect(await getChatHistory(room.roomCode)).toHaveLength(1);

    await clearChat(room.roomCode);

    expect(await getChatHistory(room.roomCode)).toEqual([]);
  });

  it('removes ballots cast by or for a player who leaves', async () => {
    const room = makeRoom('TTLONE');
    await recordVote(room.roomCode, 'leaving', 'staying-a');
    await recordVote(room.roomCode, 'staying-a', 'leaving');
    await recordVote(room.roomCode, 'staying-b', 'staying-a');

    expect(await removeVotesForPlayer(room.roomCode, 'leaving')).toEqual({ 'staying-b': 'staying-a' });
    expect(await getVotes(room.roomCode)).toEqual({ 'staying-b': 'staying-a' });
  });

  it('sweeps an expired room without reading that room', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await saveRoom(makeRoom('TTLEXP', Date.now() + 1_000));
    vi.advanceTimersByTime(1_001);
    expect(await sweepExpiredRooms()).toBe(1);
    expect(await getRoom('TTLEXP')).toBeNull();
  });

  it('refuses another room once the in-process room cap is reached', async () => {
    for (let index = 0; index < MAX_ROOMS; index += 1) await saveRoom(makeRoom(`TTL${index}`));
    expect(canCreateRoom()).toBe(false);
  });
});
