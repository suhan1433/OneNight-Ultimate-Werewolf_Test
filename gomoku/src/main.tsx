import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import {
  HERO,
  HEROES,
  TRAITS,
  AUGMENT,
  ODDS,
  XP,
  type Trait,
  type Hero,
} from "../shared/data";
import { maxMana } from "../shared/engine";
import type {
  Action,
  GameView,
  PublicPlayer,
  Stone,
  Unit,
} from "../shared/types";
import type { RoomView, RoomListing } from "./types";
import { playTone, ambience } from "./audio";
import "./styles.css";
import "./mobile.css";
const socket = io({
  path: "/api/gomoku/socket",
  autoConnect: false,
  reconnection: true,
});
const read = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
interface Session {
  code: string;
  token: string;
  playerId: string;
}
interface Settings {
  motion: "cinematic" | "standard" | "minimal";
  oneTap: boolean;
  colorblind: boolean;
  effects: number;
  music: number;
  haptics: boolean;
}
const defaults: Settings = {
  motion: matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "minimal"
    : "standard",
  oneTap: false,
  colorblind: false,
  effects: 0.5,
  music: 0,
  haptics: true,
};
const GLYPHS = ["衛", "炎", "影", "兵", "霧", "刻", "刃"];
const cellName = (c: number) =>
  `${String.fromCharCode(65 + (c % 13))}${13 - Math.floor(c / 13)}`;
const fmt = (n: number) => String(Math.max(0, n)).padStart(2, "0");
const phaseName = (g: GameView) =>
  g.phase === "prep"
    ? "전열 정비"
    : g.phase === "augment"
      ? "별의 선택"
      : g.phase === "altar"
        ? "운명의 제단"
        : g.phase === "result"
          ? "대국 종료"
          : "한 수의 시간";
function App() {
  const [room, setRoom] = useState<RoomView | null>(null),
    [connected, setConnected] = useState(false),
    [restoring, setRestoring] = useState(
      !!read<Session | null>("cheonwon-session", null),
    );
  const session = useRef(read<Session | null>("cheonwon-session", null));
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<"rules" | "settings" | "codex" | null>(null),
    [confirm, setConfirm] = useState<"leave" | "surrender" | null>(null);
  const [settings, setSettings] = useState<Settings>(() => ({
    ...defaults,
    ...read("cheonwon-settings", {}),
  }));
  const [now, setNow] = useState(Date.now()),
    offset = useRef(0),
    lastEvent = useRef(0),
    [toast, setToast] = useState("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  async function request(event: string, data: object = {}): Promise<any> {
    if (!socket.connected) {
      setError("서버 연결을 기다려 주세요.");
      return null;
    }
    setBusy(true);
    try {
      const res = await socket.timeout(7000).emitWithAck(event, data);
      if (!res.ok) throw Error(res.error);
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 처리하지 못했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function enter(event: string, data: object) {
    const result = await request(event, data);
    if (result) {
      session.current = {
        code: result.code,
        token: result.token,
        playerId: result.playerId,
      };
      save("cheonwon-session", session.current);
    }
  }
  async function leave() {
    const res = await request("room:leave");
    if (res) {
      session.current = null;
      save("cheonwon-session", null);
      setRoom(null);
      lastEvent.current = 0;
    }
    setConfirm(null);
  }
  const action = (a: Action) => request("game:action", a);
  useEffect(() => {
    function connect() {
      setConnected(true);
      const s = session.current;
      if (s) {
        setRestoring(true);
        socket
          .timeout(7000)
          .emitWithAck("session:resume", s)
          .then((res) => {
            if (!res.ok) {
              session.current = null;
              save("cheonwon-session", null);
              setRoom(null);
              setError(res.error);
            }
          })
          .catch(() =>
            setError("좌석 복구에 실패했습니다. 다시 연결해 주세요."),
          )
          .finally(() => setRestoring(false));
      } else setRestoring(false);
    }
    function state(r: RoomView) {
      offset.current = r.serverTime - Date.now();
      setRoom(r);
      setRestoring(false);
      const e = r.game?.events.at(-1);
      if (e && e.id > lastEvent.current) {
        if (lastEvent.current) {
          playTone(e.type, settingsRef.current.effects);
          if (settingsRef.current.haptics && e.type === "PLACE_STONE")
            navigator.vibrate?.(20);
        }
        lastEvent.current = e.id;
      }
    }
    function disconnect() {
      setConnected(false);
    }
    function replaced() {
      session.current = null;
      setRoom(null);
      setError("다른 창에서 이 좌석에 접속했습니다.");
      socket.disconnect();
    }
    socket.on("connect", connect);
    socket.on("disconnect", disconnect);
    socket.on("state", state);
    socket.on("replaced", replaced);
    socket.connect();
    const ticker = setInterval(() => setNow(Date.now() + offset.current), 250);
    return () => {
      socket.off("connect", connect);
      socket.off("disconnect", disconnect);
      socket.off("state", state);
      socket.off("replaced", replaced);
      socket.disconnect();
      clearInterval(ticker);
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setConfirm(null);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    save("cheonwon-settings", settings);
    ambience(settings.music, room?.game?.tension || 0);
  }, [settings, room?.game?.tension]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 6000);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/gomoku/sw.js");
  }, []);
  async function copyInvite() {
    const url = new URL(location.href);
    url.searchParams.set("room", room!.code);
    try {
      await navigator.clipboard.writeText(url.href);
      setToast("초대 링크를 복사했습니다.");
    } catch {
      setError(`방 코드: ${room!.code}`);
    }
  }
  return (
    <div
      className={`app motion-${settings.motion} ${settings.colorblind ? "colorblind" : ""}`}
    >
      <header className="topbar">
        <button
          className="brand"
          onClick={() => (room ? setConfirm("leave") : null)}
          aria-label="천원 홈"
        >
          <span className="brand-seal">天</span>
          <span>
            천원 <small>GOMOKU TACTICS</small>
          </span>
        </button>
        <nav>
          {room && (
            <span className="room-tag">
              ROOM <b>{room.code}</b>
            </span>
          )}
          <button className="quiet" onClick={() => setModal("rules")}>
            게임 방법
          </button>
          <button className="quiet" onClick={() => setModal("codex")}>
            석혼 도감
          </button>
          <button
            className="icon-button"
            title="설정"
            aria-label="설정"
            onClick={() => setModal("settings")}
          >
            ⚙
          </button>
          {room && (
            <button className="quiet leave" onClick={() => setConfirm("leave")}>
              나가기
            </button>
          )}
        </nav>
      </header>
      {!connected && (
        <div className="connection-banner" role="status">
          서버에 연결 중입니다. 접속이 복구되면 좌석과 대국을 이어갑니다.{" "}
          <button onClick={() => socket.connect()}>다시 연결</button>
        </div>
      )}
      <main>
        {restoring ? (
          <div className="restore">
            <div className="moon small" />
            <h2>기억된 한 수를 찾는 중</h2>
          </div>
        ) : !room ? (
          <Home
            connected={connected}
            busy={busy}
            enter={enter}
            request={request}
          />
        ) : !room.game ? (
          <Lobby
            room={room}
            busy={busy || !connected}
            request={request}
            copyInvite={copyInvite}
          />
        ) : (
          <Match
            key={
              room.game.players.map((p) => p.id).join("") +
              "-" +
              room.game.events[0]?.id
            }
            room={room}
            busy={busy || !connected}
            now={now}
            action={action}
            request={request}
            settings={settings}
            surrender={() => setConfirm("surrender")}
          />
        )}
      </main>
      {(error || toast) && (
        <div
          className={`toast ${error ? "error" : ""}`}
          role={error ? "alert" : "status"}
          onClick={() => {
            setError("");
            setToast("");
          }}
        >
          {error || toast}
          <span>×</span>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className={`modal ${modal === "codex" ? "wide" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "settings"
                ? "설정"
                : modal === "rules"
                  ? "게임 방법"
                  : "석혼 도감"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <h2>
                  {modal === "settings"
                    ? "나만의 대국 환경"
                    : modal === "rules"
                      ? "한 수를 두기 전에"
                      : "석혼 도감"}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="닫기"
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </div>
            {modal === "settings" ? (
              <SettingsPanel value={settings} change={setSettings} />
            ) : modal === "rules" ? (
              <Rules />
            ) : (
              <Codex />
            )}
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal compact"
            role="dialog"
            aria-modal="true"
            aria-label="대국 종료 확인"
          >
            <p className="eyebrow">잠시, 마지막 한 수</p>
            <h2>
              {confirm === "leave"
                ? "대기실을 나갈까요?"
                : "대국을 기권할까요?"}
            </h2>
            <p className="muted">
              {room?.game?.phase !== "result" && room?.game
                ? "진행 중인 대국은 기권으로 처리됩니다."
                : "다시 참가하려면 방 코드가 필요합니다."}
            </p>
            <div className="button-row">
              <button onClick={() => setConfirm(null)}>계속 머무르기</button>
              <button
                className="danger"
                onClick={() =>
                  confirm === "leave"
                    ? void leave()
                    : void action({ type: "surrender" }).then(() =>
                        setConfirm(null),
                      )
                }
              >
                {confirm === "leave" ? "나가기" : "기권하기"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Home({
  connected,
  busy,
  enter,
  request,
}: {
  connected: boolean;
  busy: boolean;
  enter: (e: string, d: object) => Promise<void>;
  request: (e: string, d?: object) => Promise<any>;
}) {
  const initialCode = new URLSearchParams(location.search).get("room") || "";
  const [tab, setTab] = useState<"create" | "join">(
      initialCode ? "join" : "create",
    ),
    [name, setName] = useState(() => read("cheonwon-name", "")),
    [code, setCode] = useState(initialCode),
    [isPublic, setPublic] = useState(false),
    [rooms, setRooms] = useState<RoomListing[]>([]);
  useEffect(() => {
    if (connected) request("rooms:list").then((r) => r && setRooms(r.rooms));
    const listener = (list: RoomListing[]) => setRooms(list);
    socket.on("rooms", listener);
    return () => {
      socket.off("rooms", listener);
    };
  }, [connected]);
  const go = (event: string, extra: object = {}) => {
    save("cheonwon-name", name.trim());
    void enter(event, { name, code, ...extra });
  };
  return (
    <div className="home">
      <section className="hero-stage">
        <div className="hero-copy">
          <p className="eyebrow">月下의 신전 · ONE MOVE, ONE SCENE</p>
          <h1>
            고요를 깨우는
            <br />
            <em>단 하나의 수.</em>
          </h1>
          <p className="hero-description">
            돌에 영웅이 깃들고, 다섯 수가 운명이 된다.
            <br />
            오목과 덱 전략이 만나는 1:1 실시간 대국.
          </p>
        </div>
        <div className="temple-art" aria-hidden="true">
          <div className="moon" />
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="art-inscription">
            天<br />元
          </span>
          <div className="landscape mountain-back" />
          <div className="landscape mountain-front" />
          <div className="hero-board">
            <svg viewBox="0 0 520 520">
              <defs>
                <radialGradient id="wood">
                  <stop stopColor="#243541" />
                  <stop offset="1" stopColor="#101a2a" />
                </radialGradient>
              </defs>
              <rect
                x="5"
                y="5"
                width="510"
                height="510"
                rx="8"
                fill="url(#wood)"
                stroke="#b99a5b"
                strokeWidth="2"
              />
              {Array.from({ length: 13 }, (_, i) => (
                <g key={i} stroke="#e8c170" strokeOpacity=".25">
                  <path d={`M25 ${25 + i * 39}H495M${25 + i * 39} 25V495`} />
                </g>
              ))}
              {[
                [5, 6],
                [6, 6],
                [7, 6],
                [8, 6],
                [5, 5],
                [6, 5],
                [6, 7],
                [7, 4],
                [9, 6],
                [4, 7],
              ].map(([x, y], i) => (
                <g key={i}>
                  <circle
                    cx={25 + x * 39}
                    cy={25 + y * 39}
                    r="17"
                    fill={i % 3 === 0 ? "#c7dfdc" : "#131d2b"}
                    stroke={i % 3 === 0 ? "#e6f7ed" : "#e8c170"}
                    strokeWidth="1.5"
                  />
                  <text
                    x={25 + x * 39}
                    y={31 + y * 39}
                    textAnchor="middle"
                    fill={i % 3 === 0 ? "#35444b" : "#e8c170"}
                    fontSize="17"
                  >
                    {GLYPHS[i % 7]}
                  </text>
                </g>
              ))}
              <circle
                cx="337"
                cy="259"
                r="29"
                stroke="#5ce1e6"
                strokeOpacity=".5"
                fill="none"
              />
            </svg>
          </div>
          <div className="art-caption">
            <span className="caption-line" />
            THE MOONLIT SANCTUARY
          </div>
        </div>
        <div className="hero-foot">
          <span>
            13 × 13 <small>운명의 기반</small>
          </span>
          <span>
            24 <small>깨어나는 석혼</small>
          </span>
          <span>
            1 : 1 <small>오직 두 대국자</small>
          </span>
        </div>
      </section>
      <section className="entry-panel">
        <h2>신전으로 들어서다</h2>
        <p className="muted">
          함께할 상대를 부르고, 당신의 이야기를 시작하세요.
        </p>
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "create"}
            className={tab === "create" ? "active" : ""}
            onClick={() => setTab("create")}
          >
            방 만들기
          </button>
          <button
            role="tab"
            aria-selected={tab === "join"}
            className={tab === "join" ? "active" : ""}
            onClick={() => setTab("join")}
          >
            코드로 참가
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go(tab === "create" ? "room:create" : "room:join", {
              public: isPublic,
            });
          }}
        >
          <label>
            대국자 이름
            <input
              value={name}
              maxLength={16}
              required
              placeholder="어떤 이름으로 기억될까요?"
              autoComplete="nickname"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {tab === "join" ? (
            <label>
              초대 코드
              <input
                className="code-input"
                aria-label="초대 코드"
                value={code}
                required
                maxLength={6}
                pattern="[A-Fa-f0-9]{6}"
                placeholder="6자리 방 코드"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>
          ) : (
            <label className="check-label">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setPublic(e.target.checked)}
              />
              <span>
                공개 대기실{" "}
                <small>다른 대국자가 목록에서 참가할 수 있습니다.</small>
              </span>
            </label>
          )}
          <button
            className="primary full"
            disabled={busy || !connected || !name.trim()}
          >
            {tab === "create" ? "대국 시작 · 방 만들기" : "신전에 입장하기"}
          </button>
        </form>
        <div className="divider">
          <span>혼자서도, 한 수</span>
        </div>
        <div className="practice-row">
          <button
            disabled={busy || !connected || !name.trim()}
            onClick={() => go("room:create", { bot: true })}
          >
            <span className="practice-symbol">◐</span>
            <b>사범과 연습</b>
            <small>AI와 전략을 다듬으세요</small>
          </button>
          <button
            disabled={busy || !connected || !name.trim()}
            onClick={() => go("room:create", { bot: true, tutorial: true })}
          >
            <span className="practice-symbol">✧</span>
            <b>첫 대국 안내</b>
            <small>한 수씩 배워보세요</small>
          </button>
        </div>
        <p className="entry-note">설치 없이, 웹과 모바일에서 같은 대국을.</p>
      </section>
      <section className="open-rooms">
        <div className="section-heading">
          <div>
            <h2>아직 비어 있는 맞은편</h2>
          </div>
          <button
            className="quiet"
            disabled={busy || !connected}
            onClick={() =>
              void request("rooms:list").then((r) => r && setRooms(r.rooms))
            }
          >
            목록 새로고침
          </button>
        </div>
        {rooms.length ? (
          <div className="room-list">
            {rooms.map((r) => (
              <button
                key={r.code}
                disabled={busy || !name.trim() || !connected}
                onClick={() => {
                  save("cheonwon-name", name.trim());
                  void enter("room:join", { name, code: r.code });
                }}
              >
                <span className="mini-seal">◯</span>
                <span>
                  <b>{r.hostName}의 신전</b>
                  <small>
                    {r.code} · 대국자 {r.count}/2
                  </small>
                </span>
                <span className="gold">참가</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-tables">
            <span>◯</span>
            <p>
              아직 열린 신전이 없습니다. <b>첫 대국을 열어보세요.</b>
            </p>
          </div>
        )}
      </section>
      <footer className="home-footer">
        <span>天元 · CHEONWON</span>
        <span>서막, 격돌, 그리고 마지막 한 수.</span>
        <span>오목 택틱스 v1.0</span>
      </footer>
    </div>
  );
}
function Chat({
  room,
  request,
}: {
  room: RoomView;
  request: (e: string, d?: object) => Promise<any>;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [room.chat.length]);
  return (
    <section className="chat">
      <h3>
        대국자의 대화 <small>{room.chat.length}</small>
      </h3>
      <div className="messages" aria-live="polite">
        {room.chat.length ? (
          room.chat.map((m) => (
            <p key={m.id}>
              <b>{m.name}</b>
              <span>{m.text}</span>
            </p>
          ))
        ) : (
          <p className="muted">맞은편 대국자에게 인사를 건네보세요.</p>
        )}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim())
            void request("chat:send", { text }).then((r) => {
              if (r) setText("");
            });
        }}
      >
        <input
          aria-label="채팅 메시지"
          value={text}
          maxLength={200}
          placeholder="메시지 보내기"
          onChange={(e) => setText(e.target.value)}
        />
        <button disabled={!text.trim()} aria-label="메시지 전송">
          전송
        </button>
      </form>
    </section>
  );
}
function Lobby({
  room,
  busy,
  request,
  copyInvite,
}: {
  room: RoomView;
  busy: boolean;
  request: (e: string, d?: object) => Promise<any>;
  copyInvite: () => Promise<void>;
}) {
  const self = room.seats.find((s) => s.id === room.self)!,
    host = room.self === room.host;
  const ready =
    room.seats.length === 2 && room.seats.every((s) => s.connected && s.ready);
  return (
    <div className="lobby page-width">
      <div className="lobby-heading">
        <h1>달이 머무는 대기실</h1>
        <p className="muted">
          두 대국자가 준비를 마치면, 금화가 첫 수의 주인을 정합니다.
        </p>
      </div>
      <div className="lobby-grid">
        <section className="lobby-main panel">
          <div className="invite-bar">
            <span>
              초대 코드 <b>{room.code}</b>
            </span>
            <button onClick={() => void copyInvite()}>초대 링크 복사</button>
          </div>
          <div className="seats">
            {[0, 1].map((i) => {
              const s = room.seats[i];
              return (
                <React.Fragment key={i}>
                  {i === 1 && <span className="versus">對</span>}
                  <div className={`seat ${s?.ready ? "is-ready" : ""}`}>
                    <div className={`avatar ${i ? "white" : "black"}`}>
                      {s ? (s.bot ? "師" : s.name.slice(0, 1)) : "+"}
                    </div>
                    <span className="seat-role">
                      {s?.id === room.host
                        ? "방장"
                        : s?.bot
                          ? "AI 사범"
                          : "대국자"}
                    </span>
                    <h2>{s?.name || "당신의 맞은편"}</h2>
                    <p>
                      {s
                        ? s.connected
                          ? s.ready
                            ? "준비를 마쳤습니다"
                            : "마음을 가다듬는 중"
                          : "재접속을 기다리는 중"
                        : "초대 링크로 상대를 불러주세요"}
                    </p>
                    {s?.id === room.self && <span className="you-tag">나</span>}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          <div className="lobby-rules">
            <span>13 × 13 기반</span>
            <span>준비 20초 · 턴 30초</span>
            <span>장목 허용 · 금수 없음</span>
          </div>
          <div className="lobby-controls">
            <button
              className={self.ready ? "ready-button" : "primary"}
              disabled={busy}
              onClick={() => void request("room:ready")}
            >
              {self.ready ? "준비 취소" : "준비 완료"}
            </button>
            {host && (
              <button
                className="primary"
                disabled={busy || !ready}
                onClick={() => void request("room:start")}
              >
                대국 시작
              </button>
            )}
            {host &&
              (room.seats.length === 1 || room.seats.some((s) => s.bot)) && (
                <button
                  disabled={busy}
                  onClick={() => void request("room:bot")}
                >
                  {room.seats.some((s) => s.bot)
                    ? "사범 내보내기"
                    : "AI 사범 초대"}
                </button>
              )}
          </div>
          {!ready && (
            <p className="center muted">
              {room.seats.length < 2
                ? "상대의 입장을 기다리고 있습니다."
                : "두 사람 모두 준비하면 방장이 시작할 수 있습니다."}
            </p>
          )}
        </section>
        <aside className="lobby-aside">
          <section className="panel lobby-guide">
            <h3>
              오목이 시작이고,
              <br />
              전략이 이야기가 된다.
            </h3>
            <p>
              무료 플레인 스톤으로 다섯 수를 잇거나, 석혼을 배치해 고유 스킬과
              특성을 깨워보세요.
            </p>
            <div className="guide-line">
              <span>Ⅰ</span>
              <p>
                <b>서막</b>상점에서 첫 영웅단을 구성합니다.
              </p>
            </div>
            <div className="guide-line">
              <span>Ⅱ</span>
              <p>
                <b>격돌</b>특성과 증강으로 판을 흔듭니다.
              </p>
            </div>
            <div className="guide-line">
              <span>Ⅲ</span>
              <p>
                <b>결전</b>마지막 다섯 수가 이야기를 완성합니다.
              </p>
            </div>
          </section>
          <Chat room={room} request={request} />
        </aside>
      </div>
    </div>
  );
}
function StoneView({ stone, side, mine, preview = false,
  last = false,
}: {
  stone: Pick<Stone, "hero" | "star" | "shield" | "sealedUntil" | "tokenUntil">;
  side: number; mine?: boolean; preview?: boolean;
  last?: boolean;
}) {
  const h = HERO[stone.hero];
  return (
    <span
      className={`stone side-${side} ${mine === undefined ? "" : mine ? "mine" : "theirs"} cost-${h?.cost || 0} ${preview ? "ghost" : ""} ${stone.shield ? "shielded" : ""} ${stone.sealedUntil ? "sealed" : ""} ${stone.tokenUntil ? "token" : ""}`}
    >
      <span>{h?.glyph || (stone.hero === "token" ? "✧" : "")}</span>
      {h && stone.star > 1 && <small>{"★".repeat(stone.star)}</small>}
      {stone.tokenUntil > 0 && (
        <small className="token-turns">{stone.tokenUntil}</small>
      )}
      {last && <i className="last-dot" />}
      {stone.sealedUntil > 0 && <i className="seal-mark">封<b>{stone.sealedUntil}</b></i>}
    </span>
  );
}
// Pointer handlers are recreated by the clock render. Keep each element's
// pending press outside those closures so pointerup always cancels its timer.
const pressTimers = new WeakMap<HTMLElement, number>();
const longPressed = new WeakSet<HTMLElement>();
function longPress(cb: () => void) {
  const stop = (e: React.SyntheticEvent<HTMLElement>) => {
    window.clearTimeout(pressTimers.get(e.currentTarget));
    pressTimers.delete(e.currentTarget);
  };
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      stop(e);
      longPressed.delete(e.currentTarget);
      if (e.button !== 0) return;
      const element = e.currentTarget;
      pressTimers.set(element, window.setTimeout(() => {
        pressTimers.delete(element);
        if (element.isConnected) {
          longPressed.add(element);
          cb();
        }
      }, 450));
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.SyntheticEvent<HTMLElement>) => {
      stop(e);
      e.preventDefault();
      if (!longPressed.has(e.currentTarget)) {
        longPressed.add(e.currentTarget);
        cb();
      }
    },
    onClickCapture: (e: React.SyntheticEvent<HTMLElement>) => {
      if (longPressed.has(e.currentTarget)) {
        e.stopPropagation();
        e.preventDefault();
        longPressed.delete(e.currentTarget);
      }
    },
  };
}
function ResourcePlayer({
  p,
  index,
  self,
  active,
}: {
  p: PublicPlayer;
  index: number;
  self: boolean;
  active: boolean;
}) {
  return (
    <section
      className={`player-card ${self ? "self" : "opponent"} ${active ? "active" : ""}`}
    >
      <span className={`player-stone side-${index}`}>
        {index ? "白" : "黑"}
      </span>
      <div className="player-title">
        <b>
          {p.name} {self && <small>나</small>}
        </b>
        <span>
          {index ? "후공" : "선공"} · Lv.{p.level}
        </span>
      </div>
      <div className="player-resources">
        <span className="gold">
          ◎ {p.gold}
          <small>골드</small>
        </span>
        <span className="cyan">
          ✧ {p.mana}/{maxMana(p)}
          <small>마나</small>
        </span>
      </div>
    </section>
  );
}
function HeroCard({
  hero,
  unit,
  selected,
  disabled,
  onClick,
  onDetail,
}: {
  hero: Hero;
  unit?: Unit;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  onDetail: () => void;
}) {
  return (
    <div
      className={`hero-card cost-${hero.cost} ${selected ? "selected" : ""}`}
    >
      <button className="hero-card-main" disabled={disabled} onClick={onClick} {...longPress(onDetail)}>
        <span className="card-cost">
          {hero.cost} <small>G</small>
        </span>
        <span className="hero-glyph">{hero.glyph}</span>
        <b>{hero.name}</b>
        <span className="card-traits">
          {hero.traits.map((t) => TRAITS[t].name).join(" · ")}
        </span>
        {unit && <span className="star-label">{"★".repeat(unit.star)}</span>}
      </button>
      <button
        className="card-info"
        onClick={onDetail}
        aria-label={`${hero.name} 상세`}
      >
        ⓘ
      </button>
    </div>
  );
}
function Match({
  room,
  busy,
  now,
  action,
  request,
  settings,
  surrender,
}: {
  room: RoomView;
  busy: boolean;
  now: number;
  action: (a: Action) => Promise<any>;
  request: (e: string, d?: object) => Promise<any>;
  settings: Settings;
  surrender: () => void;
}) {
  const g = room.game!,
    me = g.players.find((p) => p.id === room.self)!,
    other = g.players.find((p) => p.id !== room.self)!,
    myIndex = g.players.indexOf(me),
    myTurn = g.phase === "turn" && g.turn === me.id;
  const [cell, setCell] = useState<number | null>(null),
    [unit, setUnit] = useState<string | undefined>(),
    [source, setSource] = useState<number | null>(null),
    [skill, setSkill] = useState(false),
    [target, setTarget] = useState<number | null>(null),
    [destination, setDestination] = useState<number | null>(null),
    [detail, setDetail] = useState<Hero | null>(null),
    [drawer, setDrawer] = useState(false),
    [effect, setEffect] = useState(""),
    [augmentUnit, setAugmentUnit] = useState(""),
    [emblem, setEmblem] = useState<Trait | "">(""),
    [shieldMode, setShieldMode] = useState(false),
    [tip, setTip] = useState(0), [act, setAct] = useState(0), [resultHidden, setResultHidden] = useState(false);
  const remaining = Math.max(0, Math.ceil((g.deadline - now) / 1000)),
    last = g.history.at(-1),
    sourceStone = source !== null ? g.board[source] : null,
    sourceHero = sourceStone ? HERO[sourceStone.hero] : null;
  const skillMana =
    sourceHero && (me.traits.mage || 0) >= 6 && (me.casts + 1) % 3 === 0
      ? 0
      : sourceHero
        ? Math.max(
            1,
            sourceHero.mana -
              Number((me.traits.mage || 0) >= 4) +
              Number(me.skills > 0) +
              Number(
                target !== null &&
                  g.board.some(
                    (s, c) =>
                      s?.owner === other.id &&
                      s.hero === "watcher" &&
                      s.sealedUntil <= g.ply &&
                      Math.max(
                        Math.abs((c % 13) - (target % 13)),
                        Math.abs(Math.floor(c / 13) - Math.floor(target / 13)),
                      ) <= 2,
                  ),
              ),
          )
        : 0;
  const skillUnavailable =
    !!sourceStone &&
    (sourceStone.sealedUntil > g.ply ||
      me.mana < skillMana ||
      (sourceStone.cooldown > 0 &&
        !((me.traits.assassin || 0) >= 4 && !me.assassinUsed)));
  const reset = () => {
    setCell(null);
    setSource(null);
    setSkill(false);
    setTarget(null);
    setDestination(null);
    setShieldMode(false);
  };
  useEffect(() => {
    reset();
    setUnit(undefined);
  }, [g.ply, g.phase]);
  useEffect(() => {
    if (unit && !me.bench?.some((u) => u.uid === unit)) setUnit(undefined);
  }, [me.bench, unit]);
  const eventId = g.events.at(-1)?.id;
  useEffect(() => {
    const e = g.events.at(-1);
    if (
      e &&
      ["MERGE", "AUGMENT_CHOSEN", "SKILL_CAST", "COIN"].includes(e.type)
    ) {
      setEffect(e.text);
      const t = setTimeout(
        () => setEffect(""),
        settings.motion === "minimal" ? 1600 : 2400,
      );
      return () => clearTimeout(t);
    }
  }, [eventId]);
  useEffect(() => {
    setAct([1, 5, 11].includes(g.round) ? g.round : 0);
    if (![1, 5, 11].includes(g.round)) return;
    const t = setTimeout(() => setAct(0), settings.motion === "minimal" ? 1600 : 2400);
    return () => clearTimeout(t);
  }, [g.round]);
  async function place() {
    if (cell === null || !myTurn || me.placed) return;
    const r = await action({ type: "place", cell, uid: unit });
    if (r) {
      setCell(null);
      setUnit(undefined);
    }
  }
  async function useSkill() {
    if (source === null) return;
    const r = await action({
      type: "skill",
      source,
      target: target ?? undefined,
      destination: destination ?? undefined,
    });
    if (r) reset();
  }
  function tap(c: number) {
    if (shieldMode) {
      void action({ type: "shield", cell: c }).then((r) => r && reset());
      return;
    }
    if (skill) {
      if (target === null) {
        setTarget(c);
        return;
      }
      if (["push", "swap"].includes(sourceHero?.op || "")) {
        setDestination(c);
        return;
      }
      setTarget(c);
      return;
    }
    const s = g.board[c];
    if (s) {
      setSource(c);
      setCell(null);
      return;
    }
    if (myTurn && !me.placed) {
      setSource(null);
      setCell(c);
      if (settings.oneTap)
        void action({ type: "place", cell: c, uid: unit }).then(
          (r) => r && setUnit(undefined),
        );
    }
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.repeat || busy || document.querySelector(".modal-backdrop")) return;
      if (
        e.target instanceof HTMLElement &&
        /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
      )
        return;
      const k = e.key.toLowerCase();
      if (k === "escape") reset();
      if (k === " ") {
        e.preventDefault();
        if (skill) void useSkill();
        else if (cell !== null) void place();
        else if (myTurn && me.placed) void action({ type: "end" });
      }
      if (g.phase === "prep") {
        if (k === "d") void action({ type: "reroll" });
        if (k === "f") void action({ type: "xp" });
        if (/^[1-5]$/.test(k))
          void action({ type: "buy", slot: Number(k) - 1 });
      }
      if ((k === "q" || k === "w") && sourceHero?.type === "active" && myTurn)
        setSkill(true);
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const selectedUnit = me.bench?.find((u) => u.uid === unit),
    previewHero = selectedUnit?.hero || "plain";
  const needTwo = ["push", "swap"].includes(sourceHero?.op || "");
  const skillHint = !sourceHero
    ? ""
    : ["shieldAll", "stealMana", "freeze"].includes(sourceHero.op)
      ? "대상 없이 즉시 시전할 수 있습니다."
      : sourceHero.op === "swap"
        ? target === null
          ? "교환할 아군 돌을 선택하세요."
          : "교환할 상대 돌을 선택하세요."
        : sourceHero.op === "push"
          ? target === null
            ? "밀어낼 상대 돌을 선택하세요."
            : "인접한 빈 도착 칸을 선택하세요."
          : sourceHero.op === "token" || sourceHero.op === "extra"
            ? "소환·추가 착수할 빈 칸을 선택하세요."
            : sourceHero.op === "storm"
              ? "폭풍의 중심 칸을 선택하세요."
              : "상대 돌을 선택하세요.";
  const targetRequired =
    sourceHero && !["shieldAll", "stealMana", "freeze"].includes(sourceHero.op);
  const skillReady =
    source !== null &&
    (!targetRequired || target !== null) &&
    (!needTwo || destination !== null);
  return (
    <div
      className={`match page-width phase-${g.phase} ${resultHidden ? "result-board-open" : ""} ${remaining <= 5 && g.phase !== "result" ? "time-critical" : ""}`}
    >
      <div className="match-top">
        <div>
          <p className="eyebrow">
            {g.round <= 4
              ? "ACT I · 서막"
              : g.round <= 10
                ? "ACT II · 격돌"
                : "ACT III · 결전"}
          </p>
          <h1>
            제 {g.round} 라운드 <span>{phaseName(g)}</span>
          </h1>
        </div>
        <div className={`phase-clock ${myTurn ? "my-turn" : ""}`} role="timer">
          <span>
            {g.phase === "turn"
              ? myTurn
                ? "당신의 차례"
                : `${other.name}의 차례`
              : phaseName(g)}
          </span>
          <b>{g.phase === "result" ? "終" : `00:${fmt(remaining)}`}</b>
        </div>
        <button className="mobile-details" aria-expanded={drawer} aria-controls="match-build-panel match-info-panel" onClick={() => setDrawer(!drawer)}>
          {drawer ? "패널 닫기" : "대국 정보"}
        </button>
      </div>
      {room.tutorial && g.phase !== "result" && (
        <div className="tutorial-strip">
          <span>✧ 첫 대국 안내</span>
          <p>
            {
              [
                "준비 시간에는 석혼을 구매해 벤치에 모읍니다. 구매하지 않아도 무료 플레인 스톤으로 대국할 수 있어요.",
                "벤치에서 돌을 고르고 빈 교차점을 탭하세요. 미리보기 후 착수 확정을 누르면 됩니다.",
                "석혼을 배치하면 특성이 쌓입니다. 보드의 내 액티브 석혼을 탭해 스킬을 시전해 보세요.",
                "스킬로 만든 새 승부처는 상대의 반응 후 사용할 수 있습니다. 착수 후 턴 마치기를 누르세요.",
                "R3·7·11은 증강, R4·8·12는 공용 제단이 열립니다. 다섯 개의 돌을 이어 승리하세요.",
              ][tip]
            }
          </p>
          <button onClick={() => setTip((tip + 1) % 5)}>다음 안내</button>
        </div>
      )}
      <div className="arena">
        <aside id="match-build-panel" className={`left-panel ${drawer ? "mobile-open" : ""}`}>
          <section className="panel trait-panel">
            <h3>깨어난 특성</h3>
            {(Object.keys(TRAITS) as Trait[]).map((t) => {
              const d = TRAITS[t],
                count = me.traits[t] || 0,
                step = d.steps.filter((n) => count >= n).length;
              return (
                <details key={t} className={`trait ${step ? "on" : ""}`}>
                  <summary>
                    <span className="trait-icon">{d.icon}</span>
                    <b>{d.name}</b>
                    <span>
                      {count}
                      <small>
                        {" "}
                        / {d.steps.find((n) => n > count) || d.steps.at(-1)}
                      </small>
                    </span>
                  </summary>
                  <p>
                    {d.effects.map((text, i) => (
                      <span className={i < step ? "gold" : ""} key={i}>
                        {d.steps[i]} · {text}
                        <br />
                      </span>
                    ))}
                  </p>
                </details>
              );
            })}
          </section>
          <section className="panel augment-slots">
            <h3>선택한 증강</h3>
            {me.augments.length ? (
              me.augments.map((id) => (
                <div key={id} title={AUGMENT[id].description}>
                  <span>{AUGMENT[id].glyph}</span>
                  <p>
                    <b>{AUGMENT[id].name}</b>
                    <small>{AUGMENT[id].description}</small>
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">
                R3 · R7 · R11
                <br />
                별의 힘이 내려옵니다.
              </p>
            )}
          </section>
          <button
            className="quiet surrender"
            onClick={surrender}
            disabled={g.phase === "result"}
          >
            기권하기
          </button>
        </aside>
        <section className="board-column">
          <div className="player-pair">
            <ResourcePlayer p={me} self index={myIndex} active={myTurn} />
            <ResourcePlayer
              p={other}
              self={false}
              index={1 - myIndex}
              active={g.phase === "turn" && !myTurn}
            />
          </div>
          <div
            className={`board-frame tension-${g.tension >= 0.6 ? "high" : g.tension >= 0.3 ? "mid" : "low"}`}
          >
            <div className="board-corner tl" />
            <div className="board-corner br" />
            <div className="board">
              <svg
                className="board-grid"
                viewBox="0 0 1300 1300"
                aria-hidden="true"
              >
                {Array.from({ length: 13 }, (_, i) => (
                  <g key={i}>
                    <path
                      d={`M50 ${50 + i * 100}H1250M${50 + i * 100} 50V1250`}
                    />
                  </g>
                ))}
                {[
                  [3, 3],
                  [9, 3],
                  [6, 6],
                  [3, 9],
                  [9, 9],
                ].map(([x, y]) => (
                  <circle
                    key={x + "," + y}
                    cx={50 + x * 100}
                    cy={50 + y * 100}
                    r="9"
                  />
                ))}
                {Array.from({ length: 13 }, (_, i) => (<g key={"l" + i} className="coord"><text x={50 + i * 100} y={-16} textAnchor="middle">{String.fromCharCode(65 + i)}</text><text x={-16} y={62 + i * 100} textAnchor="end">{13 - i}</text></g>))}{Object.entries(g.threats).flatMap(([id, lines]) =>
                  lines
                    .filter((l) => l.size >= 3 && l.open > 0)
                    .map((l, i) => (
                      <line
                        key={id + "-" + i}
                        className={`threat-line ${id === me.id ? "mine" : "theirs"}`}
                        x1={50 + (l.cells[0] % 13) * 100}
                        y1={50 + Math.floor(l.cells[0] / 13) * 100}
                        x2={50 + (l.cells.at(-1)! % 13) * 100}
                        y2={50 + Math.floor(l.cells.at(-1)! / 13) * 100}
                        style={{ stroke: id === me.id ? "#5ce1e6" : "#ff6b5a" }}
                      />
                    )),
                )}
                {g.winLine.length >= 5 && (
                  <line
                    className="winning-line"
                    x1={50 + (g.winLine[0] % 13) * 100}
                    y1={50 + Math.floor(g.winLine[0] / 13) * 100}
                    x2={50 + (g.winLine.at(-1)! % 13) * 100}
                    y2={50 + Math.floor(g.winLine.at(-1)! / 13) * 100}
                  />
                )}
              </svg>
              <div
                className="intersections"
                role="group"
                aria-label="13×13 오목 보드"
              >
                {g.board.map((s, c) => {
                  const win = g.winningCells[me.id]?.includes(c),
                    threat = g.winningCells[other.id]?.includes(c),
                    selected = cell === c || target === c || destination === c;
                  const expires =
                    s?.sealedUntil && s.sealedUntil > g.ply
                      ? s.sealedUntil - g.ply
                      : 0;
                  return (
                    <button
                      type="button"
                      key={c}
                      className={`intersection ${selected ? "picked" : ""} ${win ? "winning-cell" : ""} ${threat ? "threat-cell" : ""} ${g.barredCells.includes(c) ? "barred" : ""}`}
                      aria-label={`${cellName(c)} ${s ? `${g.players.find((p) => p.id === s.owner)?.name} ${HERO[s.hero]?.name || (s.tokenUntil ? "토큰" : "플레인 스톤")}${expires ? " 봉인 " + expires + "턴" : ""}${s.shield ? " 방패" : ""}` : "빈 칸"}`}
                      aria-pressed={selected}
                      onClick={() => tap(c)}
                      {...longPress(() => { if (s && HERO[s.hero]) setDetail(HERO[s.hero]); })}
                    >
                      {s ? (
                        <StoneView
                          stone={{
                            ...s,
                            sealedUntil: expires,
                            tokenUntil: s.tokenUntil
                              ? Math.max(0, s.tokenUntil - g.ply)
                              : 0,
                          }}
                          side={g.players.findIndex((p) => p.id === s.owner)}
                          last={last?.cell === c} mine={s.owner === me.id}
                        />
                      ) : cell === c ? (
                        <StoneView
                          stone={{
                            hero: previewHero,
                            star: selectedUnit?.star || 1,
                            shield: false,
                            sealedUntil: 0,
                            tokenUntil: 0,
                          }}
                          side={myIndex} mine preview
                        />
                      ) : win || threat ? (
                        <span className="win-marker">◇</span>
                      ) : c === 84 ? (
                        <span className="center-character">天元</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            
            <div className="board-watermark">天元 · THE MOONLIT SANCTUARY</div>
            {effect && (
              <div className="event-cut" key={effect} role="status">
                {effect}
              </div>
            )}
          </div>
          <div className="action-dock">
            {g.phase === "prep" ? (
              <>
                <div>
                  <b>準備 · 전열을 정비하세요</b>
                  <small>
                    상점 구매와 경험치 · 양쪽 준비 완료 시 바로 시작
                  </small>
                </div>
                <button
                  className="primary"
                  disabled={busy || me.ready}
                  onClick={() => void action({ type: "ready" })}
                >
                  {me.ready ? "상대를 기다리는 중" : "정비 완료"}
                </button>
              </>
            ) : g.phase === "turn" ? (
              <>
                {skill ? (
                  <>
                    <div>
                      <b>{sourceHero?.name} · 스킬</b>
                      <small>
                        {skillHint}
                        {target !== null &&
                          ` ${cellName(target)}${destination !== null ? ` · ${cellName(destination)}` : ""}`}
                      </small>
                    </div>
                    <button className="quiet" onClick={reset}>
                      취소
                    </button>
                    <button
                      className="primary"
                      disabled={
                        busy || !myTurn || !skillReady || skillUnavailable
                      }
                      onClick={() => void useSkill()}
                    >
                      스킬 확정
                    </button>
                  </>
                ) : shieldMode ? (
                  <>
                    <p>방패를 부착할 아군 돌을 선택하세요.</p>
                    <button onClick={reset}>취소</button>
                  </>
                ) : sourceStone ? (
                  <>
                    <div>
                      <b>
                        {HERO[sourceStone.hero]?.name || "플레인 스톤"}{" "}
                        {sourceStone.shield ? "◇ 방패" : ""}
                      </b>
                      <small>
                        {sourceHero?.description || "무료 기본 돌 · 스킬 없음"}
                        {sourceStone.cooldown
                          ? ` · 쿨다운 ${sourceStone.cooldown}`
                          : ""}
                      </small>
                    </div>
                    {sourceHero && (
                      <button
                        className="quiet"
                        onClick={() => setDetail(sourceHero)}
                      >
                        상세
                      </button>
                    )}
                    {sourceHero?.type === "active" &&
                      sourceStone.owner === me.id && (
                        <button
                          className="primary"
                          disabled={
                            busy ||
                            !myTurn ||
                            me.skills >=
                              (me.augments.includes("chain") ? 2 : 1) ||
                            me.frozenUntil >= g.ply ||
                            skillUnavailable
                          }
                          onClick={() => {
                            setSkill(true);
                            setTarget(null);
                            setDestination(null);
                          }}
                        >
                          스킬 · {skillMana}✧
                        </button>
                      )}
                    <button className="quiet" onClick={reset}>
                      닫기
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <b>
                        {myTurn
                          ? me.placed
                            ? "한 수를 놓았습니다"
                            : cell !== null
                              ? `${cellName(cell)} · ${HERO[previewHero]?.name || "플레인 스톤"}`
                              : selectedUnit
                                ? `${HERO[selectedUnit.hero].name} · 놓을 칸 선택`
                                : "당신의 한 수를 기다립니다"
                          : `${other.name}의 수를 읽어보세요`}
                      </b>
                      <small>
                        {myTurn
                          ? me.placed
                            ? "스킬을 사용하거나 턴을 마치세요."
                            : "빈 교차점을 선택하고 착수를 확정하세요."
                          : "상대의 마나와 공개된 특성을 확인할 수 있습니다."}
                      </small>
                    </div>
                    {myTurn && me.shields > 0 && !me.shieldUsed && (
                      <button onClick={() => setShieldMode(true)}>
                        방패 {me.shields}
                      </button>
                    )}
                    <button
                      className="primary"
                      disabled={
                        busy || !myTurn || (!me.placed && cell === null)
                      }
                      onClick={() =>
                        me.placed ? void action({ type: "end" }) : void place()
                      }
                    >
                      {me.placed ? "턴 마치기" : "착수 확정"}
                    </button>
                  </>
                )}
              </>
            ) : (
              <p className="center gold">
                {g.phase === "augment"
                  ? "별의 힘을 선택하세요."
                  : g.phase === "altar"
                    ? "운명의 제단에서 석혼을 선택하세요."
                    : "이야기가 완성되었습니다."}
              </p>
            )}
          </div>
          <section className="bench-section">
            <div className="section-heading">
              <h3>
                나의 벤치 <small>{me.benchCount} / 9</small>
              </h3>
              <span className="muted">동일 석혼 3개 → 자동 합성</span>
            </div>
            <div className="bench">
              <button
                className={`plain-select ${!unit ? "selected" : ""}`}
                onClick={() => {
                  setUnit(undefined);
                  reset();
                }}
              >
                <span className={`plain-stone side-${myIndex}`} />
                <b>기본 돌</b>
                <small>무료 · 무제한</small>
              </button>
              {Array.from({ length: 9 }, (_, i) => {
                const u = me.bench?.[i];
                return u ? (
                  <div
                    key={u.uid}
                    className={`bench-unit ${unit === u.uid ? "selected" : ""}`}
                  >
                    <button
                      className={`bench-main cost-${HERO[u.hero].cost}`}
                      onClick={() => {
                        setUnit(unit === u.uid ? undefined : u.uid);
                        reset();
                      }}
                      title={HERO[u.hero].description} {...longPress(() => setDetail(HERO[u.hero]))} >
                      <span>{HERO[u.hero].glyph}</span>
                      <b>{HERO[u.hero].name}</b>
                      <small>{"★".repeat(u.star)}</small>
                    </button>
                    {g.phase === "prep" && (
                      <button
                        className="sell-button"
                        disabled={busy}
                        aria-label={`${HERO[u.hero].name} 판매`}
                        onClick={() =>
                          void action({ type: "sell", uid: u.uid })
                        }
                      >
                        판매 {u.paid}G
                      </button>
                    )}
                  </div>
                ) : (
                  <div key={i} className="bench-empty">
                    ·
                  </div>
                );
              })}
            </div>
          </section>
          <section
            className={`shop-section panel ${g.phase !== "prep" ? "shop-closed" : ""}`}
          >
            <div className="section-heading">
              <div>
                <h3>
                  석혼 상점 <small>Lv.{me.level}</small>
                </h3>
                <p className="shop-odds">
                  {ODDS[me.level].map((n, i) => (
                    <span key={i} className={`cost-text-${i + 1}`}>
                      {i + 1}코 {n}%
                    </span>
                  ))}
                </p>
              </div>
              <div className="shop-actions">
                <button
                  disabled={
                    busy || g.phase !== "prep" || me.level >= 8 || me.gold < 4
                  }
                  onClick={() => void action({ type: "xp" })}
                >
                  경험치 +4 <small>4G · F</small>
                </button>
                <button
                  disabled={
                    busy ||
                    g.phase !== "prep" ||
                    me.gold <
                      (me.goldenUntil >= g.round
                        ? 0
                        : Math.max(
                            0,
                            2 -
                              Number((me.traits.merchant || 0) >= 3) -
                              Number(
                                g.board.some(
                                  (s) =>
                                    s?.owner === me.id &&
                                    s.hero === "dealer" &&
                                    s.sealedUntil <= g.ply,
                                ) && me.roundRerolls === 0,
                              ),
                          ))
                  }
                  onClick={() => void action({ type: "reroll" })}
                >
                  새로고침{" "}
                  <small>
                    {me.goldenUntil >= g.round
                      ? "무료"
                      : `${Math.max(0, 2 - Number((me.traits.merchant || 0) >= 3) - Number(g.board.some((s) => s?.owner === me.id && s.hero === "dealer" && s.sealedUntil <= g.ply) && me.roundRerolls === 0))}G`}{" "}
                    · D
                  </small>
                </button>
              </div>
            </div>
            <div className="xp-track">
              <i
                style={{
                  width:
                    me.level >= 8
                      ? "100%"
                      : `${Math.min(100, ((me.xp - XP[me.level]) / (XP[me.level + 1] - XP[me.level])) * 100)}%`,
                }}
              />
              <span>
                {me.level >= 8
                  ? "MAX LEVEL"
                  : `${me.xp - XP[me.level]} / ${XP[me.level + 1] - XP[me.level]} XP`}
              </span>
            </div>
            <div className="shop-cards">
              {me.shop?.map((id, i) =>
                id ? (
                  <HeroCard
                    key={i + "-" + id}
                    hero={HERO[id]}
                    disabled={
                      busy || g.phase !== "prep" || me.gold < HERO[id].cost
                    }
                    onClick={() => void action({ type: "buy", slot: i })}
                    onDetail={() => setDetail(HERO[id])}
                  />
                ) : (
                  <div key={i} className="sold-card">
                    入手<small>구매 완료</small>
                  </div>
                ),
              )}
            </div>
            {g.phase !== "prep" && (
              <p className="shop-status">상점은 다음 준비 시간에 열립니다.</p>
            )}
          </section>
        </section>
        <aside id="match-info-panel" className={`right-panel ${drawer ? "mobile-open" : ""}`}>
          <section className="panel opponent-panel">
            <h3>상대의 전략</h3>
            <p className="muted">
              벤치 {other.benchCount}/9 · 시간 초과 {other.timeouts}/3
            </p>
            <div className="opponent-traits">
              {(Object.entries(other.traits) as [Trait, number][]).map(
                ([t, n]) => (
                  <span key={t} title={TRAITS[t].effects.join(" / ")}>
                    {TRAITS[t].icon} {TRAITS[t].name} <b>{n}</b>
                  </span>
                ),
              )}
            </div>
            {other.augments.map((id) => (
              <p key={id} title={AUGMENT[id].description}>
                {AUGMENT[id].glyph} {AUGMENT[id].name}
              </p>
            ))}
            {room.seats.some((s) => !s.connected) && (
              <p className="coral">
                상대가 재접속 중입니다. 타이머는 계속 진행됩니다.
              </p>
            )}
            <div className="tension-meter">
              <span>
                판 위의 긴장{" "}
                <b>
                  {g.tension >= 0.6
                    ? "임계"
                    : g.tension >= 0.3
                      ? "긴장"
                      : "고요"}
                </b>
              </span>
              <div>
                <i style={{ width: `${g.tension * 100}%` }} />
              </div>
            </div>
          </section>
          <Chat room={room} request={request} />
        </aside>
      </div>
      {g.phase === "augment" && (
        <div className="choice-backdrop">
          <section
            className="choice-panel"
            role="dialog"
            aria-modal="true"
            aria-label="증강 선택"
          >
            <p className="eyebrow gold">
              {g.round === 3 ? "실버" : g.round === 7 ? "골드" : "프리즘"} 증강
            </p>
            <h2>어떤 별을 따르겠습니까?</h2>
            <p className="muted">
              {me.choices?.length
                ? "선택한 증강은 상대에게 공개됩니다."
                : "상대의 별이 정해지기를 기다리는 중입니다."}{" "}
              · {remaining}초
            </p>
            <div className="augment-choices">
              {me.choices?.map((id) => {
                const a = AUGMENT[id];
                return (
                  <button
                    key={id}
                    className={`augment-card tier-${a.tier}`}
                    disabled={busy}
                    onClick={() =>
                      void action({
                        type: "augment",
                        id,
                        uid: augmentUnit || undefined,
                        trait: emblem || undefined,
                      })
                    }
                  >
                    <span>{a.glyph}</span>
                    <small>
                      {a.category} · {["", "실버", "골드", "프리즘"][a.tier]}
                    </small>
                    <h3>{a.name}</h3>
                    <p>{a.description}</p>
                    <b>이 별 선택</b>
                  </button>
                );
              })}
            </div>
            {!!me.choices?.length && (
              <>
                <div className="augment-options">
                  <label>
                    승급 대상
                    <select
                      value={augmentUnit}
                      onChange={(e) => setAugmentUnit(e.target.value)}
                    >
                      <option value="">자동 선택</option>
                      {me.bench?.map((u) => (
                        <option key={u.uid} value={u.uid}>
                          {HERO[u.hero].name} {"★".repeat(u.star)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    인장 특성
                    <select
                      value={emblem}
                      onChange={(e) => setEmblem(e.target.value as Trait)}
                    >
                      <option value="">자동 선택</option>
                      {(Object.keys(me.traits) as Trait[]).map((t) => (
                        <option key={t} value={t}>
                          {TRAITS[t].name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  disabled={busy || me.augmentRerolls <= 0}
                  onClick={() => void action({ type: "augmentReroll" })}
                >
                  별 다시 보기 · {me.augmentRerolls}회
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {g.phase === "altar" && (
        <div className="choice-backdrop">
          <section
            className="choice-panel"
            role="dialog"
            aria-modal="true"
            aria-label="운명의 제단"
          >
            <h2>운명은 뒤진 자에게 먼저 손을 내민다.</h2>
            <p className="muted">
              {g.players.find((p) => p.id === g.altarOrder[g.altarStep])?.name}
              의 선택 · {g.altarStep + 1}/4 · {remaining}초
            </p>
            <div className="altar-order">
              {g.altarOrder.map((id, i) => (
                <span key={i} className={i === g.altarStep ? "gold" : ""}>
                  {g.players.find((p) => p.id === id)?.name}
                  {i < g.altarStep ? " ✓" : ""}
                </span>
              ))}
            </div>
            <div className="altar-cards">
              {g.altar.map((id, i) =>
                id ? (
                  <HeroCard
                    key={i}
                    hero={HERO[id]}
                    onClick={() => void action({ type: "altar", slot: i })}
                    onDetail={() => setDetail(HERO[id])}
                    disabled={busy || g.altarOrder[g.altarStep] !== me.id}
                  />
                ) : (
                  <div className="sold-card" key={i}>
                    선택 완료
                  </div>
                ),
              )}
            </div>
            <p className="muted">
              획득 비용 0G · 공유 풀에서 가져옵니다 · 벤치가 가득 차면 선택을
              건너뜁니다.
            </p>
          </section>
        </div>
      )}
      {g.phase === "result" && resultHidden && (<div className="result-bar" role="status"><b>{!g.winner ? "무승부" : g.winner === me.id ? "승리" : "패배"}</b><span>{g.reason}</span><button className="primary" onClick={() => setResultHidden(false)}>결과 보기</button></div>)}
      {g.phase === "result" && !resultHidden && ( <div className="result-overlay">
          <section
            className="result-panel"
            role="dialog"
            aria-modal="true"
            aria-label="대국 결과"
          >
            <span className="result-calligraphy">
              {!g.winner ? "和" : g.winner === me.id ? "勝" : "敗"}
            </span>
            <h2>
              {!g.winner
                ? "고요한 무승부"
                : g.winner === me.id
                  ? "당신의 수가 운명이 되었습니다."
                  : "다음 한 수를 위한 이야기."}
            </h2>
            <p>{g.reason}</p><button className="quiet" onClick={() => setResultHidden(true)}>판 위의 마지막 한 수 보기</button>
            <div className="result-stats">
              <span>
                <b>{g.round}</b>라운드
              </span>
              <span>
                <b>{g.history.length}</b>착수
              </span>
              <span>
                <b>{g.players.reduce((n, p) => n + p.casts, 0)}</b>스킬 시전
              </span>
            </div>
            <div className="highlights">
              {[
                g.history[0],
                g.history[Math.floor(g.history.length / 2)],
                g.history.at(-1),
              ]
                .filter((m): m is NonNullable<typeof m> => !!m)
                .map((m, i) => (
                  <div key={i}>
                    <small>
                      {["첫 장면", "격돌의 장면", "마지막 한 수"][i]}
                    </small>
                    <b>{cellName(m.cell)}</b>
                    <span>
                      {g.players.find((p) => p.id === m.player)?.name} ·{" "}
                      {HERO[m.hero]?.name || "기본 돌"}
                    </span>
                  </div>
                ))}
            </div>
            <button
              className="primary"
              disabled={busy || room.host !== me.id}
              onClick={() => void request("room:rematch")}
            >
              {room.host === me.id
                ? "대기실에서 다시 만나기"
                : "방장의 재대국을 기다리는 중"}
            </button>
            <details className="replay">
              <summary>한 수씩 복기하기</summary>
              <Replay game={g} />
            </details>
          </section>
        </div>
      )}
      {act > 0 && (() => { const a = ({ 1: ["제1막", "서막", "序"], 5: ["제2막", "격돌", "激"], 11: ["제3막", "결전", "決"] } as Record<number, string[]>)[act]; return (<div className="act-card" role="status"><small>{a[0]}</small><b>{a[2]}</b><h2>{a[1]}</h2></div>); })()}
      {detail && (
        <div
          className="modal-backdrop detail-backdrop"
          onClick={() => setDetail(null)}
        >
          <section
            className="modal compact hero-detail"
            role="dialog"
            aria-modal="true"
            aria-label="석혼 상세"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-detail icon-button"
              onClick={() => setDetail(null)}
              aria-label="닫기"
            >
              ×
            </button>
            <span className={`detail-glyph cost-text-${detail.cost}`}>
              {detail.glyph}
            </span>
            <p className="eyebrow">
              {detail.cost}코 ·{" "}
              {detail.type === "active"
                ? "액티브"
                : detail.type === "deploy"
                  ? "배치 효과"
                  : "패시브"}
            </p>
            <h2>{detail.name}</h2>
            <p className="gold">
              {detail.traits.map((t) => TRAITS[t].name).join(" · ")}
            </p>
            <p>{detail.description}</p>
            {detail.type === "active" && (
              <p className="muted">
                기본 마나 {detail.mana} · 쿨다운{" "}
                {detail.cooldown || "횟수 제한"}
              </p>
            )}
            <p className="muted">★2 수치 ×1.5 (올림) · ★3 범위/대상 확장</p>
          </section>
        </div>
      )}
    </div>
  );
}
function Replay({ game }: { game: GameView }) {
  const [step, setStep] = useState(game.frames.length);
  const board: (Stone | null)[] = Array(169).fill(null);
  for (const frame of game.frames.slice(0, step))
    for (const change of frame.changes) board[change.cell] = change.stone;
  const frame = game.frames[step - 1];
  function download() {
    const payload = {
      title: "천원 · 대국 기록",
      version: 1,
      players: game.players.map((p) => ({ id: p.id, name: p.name })),
      frames: game.frames,
      winner: game.winner,
      reason: game.reason,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "cheonwon-replay.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="replay-view">
      <input
        type="range"
        min={0}
        max={game.frames.length}
        value={step}
        aria-label="복기 장면 번호"
        onChange={(e) => setStep(Number(e.target.value))}
      />
      <p>
        {step} / {game.frames.length} 장면 ·{" "}
        {frame
          ? `R${frame.round} ${game.players.find((p) => p.id === frame.actor)?.name} ${frame.label}`
          : "첫 수 이전"}
      </p>
      <div className="replay-board" aria-label="복기 보드">
        {board.map((s, c) => (
          <span key={c}>
            {s && (
              <i
                className={`replay-stone side-${game.players.findIndex((p) => p.id === s.owner)} ${s.sealedUntil > (frame?.ply || 0) ? "replay-sealed" : ""}`}
                title={`${cellName(c)} · ${HERO[s.hero]?.name || "기본 돌"}`}
              >
                {HERO[s.hero]?.glyph || (s.tokenUntil ? "✧" : "")}
              </i>
            )}
          </span>
        ))}
      </div>
      <div className="replay-controls">
        <button
          disabled={step === 0}
          onClick={() => setStep(Math.max(0, step - 1))}
        >
          이전 장면
        </button>
        <button
          disabled={step === game.frames.length}
          onClick={() => setStep(Math.min(game.frames.length, step + 1))}
        >
          다음 장면
        </button>
        <button onClick={download}>기록 저장</button>
      </div>
      <small>착수·스킬·봉인·소멸을 포함한 실제 보드 상태를 복기합니다.</small>
    </div>
  );
}
function Rules() {
  return (
    <div className="rules">
      <p>
        13×13 기반에서 가로·세로·대각선으로 <strong>5개 이상</strong>을 이으면
        승리합니다. 장목을 허용하고 금수는 없습니다.
      </p>
      <ol>
        <li>
          <b>준비 20초</b> · 상점의 석혼을 구매하거나 4G로 4XP를 얻습니다.
          리롤은 기본 2G, 벤치는 9칸입니다. 동일한 ★1 석혼 3개는 ★2로 자동
          합성됩니다.
        </li>
        <li>
          <b>선공 30초 → 후공 30초</b> · 벤치 석혼 또는 무료 기본 돌 하나를
          놓습니다. 액티브 스킬은 턴당 1회 선택입니다. 착수 후 턴 마치기를
          눌러주세요.
        </li>
        <li>
          <b>스킬과 예고</b> · 보드의 아군 액티브 석혼을 탭해 스킬을 누르고
          대상을 선택합니다. 스킬로 열린 새 승부처는 상대가 반응한 다음 턴부터
          사용할 수 있습니다. 직접 만든 5목도 상대 반응 후 유지되어야
          승리합니다.
        </li>
        <li>
          <b>보호와 반응</b> · 방금 둔 돌은 다음 상대 턴까지 스킬로 건드릴 수
          없습니다. 승부처를 토큰이나 밀기로 막을 수 없으며, 추가 착수는 5목을
          완성할 수 없습니다.
        </li>
        <li>
          <b>경제와 성장</b> · 시작 골드 5, 후공 +3G / +2마나. 매 라운드 +5G,
          10G당 이자 +1(최대 +5), 자동 +2XP. 턴 종료 마나 +2, 최대 레벨+2입니다.
        </li>
        <li>
          <b>이야기의 사건</b> · R3·7·11 증강, R4·8·12 공용 제단. 같은 고유
          석혼의 특성은 한 번만 셉니다. 5코는 합성하지 않습니다.
        </li>
        <li>
          <b>시간 초과</b> · 위험한 칸을 막는 대리 착수를 진행하며, 누적 3회면
          기권입니다. 연결이 끊겨도 시간은 흐르고 같은 브라우저에서 좌석을
          복구할 수 있습니다.
        </li>
      </ol>
      <p className="muted">
        키보드: 1~5 구매 · D 리롤 · F 경험치 · Space 확정/턴 종료 · Q/W 선택한
        석혼 스킬 · Esc 취소
      </p>
    </div>
  );
}
function SettingsPanel({
  value,
  change,
}: {
  value: Settings;
  change: (s: Settings) => void;
}) {
  const update = (s: Partial<Settings>) => change({ ...value, ...s });
  return (
    <div className="settings">
      <label>
        연출 강도
        <select
          value={value.motion}
          onChange={(e) =>
            update({ motion: e.target.value as Settings["motion"] })
          }
        >
          <option value="cinematic">시네마틱</option>
          <option value="standard">표준</option>
          <option value="minimal">최소</option>
        </select>
      </label>
      <label className="switch">
        한 번 탭으로 착수
        <input
          type="checkbox"
          checked={value.oneTap}
          onChange={(e) => update({ oneTap: e.target.checked })}
        />
      </label>
      <label className="switch">
        색약 보조 · 진영 패턴 강화
        <input
          type="checkbox"
          checked={value.colorblind}
          onChange={(e) => update({ colorblind: e.target.checked })}
        />
      </label>
      <label>
        효과음 볼륨 <span>{Math.round(value.effects * 100)}%</span>
        <input
          type="range"
          min="0"
          max="1"
          step=".05"
          value={value.effects}
          onChange={(e) => {
            update({ effects: Number(e.target.value) });
            playTone("PLACE_STONE", Number(e.target.value));
          }}
        />
      </label>
      <label>
        배경음 볼륨 <span>{Math.round(value.music * 100)}%</span>
        <input
          type="range"
          min="0"
          max="1"
          step=".05"
          value={value.music}
          onChange={(e) => update({ music: Number(e.target.value) })}
        />
      </label>
      <label className="switch">
        착수 햅틱 (지원 기기)
        <input
          type="checkbox"
          checked={value.haptics}
          onChange={(e) => update({ haptics: e.target.checked })}
        />
      </label>
      <p className="muted">
        기기별로 저장됩니다. 처음 실행할 때 운영체제의 모션 감소 설정을
        반영합니다.
      </p>
    </div>
  );
}
function Codex() {
  const [cost, setCost] = useState(0);
  return (
    <>
      <div className="filter-row">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button
            className={cost === n ? "active" : ""}
            key={n}
            onClick={() => setCost(n)}
          >
            {n ? `${n}코` : "전체 24종"}
          </button>
        ))}
      </div>
      <div className="codex-grid">
        {HEROES.filter((h) => !cost || h.cost === cost).map((h) => (
          <article className={`codex-card cost-${h.cost}`} key={h.id}>
            <span className="hero-glyph">{h.glyph}</span>
            <div>
              <small>
                {h.cost}G · {h.traits.map((t) => TRAITS[t].name).join(" · ")}
              </small>
              <h3>{h.name}</h3>
              <p>{h.description}</p>
              <small>
                {h.type === "active"
                  ? `액티브 · ${h.mana} 마나 · 쿨다운 ${h.cooldown || "횟수 제한"}`
                  : h.type === "deploy"
                    ? "배치 시 발동"
                    : "패시브"}
              </small>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
