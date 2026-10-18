import { describe, expect, it } from 'vitest';
import { createDeck, defaultRuleConfig, scoreStalemate, tileMap, validateMeld, validateTurn, type NumberTile } from './index.js';
const tile = (id: number, color: NumberTile['color'], value: number): NumberTile => ({ id, kind: 'number', color, value });
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
  it('scores a stalemate to zero sum', () => { const scores = scoreStalemate({ a: [1], b: [2] }, [tile(1, 'red', 3), tile(2, 'blue', 8)]); expect(Object.values(scores.deltas).reduce((a, b) => a + b, 0)).toBe(0); });
  it('keeps a lookup stable', () => expect(tileMap(createDeck()).size).toBe(106));
});
