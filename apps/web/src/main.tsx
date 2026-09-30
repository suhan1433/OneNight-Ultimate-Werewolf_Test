import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  NIGHT_ROLES,
  PRESETS,
  ROLE_DEFINITIONS,
  ROLE_LIST,
  type ClientGameState,
  type NightCommand,
  type PrivateNightAction,
  type RoleType,
} from "@werewolf/shared";
import { useGame } from "./store";
import {
  emitAck,
  requestId,
  saveSession,
  session,
  setNarrationEnabled,
  socket,
  recoverExpiredAction,
  syncRoom,
} from "./socket";
import "./styles.css";
import "./leave.css";
import "./night-results.css";
import "./night-intro.css";
import "./immersion.css";
import "./polish.css";
import "./day-vote.css";
import "./entry.css";
import { Candle, CheckIcon, CopyIcon, CrownIcon, HeroScene, Icon, IconDefs, MaskAvatar, RoleIcon, Sigil, SunArc, WaxSeal } from "./icons";

const req = (game: ClientGameState) => ({
  roomCode: game.roomCode,
  requestId: requestId(),
});
const event = async (name: string, data: unknown) => {
  try {
    return await emitAck(name, data);
  } catch (e) {
    useGame
      .getState()
      .setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
  }
};
const optimistic = (apply: () => void, name: string, data: unknown) => {
  const previous = useGame.getState().game;
  apply();
  void emitAck(name, data).catch((error) => {
    if (previous) useGame.getState().rollback(previous);
    useGame
      .getState()
      .setError(
        error instanceof Error ? error.message : "요청을 처리하지 못했습니다.",
      );
  });
};

function App() {
  const { game, tts, help, error, connectionState, setTts, setHelp, setError } = useGame();
  const [nightRecordOpen, setNightRecordOpen] = useState(false);
  useEffect(() => {
    if (!game?.selfRole || game.phase === "result") setNightRecordOpen(false);
  }, [game?.selfRole, game?.phase]);
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [error, setError]);
  const leave = async () => {
    if (
      !game ||
      !window.confirm(
        game.phase === "lobby" || game.phase === "result"
          ? "방에서 나갈까요?"
          : "진행 중인 게임에서 나갈까요? 다시 참가할 수 없습니다.",
      )
    )
      return;
    const result = await event("ROOM_LEAVE", req(game));
    if (result !== undefined) {
      localStorage.removeItem("werewolf-session");
      useGame.getState().setGame(null);
    }
  };
  return (
    <main className={`phase-${game?.phase ?? "home"} ${game?.phase === "day" ? "day" : ""}`}>
      <IconDefs />
      <div className="mist" />
      <div className="meteor" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      {game && (
        <>
          <button
            className="audio-fab"
            aria-label={tts ? "안내 음성 끄기" : "안내 음성 켜기"}
            title={tts ? "안내 음성 끄기" : "안내 음성 켜기"}
            onClick={() => {
              const next = !tts;
              setTts(next);
              setNarrationEnabled(next);
            }}
          >
            {tts ? <Icon.Sound /> : <Icon.Mute />}
          </button>
          {game.selfRole && game.phase !== "result" && (
            <div className="night-record-controls">
              <button
                className="night-record-fab"
                onClick={() => setNightRecordOpen((value) => !value)}
                aria-expanded={nightRecordOpen}
              >
                ◉ 내 밤 기록
              </button>
              {nightRecordOpen && <NightRecord game={game} close={() => setNightRecordOpen(false)} />}
            </div>
          )}
          <button className="leave-fab" onClick={leave}>
            나가기
          </button>
          <button className="help-fab" onClick={() => setHelp(true)}>
            ?
          </button>
        </>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          className="shell"
          key={game?.phase ?? "home"}
          initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(8px)" }}
          transition={{ duration: 0.5 }}
        >
          {game ? <Game game={game} /> : <Home />}
        </motion.div>
      </AnimatePresence>
      {help && <Help close={() => setHelp(false)} />}
      {game && connectionState === "reconnecting" && (
        <div className="connection-banner">연결을 복구하는 중…</div>
      )}
      <AnimatePresence>
        {error && (
          <motion.div
            className="toast"
            role="alert"
            onClick={() => setError(null)}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.55 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function NightActionSummary({ action }: { action: PrivateNightAction }) {
  const result = action.result;
  if (result.kind === "people") {
    const people = Array.isArray(result.people) ? result.people as PersonInfo[] : [];
    return <p>{String(result.title ?? "확인 결과")}: {people.length ? people.map((person) => person.nickname).join(", ") : "없음"}</p>;
  }
  if (result.kind === "cards") {
    const cards = Array.isArray(result.cards) ? result.cards as CardInfo[] : [];
    return <p>{String(result.title ?? "확인 결과")}: {cards.map((card) => `${card.label} · ${card.role ? ROLE_DEFINITIONS[card.role].name : "알 수 없음"}`).join(", ")}</p>;
  }
  const message = {
    copied: `${String(result.targetNickname)}님의 역할을 복사했습니다.`,
    protected: `${String(result.nickname)}님을 보호했습니다.`,
    alpha_swap: `${String(result.targetNickname)}님의 카드를 늑대 카드로 바꿨습니다.`,
    robber_swap: `${String(result.targetNickname)}님과 카드를 바꿨습니다.`,
    witch_seen: `센터 카드 ${Number(result.centerIndex) + 1}번을 확인했습니다.`,
    witch_swap: `센터 카드와 ${String(result.targetNickname)}님의 카드를 바꿨습니다.`,
    troublemaker_swap: `${String(result.firstNickname)}님과 ${String(result.secondNickname)}님의 카드를 바꿨습니다.`,
    drunk_swap: `센터 카드 ${String(result.centerIndex)}번과 내 카드를 바꿨습니다.`,
    confirmed: "능력 정보를 확인했습니다.",
  }[String(result.kind)];
  return <p>{message ?? "밤 행동을 완료했습니다."}</p>;
}

function NightRecord({ game, close }: { game: ClientGameState; close: () => void }) {
  const originalRole = game.selfRole!;
  const definition = ROLE_DEFINITIONS[originalRole];
  return (
    <aside className="night-record" aria-label="내 밤 기록">
      <button className="night-record-close" onClick={close} aria-label="내 밤 기록 닫기">×</button>
      <small>MY NIGHT RECORD</small>
      <h3><RoleIcon id={originalRole} size={22} /> 처음 배정된 역할</h3>
      <div className="night-original-role">
        <b>{definition.name}</b>
        <p>{definition.description}</p>
      </div>
      <div className="night-action-list">
        <b>내가 밤에 한 행동</b>
        {game.nightActions.length ? game.nightActions.map((action, index) => (
          <div className="night-action" key={`${action.role}-${index}`}>
            <span><RoleIcon id={action.role} size={24} /></span>
            <div>
              <strong>{ROLE_DEFINITIONS[action.role].name}</strong>
              <NightActionSummary action={action} />
            </div>
          </div>
        )) : <p className="night-action-empty">이번 밤에 직접 수행한 행동이 없습니다.</p>}
      </div>
    </aside>
  );
}

const turnUrls = (
  import.meta.env.VITE_TURN_URLS ??
  import.meta.env.VITE_TURN_URL ??
  ""
)
  .split(",")
  .map((url: string) => url.trim())
  .filter(Boolean);
const turnUsername = import.meta.env.VITE_TURN_USERNAME;
const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // Configure both turns: (UDP) and turn: (TCP/TLS fallback) URLs in
    // VITE_TURN_URLS. Without a TURN credential mobile/CGNAT users cannot relay.
    ...(turnUrls.length && turnUsername && turnCredential
      ? [{ urls: turnUrls, username: turnUsername, credential: turnCredential }]
      : []),
  ],
};
function VoiceChat({ game }: { game: ClientGameState }) {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceState, setVoiceState] = useState<
    "idle" | "requesting" | "connecting" | "ready" | "error"
  >("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const audiosRef = useRef(new Map<string, HTMLAudioElement>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const recoveryTimersRef = useRef(new Map<string, number>());
  const allowed = game.phase === "lobby" || game.phase === "day";
  const closePeers = () => {
    for (const peer of peersRef.current.values()) peer.close();
    peersRef.current.clear();
    pendingIceRef.current.clear();
    for (const timer of recoveryTimersRef.current.values())
      window.clearTimeout(timer);
    recoveryTimersRef.current.clear();
    for (const audio of audiosRef.current.values()) {
      audio.pause();
      audio.srcObject = null;
    }
    audiosRef.current.clear();
  };
  const stopVoice = () => {
    closePeers();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setVoiceState("idle");
  };
  useEffect(() => () => stopVoice(), []);
  useEffect(() => {
    if (!enabled || !allowed) {
      stopVoice();
      return;
    }
    let disposed = false;
    const signal = (
      event: "VOICE_OFFER" | "VOICE_ANSWER" | "VOICE_ICE",
      targetPlayerId: string,
      payload: unknown,
    ) =>
      void emitAck(event, { ...req(game), targetPlayerId, payload }).catch(
        () => {},
      );
    const flushIce = async (id: string, peer: RTCPeerConnection) => {
      for (const candidate of pendingIceRef.current.get(id) ?? [])
        await peer.addIceCandidate(candidate);
      pendingIceRef.current.delete(id);
    };
    const offer = async (id: string, restart = false) => {
      try {
        const peer = createPeer(id);
        if (peer.signalingState !== "stable") return;
        if (restart) peer.restartIce();
        const description = await peer.createOffer(
          restart ? { iceRestart: true } : undefined,
        );
        await peer.setLocalDescription(description);
        signal("VOICE_OFFER", id, description);
      } catch {
        setVoiceState("error");
      }
    };
    const scheduleRecovery = (id: string, peer: RTCPeerConnection) => {
      if (
        game.playerId.localeCompare(id) >= 0 ||
        recoveryTimersRef.current.has(id)
      )
        return;
      const timer = window.setTimeout(() => {
        recoveryTimersRef.current.delete(id);
        if (
          !disposed &&
          ["disconnected", "failed"].includes(peer.connectionState)
        )
          void offer(id, true);
      }, 2_000);
      recoveryTimersRef.current.set(id, timer);
    };
    const createPeer = (id: string) => {
      const existing = peersRef.current.get(id);
      if (existing) return existing;
      const peerStartedAt = performance.now();
      const peer = new RTCPeerConnection(rtcConfig);
      peersRef.current.set(id, peer);
      streamRef.current
        ?.getTracks()
        .forEach((track) => peer.addTrack(track, streamRef.current!));
      peer.onicecandidate = (event) => {
        if (event.candidate) signal("VOICE_ICE", id, event.candidate.toJSON());
      };
      peer.ontrack = (event) => {
        let audio = audiosRef.current.get(id);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audiosRef.current.set(id, audio);
        }
        audio.srcObject = event.streams[0]!;
        const start = () => void audio!.play().catch(() => {});
        audio.onloadedmetadata = start;
        audio.oncanplay = start;
        start();
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          const timer = recoveryTimersRef.current.get(id);
          if (timer) window.clearTimeout(timer);
          recoveryTimersRef.current.delete(id);
          if (import.meta.env.VITE_PERF_LOGS === "true")
            console.info("voice_peer_connected", {
              peer: id,
              ms: Math.round(performance.now() - peerStartedAt),
            });
          setVoiceState("ready");
        }
        if (["disconnected", "failed"].includes(peer.connectionState)) {
          setVoiceState("connecting");
          scheduleRecovery(id, peer);
        }
      };
      return peer;
    };
    const onOffer = async ({
      senderId,
      payload,
    }: {
      senderId: string;
      payload: RTCSessionDescriptionInit;
    }) => {
      if (disposed) return;
      const peer = createPeer(senderId);
      if (peer.signalingState !== "stable")
        await peer.setLocalDescription({ type: "rollback" });
      await peer.setRemoteDescription(payload);
      await flushIce(senderId, peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      signal("VOICE_ANSWER", senderId, answer);
    };
    const onAnswer = async ({
      senderId,
      payload,
    }: {
      senderId: string;
      payload: RTCSessionDescriptionInit;
    }) => {
      const peer = peersRef.current.get(senderId);
      if (peer) {
        await peer.setRemoteDescription(payload);
        await flushIce(senderId, peer);
      }
    };
    const onIce = async ({
      senderId,
      payload,
    }: {
      senderId: string;
      payload: RTCIceCandidateInit;
    }) => {
      const peer = peersRef.current.get(senderId);
      if (peer?.remoteDescription) await peer.addIceCandidate(payload);
      else
        pendingIceRef.current.set(senderId, [
          ...(pendingIceRef.current.get(senderId) ?? []),
          payload,
        ]);
    };
    const onPeerJoined = ({ playerId }: { playerId: string }) => {
      if (playerId !== game.playerId && !peersRef.current.has(playerId))
        setVoiceState("connecting");
    };
    socket.on("VOICE_OFFER", onOffer);
    socket.on("VOICE_ANSWER", onAnswer);
    socket.on("VOICE_ICE", onIce);
    socket.on("VOICE_PEER_JOINED", onPeerJoined);
    setVoiceState("requesting");
    void navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      })
      .then(async (stream) => {
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        stream.getAudioTracks().forEach((track) => (track.enabled = !muted));
        const peerIds = await emitAck<string[]>("VOICE_JOIN", { ...req(game) });
        if (disposed) return;
        setVoiceState(peerIds.length ? "connecting" : "ready");
        await Promise.all(peerIds.map((id) => offer(id)));
      })
      .catch(() => {
        setVoiceState("error");
        useGame
          .getState()
          .setError("마이크 권한을 허용해야 음성 대화를 사용할 수 있습니다.");
      });
    return () => {
      disposed = true;
      socket.off("VOICE_OFFER", onOffer);
      socket.off("VOICE_ANSWER", onAnswer);
      socket.off("VOICE_ICE", onIce);
      socket.off("VOICE_PEER_JOINED", onPeerJoined);
      stopVoice();
    };
  }, [enabled, allowed, game.roomCode, game.playerId]);
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    streamRef.current
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = !next));
  };
  if (!allowed) return null;
  const stateLabel = {
    idle: "",
    requesting: "마이크 준비 중",
    connecting: "상대와 연결 중…",
    ready: "말할 수 있음",
    error: "연결 실패 · 다시 참가",
  }[voiceState];
  return (
    <div className="voice-controls">
      <button
        className="voice-fab"
        onClick={() => setEnabled((value) => !value)}
      >
        <Icon.Mic /> {enabled ? "음성 나가기" : "음성 참가"}
      </button>
      {enabled && (
        <>
          <span className={`voice-status ${voiceState}`}>{stateLabel}</span>
          <button className="voice-fab mute" onClick={toggleMute}>
            {muted ? <Icon.MicOff /> : <Icon.Mic />} {muted ? "마이크 켜기" : "음소거"}
          </button>
        </>
      )}
    </div>
  );
}

function Home() {
  const [mode, setMode] = useState<"home" | "create" | "join">("home");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [count, setCount] = useState(5);
  const [roles, setRoles] = useState<RoleType[]>(PRESETS.recommended!);
  const [busy, setBusy] = useState(false);
  const normalizeRoomCode = (value: string) =>
    value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
  useEffect(() => {
    if (roles.length !== count + 3) setRoles(autoPreset(count));
  }, [count]);
  const changeRole = (id: RoleType, amount: number) =>
    setRoles((old) =>
      amount > 0
        ? old.length < count + 3 &&
          old.filter((x) => x === id).length < ROLE_DEFINITIONS[id].maxCount
          ? [...old, id]
          : old
        : old.includes(id)
          ? old.filter((x, i) => i !== old.lastIndexOf(id))
          : old,
    );
  const create = async (botMode = false) => {
    setBusy(true);
    const data = (await event("ROOM_CREATE", {
      nickname,
      maxPlayers: count,
      selectedRoles: roles,
      actionTimeLimitSeconds: 8,
      dayTimeLimitSeconds: 300,
      botMode,
    })) as
      | { roomCode: string; playerId: string; sessionToken: string }
      | undefined;
    if (data) saveSession(data);
    setBusy(false);
  };
  const join = async () => {
    setBusy(true);
    const data = (await event("ROOM_JOIN", {
      nickname,
      roomCode: roomCode.toUpperCase(),
    })) as
      | { roomCode: string; playerId: string; sessionToken: string }
      | undefined;
    if (data) saveSession(data);
    setBusy(false);
  };
  if (mode === "home")
    return (
      <section className="hero">
        <HeroScene />
        <div className="eyebrow">REAL-TIME SOCIAL DEDUCTION</div>
        <h1>
          한밤의
          <br />
          <i>늑대인간</i>
        </h1>
        <p>각자의 기기에서 접속해 단 한 번의 밤을 살아남으세요.</p>
        <button onClick={() => setMode("create")}>새로운 밤 열기</button>
        <button className="ghost" onClick={() => setMode("join")}>
          방 코드로 합류
        </button>
        {session() && (
          <p className="tiny">이전 게임은 자동으로 재접속을 시도합니다.</p>
        )}
        <p className="tiny hero-meta">3–10명이 각자의 기기로 함께해요</p>
      </section>
    );
  if (mode === "join")
    return (
      <section>
        <Back go={() => setMode("home")} />
        <Header kicker="ENTER THE VILLAGE" title="마을에 합류하기" />
        <Panel>
          <label>
            닉네임
            <input
              value={nickname}
              maxLength={16}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="이름을 입력하세요"
            />
          </label>
          <label>
            방 코드
            <div className="code-field">
              <CodeTiles value={roomCode.toUpperCase()} />
              <input
                className="code-input"
                value={roomCode}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
                onPaste={(e) => {
                  e.preventDefault();
                  setRoomCode(normalizeRoomCode(e.clipboardData.getData("text")));
                }}
                placeholder="A7K29P"
              />
            </div>
          </label>
        </Panel>
        <button
          disabled={busy || !nickname.trim() || roomCode.length !== 6}
          onClick={join}
        >
          입장하기
        </button>
      </section>
    );
  return (
    <section>
      <Back go={() => setMode("home")} />
      <Header kicker="HOST A NEW NIGHT" title="새로운 밤 열기" />
      <Panel>
        <label>
          방장 닉네임
          <input
            value={nickname}
            maxLength={16}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="이름을 입력하세요"
          />
        </label>
        <div className="count-row">
          <span>참가 인원</span>
          <button
            className="round"
            onClick={() => setCount(Math.max(3, count - 1))}
          >
            −
          </button>
          <b>{count}</b>
          <button
            className="round"
            onClick={() => setCount(Math.min(10, count + 1))}
          >
            +
          </button>
        </div>
      </Panel>
      <h3>빠른 구성</h3>
      <div className="chips">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            className="chip"
            key={key}
            onClick={() => setRoles(fitPreset(preset, count))}
          >
            {
              (
                {
                  beginner: "입문자",
                  deduction: "추리 중심",
                  wolfpack: "늑대 다수",
                  chaos: "혼돈",
                  recommended: "추천",
                } as Record<string, string>
              )[key]
            }
          </button>
        ))}
      </div>
      <Panel>
        <div className="panel-head">
          <h3>역할 구성</h3>
          <b className={roles.length === count + 3 ? "ok" : "bad"}>
            {roles.length} / {count + 3}
          </b>
        </div>
        <div className="role-grid">
          {ROLE_LIST.map((r) => {
            const n = roles.filter((x) => x === r.id).length;
            return (
              <div className="role-pick" key={r.id}>
                <span><RoleIcon id={r.id} faction={r.faction} size={26} /></span>
                <div>
                  <b>{r.name}</b>
                  <small>{factionName(r.faction)}</small>
                </div>
                <button className="mini" onClick={() => changeRole(r.id, -1)}>
                  −
                </button>
                <b>{n}</b>
                <button className="mini" onClick={() => changeRole(r.id, 1)}>
                  +
                </button>
              </div>
            );
          })}
        </div>
      </Panel>
      <button
        disabled={busy || !nickname.trim() || roles.length !== count + 3}
        onClick={() => create()}
      >
        방 만들기
      </button>
      <button
        className="ghost"
        disabled={busy || !nickname.trim() || roles.length !== count + 3}
        onClick={() => create(true)}
      >
        테스트 봇 방 만들기
      </button>
      <p className="tiny center">
        나를 제외한 모든 자리를 테스트 봇으로 채워 실제 게임 흐름을 확인합니다.
      </p>
    </section>
  );
}

/* 코드 한 글자씩 타일로. cur = 다음에 입력될 칸 */
function CodeTiles({ value, length = 6 }: { value: string; length?: number }) {
  return (
    <div className="code-tiles" aria-label={`코드 ${value}`}>
      {Array.from({ length }, (_, i) => (
        <span key={i} className={value[i] ? "on" : i === value.length ? "cur" : ""}>
          {value[i] ?? ""}
        </span>
      ))}
    </div>
  );
}

/* 대기실 원탁: 들어온 사람의 자리에 가면이 앉는다 */
function RoundTable({ game }: { game: ClientGameState }) {
  const n = game.maxPlayers;
  return (
    <div className="round-table" role="list" aria-label="참가자">
      <div className="table-core">
        <b>{game.players.length}</b>
        <small>/ {n}</small>
      </div>
      {Array.from({ length: n }, (_, i) => {
        const p = game.players[i];
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const style = { left: `${50 + Math.cos(a) * 38}%`, top: `${50 + Math.sin(a) * 38}%` };
        if (!p)
          return (
            <div className="seat empty" role="listitem" aria-label="빈 자리" style={style} key={`empty-${i}`}>
              <span />
            </div>
          );
        return (
          <div
            className={`seat${p.isReady ? " ready" : ""}`}
            role="listitem"
            aria-label={`${p.nickname}${p.isHost ? ", 방장" : ""}${p.isBot ? ", 봇" : ""}, ${p.isReady ? "준비됨" : "대기 중"}`}
            style={style}
            key={p.id}
          >
            <div className="seat-face">
              <MaskAvatar name={p.nickname} size={50} />
              {p.isHost && <CrownIcon />}
              {p.isReady && <i className="tick"><CheckIcon size={11} /></i>}
            </div>
            <b>{p.nickname}</b>
            {p.isBot && <em>봇</em>}
          </div>
        );
      })}
    </div>
  );
}

function Game({ game }: { game: ClientGameState }) {
  if (game.phase === "lobby") return <Lobby game={game} />;
  if (game.phase === "card_reveal") return <Reveal game={game} />;
  if (game.phase === "night") return <Night game={game} />;
  if (game.phase === "day") return <Day game={game} />;
  if (game.phase === "voting") return <Voting game={game} />;
  return <Result game={game} />;
}
function Lobby({ game }: { game: ClientGameState }) {
  const me = game.players.find((p) => p.id === game.playerId)!;
  const full = game.players.length === game.maxPlayers;
  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    navigator.clipboard?.writeText(game.roomCode);
    buzz(12);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const deckReady = game.selectedRoles.length === game.maxPlayers + 3;
  const canStart = full && deckReady && game.players.every((p) => p.isReady);
  const changeRole = (id: RoleType, amount: number) => {
    const old = game.selectedRoles;
    const next =
      amount > 0
        ? old.length < game.maxPlayers + 3 &&
          old.filter((x) => x === id).length < ROLE_DEFINITIONS[id].maxCount
          ? [...old, id]
          : old
        : old.includes(id)
          ? old.filter((x, i) => i !== old.lastIndexOf(id))
          : old;
    if (next !== old)
      event("ROOM_SETTINGS", {
        ...req(game),
        ...game.settings,
        selectedRoles: next,
      });
  };
  return (
    <section>
      <Header kicker={game.botMode ? "TEST BOT ROOM" : "WAITING ROOM"} title={game.botMode ? "테스트 봇과 함께하는 밤" : "달이 뜨기 전"} />
      <Panel className="center invite">
        <small>초대 코드</small>
        <CodeTiles value={game.roomCode} />
        <button className={`chip copy-chip${copied ? " done" : ""}`} onClick={copyCode}>
          {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "복사됨" : "코드 복사"}
        </button>
      </Panel>
      <div className="section-title">
        <h3>참가자</h3>
        <span>
          {game.players.length} / {game.maxPlayers}
        </span>
      </div>
      <RoundTable game={game} />
      <ChatPanel
        game={game}
        scope="lobby"
        title="대기실 채팅"
        placeholder="게임 시작 전 이야기를 나누세요"
      />
      {game.hostId === game.playerId && (
        <>
          <Panel>
            <h3>게임 설정</h3>
            <label className="inline">
              최대 인원
              <select
                value={game.maxPlayers}
                onChange={(e) => {
                  const maxPlayers = +e.target.value;
                  event("ROOM_SETTINGS", {
                    ...req(game),
                    ...game.settings,
                    maxPlayers,
                    selectedRoles: fitPreset(game.selectedRoles, maxPlayers),
                  });
                }}
              >
                {Array.from({ length: 11 - Math.max(3, game.players.length) }, (_, index) => Math.max(3, game.players.length) + index).map((count) => (
                  <option key={count} value={count}>{count}명</option>
                ))}
              </select>
            </label>
            <label className="inline">
              밤 행동 시간
              <select
                value={game.settings.actionTimeLimitSeconds}
                onChange={(e) =>
                  event("ROOM_SETTINGS", {
                    ...req(game),
                    ...game.settings,
                    actionTimeLimitSeconds: +e.target.value,
                  })
                }
              >
                {[8, 10, 15].map((x) => (
                  <option key={x} value={x}>
                    {x}초
                  </option>
                ))}
              </select>
            </label>
            <label className="inline">
              낮 토론 시간
              <select
                value={game.settings.dayTimeLimitSeconds}
                onChange={(e) =>
                  event("ROOM_SETTINGS", {
                    ...req(game),
                    ...game.settings,
                    dayTimeLimitSeconds: +e.target.value,
                  })
                }
              >
                {[
                  [300, "5분"],
                  [600, "10분"],
                  [1200, "20분"],
                  [1800, "30분"],
                ].map(([x, l]) => (
                  <option key={x} value={x}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </Panel>
          <Panel>
            <div className="panel-head">
              <h3>역할 구성</h3>
              <b className={deckReady ? "ok" : "bad"}>
                {game.selectedRoles.length} / {game.maxPlayers + 3}
              </b>
            </div>
            <div className="role-grid">
              {ROLE_LIST.map((r) => {
                const n = game.selectedRoles.filter((x) => x === r.id).length;
                return (
                  <div className="role-pick" key={r.id}>
                    <span><RoleIcon id={r.id} faction={r.faction} size={26} /></span>
                    <div>
                      <b>{r.name}</b>
                      <small>{factionName(r.faction)}</small>
                    </div>
                    <button
                      className="mini"
                      disabled={!n}
                      onClick={() => changeRole(r.id, -1)}
                    >
                      −
                    </button>
                    <b>{n}</b>
                    <button
                      className="mini"
                      disabled={
                        n >= r.maxCount ||
                        game.selectedRoles.length >= game.maxPlayers + 3
                      }
                      onClick={() => changeRole(r.id, 1)}
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          </Panel>
        </>
      )}
      {game.hostId !== game.playerId && (
        <Panel>
          <div className="panel-head">
            <h3>역할 구성</h3>
            <b className={deckReady ? "ok" : "bad"}>
              {game.selectedRoles.length} / {game.maxPlayers + 3}
            </b>
          </div>
          <div className="role-grid">
            {ROLE_LIST.filter((role) => game.selectedRoles.includes(role.id)).map((role) => (
              <div className="role-pick" key={role.id}>
                <span><RoleIcon id={role.id} faction={role.faction} size={26} /></span>
                <div>
                  <b>{role.name}</b>
                  <small>{factionName(role.faction)}</small>
                </div>
                <b>×{game.selectedRoles.filter((id) => id === role.id).length}</b>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <button
        className={me.isReady ? "ghost" : ""}
        onClick={() =>
          optimistic(
            () => useGame.getState().toggleReady(),
            "PLAYER_READY",
            req(game),
          )
        }
      >
        {me.isReady ? "준비 취소" : "준비 완료"}
      </button>
      {game.hostId === game.playerId && (
        <button
          disabled={!canStart}
          onClick={() => event("GAME_START", req(game))}
        >
          {!full
            ? "모든 자리를 기다리는 중"
            : !deckReady
              ? "역할 카드 수를 맞춰주세요"
              : "게임 시작"}
        </button>
      )}
    </section>
  );
}
function Reveal({ game }: { game: ClientGameState }) {
  const [flipped, setFlipped] = useState(false);
  const me = game.players.find((p) => p.id === game.playerId)!;
  const r = game.selfRole && ROLE_DEFINITIONS[game.selfRole];
  return (
    <section className="center reveal">
      <div className="moon smallmoon">☾</div>
      <Header kicker="YOUR SECRET" title={`${me.nickname}님의 카드`} />
      <p>주변에 아무도 보고 있지 않은지 확인하세요.</p>
      <motion.div
        className="flip"
        animate={{ rotateY: flipped ? 180 : 0 }}
        onClick={() => { if (!flipped) buzz(30); setFlipped(true); }}
      >
        <div className="card-face back">
          <Sigil size={84} /><small>탭하여 역할 확인</small>
        </div>
        <div className={`card-face front faction-${r?.faction ?? "village"}`}>
          <span><RoleIcon id={game.selfRole ?? undefined} faction={r?.faction} size={76} /></span>
          <h2>{r?.name}</h2>
          <b>{r && factionName(r.faction)}</b>
          <p>{r?.description}</p>
        </div>
      </motion.div>
      {flipped && (
        <div className={`flip-burst faction-${r?.faction ?? "village"}`} aria-hidden="true" />
      )}
      <button
        disabled={!flipped || me.hasConfirmedCard}
        onClick={() => event("CARD_CONFIRM", req(game))}
      >
        {me.hasConfirmedCard
          ? "다른 플레이어를 기다리는 중"
          : "역할을 확인했습니다"}
      </button>
      <p className="tiny">
        {game.players.filter((p) => p.hasConfirmedCard).length} /{" "}
        {game.totalPlayers}명 확인 완료
      </p>
    </section>
  );
}
function Night({ game }: { game: ClientGameState }) {
  const a = game.currentNightAction;
  const role = a && ROLE_DEFINITIONS[a.role];
  const remain = useCountdown(a?.expiresAt, game.serverNow);
  const syncedAction = useRef<string>();
  useEffect(() => {
    // The opening narration is pending on the first role itself, so its
    // subsequent active deadline needs a distinct recovery key.
    const transitionKey = a && `${a.id}:${a.status}:${a.expiresAt}`;
    if (a && transitionKey && remain <= 0 && syncedAction.current !== transitionKey) {
      syncedAction.current = transitionKey;
      recoverExpiredAction(a.id, a.status === "active");
    }
  }, [a?.expiresAt, a?.id, a?.status, remain]);
  if (a?.status === "pending")
    return (
      <section className="center night night-intro">
        <div className="eclipse" aria-hidden="true" />
        <div className="eyebrow">THE NIGHT BEGINS</div>
        <h1>밤이 시작되었습니다.</h1>
        <p>모두 눈을 감아주세요.</p>
        <div className="dots">● ● ●</div>
      </section>
    );
  return (
    <section className="center night" data-faction={role?.faction}>
      <div className="crescent">☾</div>
      <div className="eyebrow">NIGHT · {a?.order ?? "—"}</div>
      <h1>
        <RoleIcon id={a?.role} faction={role?.faction} size={20} /> {role?.name}
      </h1>
      <p>{role?.description}</p>
      <NightTimer remain={remain} total={game.settings.actionTimeLimitSeconds} />
      {remain <= 0 && useGame.getState().transitioningActionId === a?.id && (
        <p className="transitioning">다음 역할을 준비 중…</p>
      )}
      {game.actionResult && <PrivateResult data={game.actionResult} />}{" "}
      {game.isNightActor && a ? (
        <NightControls game={game} />
      ) : (
        <Panel>
          <div className="dots">● ● ●</div>
          <p>
            선택은 기록되었습니다.
            <br />
            제한 시간이 끝나면 다음 역할로 넘어갑니다.
          </p>
        </Panel>
      )}
    </section>
  );
}
function NightControls({ game }: { game: ClientGameState }) {
  const a = game.currentNightAction!;
  const [players, setPlayers] = useState<string[]>([]);
  const [centers, setCenters] = useState<number[]>([]);
  const [seerMode, setSeerMode] = useState<"player" | "center">("player");
  const [submitting, setSubmitting] = useState(false);
  // State updates are applied after the current event. Keep a synchronous
  // guard too, so a quick double tap cannot submit two different requests.
  const submittingRef = useRef(false);
  useEffect(() => {
    setPlayers([]);
    setCenters([]);
    setSubmitting(false);
    submittingRef.current = false;
  }, [a.id, game.actionResult?.kind]);
  const submit = (command: NightCommand) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    void event("NIGHT_ACTION_SUBMIT", {
      ...req(game),
      actionId: a.id,
      command,
    }).then((result) => {
      if (result === undefined) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    });
  };
  const others = game.players.filter(
    (p) => p.id !== game.playerId && p.connected,
  );
  const role = a.role;
  const contextPeople = peopleFrom(game.actionContext);
  const confirmRoles = [
    "minion",
    "apprentice_tanner",
    "mason",
    "insomniac",
  ];
  if (role === "werewolf" && contextPeople.length)
    confirmRoles.push("werewolf");
  if (confirmRoles.includes(role))
    return (
      <>
        <Context data={game.actionContext} />
        <button
          disabled={submitting}
          onClick={() => submit({ type: "confirm" })}
        >
          확인했습니다
        </button>
      </>
    );
  const witchSeen =
    role === "witch" && game.actionResult?.kind === "witch_seen";
  const stagedCenter = witchSeen
    ? Number(game.actionResult?.centerIndex)
    : undefined;
  const maxPlayers = role === "troublemaker" ? 2 : 1;
  const needCenter = role === "seer" ? 2 : 1;
  const playerRole =
    [
      "doppelganger",
      "shield_bearer",
      "alpha_wolf",
      "mystic_wolf",
      "robber",
      "journalist",
      "troublemaker",
    ].includes(role) ||
    (role === "witch" && witchSeen) ||
    (role === "seer" && seerMode === "player");
  const centerRole =
    ["apprentice_seer", "drunk"].includes(role) ||
    (role === "witch" && !witchSeen) ||
    (role === "seer" && seerMode === "center") ||
    (role === "werewolf" && !contextPeople.length);
  const commandFor = (
    nextPlayers: string[],
    nextCenters: number[],
  ): NightCommand => ({
    type:
      role === "troublemaker"
        ? "swap_players"
        : role === "drunk"
          ? "swap_center"
          : role === "witch"
            ? witchSeen
              ? "swap_center"
              : "inspect_center"
            : role === "robber" || role === "alpha_wolf"
              ? "swap_player"
              : role === "shield_bearer"
                ? "protect"
                : nextPlayers.length
                  ? "inspect_player"
                  : nextCenters.length > 1
                    ? "inspect_centers"
                    : "inspect_center",
    targetPlayerIds: nextPlayers,
    centerIndexes:
      witchSeen && stagedCenter !== undefined ? [stagedCenter] : nextCenters,
  });
  const pickPlayer = (id: string) => {
    if (submitting) return;
    const next = players.includes(id)
      ? players.filter((x) => x !== id)
      : [...players.slice(-(maxPlayers - 1)), id];
    buzz();
    setPlayers(next);
    if (next.length === maxPlayers) submit(commandFor(next, centers));
  };
  const pickCenter = (i: number) => {
    if (submitting) return;
    const max = role === "seer" ? 2 : 1;
    const next = centers.includes(i)
      ? centers.filter((x) => x !== i)
      : [...centers.slice(-(max - 1)), i];
    buzz();
    setCenters(next);
    if (next.length === needCenter) submit(commandFor(players, next));
  };
  return (
    <>
      {game.actionContext && <Context data={game.actionContext} />}{" "}
      {role === "seer" && (
        <div className="chips">
          <button
            type="button"
            className="chip"
            aria-pressed={seerMode === "player"}
            disabled={submitting}
            onClick={() => {
              setSeerMode("player");
              setCenters([]);
            }}
          >
            플레이어 1명
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={seerMode === "center"}
            disabled={submitting}
            onClick={() => {
              setSeerMode("center");
              setPlayers([]);
            }}
          >
            센터 2장
          </button>
        </div>
      )}
      <Panel>
        {witchSeen && (
          <p className="witch-next">
            센터 카드를 확인했습니다. 이제 교환할 플레이어를 선택하세요.
          </p>
        )}
        {playerRole && (
          <>
            <h3>플레이어 선택</h3>
            <div className="target-grid">
              {others.map((p) => (
                <button
                  className={
                    players.includes(p.id) ? "target selected" : "target"
                  }
                  onClick={() => pickPlayer(p.id)}
                  disabled={submitting}
                  key={p.id}
                >
                  <div className="avatar">{p.nickname[0]}</div>
                  {p.nickname}
                </button>
              ))}
            </div>
          </>
        )}
        {centerRole && (
          <>
            <h3>센터 카드 선택</h3>
            <div className="centers">
              {[0, 1, 2].map((i) => (
                <button
                  className={
                    centers.includes(i) ? "center-card selected" : "center-card"
                  }
                  onClick={() => pickCenter(i)}
                  disabled={submitting}
                  key={i}
                >
                  <Sigil size={34} /><small>{i + 1}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </Panel>
      <p className="tiny">
        선택이 완료되면 즉시 기록되며, 다음 행동은 제한 시간 뒤에 시작됩니다.
      </p>
    </>
  );
}
function ChatPanel({ game, scope, title, placeholder }: { game: ClientGameState; scope: 'day' | 'lobby'; title: string; placeholder: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatFormRef = useRef<HTMLFormElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const messages = scope === 'lobby' ? game.lobbyChat : game.chat;
  const latestMessageId = messages[messages.length - 1]?.id;
  useEffect(() => {
    const chat = chatRef.current;
    if (chat) chat.scrollTop = chat.scrollHeight;
  }, [latestMessageId]);
  useEffect(() => {
    const dismissKeyboard = (event: PointerEvent) => {
      if (!chatFormRef.current?.contains(event.target as Node)) chatInputRef.current?.blur();
    };
    document.addEventListener("pointerdown", dismissKeyboard);
    return () => document.removeEventListener("pointerdown", dismissKeyboard);
  }, []);
  const sendChat = () => {
    const value = text.trim();
    if (!value || sending) return;
    const message = { id: crypto.randomUUID(), playerId: game.playerId, nickname: game.players.find((p) => p.id === game.playerId)?.nickname ?? "", text: value, at: Date.now() };
    setText("");
    requestAnimationFrame(() => chatInputRef.current?.focus());
    setSending(true);
    useGame.getState().addChat(message, scope);
    void emitAck("CHAT_SEND", { ...req(game), messageId: message.id, text: value })
      .catch((error) => {
        useGame.getState().removeChat(message.id, scope);
        useGame.getState().setError(error instanceof Error ? error.message : "채팅을 보내지 못했습니다.");
      })
      .finally(() => setSending(false));
  };
  return (
    <Panel>
      <h3>{title}</h3>
      <div className="chat" ref={chatRef}>
        {messages.map((m) => (
          <div className={`chat-message${m.playerId === game.playerId ? " mine" : ""}`} key={m.id}>
            <b>{m.nickname}</b>
            <span>{m.text}</span>
          </div>
        ))}
      </div>
      <form ref={chatFormRef} className="chat-form" onSubmit={(e) => { e.preventDefault(); sendChat(); }}>
        <input ref={chatInputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
        <button disabled={sending}>{sending ? "전송 중" : "전송"}</button>
      </form>
    </Panel>
  );
}
function Day({ game }: { game: ClientGameState }) {
  const remain = useCountdown(game.dayExpiresAt, game.serverNow);
  const synced = useRef(false);
  const total = useRef(0);
  if (remain > total.current) total.current = remain;
  const [tab, setTab] = useState<"chat" | "info">("chat");
  const used = [...new Set(game.selectedRoles)];
  useEffect(() => {
    if (remain <= 0 && !synced.current) {
      synced.current = true;
      syncRoom();
    }
  }, [remain]);
  const progress = total.current ? 1 - remain / total.current : 0;
  const ratio = game.totalPlayers ? game.dayVoteRequests / game.totalPlayers : 0;
  return (
    <section className={`day-scene${remain <= 30 ? " dusk" : ""}`}>
      <div className="dawn" aria-hidden="true" />
      <Header kicker="DAYBREAK" title="날이 밝았습니다" />
      <div className="sun-timer">
        <SunArc p={progress} />
        <b className={remain <= 30 ? "urgent" : ""}>{formatTime(remain)}</b>
        <small>남은 토론 시간</small>
      </div>
      {game.publicReveals.map((x, i) => (
        <div className="notice" key={i}>
          <Icon.News /> {x}
        </div>
      ))}
      <div className="day-tabs" role="tablist">
        {(["chat", "info"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "on" : ""}
            onClick={() => setTab(k)}
          >
            {k === "chat" ? "마을 대화" : "게임 정보"}
          </button>
        ))}
      </div>
      {tab === "chat" ? (
        <ChatPanel game={game} scope="day" title="마을 대화" placeholder="의심과 단서를 나누세요" />
      ) : (
        <>
          <Panel>
            <h3>이번 게임의 역할</h3>
            <div className="chips">
              {used.map((id) => (
                <span className="chip" key={id}>
                  <RoleIcon id={id} size={16} /> {ROLE_DEFINITIONS[id].name} ×
                  {game.selectedRoles.filter((x) => x === id).length}
                </span>
              ))}
            </div>
          </Panel>
          <Panel>
            <h3>밤 행동 순서</h3>
            <div className="order">
              {NIGHT_ROLES.filter((r) => used.includes(r.id)).map((r, i) => (
                <div key={r.id}>
                  <i>{i + 1}</i>
                  <span>
                    <RoleIcon id={r.id} faction={r.faction} size={16} /> {r.name}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
      <div className="vote-dock">
        <button
          className="vote-request"
          style={{ ["--p" as string]: `${ratio * 100}%` }}
          disabled={game.hasRequestedDayVote}
          onClick={() => event("DAY_START", req(game))}
        >
          <span>{game.hasRequestedDayVote ? "투표 동의 완료" : "투표하기 동의"}</span>
          <em>
            {game.dayVoteRequests} / {game.totalPlayers}
          </em>
        </button>
      </div>
    </section>
  );
}

/* 꾹 눌러야 확정된다. 키보드(Enter/Space)는 즉시 확정 */
function HoldConfirm({
  disabled,
  done,
  label,
  doneLabel,
  onConfirm,
}: {
  disabled: boolean;
  done: boolean;
  label: string;
  doneLabel: string;
  onConfirm: () => void;
}) {
  const [p, setP] = useState(0);
  const raf = useRef(0);
  const start = useRef(0);
  const fired = useRef(false);
  const HOLD = 900;
  const stop = () => {
    cancelAnimationFrame(raf.current);
    if (!fired.current) setP(0);
  };
  const tick = () => {
    const v = Math.min(1, (performance.now() - start.current) / HOLD);
    setP(v);
    if (v < 1) raf.current = requestAnimationFrame(tick);
    else if (!fired.current) {
      fired.current = true;
      buzz(60);
      onConfirm();
    }
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const off = disabled || done;
  return (
    <button
      className={`hold-confirm${p > 0 ? " holding" : ""}${done ? " done" : ""}`}
      style={{ ["--hold" as string]: p }}
      disabled={off}
      onPointerDown={() => {
        if (off) return;
        fired.current = false;
        start.current = performance.now();
        buzz(10);
        raf.current = requestAnimationFrame(tick);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={(e) => {
        if (e.detail === 0 && !off && !fired.current) {
          fired.current = true;
          onConfirm();
        }
      }}
    >
      <span>{done ? doneLabel : p > 0 ? "계속 누르세요…" : label}</span>
    </button>
  );
}

function Voting({ game }: { game: ClientGameState }) {
  const [target, setTarget] = useState("");
  const me = game.players.find((p) => p.id === game.playerId)!;
  const others = game.players.filter((p) => p.id !== game.playerId);
  return (
    <section className={`voting-scene${me.hasVoted ? " voted" : ""}`}>
      <Header kicker="THE VERDICT" title="운명의 투표" />
      <p>가장 의심스러운 한 명을 선택하세요. 확정 후에는 바꿀 수 없습니다.</p>
      <div className="vote-grid">
        {others.map((p) => (
          <button
            className={`suspect ${target === p.id ? "vote selected" : "vote"}`}
            onClick={() => { buzz(); setTarget(p.id); }}
            disabled={me.hasVoted}
            aria-pressed={target === p.id}
            key={p.id}
          >
            <MaskAvatar name={p.nickname} size={64} />
            <b>{p.nickname}</b>
            {target === p.id && <WaxSeal size={40} />}
          </button>
        ))}
      </div>
      <HoldConfirm
        disabled={!target}
        done={me.hasVoted}
        label={target ? "꾹 눌러 확정" : "의심되는 사람을 고르세요"}
        doneLabel="투표 완료 · 결과 대기 중"
        onConfirm={() =>
          optimistic(() => useGame.getState().confirmVote(), "VOTE_CONFIRM", {
            ...req(game),
            targetPlayerId: target,
          })
        }
      />
      <div className="candles" role="img" aria-label={`${game.votesCompleted} / ${game.totalPlayers}명 투표 완료`}>
        {Array.from({ length: game.totalPlayers }, (_, i) => (
          <Candle key={i} lit={i < game.votesCompleted} />
        ))}
      </div>
      <p className="center tiny">
        {game.votesCompleted} / {game.totalPlayers}명 투표 완료
      </p>
    </section>
  );
}
function Result({ game }: { game: ClientGameState }) {
  const r = game.result!;
  const win = r.winners.length
    ? r.winners.map(factionName).join(" · ")
    : "승자 없음";
  const winners = r.players.filter((p) =>
    r.winners.includes(ROLE_DEFINITIONS[p.currentRole].faction),
  );
  const losers = r.players.filter(
    (p) => !r.winners.includes(ROLE_DEFINITIONS[p.currentRole].faction),
  );
  return (
    <section>
      <div className={`winner faction-${r.winners[0] ?? "none"}`}>
        <div><Icon.Sparkle /></div>
        <span>THE NIGHT IS OVER</span>
        <h1>
          {win}
          <br />
          <i>승리</i>
        </h1>
      </div>
      <Panel className="final-result">
        <h3>최종 결과</h3>
        <div className="outcome-groups">
          <div className="outcome-group winners">
            <b>
              <Icon.Trophy /> 승리자 <small>{winners.length}명</small>
            </b>
            <div className="outcome-list">
              {winners.map((p) => (
                <span key={p.id}>{p.nickname}</span>
              ))}
            </div>
          </div>
          <div className="outcome-group losers">
            <b>
              패배자 <small>{losers.length}명</small>
            </b>
            <div className="outcome-list">
              {losers.map((p) => (
                <span key={p.id}>{p.nickname}</span>
              ))}
            </div>
          </div>
        </div>
      </Panel>
      <Panel>
        <h3>최종 역할</h3>
        {r.players.map((p, i) => (
          <motion.div
            className={
              r.executedIds.includes(p.id) ? "result-row dead" : "result-row"
            }
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.12 }}
            key={p.id}
          >
            <div className="avatar">{p.nickname[0]}</div>
            <div>
              <b>{p.nickname}</b>
              <small>처음 {ROLE_DEFINITIONS[p.originalRole].name} · 득표 {r.receivedVoteCounts[p.id] ?? 0}표</small>
            </div>
            <strong>
              <RoleIcon id={p.currentRole} size={18} />{" "}
              {ROLE_DEFINITIONS[p.currentRole].name}
            </strong>
            {r.executedIds.includes(p.id) && <em><Icon.Skull /></em>}
          </motion.div>
        ))}
      </Panel>
      <Panel>
        <h3>개별 투표</h3>
        {Object.entries(r.votes).map(([from, to]) => (
          <p className="vote-line" key={from}>
            {name(r, from)} <span>→</span> {name(r, to)}
          </p>
        ))}
      </Panel>
      {game.hostId === game.playerId ? (
        <button onClick={() => event("GAME_RESTART", req(game))}>
          모두 대기실로 돌아가기
        </button>
      ) : (
        <p className="center tiny">
          방장이 대기실로 이동할 때까지 기다려주세요.
        </p>
      )}
    </section>
  );
}

function Help({ close }: { close: () => void }) {
  const [tab, setTab] = useState<"rules" | "roles" | "win">("rules");
  return (
    <div className="overlay" onClick={close}>
      <motion.div
        className="sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>게임 안내</h2>
          <button className="round" onClick={close}>
            ×
          </button>
        </div>
        <div className="tabs">
          {[
            ["rules", "게임 규칙"],
            ["roles", "역할 설명"],
            ["win", "승리 조건"],
          ].map(([k, l]) => (
            <button
              className={tab === k ? "active" : ""}
              onClick={() => setTab(k as typeof tab)}
              key={k}
            >
              {l}
            </button>
          ))}
        </div>
        {tab === "rules" && (
          <div className="prose">
            <p>
              각자 비밀 역할을 확인한 뒤, 서버 안내에 따라 단 한 번의 밤을
              진행합니다.
            </p>
            <p>
              낮에는 대화로 거짓말을 가려내고 가장 의심스러운 사람에게
              투표합니다. 최다 득표가 1표면 아무도 처형되지 않습니다.
            </p>
          </div>
        )}
        {tab === "win" && (
          <div className="prose">
            <p>
              <b>마을:</b> 늑대가 있으면 한 명 이상 처형합니다. 늑대가 없다면
              아무도 처형하지 않습니다.
            </p>
            <p>
              <b>늑대:</b> 늑대가 한 명도 처형되지 않아야 합니다.
            </p>
            <p>
              <b>무두장이:</b> 자신이 처형되면 승리합니다.
            </p>
            <p>
              <b>하수인:</b> 늑대가 없을 때 누군가 처형되고 자신이 살아남으면
              승리합니다.
            </p>
          </div>
        )}
        {tab === "roles" && (
          <div>
            {ROLE_LIST.map((r) => (
              <div className="help-role" key={r.id}>
                <span><RoleIcon id={r.id} faction={r.faction} size={26} /></span>
                <div>
                  <h3>{r.name}</h3>
                  <small>
                    {factionName(r.faction)} ·{" "}
                    {r.nightOrder ? `밤 ${r.nightOrder}번째` : "밤 행동 없음"}
                  </small>
                  <p>{r.description}</p>
                  <b>{r.winCondition}</b>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
const buzz = (ms = 14) => navigator.vibrate?.(ms);
function NightTimer({ remain, total }: { remain: number; total: number }) {
  const C = 339.3;
  const ratio = Math.min(1, Math.max(0, remain / Math.max(1, total)));
  return (
    <div className={remain <= 2 ? "ring-wrap danger" : "ring-wrap"}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ring-bg" cx="60" cy="60" r="54" />
        <circle className="ring-fg" cx="60" cy="60" r="54" strokeDashoffset={C * (1 - ratio)} />
      </svg>
      <div className="timer">{Math.max(0, remain).toFixed(1)}</div>
    </div>
  );
}
const Panel = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={`panel ${className}`}>{children}</div>;
const Header = ({ kicker, title }: { kicker: string; title: string }) => (
  <header>
    <div className="eyebrow">{kicker}</div>
    <h1>{title}</h1>
    <div className="rule"><Icon.Sparkle /></div>
  </header>
);
const Back = ({ go }: { go: () => void }) => (
  <button className="back" onClick={go}>
    ← 돌아가기
  </button>
);
type PersonInfo = { nickname: string };
type CardInfo = { label: string; role: RoleType | null };
const peopleFrom = (data?: Record<string, unknown>) =>
  Array.isArray(data?.people) ? (data.people as PersonInfo[]) : [];
const cardsFrom = (data?: Record<string, unknown>) =>
  Array.isArray(data?.cards) ? (data.cards as CardInfo[]) : [];

function Context({ data }: { data?: Record<string, unknown> }) {
  if (!data) return null;
  if (data.kind === "people")
    return (
      <PeopleReveal
        title={String(data.title ?? "확인 결과")}
        people={peopleFrom(data)}
      />
    );
  if (data.kind === "cards")
    return (
      <RoleCards
        title={String(data.title ?? "확인 결과")}
        cards={cardsFrom(data)}
      />
    );
  return null;
}
function PeopleReveal({
  title,
  people,
}: {
  title: string;
  people: PersonInfo[];
}) {
  return (
    <Panel className="private-result people-reveal">
      <small><Icon.Lock /> 나만 보는 정보</small>
      <h3>{title}</h3>
      {people.length ? (
        <div className="name-reveal-list">
          {people.map((person, i) => (
            <motion.div
              className="name-reveal"
              key={`${person.nickname}-${i}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.12 }}
            >
              <div className="avatar">{person.nickname[0]}</div>
              <b>{person.nickname}</b>
            </motion.div>
          ))}
        </div>
      ) : (
        <p>확인된 사람이 없습니다.</p>
      )}
    </Panel>
  );
}
function RoleCards({ title, cards }: { title: string; cards: CardInfo[] }) {
  return (
    <Panel className="private-result card-result">
      <small><Icon.Lock /> 나만 보는 정보</small>
      <h3>{title}</h3>
      <p className="card-reveal-hint">카드가 자동으로 공개됩니다. 누르면 다시 가릴 수 있어요.</p>
      <div className="night-card-row">
        {cards.map((card, i) => (
          <RoleRevealCard
            card={card}
            index={i}
            key={`${title}-${card.label}-${card.role}-${i}`}
          />
        ))}
      </div>
    </Panel>
  );
}
function RoleRevealCard({ card, index }: { card: CardInfo; index: number }) {
  const role = card.role && ROLE_DEFINITIONS[card.role];
  // 처음부터 앞면 상태(true)로 시작 → 마운트 직후 0° → 180°로 자동 뒤집힘
  const [flipped, setFlipped] = useState(true);
  const firstFlip = useRef(true);
  return (
    <div className="night-card-wrap">
      <small>{card.label}</small>
      <motion.button
        type="button"
        className="night-role-card"
        aria-label={`${card.label} ${flipped ? "뒷면" : "앞면"} 보기`}
        aria-pressed={flipped}
        onClick={() => {
          buzz(20);
          firstFlip.current = false;
          setFlipped((value) => !value);
        }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.55, delay: firstFlip.current ? 0.45 + index * 0.12 : 0 }}
      >
        <div className="night-role-face night-role-back"><Sigil size={44} /></div>
        <div className="night-role-face night-role-front">
          <span><RoleIcon id={card.role ?? undefined} faction={role?.faction} size={46} /></span>
          <b>{role?.name ?? "알 수 없음"}</b>
          <small>{role && factionName(role.faction)}</small>
        </div>
      </motion.button>
    </div>
  );
}
function PrivateResult({ data }: { data: Record<string, unknown> }) {
  if (data.kind === "people" || data.kind === "cards")
    return <Context data={data} />;
  if (data.kind === "witch_seen")
    return (
      <RoleCards
        title="마법사가 확인한 센터 카드"
        cards={[
          {
            label: `센터 카드 ${Number(data.centerIndex) + 1}`,
            role: data.seenRole as RoleType,
          },
        ]}
      />
    );
  if (data.kind === "robber_swap")
    return (
      <Panel className="private-result">
        <small><Icon.Lock /> 도둑만 보는 결과</small>
        <h3>카드를 바꿨습니다</h3>
        <div className="swap-arrow">⇄</div>
        <div className="night-card-row">
          <RoleRevealCard
            card={{ label: "내 새 카드", role: data.myNewRole as RoleType }}
            index={0}
          />
        </div>
        <p className="card-reveal-hint">내 새 카드가 자동으로 공개됩니다. 누르면 다시 가릴 수 있어요.</p>
      </Panel>
    );
  if (data.kind === "troublemaker_swap")
    return (
      <Panel className="private-result">
        <small><Icon.Lock /> 말썽쟁이만 보는 결과</small>
        <h3>두 사람의 카드가 섞였습니다</h3>
        <div className="swap-animation">
          <motion.div
            animate={{ x: [0, 58, 58, 0], rotate: [0, 8, -8, 0] }}
            transition={{ duration: 1.25 }}
          >
            {String(data.firstNickname)}
          </motion.div>
          <b>⇄</b>
          <motion.div
            animate={{ x: [0, -58, -58, 0], rotate: [0, -8, 8, 0] }}
            transition={{ duration: 1.25 }}
          >
            {String(data.secondNickname)}
          </motion.div>
        </div>
        <p>교환된 역할은 확인할 수 없습니다.</p>
      </Panel>
    );
  if (data.kind === "witch_swap")
    return (
      <RoleCards
        title={`${String(data.targetNickname)}님과 센터 카드를 교환했습니다`}
        cards={[{ label: "확인한 센터 카드", role: data.seenRole as RoleType }]}
      />
    );
  if (data.kind === "copied")
    return (
      <RoleCards
        title={`${String(data.targetNickname)}님의 역할을 복사했습니다`}
        cards={[{ label: "복사한 역할", role: data.role as RoleType }]}
      />
    );
  const messages: Record<string, string> = {
    protected: `${String(data.nickname)}님을 보호했습니다.`,
    alpha_swap: `${String(data.targetNickname)}님의 카드를 늑대 카드와 교환했습니다.`,
    drunk_swap: `내 카드와 센터 카드 ${String(data.centerIndex)}번을 교환했습니다.`,
    confirmed: "정보를 확인했습니다.",
  };
  return (
    <div className="notice">
      <Icon.Lock /> {messages[String(data.kind)] ?? "행동이 완료되었습니다."}
    </div>
  );
}
function useCountdown(expires?: number | null, serverNow?: number) {
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const received = useRef<number>();
  if (serverNow && received.current !== serverNow) {
    offset.current = serverNow - Date.now();
    received.current = serverNow;
  }
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, ((expires ?? now) - (now + offset.current)) / 1000);
}
const factionName = (f: string) =>
  ({
    village: "마을 진영",
    werewolf: "늑대 진영",
    minion: "하수인 진영",
    tanner: "무두장이",
  })[f] ?? f;
const formatTime = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
const fitPreset = (p: RoleType[], n: number) => {
  const need = n + 3;
  const out = p.slice(0, need);
  const fallback: RoleType[] = [
    "insomniac",
    "hunter",
    "tanner",
    "apprentice_seer",
    "bodyguard",
    "prince",
    "cursed",
    "villager",
    "werewolf",
    "mason",
  ];
  for (const id of fallback) {
    while (
      out.length < need &&
      out.filter((x) => x === id).length < ROLE_DEFINITIONS[id].maxCount
    )
      out.push(id);
  }
  return out;
};
const autoPreset = (n: number) => fitPreset(PRESETS.recommended!, n);
const name = (r: NonNullable<ClientGameState["result"]>, id: string) =>
  r.players.find((p) => p.id === id)?.nickname ?? "?";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
