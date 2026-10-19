import { checkMeld, readRun, ORDER_HINT, type Validate } from './meldRules';
import type { Meld, Tile } from '@rummikub/rules';
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const T = (id: number, color: any, value: number): Tile => ({ id, kind: 'number', color, value } as Tile);
const J = (id: number): Tile => ({ id, kind: 'joker' } as Tile);
const pool = new Map<number, Tile>(); const add = (t: Tile) => (pool.set(t.id, t), t);
const [r4, r5, r6, r7, r12, r13] = [4, 5, 6, 7, 12, 13].map(v => add(T(v, 'red', v)));
const b9 = add(T(21, 'blue', 9)), k9 = add(T(22, 'black', 9)), r9 = add(T(23, 'red', 9)), j = add(J(40)), o9 = add(T(24, 'orange', 9));
// 집합 수준 검증기(서버 validateMeld 대역): 순서를 보지 않는다
const COLORS = ['red', 'blue', 'orange', 'black'];
const validate: Validate = (tiles, _a, id) => {
  if (tiles.length < 3) return { ok: false };
  const nums = tiles.filter((t): t is Extract<Tile, { kind: 'number' }> => t.kind === 'number'); if (!nums.length) return { ok: false };
  if (nums.every(t => t.value === nums[0]!.value) && tiles.length <= 4) { const cs = nums.map(t => t.color); if (new Set(cs).size !== cs.length) return { ok: false }; const free = COLORS.filter(c => !cs.includes(c)); let k = 0;
    return { ok: true, meld: { id, type: 'group', tiles: tiles.map(t => t.kind === 'joker' ? { tileId: t.id, represents: { color: free[k++] as any, value: nums[0]!.value } } : { tileId: t.id }) } as Meld }; }
  if (!nums.every(t => t.color === nums[0]!.color)) return { ok: false };
  const vs = nums.map(t => t.value).sort((a, b) => a - b); if (new Set(vs).size !== vs.length) return { ok: false };
  const n = tiles.length; if (vs[vs.length - 1]! - vs[0]! + 1 > n || n > 13) return { ok: false };
  return { ok: true, meld: { id, type: 'run', tiles: tiles.map(t => ({ tileId: t.id })) } as Meld }; // 일부러 조커 표현값을 비운다 → checkMeld가 채워야 한다
};
const mk = (...ts: Tile[]): Meld => ({ id: 'm', type: 'run', tiles: ts.map(t => ({ tileId: t.id })) } as Meld);
const chk = (...ts: Tile[]) => checkMeld(mk(...ts), id => pool.get(id), false, validate);

const [a5, a6, a7] = [r5, r6, r7];
ok(chk(a5, a6, a7).ok, '5·6·7 유효');
{ const r = chk(a6, a5, a7); ok(!r.ok && (r as any).reason === ORDER_HINT, '6·5·7 은 순서 때문에 무효 + 이유 안내'); }
ok(!chk(a7, a6, a5).ok, '내림차순 7·6·5 도 무효(왼쪽→오른쪽으로 커져야 함)');
{ const r = chk(r4, a5, a6, a7); ok(r.ok, '4·5·6·7 유효'); }
{ const t = add(T(30, 'red', 8)); const r = chk(a5, a6, a7, t); ok(r.ok, '5·6·7·8 유효'); }
// 조커 표현값은 놓인 자리 기준
{ const r = chk(a5, j, a7); ok(r.ok && (r as any).meld.tiles[1].represents.value === 6, '[5,J,7] → 조커는 6'); }
{ const r = chk(j, a5, a6); ok(r.ok && (r as any).meld.tiles[0].represents.value === 4, '[J,5,6] → 조커는 4'); }
{ const r = chk(a5, a6, j); ok(r.ok && (r as any).meld.tiles[2].represents.value === 7, '[5,6,J] → 조커는 7'); }
{ const r = chk(r12, r13, j); ok(!r.ok, '[12,13,J] → 14는 없으므로 무효(조커를 앞으로 옮겨야 함)'); }
{ const r = chk(j, r12, r13); ok(r.ok && (r as any).meld.tiles[0].represents.value === 11, '[J,12,13] → 11'); }
// 그룹은 순서 무관, 조커 색은 채워진다
ok(chk(b9, k9, r9).ok && chk(r9, b9, k9).ok, '그룹 9는 어떤 순서든 유효');
{ const r = chk(r9, b9, j); ok(r.ok && !!(r as any).meld.tiles[2].represents, '그룹의 조커에 색이 채워진다'); }
ok(!chk(r9, b9, add(T(25, 'red', 9))).ok, '같은 색 9 두 장은 그룹 무효');
ok(readRun([a5, a7, a6]) === null && readRun([a5, a6, a7]) !== null, 'readRun');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
