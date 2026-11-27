import React from "react";
import { SIZE } from "../shared/engine";
export function BoardLines() {
  return (
    <svg className="board-lines" viewBox="0 0 450 450" aria-hidden="true">
      {Array.from({ length: SIZE }, (_, i) => (
        <path key={i} d={`M15 ${15 + i * 30}H435M${15 + i * 30} 15V435`} />
      ))}
      {[
        [3, 3],
        [11, 3],
        [7, 7],
        [3, 11],
        [11, 11],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={15 + x * 30} cy={15 + y * 30} r="2.3" />
      ))}
    </svg>
  );
}
export function BoardCoordinates() {
  return (
    <>
      <div className="axis axis-top" aria-hidden="true">
        {Array.from({ length: SIZE }, (_, i) => (
          <span key={i}>{String.fromCharCode(65 + i)}</span>
        ))}
      </div>
      <div className="axis axis-left" aria-hidden="true">
        {Array.from({ length: SIZE }, (_, i) => (
          <span key={i}>{SIZE - i}</span>
        ))}
      </div>
    </>
  );
}
export function BoardShowcase() {
  const black = [64, 80, 96, 112, 128, 108, 125],
    white = [65, 79, 95, 111, 127, 142];
  return (
    <div className="showcase" aria-hidden="true">
      <div className="showcase-halo" />
      <div className="showcase-board board-frame">
        <BoardCoordinates />
        <div className="board">
          <BoardLines />
          {Array.from({ length: SIZE * SIZE }, (_, cell) => (
            <span className="showcase-cell" key={cell}>
              {(black.includes(cell) || white.includes(cell)) && (
                <i
                  className={`stone ${black.includes(cell) ? "black" : "white"} ${cell === 128 ? "showcase-last" : ""}`}
                  style={
                    {
                      "--order": black.includes(cell)
                        ? black.indexOf(cell)
                        : white.indexOf(cell),
                    } as React.CSSProperties
                  }
                />
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="showcase-caption">
        <span className="caption-line" />
        오직, 다음 한 수에 집중하세요.<span>BLACK & WHITE · 15 × 15</span>
      </div>
    </div>
  );
}
