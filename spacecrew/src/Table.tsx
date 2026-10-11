import { useLayoutEffect, useEffect, useState, type CSSProperties } from 'react';
import type { Card, DrawerTab, Game, Send } from './types';
import { SUITS, useMedia } from './lib';
import { CardBack, CardFace, TaskChip } from './ui';
import { Seat } from './Seat';
import { Hand } from './Hand';
import { CommSheet } from './CommSheet';
import { PhasePanel } from './PhasePanel';
import { Briefing } from './Briefing';
import { Result } from './Result';
import { Rules } from './ui';
import type { View } from './view';

type Props = { game: Game; view: View; send: Send; recordPlay: (c: Card) => void; dismissBriefing: () => void; openDrawer: (tab: DrawerTab) => void; onLeave: () => void };

/* ───────── 상단 바 ───────── */
function TopBar({ game, compact, rulesOpen, setRulesOpen, openDrawer, onLeave }: { game: Game; compact: boolean; rulesOpen: boolean; setRulesOpen: (v: boolean) => void; openDrawer: (t: DrawerTab) => void; onLeave: () => void }) {
  return <header className="topbar">
    <button type="button" className="mission-pill" aria-expanded={compact ? undefined : rulesOpen} onClick={() => compact ? openDrawer('mission') : setRulesOpen(!rulesOpen)}>
      <b>미션 {game.missionId}</b><span>{game.mission.text}</span><i aria-hidden="true">{compact ? '≡' : rulesOpen ? '▴' : '▾'}</i>
    </button>
    <span className="tricks" aria-label={`트릭 ${Math.min(game.trickNo + 1, game.totalTricks)} / ${game.totalTricks}`}>트릭 <b>{Math.min(game.trickNo + 1, game.totalTricks)}/{game.totalTricks}</b></span>
    <button type="button" className="bar-btn" onClick={() => openDrawer('log')}>기록</button>
    <button type="button" className="bar-btn round" onClick={() => openDrawer('help')} aria-label="도움말">?</button>
    <button type="button" className="bar-btn leave" onClick={onLeave}>나가기</button>
    {!compact && rulesOpen && <div className="rules-pop"><Rules mission={game.mission} /></div>}
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
  return <div className="spread">
    <p className="spread-note"><b>과제 배정</b> · {mine ? (dist ? '과제를 맡길 승무원을 고르세요' : '가져갈 과제 카드를 누르세요') : `${view.assigner.nickname} 님이 고르는 중`}<small>{pending.length}장 남음</small></p>
    <div className="spread-cards">{(dist ? pending.slice(0, 1) : pending).map(t => <TaskChip key={t.id} task={t} size="lg" onPick={mine && !dist ? () => send('TASK_ASSIGN', { taskId: t.id }) : undefined} />)}</div>
    {dist && mine && pending[0] && <div className="choices">{game.players.map(p => <button key={p.id} className="primary" onClick={() => send('TASK_ASSIGN', { taskId: pending[0].id, ownerId: p.id })}>{p.nickname} 에게 맡기기</button>)}</div>}
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

export function Table({ game, view, send, recordPlay, dismissBriefing, openDrawer, onLeave }: Props) {
  const compact = useMedia('(max-width: 760px)');
  const [commOpen, setCommOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => { if (!view.canComm) setCommOpen(false); }, [view.canComm]);
  const meSeat = view.seats.find(s => s.isMe)!; const failed = view.kind === 'result' && !game.result?.win;
  const panel = ['target', 'token', 'transfer', 'vote', 'pass'].includes(view.kind);
  return <main className={`table-scene ${compact ? 'compact' : ''} k-${view.kind} ${failed ? 'failed' : ''}`}>
    <TopBar game={game} compact={compact} rulesOpen={rulesOpen} setRulesOpen={setRulesOpen} openDrawer={openDrawer} onLeave={onLeave} />
    {compact && <ul className="crew-strip" aria-label="승무원">{view.seats.filter(s => !s.isMe).map(s => <Seat key={s.player.id} player={s.player} game={game} view={view} variant="chip" />)}</ul>}
    <section className="stage" aria-label="테이블">
      {!compact && <div className="oval" aria-hidden="true" />}
      {!compact && view.seats.filter(s => !s.isMe).map(s => <Seat key={s.player.id} player={s.player} game={game} view={view} variant="ring" angle={s.angle} />)}
      <div className="center">
        {view.kind === 'assign' ? <TaskSpread game={game} view={view} send={send} /> : panel ? <PhasePanel game={game} view={view} send={send} /> : <TrickZone game={game} view={view} />}
      </div>
      {!compact && <Seat player={meSeat.player} game={game} view={view} variant="me" />}
    </section>
    {compact && <Seat player={meSeat.player} game={game} view={view} variant="me" />}
    {!compact && view.lastLine && <button type="button" className="last-line" onClick={() => openDrawer('log')} title="기록 열기"><span>최근</span>{view.lastLine}</button>}
    <div className="dock">
      <StatusLine view={view} onComm={() => setCommOpen(true)} />
      <Hand game={game} view={view} send={send} recordPlay={recordPlay} compact={compact} />
    </div>
    {commOpen && view.canComm && <CommSheet game={game} view={view} send={send} onClose={() => setCommOpen(false)} />}
    <GoldLinks view={view} />
    {view.briefing && <Briefing game={game} onClose={dismissBriefing} />}
    {view.showResult && <Result game={game} view={view} send={send} />}
  </main>;
}
