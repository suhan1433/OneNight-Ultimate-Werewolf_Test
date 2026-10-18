/**
 * 턴 편집 엔진 — React/DOM에 의존하지 않는 순수 함수 모음.
 * 모든 명령은 타일 ID 기준이며, 새 Draft를 돌려준다(원본 불변).
 * 서버가 최종 권위자이므로 여기서는 "구조 불변식"(타일 1장 = 1곳, 원래 테이블 타일은 손패로 못 감)만 지키고,
 * 조합의 유효성/조커 표현값은 호출자가 주는 fix()(= validateMeld 기반)에 맡긴다.
 */
import type { Meld, Tile } from '@rummikub/rules';

export type Draft = { hand: Tile[]; table: Meld[] };
export type Dest = { to: 'hand'; at?: number } | { to: 'new' } | { to: 'meld'; meldId: string; index?: number };
export type Ctx = {
  tile: (id: number) => Tile | undefined;
  /** 이번 턴 시작 시 테이블에 있던 타일 ID */
  orig: ReadonlySet<number>;
  /** 조합을 검증하고 정렬/조커 표현값을 갱신한다. 유효하지 않으면 그대로 돌려줘도 된다. */
  fix: (m: Meld) => Meld;
  newId: () => string;
};
export type Result = { ok: true; draft: Draft; meldId?: string; jokerId?: number } | { ok: false; reason: string };
const fail = (reason: string): Result => ({ ok: false, reason });
const insertAt = <T,>(arr: T[], at: number, items: T[]) => [...arr.slice(0, at), ...items, ...arr.slice(at)];

/** 타일을 손패 / 기존 조합(원하는 위치) / 새 조합으로 옮긴다. */
export function moveTiles(d: Draft, ids: number[], dest: Dest, ctx: Ctx): Result {
  const want = new Set(ids);
  // 화면 순서(손패 → 테이블)를 유지해서 옮긴다. 선택한 순서가 아니라 보이는 순서가 자연스럽다.
  const fromHand = d.hand.filter(t => want.has(t.id));
  const entryOf = new Map<number, { tileId: number }>();
  const fromTable: number[] = [];
  d.table.forEach(m => m.tiles.forEach(e => { if (want.has(e.tileId)) { fromTable.push(e.tileId); entryOf.set(e.tileId, { tileId: e.tileId }); } }));
  const order = [...fromHand.map(t => t.id), ...fromTable];
  if (!order.length) return fail('옮길 타일이 없어요.');
  if (dest.to === 'hand' && order.some(id => ctx.orig.has(id))) return fail('테이블에 있던 타일은 손패로 가져올 수 없어요.');
  const target = dest.to === 'meld' ? d.table.find(m => m.id === dest.meldId) : undefined;
  if (dest.to === 'meld' && !target) return fail('대상 조합을 찾을 수 없어요.');
  const set = new Set(order);
  const moved = order.map(id => ctx.tile(id)).filter((t): t is Tile => !!t);
  if (moved.length !== order.length) return fail('타일 정보를 찾을 수 없어요.');
  const entries = order.map(id => ({ tileId: id }));

  const touched = new Set<string>();
  let hand = d.hand.filter(t => !set.has(t.id));
  let table = d.table.map(m => {
    if (!m.tiles.some(e => set.has(e.tileId))) return m;
    touched.add(m.id);
    return { ...m, tiles: m.tiles.filter(e => !set.has(e.tileId)) };
  });

  let meldId: string | undefined;
  if (dest.to === 'hand') {
    const raw = dest.at ?? d.hand.length;
    const at = Math.max(0, Math.min(hand.length, raw - d.hand.slice(0, raw).filter(t => set.has(t.id)).length));
    hand = insertAt(hand, at, moved);
  } else if (dest.to === 'meld') {
    const raw = Math.max(0, Math.min(target!.tiles.length, dest.index ?? target!.tiles.length));
    const before = target!.tiles.slice(0, raw).filter(e => set.has(e.tileId)).length;
    table = table.map(m => (m.id === dest.meldId ? { ...m, tiles: insertAt(m.tiles, raw - before, entries) } : m));
    touched.add(dest.meldId); meldId = dest.meldId;
  } else {
    meldId = ctx.newId();
    table = [...table, { id: meldId, type: 'run', tiles: entries } as Meld];
    touched.add(meldId);
  }
  table = table.filter(m => m.tiles.length).map(m => (touched.has(m.id) ? ctx.fix(m) : m));
  return { ok: true, draft: { hand, table }, meldId };
}

/** index 앞에서 조합을 둘로 나눈다(1 ≤ index ≤ n-1). 두 조합은 나란히 놓인다. */
export function splitMeld(d: Draft, meldId: string, index: number, ctx: Ctx): Result {
  const i = d.table.findIndex(m => m.id === meldId);
  if (i < 0) return fail('조합을 찾을 수 없어요.');
  const m = d.table[i]!;
  if (index <= 0 || index >= m.tiles.length) return fail('조합 양쪽에 타일이 남도록 분할해 주세요.');
  const id = ctx.newId();
  const a = ctx.fix({ ...m, tiles: m.tiles.slice(0, index) });
  const b = ctx.fix({ ...m, id, tiles: m.tiles.slice(index).map(e => ({ tileId: e.tileId })) });
  return { ok: true, draft: { hand: d.hand, table: [...d.table.slice(0, i), a, b, ...d.table.slice(i + 1)] }, meldId: id };
}

/** 여러 조합을 첫 번째 조합(테이블 순서 기준)으로 합친다. */
export function mergeMelds(d: Draft, meldIds: string[], ctx: Ctx): Result {
  const set = new Set(meldIds);
  const parts = d.table.filter(m => set.has(m.id));
  if (parts.length < 2) return fail('합칠 조합이 두 개 이상 필요해요.');
  const head = parts[0]!;
  const merged = ctx.fix({ ...head, tiles: parts.flatMap(m => m.tiles.map(e => ({ tileId: e.tileId }))) });
  return { ok: true, draft: { hand: d.hand, table: d.table.filter(m => !set.has(m.id) || m.id === head.id).map(m => (m.id === head.id ? merged : m)) }, meldId: head.id };
}

/** 손패의 타일로 조커 자리를 대신하고, 꺼낸 조커는 새 조합(1장)에 둔다. 조커는 같은 턴에 다른 조합에 써야 한다(서버 검증). */
export function swapJoker(d: Draft, meldId: string, jokerId: number, tileId: number, ctx: Ctx): Result {
  const m = d.table.find(x => x.id === meldId);
  const k = m?.tiles.findIndex(e => e.tileId === jokerId) ?? -1;
  if (!m || k < 0) return fail('조커를 찾을 수 없어요.');
  if (!d.hand.some(t => t.id === tileId)) return fail('손패의 타일로만 조커를 바꿀 수 있어요.');
  const id = ctx.newId();
  const swapped = ctx.fix({ ...m, tiles: m.tiles.map((e, i) => (i === k ? { tileId } : e)) });
  const joker = ctx.tile(jokerId); if (!joker) return fail('조커 정보를 찾을 수 없어요.');
  return {
    ok: true, jokerId, meldId: id,
    draft: { hand: d.hand.filter(t => t.id !== tileId), table: [...d.table.map(x => (x.id === meldId ? swapped : x)), { id, type: 'run', tiles: [{ tileId: jokerId }] } as Meld] },
  };
}

/** 서버에 보낼 게임 상태의 정규화 문자열.
 * 손패의 "표시 순서"는 포함하지 않는다. 조합은 타일 ID 집합 + 조커 표현값으로만 비교하므로
 * 조합/타일의 나열 순서만 바뀐 경우는 변경으로 보지 않는다. */
export function signature(d: Draft): string {
  const hand = d.hand.map(t => t.id).sort((a, b) => a - b).join(',');
  const table = d.table
    .map(m => m.tiles.map(e => `${e.tileId}${e.represents ? `@${e.represents.color}${e.represents.value}` : ''}`).sort().join(','))
    .sort().join('|');
  return `${hand}#${table}`;
}

/** Undo/Redo로 스냅샷의 손패를 복원하되, 사용자가 정렬해 둔 현재 순서는 최대한 유지한다. */
export function mergeHandOrder(current: Tile[], snap: Tile[]): Tile[] {
  const inSnap = new Set(snap.map(t => t.id));
  const out = current.filter(t => inSnap.has(t.id));
  const have = new Set(out.map(t => t.id));
  snap.forEach((t, i) => {
    if (have.has(t.id)) return;
    let k = i - 1; while (k >= 0 && !have.has(snap[k]!.id)) k--;
    out.splice(k < 0 ? 0 : out.findIndex(x => x.id === snap[k]!.id) + 1, 0, t); have.add(t.id);
  });
  return out;
}

/** 유효하지 않은 조합에 왜 안 되는지 알려주는 짧은 설명(서버 규칙을 바꾸지 않는 안내 전용) */
export function whyInvalid(tiles: Tile[]): string {
  if (tiles.length < 3) return `3장 이상이어야 해요 (지금 ${tiles.length}장)`;
  const nums = tiles.filter((t): t is Extract<Tile, { kind: 'number' }> => t.kind !== 'joker');
  if (!nums.length) return '조커만으로는 만들 수 없어요';
  const v0 = nums[0]!.value, c0 = nums[0]!.color;
  if (nums.every(t => t.color === c0)) return '같은 색이라면 숫자가 이어져야 해요 (1 ~ 13)';
  if (nums.every(t => t.value === v0)) return tiles.length > 4 ? '같은 숫자 조합은 최대 4장이에요' : '같은 숫자 조합은 색이 모두 달라야 해요';
  return '같은 색 연속 숫자 또는 같은 숫자 다른 색이어야 해요';
}
