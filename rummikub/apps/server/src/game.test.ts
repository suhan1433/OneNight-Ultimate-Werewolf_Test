import { describe, expect, it } from 'vitest';
import { createRoom, commitTurn, joinRoom, kickPlayer, publicView, setTurnSeconds, startGame } from './game.js';
import type { Tile } from '@rummikub/rules';
describe('private game view', () => { it('never serializes another player hand', () => { const { room, player: first } = createRoom('NEON42', 'A', 2); room.players[0]!.ready = true; const second = joinRoom(room, 'B'); second.ready = true; startGame(room, first.id); const view = publicView(room, first.id); expect(view.hand).toHaveLength(14); expect(JSON.stringify(view)).not.toContain(JSON.stringify(room.hands[second.id]!)); expect(view.players.find(player => player.id === second.id)?.handCount).toBe(14); }); });

describe('lobby controls', () => {
  it('lets only the host update the turn timer while in the lobby', () => {
    const { room, player: host } = createRoom('NEON42', 'A', 2);
    const guest = joinRoom(room, 'B');
    setTurnSeconds(room, host.id, 60);
    expect(room.config.turnSeconds).toBe(60);
    expect(() => setTurnSeconds(room, guest.id, 90)).toThrow('방장만');
  });

  it('removes a lobby player and makes the seat available again', () => {
    const { room, player: host } = createRoom('NEON42', 'A', 3);
    const guest = joinRoom(room, 'B');
    const removed = kickPlayer(room, host.id, guest.id);
    expect(removed.id).toBe(guest.id);
    expect(room.players).toHaveLength(1);
    expect(room.hands[guest.id]).toBeUndefined();
    expect(() => kickPlayer(room, host.id, host.id)).toThrow('자신을 강퇴');
  });
});

describe('table ordering', () => {
  it('stores a run in number order even when its submitted order is mixed', () => {
    const { room, player } = createRoom('NEON42', 'A', 2);
    const deck: Tile[] = [
      { id: 10, kind: 'number', color: 'red', value: 5 },
      { id: 11, kind: 'number', color: 'red', value: 6 },
      { id: 12, kind: 'number', color: 'red', value: 7 },
    ];
    room.phase = 'playing'; room.config.initialMeldMin = 1; room.deck = deck; room.hands[player.id] = [10, 11, 12];
    room.turn = { playerId: player.id, startedAt: 0, deadline: Number.MAX_SAFE_INTEGER, snapshot: { table: [], hand: [10, 11, 12], hasInitialMeld: false } };
    commitTurn(room, player.id, room.version, [{ id: 'run', type: 'run', tiles: [{ tileId: 11 }, { tileId: 10 }, { tileId: 12 }] }], []);
    expect(room.table[0]!.tiles.map(tile => tile.tileId)).toEqual([10, 11, 12]);
  });
});
