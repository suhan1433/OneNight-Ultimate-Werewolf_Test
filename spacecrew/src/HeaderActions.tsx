import { gameAudio } from './audio-settings';

export function HeaderActions({ onHelp, title = false }: { onHelp: () => void; title?: boolean }) {
  return <div className={`header-actions ${title ? 'title-actions' : ''}`}>
    <button type="button" className="game-audio-button bar-btn round" aria-label="음향 설정" title="음향 설정" onClick={gameAudio.openSettings}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4ZM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14" /></svg>
    </button>
    <button type="button" className={title ? 'help-fab' : 'bar-btn round'} onClick={onHelp} aria-label="도움말">{title ? <><b>?</b> 도움말</> : '?'}</button>
  </div>;
}
