import { useEffect, useState } from 'react';
import type { Game } from './types';
import { Rules } from './ui';

/** 미션 브리핑: 기록지가 펼쳐진다. 9초 뒤 자동으로 접히고, 눌러서 바로 닫을 수 있다(진행을 막지 않음). */
export function Briefing({ game, onClose }: { game: Game; onClose: () => void }) {
  const [left, setLeft] = useState(9);
  useEffect(() => { const id = window.setInterval(() => setLeft(s => s - 1), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => { if (left <= 0) onClose(); }, [left, onClose]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="layer brief-layer">
    <article className="paper brief" role="dialog" aria-labelledby="brief-title">
      <header><span>항해일지 · 미션 {game.missionId}</span><span className="mono">{String(game.missionId).padStart(2, '0')}/50</span></header>
      <p className="brief-label">{game.mission.label}</p>
      <h2 id="brief-title">{game.mission.text}</h2>
      <Rules mission={game.mission} />
      <p className="brief-meta"><span>과제 {game.mission.tasks}장</span><span>트릭 {game.totalTricks}번</span><span>승무원 {game.players.length}명</span></p>
      <button type="button" className="primary" onClick={onClose} autoFocus>과제 배정으로 <small>{Math.max(left, 0)}초 후 자동</small></button>
      <i className="timer" aria-hidden="true" />
    </article>
  </div>;
}
