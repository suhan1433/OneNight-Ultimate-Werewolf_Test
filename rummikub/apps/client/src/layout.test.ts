import { fitHand, fitTable, handLine, handRows, HAND, TABLE } from './layout';
import type { Tile } from '@rummikub/rules';
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const T = (id: number, color: any, value: number): Tile => ({ id, kind: 'number', color, value } as Tile);
const J = (id: number): Tile => ({ id, kind: 'joker' } as Tile);

// 그리디 줄바꿈 실제 시뮬레이션과 비교: 상한이 항상 실제 줄 수 이상인지(= 절대 안 넘치는지)
const simRows = (n: number, breakAt: Set<number>, tw: number, W: number) => { let rows = 1, x = 0; for (let i = 0; i < n; i++) { const w = tw + HAND.gapX + (breakAt.has(i) ? HAND.brk : 0); if (x > 0 && x + w > W) { rows++; x = w; } else x += w; } return rows; };
let safe = true;
for (let n = 8; n <= 48; n++) for (let tw = 22; tw <= 46; tw += 3) for (const W of [560, 700, 820]) for (let b = 0; b <= 8; b += 2) {
  const set = new Set<number>(); for (let k = 1; k <= b; k++) set.add(Math.floor(k * n / (b + 1)));
  if (handRows(n, b, tw, W) < simRows(n, set, tw, W)) safe = false;
}
ok(safe, 'handRows 상한은 실제 줄 수보다 작지 않다');

const budget = 115, W = 720;
const h14 = fitHand(14, 4, W, budget, 44), h30 = fitHand(30, 4, W, budget, 44), h44 = fitHand(44, 4, W, budget, 44);
ok(h14.h <= budget && h30.h <= budget && h44.h <= budget, `손패 높이 예산 준수 (${h14.tw}/${h30.tw}/${h44.tw}px)`);
ok(h14.tw >= h30.tw && h30.tw >= h44.tw, '타일이 늘면 타일은 같거나 작아진다');
ok(h14.tw >= 34, '시작 손패 14장은 34px 이상');
ok(h44.tw >= HAND.min, '44장도 최소 크기 이상');

const Wt = 640, Ht = 200;
const few = fitTable([3, 3, 4], true, Wt, Ht, 56), many = fitTable([3,3,3,4,4,5,3,3,6,3,4,3], true, Wt, Ht, 56);
ok(few > many && many >= TABLE.min, `조합이 많으면 작아진다 (${few} > ${many})`);
{ const t = fitTable([13], false, 420, 200, 56); ok(t * 13 + 24 + TABLE.padX <= 420, '13장 런이 가로폭을 넘지 않는다 (' + t + 'px)'); }

const hand = [T(1,'red',3),T(2,'red',4),T(3,'red',5),T(4,'blue',5),T(5,'black',5),T(6,'red',9),J(7)];
const none = new Set<number>();
ok(handLine(hand, none, 2).slice(0,3).join() === '1,2,3', '런 이어짐');
ok(handLine(hand, none, 3).join() === '1,2,3,4,5', '런 + 같은 숫자 그룹으로 이어짐');
ok(handLine(hand, new Set([4]), 3).join() === '1,2,3', '묶음 구분선에서 멈춤');
ok(handLine(hand, none, 6).join() === '6,7', '조커는 이웃과 이어짐');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
