import { useEffect, useRef } from 'react';
import type { DrawerTab, Game } from './types';
import { SUITS, cardLabel, spotInfo, spotOf } from './lib';
import { Rules, TaskChip } from './ui';
import { HelpBody } from './Help';

const NAMES: Record<DrawerTab, string> = { mission: '미션', log: '기록', help: '도움말' };

/** 서랍: 데스크톱은 오른쪽 서랍, 모바일은 하단 시트. 탭 = 미션 / 기록 / 도움말 */
export function Drawer({ tab, setTab, onClose, game }: { tab: DrawerTab; setTab: (t: DrawerTab) => void; onClose: () => void; game: Game | null }) {
  const tabs: DrawerTab[] = game && game.phase !== 'lobby' ? ['mission', 'log', 'help'] : ['help'];
  const active = tabs.includes(tab) ? tab : 'help';
  const logEnd = useRef<HTMLLIElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => { if (active === 'log') logEnd.current?.scrollIntoView({ block: 'end' }); }, [active, game?.log.length]);
  return <div className="drawer-layer" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label="서랍">
      <header>
        <div className="tabs" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={active === t} onClick={() => setTab(t)}>{NAMES[t]}</button>)}</div>
        <button type="button" className="x" onClick={onClose} aria-label="서랍 닫기" autoFocus>×</button>
      </header>
      <div className="drawer-body" role="tabpanel">
        {active === 'mission' && game && <>
          <p className="brief-label">미션 {game.missionId} · {game.mission.label}</p><h3>{game.mission.text}</h3><Rules mission={game.mission} />
          <h4>과제 현황 <small>{game.tasks.filter(t => t.done).length}/{game.tasks.length}</small></h4>
          <ul className="crew-tasks">{game.players.map(p => { const mine = game.tasks.filter(t => t.ownerId === p.id); const spot = p.comm ? spotOf(p.comm.marker) : null; return <li key={p.id}>
            <b>{p.nickname}{game.commanderId === p.id && <em className="badge">⌖ 커맨더</em>}</b>
            <span className="row">{mine.length ? mine.map(t => <TaskChip key={t.id} task={t} />) : <small>과제 없음</small>}</span>
            <small>{p.comm ? `통신 ${cardLabel(p.comm.card)} ${spot ? spotInfo[spot].long : p.comm.marker}` : '통신 전'} · {p.cardsLeft}장 · 트릭 {p.wins}</small></li>; })}</ul>
          <p className="legend">{Object.values(SUITS).map(s => `${s.icon} ${s.name}`).join('  ')}</p>
        </>}
        {active === 'log' && game && <ol className="log">{game.log.length ? game.log.map((l, i) => <li key={i}>{l}</li>) : <li className="none">아직 기록이 없어요.</li>}<li ref={logEnd} aria-hidden="true" /></ol>}
        {active === 'help' && <HelpBody />}
      </div>
    </aside>
  </div>;
}
