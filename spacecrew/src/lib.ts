import { gameAudio } from './audio-settings';
import { preferAmbientAudio } from '../../game-audio/audio';
import { useEffect, useState } from 'react';
import type { Card, Game, Mission, Session, Suit } from './types';

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

export function decisionLabel(game: Pick<Game, 'mission' | 'decisionResponses'>, playerId: string): string {
  const answer = game.decisionResponses?.[playerId];
  if (answer === undefined) return '응답 대기';
  if (game.mission.special === 'sick') return answer ? '좋음' : '나쁨';
  if (game.mission.special === 'finalPattern') return answer ? '선호함' : '선호하지 않음';
  return answer ? '예' : '아니오';
}

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
  if (/높|최고|최대|high|highest|top|max|▲|↑/.test(m)) return 'top';
  if (/낮|최저|최소|low|lowest|bottom|min|▼|↓/.test(m)) return 'bottom';
  if (/유일|단독|하나|가운데|중간|only|single|unique|mid|middle|cent|●|•/.test(m)) return 'mid';
  return null;
};
export const markerOf = (card: Card, hand: Card[]): Spot => {
  const same = hand.filter(c => c.suit === card.suit).map(c => c.value);
  return same.length === 1 ? 'mid' : card.value === Math.max(...same) ? 'top' : 'bottom';
};

/* ───────── 미션 규칙 풀어쓰기 ───────── */
export const missionRules = (m: Mission): string[] => {
  const r = m.tasks
    ? [`과제 카드 ${m.tasks}장을 정해진 담당자가 트릭에서 따내야 해요.`]
    : ['과제 카드 없이 특수 목표를 달성해야 해요.'];
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
  const specialRules: Record<string, string> = {
    sick: '커맨더가 지정한 아픈 승무원은 단 한 트릭도 이기면 안 돼요.',
    winOne: '색 카드 값 1로 트릭을 최소 한 번 이겨야 해요.',
    winTwoOnes: '색 카드 값 1로 서로 다른 두 트릭을 이겨야 해요.',
    noComm: '커맨더가 지정한 승무원은 이 미션에서 통신할 수 없어요.',
    swap: '첫 트릭 직후, 모두 오른쪽 이웃의 손패에서 무작위 카드 한 장을 가져와요.',
    rockets: '로켓 1·2·3·4 각각으로 트릭을 한 번 이상 이겨야 해요.',
    noNine: '값 9인 카드로 트릭을 이기면 즉시 실패해요.',
    allTasks: '커맨더가 지정한 한 명이 모든 과제의 담당자가 돼요.',
    balanced: '진행 중 누구끼리든 딴 트릭 수 차이가 2 이상이면 즉시 실패해요.',
    oneTrick: '지정된 승무원은 로켓 없이 정확히 한 트릭만 이겨야 해요.',
    balancedCommander: '딴 트릭 수 차이는 항상 2 미만이어야 하고, 커맨더가 첫·마지막 트릭을 이겨야 해요.',
    firstLast: '지정된 승무원이 로켓 없이 첫·마지막 트릭만 이겨야 해요.',
    rocketOrder: '로켓 1→2→3→4 순서로 각각 트릭을 이겨야 해요.',
    pink: '분홍 9를 가진 승무원의 왼쪽 이웃이 모든 분홍 카드를 가져와야 해요.',
    omegaLastTrick: 'Ω 과제는 마지막 트릭에서 완료해야 해요.',
    finalPattern: '지정한 한 명은 1~4번째, 다른 한 명은 마지막 트릭을 이기고, 나머지는 중간 트릭을 이겨야 해요.',
  };
  if (m.special && specialRules[m.special]) r.push(specialRules[m.special]);
  if (m.special === 'sick') r.push('시작 전에 손패 상태를 “좋음/나쁨”으로만 알리고, 커맨더가 그 힌트를 참고해 아픈 승무원을 정해요. 답은 선택 후보를 제한하지 않아요.');
  if (['allTasks', 'oneTrick', 'firstLast'].includes(m.special ?? '')) r.push('시작 전에 역할을 맡을 의향을 예/아니오로만 알리고, 커맨더가 그 힌트를 참고해 최종 대상을 정해요. 답은 선택 후보를 제한하지 않아요.');
  if (m.special === 'finalPattern') r.push('각자 선호 역할을 알린 뒤, 손패 내용을 말하지 않고 함께 두 담당자를 정해요.');
  return r;
};

/** 과제 카드가 없는 특수 미션에서도, 지정된 승무원의 역할을 좌석에 표시한다. */
export function missionRoleForPlayer(game: Pick<Game, 'mission' | 'targetId' | 'targetBId' | 'pinkNineHolderId'>, playerId: string): string | null {
  const { special } = game.mission;
  if (special === 'pink' && game.pinkNineHolderId === playerId) return '분홍 9 소유자';
  if (game.targetId === playerId) {
    const labels: Record<string, string> = {
      sick: '아픈 요원',
      noComm: '통신 금지 요원',
      oneTrick: '정확히 한 번 승리 요원',
      firstLast: '첫·마지막 트릭 요원',
      pink: '분홍 수집 요원',
      finalPattern: '1~4번째 트릭 요원',
    };
    return special ? labels[special] ?? null : null;
  }
  return special === 'finalPattern' && game.targetBId === playerId ? '마지막 트릭 요원' : null;
}

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
export const getFx = () => ({ ...prefs, sound: !gameAudio.getSettings().muted });
const buzz: Record<FxKind, number | number[]> = { tap: 8, play: 14, comm: [10, 40, 10], win: [20, 60, 20, 60, 40], fail: [60, 40, 60] };
const tone: Record<FxKind, [number, number]> = { tap: [520, 0.05], play: [330, 0.08], comm: [880, 0.18], win: [660, 0.4], fail: [160, 0.3] };
let audio: AudioContext | undefined;
let output: GainNode | undefined;
let unbind: (() => void) | undefined;
const releaseAudioSession = () => { const active = audio; audio = undefined; output = undefined; unbind?.(); unbind = undefined; if (active && active.state !== 'closed') void active.close().catch(() => undefined); };
gameAudio.subscribe(() => { if (gameAudio.volume('effects') === 0) releaseAudioSession(); });
export const setFx = (next: Partial<FxPrefs>) => { prefs = { ...prefs, ...next }; if (next.sound !== undefined) gameAudio.update({ muted: !next.sound }); try { localStorage.setItem(fxKey, JSON.stringify(prefs)); } catch { /* 무시 */ } };
export function cue(kind: FxKind) {
  if (prefs.haptic) navigator.vibrate?.(buzz[kind]);
  if (gameAudio.volume('effects') === 0) return;
  try {
    preferAmbientAudio();
    if (!audio) { audio = new AudioContext(); output = audio.createGain(); unbind = gameAudio.bindGain(output, 'effects'); output.connect(audio.destination); }
    if (audio.state !== 'running' && audio.state !== 'closed') void audio.resume().catch(() => undefined);
    const osc = audio.createOscillator(); const gain = audio.createGain();
    osc.frequency.value = tone[kind][0]; gain.gain.value = 0.04;
    osc.connect(gain); gain.connect(output!); osc.start(); osc.stop(audio.currentTime + tone[kind][1]);
  } catch { /* 오디오 불가 시 무시 */ }
}

/* 주소창·소프트 키보드로 바뀌는 "실제 보이는 높이"를 --app-h(px)에 넣는다. dvh 미지원 웹뷰에서도 레이아웃이 같게 나온다. */
export function watchAppHeight() {
  const set = () => document.documentElement.style.setProperty('--app-h', `${Math.round(window.visualViewport?.height ?? window.innerHeight)}px`);
  set();
  window.addEventListener('resize', set); window.addEventListener('orientationchange', set); window.visualViewport?.addEventListener('resize', set);
  return () => { window.removeEventListener('resize', set); window.removeEventListener('orientationchange', set); window.visualViewport?.removeEventListener('resize', set); };
}


/* ───────── 닉네임 기억 · 초대 링크 ───────── */
const nickKey = 'planet-nine-nick';
export const readNick = () => { try { return localStorage.getItem(nickKey) ?? ''; } catch { return ''; } };
export const saveNick = (nick: string) => { try { localStorage.setItem(nickKey, nick); } catch { /* 무시 */ } };
export const inviteLink = (code: string) => `${location.origin}${location.pathname}?code=${encodeURIComponent(code)}`;
