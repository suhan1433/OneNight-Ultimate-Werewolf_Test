import type { GameView } from '../../../packages/shared-types/src/index';
import type { Copy } from './i18n';
import { Portrait } from './Art';

export function ElectionRisk({ g, t }: { g: GameView; t: Copy }) {
  if (g.fascist < 3) return null;
  const ko = t.confirm === '확인';
  return <p className="election-risk"><span aria-hidden="true">!</span>{ko
    ? '파시스트 정책 3개 이상 · 히틀러가 수상에 당선되면 파시스트가 승리합니다.'
    : '3+ Fascist policies · Electing Hitler as Chancellor wins the game for the Fascists.'}</p>;
}

/** Selection and nomination are public; no role information is used here. */
export function GovernmentProposal({ g, t, paused = false }: { g: GameView; t: Copy; paused?: boolean }) {
  const ko = t.confirm === '확인';
  const confirmed = g.phase !== 'nomination';
  const president = g.players.find(p => p.id === g.president);
  const candidate = g.players.find(p => p.id === (confirmed ? g.chancellor : g.selectedTarget));
  return <section className={`${confirmed ? "" : "activity-progress "}government-proposal`} data-activity="nomination" data-confirmed={confirmed} data-paused={paused} role="status" aria-live="polite" aria-atomic="true">
    <div className="activity-copy">
      <span className="activity-owner">{`${t.president} · ${president?.name ?? t.president}`}</span>
      <strong>{paused ? t.paused : confirmed ? (ko ? '수상 후보 지명 확정 · 이 정부를 신임할지 투표해 주세요' : 'Nomination confirmed · Vote on this government') : candidate ? (ko ? '수상 후보를 검토하고 있습니다 · 아직 지명 전입니다' : 'Reviewing a Chancellor candidate · Not yet nominated') : (ko ? '수상 후보를 고르고 있습니다' : 'Choosing a Chancellor nominee')}</strong>
      <div className="proposal-pair" aria-label={ko ? '대통령과 수상 후보' : 'President and Chancellor nominee'}>
        <div className="proposal-person"><Portrait avatar={president?.avatar ?? 0} /><span><small>{t.president}</small><b>{president?.name}</b></span></div>
        <span className="proposal-link" aria-hidden="true">→</span>
        <div className={`proposal-person candidate${candidate ? '' : ' empty'}`}>
          {candidate ? <Portrait avatar={candidate.avatar} /> : <span className="proposal-placeholder" aria-hidden="true">?</span>}
          <span><small>{confirmed ? t.nominee : ko ? '검토 중인 후보' : 'Candidate under review'}</small><b>{candidate?.name ?? (ko ? '아직 선택하지 않았습니다' : 'Not selected yet')}</b></span>
        </div>
      </div>
      {!confirmed && <ol className="proposal-steps" aria-label={ko ? '지명 진행' : 'Nomination progress'}>
        {[ko ? '후보 선택' : 'Select', ko ? '후보 검토' : 'Review', ko ? '지명 확정' : 'Confirm'].map((step, i) => <li key={step} aria-current={i === (candidate ? 1 : 0) ? 'step' : undefined}><span aria-hidden="true">{i + 1}</span>{step}</li>)}
      </ol>}
      <ElectionRisk g={g} t={t} />
    </div>
  </section>;
}
