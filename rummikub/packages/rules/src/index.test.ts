import { describe, expect, it } from 'vitest';
import { createDeck, defaultRuleConfig, scoreStalemate, tileMap, validateMeld, validateTurn, type NumberTile } from './index.js';
const tile = (id: number, color: NumberTile['color'], value: number): NumberTile => ({ id, kind: 'number', color, value });
describe('Sabra rules', () => {
  it('creates the official 106-tile deck', () => expect(createDeck()).toHaveLength(106));
  it('accepts runs and groups, but not 12-13-1', () => { expect(validateMeld([tile(1, 'red', 1), tile(2, 'red', 2), tile(3, 'red', 3)]).ok).toBe(true); expect(validateMeld([tile(4, 'red', 12), tile(5, 'red', 13), tile(6, 'red', 1)]).ok).toBe(false); expect(validateMeld([tile(7, 'red', 7), tile(8, 'blue', 7), tile(9, 'orange', 7)]).ok).toBe(true); });
  it('enforces the first-meld point threshold', () => { const deck = [tile(1, 'red', 8), tile(2, 'red', 9), tile(3, 'red', 10), tile(4, 'red', 11)]; const good = validateMeld(deck.slice(1), true, 'm'); expect(good.ok).toBe(true); if (good.ok) { expect(validateTurn({ before: { table: [], hand: [1, 2, 3, 4], hasInitialMeld: false }, after: { table: [good.meld], hand: [1] }, config: defaultRuleConfig, tiles: deck }).ok).toBe(true); const bad = validateMeld(deck.slice(0, 3), true, 'b'); expect(bad.ok).toBe(true); if (bad.ok) expect(validateTurn({ before: { table: [], hand: [1, 2, 3, 4], hasInitialMeld: false }, after: { table: [bad.meld], hand: [4] }, config: defaultRuleConfig, tiles: deck }).ok).toBe(false); } });
  it('scores a stalemate to zero sum', () => { const scores = scoreStalemate({ a: [1], b: [2] }, [tile(1, 'red', 3), tile(2, 'blue', 8)]); expect(Object.values(scores.deltas).reduce((a, b) => a + b, 0)).toBe(0); });
  it('keeps a lookup stable', () => expect(tileMap(createDeck()).size).toBe(106));
});
