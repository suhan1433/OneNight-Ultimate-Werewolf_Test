/**
 * 레이아웃/제스처용 순수 함수 — React/DOM 의존 없음.
 *  · 손패  : 칸(slot) 단위 랙. 빈 칸이 곧 사용자가 만든 묶음 구분선이다.
 *  · 테이블: 조합을 자유 위치에 놓고, 공간이 부족하면 타일을 줄여 화면 안에 모두 표시한다.
 */
import type { Tile } from '@rummikub/rules';

/* ───────────── 손패: 칸(slot) 랙 ───────────── */
export type Slots = (number | null)[];
export const HAND = { min: 20, gapX: 3, rowExtra: 10, padY: 7 };
export type HandFit = { tw: number; rows: number; cols: number; cells: number; h: number };

/** 타일 수 n에 더해 자유롭게 옮길 여유 칸 */
export const handSpare = (n: number) => Math.max(6, Math.ceil(n * 0.25));
/** 모바일에서도 20장 이상 쌓였을 때 묶음을 가를 빈 칸이 모자라지 않게 최소 6칸 + 20%를 비워 둔다(그래도 타일 크기가 먼저 줄어든다). */
export const mobileHandSpare = (n: number) => Math.max(4, Math.ceil(n * 0.15));

/** 타일 크기 tw로 need칸을 폭 W에 놓았을 때의 칸/줄/높이 */
export const handAt = (need: number, W: number, tw: number): HandFit => {
  const cols = W > 0 ? Math.max(1, Math.floor((W + HAND.gapX) / (tw + HAND.gapX))) : 14;
  const rows = Math.ceil(need / cols);
  return { tw, rows, cols, cells: rows * cols, h: rows * (Math.round(tw * 1.4) + HAND.rowExtra) + HAND.padY };
};

/** 칸 수가 (n + 여유) 이상이면서 높이 예산 안에 들어가는 가장 큰 타일 */
export function fitHand(n: number, W: number, budgetH: number, max: number, spare = handSpare(n)): HandFit {
  const need = n + spare;
  const at = (tw: number): HandFit => handAt(need, W, tw);
  // A crowded or narrow rack must still show every tile, including on desktop.
  for (let tw = Math.max(1, Math.min(max, Math.floor(W) || max)); tw >= 1; tw--) { const f = at(tw); if (f.h <= budgetH) return f; }
  return at(1);
}

/** 모바일은 랙 높이를 일정하게 유지하고, 장수와 화면 면적으로 타일 크기를 정한다. */
export function fitMobileHand(n: number, W: number, H: number, budgetH?: number): HandFit {
  // A long, shallow rack leaves the table most of the screen. Never hide tiles in a scroll area.
  const budget = budgetH ?? Math.max(46, Math.floor(H * (H > W ? 0.28 : 0.32)));
  const max = Math.min(42, Math.max(28, Math.floor(H * 0.095)));
  return fitHand(n, W, budget, max, mobileHandSpare(n));
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 손패 타일 크기 정책.
 *  · 데스크톱/태블릿(wide): 높이 예산 안에서 가장 큰 타일. 예산은 soft → (편안한 크기 미만이면) hard.
 *  · 모바일(가로 화면은 폭이 남고 높이가 모자란다): "줄 수 먼저". 1줄로 읽을 만한 크기(minTile)가 나오면 1줄,
 *    안 되면 2줄, 3줄… 순서로 늘린다. 줄은 높이를 크게 먹지만 가로 칸은 거의 공짜이기 때문에
 *    "1줄 34px" 이 "2줄 38px" 보다 테이블에 훨씬 큰 공간을 남긴다.
 */
export function fitRack(n: number, W: number, H: number, wide: boolean): HandFit {
  const h = H > 0 ? H : 600;
  if (wide) {
    const spare = handSpare(n), pad = 10;
    const pref = clampN(Math.floor(h * 0.085), 52, 76), comfort = 44;
    const soft = Math.floor(h * 0.30) - pad, hard = Math.floor(h * 0.40) - pad;
    const a = fitHand(n, W, soft, pref, spare);
    return a.tw >= comfort ? a : fitHand(n, W, hard, Math.min(pref, comfort - 1), spare);
  }
  const need = n + mobileHandSpare(n);
  const pref = clampN(Math.floor(h * 0.125), 34, 46), minTile = 26;
  const cap = (rows: number) => h * (rows <= 1 ? 0.30 : rows === 2 ? 0.32 : 0.42);
  let best: HandFit | null = null;
  for (let rows = 1; rows <= 6; rows++) {
    const cols = Math.ceil(need / rows);
    const byW = W > 0 ? Math.floor((W + HAND.gapX) / cols) - HAND.gapX : pref;
    const byH = Math.floor(((cap(rows) - HAND.padY) / rows - HAND.rowExtra) / 1.4);
    const f = handAt(need, W, Math.max(1, Math.min(pref, byW, byH)));
    if (f.tw >= minTile) return f;
    if (!best || f.tw > best.tw) best = f;
  }
  return best!;
}

/** 이전 배치를 최대한 유지하면서 칸 수/타일 구성에 맞춘다. 새 타일은 원래 자리(home) → 마지막 타일 뒤 → 앞쪽 빈 칸 순. */
export function normalizeSlots(prev: Slots, ids: number[], cells: number, home?: ReadonlyMap<number, number>): Slots {
  const want = new Set(ids), out: Slots = Array(cells).fill(null), done = new Set<number>();
  prev.forEach((id, i) => { if (id !== null && want.has(id) && i < cells && !done.has(id)) { out[i] = id; done.add(id); } });
  let last = -1; out.forEach((v, i) => { if (v !== null) last = i; });
  for (const id of ids) {
    if (done.has(id)) continue;
    const h = home?.get(id);
    let k = h !== undefined && h < cells && out[h] === null ? h : -1;
    if (k < 0) { k = last + 1; while (k < cells && out[k] !== null) k++; }
    if (k >= cells) { k = 0; while (k < cells && out[k] !== null) k++; }
    if (k < cells) { out[k] = id; done.add(id); if (k > last) last = k; }
  }
  return out;
}

/** ids를 at 칸부터 연속으로 놓는다. 이미 차 있으면 같은 줄의 빈 칸까지 한 칸씩 밀어서 끼워 넣는다(없으면 줄 밖으로). */
export function placeInSlots(slots: Slots, ids: number[], at: number, cols: number): Slots {
  const out: Slots = slots.map(s => (s !== null && ids.includes(s) ? null : s));
  const n = out.length;
  if (!n || !ids.length || ids.length > n) return slots;
  let idx = Math.max(0, Math.min(n - 1, at));
  if (ids.length <= cols) idx = Math.max(Math.floor(idx / cols) * cols, Math.min(idx, Math.floor(idx / cols) * cols + cols - ids.length)); // 한 줄에 들어가면 줄바꿈 없이
  idx = Math.min(idx, n - ids.length);
  // Reserve the entire block at once. Inserting one tile at a time can push
  // an earlier tile out of the group when a full row needs space on its left.
  const rowStart = Math.floor(idx / cols) * cols;
  const rowEnd = Math.min(n, Math.ceil((idx + ids.length) / cols) * cols);
  const candidates: number[] = [];
  for (let i = idx; i < idx + ids.length; i++) candidates.push(i);
  for (let i = idx + ids.length; i < rowEnd; i++) candidates.push(i);
  for (let i = idx - 1; i >= rowStart; i--) candidates.push(i);
  for (let i = rowEnd; i < n; i++) candidates.push(i);
  for (let i = rowStart - 1; i >= 0; i--) candidates.push(i);
  const remove = new Set(candidates.filter(i => out[i] === null).slice(0, ids.length));
  if (remove.size < ids.length) return slots;
  const base = out.filter((_, i) => !remove.has(i));
  return [...base.slice(0, idx), ...ids, ...base.slice(idx)];
}

/** 묶음(groups)을 순서대로 놓되 묶음 사이에 gap칸을 비운다. 한 줄에 들어가는 묶음은 줄을 넘지 않게 다음 줄로 보낸다. 칸이 모자라면 null. */
export function arrangeSlots(groups: number[][], cols: number, cells: number, gap = 1): Slots | null {
  const out: Slots = Array(cells).fill(null); let k = 0;
  for (const g of groups) {
    if (!g.length) continue;
    if (g.length <= cols && k % cols !== 0 && g.length > cols - (k % cols)) k += cols - (k % cols);
    if (k + g.length > cells) return null;
    g.forEach((id, i) => { out[k + i] = id; }); k += g.length + gap;
  }
  return out;
}

/** 손패에서 바로 옆 타일과 "이어지는" 관계인가: 같은 색 연속 숫자 / 같은 숫자 다른 색 / 조커 */
export function linked(a: Tile, b: Tile): boolean {
  if (a.kind === 'joker' || b.kind === 'joker') return true;
  if (a.color === b.color) return Math.abs(a.value - b.value) === 1;
  return a.value === b.value;
}

/** id가 놓인 "이어진 줄": 같은 줄에서 빈 칸 없이 붙어 있고 이웃끼리 linked인 구간 */
export function slotLine(slots: Slots, cols: number, tile: (id: number) => Tile | undefined, id: number): number[] {
  const i = slots.indexOf(id); if (i < 0) return [id];
  const rs = Math.floor(i / cols) * cols, re = rs + cols - 1, at = (k: number) => { const v = slots[k]; return v == null ? undefined : tile(v); };
  let lo = i, hi = i;
  while (lo > rs && at(lo - 1) && at(lo) && linked(at(lo - 1)!, at(lo)!)) lo--;
  while (hi < re && at(hi + 1) && at(hi) && linked(at(hi)!, at(hi + 1)!)) hi++;
  return slots.slice(lo, hi + 1) as number[];
}

/* ───────────── 테이블: 자유 배치 캔버스 ───────────── */
export type Rect = { x: number; y: number; w: number; h: number };
export type Pos = { fx: number; fy: number };           // 캔버스 크기에 대한 비율(타일 크기가 바뀌어도 자리가 유지된다)
export type TableItem = { id: string; n: number; pos?: Pos };
/** H = 캔버스 실제 높이(보이는 높이보다 클 수 있다 → 테이블이 세로 스크롤). baseH = 보이는 높이. pos.fy는 baseH 기준이라 캔버스가 늘어도 조합이 제자리에 있다. */
export type TableLayout = { tw: number; rects: Map<string, Rect>; W: number; H: number; baseH: number; height: number; fits: boolean };
/** hit = 조합 바깥으로 넓힌 드롭 인식 여유(gap의 절반보다 작게). 손잡이 높이는 meldGrip(tw). */
export const MELD = { padX: 4, gapT: 2, gap: 10, min: 14 };

/** 조합 손잡이 높이: 작은 타일에서는 얇게(공간 절약), 큰 타일에서는 잡기 쉽게. 타일 아래 여백 6은 고정. */
export const meldGrip = (tw: number) => Math.max(8, Math.min(14, Math.round(tw * 0.3)));
/** 타일 아래 여백(입체감)과 조합 사이 간격도 작은 타일에서는 같이 줄인다 — 같은 면적에 더 큰 타일이 들어간다. */
export const meldPad = (tw: number) => Math.max(3, Math.min(6, Math.round(tw * 0.16)));
export const meldGap = (tw: number) => Math.max(5, Math.min(10, Math.round(tw * 0.3)));
export const meldSize = (n: number, tw: number) => ({ w: n * tw + (n - 1) * MELD.gapT + MELD.padX, h: Math.round(tw * 1.4) + meldGrip(tw) + meldPad(tw) });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const overlaps = (a: Rect, b: Rect, g: number) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;

/** 겹치지 않는 자리를 찾는다. want가 있으면 가장 가까운 자리, 없으면 위·왼쪽부터 채운다(first-fit). 없으면 null. */
export function findSpot(placed: Rect[], w: number, h: number, W: number, H: number, want?: { x: number; y: number }, g: number = MELD.gap): { x: number; y: number } | null {
  const xs = new Set<number>([0, Math.max(0, W - w)]), ys = new Set<number>([0, Math.max(0, H - h)]);
  if (want) { xs.add(clamp(want.x, 0, Math.max(0, W - w))); ys.add(clamp(want.y, 0, Math.max(0, H - h))); }
  for (const r of placed) { xs.add(r.x + r.w + g); xs.add(r.x - w - g); xs.add(r.x); ys.add(r.y + r.h + g); ys.add(r.y - h - g); ys.add(r.y); }
  let best: { x: number; y: number } | null = null, bestScore = Infinity;
  for (const y of [...ys].sort((a, b) => a - b)) {
    if (y < 0 || y + h > H) continue;
    for (const x of [...xs].sort((a, b) => a - b)) {
      if (x < 0 || x + w > W) continue;
      if (want) { // 싼 거리 비교를 먼저 해서 겹침 검사(O(n))를 대부분 건너뛴다
        const score = Math.hypot(x - want.x, y - want.y); if (score >= bestScore) continue;
        const rect = { x, y, w, h }; if (placed.some(p => overlaps(rect, p, g))) continue;
        bestScore = score; best = { x, y };
      } else {
        const rect = { x, y, w, h }; if (placed.some(p => overlaps(rect, p, g))) continue;
        return { x, y };
      }
    }
  }
  return best;
}

/**
 * 모든 조합을 캔버스에 놓는다.
 *  · 저장된 위치(pos)는 최대한 지키고, focus(방금 바뀐 조합)가 우선권을 갖는다 — 겹치면 다른 조합이 밀려난다.
 *  · 위치 없는 조합은 빈자리를 위·왼쪽부터 채운다.
 *  · 공간이 모자라면 ① 타일을 minTw까지 줄이고 ② 그래도 모자라면 캔버스를 세로로 늘린다(스크롤) ③ 끝까지 안 되면 줄 바꿈으로 쌓는다.
 *    → 글자가 읽히지 않을 만큼 작아지지 않고, 놓을 자리는 항상 남는다.
 *  · 새 조합(또는 끄는 묶음)을 놓을 빈자리도 항상 확보한다.
 */
export function layoutTable(items: TableItem[], W: number, viewH: number, maxTw: number, focus: ReadonlySet<string> = new Set(), reserveCount = 3, minTw = 1, maxScreens = 3): TableLayout {
  const longest = Math.max(3, reserveCount, ...items.map(it => it.n));
  const max = Math.max(1, Math.min(maxTw, Math.floor((W - MELD.padX - (longest - 1) * MELD.gapT) / longest)));
  if (W <= 0 || viewH <= 0) return { tw: max, rects: new Map(), W, H: viewH, baseH: viewH, height: viewH, fits: false };
  const order = [...items].sort((a, b) => Number(focus.has(b.id)) - Number(focus.has(a.id)) || Number(!!b.pos) - Number(!!a.pos));
  const compact = [...items].sort((a, b) => b.n - a.n);
  const floor = clamp(minTw, 1, max);
  const spareN = Math.max(3, reserveCount);

  const attempt = (tw: number, H: number): TableLayout | null => {
    const spare = meldSize(spareN, tw);
    // 면적만으로도 불가능하면 비싼 배치 탐색을 건너뛴다(필요조건).
    const area = items.reduce((sum, it) => { const m = meldSize(it.n, tw); return sum + m.w * m.h; }, spare.w * spare.h);
    if (area > W * H) return null;
    for (const keepPositions of [true, false]) {
      const placed: Rect[] = [], rects = new Map<string, Rect>();
      for (const it of keepPositions ? order : compact) {
        const { w, h } = meldSize(it.n, tw);
        const want = keepPositions && it.pos ? { x: clamp(it.pos.fx * W, 0, Math.max(0, W - w)), y: clamp(it.pos.fy * viewH, 0, Math.max(0, H - h)) } : undefined;
        const spot = findSpot(placed, w, h, W, H, want, meldGap(tw));
        if (!spot) break;
        const rect = { ...spot, w, h }; placed.push(rect); rects.set(it.id, rect);
      }
      if (rects.size === items.length && findSpot(placed, spare.w, spare.h, W, H, undefined, meldGap(tw))) return { tw, rects, W, H, baseH: viewH, height: H, fits: true };
    }
    return null;
  };

  // ① 보이는 영역 안에서: 큰 타일부터 minTw까지
  for (let tw = max; tw >= floor; tw--) { const r = attempt(tw, viewH); if (r) return r; }
  // ② minTw 그대로 두고 캔버스를 한 줄씩 늘린다(세로 스크롤)
  const maxH = Math.round(viewH * Math.max(1, maxScreens)), step = meldSize(1, floor).h + meldGap(floor);
  for (let H = viewH + step; H <= maxH; H += step) { const r = attempt(floor, H); if (r) return r; }
  // ③ 최후: 줄 바꿈으로 쌓는다(항상 성공). 위치는 정돈되지만 아무것도 사라지지 않는다.
  const rects = new Map<string, Rect>(); let x = 0, y = 0, rowH = 0;
  for (const it of compact) {
    const { w, h } = meldSize(it.n, floor);
    if (x > 0 && x + w > W) { x = 0; y += rowH + meldGap(floor); rowH = 0; }
    rects.set(it.id, { x, y, w, h }); x += w + meldGap(floor); rowH = Math.max(rowH, h);
  }
  const H = Math.max(viewH, y + rowH + meldGap(floor) + meldSize(spareN, floor).h);
  return { tw: floor, rects, W, H, baseH: viewH, height: H, fits: true };
}

/** Empty gaps belong to the canvas. Only the body of a meld accepts insertion. */
export function hitMeld(r: Rect, x: number, y: number, gap: number = MELD.gap): boolean {
  const k = Math.max(1, Math.floor(gap / 2) - 1); // 조합 가장자리 바로 바깥까지 "이 조합에 끼우기"로 인식(간격의 절반 미만)
  return x >= r.x - k && x <= r.x + r.w + k && y >= r.y - k && y <= r.y + r.h + k;
}

/** Stable insertion boundary based on layout coordinates, never animated tile positions. */
export function meldInsertIndex(x: number, n: number, tw: number): number {
  return clamp(Math.floor((x - MELD.padX / 2 + tw / 2) / (tw + MELD.gapT)), 0, n);
}
