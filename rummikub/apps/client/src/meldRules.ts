/**
 * 조합 검사 — "놓인 순서"를 존중한다.
 *  · 그룹(같은 숫자·다른 색): 순서 상관없음.
 *  · 런(같은 색 연속 숫자): 왼쪽 → 오른쪽으로 숫자가 커지는 순서로 놓여야 유효. 6·5·7 은 무효.
 * 집합 수준의 유효성(장수, 색, 조커 개수 등)은 서버와 같은 validateMeld에 맡기고, 여기서는 순서와 조커 표현값만 더한다.
 * 조커의 표현값도 "놓인 자리" 기준으로 정한다: [J,5,6] → 4 / [5,6,J] → 7 / [5,J,7] → 6.
 */
import type { Meld, Tile } from '@rummikub/rules';
import { whyInvalid } from './editor.js';

type Num = Extract<Tile, { kind: 'number' }>;
type Entry = Meld['tiles'][number];
export type Validate = (tiles: Tile[], allowTwoJokers: boolean, id: string) => { ok: boolean; meld?: Meld };
export type Checked = { ok: true; meld: Meld } | { ok: false; reason: string };

export const ORDER_HINT = '숫자가 작은 쪽부터 왼쪽 → 오른쪽 순서로 놓아야 해요';

/** 런을 놓인 순서대로 읽는다. 순서·색·범위(1~13)가 맞으면 조커 자리의 표현값을, 아니면 null. */
export function readRun(tiles: Tile[]): Map<number, { color: Num['color']; value: number }> | null {
  const first = tiles.findIndex(t => t.kind === 'number');
  if (first < 0) return null;
  const f = tiles[first] as Num, start = f.value - first;
  if (start < 1 || start + tiles.length - 1 > 13) return null;
  const out = new Map<number, { color: Num['color']; value: number }>();
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    if (t.kind === 'joker') out.set(t.id, { color: f.color, value: start + i });
    else if (t.color !== f.color || t.value !== start + i) return null;
  }
  return out;
}

const entry = (tileId: number, represents?: Entry['represents']): Entry => (represents ? { tileId, represents } : { tileId });

export function checkMeld(m: Meld, tile: (id: number) => Tile | undefined, allowTwoJokers: boolean, validate: Validate): Checked {
  const tiles: Tile[] = [];
  for (const e of m.tiles) { const t = tile(e.tileId); if (!t) return { ok: false, reason: '타일 정보를 찾을 수 없어요' }; tiles.push(t); }
  const base = validate(tiles, allowTwoJokers, m.id);
  if (!base.ok || !base.meld) return { ok: false, reason: whyInvalid(tiles) };
  if (base.meld.type === 'group') {
    const rep = new Map(base.meld.tiles.map(e => [e.tileId, e.represents] as const));
    return { ok: true, meld: { ...base.meld, tiles: m.tiles.map(e => entry(e.tileId, rep.get(e.tileId))) } };
  }
  const reps = readRun(tiles);
  if (!reps) return { ok: false, reason: ORDER_HINT };
  return { ok: true, meld: { ...base.meld, tiles: m.tiles.map(e => entry(e.tileId, reps.get(e.tileId))) } };
}
