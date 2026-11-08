import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { content, NIGHT, type Card, type GameView, type RoomView, type Settings } from "@deception/shared";
import { command, enter, leave, request, run, useRoom } from "./store";
import { FeedbackSettings, unlockAudio, useGameFeedback } from "./feedback";
import { CardArt, CardFace } from "./CardArt";

const roleDescriptions: Record<string, string> = {
  forensic:
    "정답을 아는 안내자입니다. 장면 타일의 항목을 골라 수사팀을 도우세요. 채팅으로 힌트를 전달할 수 없습니다.",
  murderer:
    "자신의 단서와 수단을 한 장씩 골라 사건을 만드세요. 토론에서는 정체를 숨기고, 두 카드가 함께 지목되는 일을 막으세요.",
  accomplice:
    "범인과 정답을 압니다. 수사관처럼 토론하며 범인을 도우세요. 목격자가 있다면 마지막 반전에도 함께 상의할 수 있습니다.",
  witness:
    "밤에 두 용의자를 봅니다. 둘 중 누가 범인인지는 모릅니다. 자신의 정체를 숨기면서 수사팀을 도우세요.",
  investigator:
    "공개된 카드와 법의학자의 단서를 연결하세요. 다른 한 사람의 단서와 수단을 모두 맞히면 사건이 해결됩니다.",
};
const glyphs = ["◈", "◇", "✦", "✧", "⬡", "◉", "⌁", "⊙", "⟡", "◎", "⏣", "✳"];
function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span className={`avatar avatar-${index % 4}`} aria-hidden="true">
      {glyphs[index % glyphs.length]}
      <small>{name.slice(0, 2)}</small>
    </span>
  );
}
function useNow() {
  const offset = useRoom((s) => s.offset);
  const [time, setTime] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setTime(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  return time + offset;
}
// Mobile keyboards resize the visual viewport without consistently resizing 100dvh.
function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${height}px`);
      document.documentElement.style.setProperty("--app-top", `${viewport?.offsetTop ?? 0}px`);
      document.documentElement.dataset.keyboard = String(height < window.innerHeight - 120);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
}
function seconds(deadline: number | null, now: number) {
  return deadline === null
    ? "∞"
    : `${Math.max(0, Math.ceil((deadline - now) / 1000))}초`;
}
function HoldButton({
  children,
  onConfirm,
  ms = 600,
  disabled = false,
  testId,
}: {
  children: React.ReactNode;
  onConfirm: () => void;
  ms?: number;
  disabled?: boolean;
  testId?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function start() {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      onConfirm();
      stop();
    }, ms);
  }
  return (
    <button
      data-testid={testId}
      className={`primary hold ${holding ? "holding" : ""}`}
      style={{ "--hold-ms": `${ms}ms` } as React.CSSProperties}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={stop}
      onBlur={stop}
    >
      <span>{children}</span>
    </button>
  );
}
function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node
      ?.querySelector<HTMLElement>("button, input, textarea, select")
      ?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea, select:not(:disabled), [tabindex="0"]',
        ),
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, []);
  return (
    <div className="scrim" onClick={onClose}>
      <motion.div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="sheet-content">{children}</div>
      </motion.div>
    </div>
  );
}
function Help() {
  return (
    <div className="prose">
      <FeedbackSettings />
      <p className="eyebrow">FIELD MANUAL / 수사 지침</p>
      <h3>범인보다, 두 장의 카드.</h3>
      <p>
        4~12명이 채팅으로 함께 수사합니다. 범인이 고른 핵심 단서 한 장과 범행
        수단 한 장을 모두 찾아야 합니다.
      </p>
      <ol>
        <li>
          모두 준비하면 방장이 사건을 시작합니다. 개인 역할을 꾹 눌러
          확인하세요.
        </li>
        <li>
          밤에 범인은 모두의 공개 카드를 비교하고 자기 카드 중 정답 두 장을 고릅니다. 확정하면 즉시 다음 절차로 넘어갑니다.
        </li>
        <li>
          법의학자는 타일 6장에 마커로만 힌트를 줍니다. 첫 마커부터 자유롭게
          채팅하세요.
        </li>
        <li>
          발표는 법의학자의 다음 좌석부터 한 명씩 진행합니다. 현재 발표자만
          채팅할 수 있습니다.
        </li>
        <li>
          배지 한 개로 한 번 해결을 시도합니다. 다른 한 명의 단서와 수단을 골라
          1.2초 꾹 누르면 확정됩니다. 취소하면 배지를 쓰지 않습니다.
        </li>
        <li>
          수사는 3라운드입니다. 마지막 발표가 끝나면 남은 배지도 소멸합니다.
        </li>
      </ol>
      <h3>힌트와 카드를 함께 비교하려면</h3>
      <p>수사 화면의 ⇄ 힌트·카드 비교를 누르세요. 모바일은 위에 힌트, 아래에 카드를 표시하고 PC는 좌우로 나란히 보여 줍니다. 카드는 최대 두 사람까지 비교할 수 있으며 힌트와 별도로 스크롤합니다. 힌트를 누르면 전체 항목을, 카드를 누르면 큰 그림을 볼 수 있습니다.</p>
      <p>법의학자는 수사 시작 시 비교 화면이 열립니다. 비밀 정답 두 장을 고정해 참고하면서 마커를 놓을 수 있습니다. 확정하면 다음 미배치 힌트로 이동하며, 정답은 가리기 버튼으로 숨길 수 있습니다. 비교 닫기를 누르면 기존 수사 화면으로 돌아갑니다.</p>
      <p>비교 중에도 채팅 열기로 의견을 읽고 작성할 수 있습니다. 법의학자는 읽기만 가능하고, 발표 중에는 현재 발표자만 작성합니다. 카드 아래 메모는 유력·보류·제외로 바뀌며 이 기기에만 저장됩니다. 다른 사람의 단서와 수단을 후보로 고르면 선택한 두 장으로 해결 버튼에서 최종 확인으로 이어집니다. 배지는 마지막 꾹 누르기에서만 사용합니다.</p>
      <p>범인·공범은 비밀 정보 보기를 눌러 자기 팀과 정답을 참고할 수 있습니다. 목격자는 같은 위치에서 밤에 본 두 사람을 한 번에 비교할 수 있습니다. 힌트 6개 펼치기는 법의학자를 포함한 모든 역할이 사용할 수 있습니다.</p>
      <h3>목격자가 있다면</h3>
      <p>
        정답이 나와도 범인이 60초 안에 목격자를 찾아내면 범인팀이 역전합니다.
        범인과 공범만 비밀 채팅으로 상의할 수 있습니다.
      </p>
      <h3>선택 규칙과 온라인 진행</h3>
      <p>공범과 목격자는 6인 이상에서 선택할 수 있습니다. 기본 구성은 6인부터 공범, 8인부터 목격자를 추가합니다. 법의학자는 장소를 직접 선택하고, 2·3라운드에는 장소·사인을 제외한 타일 한 장을 교체합니다. 교체 중에도 자유 토론할 수 있습니다.</p>
      <p>범행 선택 시간과 마지막 마커 뒤 자유 토론 시간은 방 설정에서 바꿀 수 있습니다. 전원(법의학자 포함)이 발표 시작에 동의하면 남은 토론 시간과 관계없이 발표로 넘어갑니다. 해결 시도에서 고른 두 장과 결과는 모두에게 공개되며 일부 정답 여부는 알려주지 않습니다. 해결 카드 선택 20초, 반전 60초는 온라인 진행을 위한 시간 제한입니다. 이벤트 타일은 이 게임의 오리지널 효과이며 설정에서 켤 수 있습니다.</p>
      <h3>연결이 끊겼나요?</h3>
      <p>
        같은 브라우저로 다시 열면 자동 복귀합니다. 법의학자가 끊기면 게임이
        멈추며, 60초 뒤 방장이 중단할 수 있습니다. 자발적으로 나가면 진행 중인
        사건에 다시 참여할 수 없습니다.
      </p>
      <p className="muted">
        원작 규칙을 참고한 비상업 오리지널 프로토타입입니다. 카드·타일 문구와
        그래픽은 새로 제작했습니다.
      </p>
    </div>
  );
}
function Home({ onHelp }: { onHelp: () => void }) {
  const [name, setName] = useState(localStorage.getItem("neon.name") || "");
  const [code, setCode] = useState(
    (new URLSearchParams(location.search).get("room") ||
      new URLSearchParams(location.search).get("code") || "").replace(/\D/g, "").slice(0, 4),
  );
  const [busy, setBusy] = useState(false);
  const connected = useRoom((s) => s.connected);
  const { t } = useTranslation();
  async function submit(mode: "create" | "join") {
    if (busy) return;
    setBusy(true);
    localStorage.setItem("neon.name", name.trim());
    try {
      await enter(mode, {
        name: name.trim(),
        ...(mode === "join" ? { code } : {}),
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="home scroll">
      <div className="home-top">
        <span className="wordmark">N / C</span>
        <button className="text-btn" onClick={onHelp}>
          {t("help")} ↗
        </button>
      </div>
      <div className="home-art" aria-hidden="true">
        <span className="tag tag-clue">단서</span>
        <span className="tag tag-means">수단</span>
        <span className="bullet" />
      </div>
      <h1 className="neon-title">
        <span>네온</span>
        <span>사건파일</span>
      </h1>
      <p className="home-sub">
        불빛 아래, 진실을 숨긴 한 사람.
        <br />
        단서를 연결하고 완벽한 범행을 깨뜨리세요.
      </p>
      <div className="meta-row">
        <span>◈ 4–12명</span>
        <span>◷ 약 20분</span>
        <span>⌁ 실시간 채팅</span>
      </div>
      <form
        className="entry-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(submit("create"));
        }}
      >
        <label htmlFor="nickname">{t("nickname")}</label>
        <input
          id="nickname"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="사건파일에 남길 이름"
          autoComplete="nickname"
          required
        />
        <button
          className="primary"
          disabled={!name.trim() || busy || !connected}
        >
          {busy ? "입장 중…" : `${t("create")} ↗`}
        </button>
        <div className="divider">
          <span>초대받았다면</span>
        </div>
        <div className="join-row">
          <input
            aria-label="방 코드"
            inputMode="numeric"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="4자리 코드"
            maxLength={4}
          />
          <button
            type="button"
            className="secondary"
            disabled={!name.trim() || code.length !== 4 || busy || !connected}
            onClick={() => run(submit("join"))}
          >
            {t("join")}
          </button>
        </div>
      </form>
      <p className="home-foot">ORIGINAL NEON NOIR · CHAT DEDUCTION GAME</p>
    </main>
  );
}

interface ChatDraft {
  text: string;
  setText: React.Dispatch<React.SetStateAction<string>>;
}
function Chat({
  room,
  compact = false,
  draft,
  readOnly = false,
}: {
  room: RoomView;
  compact?: boolean;
  draft?: ChatDraft;
  readOnly?: boolean;
}) {
  const [localText, setLocalText] = useState("");
  const text = draft?.text ?? localText;
  const setText = draft?.setText ?? setLocalText;
  const [sending, setSending] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const game = room.game;
  const criminal =
    game?.phase === "REVERSAL" &&
    ["murderer", "accomplice"].includes(game.private.myRole);
  const channel = criminal ? "criminals" : "public";
  const allowed =
    room.pausedAt === null &&
    (!game ||
      game.phase === "RESULT" ||
      (game.private.myRole !== "forensic" &&
        (game.phase === "ROUND_TRANSITION" ||
          (game.phase === "EVIDENCE_COLLECTION" &&
          Object.keys(game.markers).length > 0) ||
          (game.phase === "PRESENTATION" &&
            game.presenterId === room.selfId))) ||
      criminal);
  const messages = room.chat.filter((m) => m.channel === channel);
  const lastMessage = messages.at(-1);
  useEffect(() => {
    const node = log.current;
    if (node && (atBottom.current || lastMessage?.playerId === room.selfId)) {
      node.scrollTop = node.scrollHeight;
      atBottom.current = true;
    }
  }, [lastMessage?.id, room.selfId]);
  useEffect(() => {
    const node = log.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  let placeholder = "수사 의견을 남겨 주세요";
  if (!allowed)
    placeholder =
      game?.private.myRole === "forensic"
        ? "법의학자는 마커로만 단서를 전합니다"
        : game?.phase === "PRESENTATION"
          ? "현재 발표자의 발언 시간입니다"
          : "아직 채팅할 수 없는 단계입니다";
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || inFlight.current || !allowed) return;
    const message = text.trim();
    inFlight.current = true;
    setSending(true);
    setText("");
    // Focus synchronously while the touch/submit gesture still permits the keyboard.
    input.current?.focus({ preventScroll: true });
    try {
      await request("chat", { text: message, channel });
    } catch (error) {
      setText((draft) => draft || message);
      throw error;
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }
  return (
    <section
      className={`chat ${compact ? "compact-chat" : ""}`}
      aria-label={criminal ? "범인팀 비밀 채팅" : "공개 채팅"}
    >
      <div className="section-label">
        <span>{criminal ? "◉ 범인팀 비밀 채팅" : "⌁ 수사 채팅"}</span>
        <span>{readOnly ? "읽기 전용" : allowed ? "발언 가능" : "발언 대기"}</span>
      </div>
      <div ref={log} className="chat-log" role="log" aria-live="polite"
        onScroll={(e) => {
          const node = e.currentTarget;
          atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
        }}>
        {messages.length === 0 && (
          <div className="empty-chat">
            <span>⌁</span>
            <p>
              {game
                ? "단서를 함께 연결해 보세요."
                : "수사팀이 모이는 중입니다."}
            </p>
            <small>이곳에서 채팅으로 대화합니다.</small>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble-row ${m.playerId === room.selfId ? "mine" : ""}`}
          >
            <span className="bubble-name">
              {m.name}
              {m.channel === "criminals" && " · 비밀"}
            </span>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {!readOnly && <form
        className="chat-input"
        onSubmit={(e) => {
          run(send(e));
        }}
      >
        <input
          ref={input}
          aria-label="채팅 메시지"
          enterKeyHint="send"
          autoComplete="off"
          value={text}
          disabled={!allowed}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault();
          }}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder={placeholder}
        />
        <button
          type="submit"
          aria-label="메시지 보내기"
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          disabled={!allowed || !text.trim() || sending}
        >
          ↑
        </button>
      </form>}
    </section>
  );
}
function SettingsEditor({
  room,
  onClose,
}: {
  room: RoomView;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<Settings>({ ...room.settings });
  const [choice, setChoice] = useState(room.forensicChoice || "");
  function patch(part: Partial<Settings>) {
    setSettings((s) => ({ ...s, ...part }));
  }
  return (
    <Sheet title="수사실 설정" onClose={onClose}>
      <div className="settings-form">
        <label>
          각 종류의 카드 수
          <select
            value={settings.cardsPerKind}
            onChange={(e) =>
              patch({ cardsPerKind: Number(e.target.value) as 3 | 4 | 5 })
            }
          >
            <option value={3}>3장 · 쉬움</option>
            <option value={4}>4장 · 기본</option>
            <option value={5}>5장 · 어려움</option>
          </select>
        </label>
        <label>
          한 사람의 발표 시간
          <select
            value={settings.presentationSeconds ?? 0}
            onChange={(e) =>
              patch({
                presentationSeconds: (Number(e.target.value) ||
                  null) as Settings["presentationSeconds"],
              })
            }
          >
            {[20, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {n}초
              </option>
            ))}
            <option value={0}>무제한</option>
          </select>
        </label>
        <label>
          다같이 토론하는 시간
          <select value={settings.discussionSeconds ?? 0}
            onChange={(e) => patch({ discussionSeconds: Number(e.target.value) || null })}>
            {[10, 30, 60, 120, 180, 300, 600].map((n) => <option key={n} value={n}>{n}초</option>)}
            <option value={0}>무제한 · 전원 동의로 발표 시작</option>
          </select>
        </label>
        <p className="muted">마지막 마커가 놓인 뒤부터 계산합니다. 법의학자를 포함해 전원이 동의하면 즉시 발표로 넘어갑니다.</p>
        <label>
          범인의 카드 선택 시간
          <select value={settings.crimeSeconds}
            onChange={(e) => patch({ crimeSeconds: Number(e.target.value) })}>
            {[15, 25, 30, 45, 60, 90, 120, 180, 300].map((n) => <option key={n} value={n}>{n}초</option>)}
          </select>
        </label>
        <p className="muted">범인이 확정하면 바로 다음 절차로 이동합니다. 시간 초과 시 자기 카드에서 자동 선택합니다.</p>
        <label>
          법의학자 배정
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">무작위</option>
            {room.members.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="switch-row">
          공범{" "}
          <input
            type="checkbox"
            disabled={room.members.length < 6}
            checked={settings.accomplice}
            onChange={(e) =>
              patch({
                accomplice: e.target.checked,
                ...(!e.target.checked ? { witness: false } : {}),
              })
            }
          />
        </label>
        <label className="switch-row">
          목격자{" "}
          <input
            type="checkbox"
            disabled={!settings.accomplice || room.members.length < 6}
            checked={settings.witness}
            onChange={(e) => patch({ witness: e.target.checked })}
          />
        </label>
        <label className="switch-row">
          오리지널 이벤트 타일{" "}
          <input
            type="checkbox"
            checked={settings.events}
            onChange={(e) => patch({ events: e.target.checked })}
          />
        </label>
        <p className="muted">
          설정을 저장하면 사람 참가자의 준비가 해제됩니다. 테스트 봇은 준비를
          유지합니다. 공범·목격자는 6인 이상에서 사용할 수 있습니다.
        </p>
        <button
          className="primary"
          onClick={() =>
            run(
              request("settings", {
                settings,
                forensicChoice: choice || null,
              }).then(onClose),
            )
          }
        >
          설정 저장
        </button>
      </div>
    </Sheet>
  );
}
function Lobby({ room }: { room: RoomView }) {
  const [settings, setSettings] = useState(false);
  const [invite, setInvite] = useState(false);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [addingBot, setAddingBot] = useState(false);
  const self = room.members.find((p) => p.id === room.selfId)!;
  const host = room.hostId === room.selfId;
  const inviteUrl = new URL(location.pathname, location.origin);
  inviteUrl.searchParams.set("room", room.code);
  const link = inviteUrl.toString();
  async function copyInvite() {
    if (!navigator.clipboard) throw new Error("초대 창에서 링크를 길게 눌러 복사해 주세요.");
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setLinkCopied(true);
  }
  async function shareInvite() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "네온 사건파일", text: `수사실 ${room.code}에 초대합니다.`, url: link });
        return;
      }
      await copyInvite();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setInvite(true);
      useRoom.getState().setError(error instanceof Error ? error.message : "초대 링크를 공유하지 못했습니다.");
    }
  }
  useEffect(() => {
    void QRCode.toDataURL(link, {
      width: 240,
      margin: 2,
      color: { dark: "#090e1b", light: "#ffffff" },
    }).then(setQr);
  }, [link]);
  const drag = useRef<string | null>(null);
  function reorder(from: string, to: string) {
    const ids = room.members.map((m) => m.id);
    const index = ids.indexOf(from);
    ids.splice(index, 1);
    ids.splice(ids.indexOf(to), 0, from);
    run(request("seats", { ids }));
  }
  return (
    <div className="lobby scene">
      <div className="lobby-main scroll">
        <p className="eyebrow">CASE ROOM / 수사 대기실</p>
        <div className="room-heading">
          <div>
            <h1>수사팀 소집</h1>
            <p className="muted">모두 모이면, 항구의 밤이 시작됩니다.</p>
          </div>
          <span className="pill">{room.members.length}/12</span>
        </div>
        <button className="invite-card" onClick={() => setInvite(true)}>
          <div>
            <span className="eyebrow">INVITATION CODE</span>
            <strong>{room.code}</strong>
          </div>
          <span>초대 링크 · QR ↗</span>
        </button>
        <button type="button" className="secondary full invite-share" onClick={() => run(shareInvite())}>
          {linkCopied ? "✓ 초대 링크 복사됨" : "🔗 초대 링크 보내기"}
        </button>
        <div className="section-label">
          <span>시계방향 좌석</span>
          <span>{host ? "길게 끌어 순서 변경" : "방장이 순서를 정합니다"}</span>
        </div>
        <div className="member-grid">
          {room.members.map((p, i) => (
            <div
              className={`member-card ${p.ready ? "is-ready" : ""}`}
              key={p.id}
              draggable={host}
              onDragStart={() => {
                drag.current = p.id;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (host && drag.current) reorder(drag.current, p.id);
                drag.current = null;
              }}
            >
              <Avatar name={p.name} index={i} />
              <span className="member-name">
                {p.name}
                {p.id === room.selfId && <small>나</small>}
                {p.isBot && <small>봇</small>}
              </span>
              <span className="member-status">
                {p.id === room.hostId ? "♛ 방장 · " : ""}
                {!p.connected ? "연결 끊김" : p.ready ? "준비 완료" : "대기 중"}
              </span>
              {host && p.id !== room.selfId && (
                <div className="member-tools">
                  <button
                    aria-label={`${p.name} 좌석 앞으로 이동`}
                    disabled={i === 0}
                    onClick={() => reorder(p.id, room.members[i - 1]!.id)}
                  >
                    ←
                  </button>
                  <button
                    aria-label={`${p.name} 추방`}
                    onClick={() => run(request("kick", { playerId: p.id }))}
                  >
                    추방
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="role-summary">
          <span>역할 구성</span>
          <p>
            법의학자 1 · 범인 1{room.settings.accomplice && " · 공범 1"}
            {room.settings.witness && " · 목격자 1"} · 나머지 수사관
          </p>
          <small>
            카드 {room.settings.cardsPerKind}장씩 · 토론 {room.settings.discussionSeconds === null ? "무제한" : `${room.settings.discussionSeconds}초`} · 범행 선택 {room.settings.crimeSeconds}초 · 발표{" "}
            {room.settings.presentationSeconds
              ? `${room.settings.presentationSeconds}초`
              : "무제한"}{" "}
            · 채팅 진행
          </small>
        </div>
        {host && (
          <div className="lobby-host-tools">
            <button className="secondary full" disabled={addingBot || room.members.length >= 12}
              onClick={() => {
                setAddingBot(true);
                run(request("addBot").finally(() => setAddingBot(false)));
              }}>
              🤖 테스트 봇 추가
            </button>
            <p className="muted">혼자서는 봇 3명 이상을 추가하세요. 봇은 자동 준비하며, 마커·추측은 진행 검증용 무작위 선택입니다.</p>
            <button className="secondary full" onClick={() => setSettings(true)}>
              ⚙ 수사실 설정
            </button>
          </div>
        )}
      </div>
      <Chat room={room} compact />
      <div className="lobby-actions">
        <button
          className={self.ready ? "secondary" : "primary"}
          onClick={() => run(request("ready", { ready: !self.ready }))}
        >
          {self.ready ? "준비 취소" : "준비하기"}
        </button>
        {host && (
          <button
            className="primary"
            disabled={
              room.members.length < 4 ||
              !room.members.every((p) => p.ready && p.connected)
            }
            onClick={() => run(request("start"))}
          >
            사건 시작 ↗
          </button>
        )}
      </div>
      {settings && (
        <SettingsEditor room={room} onClose={() => setSettings(false)} />
      )}{" "}
      {invite && (
        <Sheet title="수사팀 초대" onClose={() => setInvite(false)}>
          <div className="invite-sheet">
            <strong className="big-code">{room.code}</strong>
            {qr && (
              <img
                src={qr}
                width={240}
                height={240}
                alt={`방 ${room.code} 초대 QR 코드`}
              />
            )}
            <p>같은 링크로 입장해 함께 수사하세요.</p>
            <input
              aria-label="초대 링크"
              value={link}
              readOnly
              onFocus={(e) => e.target.select()}
            />
            <button
              className="primary"
              onClick={() => run(copyInvite().catch(() => {
                useRoom.getState().setError("초대 링크를 길게 눌러 복사해 주세요.");
              }))}
            >
              {copied ? "복사했어요" : "초대 링크 복사"}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function RoleCard({ room, onClose }: { room: RoomView; onClose?: () => void }) {
  const game = room.game!;
  const [visible, setVisible] = useState(false);
  const [seen, setSeen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const { t } = useTranslation();
  const idName = (id?: string) =>
    game.players.find((p) => p.id === id)?.name ?? "—";
  const solution = game.private.solution;
  const label = (id?: string) =>
    game.players.flatMap((p) => p.cards).find((c) => c.id === id)?.label ??
    "아직 정해지지 않음";
  useEffect(() => {
    const hide = () => setVisible(false);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  return (
    <div className="role-scene scroll">
      <p className="eyebrow">CONFIDENTIAL / 본인만 확인</p>
      <h2>{confirmed ? "다른 수사관을 기다립니다" : "당신의 비밀 파일"}</h2>
      <button
        className={`role-dossier ${visible ? "revealed" : ""}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setVisible(true);
          setSeen(true);
        }}
        onPointerUp={() => setVisible(false)}
        onPointerCancel={() => setVisible(false)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            setVisible(true);
            setSeen(true);
          }
        }}
        onKeyUp={() => setVisible(false)}
        onBlur={() => setVisible(false)}
        aria-label="누르는 동안 비밀 역할 보기"
      >
        <span className="dossier-corner">
          FILE / 0{game.players.find((p) => p.id === room.selfId)!.seat + 1}
        </span>
        {visible ? (
          <>
            <span
              className={`role-glyph ${["murderer", "accomplice"].includes(game.private.myRole) ? "pink" : ""}`}
            >
              ◈
            </span>
            <strong>{t(game.private.myRole)}</strong>
            <p>{roleDescriptions[game.private.myRole]}</p>
            {game.private.murdererId && (
              <p>
                범인: {idName(game.private.murdererId)}
                <br />
                {game.private.accompliceId &&
                  `공범: ${idName(game.private.accompliceId)}`}
              </p>
            )}
            {solution && (
              <div className="secret-pair">
                <span>단서 · {label(solution.clueId)}</span>
                <span>수단 · {label(solution.meansId)}</span>
              </div>
            )}
            {game.private.witnessCandidates && (
              <p>
                현장에서 본 두 사람
                <br />
                {game.private.witnessCandidates.map(idName).join(" / ")}
              </p>
            )}
          </>
        ) : (
          <>
            <span className="redact" aria-hidden="true"><i /><i /><i /></span>
            <strong>꾹 눌러 확인</strong>
            <p>
              누르는 동안만 역할이 보입니다.
              <br />
              손을 떼면 바로 가려집니다.
            </p>
          </>
        )}
      </button>
      {!onClose && (
        <button
          className="primary"
          disabled={!seen || confirmed}
          onClick={() =>
            run(command({ type: "confirmRole" }).then(() => setConfirmed(true)))
          }
        >
          {confirmed ? "확인 완료 · 대기 중" : "역할을 확인했어요"}
        </button>
      )}
      {onClose && (
        <button className="secondary full" onClick={onClose}>
          파일 닫기
        </button>
      )}
      <p className="muted">주변 사람에게 화면이 보이지 않도록 주의하세요.</p>
    </div>
  );
}
function Night({ room }: { room: RoomView }) {
  const game = room.game!;
  const clockNow = useNow();
  const now = room.pausedAt ?? clockNow;
  const elapsed = now - game.nightStartedAt!;
  const role = game.private.myRole;
  const [clueId, setClue] = useState("");
  const [meansId, setMeans] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const crime = elapsed >= NIGHT.introMs && now < game.crimeEndsAt!;
  const witness = game.settings.witness && now >= game.crimeEndsAt! && now < game.crimeEndsAt! + NIGHT.witnessMs;
  const [compare, setCompare] = useState(false);
  const me = game.players.find((p) => p.id === room.selfId)!;
  const entitled = crime && role === "murderer" && !!game.private.murdererId;
  return (
    <div className="night scene scroll">
      <div className="night-orb" style={{ "--p": Math.min(1, elapsed / Math.max(1, game.timer.deadline! - game.nightStartedAt!)) } as React.CSSProperties} aria-hidden="true">◉</div>
      <p className="eyebrow">HARBOR / AFTER DARK</p>
      <h2>
        {elapsed < 3_000
          ? "도시가 눈을 감습니다"
          : entitled
            ? "흔적을 선택하세요"
            : witness && role === "witness"
              ? "밤에 본 두 사람"
              : "항구의 밤이 흐릅니다"}
      </h2>
      <p className="muted">범행 선택이 끝나면 다음 절차로 넘어갑니다.</p>
      <span className="night-time">{seconds(crime ? game.crimeEndsAt : game.timer.deadline, room.pausedAt ?? now)}</span>
      {entitled &&
        (submitted || game.private.solution ? (
          <div className="notice">
            선택이 봉인됐습니다. 밤이 끝날 때까지 기다려 주세요.
          </div>
        ) : (
          <>
            <p className="notice">{game.private.accompliceId
              ? `공범: ${game.players.find((p) => p.id === game.private.accompliceId)?.name} · 아래 공개 카드에서 공범의 카드도 비교할 수 있습니다.`
              : "공범이 없습니다. 모두의 공개 카드를 참고해 자신의 카드 두 장을 고르세요."}</p>
            <button className="secondary full" onClick={() => setCompare(true)}>다른 사람 공개 카드 보기</button>
            <div className="night-cards">
              <div>
                <h3 className="pink">⌕ 핵심 단서</h3>
                {me.cards
                  .filter((c) => c.kind === "clue")
                  .map((c) => (
                    <button
                      className={`evidence-card clue ${clueId === c.id ? "selected" : ""}`}
                      key={c.id}
                      onClick={() => setClue(c.id)}
                    >
                      <CardFace card={c} />
                    </button>
                  ))}
              </div>
              <div>
                <h3 className="cyan">⚒ 범행 수단</h3>
                {me.cards
                  .filter((c) => c.kind === "means")
                  .map((c) => (
                    <button
                      className={`evidence-card means ${meansId === c.id ? "selected" : ""}`}
                      key={c.id}
                      onClick={() => setMeans(c.id)}
                    >
                      <CardFace card={c} />
                    </button>
                  ))}
              </div>
            </div>
            <button
              className="primary"
              disabled={!clueId || !meansId}
              onClick={() =>
                run(
                  command({ type: "crimeSelect", clueId, meansId }).then(() =>
                    setSubmitted(true),
                  ),
                )
              }
            >
              이 두 장으로 확정
            </button>
          </>
        ))}
      {witness && role === "witness" && (
        <div className="witness-pair">
          {game.private.witnessCandidates?.map((id) => (
            <div key={id}>
              <Avatar name={game.players.find((p) => p.id === id)!.name} />
              <strong>{game.players.find((p) => p.id === id)!.name}</strong>
            </div>
          ))}
          <p>누가 범인이고 공범인지는 모릅니다.</p>
        </div>
      )}
      {elapsed >= NIGHT.introMs && ["forensic", "accomplice"].includes(role) && (
        <div className="notice">
          {game.private.murdererId &&
            `범인: ${game.players.find((p) => p.id === game.private.murdererId)?.name}`}
          {game.private.solution && (
            <p>
              단서:{" "}
              {
                game.players
                  .flatMap((p) => p.cards)
                  .find((c) => c.id === game.private.solution!.clueId)?.label
              }
              <br />
              수단:{" "}
              {
                game.players
                  .flatMap((p) => p.cards)
                  .find((c) => c.id === game.private.solution!.meansId)?.label
              }
            </p>
          )}
        </div>
      )}
      {compare && entitled && <Sheet title="범행 선택 · 공개 카드 비교" onClose={() => setCompare(false)}>
        <div className="night-selection-reference" aria-label="비교 중인 나의 범행 선택">
          <strong>내가 고르는 두 장 · {seconds(game.crimeEndsAt, now)}</strong>
          <div className="reference-cards">
            <label>핵심 단서<select aria-label="비교 중 핵심 단서" value={clueId} onChange={(e) => setClue(e.target.value)}>
              <option value="">단서를 고르세요</option>{me.cards.filter((c) => c.kind === "clue").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></label>
            <label>범행 수단<select aria-label="비교 중 범행 수단" value={meansId} onChange={(e) => setMeans(e.target.value)}>
              <option value="">수단을 고르세요</option>{me.cards.filter((c) => c.kind === "means").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></label>
          </div>
          <button className="primary" disabled={!clueId || !meansId || submitted} onClick={() => run(command({ type: "crimeSelect", clueId, meansId }).then(() => setSubmitted(true)))}>확정하고 다음 단계</button>
        </div>
        <p className="muted">모든 단서·수단 카드는 공개 정보입니다. 정답은 자신의 카드에서만 고릅니다.</p>
        <div className="matrix">
          {game.players.filter((p) => p.id !== game.forensicId).map((p) => <div key={p.id}>
            <strong>{p.name}{p.id === room.selfId ? " · 나" : p.id === game.private.accompliceId ? " · 공범" : ""}</strong>
            <div>{p.cards.map((c) => <div key={c.id} className={`comparison-card ${c.kind}`}><CardFace card={c} /></div>)}</div>
          </div>)}
        </div>
      </Sheet>}
    </div>
  );
}

function TileBoard({
  game,
  interactive = false,
  tileId,
}: {
  game: GameView;
  interactive?: boolean;
  tileId?: string;
}) {
  const [choice, setChoice] = useState<Record<string, number>>({});
  return (
    <div className="tile-board">
      {game.tiles.filter((tile) => !tileId || tile.id === tileId).map((tile) => {
        const marker = game.markers[tile.id];
        const selected = choice[tile.id];
        return (
          <article className="tile" key={tile.id}>
            <div className="tile-title">
              <h3>{tile.title}</h3>
              <span>{marker === undefined ? "○ 미배치" : "◉ 확정"}</span>
            </div>
            <div className="tile-options">
              {tile.options.map((option, index) =>
                interactive && marker === undefined ? (
                  <button
                    key={option}
                    className={selected === index ? "preview" : ""}
                    onClick={() =>
                      setChoice((c) => ({ ...c, [tile.id]: index }))
                    }
                  >
                    {option}
                  </button>
                ) : (
                  <span
                    key={option}
                    className={marker === index ? "marked" : ""}
                  >
                    {option}
                  </span>
                ),
              )}
            </div>
            {interactive && marker === undefined && (
              <HoldButton
                disabled={selected === undefined}
                onConfirm={() =>
                  run(
                    command({
                      type: "placeMarker",
                      tileId: tile.id,
                      option: selected!,
                    }),
                  )
                }
              >
                꾹 눌러 마커 확정
              </HoldButton>
            )}
          </article>
        );
      })}
    </div>
  );
}
interface SolveDraft { targetId: string; clueId: string; meansId: string }
interface ComparisonMemory {
  primary?: string;
  secondary?: string;
  tileId?: string;
  showOptions?: boolean;
  showSolution?: boolean;
  showSummary?: boolean;
  chatOpen?: boolean;
  candidate?: SolveDraft;
  scroll: Record<string, number>;
}
const noteLabels = ["메모 없음", "유력", "보류", "제외"];

function ComparisonDesk({
  room, initialPlayerId, onClose, onExpand, memory, notes, onNote, onSolve, chatDraft,
}: {
  room: RoomView;
  initialPlayerId: string;
  onClose: () => void;
  onExpand: (card: Card) => void;
  memory: ComparisonMemory;
  notes: Record<string, number>;
  onNote: (id: string) => void;
  onSolve: (draft?: SolveDraft) => void;
  chatDraft: ChatDraft;
}) {
  const game = room.game!;
  const now = useNow();
  const role = game.private.myRole;
  const forensic = role === "forensic";
  const criminal = role === "murderer" || role === "accomplice";
  // Only the authenticated viewer's projection supplies private role information.
  const solution = forensic || criminal ? game.private.solution : undefined;
  const suspects = game.players.filter((p) => p.id !== game.forensicId);
  const [primary, setPrimary] = useState(memory.primary ?? solution?.murdererId ?? initialPlayerId);
  const [secondary, setSecondary] = useState(memory.secondary ?? "");
  const [tileId, setTileId] = useState(memory.tileId ?? game.tiles.find((t) => game.markers[t.id] === undefined)?.id ?? game.tiles[0]!.id);
  const [showOptions, setShowOptions] = useState(memory.showOptions ?? forensic);
  const [showSolution, setShowSolution] = useState(memory.showSolution ?? forensic);
  const [showSummary, setShowSummary] = useState(memory.showSummary ?? !forensic);
  const [chatOpen, setChatOpen] = useState(memory.chatOpen ?? false);
  const [candidate, setCandidate] = useState<SolveDraft>(memory.candidate ?? { targetId: "", clueId: "", meansId: "" });
  const previousMarkers = useRef(game.markers);
  const previousPhase = useRef(game.phase);
  const close = useRef<HTMLButtonElement>(null);
  const desk = useRef<HTMLElement>(null);
  const scrollRestorers = useRef<Record<string, React.RefCallback<HTMLDivElement>>>({});
  function restoreScroll(key: string) {
    return scrollRestorers.current[key] ??= (node) => { if (node) node.scrollTop = memory.scroll[key] ?? 0; };
  }
  const tile = game.tiles.find((t) => t.id === tileId) ?? game.tiles[0]!;
  const interactive = forensic && game.phase === "EVIDENCE_COLLECTION" && room.pausedAt === null;
  const solutionOwner = suspects.find((p) => p.id === solution?.murdererId);
  const name = (id?: string) => game.players.find((p) => p.id === id)?.name ?? "—";
  const label = (id?: string) => game.players.flatMap((p) => p.cards).find((c) => c.id === id)?.label ?? "미선택";
  const me = game.players.find((p) => p.id === room.selfId)!;
  const canSolve = !forensic && me.hasBadge && room.pausedAt === null && ["EVIDENCE_COLLECTION", "PRESENTATION", "ROUND_TRANSITION"].includes(game.phase);
  const hasPair = !!candidate.targetId && !!candidate.clueId && !!candidate.meansId;
  const readyForPresentation = game.phase === "EVIDENCE_COLLECTION" && Object.keys(game.markers).length === 6;
  const latestMessage = room.chat.filter((m) => m.channel === "public").at(-1);
  useEffect(() => {
    Object.assign(memory, { primary, secondary, tileId, showOptions, showSolution, showSummary, chatOpen, candidate });
  }, [memory, primary, secondary, tileId, showOptions, showSolution, showSummary, chatOpen, candidate]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if ((forensic && previousPhase.current === "ROUND_TRANSITION" && game.phase === "EVIDENCE_COLLECTION") || !game.tiles.some((t) => t.id === tileId)) {
      setTileId(game.tiles.find((t) => game.markers[t.id] === undefined)?.id ?? game.tiles[0]!.id);
    }
    if (forensic && previousMarkers.current[tile.id] === undefined && game.markers[tile.id] !== undefined) {
      const next = game.tiles.find((t) => game.markers[t.id] === undefined);
      if (next) setTileId(next.id);
    }
    previousMarkers.current = game.markers;
    previousPhase.current = game.phase;
  }, [forensic, game.phase, game.markers, game.tiles, tile.id, tileId]);
  function chooseCard(playerId: string, card: Card) {
    setCandidate((old) => {
      const next = old.targetId === playerId ? { ...old } : { targetId: playerId, clueId: "", meansId: "" };
      const field = card.kind === "clue" ? "clueId" : "meansId";
      next[field] = next[field] === card.id ? "" : card.id;
      return next;
    });
  }
  return (
    <section ref={desk} className={`comparison-desk ${forensic ? "forensic-desk" : "public-desk"} ${chatOpen ? "with-chat" : ""}`}
      role="dialog" aria-modal="true" aria-label="힌트와 카드 비교"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); }
        if (event.key === "Tab") {
          const items = desk.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled)");
          const first = items?.[0];
          const last = items?.[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="comparison-toolbar">
        <div><h2>힌트 · 카드 비교</h2><span>R{game.round} · {seconds(game.timer.deadline, room.pausedAt ?? now)}</span></div>
        <button ref={close} className="secondary" onClick={onClose}>비교 닫기</button>
      </header>
      <div className={`comparison-turn ${game.presenterId === room.selfId ? "my-turn" : ""}`} role="status">
        <strong>{game.phase === "PRESENTATION" ? `${name(game.presenterId ?? undefined)}의 발표${game.presenterId === room.selfId ? " · 내 차례" : ""}` : game.phase === "ROUND_TRANSITION" ? "새 힌트를 교체하는 중" : "자유 토론 · 증거 수집"}</strong>
        {game.phase === "PRESENTATION" && game.presenterId === room.selfId && <button className="secondary" onPointerDown={(e) => e.preventDefault()} onClick={() => run(command({ type: "endPresentation" }))}>발표 마침 →</button>}
      </div>
      <div className="comparison-body">
      <div className="comparison-workspace">
        <aside className="comparison-hints" aria-label={forensic ? "정답 참고와 마커 배치" : "공개 힌트 비교"}>
          {(solution || (role === "witness" && game.private.witnessCandidates)) && <div className="solution-reference" aria-label={forensic ? "법의학자 전용 정답 참고" : "나만 보는 역할 정보"}>
            <div className="reference-heading"><strong>{showSolution ? forensic ? `비밀 정답 · ${solutionOwner?.name}` : role === "witness" ? "밤에 본 두 사람" : `범인 · ${name(game.private.murdererId)}` : "비밀 정보 가림"}</strong>
              <button className="text-btn" aria-expanded={showSolution} onClick={() => setShowSolution((v) => !v)}>{showSolution ? "가리기" : forensic ? "정답 보기" : "비밀 정보 보기"}</button>
            </div>
            {showSolution && <>
              {criminal && <p className="private-allies">범인: {name(game.private.murdererId)} · 공범: {game.private.accompliceId ? name(game.private.accompliceId) : "없음"}</p>}
              {solution && <div className="reference-cards">{[solution.clueId, solution.meansId].map((id) => {
                const card = solutionOwner?.cards.find((c) => c.id === id);
                return card && <button key={id} className={`reference-card ${card.kind}`} onClick={() => onExpand(card)}><CardFace card={card} /></button>;
              })}</div>}
              {role === "witness" && <div className="witness-reference"><span>{game.private.witnessCandidates!.map(name).join(" / ")}</span>
                <button className="secondary" onClick={() => { setPrimary(game.private.witnessCandidates![0]!); setSecondary(game.private.witnessCandidates![1]!); }}>밤에 본 두 사람 비교</button>
              </div>}
            </>}
          </div>}
          <div className="comparison-hint-tools scroll" ref={restoreScroll("hints")} onScroll={(e) => { memory.scroll.hints = e.currentTarget.scrollTop; }}>
          <button className="summary-toggle" aria-expanded={showSummary} onClick={() => setShowSummary((v) => !v)}>{showSummary ? "힌트 6개 접기" : "힌트 6개 펼치기"}</button>
          {showSummary && <div className="comparison-hint-summary" aria-label="전체 공개 힌트">
            {game.tiles.map((hint) => <button key={hint.id} aria-pressed={showOptions && tile.id === hint.id} onClick={() => { setTileId(hint.id); setShowOptions(true); }}>
              <small>{hint.title}</small><strong>{game.markers[hint.id] === undefined ? "아직 미정" : hint.options[game.markers[hint.id]]}</strong>
            </button>)}
          </div>}
          <div className="comparison-hint-controls">
            <label className="sr-only" htmlFor="comparison-hint">비교할 힌트</label>
            <select id="comparison-hint" value={tile.id} onChange={(e) => { setTileId(e.target.value); setShowOptions(true); }}>
              {game.tiles.map((hint) => <option key={hint.id} value={hint.id}>{game.markers[hint.id] === undefined ? "○" : "●"} {hint.title}{game.markers[hint.id] === undefined ? "" : ` · ${hint.options[game.markers[hint.id]]}`}</option>)}
            </select>
            {!forensic && <button className="text-btn" aria-expanded={showOptions} onClick={() => setShowOptions((v) => !v)}>{showOptions ? "항목 접기" : "전체 항목"}</button>}
            {forensic && <span className="marker-count">{Object.keys(game.markers).length}/6</span>}
          </div>
          {showOptions && !(forensic && game.phase === "ROUND_TRANSITION") && <div className="comparison-hint-detail">
            <TileBoard game={game} tileId={tile.id} interactive={interactive} />
          </div>}
          {game.phase === "ROUND_TRANSITION" && forensic && <div className="comparison-replacement scroll">
            <p>{game.pendingTile?.title} 타일로 교체할 힌트를 고르세요.</p>
            {game.tiles.filter((t) => t.kind === "hint").map((hint) => <button key={hint.id} className="secondary" disabled={room.pausedAt !== null} onClick={() => run(command({ type: "replaceTile", tileId: hint.id }))}>{hint.title} 교체 →</button>)}
          </div>}
          </div>
        </aside>
        <div className="comparison-evidence" aria-label="플레이어 카드 비교">
          <div className="comparison-player-controls">
            <label>카드 비교 대상<select aria-label="카드 비교 대상" value={primary} onChange={(e) => { setPrimary(e.target.value); if (secondary === e.target.value) setSecondary(""); }}>{suspects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>함께 비교할 사람<select aria-label="함께 비교할 사람" value={secondary} onChange={(e) => setSecondary(e.target.value)}><option value="">한 사람만 보기</option>{suspects.filter((p) => p.id !== primary).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          </div>
          <div className={`comparison-suspects ${secondary ? "two-suspects" : ""}`}>
            {[primary, secondary].filter(Boolean).map((id) => {
              const player = suspects.find((p) => p.id === id)!;
              return <section key={id} className="comparison-suspect" aria-label={`${player.name}의 공개 카드`}>
                <div className="comparison-owner"><strong>{player.name}</strong><small>{player.hasBadge ? "◈ 배지" : "○ 배지 소진"}</small></div>
                <div className="comparison-kind-labels"><span className="pink">단서</span><span className="cyan">수단</span></div>
                <div className="comparison-card-list scroll" ref={restoreScroll(id)} onScroll={(e) => { memory.scroll[id] = e.currentTarget.scrollTop; }}>
                  {Array.from({ length: game.settings.cardsPerKind }, (_, i) => ["clue", "means"].map((kind) => player.cards.filter((c) => c.kind === kind)[i]!)).flat().map((card) => {
                    const selected = candidate.targetId === id && (candidate.clueId === card.id || candidate.meansId === card.id);
                    const note = notes[card.id] ?? 0;
                    return <div key={card.id} className={`comparison-card-item ${selected ? "candidate-selected" : ""}`}>
                      <button className={`evidence-card ${card.kind} note-${note}`} onClick={() => onExpand(card)} aria-label={`${player.name} ${card.kind === "clue" ? "단서" : "수단"} ${card.label} 확대`}><CardFace card={card} /></button>
                      <div className="comparison-card-actions">
                        {!forensic && id !== room.selfId && <button aria-label={`${player.name} ${card.label} 지목 후보`} aria-pressed={selected} onClick={() => chooseCard(id, card)}>{selected ? "✓ 선택" : "후보 선택"}</button>}
                        <button aria-label={`${card.label} 메모: ${noteLabels[note]}`} onClick={() => onNote(card.id)}>{["메모", "◯ 유력", "△ 보류", "✕ 제외"][note]}</button>
                      </div>
                    </div>;
                  })}
                </div>
              </section>;
            })}
          </div>
        </div>
      </div>
      {chatOpen && <div className={`comparison-chat ${forensic ? "scientist-chat" : ""}`}><Chat room={room} draft={chatDraft} readOnly={forensic} /></div>}
      </div>
      {!chatOpen && latestMessage && <div className="comparison-chat-preview" aria-label="최근 공개 채팅">{latestMessage.name}: {latestMessage.text}</div>}
      {candidate.targetId && <div className="comparison-candidate" aria-label="선택한 지목 후보">{name(candidate.targetId)} · {label(candidate.clueId)} / {label(candidate.meansId)}</div>}
      <div className="comparison-actions">
        <button className="secondary" onPointerDown={(e) => e.preventDefault()} onClick={() => setChatOpen((v) => !v)}>{chatOpen ? "채팅 접기" : "채팅 열기"}</button>
        {!forensic && <button className="primary" disabled={!canSolve} onClick={() => onSolve(hasPair ? candidate : undefined)}>{hasPair ? "선택한 두 장으로 해결" : me.hasBadge ? "해결 시도" : "배지 소진"}</button>}
        {readyForPresentation && <button className="secondary" disabled={game.presentationConsents.includes(room.selfId) || room.pausedAt !== null} onPointerDown={(e) => e.preventDefault()} onClick={() => run(command({ type: "beginPresentations" }))}>
          {game.presentationConsents.includes(room.selfId) ? "동의 완료" : "발표 하기"} · {game.presentationConsents.filter((id) => game.players.some((p) => p.id === id && !p.departed)).length}/{game.players.filter((p) => !p.departed).length}
        </button>}
      </div>
    </section>
  );
}

function SolveWizard({ room, initial }: { room: RoomView; initial?: SolveDraft | null }) {
  const game = room.game!;
  const now = useNow();
  const [targetId, setTarget] = useState(initial?.targetId ?? "");
  const [clueId, setClue] = useState(initial?.clueId ?? "");
  const [meansId, setMeans] = useState(initial?.meansId ?? "");
  const [stage, setStage] = useState(initial ? 3 : 0);
  const target = game.players.find((p) => p.id === targetId);
  const cancel = () => run(command({ type: "cancelSolve" }));
  return (
    <div
      className="solve-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="사건 해결 시도"
    >
      <div className="sheet-header">
        <h2>사건 해결</h2>
        <button className="icon-btn" aria-label="시도 취소" onClick={cancel}>
          ✕
        </button>
      </div>
      <div className="solve-progress">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i <= stage ? "done" : ""} />
        ))}
      </div>
      <div className="solve-top">
        <span>0{stage + 1} / 04</span>
        <strong>{seconds(game.solveLock!.expiresAt, now)}</strong>
      </div>
      <div className="scroll solve-body">
        <p className="eyebrow">ONE BADGE. ONE CHANCE.</p>
        <h2>
          {
            [
              "누구의 카드인가요?",
              "핵심 단서는?",
              "범행 수단은?",
              "이 두 장으로 지목할까요?",
            ][stage]
          }
        </h2>
        <p className="muted">
          취소하거나 시간이 지나면 배지는 소모되지 않습니다.
        </p>
        {stage === 0 && (
          <div className="target-list">
            {game.players
              .filter((p) => p.id !== room.selfId && p.id !== game.forensicId)
              .map((p) => (
                <button
                  className="target-option"
                  key={p.id}
                  onClick={() => {
                    setTarget(p.id);
                    setClue("");
                    setMeans("");
                    setStage(1);
                  }}
                >
                  <Avatar name={p.name} index={p.seat} />
                  <strong>{p.name}</strong>
                  <span>선택 →</span>
                </button>
              ))}
          </div>
        )}
        {(stage === 1 || stage === 2) && (
          <div className="solve-cards">
            {target?.cards
              .filter((c) => c.kind === (stage === 1 ? "clue" : "means"))
              .map((c) => (
                <button
                  className={`evidence-card ${c.kind}`}
                  key={c.id}
                  onClick={() => {
                    if (stage === 1) setClue(c.id);
                    else setMeans(c.id);
                    setStage(stage + 1);
                  }}
                >
                  <CardFace card={c} />
                </button>
              ))}
          </div>
        )}
        {stage === 3 && (
          <div className="solve-summary">
            <Avatar name={target!.name} />
            <h3>{target!.name}</h3>
            <span className="evidence-card clue">
              <CardFace card={target?.cards.find((c) => c.id === clueId)} />
            </span>
            <span className="evidence-card means">
              <CardFace card={target?.cards.find((c) => c.id === meansId)} />
            </span>
            <p>확정하면 해결 기회 배지 한 개를 사용합니다.</p>
            <HoldButton
              ms={1200}
              testId="commit-solve"
              onConfirm={() =>
                run(command({ type: "commitSolve", targetId, clueId, meansId }))
              }
            >
              1.2초 꾹 눌러 지목
            </HoldButton>
          </div>
        )}
      </div>
      <div className="solve-bottom">
        <button
          className="secondary"
          disabled={stage === 0}
          onClick={() => setStage(stage - 1)}
        >
          이전
        </button>
        <button className="secondary" onClick={cancel}>
          시도 취소
        </button>
      </div>
    </div>
  );
}

function Investigation({ room }: { room: RoomView }) {
  const game = room.game!;
  const now = useNow();
  const { t } = useTranslation();
  const [tab, setTab] = useState<"chat" | "cards" | "board">(
    game.private.myRole === "forensic" ? "board" : "chat",
  );
  const [suspect, setSuspect] = useState(
    game.players.find((p) => p.id !== game.forensicId)!.id,
  );
  const [info, setInfo] = useState(false);
  const [board, setBoard] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(game.private.myRole === "forensic");
  const comparisonMemory = useRef<ComparisonMemory>({ scroll: {} });
  const [chatText, setChatText] = useState("");
  const chatDraft = { text: chatText, setText: setChatText };
  const [solveDraft, setSolveDraft] = useState<SolveDraft | null>(null);
  const startSolve = (draft?: SolveDraft) => { setSolveDraft(draft ?? null); run(command({ type: "startSolve" })); };
  const [matrix, setMatrix] = useState(false);
  const [solveHistory, setSolveHistory] = useState(false);
  const [menu, setMenu] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [expanded, setExpanded] = useState<Card | null>(null);
  const noteKey = `neon.notes.${room.code}.${room.selfId}.${game.startedAt}`;
  const [notes, setNotes] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(noteKey) || "{}");
    } catch {
      return {};
    }
  });
  const [memo, setMemo] = useState(
    localStorage.getItem(`${noteKey}.text`) || "",
  );
  const me = game.players.find((p) => p.id === room.selfId)!;
  const fs = game.private.myRole === "forensic";
  const target = game.players.find((p) => p.id === suspect)!;
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const evidence = game.phase === "EVIDENCE_COLLECTION";
  const presentation = game.phase === "PRESENTATION";
  const canSolve =
    me.hasBadge &&
    !fs &&
    ["EVIDENCE_COLLECTION", "PRESENTATION", "ROUND_TRANSITION"].includes(
      game.phase,
    );
  useEffect(() => {
    localStorage.setItem(noteKey, JSON.stringify(notes));
  }, [notes, noteKey]);
  useEffect(() => {
    localStorage.setItem(`${noteKey}.text`, memo);
  }, [memo, noteKey]);
  useEffect(
    () => () => {
      if (longPress.current) clearTimeout(longPress.current);
    },
    [],
  );
  const latestSolve = [...game.history]
    .reverse()
    .find((e) => e.type === "solve");
  return (
    <div className="investigation scene">
      <div className="phase-bar">
        <span>
          <b>R{game.round}</b> / 3{" "}
          <i className="round-dots">
            {"●".repeat(game.round)}
            {"○".repeat(3 - game.round)}
          </i>
        </span>
        <button aria-label="수사 메뉴" onClick={() => setMenu(true)}>
          {t(game.phase)} ▾
        </button>
        <span>{seconds(game.timer.deadline, room.pausedAt ?? now)}</span>
      </div>
      <div className="evidence-ribbon" aria-label="공개 증거 리본">
        {game.tiles.map((tile, idx) => (
          <button
            key={`${tile.id}:${game.markers[tile.id] ?? "x"}`}
            className={game.markers[tile.id] === undefined ? "pending" : "placed"}
            style={{ "--i": idx } as React.CSSProperties}
            onClick={() => setBoard(true)}
          >
            <small>{tile.title}</small>
            <strong>
              {game.markers[tile.id] === undefined
                ? "아직 미정"
                : tile.options[game.markers[tile.id]]}
            </strong>
          </button>
        ))}
      </div>
      {presentation && (
        <div
          key={game.presenterId ?? 0}
          className={`spotlight ${game.presenterId === room.selfId ? "my-turn" : ""}`}
        >
          <span>◉</span>
          <div>
            <strong>
              {game.players.find((p) => p.id === game.presenterId)?.name}의 발표
            </strong>
            <small>
              {game.round === 3
                ? "마지막 기회 · 마지막 발표 종료 즉시 배지 소멸"
                : "현재 발표자만 채팅할 수 있습니다"}
            </small>
          </div>
          {game.presenterId === room.selfId && (
            <button
              className="text-btn"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => run(command({ type: "endPresentation" }))}
            >
              발표 마침 →
            </button>
          )}
        </div>
      )}
      {latestSolve && latestSolve.correct === false && (
        <button className="solve-verdict" key={latestSolve.at} onClick={() => setSolveHistory(true)}>
          아니오 · {game.players.find((p) => p.id === latestSolve.playerId)?.name}의 시도 · 카드 기록 보기 ↗
        </button>
      )}
      <div className="view-tabs" role="tablist" aria-label="수사 보기">
        <button
          role="tab"
          aria-selected={tab === "chat"}
          onClick={() => setTab("chat")}
        >
          ⌁ 채팅
        </button>
        <button
          role="tab"
          aria-selected={tab === "cards"}
          onClick={() => setTab("cards")}
        >
          ⌕ 공개 카드
        </button>
        <button
          role="tab"
          aria-selected={tab === "board"}
          onClick={() => setTab("board")}
        >
          ◉ {fs ? "마커 배치" : "증거 보드"}
        </button>
        <button className="compare-tab" onClick={() => setComparisonOpen(true)}>⇄ 힌트·카드 비교</button>
      </div>
      {evidence && tab !== "cards" && Object.keys(game.markers).length === 6 && <div className="discussion-consent">
        <button className="secondary full" disabled={game.presentationConsents.includes(room.selfId) || room.pausedAt !== null}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => run(command({ type: "beginPresentations" }))}>
          {game.presentationConsents.includes(room.selfId) ? "발표 시작 동의 완료" : "발표 하기"} · {game.presentationConsents.filter((id) => game.players.some((p) => p.id === id && !p.departed)).length}/{game.players.filter((p) => !p.departed).length}
        </button>
      </div>}
      <div className="investigation-content">
        {game.phase === "ROUND_TRANSITION" ? (
          <div className="scroll transition-panel">
            <p className="eyebrow">NEW EVIDENCE / ROUND {game.round}</p>
            <h2>사건의 다른 면</h2>
            {fs ? (
              <>
                <p>
                  {game.pendingTile?.title} 타일로 교체할 기존 힌트를 고르세요.
                </p>
                {game.tiles
                  .filter((t) => t.kind === "hint")
                  .map((tile) => (
                    <button
                      className="secondary full"
                      key={tile.id}
                      onClick={() =>
                        run(command({ type: "replaceTile", tileId: tile.id }))
                      }
                    >
                      {tile.title} 교체 →
                    </button>
                  ))}
              </>
            ) : (
              <p className="muted">
                법의학자가 새로운 타일을 선택하고 있습니다.
              </p>
            )}
            {!fs && !comparisonOpen && <Chat room={room} compact draft={chatDraft} />}
            {game.history
              .filter((e) => e.type === "event" && e.round === game.round)
              .map((e, i) => (
                <p key={i} className="notice">
                  현장 이벤트가 적용됐습니다. 발표 시간이 변경될 수 있습니다.
                </p>
              ))}
          </div>
        ) : tab === "chat" ? (
          !comparisonOpen && <Chat room={room} draft={chatDraft} />
        ) : tab === "board" ? (
          <div className="scroll board-wrap">
            {fs && evidence && (
              <p className="notice">
                마커 {Object.keys(game.markers).length}/6개 확정 · 한 번 놓으면
                옮길 수 없습니다.
              </p>
            )}
            <TileBoard game={game} interactive={fs && evidence} />

          </div>
        ) : (
          <div className="cards-view">
            <div className="suspect-strip">
              {game.players
                .filter((p) => p.id !== game.forensicId)
                .map((p) => (
                  <button
                    className={`${p.id === suspect ? "active" : ""} ${game.presenterId === p.id ? "presenting" : ""}`}
                    key={p.id}
                    onClick={() => setSuspect(p.id)}
                  >
                    <Avatar name={p.name} index={p.seat} />
                    <span>{p.name}</span>
                    <small>{p.hasBadge ? "◈ 배지" : "○ 소진"}</small>
                  </button>
                ))}
            </div>
            <div className="card-column-head">
              <span className="pink">⌕ 단서 · {target.name}</span>
              <span className="cyan">⚒ 수단</span>
            </div>
            <div className="card-grid scroll" key={suspect}>
              {Array.from({ length: room.settings.cardsPerKind }, (_, index) =>
                ["clue", "means"].map(
                  (kind) => target.cards.filter((c) => c.kind === kind)[index]!,
                ),
              )
                .flat()
                .map((c) => (
                  <button
                    key={c.id}
                    className={`evidence-card ${c.kind} note-${notes[c.id] || 0}`}
                    aria-label={`${target.name} ${c.kind === "clue" ? "단서" : "수단"} ${c.label}`}
                    onPointerDown={() => {
                      longFired.current = false;
                      longPress.current = setTimeout(() => {
                        longFired.current = true;
                        setExpanded(c);
                      }, 600);
                    }}
                    onPointerUp={() => {
                      if (longPress.current) clearTimeout(longPress.current);
                    }}
                    onPointerCancel={() => {
                      if (longPress.current) clearTimeout(longPress.current);
                    }}
                    onClick={(event) => {
                      if (longFired.current) return;
                      if ((event.target as HTMLElement).closest(".card-art")) {
                        setExpanded(c);
                      } else {
                        setNotes((n) => ({
                          ...n,
                          [c.id]: ((n[c.id] || 0) + 1) % 4,
                        }));
                      }
                    }}
                  >
                    <CardFace card={c} />
                    <small className="card-note">{["", "◯", "△", "✕"][notes[c.id] || 0]}</small>
                  </button>
                ))}
            </div>
            <button className="matrix-link" onClick={() => setComparisonOpen(true)}>
              ⇄ 힌트와 카드 함께 비교 · 최대 두 사람
            </button>
          </div>
        )}
      </div>
      <div className="game-dock">
        <button onClick={() => setNoteOpen(true)}>
          ▤<span>메모</span>
        </button>
        <button onClick={() => setInfo(true)}>
          ◈<span>내 정보</span>
        </button>
        <button
          className="solve-action"
          disabled={!canSolve}
          onClick={() => startSolve()}
        >
          ⌕<span>{me.hasBadge ? "해결 시도" : "배지 소진"}</span>
        </button>
      </div>
      {menu && (
        <Sheet
          title={`수사 메뉴 · ${room.code}`}
          onClose={() => setMenu(false)}
        >
          {(["chat", "cards", "board"] as const).map((value, i) => (
            <button
              key={value}
              className="secondary full"
              onClick={() => {
                setTab(value);
                setMenu(false);
              }}
            >
              {["수사 채팅", "공개 카드", "증거 보드"][i]}
            </button>
          ))}
          <button className="secondary full" onClick={() => { setComparisonOpen(true); setMenu(false); }}>힌트와 카드 함께 비교</button>
          <button
            className="secondary full"
            onClick={() => {
              setMatrix(true);
              setMenu(false);
            }}
          >
            전체 카드 비교
          </button>
          <button className="secondary full" onClick={() => { setSolveHistory(true); setMenu(false); }}>해결 시도 기록 · {game.history.filter((e) => e.type === "solve").length}건</button>
          <details className="timeline">
            <summary>도움말</summary>
            <Help />
          </details>
          <button className="secondary full" onClick={() => run(leave())}>
            배지를 포기하고 나가기
          </button>
        </Sheet>
      )}
      {solveHistory && <Sheet title="공개 해결 시도 기록" onClose={() => setSolveHistory(false)}>
        <p className="muted">확정한 시도만 공개합니다. 오답이면 두 장 중 어느 것이 맞는지는 알 수 없습니다.</p>
        {game.history.filter((e) => e.type === "solve").length === 0 && <p>아직 해결 시도가 없습니다.</p>}
        <div className="solve-history">
          {game.history.filter((e) => e.type === "solve").map((entry, i) => {
            const guess = entry.solution;
            const target = game.players.find((p) => p.id === guess?.murdererId);
            return <article key={i} className="solve-history-entry">
              <strong>R{entry.round} · {game.players.find((p) => p.id === entry.playerId)?.name} → {target?.name}</strong>
              <span>{entry.correct ? "정답" : "아니오 · 배지 소진"}</span>
              {target?.cards.filter((c) => c.id === guess?.clueId || c.id === guess?.meansId).map((c) =>
                <div key={c.id} className={`evidence-card ${c.kind}`}><CardFace card={c} /></div>)}
            </article>;
          })}
        </div>
      </Sheet>}
      {info && (
        <Sheet title="비밀 파일" onClose={() => setInfo(false)}>
          <RoleCard room={room} onClose={() => setInfo(false)} />
        </Sheet>
      )}
      {board && (
        <Sheet title="공개 증거 보드" onClose={() => setBoard(false)}>
          <TileBoard game={game} />
        </Sheet>
      )}
      {noteOpen && (
        <Sheet title="나만의 수사 메모" onClose={() => setNoteOpen(false)}>
          <p className="muted">
            이 기기에만 저장됩니다. 카드 탭: ◯ 유력 → △ 보류 → ✕ 제외.
          </p>
          <textarea
            aria-label="개인 메모"
            rows={10}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="용의자와 단서의 연결을 적어 보세요."
          />
        </Sheet>
      )}
      {matrix && (
        <Sheet title="전체 카드 비교" onClose={() => setMatrix(false)}>
          <div className="matrix">
            {game.players
              .filter((p) => p.id !== game.forensicId)
              .map((p) => (
                <div key={p.id}>
                  <strong>{p.name}</strong>
                  <div>
                    {p.cards.map((c) => (
                      <button
                        key={c.id}
                        className={c.kind}
                        onClick={() => setExpanded(c)}
                      >
                        <CardFace card={c} />
                        <small>{["", "◯", "△", "✕"][notes[c.id] || 0]}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </Sheet>
      )}
      {comparisonOpen && <ComparisonDesk room={room} initialPlayerId={suspect} onClose={() => setComparisonOpen(false)} onExpand={setExpanded}
        memory={comparisonMemory.current} notes={notes} onNote={(id) => setNotes((old) => ({ ...old, [id]: ((old[id] ?? 0) + 1) % 4 }))} onSolve={startSolve} chatDraft={chatDraft} />}
      {expanded && (
        <Sheet title="증거 확대" onClose={() => setExpanded(null)}>
          <div className={`expanded-card ${expanded.kind}`}>
            <span>
              {expanded.kind === "clue"
                ? "⌕ 핵심 단서 후보"
                : "⚒ 범행 수단 후보"}
            </span>
            <CardArt card={expanded} />
            <h2>{expanded.label}</h2>
            <p>그림보다 문구를 기준으로 추리하세요.</p>
          </div>
        </Sheet>
      )}
      {game.phase === "SOLVING" &&
        (game.private.isSolving ? (
          <SolveWizard room={room} initial={solveDraft} />
        ) : (
          <div className="waiting-overlay" role="status">
            <span className="pulse-ring">⌕</span>
            <h2>
              누군가 사건을
              <br />
              해결하려 합니다
            </h2>
            <p>타이머가 잠시 멈췄습니다.</p>
            <strong>{seconds(game.solveLock!.expiresAt, now)}</strong>
          </div>
        ))}
    </div>
  );
}

function Reversal({ room }: { room: RoomView }) {
  const game = room.game!;
  const clockNow = useNow();
  const now = room.pausedAt ?? clockNow;
  const role = game.private.myRole;
  const criminal = role === "murderer" || role === "accomplice";
  const [target, setTarget] = useState("");
  const [sharing, setSharing] = useState(false);
  const name = game.players.find((p) => p.id === target)?.name;
  async function shareCandidate() {
    if (!name || sharing) return;
    setSharing(true);
    try { await request("chat", { channel: "criminals", text: `[목격자 후보] ${name}` }); }
    finally { setSharing(false); }
  }
  return (
    <div className="reversal scene">
      <header className="reversal-heading"><h1>마지막 <em>반전</em></h1><strong className="reversal-time">{seconds(game.timer.deadline, now)}</strong></header>
      <p className="muted">{criminal ? "후보를 비교하고 비밀 채팅으로 상의하세요. 최종 지목은 범인이 확정합니다." : "범인이 재판 전 마지막 수를 두는 중입니다."}</p>
      {criminal && <>
        <div className="reversal-workspace">
          <div className="reversal-main scroll">
            <div className="target-list">{game.players.filter((p) => ![game.forensicId, game.private.murdererId, game.private.accompliceId].includes(p.id)).map((p) =>
              <button key={p.id} className={`target-option ${target === p.id ? "selected" : ""}`} aria-pressed={target === p.id} onClick={() => setTarget(p.id)}><Avatar name={p.name} index={p.seat} />{p.name}</button>,
            )}</div>
          </div>
          <div className="reversal-chat"><Chat room={room} /></div>
        </div>
        <div className="reversal-choicebar">
          <strong aria-live="polite">검토 중인 후보: {name ?? "아직 선택하지 않음"}</strong>
          <button className="secondary" disabled={!target || sharing || room.pausedAt !== null} onPointerDown={(e) => e.preventDefault()} onClick={() => run(shareCandidate())}>후보 의견 보내기</button>
          {role === "murderer" && <HoldButton disabled={!target || room.pausedAt !== null} ms={1200} onConfirm={() => run(command({ type: "reversalPick", targetId: target }))}>꾹 눌러 목격자 지목</HoldButton>}
        </div>
      </>}
    </div>
  );
}
function Result({ room }: { room: RoomView }) {
  const game = room.game!;
  const { t } = useTranslation();
  const solution = game.solution!;
  const murderer = game.players.find((p) => p.id === solution.murdererId)!;
  return (
    <div className="result scene scroll">
      <p className="eyebrow">INCIDENT REPORT / CLOSED</p>
      <div
        className={`result-stamp ${game.winner === "criminals" ? "criminals" : ""}`}
      >
        {game.winner === "investigators" ? "CASE CLOSED" : "CASE UNSOLVED"}
      </div>
      <h1>{game.winner === "investigators" ? "수사팀 승리" : "범인팀 승리"}</h1>
      <p className="muted">
        {
          (
            {
              SOLVED: "두 장의 정답이 모두 밝혀졌습니다.",
              BADGES_EXHAUSTED: "모든 해결 기회가 소진됐습니다.",
              FINAL_PRESENTATION_ENDED:
                "마지막 발표까지 사건이 해결되지 않았습니다.",
              WITNESS_IDENTIFIED: "목격자가 지목되어 범인팀이 역전했습니다.",
              WITNESS_SURVIVED: "목격자를 지켜 사건을 해결했습니다.",
              REVERSAL_TIMEOUT: "제한 시간 안에 목격자가 지목되지 않았습니다.",
            } as Record<string, string>
          )[game.reason!]
        }
      </p>
      <div className="case-answer">
        <p className="eyebrow">범인은 {murderer.name}</p>
        <div className="evidence-card clue">
          <CardFace card={murderer.cards.find((c) => c.id === solution.clueId)} />
        </div>
        <div className="evidence-card means">
          <CardFace card={murderer.cards.find((c) => c.id === solution.meansId)} />
        </div>
      </div>
      <h2>드러난 신분</h2>
      <div className="reveal-list">
        {game.players.map((p) => (
          <div key={p.id}>
            <Avatar name={p.name} index={p.seat} />
            <strong>{p.name}</strong>
            <span
              className={
                ["murderer", "accomplice"].includes(game.revealedRoles![p.id])
                  ? "pink"
                  : "cyan"
              }
            >
              {t(game.revealedRoles![p.id])}
            </span>
          </div>
        ))}
      </div>
      <details className="timeline">
        <summary>사건 재구성 · {game.history.length}개 기록</summary>
        {game.history.map((e, i) => (
          <p key={i}>
            <small>
              R{e.round} / {new Date(e.at).toLocaleTimeString("ko-KR")}
            </small>{" "}
            {e.type === "marker"
              ? `${game.tiles.find((tile) => tile.id === e.tileId)?.title || e.tileId} · 항목 ${(e.option ?? 0) + 1}`
              : e.type === "solve"
                ? `${game.players.find((p) => p.id === e.playerId)?.name} 해결 시도 · ${e.correct ? "정답" : "오답"}`
                : e.type === "presentation"
                  ? `${game.players.find((p) => p.id === e.playerId)?.name} 발표 종료`
                  : e.type === "replace"
                    ? "장면 타일 교체"
                    : e.type === "event"
                      ? "현장 이벤트 발생"
                      : "사건 종료"}
          </p>
        ))}
      </details>
      {room.hostId === room.selfId ? (
        <button className="primary" onClick={() => run(request("rematch"))}>
          법의학자 교대 · 다시 수사하기 ↗
        </button>
      ) : (
        <p className="notice">방장이 다음 사건을 준비하고 있습니다.</p>
      )}
    </div>
  );
}
export function App() {
  useVisualViewport();
  const room = useRoom((s) => s.room);
  const connected = useRoom((s) => s.connected);
  const error = useRoom((s) => s.error);
  const setError = useRoom((s) => s.setError);
  const [help, setHelp] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const now = useNow();
  const { t } = useTranslation();
  const game = room?.game;
  useGameFeedback(game);
  const [banner, setBanner] = useState("");
  const phase = game?.phase;
  const round = game?.round;
  useEffect(() => {
    if (!phase || ["DEAL", "ROLE_REVEAL", "CRIME_NIGHT", "SOLVING"].includes(phase)) return;
    setBanner(
      phase === "EVIDENCE_COLLECTION" || phase === "PRESENTATION"
        ? `${round}라운드 ${t(phase)}`
        : t(phase),
    );
    const id = setTimeout(() => setBanner(""), 1500);
    return () => clearTimeout(id);
  }, [phase, round, t]);
  return (
    <MotionConfig reducedMotion="user">
      <div
        onPointerDown={unlockAudio}
        className={`app-frame ${game?.phase === "CRIME_NIGHT" ? "night-frame" : ""}`}
      >
        <div className="rain" aria-hidden="true" />
        {room && (
          <header className="app-header">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setHelp(true);
              }}
            >
              N<span>/</span>C
            </a>
            <span className="room-code">ROOM {room.code}</span>
            <div>
              <button className="text-btn" onClick={() => setHelp(true)}>
                {t("help")}
              </button>
              <button
                className="text-btn"
                onClick={() => setConfirmLeave(true)}
              >
                {t("leave")}
              </button>
            </div>
          </header>
        )}
        {!connected && (
          <div className="connection-banner" role="status">
            서버에 연결하는 중… 같은 브라우저에서 자동 복귀합니다.
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            className="phase-shell"
            key={
              !room
                ? "home"
                : !game
                  ? "lobby"
                  : game.phase === "SOLVING"
                    ? "investigation"
                    : [
                          "EVIDENCE_COLLECTION",
                          "PRESENTATION",
                          "ROUND_TRANSITION",
                        ].includes(game.phase)
                      ? "investigation"
                      : game.phase
            }
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {!room ? (
              <Home onHelp={() => setHelp(true)} />
            ) : !game ? (
              <Lobby room={room} />
            ) : game.phase === "DEAL" ? (
              <div className="interlude">
                <div className="deal-fan" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, i) => (
                    <span
                      key={i}
                      className={`dealt ${i % 2 ? "means" : "clue"}`}
                      style={{ "--i": i } as React.CSSProperties}
                    />
                  ))}
                </div>
                <h2>증거를 배부합니다</h2>
                <p>한 사건, {game.players.length}명의 서로 다른 시선.</p>
              </div>
            ) : game.phase === "ROLE_REVEAL" ? (
              <RoleCard room={room} />
            ) : game.phase === "CRIME_NIGHT" ? (
              <Night room={room} />
            ) : game.phase === "SCENE_INTRO" ? (
              <SceneIntro room={room} />
            ) : game.phase === "REVERSAL" ? (
              <Reversal room={room} />
            ) : game.phase === "RESULT" ? (
              <Result room={room} />
            ) : (
              <Investigation room={room} />
            )}
          </motion.div>
        </AnimatePresence>
        <AnimatePresence>
          {banner && (
            <motion.div
              key={banner}
              className="phase-banner"
              aria-hidden="true"
              initial={{ opacity: 0, scaleX: 0.6 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <span>{banner}</span>
            </motion.div>
          )}
        </AnimatePresence>
        {room?.pausedAt !== null && room?.pausedAt !== undefined && (
          <div className="waiting-overlay pause-overlay" role="alert">
            <span className="pulse-ring">Ⅱ</span>
            <h2>법의학자 연결 대기</h2>
            <p>진행과 타이머가 멈췄습니다.</p>
            {room.hostId === room.selfId && (
              <button
                className="secondary"
                disabled={now < room.abortAvailableAt!}
                onClick={() => run(request("abort"))}
              >
                {now < room.abortAvailableAt!
                  ? `${seconds(room.abortAvailableAt, now)} 후 중단 가능`
                  : "사건 중단 · 대기실로"}
              </button>
            )}
          </div>
        )}
        {help && (
          <Sheet title="수사 지침" onClose={() => setHelp(false)}>
            <Help />
          </Sheet>
        )}
        {confirmLeave && (
          <Sheet
            title="수사실에서 나가기"
            onClose={() => setConfirmLeave(false)}
          >
            <p>
              {game && game.phase !== "RESULT"
                ? "진행 중인 사건에서는 배지가 소멸하고 다시 입장할 수 없습니다."
                : "수사실을 나가시겠어요?"}
            </p>
            <button
              className="primary"
              onClick={() => run(leave().then(() => setConfirmLeave(false)))}
            >
              나가기
            </button>
          </Sheet>
        )}
        {error && (
          <div className="error-toast" role="alert">
            <span>
              {(
                {
                  INVALID_PHASE: "현재 단계에서는 할 수 없는 행동입니다.",
                  NO_BADGE: "해결 기회를 이미 사용했습니다.",
                  SOLVE_LOCKED: "다른 사람이 해결을 시도하고 있습니다.",
                  NOT_SOLVER:
                    "해결 시도 시간이 끝났거나 본인의 시도가 아닙니다.",
                  MARKER_IMMUTABLE: "확정한 마커는 옮길 수 없습니다.",
                } as Record<string, string>
              )[error] || error}
            </span>
            <button aria-label="알림 닫기" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
function SceneIntro({ room }: { room: RoomView }) {
  return (
    <div className="interlude scene-intro">
      <p className="eyebrow">ARRIVING AT THE SCENE</p>
      <h1>
        비 내리는 항구,
        <br />
        사건이 시작됩니다.
      </h1>
      {room.game!.private.myRole === "forensic" && (
        <div>
          <p>범행 장소 타일을 선택하면 수사를 시작합니다.</p>
          {content.tiles.filter((tile) => tile.kind === "location").map(({ id, title, options }) => (
            <button
              className="secondary full"
              key={id}
              onClick={() =>
                run(command({ type: "chooseLocation", tileId: id }))
              }
            >
              {title} · {options.join(" / ")}
            </button>
          ))}
        </div>
      )}
      {room.game!.private.myRole !== "forensic" && <p>법의학자가 범행 장소를 선택하고 있습니다.</p>}
    </div>
  );
}
