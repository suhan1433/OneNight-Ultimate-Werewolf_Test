import { useEffect, useRef, useState } from "react";
import { AUGMENT, HERO } from "../shared/data";
import { maxMana, player, traitCounts } from "../shared/engine";
import {
  COACH,
  LEARNER,
  LESSONS,
  createPractice,
  practiceInput,
  practiceStep,
  type PracticeInput,
} from "./lesson-model";
import "./practice.css";
const nameOf = (c: number) =>
  `${String.fromCharCode(65 + (c % 13))}${13 - Math.floor(c / 13)}`;
const cells = Array.from(
  { length: 81 },
  (_, i) => (Math.floor(i / 9) + 2) * 13 + (i % 9) + 2,
);
export function PracticeGuide({
  onClose,
  onRead,
}: {
  onClose?: () => void;
  onRead: () => void;
}) {
  const [state, setState] = useState(() => createPractice());
  const lesson = LESSONS[state.lesson],
    step = practiceStep(state),
    me = player(state.game, LEARNER),
    counts = traitCounts(state.game, LEARNER);
  const top = useRef<HTMLDivElement>(null);
  const last = state.lesson === LESSONS.length - 1;
  const send = (input: PracticeInput) =>
    setState((s) => practiceInput(s, input));
  const expected = (kind: PracticeInput["kind"]) =>
    !state.complete && step?.kind === kind;
  function restart(index: number) {
    setState(createPractice(index));
    top.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = top.current?.querySelector(
        state.complete ? ".practice-task" : ".practice-cue",
      );
      target?.scrollIntoView({
        block: state.complete ? "start" : "center",
        behavior: "auto",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [state.step, state.lesson, state.complete]);
  const showBoard = !["augment", "altar"].includes(lesson.id);
  const sourceStep = lesson.id === "seal" && state.step < 4;
  return (
    <div className="practice-guide" ref={top}>
      <div className="practice-intro">
        <b>시간 제한 없이, 한 번에 하나씩</b>
        <p>
          실제 대국과 같은 규칙으로 직접 해봐요. 여기서 연습한 수와 자원은 실제
          대국에 반영되지 않아요.
        </p>
      </div>
      <label className="practice-lesson-select">
        배울 내용
        <select
          value={state.lesson}
          onChange={(e) => restart(Number(e.target.value))}
        >
          {LESSONS.map((l, i) => (
            <option value={i} key={l.id}>
              {i + 1}. {l.title}
            </option>
          ))}
        </select>
      </label>
      <div
        className="practice-progress"
        aria-label={`${LESSONS.length}개 연습 중 ${state.lesson + 1}번째`}
      >
        {LESSONS.map((l, i) => (
          <span
            key={l.id}
            className={
              i === state.lesson ? "current" : i < state.lesson ? "past" : ""
            }
          />
        ))}
      </div>
      <h3>
        {state.lesson + 1}/{LESSONS.length} · {lesson.title}
      </h3>
      <p className="practice-context">{lesson.intro}</p>
      <div
        className={`practice-task ${state.complete ? "complete" : ""}`}
        role="status"
      >
        <div className="practice-task-heading">
          <b>
            {state.complete
              ? "✓ 연습 성공!"
              : `지금 할 일 · ${state.step + 1}/${lesson.steps.length}`}
          </b>
          <button onClick={onClose}>연습 닫기</button>
        </div>
        <p>{state.complete ? lesson.success : step.prompt}</p>
      </div>
      {state.complete && (
        <div className="practice-completion">
          <button onClick={() => restart(state.lesson)}>
            이 연습 다시 하기
          </button>
          {last ? (
            <>
              <button className="primary" onClick={onClose}>
                도움말 닫고 대국하기
              </button>
              <p>
                이제 시작 화면에서 이름을 입력하고 <b>사범과 연습</b>을
                눌러보세요. 먼저 기본 돌로 한 수씩 해보고, 익숙해지면 석혼을
                사보면 돼요.
              </p>
              <button onClick={onRead}>자세한 규칙 읽기</button>
            </>
          ) : (
            <button
              className="primary"
              onClick={() => restart(state.lesson + 1)}
            >
              다음 연습 · {LESSONS[state.lesson + 1].title}
            </button>
          )}
        </div>
      )}
      <div className="practice-resources">
        <span>
          ◎ 골드 <b>{me.gold}</b>
        </span>
        <span>
          ✧ 마나{" "}
          <b>
            {me.mana}/{maxMana(me)}
          </b>
        </span>
        <span>
          {state.game.phase === "prep"
            ? "준비 시간"
            : state.game.phase === "result"
              ? "승리"
              : state.game.phase === "augment"
                ? "증강 선택"
                : state.game.phase === "altar"
                  ? state.game.altarOrder[state.game.altarStep] === LEARNER
                    ? "내 선택 차례"
                    : "상대 선택 차례"
                  : state.game.turn === LEARNER
                    ? "내 차례"
                    : "상대 차례"}
        </span>
      </div>
      {lesson.id === "shop" && (
        <section className="practice-shop" aria-label="연습 상점">
          <h4>상점 · 준비 시간에 구매해요</h4>
          {me.shop[0] ? (
            <button
              className={expected("buy") ? "practice-cue" : ""}
              disabled={!expected("buy")}
              onClick={() => send({ kind: "buy" })}
            >
              <span className="practice-glyph">雷</span>
              <span>
                <b>번개 술사 구매 · 2G</b>
                <small>상대 돌 하나를 잠시 봉인하는 석혼</small>
              </span>
            </button>
          ) : (
            <p>구매 완료 · 아래 벤치로 들어갔어요.</p>
          )}
        </section>
      )}
      {lesson.id === "augment" && (
        <section className="practice-choice" aria-label="연습 증강 선택">
          {["cash", "mana", "shields"].map((id) => (
            <button
              key={id}
              disabled={state.complete}
              className={
                expected("augment") && id === "cash" ? "practice-cue" : ""
              }
              onClick={() => send({ kind: "augment", id })}
            >
              <span>{AUGMENT[id].glyph}</span>
              <b>{AUGMENT[id].name}</b>
              <small>{AUGMENT[id].description}</small>
            </button>
          ))}
        </section>
      )}
      {lesson.id === "altar" && (
        <section className="practice-choice" aria-label="연습 제단 선택">
          {["guard", "thunder", "dealer", "soldier"].map((id, slot) => (
            <button
              key={id}
              disabled={state.complete}
              className={expected("altar") && slot === 0 ? "practice-cue" : ""}
              onClick={() => send({ kind: "altar", slot })}
            >
              <span>{HERO[id].glyph}</span>
              <b>{HERO[id].name} 무료로 받기</b>
              <small>0G · 벤치에 들어가요</small>
            </button>
          ))}
        </section>
      )}
      {showBoard && (
        <>
          <div className="practice-board-legend">
            <span>◯ 내 돌</span>
            <span>◇ 상대 돌</span>
            <span>금색 테두리 = 누를 곳</span>
          </div>
          <div className="practice-board-shell">
            <div
              className="practice-board"
              role="group"
              aria-label="직접 연습하는 오목 보드"
            >
              <svg viewBox="0 0 900 900" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <g key={i}>
                    <path
                      d={`M50 ${50 + i * 100}H850M${50 + i * 100} 50V850`}
                    />
                    <text x={50 + i * 100} y="19" textAnchor="middle">
                      {String.fromCharCode(67 + i)}
                    </text>
                    <text x="15" y={60 + i * 100} textAnchor="middle">
                      {11 - i}
                    </text>
                  </g>
                ))}
              </svg>
              <div className="practice-intersections">
                {cells.map((c) => {
                  const stone = state.game.board[c],
                    sealed = !!stone && stone.sealedUntil > state.game.ply;
                  const selected =
                    state.cell === c ||
                    state.source === c ||
                    state.target === c;
                  const cue =
                    !state.complete && step?.kind === "cell" && step.cell === c;
                  const ghost = state.cell === c && !stone;
                  const h =
                    HERO[
                      stone?.hero ||
                        (state.unit &&
                          me.bench.find((u) => u.uid === state.unit)?.hero) ||
                        ""
                    ];
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`practice-intersection ${cue ? "practice-cue" : ""} ${selected ? "picked" : ""}`}
                      aria-label={`${nameOf(c)} ${stone ? (stone.owner === LEARNER ? "내 돌" : "상대 돌") : "빈 칸"}${stone && HERO[stone.hero] ? " " + HERO[stone.hero].name : ""}${sealed ? " 봉인됨" : ""}${stone?.shield ? " 방패" : ""}`}
                      aria-pressed={selected}
                      onClick={() => send({ kind: "cell", cell: c })}
                    >
                      {stone || ghost ? (
                        <span
                          className={`practice-stone ${stone?.owner === COACH ? "theirs" : "mine"} ${ghost ? "preview" : ""} ${stone?.shield ? "shield" : ""} ${sealed ? "sealed" : ""}`}
                        >
                          <span>{h?.glyph || ""}</span>
                          {sealed && <i>封</i>}
                        </span>
                      ) : cue ? (
                        <span className="practice-point">＋</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="practice-crop-note">
            누르기 쉽도록 보드 중앙 9×9 부분만 크게 보여줘요. 실제 보드는
            13×13이에요.
          </p>
        </>
      )}
      {["shop", "trait", "altar"].includes(lesson.id) && (
        <section className="practice-bench" aria-label="연습 벤치">
          <h4>벤치 · 사거나 받은 석혼을 보관해요</h4>
          {me.bench.length ? (
            <div>
              {me.bench.map((u) => (
                <button
                  key={u.uid}
                  className={`${expected("unit") && step.hero === u.hero ? "practice-cue" : ""} ${state.unit === u.uid ? "selected" : ""}`}
                  disabled={state.complete}
                  onClick={() => send({ kind: "unit", uid: u.uid })}
                >
                  <span>{HERO[u.hero].glyph}</span>
                  <b>{HERO[u.hero].name}</b>
                  <small>
                    {state.unit === u.uid
                      ? "선택했어요"
                      : "보드에 놓으려면 선택"}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <p>
              {state.game.history.length
                ? "보드에 놓아서 벤치가 비었어요."
                : "아직 석혼이 없어요. 구매하면 여기에 들어와요."}
            </p>
          )}
        </section>
      )}
      {lesson.id === "trait" && (
        <div
          className={`practice-trait ${(counts.guardian || 0) >= 2 ? "on" : ""}`}
        >
          <b>◇ 수호자 {counts.guardian || 0}/2</b>
          <span>
            {(counts.guardian || 0) >= 2
              ? "활성 · 두 수호자에 방패가 생겼어요"
              : "서로 다른 수호자 이름이 2개 필요해요"}
          </span>
        </div>
      )}
      {!state.complete && showBoard && (
        <div className="practice-actions">
          {state.game.phase === "prep" ? (
            <button
              className={expected("ready") ? "primary practice-cue" : ""}
              disabled={!expected("ready")}
              onClick={() => send({ kind: "ready" })}
            >
              정비 완료
            </button>
          ) : (
            <>
              {sourceStep ? (
                <>
                  <button
                    className={expected("skill") ? "practice-cue" : ""}
                    disabled={!expected("skill")}
                    onClick={() => send({ kind: "skill" })}
                  >
                    스킬 · 3✧
                  </button>
                  <button
                    className={expected("cast") ? "primary practice-cue" : ""}
                    disabled={!expected("cast")}
                    onClick={() => send({ kind: "cast" })}
                  >
                    스킬 확정
                  </button>
                </>
              ) : (
                <button
                  className={expected("confirm") ? "primary practice-cue" : ""}
                  disabled={!expected("confirm")}
                  onClick={() => send({ kind: "confirm" })}
                >
                  착수 확정
                </button>
              )}
              <button
                className={expected("end") ? "primary practice-cue" : ""}
                disabled={!expected("end")}
                onClick={() => send({ kind: "end" })}
              >
                턴 마치기
              </button>
            </>
          )}
        </div>
      )}
      {state.message && (
        <p className="practice-feedback" aria-live="polite">
          {state.message}
        </p>
      )}
    </div>
  );
}
