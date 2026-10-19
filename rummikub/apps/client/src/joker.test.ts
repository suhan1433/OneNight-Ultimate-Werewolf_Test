import assert from 'node:assert/strict';
import { defaultRuleConfig, orderMeld, tileMap, validateMeld, validateTurn, type Meld, type Tile } from '@rummikub/rules';
import { moveTiles, swapJoker, type Ctx } from './editor';
import { checkMeld } from './meldRules';

const tiles: Tile[] = [
  { id: 1, kind: 'joker' },
  { id: 2, kind: 'number', color: 'red', value: 7 },
  { id: 3, kind: 'number', color: 'red', value: 8 },
  { id: 4, kind: 'number', color: 'red', value: 5 },
  { id: 5, kind: 'number', color: 'blue', value: 10 },
  { id: 6, kind: 'number', color: 'blue', value: 11 },
  { id: 7, kind: 'number', color: 'red', value: 6 },
  { id: 8, kind: 'number', color: 'blue', value: 5 },
  { id: 9, kind: 'number', color: 'black', value: 5 },
  { id: 10, kind: 'number', color: 'orange', value: 5 },
];
const lookup = tileMap(tiles);
const check = (m: Meld) => checkMeld(m, id => lookup.get(id), true, validateMeld);
const ctx: Ctx = {
  tile: id => lookup.get(id), orig: new Set([1, 2, 3]), newId: () => 'reused',
  fix: m => { const r = check(m); return r.ok ? r.meld : m; }, ok: m => check(m).ok,
};
const meld = (ids: number[], value: number): Meld => ({ id: 'run', type: 'run', tiles: ids.map(tileId => tileId === 1 ? { tileId, represents: { color: 'red', value } } : { tileId }) });
const original = meld([1, 2, 3], 6);
const draft = { table: [orderMeld(original, lookup)], hand: [tiles[3]!] };
const extended = moveTiles(draft, [4], { to: 'meld', meldId: 'run', index: 0 }, ctx);
assert(extended.ok);
assert.equal(extended.draft.table[0]!.tiles[1]!.represents!.value, 6);
assert.deepEqual(validateTurn({ before: { table: [original], hand: [4], hasInitialMeld: true }, after: { table: extended.draft.table, hand: [] }, config: defaultRuleConfig, tiles }), { ok: true });

// Server representations must survive receipt, even for an ambiguous run.
const trailing = orderMeld(meld([1, 2, 3], 9), lookup);
assert.deepEqual(trailing.tiles.map(e => e.tileId), [2, 3, 1]);
assert.equal(check(trailing).ok, true);
assert.equal(trailing.tiles[2]!.represents!.value, 9);

// Official example: 6-7-J + 5 -> 5-6-7, then reuse J with blue 10-11.
const source = meld([7, 2, 1], 8);
const swapped = swapJoker({ table: [source], hand: [tiles[3]!, tiles[4]!, tiles[5]!] }, 'run', 1, 4, ctx);
assert(swapped.ok);
assert.deepEqual(swapped.draft.table[0]!.tiles.map(e => e.tileId), [4, 7, 2]);
const reused = moveTiles(swapped.draft, [5, 6], { to: 'meld', meldId: 'reused', index: 0 }, ctx);
assert(reused.ok);
assert.deepEqual(validateTurn({ before: { table: [source], hand: [4, 5, 6], hasInitialMeld: true }, after: { table: reused.draft.table, hand: [] }, config: defaultRuleConfig, tiles }), { ok: true });
assert.equal(swapJoker(draft, 'run', 1, 4, ctx).ok, false); // 5-7-8 leaves a gap.

const other: Meld = { id: 'other', type: 'group', tiles: [4, 8, 9, 10].map(tileId => ({ tileId })) };
const fromTable = swapJoker({ hand: [tiles[4]!, tiles[5]!], table: [source, other] }, 'run', 1, 4, ctx);
assert(fromTable.ok);
assert.equal(fromTable.draft.table.flatMap(m => m.tiles).filter(e => e.tileId === 4).length, 1);
assert.equal(fromTable.draft.table.find(m => m.id === 'other')!.tiles.length, 3);
const tableReused = moveTiles(fromTable.draft, [5, 6], { to: 'meld', meldId: 'reused', index: 0 }, ctx);
assert(tableReused.ok);
assert.deepEqual(validateTurn({ before: { table: [source, other], hand: [5, 6], hasInitialMeld: true }, after: { table: tableReused.draft.table, hand: [] }, config: defaultRuleConfig, tiles }), { ok: true });

const groupTiles: Tile[] = [{ id: 10, kind: 'number', color: 'red', value: 7 }, { id: 11, kind: 'number', color: 'blue', value: 7 }, tiles[0]!];
const groupLookup = tileMap(groupTiles);
const group: Meld = { id: 'group', type: 'group', tiles: [{ tileId: 10 }, { tileId: 11 }, { tileId: 1, represents: { color: 'orange', value: 7 } }] };
const checkedGroup = checkMeld(group, id => groupLookup.get(id), true, validateMeld);
assert(checkedGroup.ok);
assert.equal(checkedGroup.meld.tiles[2]!.represents!.color, 'orange');
console.log('Joker client/server regressions passed');
