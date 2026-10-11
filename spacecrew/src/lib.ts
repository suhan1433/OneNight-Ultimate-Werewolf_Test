import { useEffect, useState } from 'react';
import type { Card, Mission, Session, Suit } from './types';

/* ───────── 카드 4색 + 로켓: 색 + 모양 + 글자 ───────── */
export const SUITS: Record<Suit, { name: string; icon: string; cls: string }> = {
  P: { name: '분홍', icon: '●', cls: 'p' },
  B: { name: '파랑', icon: '▲', cls: 'b' },
  G: { name: '초록', icon: '■', cls: 'g' },
  Y: { name: '노랑', icon: '★', cls: 'y' },
  R: { name: '로켓', icon: '🚀', cls: 'r' },
};
const ORDER: Suit[] = ['P', 'B', 'G', 'Y', 'R'];
export const sortHand = (hand: Card[]) => [...hand].sort((a, b) => ORDER.indexOf(a.suit) - ORDER.indexOf(b.suit) || a.value - b.value);
export const cardName = (card: Card) => `${SUITS[card.suit].name} ${card.value}`;
export const cardLabel = (card: Card) => `${SUITS[card.suit].icon} ${card.value}`;

/* ───────── 저장소 ───────── */
export const sessionKey = 'planet-nine-online-session';
export const readSession = (): Session | null => { try { return JSON.parse(localStorage.getItem(sessionKey) ?? 'null'); } catch { return null; } };
export const saveSession = (session: Session) => { try { localStorage.setItem(sessionKey, JSON.stringify(session)); } catch { /* 저장 불가 시 무시 */ } };
export const clearSession = () => { try { localStorage.removeItem(sessionKey); } catch { /* 무시 */ } };
const campaignKey = 'planet-nine-campaign';
export const readCampaign = (): number[] => { try { const v = JSON.parse(localStorage.getItem(campaignKey) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
export const markCleared = (mission: number) => { try { localStorage.setItem(campaignKey, JSON.stringify([...new Set([...readCampaign(), mission])])); } catch { /* 무시 */ } };
const tutorialKey = 'planet-nine-tutorial-seen';
export const tutorialSeen = () => { try { return localStorage.getItem(tutorialKey) === '1'; } catch { return true; } };
export const markTutorialSeen = () => { try { localStorage.setItem(tutorialKey, '1'); } catch { /* 무시 */ } };

/* ───────── 통신 마커 ───────── */
export type Spot = 'top' | 'mid' | 'bottom';
export const spotInfo: Record<Spot, { glyph: string; short: string; long: string }> = {
  top: { glyph: '▲', short: '맨 위', long: '가장 높음' },
  mid: { glyph: '●', short: '가운데', long: '유일함' },
  bottom: { glyph: '▼', short: '맨 아래', long: '가장 낮음' },
};
// 서버 marker 문자열 형식을 모르므로 한글/영문/기호 키워드로 넓게 해석(원본 로직 유지).
export const spotOf = (marker: string): Spot | null => {
  const m = marker.toLowerCase();
  if (/높|high|top|max|▲|↑/.test(m)) return 'top';
  if (/낮|low|bottom|min|▼|↓/.test(m)) return 'bottom';
  if (/유일|only|single|unique|mid|cent|●|•/.test(m)) return 'mid';
  return null;
};
export const markerOf = (card: Card, hand: Card[]): Spot => {
  const same = hand.filter(c => c.suit === card.suit).map(c => c.value);
  return same.length === 1 ? 'mid' : card.value === Math.max(...same) ? 'top' : 'bottom';
};

/* ───────── 미션 규칙 풀어쓰기 ───────── */
export const missionRules = (m: Mission): string[] => {
  const r = [`과제 카드 ${m.tasks}장을 정해진 담당자가 트릭에서 따내야 해요.`];
  if (m.order) r.push(`순서 과제 ${m.order}개: 숫자 1부터 차례대로 달성해야 해요.`);
  if (m.arrows) r.push(`화살표 과제 ${m.arrows}개: › 표시 순서대로 달성해야 해요.`);
  if (m.omega) r.push('Ω 과제: 다른 과제를 모두 끝낸 맨 마지막에 달성해야 해요.');
  if (m.distribute) r.push('과제 담당자는 커맨더가 직접 지정해요.');
  if (m.tokenSwap) r.push('시작 전에 커맨더가 순서 토큰 두 개를 한 번 맞바꿀 수 있어요.');
  if (m.tokenMove) r.push('시작 전에 커맨더가 순서 토큰 하나를 다른 과제로 한 번 옮길 수 있어요.');
  if (m.fiveTransfer) r.push('5인 게임에서는 시작 전에 과제 한 장을 다른 승무원에게 전달할 수 있어요.');
  if (m.pick === 'notCommander') r.push('커맨더가 아닌 승무원 중에서 대상을 지정해요.');
  if (m.deadZone) r.push('데드 존: 통신 카드는 공개하지만 최고·유일·최저 마커는 표시되지 않아요.');
  if (m.commFrom && m.commFrom > 1) r.push(`${m.commFrom}번째 트릭부터 통신할 수 있어요.`);
  if (m.special) r.push('특수 규칙이 있어요. 미션 설명을 꼭 확인하세요.');
  return r;
};

/* ───────── 좌석 배치: 나는 항상 아래(90°), 다음 순번이 시계 방향 ───────── */
export const seatAngle = (index: number, myIndex: number, n: number) => ((90 + (((index - myIndex + n) % n) * 360) / n) * Math.PI) / 180;

/* ───────── 미디어 쿼리 / 모션 ───────── */
export const prefersReducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
export function useMedia(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query); const on = () => setMatches(m.matches);
    on(); m.addEventListener('change', on); return () => m.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/* ───────── 효과음 · 햅틱 훅(기본 꺼짐, 설정에서 켬) ───────── */
export type FxKind = 'tap' | 'play' | 'comm' | 'win' | 'fail';
type FxPrefs = { sound: boolean; haptic: boolean };
const fxKey = 'planet-nine-fx';
let prefs: FxPrefs = { sound: false, haptic: false };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(fxKey) ?? '{}') }; } catch { /* 기본값 유지 */ }
export const getFx = () => prefs;
export const setFx = (next: Partial<FxPrefs>) => { prefs = { ...prefs, ...next }; try { localStorage.setItem(fxKey, JSON.stringify(prefs)); } catch { /* 무시 */ } };
const buzz: Record<FxKind, number | number[]> = { tap: 8, play: 14, comm: [10, 40, 10], win: [20, 60, 20, 60, 40], fail: [60, 40, 60] };
const tone: Record<FxKind, [number, number]> = { tap: [520, 0.05], play: [330, 0.08], comm: [880, 0.18], win: [660, 0.4], fail: [160, 0.3] };
let audio: AudioContext | undefined;
export function cue(kind: FxKind) {
  if (prefs.haptic) navigator.vibrate?.(buzz[kind]);
  if (!prefs.sound) return;
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator(); const gain = audio.createGain();
    osc.frequency.value = tone[kind][0]; gain.gain.value = 0.04;
    osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + tone[kind][1]);
  } catch { /* 오디오 불가 시 무시 */ }
}
