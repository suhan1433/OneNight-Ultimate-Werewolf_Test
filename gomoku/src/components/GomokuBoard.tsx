import React, { memo, useRef, useState } from "react";
import { BoardCoordinates, BoardLines } from "../BoardArt";
import { SIZE } from "../../shared/engine";
import type { Game } from "../../shared/types";
export const cellName = (cell: number) =>
  `${String.fromCharCode(65 + (cell % SIZE))}${SIZE - Math.floor(cell / SIZE)}`;
interface Props {
  game: Game;
  myColor: string;
  canPlay: boolean;
  freshCell: number | null;
  pendingCell: number | null;
  onPlace: (cell: number) => void;
}
export const GomokuBoard = memo(function GomokuBoard({
  game,
  myColor,
  canPlay,
  freshCell,
  pendingCell,
  onPlace,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [focusCell, setFocusCell] = useState(112);
  const tabCell = !game.board[focusCell]
    ? focusCell
    : game.board.findIndex((c) => !c);
  function navigate(event: React.KeyboardEvent<HTMLDivElement>) {
    const origin = Number(
      (event.target as HTMLElement).closest<HTMLButtonElement>("[data-cell]")
        ?.dataset.cell,
    );
    if (!Number.isInteger(origin) || !canPlay) return;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    let next = -1;
    if (event.key === "Home") next = game.board.findIndex((c) => !c);
    else if (event.key === "End")
      next =
        game.board.length - 1 - [...game.board].reverse().findIndex((c) => !c);
    else if (delta[event.key]) {
      const [dx, dy] = delta[event.key];
      let x = (origin % SIZE) + dx,
        y = Math.floor(origin / SIZE) + dy;
      while (x >= 0 && x < SIZE && y >= 0 && y < SIZE) {
        if (!game.board[y * SIZE + x]) {
          next = y * SIZE + x;
          break;
        }
        x += dx;
        y += dy;
      }
    } else return;
    event.preventDefault();
    if (next >= 0) {
      setFocusCell(next);
      root.current
        ?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)
        ?.focus({ preventScroll: true });
    }
  }
  const sortedWin = [...game.winLine].sort((a, b) => a - b),
    winStart = sortedWin[0],
    winEnd = sortedWin[sortedWin.length - 1];
  return (
    <div className={`board-frame ${game.winLine.length ? "has-winner" : ""}`}>
      <BoardCoordinates />
      <div
        ref={root}
        onKeyDown={navigate}
        className="board"
        role="group"
        aria-label="15 곱하기 15 오목판"
        data-color={myColor}
      >
        <BoardLines />
        {game.board.map((owner, cell) => (
          <button
            key={cell}
            className={`cell ${game.winLine.includes(cell) ? "winning" : ""} ${freshCell === cell ? "is-new" : ""} ${pendingCell === cell && !owner ? "is-pending" : ""}`}
            style={
              {
                "--win-order": Math.max(0, sortedWin.indexOf(cell)),
              } as React.CSSProperties
            }
            data-cell={cell}
            tabIndex={cell === tabCell ? 0 : -1}
            onFocus={() => setFocusCell(cell)}
            aria-label={`${cellName(cell)}${owner ? (owner === game.players[0].id ? " 흑돌" : " 백돌") : " 빈자리"}${game.lastCell === cell ? " · 마지막 수" : ""}`}
            disabled={!canPlay || !!owner}
            onClick={() => onPlace(cell)}
          >
            {owner && (
              <span
                className={`stone ${owner === game.players[0].id ? "black" : "white"}`}
              >
                {game.lastCell === cell && <i />}
              </span>
            )}
          </button>
        ))}
        {sortedWin.length > 0 && (
          <svg
            className="win-connection"
            viewBox="0 0 450 450"
            aria-hidden="true"
          >
            <line
              x1={15 + (winStart % SIZE) * 30}
              y1={15 + Math.floor(winStart / SIZE) * 30}
              x2={15 + (winEnd % SIZE) * 30}
              y2={15 + Math.floor(winEnd / SIZE) * 30}
              pathLength="1"
            />
          </svg>
        )}
      </div>
    </div>
  );
});
