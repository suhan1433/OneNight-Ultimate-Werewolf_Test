import type { Game } from './types';
import { cardLabel, missionRoleForPlayer, spotInfo, spotOf } from './lib';
import { CardFace, MarkerRail, TaskChip } from './ui';
import type { View } from './view';

/** 모바일 하단 승무원 보드: 진행 순서 · 과제 카드 · 통신 카드를 한 화면에서 본다. */
export function CrewBoard({ game, view }: { game: Game; view: View }) {
  const failed = view.kind === 'result' && !game.result?.win;
  return <section className="crew-board" aria-label="승무원 현황: 진행 순서, 과제 카드, 통신 카드">
    <div className="b-head" aria-hidden="true"><span>순서</span><span>승무원</span><span>과제 카드</span><span>통신</span></div>
    <ol>{view.queue.map((p, k) => {
      const tasks = game.tasks.filter(t => t.ownerId === p.id); const active = view.activeId === p.id;
      const missionRole = missionRoleForPlayer(game, p.id);
      const played = view.kind === 'play' && view.shown.some(t => t.playerId === p.id);
      const c = p.comm; const spot = c ? spotOf(c.marker) : null;
      return <li key={p.id} className={`b-row ${active ? 'active' : ''} ${p.id === game.playerId ? 'me' : ''} ${p.connected ? '' : 'off'}`} data-seat-id={p.id} aria-current={active ? 'true' : undefined}>
        <span className="ord" aria-label={`${k + 1}번째${active ? ', 지금 차례' : played ? ', 카드를 냈어요' : ''}`}><b>{k + 1}</b>{active ? <i>▶</i> : played ? <i>✓</i> : null}</span>
        <div className="b-who"><b><span className="nm">{p.nickname}</span>{p.id === game.playerId && <em>나</em>}{game.commanderId === p.id && <em className="cmd" title="커맨더">⌖</em>}</b><small>{p.connected ? `${p.cardsLeft}장 · 트릭 ${p.wins}` : '연결 끊김'}</small></div>
        <div className="b-tasks">{tasks.length || missionRole ? <>{tasks.map(t => <TaskChip key={t.id} task={t} fail={failed && !t.done} />)}{missionRole && <small className="mission-role">{missionRole}</small>}</> : <small className="none">없음</small>}</div>
        <div className="b-comm" aria-label={c ? `통신 ${cardLabel(c.card)} ${spot ? spotInfo[spot].long : c.marker}` : '통신 전'}>{c ? <span className="comm-fill" key={c.card.id}><span className="with-rail"><CardFace card={c.card} size="xs" />{spot && <MarkerRail spot={spot} />}</span>{!spot && <small className="mk">{c.marker}</small>}</span> : <small className="none">통신 전</small>}</div>
      </li>;
    })}</ol>
  </section>;
}
