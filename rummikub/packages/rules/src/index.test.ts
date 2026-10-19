import { describe, expect, it } from 'vitest';
import { createDeck, defaultRuleConfig, scoreStalemate, tileMap, validateMeld, validateStoredMeld, validateTurn, type Meld, type NumberTile, type Tile } from './index.js';
const tile = (id: number, color: NumberTile['color'], value: number): NumberTile => ({ id, kind: 'number', color, value });
const joker = (id: number): Tile => ({ id, kind: 'joker' });
describe('Sabra rules', () => {
  it('creates the official 106-tile deck', () => expect(createDeck()).toHaveLength(106));
  it('accepts runs and groups, but not 12-13-1', () => { expect(validateMeld([tile(1, 'red', 1), tile(2, 'red', 2), tile(3, 'red', 3)]).ok).toBe(true); expect(validateMeld([tile(4, 'red', 12), tile(5, 'red', 13), tile(6, 'red', 1)]).ok).toBe(false); expect(validateMeld([tile(7, 'red', 7), tile(8, 'blue', 7), tile(9, 'orange', 7)]).ok).toBe(true); });
  it('enforces the first-meld point threshold', () => { const deck = [tile(1, 'red', 8), tile(2, 'red', 9), tile(3, 'red', 10), tile(4, 'red', 11)]; const good = validateMeld(deck.slice(1), true, 'm'); expect(good.ok).toBe(true); if (good.ok) { expect(validateTurn({ before: { table: [], hand: [1, 2, 3, 4], hasInitialMeld: false }, after: { table: [good.meld], hand: [1] }, config: defaultRuleConfig, tiles: deck }).ok).toBe(true); const bad = validateMeld(deck.slice(0, 3), true, 'b'); expect(bad.ok).toBe(true); if (bad.ok) expect(validateTurn({ before: { table: [], hand: [1, 2, 3, 4], hasInitialMeld: false }, after: { table: [bad.meld], hand: [4] }, config: defaultRuleConfig, tiles: deck }).ok).toBe(false); } });
  it('requires an initial meld to be a new hand-only set, even when added tiles total 30', () => {
    const deck = [tile(1, 'red', 3), tile(2, 'red', 4), tile(3, 'red', 5), tile(4, 'red', 6), tile(5, 'red', 7), tile(6, 'red', 8), tile(7, 'red', 9)];
    const existing = validateMeld(deck.slice(0, 3), true, 'table');
    const extended = validateMeld(deck, true, 'table');
    expect(existing.ok).toBe(true); expect(extended.ok).toBe(true);
    if (existing.ok && extended.ok) {
      const result = validateTurn({ before: { table: [existing.meld], hand: [4, 5, 6, 7], hasInitialMeld: false }, after: { table: [extended.meld], hand: [] }, config: defaultRuleConfig, tiles: deck });
      expect(result).toEqual({ ok: false, reason: '첫 등록 전에는 기존 테이블을 바꿀 수 없습니다.' });
    }
  });
  it('allows a 30-point new hand-only set while preserving the existing table', () => {
    const deck = [tile(1, 'red', 3), tile(2, 'red', 4), tile(3, 'red', 5), tile(4, 'red', 10), tile(5, 'blue', 10), tile(6, 'black', 10)];
    const existing = validateMeld(deck.slice(0, 3), true, 'table');
    const opening = validateMeld(deck.slice(3), true, 'opening');
    expect(existing.ok).toBe(true); expect(opening.ok).toBe(true);
    if (existing.ok && opening.ok) {
      const result = validateTurn({ before: { table: [existing.meld], hand: [4, 5, 6], hasInitialMeld: false }, after: { table: [existing.meld, opening.meld], hand: [] }, config: defaultRuleConfig, tiles: deck });
      expect(result).toEqual({ ok: true, initialMeldPoints: 30 });
    }
  });
  it('releases a joker from a four-tile group that remains valid without it', () => {
    const deck = [
      tile(1, 'red', 10), tile(2, 'blue', 10), tile(3, 'black', 10), joker(4),
      tile(5, 'red', 4), tile(6, 'red', 5),
    ];
    const withJoker = validateMeld(deck.slice(0, 4), true, 'tens');
    const tens = validateMeld(deck.slice(0, 3), true, 'tens');
    const newRun = validateMeld([deck[4]!, deck[5]!, deck[3]!], true, 'run');
    expect(withJoker.ok).toBe(true); expect(tens.ok).toBe(true); expect(newRun.ok).toBe(true);
    if (withJoker.ok && tens.ok && newRun.ok) {
      expect(validateTurn({
        before: { table: [withJoker.meld], hand: [5, 6], hasInitialMeld: true },
        after: { table: [tens.meld, newRun.meld], hand: [] }, config: defaultRuleConfig, tiles: deck,
      })).toEqual({ ok: true });
    }
  });
  it.each(['original', 'rebuilt'])('releases the joker after extending 6-7-joker with 5 (%s meld ID)', id => {
    const tiles = [tile(1, 'red', 6), tile(2, 'red', 7), joker(3), tile(4, 'red', 5), tile(5, 'blue', 10), tile(6, 'blue', 11)];
    const original: Meld = { id: 'original', type: 'run', tiles: [{ tileId: 1 }, { tileId: 2 }, { tileId: 3, represents: { color: 'red', value: 8 } }] };
    const remainder: Meld = { id, type: 'run', tiles: [{ tileId: 4 }, { tileId: 1 }, { tileId: 2 }] };
    const reused: Meld = { id: 'reused', type: 'run', tiles: [{ tileId: 5 }, { tileId: 6 }, { tileId: 3, represents: { color: 'blue', value: 12 } }] };
    const args = {
      before: { table: [original], hand: [4, 5, 6], hasInitialMeld: true },
      after: { table: [remainder, reused], hand: [] }, config: defaultRuleConfig, tiles,
    };
    expect(validateTurn(args)).toEqual({ ok: true });
    // The joker must be used on the table, and the remaining run must stay valid.
    expect(validateTurn({ ...args, after: { table: [remainder], hand: [3, 5, 6] } }).ok).toBe(false);
    expect(validateTurn({ ...args, after: { table: [{ ...remainder, tiles: remainder.tiles.slice(1) }, reused], hand: [4] } }).ok).toBe(false);
    expect(validateTurn({ ...args, config: { ...defaultRuleConfig, allowJokerMeldManipulation: false } }).ok).toBe(false);
  });
  it('allows replacing the represented tile and reusing the joker', () => {
    const tiles = [tile(1, 'red', 6), tile(2, 'red', 7), joker(3), tile(4, 'red', 8), tile(5, 'blue', 10), tile(6, 'blue', 11)];
    expect(validateTurn({
      before: { table: [{ id: 'original', type: 'run', tiles: [{ tileId: 1 }, { tileId: 2 }, { tileId: 3, represents: { color: 'red', value: 8 } }] }], hand: [4, 5, 6], hasInitialMeld: true },
      after: { table: [
        { id: 'original', type: 'run', tiles: [{ tileId: 1 }, { tileId: 2 }, { tileId: 4 }] },
        { id: 'reused', type: 'run', tiles: [{ tileId: 5 }, { tileId: 6 }, { tileId: 3, represents: { color: 'blue', value: 12 } }] },
      ], hand: [] }, config: defaultRuleConfig, tiles,
    })).toEqual({ ok: true });
  });
  it('rejects changing a joker value while it remains in the original run', () => {
    const tiles = [tile(1, 'red', 6), tile(2, 'red', 7), joker(3), tile(4, 'red', 8)];
    expect(validateTurn({
      before: { table: [{ id: 'run', type: 'run', tiles: [{ tileId: 1 }, { tileId: 2 }, { tileId: 3, represents: { color: 'red', value: 8 } }] }], hand: [4], hasInitialMeld: true },
      after: { table: [{ id: 'run', type: 'run', tiles: [{ tileId: 1 }, { tileId: 2 }, { tileId: 4 }, { tileId: 3, represents: { color: 'red', value: 9 } }] }], hand: [] },
      config: defaultRuleConfig, tiles,
    }).ok).toBe(false);
  });
  it.each([3, 6, 9])('releases a joker when a %i-tile run remains valid, including split runs', count => {
    const numbers = Array.from({ length: count }, (_, i) => tile(i + 1, 'orange', i + 1));
    const tiles = [...numbers, joker(20), tile(21, 'blue', 10), tile(22, 'blue', 11)];
    const remaining: Meld[] = Array.from({ length: count / 3 }, (_, i) => ({ id: `part-${i}`, type: 'run', tiles: numbers.slice(i * 3, i * 3 + 3).map(t => ({ tileId: t.id })) }));
    expect(validateTurn({
      before: { table: [{ id: 'original', type: 'run', tiles: [...numbers.map(t => ({ tileId: t.id })), { tileId: 20, represents: { color: 'orange', value: count + 1 } }] }], hand: [21, 22], hasInitialMeld: true },
      after: { table: [...remaining, { id: 'reused', type: 'run', tiles: [{ tileId: 21 }, { tileId: 22 }, { tileId: 20, represents: { color: 'blue', value: 12 } }] }], hand: [] },
      config: defaultRuleConfig, tiles,
    })).toEqual({ ok: true });
  });
  it('accepts either missing group color and either order of two jokers', () => {
    const tiles = [tile(1, 'red', 7), tile(2, 'blue', 7), joker(3), joker(4)];
    const lookup = tileMap(tiles);
    for (const color of ['black', 'orange'] as const) {
      expect(validateStoredMeld({ id: 'group', type: 'group', tiles: [{ tileId: 1 }, { tileId: 2 }, { tileId: 3, represents: { color, value: 7 } }] }, lookup).ok).toBe(true);
    }
    const group: Meld = { id: 'group', type: 'group', tiles: [{ tileId: 1 }, { tileId: 2 }, { tileId: 3, represents: { color: 'orange', value: 7 } }, { tileId: 4, represents: { color: 'black', value: 7 } }] };
    expect(validateStoredMeld(group, lookup).ok).toBe(true);
    group.tiles[3]!.represents!.color = 'orange';
    expect(validateStoredMeld(group, lookup).ok).toBe(false);
    const runTiles = [tile(1, 'red', 7), joker(2), joker(3)];
    const run: Meld = { id: 'run', type: 'run', tiles: [{ tileId: 3, represents: { color: 'red', value: 8 } }, { tileId: 1 }, { tileId: 2, represents: { color: 'red', value: 6 } }] };
    expect(validateStoredMeld(run, tileMap(runTiles)).ok).toBe(true);
    run.tiles[0]!.represents!.value = 14;
    expect(validateStoredMeld(run, tileMap(runTiles)).ok).toBe(false);
  });
  it('allows adding the other missing color to a group containing a joker', () => {
    const tiles = [tile(1, 'red', 7), tile(2, 'blue', 7), joker(3), tile(4, 'black', 7)];
    expect(validateTurn({
      before: { hand: [4], hasInitialMeld: true, table: [{ id: 'group', type: 'group', tiles: [{ tileId: 1 }, { tileId: 2 }, { tileId: 3, represents: { color: 'black', value: 7 } }] }] },
      after: { hand: [], table: [{ id: 'group', type: 'group', tiles: [{ tileId: 1 }, { tileId: 2 }, { tileId: 4 }, { tileId: 3, represents: { color: 'orange', value: 7 } }] }] },
      config: defaultRuleConfig, tiles,
    }).ok).toBe(true);
  });
  it('scores a stalemate to zero sum', () => { const scores = scoreStalemate({ a: [1], b: [2] }, [tile(1, 'red', 3), tile(2, 'blue', 8)]); expect(Object.values(scores.deltas).reduce((a, b) => a + b, 0)).toBe(0); });
  it('keeps a lookup stable', () => expect(tileMap(createDeck()).size).toBe(106));
});
