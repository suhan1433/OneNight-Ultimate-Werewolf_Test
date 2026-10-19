import { moveTiles, splitMeld, mergeMelds, swapJoker, signature, mergeHandOrder, whyInvalid, type Draft, type Ctx } from './editor';
import type { Meld, Tile } from '@rummikub/rules';
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const T = (id: number, color: any, value: number): Tile => ({ id, kind: 'number', color, value } as Tile);
const J = (id: number): Tile => ({ id, kind: 'joker' } as Tile);
const pool = new Map<number, Tile>();
const add = (t: Tile) => (pool.set(t.id, t), t);
// 테이블: A=red 3..8 (ids 1-6), B=blue 5,6,7 (ids 11-13), C=group 9: red/blue/black (21-23)
[3,4,5,6,7,8].forEach((v, i) => add(T(1 + i, 'red', v)));
[5,6,7].forEach((v, i) => add(T(11 + i, 'blue', v)));
(['red','blue','black'] as const).forEach((c, i) => add(T(21 + i, c, 9)));
// 손패: blue 1,2,3,4 (31-34), red 7 (35), 8 (36), 9(37), 10(38), joker 40
[1,2,3,4].forEach((v, i) => add(T(31 + i, 'blue', v))); [7,8,9,10].forEach((v, i) => add(T(35 + i, 'red', v))); add(J(40));
const ids = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mk = (id: string, type: any, list: number[]): Meld => ({ id, type, tiles: list.map(tileId => ({ tileId })) } as Meld);
const base: Draft = { hand: ids(31, 38).concat([40]).map(i => pool.get(i)!), table: [mk('A','run',ids(1,6)), mk('B','run',ids(11,13)), mk('C','group',ids(21,23))] };
const orig = new Set([...ids(1,6), ...ids(11,13), ...ids(21,23)]);
let n = 0;
const val = (id: number) => { const t = pool.get(id)!; return t.kind === 'joker' ? 99 : t.value; };
const ctx: Ctx = { tile: id => pool.get(id), orig, newId: () => `n${++n}`, fix: m => (m.type === 'run' ? { ...m, tiles: [...m.tiles].sort((a, b) => val(a.tileId) - val(b.tileId)) } : m) };
const allIds = (d: Draft) => [...d.hand.map(t => t.id), ...d.table.flatMap(m => m.tiles.map(e => e.tileId))].sort((a, b) => a - b);
const total = allIds(base);
const inv = (d: Draft) => JSON.stringify(allIds(d)) === JSON.stringify(total) && new Set(allIds(d)).size === total.length;
const run = (r: any) => { if (!r.ok) throw new Error(r.reason); return r.draft as Draft; };

// A: 부분 조합 제출 — 1,2,3만 내고 4는 남김
{ const d = run(moveTiles(base, [31,32,33], { to: 'new' }, ctx)); ok(d.hand.some(t => t.id === 34) && d.table.at(-1)!.tiles.length === 3 && inv(d), 'A 부분 조합 제출'); }
// B: 7~10 내려놓고 10만 반환
{ let d = run(moveTiles(base, [35,36,37,38], { to: 'new' }, ctx)); d = run(moveTiles(d, [38], { to: 'hand' }, ctx)); ok(d.table.at(-1)!.tiles.length === 3 && d.hand.some(t => t.id === 38) && inv(d), 'B 일부 반환'); }
// 기존 테이블 타일은 손패로 불가
{ const r = moveTiles(base, [1], { to: 'hand' }, ctx); ok(!r.ok, '기존 타일 손패 이동 거부'); }
// C: 3..8 분할(5|6 사이) + 손패 추가
{ let d = run(splitMeld(base, 'A', 3, ctx)); ok(d.table.length === 4 && d.table[0]!.tiles.length === 3 && d.table[1]!.tiles.length === 3 && inv(d), 'C 분할');
  d = run(moveTiles(d, [35], { to: 'meld', meldId: d.table[1]!.id }, ctx)); ok(d.table[1]!.tiles.length === 4 && inv(d), 'C 분할 후 손패 추가'); }
// 분할 경계 거부
{ ok(!splitMeld(base, 'A', 0, ctx).ok && !splitMeld(base, 'A', 6, ctx).ok, '분할 경계 거부'); }
// D: A에서 타일 하나(8) 꺼내 B 중간(index1) 삽입 — 위치 지정 확인 (B는 run 정렬 fix 때문에 값 순으로 정리됨)
{ const d = run(moveTiles(base, [6], { to: 'meld', meldId: 'C', index: 1 }, ctx)); const c = d.table.find(m => m.id === 'C')!; ok(c.tiles.map(e => e.tileId).join() === '21,6,22,23' && d.table.find(m => m.id === 'A')!.tiles.length === 5 && inv(d), 'D 조합 사이 중간 삽입'); }
// 같은 조합 안에서 재배치(인덱스 보정)
{ const d = run(moveTiles(base, [21], { to: 'meld', meldId: 'C', index: 3 }, ctx)); ok(d.table.find(m => m.id === 'C')!.tiles.map(e => e.tileId).join() === '22,23,21', '같은 조합 재배치 인덱스 보정'); }
// E: 세 조합에서 타일 이동 + 새 조합 두 개
{ let d = run(moveTiles(base, [1], { to: 'new' }, ctx)); d = run(moveTiles(d, [11], { to: 'new' }, ctx)); d = run(moveTiles(d, [21, 35], { to: 'new' }, ctx)); ok(d.table.length === 6 && inv(d), 'E 여러 조합 재배치(중간에 무효 조합 허용)'); }
// 합치기
{ const d = run(mergeMelds(base, ['B', 'A'], ctx)); ok(d.table.length === 2 && d.table[0]!.id === 'A' && d.table[0]!.tiles.length === 9 && inv(d), '합치기(테이블 순서 기준 첫 조합)'); }
// 조커 교체
{ const withJ: Draft = { hand: base.hand.filter(t => t.id !== 40), table: [mk('J','run',[ 35, 36, 40 ]), ...base.table] };
  const r = swapJoker(withJ, 'J', 40, 37, ctx); ok(r.ok && r.draft.table.at(-1)!.tiles[0]!.tileId === 40 && !r.draft.table[0]!.tiles.some(e => e.tileId === 40) && r.draft.table[0]!.tiles.some(e => e.tileId === 37), '조커 교체 → 조커 새 조합'); }
// F: Undo/Redo 10회 이동 → 5 undo → 3 redo
{ let cur = base; const past: Draft[] = [], fut: Draft[] = []; const snaps: Draft[] = [base];
  const steps = [[31],[32],[33],[34],[35],[36],[37],[38],[1],[11]];
  steps.forEach(s => { past.push(cur); fut.length = 0; cur = run(moveTiles(cur, s, { to: 'new' }, ctx)); snaps.push(cur); });
  const undo = () => { const s = past.pop()!; fut.push(cur); cur = { hand: mergeHandOrder(cur.hand, s.hand), table: s.table }; };
  const redo = () => { const s = fut.pop()!; past.push(cur); cur = { hand: mergeHandOrder(cur.hand, s.hand), table: s.table }; };
  // 중간에 정렬(손패 순서 변경)해도 undo가 영향 주지 않아야 함
  for (let i = 0; i < 5; i++) undo(); cur = { ...cur, hand: [...cur.hand].reverse() }; for (let i = 0; i < 3; i++) redo();
  ok(inv(cur) && signature(cur) === signature(snaps[8]!), 'F Undo×5 Redo×3 → 8번째 상태와 동일, 타일 보존'); }
// 손패 순서만 변경 → signature 동일(변경 아님)
{ const d2 = { ...base, hand: [...base.hand].reverse() }; ok(signature(d2) === signature(base), '손패 정렬만으로는 변경 아님'); }
// 테이블만 재배치 → 변경 감지
{ const d = run(moveTiles(base, [1], { to: 'new' }, ctx)); ok(signature(d) !== signature(base) && d.hand.length === base.hand.length, '테이블만 재배치해도 변경 감지'); }
// Run order changes validity and must keep reset/commit controls in edit mode.
{ const d = { ...base, table: base.table.map(m => m.id === 'A' ? { ...m, tiles: [...m.tiles].reverse() } : m) };
  ok(signature(d) !== signature(base), '런 순서 변경도 편집으로 감지'); }
{ const d = { ...base, table: [...base.table].reverse().map(m => m.type === 'group' ? { ...m, tiles: [...m.tiles].reverse() } : m) };
  ok(signature(d) === signature(base), '조합 위치/그룹 내부 순서는 게임 변경 아님'); }
// 같은 상태로 되돌리면 변경 아님
{ let d = run(moveTiles(base, [6], { to: 'new' }, ctx)); d = run(moveTiles(d, [6], { to: 'meld', meldId: 'A' }, ctx)); ok(signature(d) === signature(base), '이동 후 원복 → 변경 아님'); }

// ── 자동 분할 / 정리 ──
add(T(41, 'red', 9));
const validTiles = (m: Meld) => { const ts = m.tiles.map(e => pool.get(e.tileId)!); if (ts.length < 3 || ts.some(t => t.kind === 'joker')) return false; const ns = ts as Extract<Tile, { kind: 'number' }>[];
  if (ns.every(t => t.color === ns[0]!.color)) { const v = ns.map(t => t.value).sort((a, b) => a - b); return v.every((x, i) => i === 0 || x === v[i - 1]! + 1); }
  return ns.every(t => t.value === ns[0]!.value) && new Set(ns.map(t => t.color)).size === ns.length && ns.length <= 4; };
const ctx2: Ctx = { ...ctx, ok: validTiles };
const Rd = (list: number[]): Draft => ({ hand: [pool.get(41)!], table: [mk('R', 'run', list)] });
const ids6 = [3, 4, 5, 6, 37, 38]; // red 5,6,7,8,9,10
const tilesOfMeld = (d: Draft, i: number) => d.table[i]!.tiles.map(e => e.tileId).join();
// G: 5..10 의 8·9 사이에 9를 끼우면 5·6·7·8·9 / 9·10 으로 나뉜다
{ const r = moveTiles(Rd(ids6), [41], { to: 'meld', meldId: 'R', index: 4 }, ctx2); const d = run(r);
  ok(d.table.length === 2 && tilesOfMeld(d, 0) === '3,4,5,6,41' && tilesOfMeld(d, 1) === '37,38' && !!(r as any).splitId, 'G 중간 삽입 → 끼운 자리에서 자동 분할'); }
// H: 유효하게 이어지면 나누지 않는다
{ const d = run(moveTiles(Rd([3, 4, 5, 6]), [41], { to: 'meld', meldId: 'R', index: 2 }, ctx2)); ok(d.table.length === 1 && tilesOfMeld(d, 0) === '3,4,5,6,41', 'H 유효한 삽입은 분할 없음'); }
// I: ok가 없으면(기존 동작) 분할하지 않는다
{ const d = run(moveTiles(Rd(ids6), [41], { to: 'meld', meldId: 'R', index: 4 }, ctx)); ok(d.table.length === 1, 'I ctx.ok 없으면 분할 없음(하위 호환)'); }
// J: 맨 끝/맨 앞에 놓는 건 분할하지 않는다
{ const d = run(moveTiles(Rd(ids6), [41], { to: 'meld', meldId: 'R', index: 0 }, ctx2)); ok(d.table.length === 1, 'J 가장자리 삽입은 분할 없음'); }
// L: 순서까지 보는 검사(ctx.ok)에서도 끼운 자리에서 분할된다 / 순서가 틀어진 삽입은 분할 없이 무효로 남는다
{ const mini = (tiles: Tile[], _a: boolean, id: string) => ({ ok: validTiles({ id, type: 'run', tiles: tiles.map(t => ({ tileId: t.id })) } as Meld) });
  const strictOk = (m: Meld) => { const ts = m.tiles.map(e => pool.get(e.tileId)!); if (!mini(ts, false, m.id).ok) return false; const ns = ts as Extract<Tile, { kind: 'number' }>[]; return ns.every(t => t.color !== ns[0]!.color) || ns.every((t, i) => i === 0 || t.value === ns[i - 1]!.value + 1); };
  const ctx3: Ctx = { ...ctx, fix: m => m, ok: strictOk };
  let d = run(moveTiles(Rd(ids6), [41], { to: 'meld', meldId: 'R', index: 4 }, ctx3)); ok(d.table.length === 2 && tilesOfMeld(d, 0) === '3,4,5,6,41' && tilesOfMeld(d, 1) === '37,38', 'L 순서 검사에서도 8·9 사이 삽입은 5~9 / 9·10');
  d = run(moveTiles(Rd([3, 4, 5, 6]), [41], { to: 'meld', meldId: 'R', index: 2 }, ctx3)); ok(d.table.length === 1 && tilesOfMeld(d, 0) === '3,4,41,5,6', 'L 순서가 틀어진 삽입은 그대로(무효 표시는 UI 몫)');
  d = run(moveTiles(Rd([3, 4, 5, 6]), [41], { to: 'meld', meldId: 'R', index: 4 }, ctx3)); ok(d.table.length === 1 && strictOk(d.table[0]!), 'L 순서대로 끝에 놓으면 유효'); }
ok(whyInvalid([pool.get(1)!, pool.get(2)!]).includes('3장'), 'whyInvalid 3장 미만');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
