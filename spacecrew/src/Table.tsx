import { useLayoutEffect, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Card, DrawerTab, Game, Send } from './types';
import { SUITS, cue, useMedia } from './lib';
import { Ambient, CardBack, CardFace, SignalMeter, TaskChip } from './ui';
import { Seat } from './Seat';
import { Hand } from './Hand';
import { CommSheet } from './CommSheet';
import { PhasePanel } from './PhasePanel';
import { CrewBoard } from './CrewBoard';
import { Briefing } from './Briefing';
import { Result } from './Result';
import type { View } from './view';

type Props = { game: Game; view: View; send: Send; recordPlay: (c: Card) => void; dismissBriefing: () => void; openDrawer: (tab: DrawerTab) => void; onLeave: () => void };

/* ───────── 상단 바 ───────── */
function TopBar({ game, signal, lost, openDrawer, onLeave }: { game: Game; signal: number; lost: boolean; openDrawer: (t: DrawerTab) => void; onLeave: () => void }) {
  return <header className="topbar">
    <button type="button" className="bar-btn leave" onClick={onLeave}>나가기</button>
    <div className="top-mid">
      <span className="tricks" aria-label={`트릭 ${Math.min(game.trickNo + 1, game.totalTricks)} / ${game.totalTricks}`}>트릭 <b>{Math.min(game.trickNo + 1, game.totalTricks)}/{game.totalTricks}</b></span>
      <SignalMeter signal={signal} lost={lost} />
    </div>
    <button type="button" className="bar-btn round" onClick={() => openDrawer('help')} aria-label="도움말">?</button>
  </header>;
}

/* ───────── 트릭 존: 궤도 링 위에 카드가 각자의 좌석 방향에서 들어온다 ───────── */
function TrickZone({ game, view }: { game: Game; view: View }) {
  const { reveal } = view; const winSeat = reveal ? view.seats.find(s => s.player.id === reveal.winnerId) : undefined;
  const style = { '--sx': winSeat ? Math.cos(winSeat.angle).toFixed(3) : 0, '--sy': winSeat ? Math.sin(winSeat.angle).toFixed(3) : 0 } as CSSProperties;
  const note = reveal ? (reveal.stage === 'show' ? '카드가 모두 공개됐어요' : `${view.byId(reveal.winnerId)?.nickname} 님이 가져가요`)
    : view.lead ? `선도 ${SUITS[view.lead.suit].icon} ${SUITS[view.lead.suit].name}` : '첫 카드를 기다리는 중';
  return <div className={`trick-zone ${reveal ? `rv-${reveal.stage}` : ''}`} style={style} aria-live="polite">
    <svg className="orbit" viewBox="0 0 300 200" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="150" cy="100" rx="146" ry="96" /><ellipse cx="150" cy="100" rx="96" ry="62" /><ellipse cx="150" cy="100" rx="46" ry="30" /></svg>
    <p className="trick-no" key={game.trickNo} aria-hidden="true">TRICK {String(Math.min(game.trickNo + 1, game.totalTricks)).padStart(2, '0')}</p>
    <p className="center-note">{note}</p>
    {view.seats.map(s => {
      const item = view.shown.find(t => t.playerId === s.player.id); const cx = Math.cos(s.angle); const cy = Math.sin(s.angle);
      const win = reveal?.winnerId === s.player.id; const spun = ((s.player.id.charCodeAt(0) + view.seats.indexOf(s) * 7) % 11) - 5;
      return <div key={s.player.id} className={`slot ${win && reveal && reveal.stage !== 'show' ? 'win' : ''}`} style={{ left: `${50 + cx * 33}%`, top: `${50 + cy * 33}%`, '--ex': cx.toFixed(3), '--ey': cy.toFixed(3), '--rot': `${spun}deg` } as CSSProperties}>
        {item ? (item.card ? <CardFace key={item.card.id} card={item.card} size="md" className="played" data={{ 'data-trick-card-id': item.card.id }} /> : <CardBack size="md" className="played" />) : <span className="slot-mark" aria-hidden="true" />}
        {win && reveal && reveal.stage !== 'show' && <span className="lens" aria-hidden="true" />}
        <small>{s.player.nickname}{win && reveal && reveal.stage !== 'show' ? ' · 승리' : ''}</small>
      </div>;
    })}
  </div>;
}

/* ───────── 과제 배정: 테이블 위에 펼친 과제 카드를 내 차례에 눌러 가져간다 ───────── */
function TaskSpread({ game, view, send }: { game: Game; view: View; send: Send }) {
  const pending = game.tasks.filter(t => !t.ownerId); const mine = view.assigner.id === game.playerId; const dist = !!game.mission.distribute;
  const responded = game.decisionResponses?.[game.playerId]; const everyoneResponded = game.players.every(player => player.id in (game.decisionResponses ?? {}));
  const candidates = game.players.filter(player => game.tasks.filter(task => task.ownerId === player.id).length < Math.ceil(game.tasks.length / game.players.length));
  return <div className="spread">
    <p className="spread-note"><b>과제 배정</b> · {dist ? (everyoneResponded ? (mine ? '누가 이 과제를 맡을지 고르세요' : `${view.assigner.nickname} 님이 담당자를 정하는 중`) : '현재 과제를 맡을 의향을 답하세요') : (mine ? '가져갈 과제 카드를 누르세요' : `${view.assigner.nickname} 님이 고르는 중`)}<small>{pending.length}장 남음</small></p>
    <div className="spread-cards">{(dist ? pending.slice(0, 1) : pending).map(t => <TaskChip key={t.id} task={t} size="lg" onPick={mine && !dist ? () => send('TASK_ASSIGN', { taskId: t.id }) : undefined} />)}</div>
    {dist && !everyoneResponded && <><p className="sub">현재 과제를 맡을 의향이 있나요? 예/아니오는 커맨더에게 주는 힌트이며, 배정 후보를 제한하지 않아요.</p><div className="choices"><button disabled={responded !== undefined} onClick={() => send('DECISION_RESPONSE', { yes: true })}>예</button><button disabled={responded !== undefined} onClick={() => send('DECISION_RESPONSE', { yes: false })}>아니오</button></div><p className="sub">{game.players.filter(player => player.id in (game.decisionResponses ?? {})).length}/{game.players.length}명 응답</p></>}
    {dist && everyoneResponded && mine && pending[0] && <div className="choices">{candidates.map(p => <button key={p.id} className="primary" onClick={() => send('TASK_ASSIGN', { taskId: pending[0].id, ownerId: p.id })}>{p.nickname} 에게 맡기기</button>)}</div>}
  </div>;
}

/* ───────── 과제 달성 시 트릭의 과제 카드 → 과제 카드로 금색 선 ───────── */
function GoldLinks({ view }: { view: View }) {
  const [lines, setLines] = useState<{ id: string; x1: number; y1: number; x2: number; y2: number }[]>([]);
  const stage = view.reveal?.stage; const ids = view.reveal?.doneTaskIds.join(',') ?? '';
  useLayoutEffect(() => {
    if (stage !== 'sweep' || !ids) { setLines([]); return; }
    const mid = (el: Element | null | undefined) => { const r = el?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
    const zone = mid(document.querySelector('.trick-zone'));
    setLines(ids.split(',').flatMap(id => { const a = mid(document.querySelector(`[data-trick-card-id="${id}"]`)) ?? zone; const b = mid(document.querySelector(`[data-task-id="${id}"]`)); return a && b ? [{ id, x1: a.x, y1: a.y, x2: b.x, y2: b.y }] : []; }));
  }, [stage, ids]);
  return lines.length ? <svg className="gold-links" aria-hidden="true">{lines.map(l => <g key={l.id}><line pathLength={1} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} /><circle cx={l.x2} cy={l.y2} r="16" /></g>)}</svg> : null;
}

/* ───────── 한 줄 안내: 지금 차례 / 내가 할 일 / 통신 가능 여부 ───────── */
function StatusLine({ view, onComm }: { view: View; onComm: () => void }) {
  const mark = { act: '▶', wait: '…', lock: '■', info: '◆' }[view.status.tone];
  return <div className="status-row">
    <p className={`status t-${view.status.tone}`} role="status"><b><span aria-hidden="true">{mark} </span>{view.status.text}</b>{view.commNote && <small>{view.commNote}</small>}</p>
    {view.canComm && <button type="button" className="comm-btn" onClick={onComm}>📡 통신하기</button>}
  </div>;
}

/* ───────── 장면 전환 배너: 단계가 바뀔 때 1.9초간 가로 띠로 알린다(첫 진입·재접속에는 띄우지 않음) ───────── */
const BANNER: Record<string, string> = { assign: '과제 배정', target: '대상 지정', token: '토큰 조정', transfer: '과제 전달', vote: '조난 신호', pass: '조난 신호 활성화', direction: '조난 신호 활성화' };
function useBanner(kind: string, trickNo: number) {
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const prev = useRef<string | null>(null); const seq = useRef(0);
  useEffect(() => {
    const before = prev.current; prev.current = kind;
    if (before === null || before === kind) return;
    const text = kind === 'play' && before !== 'result' && trickNo === 0 ? '미션 개시' : BANNER[kind];
    if (!text) return;
    setBanner({ id: ++seq.current, text });
    const id = window.setTimeout(() => setBanner(null), 1900); return () => window.clearTimeout(id);
  }, [kind, trickNo]);
  return banner;
}

export function Table({ game, view, send, recordPlay, dismissBriefing, openDrawer, onLeave }: Props) {
  const compact = useMedia('(max-width: 760px)');
  const [commOpen, setCommOpen] = useState(false);
  const [peek, setPeek] = useState(false); // 결과 창을 잠시 접고 마지막 테이블을 본다
  const banner = useBanner(view.kind, game.trickNo);
  useEffect(() => { if (!view.canComm) setCommOpen(false); }, [view.canComm]);
  useEffect(() => { if (!view.showResult) setPeek(false); }, [view.showResult]);
  // 내 차례 알림: 탭 제목 + (설정 시) 진동·효과음. 다른 탭에 있어도 알 수 있다.
  const myTurnNow = view.myTurn && view.kind === 'play';
  const baseTitle = useRef(document.title);
  useEffect(() => { if (myTurnNow) { cue('tap'); document.title = '▶ 내 차례 · 더 크루'; } return () => { document.title = baseTitle.current; }; }, [myTurnNow]);
  // 과제 달성 연출 순간의 효과음
  const rStage = view.reveal?.stage; const rDone = view.reveal?.doneTaskIds.length ?? 0;
  useEffect(() => { if (rStage === 'sweep' && rDone > 0) cue('win'); }, [rStage, rDone]);
  const meSeat = view.seats.find(s => s.isMe)!; const failed = view.kind === 'result' && !game.result?.win; const won = view.kind === 'result' && !!game.result?.win;
  const doneTasks = game.tasks.filter(x => x.done).length;
  const signal = failed ? 0.06 : won ? 1 : game.tasks.length ? doneTasks / game.tasks.length : Math.min(1, game.trickNo / Math.max(1, game.totalTricks));
  const panel = ['target', 'token', 'transfer', 'vote', 'pass', 'direction'].includes(view.kind);
  return <main className={`table-scene ${compact ? 'compact' : ''} k-${view.kind} ${panel || view.kind === 'assign' ? 'panel-phase' : ''} ${failed ? 'failed' : ''} ${won ? 'won' : ''} ${myTurnNow ? 'my-turn' : ''}`} style={{ '--signal': signal } as CSSProperties}>
    <Ambient />
    <TopBar game={game} signal={signal} lost={failed} openDrawer={openDrawer} onLeave={onLeave} />
    <section className="stage" aria-label="테이블">
      {!compact && <div className="oval" aria-hidden="true" />}
      {!compact && view.seats.filter(s => !s.isMe).map(s => <Seat key={s.player.id} player={s.player} game={game} view={view} variant="ring" angle={s.angle} />)}
      <div className="center">
        {view.kind === 'assign' ? <TaskSpread game={game} view={view} send={send} /> : panel ? <PhasePanel game={game} view={view} send={send} /> : <TrickZone game={game} view={view} />}
      </div>
      {!compact && <Seat player={meSeat.player} game={game} view={view} variant="me" />}
    </section>
    {compact && <CrewBoard game={game} view={view} />}
    {!compact && view.lastLine && <div className="last-line"><span>최근</span>{view.lastLine}</div>}
    <div className="dock">
      <StatusLine view={view} onComm={() => setCommOpen(true)} />
      <Hand game={game} view={view} send={send} recordPlay={recordPlay} compact={compact} />
    </div>
    {commOpen && view.canComm && <CommSheet game={game} view={view} send={send} onClose={() => setCommOpen(false)} />}
    <GoldLinks view={view} />
    {view.briefing && <Briefing game={game} onClose={dismissBriefing} />}
    {banner && <div key={banner.id} className="phase-banner" aria-hidden="true"><b>{banner.text}</b></div>}
    {view.showResult && !peek && <Result game={game} view={view} send={send} onPeek={() => setPeek(true)} />}
    {view.showResult && peek && <button type="button" className="primary peek-fab" onClick={() => setPeek(false)}>결과 다시 보기</button>}
  </main>;
}
