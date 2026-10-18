/**
 * 레이아웃/제스처용 순수 함수 — React/DOM 의존 없음.
 * · fitHand : 손패 전체가 스크롤 없이 보이는 가장 큰 타일 크기
 * · fitTable: 테이블의 모든 조합이 스크롤 없이 보이는 가장 큰 타일 크기
 * · handLine: 손패에서 길게 눌렀을 때 "이어진" 타일 줄
 */
import type { Tile } from '@rummikub/rules';

export const HAND = { min: 20, gapX: 3, brk: 10, rowExtra: 10, padY: 14 };
export const TABLE = { min: 22, gapT: 2, padX: 12, gapX: 14, gapY: 18, rowExtra: 18, newW: 1.3 };

/** 손패가 차지하는 줄 수의 "넘지 않는" 상한. 그리디 줄바꿈은 마지막 줄을 뺀 모든 줄이 (W - 타일 - 구분선)보다 꽉 차므로 성립한다. */
export function handRows(n: number, breaks: number, tw: number, W: number): number {
  const per = tw + HAND.gapX;
  const total = n * per + breaks * HAND.brk;
  if (total <= W) return 1;
  const usable = W - per - HAND.brk;
  return usable <= 0 ? n : Math.ceil(total / usable);
}

export function fitHand(n: number, breaks: number, W: number, budgetH: number, max: number): { tw: number; rows: number; h: number } {
  const h = (tw: number, rows: number) => rows * (Math.round(tw * 1.4) + HAND.rowExtra) + HAND.padY;
  if (W <= 0) return { tw: Math.min(max, 32), rows: 1, h: h(Math.min(max, 32), 1) };
  for (let tw = max; tw >= HAND.min; tw--) {
    const rows = handRows(n, breaks, tw, W);
    if (h(tw, rows) <= budgetH) return { tw, rows, h: h(tw, rows) };
  }
  const rows = handRows(n, breaks, HAND.min, W);
  return { tw: HAND.min, rows, h: h(HAND.min, rows) };
}

/** 조합들을 왼쪽부터 채워 가며 줄바꿈했을 때 W×H 안에 들어가는 가장 큰 타일 너비. 안 들어가면 min(그때는 스크롤). */
export function fitTable(counts: number[], extra: boolean, W: number, H: number, max: number): number {
  if (W <= 0 || H <= 0) return Math.min(max, 36);
  for (let tw = max; tw >= TABLE.min; tw--) {
    const widths = counts.map(n => n * tw + (n - 1) * TABLE.gapT + TABLE.padX);
    if (extra) widths.push(tw * TABLE.newW + 4);
    if (widths.some(w => w > W)) continue;
    let rows = 1, x = 0;
    for (const w of widths) { if (x > 0 && x + TABLE.gapX + w > W) { rows++; x = w; } else x += (x ? TABLE.gapX : 0) + w; }
    if (rows * (Math.round(tw * 1.4) + TABLE.rowExtra) + (rows - 1) * TABLE.gapY <= H) return tw;
  }
  return TABLE.min;
}

/** 손패에서 바로 옆 타일과 "이어지는" 관계인가: 같은 색 연속 숫자 / 같은 숫자 다른 색 / 조커 */
export function linked(a: Tile, b: Tile): boolean {
  if (a.kind === 'joker' || b.kind === 'joker') return true;
  if (a.color === b.color) return Math.abs(a.value - b.value) === 1;
  return a.value === b.value;
}

/** 손패 id가 속한 "이어진 줄": 묶음 구분선(breaks)을 넘지 않고, 이웃끼리 linked인 구간 */
export function handLine(hand: Tile[], breaks: ReadonlySet<number>, id: number): number[] {
  const i = hand.findIndex(t => t.id === id);
  if (i < 0) return [id];
  let lo = i, hi = i;
  while (lo > 0 && !breaks.has(hand[lo]!.id) && linked(hand[lo - 1]!, hand[lo]!)) lo--;
  while (hi < hand.length - 1 && !breaks.has(hand[hi + 1]!.id) && linked(hand[hi]!, hand[hi + 1]!)) hi++;
  return hand.slice(lo, hi + 1).map(t => t.id);
}
