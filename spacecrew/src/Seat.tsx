import type { CSSProperties } from 'react';
import type { Game, Player } from './types';
import { missionRoleForPlayer, SUITS, spotInfo, spotOf } from './lib';
import { Avatar, CardFace, MarkerRail, TaskChip } from './ui';
import type { View } from './view';

/* 통신 슬롯: 카드가 슬롯으로 들어오고 마커가 떨어지며 신호 링이 퍼진다(마운트 시 1회) */
export function CommSlot({ player }: { player: Player }) {
  const c = player.comm; const spot = c ? spotOf(c.marker) : null;
  if (!c) return <div className="comm-slot" aria-label={`${player.nickname} 통신 전`}><span>통신 전</span></div>;
  return <div className="comm-slot full" key={c.card.id} aria-label={`${player.nickname} 통신: ${SUITS[c.card.suit].name} ${c.card.value} ${spot ? spotInfo[spot].long : c.marker}`}>
    <span className="with-rail"><CardFace card={c.card} size="xs" />{spot && <MarkerRail spot={spot} />}</span>
    <small>{spot ? spotInfo[spot].short : c.marker}</small>
    <span className="signal-ring" aria-hidden="true" />
  </div>;
}

type Props = { player: Player; game: Game; view: View; variant: 'ring' | 'me' | 'chip'; angle?: number };
export function Seat({ player, game, view, variant, angle = 0 }: Props) {
  const active = view.activeId === player.id;
  const tasks = game.tasks.filter(t => t.ownerId === player.id);
  const missionRole = missionRoleForPlayer(game, player.id);
  const doneCount = tasks.filter(t => t.done).length;
  const failed = view.kind === 'result' && !game.result?.win;
  const hasMiss = failed && tasks.some(t => !t.done);
  const commander = game.commanderId === player.id;
  const turnWord = view.kind === 'play' ? '차례' : '선택 중';
  const name = <>{player.nickname}{player.id === game.playerId && <small className="me-mark">(나)</small>}</>;

  if (variant === 'chip') {
    const c = player.comm; const spot = c ? spotOf(c.marker) : null;
    return <li className={`chip ${active ? 'active' : ''} ${player.connected ? '' : 'off'}`} data-seat-id={player.id}>
      <span className="av"><Avatar name={player.nickname} /></span>
      <div className="chip-info">
        <b>{name}{commander && <em className="badge" title="커맨더">⌖</em>}</b>
        <small>{player.cardsLeft}장 · 과제 {doneCount}/{tasks.length}</small>
      </div>
      <span className="chip-comm" aria-label={c ? `통신 ${SUITS[c.card.suit].name} ${c.card.value}` : '통신 전'}>{c ? <>{SUITS[c.card.suit].icon}{c.card.value}{spot && <i>{spotInfo[spot].glyph}</i>}</> : '통신 ○'}</span>
      {active && <em className="turn-tag">{turnWord}</em>}
      {!player.connected && <em className="turn-tag off">끊김</em>}
    </li>;
  }

  const style = variant === 'ring' ? { left: `${50 + 41 * Math.cos(angle)}%`, top: `${47 + 37 * Math.sin(angle)}%` } : undefined;
  return <div className={`seat ${variant} ${active ? 'active' : ''} ${hasMiss ? 'has-miss' : ''} ${player.connected ? '' : 'off'}`} style={style} data-seat-id={player.id} role="group" aria-label={`${player.nickname}${active ? ', 지금 차례' : ''}`}>
    <div className="who">
      <span className="av"><Avatar name={player.nickname} /><span className="turn-ring" aria-hidden="true" /></span>
      <b className="nm">{name}</b>
      {commander && <em className="badge">⌖ 커맨더</em>}
      {!player.connected && <em className="badge off">연결 끊김</em>}
    </div>
    <p className="nums"><span className="backs" aria-hidden="true">{Array.from({ length: Math.min(player.cardsLeft, 7) }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</span><b>{player.cardsLeft}</b>장 · 트릭 <b>{player.wins}</b></p>
    {active && <span className="turn-tag">{turnWord}</span>}
    <div className="seat-tasks">{tasks.length || missionRole ? <>{tasks.map(t => <TaskChip key={t.id} task={t} fail={failed && !t.done} />)}{missionRole && <span className="mission-role">{missionRole}</span>}</> : <span className="none">과제 없음</span>}</div>
    <CommSlot player={player} />
  </div>;
}
