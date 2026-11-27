import React from "react";
import { BoardShowcase } from "../BoardArt";
interface Props {
  name: string;
  code: string;
  connected: boolean;
  busy: boolean;
  restoring: boolean;
  setName: (value: string) => void;
  setCode: (value: string) => void;
  enter: (event: string, bot?: boolean) => void;
}
export function HomeScreen({
  name,
  code,
  connected,
  busy,
  restoring,
  setName,
  setCode,
  enter,
}: Props) {
  return (
    <section className="home">
      <div className="home-story">
        <div className="eyebrow">
          <span className="short-rule" />
          THE ART OF FIVE
        </div>
        <h1>
          고요한 판 위에,
          <br />
          당신의 <em>한 수.</em>
        </h1>
        <p className="intro">
          흑과 백, 깊어지는 수읽기.
          <br />
          친구 또는 AI와 한 판.
        </p>
        <BoardShowcase />
        <div className="home-principles">
          <span>
            15 × 15<span>정통의 판</span>
          </span>
          <span>
            흑과 백<span>번갈아 한 수</span>
          </span>
          <span>
            다섯 돌<span>하나의 승부</span>
          </span>
        </div>
      </div>
      <div className="play-panel">
        <div className="panel-heading">
          <span className="eyebrow">READY TO PLAY</span>
          <h2>한 판, 두실까요?</h2>
          <p>복잡한 준비 없이 바로 시작하세요.</p>
        </div>
        <label className="field name-field">
          <span>대국자 이름</span>
          <input
            maxLength={16}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        <div className="start-actions">
          <button
            className="primary"
            disabled={!connected || busy || restoring}
            onClick={() => enter("room:create", true)}
          >
            AI와 바로 두기 <span>→</span>
          </button>
          <button
            disabled={!connected || busy || restoring}
            onClick={() => enter("room:create")}
          >
            친구와 두기 · 방 만들기
          </button>
        </div>
        <form
          className="join"
          onSubmit={(e) => {
            e.preventDefault();
            enter("room:join");
          }}
        >
          <label className="field code-field">
            <span>방 코드</span>
            <input
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^0-9A-F]/g, "")
                    .slice(0, 6),
                )
              }
              maxLength={6}
              placeholder="6자리 코드"
              enterKeyHint="go"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
          <button
            disabled={
              !connected || busy || restoring || !/^[0-9A-F]{6}$/.test(code)
            }
            type="submit"
          >
            입장
          </button>
        </form>
        <p className="fine">
          <span className="live-dot" />{" "}
          {connected ? "대국실이 준비되었습니다" : "대국실에 연결 중입니다"}
        </p>
      </div>
    </section>
  );
}
