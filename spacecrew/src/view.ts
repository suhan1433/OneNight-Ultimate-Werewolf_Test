/**
 * 서버 상태(Game) → 화면 상태(View) 변환은 이 파일에서만 한다.
 *  - useGameView: 트릭 판정 연출(reveal), 브리핑 표시 시점 등 "시간에 따라 변하는" 화면 상태
 *  - deriveView : 한 시점의 Game 에서 파생되는 값(차례, 낼 수 있는 카드, 통신 창, 안내 문구 …)
 */
import { useEffect, useRef, useState } from 'react';
import type { Card, Game, Player, TrickCard } from './types';
import { prefersReducedMotion, seatAngle } from './lib';

export type PhaseKind = 'lobby' | 'play' | 'assign' | 'target' | 'token' | 'transfer' | 'vote' | 'direction' | 'pass' | 'result';
export type Reveal = { cards: TrickCard[]; winnerId: string; stage: 'show' | 'lens' | 'sweep'; doneTaskIds: string[] };
export type Tone = 'act' | 'wait' | 'lock' | 'info';

const KIND: Record<string, PhaseKind> = { lobby: 'lobby', result: 'result', assign: 'assign', chooseTarget: 'target', tokenEdit: 'token', taskTransfer: 'transfer', distressVote: 'vote', distressDirection: 'direction', distressPass: 'pass' };
// 트릭 판정 연출 시간(ms): 전부 공개 → 렌즈 → 쓸어가기. 모션 줄이기면 렌즈·쓸기 생략.
const T = { show: 1600, lens: 600, sweep: 500 };

export function useGameView(game: Game | null) {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [finalTrick, setFinalTrick] = useState<TrickCard[]>([]);
  const [briefing, setBriefing] = useState(false);
  const prev = useRef({ phase: null as string | null, trick: [] as Game['trick'], done: new Set<string>() });
  const myPlay = useRef<Card | null>(null);
  const timers = useRef<number[]>([]);
  const clear = () => { timers.current.forEach(id => window.clearTimeout(id)); timers.current = []; };
  useEffect(() => clear, []);

  useEffect(() => {
    if (!game) { prev.current = { phase: null, trick: [], done: new Set() }; clear(); setReveal(null); setBriefing(false); setFinalTrick([]); return; }
    const p = prev.current;
    if (game.phase === 'lobby') { setBriefing(false); clear(); setReveal(null); setFinalTrick([]); }
    else if (p.phase === 'lobby') setBriefing(true); // 대기실 → 시작 전환을 직접 본 경우에만 브리핑
    const winnerId = game.lastTrick?.winnerId;
    // 비어 있지 않던 트릭이 비워졌다 = 트릭 종료
    if (game.phase !== 'lobby' && game.trick.length === 0 && p.trick.length > 0 && winnerId) {
      const known: TrickCard[] = game.lastTrick?.cards ?? p.trick;
      const missing: TrickCard[] = game.players.filter(pl => !known.some(k => k.playerId === pl.id)).map(pl => ({ playerId: pl.id, card: pl.id === game.playerId ? myPlay.current : null }));
      const cards = [...known, ...missing];
      const doneTaskIds = game.tasks.filter(t => t.done && !p.done.has(t.id)).map(t => t.id);
      const t = prefersReducedMotion() ? { ...T, lens: 0, sweep: 0 } : T;
      clear(); setFinalTrick(cards); setReveal({ cards, winnerId, stage: 'show', doneTaskIds });
      let at = t.show;
      timers.current.push(window.setTimeout(() => setReveal(r => r && { ...r, stage: 'lens' }), at)); at += t.lens;
      timers.current.push(window.setTimeout(() => setReveal(r => r && { ...r, stage: 'sweep' }), at)); at += t.sweep;
      timers.current.push(window.setTimeout(() => setReveal(null), at));
    }
    prev.current = { phase: game.phase, trick: game.trick, done: new Set(game.tasks.filter(t => t.done).map(t => t.id)) };
  }, [game]);

  return {
    view: game ? deriveView(game, reveal, briefing, finalTrick) : null,
    recordPlay: (card: Card) => { myPlay.current = card; },
    dismissBriefing: () => setBriefing(false),
  };
}

export function deriveView(game: Game, reveal: Reveal | null, briefing: boolean, finalTrick: TrickCard[]) {
  const n = game.players.length;
  const meIdx = Math.max(0, game.players.findIndex(p => p.id === game.playerId));
  const me = game.players[meIdx];
  const kind: PhaseKind = KIND[game.phase] ?? 'play'; // 알 수 없는 phase 이름은 모두 '카드 플레이'로 취급
  const seats = game.players.map((player, i) => ({ player, angle: seatAngle(i, meIdx, n), isMe: i === meIdx }));
  const byId = (id: string | null | undefined): Player | undefined => game.players.find(p => p.id === id);
  const cmdIdx = Math.max(0, game.players.findIndex(p => p.id === game.commanderId));
  const assigner = game.players[(cmdIdx + game.assignmentCursor) % n];
  const isCommander = game.commanderId === game.playerId;
  const playing = kind === 'play';
  const resolving = !!reveal;
  const legal = new Set(game.legalCardIds);
  const myTurn = playing && game.turnId === game.playerId && !resolving;
  // Do not replace a resolving trick with the next trick's first card.
  const shown: TrickCard[] = reveal?.cards ?? game.trick;
  const lead = game.trick[0]?.card ?? reveal?.cards[0]?.card ?? null;

  // 통신: 트릭의 첫 카드가 놓이기 전 + 아직 통신 안 한 사람이면 누구나(차례 무관)
  const notYet = game.trickNo + 1 < (game.mission.commFrom ?? 1);
  const noComm = game.mission.special === 'noComm' && game.targetId === game.playerId;
  const commWindow = playing && game.trick.length === 0 && !notYet;
  const canComm = commWindow && !me.comm && !noComm && !resolving;
  const eligible = game.hand.filter(c => c.suit !== 'R').filter(c => {
    const v = game.hand.filter(x => x.suit === c.suit).map(x => x.value);
    return c.value === Math.min(...v) || c.value === Math.max(...v);
  });
  const commNote = noComm ? '이번 미션에서 나는 통신할 수 없어요'
    : notYet ? `${game.mission.commFrom}번째 트릭부터 통신할 수 있어요`
    : me.comm ? '통신 완료'
    : resolving ? '판정이 끝나면 통신할 수 있어요'
    : game.trick.length ? '통신 창 닫힘 · 다음 트릭 전에 열려요'
    : '통신 가능 · 첫 카드가 놓이기 전까지';

  // 진행 순서: 이번 트릭의 선도부터 시계 방향(배열 순). 과제 배정 중에는 배정 차례부터, 그 밖의 단계는 커맨더부터.
  const startId = kind === 'play' ? game.trick[0]?.playerId ?? reveal?.cards[0]?.playerId ?? game.leaderId ?? game.turnId ?? game.players[0].id
    : kind === 'assign' ? assigner.id : game.commanderId ?? game.players[0].id;
  const s0 = Math.max(0, game.players.findIndex(p => p.id === startId));
  const queue = game.players.map((_, k) => game.players[(s0 + k) % n]);
  const activeId = kind === 'play' ? game.turnId : kind === 'assign' ? assigner.id : kind === 'target' || kind === 'token' ? game.commanderId : null;
  const answered = (map?: Record<string, boolean>) => map !== undefined && game.playerId in map;
  let status: { text: string; tone: Tone };
  switch (kind) {
    case 'play': status = resolving ? { text: '트릭 판정 중 · 카드가 모두 공개돼요', tone: 'lock' } : myTurn ? { text: '내 차례 · 빛나는 카드 중 한 장을 내세요', tone: 'act' } : { text: `${byId(game.turnId)?.nickname ?? '다른 승무원'} 님의 차례를 기다리는 중`, tone: 'wait' }; break;
    case 'assign': status = assigner.id === me.id ? { text: game.mission.distribute ? '내 차례 · 과제를 맡길 승무원을 고르세요' : '내 차례 · 가져갈 과제 카드를 누르세요', tone: 'act' } : { text: `${assigner.nickname} 님이 과제를 고르는 중`, tone: 'wait' }; break;
    case 'target': status = game.mission.special === 'noComm' ? (isCommander ? { text: '통신할 수 없는 승무원을 지정하세요', tone: 'act' } : { text: '커맨더가 승무원을 지정하는 중', tone: 'wait' }) : !answered(game.decisionResponses) ? { text: '먼저 예/아니오로 대답하세요', tone: 'act' } : isCommander ? { text: '모두 대답하면 대상을 지정하세요', tone: 'act' } : { text: '커맨더가 대상을 고르는 중', tone: 'wait' }; break;
    case 'token': status = isCommander ? { text: '토큰을 조정하거나 그대로 진행하세요', tone: 'act' } : { text: '커맨더가 토큰을 정하는 중', tone: 'wait' }; break;
    case 'transfer': status = { text: '과제를 넘길지 정하세요', tone: 'act' }; break;
    case 'vote': status = answered(game.distressVotes) ? { text: '다른 승무원의 응답을 기다리는 중', tone: 'wait' } : { text: '조난 신호를 쓸지 투표하세요', tone: 'act' }; break;
    case 'direction': status = game.playerId in (game.distressDirections ?? {}) ? { text: '다른 승무원의 방향 선택을 기다리는 중', tone: 'wait' } : { text: '카드를 전달할 방향을 고르세요', tone: 'act' }; break;
    case 'pass': status = game.distressPassed ? { text: '다른 승무원을 기다리는 중', tone: 'wait' } : { text: '선택한 방향의 이웃에게 보낼 카드를 고르세요', tone: 'act' }; break;
    case 'result': status = { text: game.result?.win ? '미션 성공' : '미션 실패', tone: 'info' }; break;
    default: status = { text: '', tone: 'info' };
  }

  return {
    kind, me, meIdx, seats, queue, byId, assigner, isCommander, playing, resolving, legal, myTurn,
    shown, lead, reveal, activeId, status, commNote: playing ? commNote : '', canComm, eligible,
    briefing, showResult: kind === 'result' && !resolving,
    finalTrick, missed: game.tasks.filter(t => !t.done),
    lastLine: game.log[game.log.length - 1] ?? '', // 가정: log 는 오래된 것 → 최신 순
  };
}
export type View = ReturnType<typeof deriveView>;
