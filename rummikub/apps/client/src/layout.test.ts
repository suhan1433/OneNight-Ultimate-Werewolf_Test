import { fitHand, fitMobileHand, handSpare, mobileHandSpare, normalizeSlots, placeInSlots, arrangeSlots, slotLine, linked, layoutTable, findSpot, hitMeld, meldSize, meldInsertIndex, MELD, type Rect, type Slots } from './layout';
import type { Tile } from '@rummikub/rules';
let fails = 0; const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const T = (id: number, color: any, value: number): Tile => ({ id, kind: 'number', color, value } as Tile);
const J = (id: number): Tile => ({ id, kind: 'joker' } as Tile);
const cnt = (s: Slots) => s.filter(v => v !== null).length;
const ids = (s: Slots) => s.filter((v): v is number => v !== null).sort((a, b) => a - b).join();

/* ── 손패 맞춤 ── */
{ const W = 720, budget = 115;
  const f14 = fitHand(14, W, budget, 44), f30 = fitHand(30, W, budget, 44), f44 = fitHand(44, W, budget, 44);
  ok([f14, f30, f44].every(f => f.h <= budget), `높이 예산 준수 (${f14.tw}/${f30.tw}/${f44.tw}px)`);
  ok(f14.cells >= 14 + handSpare(14) && f30.cells >= 30 + handSpare(30) && f44.cells >= 44 + handSpare(44), '칸 수 ≥ 타일 + 여유');
  ok(f14.tw >= f30.tw && f30.tw >= f44.tw && f44.tw >= 20, '타일이 늘면 작아지되 최소 크기 이상');
  ok(f14.cols * (f14.tw + 3) <= W + 3, '한 줄 칸 수가 폭을 넘지 않는다'); }

/* ── 칸 배치 ── */
for (const [W, H] of [[530, 320], [640, 390], [780, 430]]) {
  const counts = [14, 24, 36, 44];
  const fits = counts.map(n => fitMobileHand(n, W!, H!));
  ok(fits.every((f, i) => f.cells >= counts[i]! + mobileHandSpare(counts[i]!) && f.h <= H! * 0.32), `모바일 ${W}×${H}: 손패가 늘어도 랙 높이 예산 준수`);
  ok(fits.every((f, i) => i === 0 || f.tw <= fits[i - 1]!.tw) && fits[0]!.tw > fits[3]!.tw, `모바일 ${W}×${H}: 장수가 많아지면 자동 축소 (${fits.map(f => f.tw).join('/')})`);
  const few = layoutTable([{ id: 'a', n: 3 }], W!, 140, 33);
  const many = layoutTable(Array.from({ length: 16 }, (_, i) => ({ id: `${i}`, n: 4 })), W!, 140, 33);
  ok(many.tw === few.tw && many.height > few.height && many.rects.size === 16, `모바일 ${W}×${H}: 타일 크기를 유지하며 테이블 자동 확장`);
}

{ const cols = 10, cells = 20;
  const s0 = arrangeSlots([[1, 2, 3], [4, 5, 6, 7], [8]], cols, cells)!;
  ok(s0.slice(0, 9).join() === '1,2,3,,4,5,6,7,' && s0[8] === null && s0[9] === 8, 'arrange: 묶음 사이 빈 칸 1개 (' + s0.slice(0, 10).join('|') + ')');
  ok(arrangeSlots([[1, 2, 3, 4, 5, 6, 7, 8]], 4, 6) === null, 'arrange: 칸이 모자라면 null');
  const rowWrap = arrangeSlots([[1, 2, 3, 4, 5, 6], [7, 8, 9, 10]], cols, cells)!;
  ok(rowWrap[10] === 7, 'arrange: 한 줄에 못 들어가는 묶음은 다음 줄 처음으로');
  // 빈 칸에 놓기
  let s = placeInSlots(s0, [8], 15, cols); ok(s[15] === 8 && s[9] === null && cnt(s) === 8, 'place: 빈 칸으로 이동(원래 칸은 비움)');
  // 여러 장을 연속으로
  s = placeInSlots(s0, [1, 2, 3], 12, cols); ok(s.slice(12, 15).join() === '1,2,3' && s[0] === null, 'place: 여러 장을 연속 칸에');
  // 찬 칸에 놓으면 오른쪽으로 밀어 끼운다
  s = placeInSlots(s0, [8], 1, cols); ok(s[1] === 8 && s.slice(0, 5).join() === '1,8,2,3,4' && cnt(s) === 8 && ids(s) === '1,2,3,4,5,6,7,8', 'place: 찬 칸에 끼우면 같은 줄 빈 칸까지 밀림 (' + s.slice(0, 6).join('|') + ')');
  // 줄 끝에서 오른쪽에 빈 칸이 없으면 왼쪽으로 민다
  const full: Slots = [1, 2, 3, 4, 5, 6, 7, 8, null, 9, ...Array(10).fill(null)];
  s = placeInSlots(full, [20 as any].slice(0, 0).concat([99]), 7, cols); ok(ids(s) === '1,2,3,4,5,6,7,8,9,99' && s.includes(99), 'place: 줄이 거의 차도 타일을 잃지 않는다');
  // 한 줄에 들어가는 묶음은 줄 끝에 걸치지 않는다
  s = placeInSlots(Array(20).fill(null), [1, 2, 3], 9, cols); ok(s.slice(7, 10).join() === '1,2,3', 'place: 줄 끝에 걸치면 왼쪽으로 당겨 한 줄 유지'); }
{ const prev: Slots = [1, null, 2, null, 3, null]; const home = new Map([[4, 3]]);
  const n1 = normalizeSlots(prev, [1, 2, 3, 4], 6, home); ok(n1.join() === '1,,2,4,3,' , 'normalize: 돌아온 타일은 원래 칸(home)으로');
  const n2 = normalizeSlots(prev, [1, 2, 3, 9], 6); ok(n2[5] === 9 || n2[1] === 9 || n2.includes(9), 'normalize: 새 타일 배치') ;
  const n3 = normalizeSlots(prev, [1, 3], 6); ok(n3.join() === '1,,,,3,', 'normalize: 사라진 타일 자리는 빈 칸으로 남는다 (' + n3.join('|') + ')');
  const n4 = normalizeSlots(prev, [1, 2, 3], 4); ok(ids(n4) === '1,2,3' && n4.length === 4, 'normalize: 칸 수가 줄어도 타일은 모두 남는다'); }
{ const pool = new Map<number, Tile>([[1, T(1, 'red', 3)], [2, T(2, 'red', 4)], [3, T(3, 'red', 5)], [4, T(4, 'blue', 5)], [5, T(5, 'black', 5)], [6, T(6, 'red', 9)], [7, J(7)]]);
  const t = (id: number) => pool.get(id);
  const row: Slots = [1, 2, 3, 4, 5, null, 6, 7, null, null];
  ok(slotLine(row, 10, t, 2).join() === '1,2,3,4,5', 'slotLine: 런+그룹으로 이어짐');
  ok(slotLine(row, 10, t, 6).join() === '6,7', 'slotLine: 조커는 이웃과 이어짐, 빈 칸에서 멈춤');
  ok(slotLine([1, 2, 3, 4, 5], 3, t, 3).join() === '1,2,3', 'slotLine: 줄 경계를 넘지 않는다'); }

/* ── 테이블 자유 배치 ── */
const noOverlap = (rs: Rect[]) => rs.every((a, i) => rs.every((b, j) => i === j || a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y));
const inside = (rs: Rect[], W: number, H: number) => rs.every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 0.5 && r.y + r.h <= H + 0.5);
{ const W = 640, H = 200, items = [6, 4, 3, 5, 3, 4, 3, 6, 3].map((n, i) => ({ id: 'm' + i, n }));
  const L = layoutTable(items, W, H, 52); const rs = [...L.rects.values()];
  ok(L.fits && rs.length === items.length && noOverlap(rs) && inside(rs, W, L.height), `자동 배치: 겹치지 않고 캔버스 안에 (tw=${L.tw})`);
  const L2 = layoutTable(items.slice(0, 3), W, H, 52); ok(L2.tw === L.tw && L.height > L2.height, '조합이 늘어나면 타일 크기 대신 공간이 늘어난다');
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 'x' + i, n: 4 })); const Lm = layoutTable(many, W, H, 52);
  ok(noOverlap([...Lm.rects.values()]) && Lm.tw >= MELD.min, `30개도 겹침 없이 (tw=${Lm.tw}, fits=${Lm.fits})`); }
{ // 저장된 위치를 지킨다
  const W = 640, H = 240, items = [{ id: 'a', n: 3, pos: { fx: 0.6, fy: 0.5 } }, { id: 'b', n: 3 }];
  const L = layoutTable(items, W, H, 40), a = L.rects.get('a')!;
  ok(Math.abs(a.x - 0.6 * W) < 1 && Math.abs(a.y - 0.5 * H) < 1, '저장된 위치를 그대로 쓴다'); }
{ // 커진 조합이 이웃을 밀어낸다(타일은 줄지 않는다)
  const W = 640, H = 240, tw = 40; const w3 = meldSize(3, tw).w, w6 = meldSize(6, tw).w;
  const before = layoutTable([{ id: 'a', n: 3, pos: { fx: 0, fy: 0 } }, { id: 'b', n: 3, pos: { fx: (w3 + 12) / W, fy: 0 } }], W, H, tw);
  const after = layoutTable([{ id: 'a', n: 6, pos: { fx: 0, fy: 0 } }, { id: 'b', n: 3, pos: { fx: (w3 + 12) / W, fy: 0 } }], W, H, tw, new Set(['a']));
  const a = after.rects.get('a')!, b = after.rects.get('b')!;
  ok(after.tw === before.tw && a.x === 0 && a.w === w6 && noOverlap([a, b]), '조합이 커지면 포커스한 쪽은 그대로, 이웃이 밀려난다'); }
{ // 가장 가까운 빈 자리
  const placed: Rect[] = [{ x: 100, y: 0, w: 200, h: 80 }];
  const s = findSpot(placed, 120, 80, 640, 200, { x: 150, y: 10 })!; const r = { x: s.x, y: s.y, w: 120, h: 80 };
  ok(noOverlap([r, ...placed]) && Math.hypot(s.x - 150, s.y - 10) < 100, 'findSpot: 겹치면 가장 가까운 빈 자리로 비켜선다 (' + s.x + ',' + s.y + ')');
  ok(findSpot([{ x: 0, y: 0, w: 640, h: 200 }], 50, 50, 640, 200) === null, 'findSpot: 자리가 없으면 null'); }
// Dense late-game tables retain readable tiles and an empty drop area.
for (const [W, H] of [[460, 150], [720, 180], [330, 330]]) {
  for (const counts of [Array(26).fill(4), [13, 13, 13, 13, 13, 13, 13, 13], Array(35).fill(3)]) {
    const items = counts.map((n, i) => ({ id: `dense-${i}`, n, pos: { fx: (i % 5) * .18, fy: (i % 4) * .22 } }));
    const L = layoutTable(items, W!, H!, 38), rs = [...L.rects.values()];
    ok(L.fits && rs.length === items.length && noOverlap(rs) && inside(rs, W!, L.height) && L.tw >= MELD.min, `확장 테이블: ${W}×${H}, ${counts.reduce((a, b) => a + b, 0)}장`);
    const spare = meldSize(3, L.tw);
    ok(!!findSpot(rs, spare.w, spare.h, W!, L.height), '꽉 찬 테이블에도 새 조합을 놓을 빈자리 유지');
  }
}
{
  const W = 460, H = 150;
  const initial = layoutTable(Array.from({ length: 20 }, (_, i) => ({ id: `stable-${i}`, n: 4 })), W, H, 38);
  const items = [...initial.rects].map(([id, r]) => ({ id, n: 4, pos: { fx: r.x / W, fy: r.y / H } }));
  const next = layoutTable([...items, { id: 'extra', n: 4 }], W, H, 38);
  ok(items.every(it => {
    const before = initial.rects.get(it.id)!, after = next.rects.get(it.id)!;
    return before.x === after.x && before.y === after.y;
  }), '캔버스가 확장되어도 화면 아래쪽까지 기존 조합 위치 유지');
  const reserved = layoutTable(items, W, H, 38, new Set(), 8), spare = meldSize(8, reserved.tw);
  ok(!!findSpot([...reserved.rects.values()], spare.w, spare.h, W, reserved.height), '여러 장을 끌 때 선택한 묶음 크기만큼 빈자리 확보');
  ok(fitMobileHand(14, 780, 390).tw >= 36, '일반 모바일 손패는 기존보다 조금 더 큰 크기로 표시');
}
{
  const r = { x: 100, y: 50, ...meldSize(3, 38) };
  ok(!hitMeld(r, 99, 80) && !hitMeld(r, r.x + r.w + 1, 80), '조합 양옆 빈틈은 합치기 영역에서 제외');
  ok(!hitMeld(r, 120, 49) && !hitMeld(r, 120, r.y + r.h + 1), '조합 위아래 빈틈은 새 조합 영역');
  ok(hitMeld(r, 120, 80), '기존 조합 몸체에 놓으면 이어 붙이기 가능');
}
for (const [W, H] of [[460, 320], [720, 390], [280, 568], [350, 844]]) {
  for (const n of [14, 24, 44, 80]) {
    const f = fitMobileHand(n, W!, H!);
    const contentH = f.rows * (Math.round(f.tw * 1.4) + 10) + 14;
    ok(contentH <= f.h && f.cells >= n + mobileHandSpare(n), `손패 숨김 없음: ${W}×${H}, ${n}장`);
  }
}
{
  const tw = 30, n = 4, pad = MELD.padX / 2;
  ok(meldInsertIndex(-20, n, tw) === 0 && meldInsertIndex(999, n, tw) === n, '삽입: 양 끝에서 앞/뒤로 제한');
  for (let i = 0; i < n; i++) {
    const left = pad + i * (tw + MELD.gapT);
    ok(meldInsertIndex(left + tw * .2, n, tw) === i && meldInsertIndex(left + tw * .8, n, tw) === i + 1, `삽입: ${i}번 타일 왼쪽/오른쪽 반쪽 구분`);
  }
}
{
  const slots: Slots = [1, 2, 3, 4, 5, null, null, null, null, null];
  const preview = placeInSlots(slots, [1, 2, 3], 4, 5);
  ok(preview[2] === 1 && preview[3] === 2 && preview[4] === 3 && ids(preview) === '1,2,3,4,5', '여러 장 줄 끝 삽입: 미리보기용 결과가 한 줄에 들어가고 타일 보존');
  ok(placeInSlots(slots, Array.from({ length: 11 }, (_, i) => i + 20), 9, 5) === slots, '손패 공간보다 큰 선택은 미리보기 배열을 손상하지 않는다');
}
{
  const base: Slots = [...Array.from({ length: 24 }, (_, i) => i + 1), ...Array(6).fill(null)];
  let preserves = true;
  for (const selected of [[2], [2, 11], [2, 11, 19], [2, 11, 19, 24]]) {
    for (let at = 0; at < base.length; at++) {
      const result = placeInSlots(base, selected, at, 10), first = result.indexOf(selected[0]!);
      const others = result.filter(id => id !== null && !selected.includes(id));
      preserves &&= ids(result) === ids(base) && new Set(result.filter(id => id !== null)).size === 24;
      preserves &&= result.slice(first, first + selected.length).join() === selected.join() && Math.floor(first / 10) === Math.floor((first + selected.length - 1) / 10);
      preserves &&= others.join() === base.filter(id => id !== null && !selected.includes(id)).join();
    }
  }
  ok(preserves, '꽉 찬 랙 120개 삽입 위치: 묶음 연속성, 나머지 순서, 타일 수 모두 보존');
}
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
