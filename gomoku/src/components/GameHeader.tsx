import React from "react";
interface Props {
  inRoom: boolean;
  sound: boolean;
  disabled: boolean;
  onExit: () => void;
  onRules: () => void;
  onSound: () => void;
}
export function GameHeader({
  inRoom,
  sound,
  disabled,
  onExit,
  onRules,
  onSound,
}: Props) {
  return (
    <header className="header">
      <button
        className="back"
        aria-label={inRoom ? "나가기" : "게임 선택으로"}
        disabled={disabled}
        onClick={(e) => {
          e.currentTarget.focus({ preventScroll: true });
          onExit();
        }}
      >
        ← {inRoom ? "나가기" : "게임 선택"}
      </button>
      <div className="brand">
        <i className="brand-mark" aria-hidden="true" />
        오목<span>GOMOKU</span>
      </div>
      <div className="header-actions">
        <button
          className="sound-button"
          aria-label={sound ? "효과음 끄기" : "효과음 켜기"}
          aria-pressed={sound}
          onClick={onSound}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            {sound ? (
              <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
            ) : (
              <path d="m16 9 6 6m0-6-6 6" />
            )}
          </svg>
        </button>
        <button
          className="text-button"
          onClick={(e) => {
            e.currentTarget.focus({ preventScroll: true });
            onRules();
          }}
        >
          게임 방법
        </button>
      </div>
    </header>
  );
}
