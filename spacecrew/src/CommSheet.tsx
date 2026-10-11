import { useEffect, useState } from 'react';
import type { Game, Send } from './types';
import { cardName, cue, markerOf, spotInfo } from './lib';
import { CardFace, MarkerRail } from './ui';
import type { View } from './view';

/** 통신 시트: 손패 위로 올라온다. 후보 카드의 마커 위치를 미리 보여주고, 확정하면 닫힌다. */
export function CommSheet({ game, view, send, onClose }: { game: Game; view: View; send: Send; onClose: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const dead = !!game.mission.deadZone; // 데드 존: 마커가 표시되지 않으므로 미리보기도 숨김
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const chosen = view.eligible.find(c => c.id === pick);
  const confirm = () => { if (!chosen) return; cue('comm'); send('COMMUNICATE', { cardId: chosen.id }); onClose(); };
  return <div className="comm-sheet" role="dialog" aria-label="통신 시트">
    <header>
      <div><h3>통신 · 공개할 카드를 고르세요</h3>
        <p>{dead ? '데드 존: 카드는 공개되지만 마커는 놓이지 않아요.' : '마커 위치가 단서예요. 맨 위 = 그 색에서 가장 높음 · 가운데 = 유일 · 맨 아래 = 가장 낮음.'}</p></div>
      <button type="button" className="x" onClick={onClose} aria-label="통신 시트 닫기" autoFocus>×</button>
    </header>
    <div className="cands">
      {view.eligible.length === 0 && <p className="empty">지금은 공개할 수 있는 카드가 없어요. 색 카드 중 가장 높거나 낮거나 한 장뿐인 카드만 가능해요.</p>}
      {view.eligible.map(c => { const spot = markerOf(c, game.hand); return <div key={c.id} className={`cand ${pick === c.id ? 'on' : ''}`}>
        <span className="with-rail"><CardFace card={c} size="md" selected={pick === c.id} onClick={() => setPick(c.id)} />{!dead && <MarkerRail spot={spot} still />}</span>
        <small>{dead ? cardName(c) : `${spotInfo[spot].glyph} ${spotInfo[spot].short}`}</small>
      </div>; })}
    </div>
    <footer>
      <span aria-live="polite">{chosen ? `${cardName(chosen)}${dead ? '' : ` · ${spotInfo[markerOf(chosen, game.hand)].long}`}` : '카드를 눌러 미리 보세요'}</span>
      <button type="button" className="primary" disabled={!chosen} onClick={confirm}>이 카드로 통신 확정</button>
    </footer>
  </div>;
}
