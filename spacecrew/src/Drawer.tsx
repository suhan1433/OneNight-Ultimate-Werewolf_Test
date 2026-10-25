import { useEffect } from 'react';
import type { Game } from './types';
import { missionRoleForPlayer, SUITS, cardLabel, spotInfo, spotOf } from './lib';
import { Rules, TaskChip } from './ui';
import { HelpBody } from './Help';

/** 도움말 서랍: 현재 미션 정보와 전체 규칙을 한곳에서 보여 준다. */
export function Drawer({ onClose, game }: { onClose: () => void; game: Game | null }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="drawer-layer" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="drawer" role="dialog" aria-modal="true" aria-label="도움말">
      <header>
        <h2>도움말</h2>
        <button type="button" className="x" onClick={onClose} aria-label="도움말 닫기" autoFocus>×</button>
      </header>
      <div className="drawer-body">
        {game && game.phase !== 'lobby' && <section className="mission-help" aria-labelledby="mission-help-title">
          <p className="tag">현재 미션</p>
          <p className="brief-label">미션 {game.missionId} · {game.mission.label}</p>
          <h3 id="mission-help-title">{game.mission.text}</h3>
          <Rules mission={game.mission} />
          <h4>과제 현황 <small>{game.tasks.filter(task => task.done).length}/{game.tasks.length}</small></h4>
          <ul className="crew-tasks">{game.players.map(player => {
            const assigned = game.tasks.filter(task => task.ownerId === player.id);
            const missionRole = missionRoleForPlayer(game, player.id);
            const spot = player.comm ? spotOf(player.comm.marker) : null;
            return <li key={player.id}>
              <b>{player.nickname}{game.commanderId === player.id && <em className="badge">⌖ 커맨더</em>}</b>
              <span className="row">{assigned.length || missionRole ? <>{assigned.map(task => <TaskChip key={task.id} task={task} />)}{missionRole && <small className="mission-role">{missionRole}</small>}</> : <small>과제 없음</small>}</span>
              <small>{player.comm?.played ? '통신 사용 완료' : player.comm ? `통신 ${cardLabel(player.comm.card)} ${spot ? spotInfo[spot].long : player.comm.marker}` : '통신 전'} · {player.cardsLeft}장 · 트릭 {player.wins}</small>
            </li>;
          })}</ul>
          <p className="legend">{Object.values(SUITS).map(suit => `${suit.icon} ${suit.name}`).join('  ')}</p>
        </section>}
        <HelpBody />
      </div>
    </aside>
  </div>;
}
