import type { CSSProperties } from 'react';
import type { Game, Player } from './types';
import { missionRoleForPlayer, SUITS, spotInfo, spotOf } from './lib';
import { Avatar, CardFace, MarkerRail, TaskChip } from './ui';
import type { View } from './view';

/* 통신 슬롯: 카드가 슬롯으로 들어오고 마커가 떨어지며 신호 링이 퍼진다(마운트 시 1회) */
export function CommSlot({ player }: { player: Player }) {
  const c = player.comm; const spot = c ? spotOf(c.marker) : null;
  if (!c) return <div className="comm-slot" aria-label={`${player.nickname} 통신 전`}><span className="sec-label" aria-hidden="true">📡 통신</span><span>통신 전</span></div>;
  if (c.played) return <div className="comm-slot" aria-label={`${player.nickname} 통신 사용 완료`}><span className="sec-label" aria-hidden="true">📡 통신</span><span>통신 사용 완료</span></div>;
  return <div className="comm-slot full" key={c.card.id} aria-label={`${player.nickname} 통신: ${SUITS[c.card.suit].name} ${c.card.value} ${spot ? spotInfo[spot].long : c.marker}`}>
    <span className="sec-label" aria-hidden="true">📡 통신</span>
    <span className="with-rail"><CardFace card={c.card} size="xs" />{spot && <MarkerRail spot={spot} />}</span>
    {!spot && <small>{c.marker}</small>}
    <span className="signal-ring" aria-hidden="true" />
  </div>;
}

type Props = { player: Player; game: Game; view: View; variant: 'ring' | 'me' | 'chip'; angle?: number };

/** 가장 옆에 앉는 좌석의 |cos| (3인 .87 · 4인 1 · 5인 .95). 이 값으로 나눠 x 위치를 -1~1 로 맞춘다. */
const reach = (n: number) => Math.max(0.01, ...Array.from({ length: Math.max(n - 1, 1) }, (_, k) => Math.abs(Math.cos(Math.PI / 2 + ((k + 1) * 2 * Math.PI) / n))));

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
      <span className="chip-comm" aria-label={c?.played ? '통신 사용 완료' : c ? `통신 ${SUITS[c.card.suit].name} ${c.card.value}` : '통신 전'}>{c?.played ? '통신 완료' : c ? <>{SUITS[c.card.suit].icon}{c.card.value}{spot && <i>{spotInfo[spot].glyph}</i>}</> : '통신 ○'}</span>
      {active && <em className="turn-tag">{turnWord}</em>}
      {!player.connected && <em className="turn-tag off">끊김</em>}
    </li>;
  }

  // 위치는 CSS 가 계산한다: --cx(가로, -1~1) · --t(세로, 0=맨 위 ~ 1=내 좌석 바로 위). 좌석이 상단 바·트릭 존을 덮지 않는다.
  const sin = Math.sin(angle);
  const raw = Math.cos(angle) / reach(game.players.length);
  const cx = Math.abs(raw) < 0.99 ? raw * 0.9 : raw; // 5인: 위쪽 두 좌석을 살짝 안쪽으로 모아 옆 좌석과 겹치지 않게
  const wide = variant === 'ring' && sin < -0.95; // 4인 게임의 맞은편: 가로로 납작한 바 형태
  const style = variant === 'ring' ? ({ '--cx': cx.toFixed(3), '--t': ((sin + 1) / 2).toFixed(3) } as CSSProperties) : undefined;
  return <div className={`seat ${variant} ${wide ? 'wide' : ''} ${tasks.length >= 4 ? 'many' : ''} ${active ? 'active' : ''} ${hasMiss ? 'has-miss' : ''} ${player.connected ? '' : 'off'}`} style={style} data-seat-id={player.id} role="group" aria-label={`${player.nickname}${active ? ', 지금 차례' : ''}`}>
    <div className="flags">{commander && <em className="badge" title="커맨더">⌖ 커맨더</em>}{active && <span className="turn-tag">{turnWord}</span>}{!player.connected && <em className="badge off">연결 끊김</em>}</div>
    <div className="who">
      <span className="av"><Avatar name={player.nickname} /><span className="turn-ring" aria-hidden="true" /></span>
      <div className="id">
        <b className="nm">{name}</b>
        <p className="nums"><span className="backs" aria-hidden="true">{Array.from({ length: Math.min(player.cardsLeft, 7) }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</span><span><b>{player.cardsLeft}</b>장 · 트릭 <b>{player.wins}</b></span></p>
      </div>
    </div>
    <div className="seat-tasks"><span className="sec-label" aria-hidden="true">🃏 과제{tasks.length > 0 && <small>{doneCount}/{tasks.length}</small>}</span>{tasks.length || missionRole ? <>{tasks.map(t => <TaskChip key={t.id} task={t} fail={failed && !t.done} />)}{missionRole && <span className="mission-role">{missionRole}</span>}</> : <span className="none">과제 없음</span>}</div>
    <CommSlot player={player} />
  </div>;
}
