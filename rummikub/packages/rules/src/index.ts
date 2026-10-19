export type Color = 'black' | 'red' | 'blue' | 'orange';
export type TileId = number;
export interface NumberTile { id: TileId; kind: 'number'; color: Color; value: number }
export interface JokerTile { id: TileId; kind: 'joker' }
export type Tile = NumberTile | JokerTile;
export interface Represents { color: Color; value: number }
export interface MeldTile { tileId: TileId; represents?: Represents }
export interface Meld { id: string; type: 'group' | 'run'; tiles: MeldTile[] }
export interface RuleConfig {
  initialMeldMin: number; turnSeconds: number; penaltyDraw: number; jokerPenalty: number;
  jokerReuse: 'free' | 'newMeld' | 'newMeldFromHand';
  allowJokerMeldManipulation: boolean; allowTwoJokersInMeld: boolean;
  allowManipulationOnInitialMeldTurn: boolean;
}
export const defaultRuleConfig: RuleConfig = {
  initialMeldMin: 30, turnSeconds: 120, penaltyDraw: 3, jokerPenalty: 30,
  jokerReuse: 'free', allowJokerMeldManipulation: true, allowTwoJokersInMeld: true,
  allowManipulationOnInitialMeldTurn: false
};
export const colors: Color[] = ['black', 'red', 'blue', 'orange'];

/**
 * 조합의 표시 순서를 규칙에 맞게 고정한다.
 *
 * 네트워크를 통해 들어오는 조합은 타일을 어떤 순서로 담고 있든 유효할 수 있으므로,
 * 서버가 저장하기 전에 항상 이 순서로 정규화한다. 런은 숫자(조커의 대체 숫자 포함),
 * 그룹은 색 순서로 놓인다.
 */
export function orderMeld(meld: Meld, lookup: ReadonlyMap<TileId, Tile>): Meld {
  const represented = (entry: MeldTile) => {
    const tile = lookup.get(entry.tileId);
    return tile?.kind === 'number'
      ? { color: tile.color, value: tile.value }
      : entry.represents;
  };
  const tiles = [...meld.tiles].sort((a, b) => {
    const left = represented(a), right = represented(b);
    if (!left || !right) return 0;
    return meld.type === 'run'
      ? left.value - right.value
      : colors.indexOf(left.color) - colors.indexOf(right.color);
  });
  return { ...meld, tiles };
}

export function createDeck(): Tile[] {
  const deck: Tile[] = []; let id = 0;
  for (const color of colors) for (let value = 1; value <= 13; value += 1) for (let copy = 0; copy < 2; copy += 1) deck.push({ id: id++, kind: 'number', color, value });
  deck.push({ id: id++, kind: 'joker' }, { id: id++, kind: 'joker' });
  return deck;
}
export const tileMap = (deck: Tile[]) => new Map(deck.map(tile => [tile.id, tile]));
export function seededShuffle<T>(source: readonly T[], seed: string): T[] {
  let n = 2166136261; for (const char of seed) { n ^= char.charCodeAt(0); n = Math.imul(n, 16777619); }
  const random = () => { n += 0x6D2B79F5; let x = n; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  const out = [...source]; for (let i = out.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; } return out;
}
export interface JokerCandidate { type: Meld['type']; represents: Represents[] }
export function inferJokerRepresents(tiles: Tile[], allowTwoJokers = true): JokerCandidate[] {
  const jokers = tiles.filter((tile): tile is JokerTile => tile.kind === 'joker');
  const numbers = tiles.filter((tile): tile is NumberTile => tile.kind === 'number');
  if (tiles.length < 3 || tiles.length > 13 || (!allowTwoJokers && jokers.length > 1) || jokers.length > 2) return [];
  const candidates: JokerCandidate[] = [];
  const sameValue = numbers.length === 0 || numbers.every(tile => tile.value === numbers[0]!.value);
  const distinctColors = new Set(numbers.map(tile => tile.color)).size === numbers.length;
  if (tiles.length <= 4 && sameValue && distinctColors) {
    const missing = colors.filter(color => !numbers.some(tile => tile.color === color));
    if (missing.length >= jokers.length) candidates.push({ type: 'group', represents: missing.slice(0, jokers.length).map(color => ({ color, value: numbers[0]?.value ?? 1 })) });
  }
  const sameColor = numbers.length === 0 || numbers.every(tile => tile.color === numbers[0]!.color);
  const uniqueValues = new Set(numbers.map(tile => tile.value)).size === numbers.length;
  if (sameColor && uniqueValues) {
    const color = numbers[0]?.color ?? 'black';
    for (let start = 1; start <= 14 - tiles.length; start += 1) {
      const values = Array.from({ length: tiles.length }, (_, i) => start + i);
      if (numbers.every(tile => values.includes(tile.value))) candidates.push({ type: 'run', represents: values.filter(value => !numbers.some(tile => tile.value === value)).map(value => ({ color, value })) });
    }
  }
  return candidates;
}
export type MeldValidation = { ok: true; meld: Meld } | { ok: false; reason: string };
export function validateMeld(tiles: Tile[], allowTwoJokers = true, id = 'meld'): MeldValidation {
  const candidates = inferJokerRepresents(tiles, allowTwoJokers);
  if (!candidates.length) return { ok: false, reason: '조합은 같은 숫자의 서로 다른 색 3~4장 또는 같은 색의 연속 숫자 3장 이상이어야 합니다.' };
  const candidate = candidates[0]!; let joker = 0;
  return { ok: true, meld: { id, type: candidate.type, tiles: tiles.map(tile => tile.kind === 'joker' ? { tileId: tile.id, represents: candidate.represents[joker++] } : { tileId: tile.id }) } };
}
export function validateStoredMeld(meld: Meld, lookup: Map<TileId, Tile>, config = defaultRuleConfig): MeldValidation {
  const maybeTiles = meld.tiles.map(entry => lookup.get(entry.tileId));
  if (maybeTiles.some((tile): tile is undefined => !tile)) return { ok: false, reason: '존재하지 않는 타일이 있습니다.' };
  const tiles = maybeTiles as Tile[];
  if (new Set(meld.tiles.map(tile => tile.tileId)).size !== meld.tiles.length) return { ok: false, reason: '같은 타일을 한 조합에 두 번 둘 수 없습니다.' };
  const inferred = validateMeld(tiles, config.allowTwoJokersInMeld, meld.id);
  if (!inferred.ok) return inferred;
  const jokerEntries = meld.tiles.filter(entry => lookup.get(entry.tileId)?.kind === 'joker');
  if (jokerEntries.some(entry => !entry.represents)) return { ok: false, reason: '조커가 대신하는 색과 숫자를 정해야 합니다.' };
  // 대체된 일반 타일로 직접 검사한다. 그룹의 모든 빈 색상과 조커 두 장의
  // 어느 배치든 허용하되, 중복 색/숫자와 1~13 범위를 검사한다.
  const represented = tiles.map((tile, i): NumberTile => tile.kind === 'number'
    ? tile : { id: tile.id, kind: 'number', ...meld.tiles[i]!.represents! });
  if (represented.some(tile => !colors.includes(tile.color) || !Number.isInteger(tile.value) || tile.value < 1 || tile.value > 13)) return { ok: false, reason: '조커의 지정 값이 이 조합과 맞지 않습니다.' };
  const valid = inferJokerRepresents(represented).some(candidate => candidate.type === meld.type);
  return valid ? { ok: true, meld } : { ok: false, reason: '조커의 지정 값이 이 조합과 맞지 않습니다.' };
}
export interface TurnSnapshot { table: Meld[]; hand: TileId[]; hasInitialMeld: boolean }
export interface TurnValidationArgs { before: TurnSnapshot; after: Pick<TurnSnapshot, 'table' | 'hand'>; config: RuleConfig; tiles: Tile[] }
export type TurnValidation = { ok: true; initialMeldPoints?: number } | { ok: false; reason: string };
export function validateTurn({ before, after, config, tiles }: TurnValidationArgs): TurnValidation {
  const lookup = tileMap(tiles); const beforeTable = before.table.flatMap(meld => meld.tiles.map(tile => tile.tileId)); const afterTable = after.table.flatMap(meld => meld.tiles.map(tile => tile.tileId));
  const afterAll = [...after.hand, ...afterTable];
  if (new Set(afterAll).size !== afterAll.length || afterAll.some(id => !lookup.has(id))) return { ok: false, reason: '타일 보존 검증에 실패했습니다.' };
  const beforeAll = [...before.hand, ...beforeTable];
  if (beforeAll.length !== afterAll.length || beforeAll.some(id => !afterAll.includes(id))) return { ok: false, reason: '턴 중 타일을 만들거나 버릴 수 없습니다.' };
  if (beforeTable.some(id => !afterTable.includes(id))) return { ok: false, reason: '테이블 타일은 손패로 가져갈 수 없습니다.' };
  for (const meld of after.table) { const checked = validateStoredMeld(meld, lookup, config); if (!checked.ok) return checked; }
  const moved = before.hand.filter(id => afterTable.includes(id)); if (!moved.length) return { ok: false, reason: '손패에서 적어도 한 타일을 내야 합니다.' };
  const beforeJokers = new Map(before.table.flatMap(meld => meld.tiles.filter(entry => lookup.get(entry.tileId)?.kind === 'joker').map(entry => [entry.tileId, entry.represents] as const)));
  // 이번 턴에 추가한 타일까지 포함해, 조커를 뺀 원래 타일들이 모두 유효한
  // 조합에 남으면 조커를 해제한다. 여러 조합으로 나누거나 ID를 바꿔도 허용한다.
  const releasedJokers = new Set(before.table.flatMap(previous => previous.tiles
    .filter(entry => lookup.get(entry.tileId)?.kind === 'joker')
    .filter(entry => {
      const remainder = previous.tiles.filter(tile => tile.tileId !== entry.tileId);
      const withoutJoker = after.table.filter(meld => !meld.tiles.some(tile => tile.tileId === entry.tileId));
      return config.allowJokerMeldManipulation
        && remainder.every(tile => withoutJoker.some(meld => meld.tiles.some(candidate => candidate.tileId === tile.tileId)));
    })
    .map(entry => entry.tileId)));
  for (const meld of after.table) for (const entry of meld.tiles) {
    if (!beforeJokers.has(entry.tileId) || releasedJokers.has(entry.tileId)) continue;
    const old = beforeJokers.get(entry.tileId);
    // 그룹의 조커는 어느 빈 색상이든 대신할 수 있다. 숫자와 런의 대체 값은 유지한다.
    const wasGroup = before.table.some(previous => previous.type === 'group' && previous.tiles.some(tile => tile.tileId === entry.tileId));
    if (old?.value !== entry.represents?.value || (old?.color !== entry.represents?.color && !(wasGroup && meld.type === 'group'))) {
      return { ok: false, reason: '기존 조커의 지정 값은 교체 없이 바꿀 수 없습니다.' };
    }
  }
  if (!before.hasInitialMeld) {
    // 새 첫 등록 조합은 추가할 수 있지만, 턴 시작 시 테이블에 있던 조합 자체는 그대로여야 한다.
    // 테이블 전체를 비교하면 정상적인 새 조합 추가도 "기존 테이블 변경"으로 오인한다.
    const existingTableChanged = before.table.some(previous => {
      const current = after.table.find(meld => meld.id === previous.id);
      return JSON.stringify(previous) !== JSON.stringify(current);
    });
    if (!config.allowManipulationOnInitialMeldTurn && existingTableChanged) return { ok: false, reason: '첫 등록 전에는 기존 테이블을 바꿀 수 없습니다.' };
    const newMelds = after.table.filter(meld => !before.table.some(old => old.id === meld.id));
    if (newMelds.some(meld => meld.tiles.some(tile => !before.hand.includes(tile.tileId)))) return { ok: false, reason: '첫 등록 조합은 손패 타일로만 만들어야 합니다.' };
    const points = newMelds.flatMap(meld => meld.tiles).reduce((sum, entry) => sum + (lookup.get(entry.tileId)?.kind === 'joker' ? entry.represents?.value ?? 0 : (lookup.get(entry.tileId) as NumberTile).value), 0);
    if (points < config.initialMeldMin) return { ok: false, reason: `첫 등록은 ${config.initialMeldMin}점 이상이어야 합니다.` };
    return { ok: true, initialMeldPoints: points };
  }
  return { ok: true };
}
export interface RoundScore { winnerId: string; deltas: Record<string, number>; total: number }
export function scoreRound(hands: Record<string, TileId[]>, winnerId: string, tiles: Tile[], jokerPenalty = 30): RoundScore {
  const lookup = tileMap(tiles); const deltas: Record<string, number> = {}; let total = 0;
  for (const [id, hand] of Object.entries(hands)) { if (id === winnerId) continue; const points = hand.reduce((sum, tileId) => sum + (lookup.get(tileId)?.kind === 'joker' ? jokerPenalty : (lookup.get(tileId) as NumberTile | undefined)?.value ?? 0), 0); deltas[id] = -points; total += points; }
  deltas[winnerId] = total; return { winnerId, deltas, total };
}
export function scoreStalemate(hands: Record<string, TileId[]>, tiles: Tile[], jokerPenalty = 30): RoundScore {
  const lookup = tileMap(tiles); const sums = Object.fromEntries(Object.entries(hands).map(([id, hand]) => [id, hand.reduce((sum, tileId) => sum + (lookup.get(tileId)?.kind === 'joker' ? jokerPenalty : (lookup.get(tileId) as NumberTile | undefined)?.value ?? 0), 0)]));
  const winnerId = Object.entries(sums).sort(([, a], [, b]) => a - b)[0]![0]; const deltas: Record<string, number> = {}; let reward = 0;
  for (const [id, sum] of Object.entries(sums)) { if (id === winnerId) continue; const loss = sum - sums[winnerId]!; deltas[id] = -loss; reward += loss; } deltas[winnerId] = reward; return { winnerId, deltas, total: reward };
}
