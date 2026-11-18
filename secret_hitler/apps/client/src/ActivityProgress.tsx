import type { GameView } from '../../../packages/shared-types/src/index';
import type { Copy } from './i18n';
import { Portrait } from './Art';
import { GovernmentProposal } from './GovernmentProposal';

/** Only public phase/participation information; never reads hands or private results. */
export function ActivityProgress({ g, selfId, paused, t }: {
  g: GameView; selfId: string; paused: boolean; t: Copy;
}) {
  const ko = t.confirm === '확인';
  const alive = !!g.players.find(p => p.id === selfId)?.alive;
  const collective = ['night', 'voting', 'vote_result'].includes(g.phase);
  const actor = g.players.find(p => p.id === g.president);
  if (g.phase === 'nomination') return <GovernmentProposal g={g} t={t} paused={paused} />;
  let title: string, detail: string, icon: 'eye' | 'file' | 'person' | 'vote';
  let count: number | undefined;
  const total = g.players.filter(p => g.phase === 'night' || p.alive).length;
  if (collective) {
    const submitted = g.phase === 'voting' ? g.voted : g.acknowledged;
    if (alive && !submitted.includes(selfId)) return null;
    count = g.players.filter(p => (g.phase === 'night' || p.alive) && submitted.includes(p.id)).length;
    icon = g.phase === 'night' ? 'file' : 'vote';
    title = ko
      ? g.phase === 'night' ? '참가자들이 비밀 역할을 확인하고 있습니다' : g.phase === 'voting' ? '참가자들이 정부 신임 투표를 하고 있습니다' : '참가자들이 투표 결과를 확인하고 있습니다'
      : g.phase === 'night' ? 'Players are checking their secret roles' : g.phase === 'voting' ? 'Players are voting on the government' : 'Players are reviewing the vote results';
    detail = ko ? '모두 완료하면 다음 단계로 넘어갑니다.' : 'The next stage starts when everyone is done.';
  } else {
    if (alive && g.president === selfId) return null;
    if (g.phase === 'executive' && g.power) {
      const descriptions = {
        peek: [ko ? '정책 엿보기를 진행하고 있습니다' : 'Previewing the next policies', ko ? '대통령이 상위 정책 3장을 비공개로 열람하고 확인을 마치면 다음 선거가 시작됩니다.' : 'The President privately previews the top 3 policies. The next election starts after confirmation.', 'eye'],
        investigate: [ko ? '정체 조사를 진행하고 있습니다' : 'Investigating party membership', ko ? '대통령이 조사 대상을 선택하고 정당 확인을 마칠 때까지 기다려 주세요. 조사 결과는 대통령에게만 보입니다.' : 'The President selects a player and privately checks their party. Please wait for confirmation.', 'file'],
        special_election: [ko ? '특별 선거의 대통령 후보를 고르고 있습니다' : 'Choosing the special-election President', ko ? '지정된 참가자가 다음 정부의 수상 후보를 지명합니다.' : 'The chosen player will nominate a Chancellor for the next government.', 'person'],
        execute: [ko ? '처형 대상을 고르고 있습니다' : 'Choosing a player to execute', ko ? '대통령이 결정을 확정하면 집행 결과가 모두에게 공개됩니다.' : 'The execution is shown to everyone once the President confirms the decision.', 'person'],
      } as const;
      [title, detail, icon] = descriptions[g.power];
    } else return null;
  }
  const selected = !collective && g.selectedTarget ? g.players.find(p => p.id === g.selectedTarget) : null;
  return <section className="activity-progress" data-paused={paused} data-activity={collective ? g.phase : g.power ?? g.phase} role="status" aria-live="polite" aria-atomic="true">
    <div className="activity-avatar" aria-hidden="true">
      {!collective && actor ? <Portrait avatar={actor.avatar} /> : <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d={icon === 'file' ? 'M9 4h10l5 5v19H9ZM18 4v7h6M12 16h9m-9 5h9' : 'm6 17 5-6 5 5 5-5 5 6v10H6Zm8-9 3-5 8 5-3 5M11 22h10'} />
      </svg>}
      <span className="activity-indicator"><i /><i /><i /></span>
    </div>
    <div className="activity-copy">
      <span className="activity-owner">{collective ? (ko ? '전체 진행 상황' : 'GROUP PROGRESS') : `${t.president} · ${actor?.name ?? t.president}`}</span>
      <strong>{paused ? t.paused : title}</strong>
      <p>{paused ? (ko ? '게임이 재개되면 이어서 진행합니다.' : 'This action continues when the game resumes.') : detail}</p>
      {selected && <span className="activity-target">{ko ? '선택 중인 대상' : 'Current selection'} · {selected.name}</span>}
      {count !== undefined && <span className="activity-count">{ko ? '완료' : 'Done'} <b>{count} / {total}</b><span className="activity-meter" aria-hidden="true"><i style={{ width: `${total ? count / total * 100 : 0}%` }} /></span></span>}
    </div>
  </section>;
}
