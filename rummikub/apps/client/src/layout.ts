/**
 * 레이아웃/제스처용 순수 함수 — React/DOM 의존 없음.
 *  · 손패  : 칸(slot) 단위 랙. 빈 칸이 곧 사용자가 만든 묶음 구분선이다.
 *  · 테이블: 조합을 자유 위치(캔버스)에 놓고, 겹치면 밀어내고, 안 들어가면 빈 공간을 정돈하고 타일을 줄인다.
 */
import type { Tile } from '@rummikub/rules';

/* ───────────── 손패: 칸(slot) 랙 ───────────── */
export type Slots = (number | null)[];
export const HAND = { min: 20, gapX: 3, rowExtra: 10, padY: 14 };
export type HandFit = { tw: number; rows: number; cols: number; cells: number; h: number };

/** 타일 수 n에 더해 자유롭게 옮길 여유 칸 */
export const handSpare = (n: number) => Math.max(6, Math.ceil(n * 0.25));
/** 모바일에서도 20장 이상 쌓였을 때 묶음을 가를 빈 칸이 모자라지 않게 최소 6칸 + 20%를 비워 둔다(그래도 타일 크기가 먼저 줄어든다). */
export const mobileHandSpare = (n: number) => Math.max(6, Math.ceil(n * 0.2));

/** 칸 수가 (n + 여유) 이상이면서 높이 예산 안에 들어가는 가장 큰 타일 */
export function fitHand(n: number, W: number, budgetH: number, max: number): HandFit {
  const need = n + handSpare(n);
  const at = (tw: number): HandFit => {
    const cols = W > 0 ? Math.max(1, Math.floor((W + HAND.gapX) / (tw + HAND.gapX))) : 14;
    const rows = Math.ceil(need / cols);
    return { tw, rows, cols, cells: rows * cols, h: rows * (Math.round(tw * 1.4) + HAND.rowExtra) + HAND.padY };
  };
  for (let tw = max; tw >= HAND.min; tw--) { const f = at(tw); if (f.h <= budgetH) return f; }
  return at(HAND.min);
}

/** 모바일은 랙 높이를 일정하게 유지하고, 장수와 화면 면적으로 타일 크기를 정한다. */
export function fitMobileHand(n: number, W: number, H: number): HandFit {
  // A long, shallow rack leaves the table most of the screen. Never hide tiles in a scroll area.
  const budget = Math.max(42, Math.floor(H * (H > W ? 0.25 : 0.28)));
  const max = Math.min(38, Math.max(26, Math.floor(H * 0.085)));
  for (let tw = max; tw >= 1; tw--) {
    const cols = Math.max(1, Math.floor((W + HAND.gapX) / (tw + HAND.gapX)));
    const rows = Math.ceil((n + mobileHandSpare(n)) / cols);
    const h = rows * (Math.round(tw * 1.4) + HAND.rowExtra) + HAND.padY;
    if (h <= budget) return { tw, cols, rows, cells: rows * cols, h };
  }
  return fitHand(n, W, budget, HAND.min);
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
export type TableLayout = { tw: number; rects: Map<string, Rect>; W: number; H: number; height: number; fits: boolean };
export const MELD = { padX: 4, gapT: 2, rowExtra: 10, gap: 10, min: 14 };

export const meldSize = (n: number, tw: number) => ({ w: n * tw + (n - 1) * MELD.gapT + MELD.padX, h: Math.round(tw * 1.4) + MELD.rowExtra });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + MELD.gap && b.x < a.x + a.w + MELD.gap && a.y < b.y + b.h + MELD.gap && b.y < a.y + a.h + MELD.gap;

/** 겹치지 않는 자리를 찾는다. want가 있으면 가장 가까운 자리, 없으면 위·왼쪽부터 채운다(first-fit). 없으면 null. */
export function findSpot(placed: Rect[], w: number, h: number, W: number, H: number, want?: { x: number; y: number }): { x: number; y: number } | null {
  const g = MELD.gap, xs = new Set<number>([0, Math.max(0, W - w)]), ys = new Set<number>([0, Math.max(0, H - h)]);
  if (want) { xs.add(clamp(want.x, 0, Math.max(0, W - w))); ys.add(clamp(want.y, 0, Math.max(0, H - h))); }
  for (const r of placed) { xs.add(r.x + r.w + g); xs.add(r.x - w - g); xs.add(r.x); ys.add(r.y + r.h + g); ys.add(r.y - h - g); ys.add(r.y); }
  let best: { x: number; y: number } | null = null, bestScore = Infinity;
  for (const y of ys) {
    if (y < 0 || y + h > H) continue;
    for (const x of xs) {
      if (x < 0 || x + w > W) continue;
      const rect = { x, y, w, h }; if (placed.some(p => overlaps(rect, p))) continue;
      const score = want ? Math.hypot(x - want.x, y - want.y) : y * 100000 + x;
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  return best;
}

/**
 * 모든 조합을 W×H 캔버스에 놓는다.
 *  · 저장된 위치(pos)는 최대한 지키고, focus(방금 바뀐 조합)가 우선권을 갖는다 — 겹치면 다른 조합이 밀려난다.
 *  · 위치 없는 조합은 빈자리를 위·왼쪽부터 채운다.
 *  · 빈 공간을 정돈하고 모든 조합이 화면 안에 들어올 때까지 크기를 맞춘다(스크롤 없음).
 */
export function layoutTable(items: TableItem[], W: number, H: number, maxTw: number, focus: ReadonlySet<string> = new Set()): TableLayout {
  const empty = (tw: number): TableLayout => ({ tw, rects: new Map(), W, H, height: 0, fits: true });
  if (W <= 0 || H <= 0 || !items.length) return empty(Math.min(maxTw, 40));
  const order = [...items].sort((a, b) => Number(focus.has(b.id)) - Number(focus.has(a.id)) || Number(!!b.pos) - Number(!!a.pos));
  const place = (tw: number, compact = false) => {
    const Hb = H, placed: Rect[] = [], rects = new Map<string, Rect>();
    const sequence = compact ? [...items].sort((a, b) => b.n - a.n) : order;
    for (const it of sequence) {
      const { w, h } = meldSize(it.n, tw); if (w > W || h > Hb) return null;
      let spot: { x: number; y: number } | null;
      if (it.pos && !compact) {
        const x = clamp(it.pos.fx * W, 0, W - w), y = clamp(it.pos.fy * H, 0, Hb - h), r = { x, y, w, h };
        spot = placed.some(p => overlaps(r, p)) ? findSpot(placed, w, h, W, Hb, { x, y }) : { x, y };
      } else spot = findSpot(placed, w, h, W, Hb);
      if (!spot) return null;
      const rect = { ...spot, w, h }; placed.push(rect); rects.set(it.id, rect);
    }
    return rects;
  };
  const done = (tw: number, rects: Map<string, Rect>, fits: boolean): TableLayout => ({ tw, rects, W, H, fits, height: Math.max(H, ...[...rects.values()].map(r => r.y + r.h)) });
  // Preserve the player's arrangement first. Compact only when it would force smaller tiles.
  // Search every size: packing with saved positions is not monotonic, so binary search can miss a fit.
  for (let tw = maxTw; tw >= 1; tw--) {
    const rects = place(tw) ?? place(tw, true);
    if (rects) return done(tw, rects, true);
  }
  return empty(1); // Only possible while the viewport has no usable area.
}

/** Stable insertion boundary based on layout coordinates, never animated tile positions. */
export function meldInsertIndex(x: number, n: number, tw: number): number {
  return clamp(Math.floor((x - MELD.padX / 2 + tw / 2) / (tw + MELD.gapT)), 0, n);
}
