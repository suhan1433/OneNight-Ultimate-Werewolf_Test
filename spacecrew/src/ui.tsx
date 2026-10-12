import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { Card, Mission, Task } from './types';
import { SUITS, missionRules, prefersReducedMotion, readCampaign, spotInfo, type Spot } from './lib';

/* ───────── 별 배경: 인라인 SVG 데이터 URI 3겹(이미지 파일 없음) ───────── */
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const tile = (seed: number, size: number, count: number, maxR: number, fill: string) => {
  const r = rng(seed); let s = '';
  for (let i = 0; i < count; i++) s += `<circle cx='${(r() * size).toFixed(0)}' cy='${(r() * size).toFixed(0)}' r='${(0.4 + r() * maxR).toFixed(1)}' fill='${fill}' opacity='${(0.3 + r() * 0.6).toFixed(2)}'/>`;
  return { size, url: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${s}</svg>`)}")` };
};
export function Starfield({ scoped = false }: { scoped?: boolean }) {
  const layers = useMemo(() => [tile(3, 520, 46, 0.9, '#cfe0ff'), tile(8, 780, 26, 1.2, '#9fd6ff'), tile(15, 1100, 14, 1.6, '#ffffff')], []);
  return <div className={`stars ${scoped ? 'scoped' : ''}`} aria-hidden="true">{layers.map((l, i) => <i key={i} style={{ backgroundImage: l.url, backgroundSize: `${l.size}px ${l.size}px`, '--tile': `${l.size}px`, animationDuration: `${[260, 380, 560][i]}s` } as CSSProperties} />)}</div>;
}

/* ───────── 카드 ───────── */
export type Size = 'xs' | 'sm' | 'md' | 'lg';
type CardProps = {
  card: Card; size?: Size; onClick?: (e: MouseEvent<HTMLButtonElement>) => void; onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  playable?: boolean; selected?: boolean; className?: string; style?: CSSProperties; tabIndex?: number; data?: Record<`data-${string}`, string>;
};
export function CardFace({ card, size = 'md', onClick, onKeyDown, playable, selected, className = '', style, tabIndex, data }: CardProps) {
  const s = SUITS[card.suit];
  const cls = `card s-${s.cls} ${size} ${playable === true ? 'live' : ''} ${playable === false ? 'sunk' : ''} ${selected ? 'picked' : ''} ${className}`.replace(/\s+/g, ' ').trim();
  const inner = <>
    <span className="k tl"><b>{card.value}</b><i aria-hidden="true">{s.icon}</i></span>
    <span className="mid" aria-hidden="true">{s.icon}</span>
    <span className="k br" aria-hidden="true"><b>{card.value}</b><i>{s.icon}</i></span>
  </>;
  if (onClick) return <button type="button" className={cls} style={style} onClick={onClick} onKeyDown={onKeyDown} tabIndex={tabIndex} aria-pressed={selected} aria-label={`${s.name} ${card.value}${playable === false ? ', 지금은 낼 수 없음' : ''}`} {...data}>{inner}</button>;
  return <div className={cls} style={style} role="img" aria-label={`${s.name} ${card.value}`} {...data}>{inner}</div>;
}
export const CardBack = ({ size = 'md', className = '', style }: { size?: Size; className?: string; style?: CSSProperties }) => <div className={`card back ${size} ${className}`} style={style} role="img" aria-label="뒷면 카드"><span className="mid" aria-hidden="true">9</span></div>;

/* 통신 마커: 카드 옆 세로 레일. 맨 위 / 가운데 / 맨 아래 */
export const MarkerRail = ({ spot, still = false }: { spot: Spot; still?: boolean }) => <span className={`rail ${spot} ${still ? 'still' : ''}`} aria-hidden="true"><i /><i /><i /><b className="pin" /></span>;
export const spotText = (spot: Spot) => `${spotInfo[spot].glyph} ${spotInfo[spot].short} · ${spotInfo[spot].long}`;

export const taskTokenText = (task: Task) => task.omega ? 'Ω' : task.arrow ? '›'.repeat(task.arrow) : task.order ? String(task.order) : '';
export const TaskToken = ({ task }: { task: Task }) => { const t = taskTokenText(task); return t ? <span className="token" aria-label={`순서 표시 ${t}`}>{t}</span> : null; };
export const Avatar = ({ name }: { name: string }) => <span className="avatar" aria-hidden="true">{name.slice(0, 1)}</span>;
export const Rules = ({ mission }: { mission: Mission }) => <ul className="rules">{missionRules(mission).map(r => <li key={r}>{r}</li>)}</ul>;

/* ───────── FLIP: 과제 카드가 중앙 → 좌석으로 날아가 붙는다 ───────── */
const seen = new Map<string, { r: DOMRect; k: string }>();
export function useFlip<T extends HTMLElement>(id: string, key: string | null) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect(); const prev = seen.get(id); seen.set(id, { r, k: String(key) });
    if (!prev || prev.k === String(key) || prefersReducedMotion() || !el.animate) return;
    el.animate([{ transform: `translate(${prev.r.left - r.left}px, ${prev.r.top - r.top}px) scale(${prev.r.width / r.width})` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
  return ref;
}
export function TaskChip({ task, size = 'xs', fail = false, selected, onPick }: { task: Task; size?: Size; fail?: boolean; selected?: boolean; onPick?: () => void }) {
  const ref = useFlip<HTMLSpanElement>(task.id, task.ownerId);
  return <span ref={ref} className={`task-chip ${task.done ? 'done' : ''} ${fail ? 'fail' : ''}`} data-task-id={task.id}>
    <CardFace card={task} size={size} onClick={onPick} selected={onPick ? !!selected : undefined} />
    <TaskToken task={task} />
    {task.done && <em className="tick" aria-label="완료">✓</em>}
  </span>;
}

/* ───────── 미션 지도: 50개 궤도 노드 ───────── */
export function MissionMap({ current, onPick, strip = 0 }: { current: number; onPick?: (n: number) => void; strip?: number }) {
  const box = useRef<HTMLOListElement>(null); const cleared = new Set(readCampaign());
  useEffect(() => { box.current?.querySelector('.now')?.scrollIntoView({ block: 'nearest', inline: 'center' }); }, [current]);
  const nums = Array.from({ length: 50 }, (_, i) => i + 1).filter(n => !strip || Math.abs(n - current) <= strip);
  return <nav className={`map ${strip ? 'strip' : ''}`} aria-label="미션 지도"><ol ref={box}>{nums.map(n => {
    const done = cleared.has(n); const label = `미션 ${n}${done ? ' 완료' : ''}${n === current ? ' · 현재' : ''}`;
    const body: ReactNode = <><span className="n">{n}</span>{done && <span className="seal" aria-hidden="true">✦</span>}</>;
    return <li key={n} className={`node ${n === current ? 'now' : ''} ${done ? 'cleared' : ''}`}>{onPick ? <button type="button" aria-label={label} aria-current={n === current} onClick={() => onPick(n)}>{body}</button> : <span role="img" aria-label={label}>{body}</span>}</li>;
  })}</ol></nav>;
}
