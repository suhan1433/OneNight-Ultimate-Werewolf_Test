import { useEffect, useState } from 'react';
import type { Game, Send } from './types';
import { cue, markCleared } from './lib';
import { CardFace, MissionMap, TaskChip } from './ui';
import { Epilogue } from './Epilogue';
import type { View } from './view';

function Restart({ game, send, big = false }: { game: Game; send: Send; big?: boolean }) {
  return game.playerId === game.hostId
    ? <button type="button" className={`primary ${big ? 'big' : ''}`} autoFocus onClick={() => send('GAME_RESTART')}>{big ? '재도전하기' : '대기실로 돌아가기'}<small>대기실에서 같은 미션으로 다시 시작해요</small></button>
    : <p className="wait-host">방장이 {big ? '재도전을' : '대기실로 돌아가기를'} 누르면 이어서 진행해요.</p>;
}

export function Result({ game, view, send }: { game: Game; view: View; send: Send }) {
  const win = !!game.result?.win;
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (win) markCleared(game.missionId); setSaved(true); cue(win ? 'win' : 'fail'); }, [win, game.missionId]);
  const reason = game.result?.reason || (win ? '모든 과제를 달성했어요.' : '과제가 목표대로 달성되지 못했어요.');

  if (win && game.missionId === 50) return <Epilogue game={game} send={send} />;
  if (win) return <div className="layer result-layer">
    <section className="paper success" role="dialog" aria-label="미션 성공">
      <header><span>항해일지 · 미션 {game.missionId} 기록</span></header>
      <div className="stamp" aria-hidden="true"><b>✦</b><small>완료</small></div>
      <h2>미션 성공</h2><p>{reason}</p>
      {saved && <MissionMap current={game.missionId} strip={3} />}
      <p className="signal-note">미션 지도에 새 신호가 켜졌어요.</p>
      <Restart game={game} send={send} />
    </section>
  </div>;

  // 실패: 장면은 멈추고(테이블은 그대로, 어긋난 과제만 붉게) 원인을 한 문장으로.
  const missedIds = new Set(view.missed.map(t => t.id));
  return <div className="layer result-layer fail-layer">
    <section className="fail-card" role="alertdialog" aria-label="미션 실패">
      <h2><span aria-hidden="true">× </span>미션 실패</h2>
      <p className="why">{reason}</p>
      {view.missed.length > 0 && <div className="fail-row"><span>어긋난 과제</span>{view.missed.map(t => <TaskChip key={t.id} task={t} size="sm" fail />)}</div>}
      {view.finalTrick.some(t => t.card && missedIds.has(t.card.id)) && <div className="fail-row"><span>관련 트릭</span>{view.finalTrick.map(t => t.card ? <CardFace key={t.playerId} card={t.card} size="sm" className={missedIds.has(t.card.id) ? 'bad' : 'faded'} /> : null)}</div>}
      <Restart game={game} send={send} big />
    </section>
  </div>;
}
