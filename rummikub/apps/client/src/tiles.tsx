import { memo, useSyncExternalStore } from 'react';
import type { Meld, Tile } from '@rummikub/rules';
import { validateMeld } from '@rummikub/rules';
import { sfx } from './sound.js';

export type Num = Exclude<Tile, { kind: 'joker' }>;
export const isNum = (t: Tile): t is Num => t.kind !== 'joker';
export const SUIT = { red: '●', blue: '◆', orange: '▲', black: '■' } as const;
export const COLORS = ['red', 'blue', 'orange', 'black'] as const;

export const JokerMark = () => (
  <svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
    <path d="M6 13 8 4l5 5 3-6 3 6 5-5 2 9Z" fill="currentColor" /><circle cx="16" cy="21" r="8" /><circle cx="13" cy="20" r=".9" fill="currentColor" /><circle cx="19" cy="20" r=".9" fill="currentColor" /><path d="M12.5 23.5q3.5 3 7 0" />
  </svg>
);

type TileProps = { tile: Tile; repC?: Num['color']; repV?: number; selected?: boolean; ghosted?: boolean; fresh?: boolean; flash?: boolean; isNew?: boolean; ins?: 'a' | 'b' | null; sheet?: boolean; passive?: boolean };
/**
 * 타일 1장. 포인터/키 이벤트는 컨테이너에서 위임(data-t)하므로 props가 안정적이고 memo가 잘 먹는다.
 * 색 외에도 상태를 구분하도록: 이번 턴 타일=모서리 점(.fresh), 새로 뽑은 타일=NEW 띠(.isnew), 선택=테두리+상승.
 */
export const TileView = memo(function TileView({ tile, repC, repV, selected, ghosted, fresh, flash, isNew, ins, sheet, passive }: TileProps) {
  const j = !isNum(tile);
  const attr = sheet ? { 'data-s': tile.id } : passive ? {} : { 'data-t': tile.id };
  return (
    <span className={`ts ${ins ? `ins-${ins}` : ''}`} data-tid={tile.id}>
      <button className={`tile ${j ? 'joker' : tile.color} ${selected ? 'selected' : ''} ${ghosted ? 'ghosted' : ''} ${fresh ? 'fresh' : ''} ${flash ? 'flash' : ''} ${isNew ? 'isnew' : ''}`}
        {...attr} tabIndex={passive ? -1 : 0} aria-pressed={!!selected} aria-label={j ? '조커' : `${tile.color} ${tile.value}`}>
        <strong>{j ? <JokerMark /> : tile.value}</strong><span>{j ? '' : SUIT[tile.color]}</span>
        {j && repC && repV ? <em className={`rep ${repC}`}>{SUIT[repC]}{repV}</em> : null}
      </button>
    </span>
  );
});

export const Letters = ({ text, tilt = true }: { text: string; tilt?: boolean }) => (
  <div className="letters" aria-label={text}>{[...text].map((c, i) => <b key={i} className={`tile letter ${COLORS[i % 4]}`} style={{ ['--i' as string]: i, ['--r' as string]: `${tilt ? [-5, 3, -2, 5][i % 4] : 0}deg` }}>{c}</b>)}</div>
);

export function SoundToggle() {
  const muted = useSyncExternalStore(sfx.subscribe, sfx.isMuted);
  return (
    <button className="snd" onClick={() => sfx.toggle()} aria-pressed={!muted} aria-label={muted ? '소리 켜기' : '소리 끄기'} title={muted ? '소리 켜기' : '소리 끄기'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />{muted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
    </button>
  );
}

const RING = 2 * Math.PI * 23;
/** 아바타 둘레에 남은 시간을 얇은 호로 보여준다. */
export function Ring({ active, pct, danger, sec, children }: { active: boolean; pct: number; danger?: boolean; sec: number; children: React.ReactNode }) {
  return (
    <div className={`ring ${active ? 'on' : ''} ${danger ? 'danger' : ''}`} role={active ? 'timer' : undefined} aria-label={active ? `${sec}초 남음` : undefined}>
      <svg viewBox="0 0 52 52" aria-hidden="true"><circle className="track" cx="26" cy="26" r="23" /><circle className="arc" cx="26" cy="26" r="23" style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - pct / 100) }} /></svg>
      {children}
    </div>
  );
}

export type SortMode = 'smart' | 'num' | 'color' | 'custom';
/** 손패 추천 정리: 같은 색 연속(런) → 같은 숫자 다른 색(그룹) → 나머지 → 조커 */
export function smartSort(hand: Tile[]) {
  const rest = hand.filter(isNum).sort((a, b) => a.color.localeCompare(b.color) || a.value - b.value);
  const clusters: Tile[][] = [];
  const take = (g: Tile[]) => { clusters.push(g); g.forEach(t => rest.splice(rest.indexOf(t as Num), 1)); };
  for (const c of COLORS) {
    let run: Num[] = [];
    const flush = () => { if (run.length >= 3) take(run); run = []; };
    for (const t of rest.filter(t => t.color === c)) {
      const last = run[run.length - 1];
      if (last && t.value === last.value) continue;
      if (last && t.value === last.value + 1) run.push(t); else { flush(); run = [t]; }
    }
    flush();
  }
  for (let v = 1; v <= 13; v++) { const g = [...new Map(rest.filter(t => t.value === v).map(t => [t.color, t])).values()]; if (g.length >= 3) take(g); }
  if (rest.length) clusters.push([...rest]);
  const jokers = hand.filter(t => !isNum(t)); if (jokers.length) clusters.push(jokers);
  return { hand: clusters.flat(), breaks: new Set(clusters.slice(1).map(c => c[0]!.id)) };
}
/** 숫자순(같은 숫자는 색 순) — 묶음 구분선 없음 */
export const sortByNumber = (hand: Tile[]) => [...hand].sort((a, b) => (isNum(a) ? a.value : 99) - (isNum(b) ? b.value : 99) || (isNum(a) && isNum(b) ? COLORS.indexOf(a.color) - COLORS.indexOf(b.color) : 0));
/** 색상순(색 → 숫자) — 색이 바뀔 때마다 묶음 구분선을 넣는다 */
export function sortByColor(hand: Tile[]) {
  const nums = hand.filter(isNum).sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || a.value - b.value);
  const out = [...nums, ...hand.filter(t => !isNum(t))];
  const breaks = new Set<number>();
  out.forEach((t, i) => { const p = out[i - 1]; if (p && (isNum(t) ? t.color : 'joker') !== (isNum(p) ? p.color : 'joker')) breaks.add(t.id); });
  return { hand: out, breaks };
}

/** 손패에서 바로 낼 수 있는 3장 조합을 겹치지 않게 골라 준다. 완전한 솔버가 아니라 초보자를 위한 보조 기능. */
export function suggestedMelds(hand: Tile[], allowTwoJokers: boolean): Meld[] {
  const rest = [...hand];
  const out: Meld[] = [];
  while (rest.length >= 3) {
    const candidates: Array<{ meld: Meld; ids: number[]; value: number }> = [];
    for (let a = 0; a < rest.length - 2; a += 1) for (let b = a + 1; b < rest.length - 1; b += 1) for (let c = b + 1; c < rest.length; c += 1) {
      const sample = [rest[a]!, rest[b]!, rest[c]!];
      // 손패가 많을 때(35~40장) O(n³) 검증 비용을 줄이기 위한 값싼 사전 필터: 명백히 조합이 될 수 없는 3장은 건너뛴다
      const ns = sample.filter(isNum);
      if (ns.length === 3) {
        const sameColor = ns.every(t => t.color === ns[0]!.color), sameValue = ns.every(t => t.value === ns[0]!.value);
        const vs = ns.map(t => t.value);
        if (!(sameColor && Math.max(...vs) - Math.min(...vs) === 2 && new Set(vs).size === 3) && !(sameValue && new Set(ns.map(t => t.color)).size === 3)) continue;
      }
      const checked = validateMeld(sample, allowTwoJokers, `auto-${sample.map(tile => tile.id).join('-')}`);
      if (checked.ok) candidates.push({ meld: checked.meld, ids: sample.map(tile => tile.id), value: sample.reduce((sum, tile) => sum + (isNum(tile) ? tile.value : 13), 0) });
    }
    const best = candidates.sort((a, b) => b.value - a.value)[0];
    if (!best) break;
    out.push(best.meld);
    const used = new Set(best.ids);
    for (let index = rest.length - 1; index >= 0; index -= 1) if (used.has(rest[index]!.id)) rest.splice(index, 1);
  }
  return out;
}
