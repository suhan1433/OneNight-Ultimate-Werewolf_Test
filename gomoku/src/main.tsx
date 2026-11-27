import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import type { RoomView } from "./types";
import "./styles.css";
import { HomeScreen } from "./components/HomeScreen";
import { WaitingRoom } from "./components/WaitingRoom";
import { MatchScreen } from "./components/MatchScreen";
import { Modal } from "./components/Modal";
import { GameHeader } from "./components/GameHeader";
import { useViewport } from "./viewport";
import { copyText } from "./clipboard";
import {
  finishSound,
  setSoundEnabled,
  stoneSound,
  unlockSound,
} from "./feedback";
const socket = io({ path: "/api/gomoku/socket", autoConnect: false });
interface Session {
  code: string;
  token: string;
  playerId: string;
}
function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function App() {
  useViewport();
  const [room, setRoom] = useState<RoomView | null>(null),
    [connected, setConnected] = useState(false);
  const session = useRef(read<Session | null>("gomoku-session", null));
  const [restoring, setRestoring] = useState(!!session.current),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const resuming = useRef(!!session.current);
  const [name, setName] = useState(read("gomoku-name", "대국자")),
    [code, setCode] = useState(() =>
      (new URLSearchParams(location.search).get("room") || "")
        .trim()
        .toUpperCase(),
    );
  const [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [rules, setRules] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sound, setSound] = useState(read("gomoku-sound", true));
  const [pendingCell, setPendingCell] = useState<number | null>(null);
  const [freshCell, setFreshCell] = useState<number | null>(null);
  const previousRoom = useRef<RoomView | null>(null);
  useEffect(() => {
    setSoundEnabled(sound);
    save("gomoku-sound", sound);
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [sound]);
  const request = useCallback(async (event: string, data: object = {}) => {
    if (pending.current || !socket.connected) return null;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await socket.timeout(7000).emitWithAck(event, data);
      if (!result.ok) throw Error(result.error);
      return result;
    } catch (e) {
      const action = data as { type?: string; cell?: number };
      const state = previousRoom.current;
      if (
        event === "game:action" &&
        action.type === "place" &&
        action.cell !== undefined &&
        state?.game &&
        state.game.board[action.cell] === state.self
      )
        return { ok: true };
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);
  const place = useCallback(
    async (cell: number) => {
      const current = previousRoom.current;
      if (
        pending.current ||
        !socket.connected ||
        current?.game?.phase !== "turn" ||
        current.game.turn !== current.self ||
        current.game.board[cell]
      )
        return;
      setPendingCell(cell);
      try {
        await request("game:action", { type: "place", cell });
      } finally {
        setPendingCell(null);
      }
    },
    [request],
  );
  useEffect(() => {
    async function connect() {
      setConnected(true);
      if (session.current) {
        resuming.current = true;
        setRestoring(true);
        try {
          const result = await socket
            .timeout(7000)
            .emitWithAck("session:resume", session.current);
          if (!result.ok) {
            session.current = null;
            save("gomoku-session", null);
            setRoom(null);
            previousRoom.current = null;
            setPendingCell(null);
            setError(result.error);
          }
        } catch {
          setError("대국을 복구하지 못했습니다. 다시 연결해 주세요.");
          socket.disconnect().connect();
        } finally {
          resuming.current = false;
          setRestoring(false);
        }
      } else setRestoring(false);
    }
    function receiveState(next: RoomView) {
      const prev = previousRoom.current;
      const sameGame =
        prev?.code === next.code &&
        prev.game?.players[0].id === next.game?.players[0].id;
      if (
        !resuming.current &&
        sameGame &&
        prev?.game &&
        next.game &&
        next.game.ply === prev.game.ply + 1 &&
        next.game.lastCell !== null &&
        !prev.game.board[next.game.lastCell]
      ) {
        setFreshCell(next.game.lastCell);
        stoneSound(
          next.game.board[next.game.lastCell] === next.game.players[0].id,
        );
      } else if (
        resuming.current ||
        !sameGame ||
        !next.game ||
        next.game.ply === 0
      )
        setFreshCell(null);
      if (
        !resuming.current &&
        sameGame &&
        prev?.game?.phase === "turn" &&
        next.game?.phase === "result"
      )
        finishSound(next.game.winner === next.self);
      previousRoom.current = next;
      setRoom(next);
    }
    function disconnect() {
      setConnected(false);
    }
    function replaced() {
      session.current = null;
      save("gomoku-session", null);
      setRoom(null);
      previousRoom.current = null;
      setPendingCell(null);
      setRestoring(false);
      setError(
        "다른 탭에서 이 대국에 접속했습니다. 해당 탭에서 계속해 주세요.",
      );
    }
    socket
      .on("connect", connect)
      .on("disconnect", disconnect)
      .on("state", receiveState)
      .on("replaced", replaced);
    socket.on("connect_error", disconnect);
    socket.connect();
    return () => {
      socket
        .off("connect", connect)
        .off("disconnect", disconnect)
        .off("state", receiveState)
        .off("replaced", replaced)
        .off("connect_error", disconnect);
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    setCopied(false);
  }, [room?.code]);
  useEffect(() => {
    // A phone may be scrolled to the start form; enter each new table at its top.
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [room?.code, room?.game?.players[0]?.id]);
  async function enter(event: string, bot = false) {
    const result = await request(event, {
      name: name.trim() || "대국자",
      code,
      bot,
    });
    if (result) {
      session.current = {
        code: result.code,
        token: result.token,
        playerId: result.playerId,
      };
      save("gomoku-session", session.current);
      save("gomoku-name", name.trim() || "대국자");
      history.replaceState(null, "", location.pathname);
    }
  }
  async function leave() {
    if (await request("room:leave")) {
      session.current = null;
      save("gomoku-session", null);
      setRoom(null);
      previousRoom.current = null;
      setFreshCell(null);
      setConfirmLeave(false);
      setPendingCell(null);
      setError("");
    }
  }
  function requestLeave() {
    if (room?.game?.phase === "turn" && !room.seats.some((s) => s.bot))
      setConfirmLeave(true);
    else void leave();
  }
  async function invite() {
    setCopied(false);
    setError("");
    try {
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set("room", room!.code);
      await copyText(url.href);
      setCopied(true);
    } catch {
      setError(
        "초대 링크를 복사하지 못했습니다. 표시된 방 코드를 상대에게 알려 주세요.",
      );
    }
  }
  const game = room?.game;
  const canPlay =
    connected &&
    !busy &&
    !restoring &&
    game?.phase === "turn" &&
    game.turn === room?.self;
  return (
    <main className={`app ${game ? "in-game" : "at-home"}`}>
      <GameHeader
        inRoom={!!room}
        sound={sound}
        disabled={busy || !connected}
        onExit={() => (room ? requestLeave() : location.assign("/"))}
        onRules={() => setRules(true)}
        onSound={() => {
          setSound(!sound);
          setSoundEnabled(!sound);
          if (!sound) unlockSound();
        }}
      />
      <div className="notices">
        {!connected && (
          <div className="connection" role="status">
            서버에 연결 중입니다…{" "}
            <button onClick={() => socket.connect()}>다시 연결</button>
          </div>
        )}
        {restoring && connected && (
          <p className="connection" role="status">
            이전 대국을 불러오는 중입니다…
          </p>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            <button aria-label="알림 닫기" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
      </div>
      {!room ? (
        <HomeScreen
          name={name}
          code={code}
          connected={connected}
          busy={busy}
          restoring={restoring}
          setName={setName}
          setCode={setCode}
          enter={enter}
        />
      ) : !game ? (
        <WaitingRoom
          code={room.code}
          copied={copied}
          busy={busy}
          connected={connected}
          invite={invite}
        />
      ) : (
        <MatchScreen
          room={room}
          connected={connected}
          busy={busy}
          canPlay={!!canPlay}
          freshCell={freshCell}
          pendingCell={pendingCell}
          place={place}
          leave={() => leave()}
          rematch={() => request("room:rematch")}
        />
      )}
      {rules && (
        <Modal
          id="rules-title"
          title="오목 게임 방법"
          onClose={() => setRules(false)}
        >
          <ol className="rules-list">
            <li>흑부터 번갈아 빈자리를 한 번 눌러 둡니다.</li>
            <li>
              가로·세로·대각선으로 다섯 돌 이상 이으면 승리합니다. 금수는
              없습니다.
            </li>
            <li>재대국은 서로 동의하면 시작하고 흑백을 바꿉니다.</li>
          </ol>
          <button className="primary" autoFocus onClick={() => setRules(false)}>
            닫기
          </button>
        </Modal>
      )}
      {confirmLeave && (
        <Modal
          id="leave-title"
          title="대국을 나갈까요?"
          onClose={() => setConfirmLeave(false)}
        >
          <p>친구와 진행 중인 대국을 나가면 기권패로 처리됩니다.</p>
          <button
            className="primary"
            autoFocus
            onClick={() => setConfirmLeave(false)}
          >
            계속 두기
          </button>
          <button disabled={busy || !connected} onClick={leave}>
            기권하고 나가기
          </button>
        </Modal>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/gomoku/sw.js").catch(() => {});
