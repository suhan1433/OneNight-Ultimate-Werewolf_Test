import React from "react";
import type { RoomView } from "../types";
import { GomokuBoard, cellName } from "./GomokuBoard";
interface Props {
  room: RoomView;
  connected: boolean;
  busy: boolean;
  canPlay: boolean;
  freshCell: number | null;
  pendingCell: number | null;
  place: (cell: number) => void;
  leave: () => void;
  rematch: () => void;
}
export function MatchScreen({
  room,
  connected,
  busy,
  canPlay,
  freshCell,
  pendingCell,
  place,
  leave,
  rematch,
}: Props) {
  const game = room.game!;
  const isMyTurn = game.phase === "turn" && game.turn === room.self;
  const myColor = game.players[0].id === room.self ? "black" : "white";
  const me = room.seats.find((s) => s.id === room.self),
    opponent = room.seats.find((s) => s.id !== room.self);
  const active = game.players.find((p) => p.id === game.turn);
  return (
    <section
      className={`match ${game.phase === "result" ? "is-finished" : ""}`}
      key={`${room.code}-${game.players[0].id}`}
    >
      <div className="match-top">
        <div>
          <div className="eyebrow">
            {opponent?.bot ? "AI와 두기" : `친구와 두기 · ${room.code}`}
          </div>
          <h1>흑과 백의 시간.</h1>
        </div>
      </div>
      <div className="match-layout">
        <aside className="match-sidebar">
          <div className="sidebar-label eyebrow">AT THE TABLE</div>
          <div className="players">
            {game.players.map((p, i) => (
              <div
                title={p.name}
                key={p.id}
                className={`player ${game.phase === "turn" && game.turn === p.id ? "active" : ""}`}
              >
                <span className={`stone ${i === 0 ? "black" : "white"}`} />
                <div>
                  <strong>
                    {p.name}
                    {p.id === room.self ? " (나)" : ""}
                  </strong>
                  <small>
                    {room.seats.find((s) => s.id === p.id)?.connected
                      ? i === 0
                        ? "흑 · 선공"
                        : "백 · 후공"
                      : i === 0
                        ? "흑 · 연결 끊김"
                        : "백 · 연결 끊김"}
                  </small>
                </div>
              </div>
            ))}
          </div>
          <div className="table-notes">
            <div>
              <span>대국 규칙</span>
              <strong>15 × 15 자유 오목</strong>
            </div>
            <div>
              <span>내 돌</span>
              <strong>
                {myColor === "black" ? "흑돌 · 선공" : "백돌 · 후공"}
              </strong>
            </div>
            <div>
              <span>마지막 수</span>
              <strong>
                {game.lastCell !== null
                  ? cellName(game.lastCell)
                  : "첫 수를 기다립니다"}
              </strong>
            </div>
          </div>
          <div className="table-quote">
            <span>一手</span>좋은 한 수는
            <br />
            고요한 집중에서.
          </div>
          <div className="session-note">
            <span className={`live-dot ${!connected ? "is-offline" : ""}`} />
            {connected ? "실시간 대국" : "다시 연결 중"}
          </div>
        </aside>
        <div className="table-area">
          <div
            className={`turn-status ${isMyTurn ? "your-turn" : ""}`}
            role="status"
          >
            <div className="status-message" key={`${game.turn}-${game.phase}`}>
              <i className={`status-dot ${isMyTurn ? "is-mine" : ""}`} />
              {game.phase === "result"
                ? game.winner
                  ? `${game.winner === room.self ? "내 승리" : "상대 승리"} · ${game.reason}`
                  : "무승부"
                : isMyTurn
                  ? connected
                    ? "내 차례 · 빈 교차점을 누르세요"
                    : "내 차례 · 다시 연결 중…"
                  : opponent && !opponent.connected
                    ? "상대 재접속 대기 중…"
                    : `${active?.name} 차례${opponent?.bot && active?.id === opponent.id ? " · 생각 중…" : ""}`}
              {game.phase === "turn" &&
                opponent?.bot &&
                game.turn === opponent.id && (
                  <i className="thinking-dots" aria-hidden="true">
                    <b />
                    <b />
                    <b />
                  </i>
                )}
            </div>
            <span className="move-counter">{game.ply}수</span>
          </div>
          <div className="board-stage">
            <GomokuBoard
              game={game}
              myColor={myColor}
              canPlay={canPlay}
              freshCell={freshCell}
              pendingCell={pendingCell}
              onPlace={place}
            />
          </div>
          <div className="match-footer">
            {game.phase === "result" ? (
              <div
                className={`result ${game.winner === room.self ? "is-victory" : ""}`}
              >
                <div className="result-emblem" aria-hidden="true">
                  {game.winner === room.self ? "勝" : game.winner ? "終" : "和"}
                </div>
                <div className="result-copy">
                  <span className="eyebrow">
                    {game.winner === room.self
                      ? "BEAUTIFULLY PLAYED"
                      : "UNTIL THE NEXT MOVE"}
                  </span>
                  <strong>
                    {game.winner === room.self
                      ? "잘 두셨어요!"
                      : game.winner
                        ? "다음 판에 다시 도전해 보세요."
                        : "빈자리 없이 판을 채웠어요."}
                  </strong>
                </div>
                <button
                  className="primary"
                  disabled={!connected || busy || (!!opponent && !!me?.rematch)}
                  onClick={() => (!opponent ? leave() : rematch())}
                >
                  {!opponent
                    ? "새 대국"
                    : me?.rematch
                      ? opponent?.connected
                        ? "상대 동의 대기 중…"
                        : "상대 재접속 대기 중…"
                      : opponent?.rematch && !opponent.bot
                        ? "재대국 수락"
                        : "한 판 더 두기"}
                </button>
                {opponent?.rematch && !opponent.bot && !me?.rematch && (
                  <p>상대가 한 판 더 두기를 요청했어요.</p>
                )}
              </div>
            ) : (
              <p className="board-note">
                빈자리 한 번 터치로 착수 · 차례는 자동으로 넘어갑니다.
              </p>
            )}
          </div>
          <p className="fine match-rules">
            15 × 15 자유 오목
            <span className="fine-divider" />
            금수 없음
            <span className="fine-divider" />
            장목도 승리
          </p>
        </div>
      </div>
    </section>
  );
}
