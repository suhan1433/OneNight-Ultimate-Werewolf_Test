import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameView } from '../../../packages/shared-types/src/index';
import type { Copy } from './i18n';

/** Public phase information only: never reads hands, policy types or selections. */
export function LegislationProgress({ phase, president, chancellor, visible, paused, t }: {
  phase: GameView['phase'];
  president: string;
  chancellor: string;
  visible: boolean;
  paused: boolean;
  t: Copy;
}) {
  const previous = useRef(phase);
  const [transferring, setTransferring] = useState(false);
  useEffect(() => {
    if (previous.current === 'president_discard' && phase === 'chancellor_enact') setTransferring(true);
    else if (phase !== 'chancellor_enact') setTransferring(false);
    previous.current = phase;
  }, [phase]);
  useEffect(() => {
    if (!transferring || paused) return;
    const timer = window.setTimeout(() => setTransferring(false), 1600);
    return () => window.clearTimeout(timer);
  }, [transferring, paused]);
  if (!visible) return null;
  const reviewing = phase === 'president_discard';
  const veto = phase === 'veto';
  const step = reviewing ? 0 : transferring ? 1 : 2;
  const title = paused ? t.paused : reviewing ? t.legislationReview : veto ? t.legislationVeto : transferring ? t.legislationDelivered : t.legislationEnact;
  const detail = reviewing ? t.legislationReviewDetail : veto ? t.legislationVetoDetail : t.legislationEnactDetail;
  return <section className={`legislation-progress${transferring ? ' is-transferring' : ''}`} data-phase={phase} data-paused={paused} aria-label={t.legislationProgress}>
    <div className="legislation-status" role="status" aria-live="polite" aria-atomic="true">
      <strong>{title}</strong>
      <span>{transferring ? `${president} → ${chancellor}` : `${reviewing || veto ? president : chancellor} · ${detail}`}</span>
    </div>
    <div className="legislation-desk" aria-hidden="true">
      <div className={`legislation-official president${reviewing || veto ? ' active' : ''}`}>
        <span className="legislation-seal">{t.president.slice(0, 1)}</span><small>{t.president}</small><b>{president}</b>
      </div>
      <div className="legislation-route"><i /><i /><i /></div>
      <div className="legislation-papers">
        {Array.from({ length: reviewing ? 3 : 2 }, (_, index) => <span className="legislation-paper" key={index} style={{ '--card': index, '--cards': reviewing ? 3 : 2 } as CSSProperties}><i />§</span>)}
      </div>
      <div className={`legislation-official chancellor${!reviewing && !transferring && !veto ? ' active' : ''}`}>
        <span className="legislation-seal">{t.chancellor.slice(0, 1)}</span><small>{t.chancellor}</small><b>{chancellor}</b>
      </div>
    </div>
    <ol className="legislation-steps" aria-label={t.legislationProgress}>
      {[t.legislationStepReview, t.legislationStepPass, veto ? t.veto : t.legislationStepEnact].map((label, index) => <li key={index} className={index === step ? 'current' : index < step ? 'complete' : ''} aria-current={index === step ? 'step' : undefined}><span aria-hidden="true">{index < step ? '✓' : index + 1}</span>{label}</li>)}
    </ol>
    <p className="legislation-private">{t.legislationPrivate}</p>
  </section>;
}
