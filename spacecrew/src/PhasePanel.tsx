import { useState, type ReactNode } from 'react';
import type { Game, Send } from './types';
import { cardLabel } from './lib';
import { CardFace, Rules, TaskChip } from './ui';
import type { View } from './view';

/** 테이블 중앙에 뜨는 규칙 단계 패널(대상 지정·토큰 조정·과제 전달·조난 신호). 손패는 아래에 그대로 보인다. */
const Shell = ({ tag, title, children }: { tag: string; title: string; children: ReactNode }) => <section className="phase-panel" aria-label={title}><p className="tag">{tag}</p><h2>{title}</h2>{children}</section>;

export function PhasePanel({ game, view, send }: { game: Game; view: View; send: Send }) {
  const commander = view.isCommander;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [tokenFromId, setTokenFromId] = useState<string | null>(null);
  const [tokenToId, setTokenToId] = useState<string | null>(null);
  const count = (m?: Record<string, boolean>) => game.players.filter(p => p.id in (m ?? {})).length;

  if (view.kind === 'vote') {
    const mine = game.distressVotes?.[game.playerId]; const all = game.players.every(p => p.id in (game.distressVotes ?? {}));
    return <Shell tag="선택 규칙 · 조난 신호" title="조난 신호를 사용할까요?">
      <p>전원이 찬성해야 사용해요. 사용하면 전달할 방향을 함께 정한 뒤, 각자 로켓이 아닌 카드 한 장을 동시에 전달해요.</p>
      <div className="choices"><button disabled={mine !== undefined} onClick={() => send('DISTRESS_VOTE', { use: true })}>사용</button><button disabled={mine !== undefined} onClick={() => send('DISTRESS_VOTE', { use: false })}>사용 안 함</button></div>
      <p className="sub">{all ? '응답을 확인하는 중…' : `${count(game.distressVotes)}/${game.players.length}명 응답`}</p>
    </Shell>;
  }
  if (view.kind === 'pass') return <Shell tag="조난 신호 활성화" title="이웃에게 보낼 카드를 고르세요">
    <p>{game.distressPassed ? `카드를 골랐어요. 다른 승무원을 기다리는 중 (${game.distressPassCount}/${game.players.length})` : '모두 동시에 골라요. 로켓은 전달할 수 없어요.'}</p>
    <div className="cards-row">{game.hand.filter(c => c.suit !== 'R').map(c => <CardFace key={c.id} card={c} size="md" playable={!game.distressPassed} onClick={game.distressPassed ? undefined : () => send('DISTRESS_PASS', { cardId: c.id })} />)}</div>
  </Shell>;
  if (view.kind === 'direction') {
    const mine = game.distressDirections?.[game.playerId]; const all = game.players.every(player => player.id in (game.distressDirections ?? {}));
    return <Shell tag="조난 신호 활성화" title="카드를 전달할 방향을 정하세요">
      <p>모두 같은 방향을 골라야 해요. 의견이 다르면 다시 정합니다.</p>
      <div className="choices"><button disabled={mine !== undefined} onClick={() => send('DISTRESS_DIRECTION', { direction: 'left' })}>왼쪽 이웃</button><button disabled={mine !== undefined} onClick={() => send('DISTRESS_DIRECTION', { direction: 'right' })}>오른쪽 이웃</button></div>
      <p className="sub">{all ? '방향을 확인하는 중…' : `${Object.keys(game.distressDirections ?? {}).length}/${game.players.length}명 선택`}</p>
    </Shell>;
  }
  if (view.kind === 'token') {
    const hasToken = (id: string) => { const task = game.tasks.find(item => item.id === id); return !!(task?.order || task?.arrow || task?.omega); };
    const from = game.tasks.find(task => task.id === tokenFromId);
    const to = game.tasks.find(task => task.id === tokenToId);
    const chooseToken = (id: string) => {
      if (!commander) return;
      if (!tokenFromId) { if (hasToken(id)) setTokenFromId(id); return; }
      if (id === tokenFromId) { setTokenFromId(null); setTokenToId(null); return; }
      if (game.mission.tokenSwap ? hasToken(id) : !hasToken(id)) setTokenToId(id);
    };
    return <Shell tag="시작 전 순서 토큰" title={game.mission.tokenSwap ? '순서 토큰을 맞바꿀 수 있어요' : '순서 토큰을 옮길 수 있어요'}>
      <p>커맨더는 {tokenFromId ? (game.mission.tokenSwap ? '바꿀 다른 토큰 과제를 고르세요.' : '토큰을 받을 표시 없는 과제를 고르세요.') : '먼저 옮기거나 바꿀 토큰 과제를 고르세요.'} 하지 않고 진행해도 돼요.</p>
      <div className="cards-row">{game.tasks.map(task => <TaskChip key={task.id} task={task} size="md" selected={task.id === tokenFromId || task.id === tokenToId} onPick={commander && (!tokenFromId ? hasToken(task.id) : task.id === tokenFromId || (game.mission.tokenSwap ? hasToken(task.id) : !hasToken(task.id))) ? () => chooseToken(task.id) : undefined} />)}</div>
      <div className="choices">{commander && from && to && <button className="primary" onClick={() => send('TOKEN_EDIT', { fromId: from.id, toId: to.id })}>선택한 토큰 조정</button>}<button disabled={!commander} onClick={() => send('TOKEN_EDIT_SKIP')}>그대로 진행</button></div>
    </Shell>;
  }
  if (view.kind === 'transfer') {
    const mine = game.tasks.filter(t => t.ownerId === game.playerId); const picked = mine.find(t => t.id === pickedId);
    return <Shell tag="5인 선택 규칙" title="과제 한 장을 전달할 수 있어요">
      <p>원하면 담당자가 자기 과제 한 장을 다른 승무원에게 넘겨요. 먼저 넘길 카드를 고르세요. 전달하지 않으려면 커맨더가 진행을 누르세요.</p>
      <div className="cards-row">{mine.length ? mine.map(t => <TaskChip key={t.id} task={t} size="md" selected={t.id === pickedId} onPick={() => setPickedId(t.id)} />) : <span className="sub">내가 맡은 과제가 없어요.</span>}</div>
      {picked && <div className="choices">{game.players.filter(p => p.id !== game.playerId).map(p => <button key={p.id} className="primary" onClick={() => send('TASK_TRANSFER', { taskId: picked.id, recipientId: p.id })}>{cardLabel(picked)} → {p.nickname}</button>)}</div>}
      <div className="choices"><button disabled={!commander} onClick={() => send('TASK_TRANSFER_SKIP')}>전달 없이 진행</button></div>
    </Shell>;
  }
  // chooseTarget
  const excluded = game.mission.pick === 'notCommander' ? game.commanderId : game.targetStep === 1 ? game.targetId : null;
  const needsResponses = game.mission.special !== 'noComm'; const answered = game.decisionResponses?.[game.playerId]; const all = !needsResponses || game.players.every(p => p.id in (game.decisionResponses ?? {}));
  return <Shell tag="커맨더의 결정" title={game.mission.special === 'finalPattern' && game.targetStep === 1 ? '마지막 트릭 담당자를 지정하세요' : '특수 미션 대상을 지정하세요'}>
    <p>{game.mission.text}</p><Rules mission={game.mission} />
    {needsResponses && <><p className="sub">먼저 각자 예/아니오로 대답한 뒤, 커맨더가 결정해요.</p><div className="choices"><button disabled={answered !== undefined} onClick={() => send('DECISION_RESPONSE', { yes: true })}>예</button><button disabled={answered !== undefined} onClick={() => send('DECISION_RESPONSE', { yes: false })}>아니오</button></div><p className="sub">{all ? '모든 응답 완료 · 커맨더가 선택하세요' : `${count(game.decisionResponses)}/${game.players.length}명 응답`}</p></>}
    <div className="choices">{game.players.filter(p => p.id !== excluded).map(p => <button key={p.id} className={commander && all ? 'primary' : ''} disabled={!commander || !all} onClick={() => send('TARGET_SELECT', { targetId: p.id })}>{p.nickname}</button>)}</div>
  </Shell>;
}
