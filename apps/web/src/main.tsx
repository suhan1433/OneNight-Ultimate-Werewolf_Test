import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import ReactDOM from "react-dom/client";
import { createPortal } from "react-dom";
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
import "./storyboard.css";
import "./chat-mobile.css";
import "./profile.css";
import { Candle, CheckIcon, CopyIcon, CrownIcon, HeroScene, Icon, IconDefs, RoleIcon, Sigil, SunArc, VillageStrip, WaxSeal, WolfSilhouette } from "./icons";

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

/* ============================================================
   프로필 캐릭터 — 로비에서 고르면 원탁 · 채팅에 같은 캐릭터로 나온다
   · 선택값은 이 브라우저(localStorage)에 저장되고 서버(PROFILE_UPDATE)로도 보낸다
   · 서버가 players[].avatar 를 내려주면 모든 참가자에게 같은 캐릭터가 보인다
   ============================================================ */
type Character = { id: string; name: string; emoji: string; bg: string };
const CHARACTERS: Character[] = [
  { id: "wolf", name: "늑대", emoji: "🐺", bg: "linear-gradient(135deg,#6b7280,#374151)" },
  { id: "fox", name: "여우", emoji: "🦊", bg: "linear-gradient(135deg,#f59e0b,#b45309)" },
  { id: "owl", name: "올빼미", emoji: "🦉", bg: "linear-gradient(135deg,#a78b6d,#6b4f3a)" },
  { id: "cat", name: "고양이", emoji: "🐱", bg: "linear-gradient(135deg,#f9a8d4,#be5a8f)" },
  { id: "rabbit", name: "토끼", emoji: "🐰", bg: "linear-gradient(135deg,#e9d5ff,#9d7bd8)" },
  { id: "bear", name: "곰", emoji: "🐻", bg: "linear-gradient(135deg,#b4783c,#6e4421)" },
  { id: "bat", name: "박쥐", emoji: "🦇", bg: "linear-gradient(135deg,#6d5aa8,#2d2457)" },
  { id: "deer", name: "사슴", emoji: "🦌", bg: "linear-gradient(135deg,#d6a86a,#8a6030)" },
  { id: "frog", name: "개구리", emoji: "🐸", bg: "linear-gradient(135deg,#6ee7a0,#2f8f5b)" },
  { id: "lion", name: "사자", emoji: "🦁", bg: "linear-gradient(135deg,#fcd34d,#c2831a)" },
  { id: "panda", name: "판다", emoji: "🐼", bg: "linear-gradient(135deg,#e5e7eb,#7b8191)" },
  { id: "octopus", name: "문어", emoji: "🐙", bg: "linear-gradient(135deg,#fb7185,#a8304a)" },
  { id: "raccoon", name: "너구리", emoji: "🦝", bg: "linear-gradient(135deg,#9ca3af,#4b5563)" },
  { id: "penguin", name: "펭귄", emoji: "🐧", bg: "linear-gradient(135deg,#7dd3fc,#2a6f97)" },
  { id: "boar", name: "멧돼지", emoji: "🐗", bg: "linear-gradient(135deg,#a8805a,#5c3f26)" },
  { id: "turtle", name: "거북이", emoji: "🐢", bg: "linear-gradient(135deg,#86efac,#3b7d4f)" },
];
const PROFILE_KEY = "ww-profile-avatar";
const characterById = (id?: string | null) => CHARACTERS.find((c) => c.id === id);
const characterFallback = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CHARACTERS[h % CHARACTERS.length]!;
};

let myAvatarId: string | null = (() => {
  try { return localStorage.getItem(PROFILE_KEY); } catch { return null; }
})();
const profileListeners = new Set<() => void>();
const setMyAvatarId = (id: string) => {
  myAvatarId = id;
  try { localStorage.setItem(PROFILE_KEY, id); } catch { /* noop */ }
  profileListeners.forEach((fn) => fn());
};
const useMyAvatarId = () =>
  useSyncExternalStore(
    (fn) => { profileListeners.add(fn); return () => profileListeners.delete(fn); },
    () => myAvatarId,
    () => null,
  );
// 서버가 players[].avatar 를 내려주면 그 값을 쓴다(아직 없으면 undefined).
const serverAvatarId = (p?: unknown) => (p as { avatar?: string } | undefined)?.avatar;
const syncAvatar = (game: ClientGameState, avatar: string) => {
  void emitAck("PROFILE_UPDATE", { ...req(game), avatar }).catch(() => { /* 서버 미지원이어도 로컬 프로필은 유지 */ });
};
/* playerId → 캐릭터. 내 것은 로컬 선택이 우선, 그 외는 서버 값, 없으면 playerId 기반 고정 기본값.
   players/myId 를 안 넘겨도 현재 게임 상태(store)에서 찾아 쓴다 → 어느 화면에서든 같은 캐릭터 */
function useCharacterResolver(players?: { id: string }[], myId?: string) {
  const mine = useMyAvatarId();
  const game = useGame((s) => s.game);
  const me = myId ?? game?.playerId;
  return (playerId: string): Character => {
    const server =
      serverAvatarId(game?.players.find((x) => x.id === playerId)) ?? serverAvatarId(players?.find((x) => x.id === playerId));
    const id = playerId === me ? mine ?? server : server;
    return characterById(id) ?? characterFallback(playerId);
  };
}
const CharacterAvatar = ({ c, size = 40 }: { c: Character; size?: number }) => (
  <span className="char-avatar" style={{ width: size, height: size, fontSize: size * 0.56, background: c.bg }} aria-hidden="true">
    {c.emoji}
  </span>
);

/* 어느 화면에서든 playerId(또는 닉네임)만 주면 그 사람의 프로필 캐릭터를 그려준다 */
function PlayerAvatar({ playerId, nickname, size = 40 }: { playerId?: string; nickname?: string; size?: number }) {
  const resolve = useCharacterResolver();
  const game = useGame((s) => s.game);
  const key = playerId ?? game?.players.find((p) => p.nickname === nickname)?.id ?? nickname ?? "";
  return <CharacterAvatar c={resolve(key)} size={size} />;
}

function ProfileDialog({ game, onClose }: { game: ClientGameState; onClose: () => void }) {
  const me = game.players.find((p) => p.id === game.playerId);
  const resolve = useCharacterResolver(game.players, game.playerId);
  const current = resolve(game.playerId);
  const [picked, setPicked] = useState(current.id);
  const taken = new Set(
    game.players.filter((p) => p.id !== game.playerId).map((p) => serverAvatarId(p)).filter(Boolean) as string[],
  );
  const chosen = characterById(picked) ?? current;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = () => {
    setMyAvatarId(picked);
    syncAvatar(game, picked);
    buzz(12);
    onClose();
  };
  return createPortal(
    <div className="profile-backdrop" onClick={onClose}>
      <div className="profile-dialog" role="dialog" aria-modal="true" aria-label="프로필 수정" onClick={(e) => e.stopPropagation()}>
        <h3>프로필 수정</h3>
        <div className="profile-preview">
          <CharacterAvatar c={chosen} size={76} />
          <div>
            <b>{me?.nickname ?? ""}</b>
            <small>{chosen.name}</small>
          </div>
        </div>
        <p className="profile-sub">채팅과 원탁에서 이 캐릭터로 표시돼요.</p>
        <div className="profile-grid" role="radiogroup" aria-label="캐릭터 선택">
          {CHARACTERS.map((c) => {
            const used = taken.has(c.id);
            return (
              <button
                type="button"
                key={c.id}
                role="radio"
                aria-checked={picked === c.id}
                aria-label={`${c.name}${used ? " (사용 중)" : ""}`}
                className={`profile-option${picked === c.id ? " on" : ""}`}
                disabled={used}
                onClick={() => setPicked(c.id)}
              >
                <CharacterAvatar c={c} size={46} />
                <span>{used ? "사용 중" : c.name}</span>
              </button>
            );
          })}
        </div>
        <div className="profile-actions">
          <button type="button" className="profile-cancel" onClick={onClose}>취소</button>
          <button type="button" className="profile-save" onClick={save}>저장</button>
        </div>
      </div>
    </div>,
    document.querySelector("main") ?? document.body,
  );
}

function App() {
  const { game, tts, help, error, connectionState, setTts, setHelp, setError } = useGame();
  const [nightRecordOpen, setNightRecordOpen] = useState(false);
  // 웹폰트가 준비되기 전에는 인트로를 시작하지 않는다(타이틀이 폰트 교체로 튀는 것 방지)
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    const go = () => setFontsReady(true);
    void document.fonts?.ready.then(go);
    const t = window.setTimeout(go, 1500);
    return () => window.clearTimeout(t);
  }, []);
  // 밤 → 낮으로 넘어온 순간에만 새벽 연출(fresh)을 재생한다. 재접속은 건너뛴다.
  const prevPhase = useRef(game?.phase);
  const [dawn, setDawn] = useState(false);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = game?.phase;
    if (game?.phase === "day" && prev === "night") {
      setDawn(true);
      const timer = window.setTimeout(() => setDawn(false), 6500);
      return () => window.clearTimeout(timer);
    }
    if (game?.phase !== "day") setDawn(false);
  }, [game?.phase]);
  useEffect(() => {
    if (game?.phase === "lobby") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      try { sessionStorage.removeItem("ww-result-seen"); } catch { /* noop */ }
    }
  }, [game?.phase]);
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
    <main data-ready={fontsReady ? "1" : undefined} className={`phase-${game?.phase ?? "home"} ${game?.phase === "day" ? "day" : ""}`}>
      <IconDefs />
      <div className="mist" />
      <div className="meteor" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      {dawn && <DawnSky />}
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
          initial={
            game?.phase === "lobby"
              ? { opacity: 0, scale: 1.14, filter: "blur(12px)" } // 마을에서 방 안으로 들어가는 카메라
              : { opacity: 0, y: 14, filter: "blur(10px)" }
          }
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(8px)" }}
          transition={{ duration: game?.phase === "lobby" ? 0.9 : 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {game ? <Game game={game} dawn={dawn} /> : <Home />}
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

/* 고정 레이어(fixed)는 shell의 filter 때문에 갇히므로, 전체 화면 연출은 main 안으로 포털한다 */
function InMain({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => setHost(document.querySelector("main")), []);
  return host ? createPortal(children, host) : null;
}

/* 타격의 순간: 한 번의 섬광(진영 색). 흔들림은 CSS가 맡는다 */
function ImpactFlash({ faction, delay = 0.42 }: { faction: string; delay?: number }) {
  return (
    <InMain>
      <div className={`impact-flash faction-${faction}`} style={{ animationDelay: `${delay}s` }} aria-hidden="true" />
    </InMain>
  );
}

/* 낮 시작: 암전 → 지평선에서 해가 떠오르며 밤을 걷어낸다 */
function DawnSky() {
  return (
    <div className="dawn-sky" aria-hidden="true">
      <i className="dawn-sun" />
    </div>
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
  // 재방문자는 홈 연출을 1초 안팎의 짧은 버전으로 본다
  const [returning] = useState(() => {
    try { return localStorage.getItem("ww-home-seen") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("ww-home-seen", "1"); } catch { /* noop */ }
  }, []);
  const heroRef = useRef<HTMLElement>(null);
  const parallax = (e: React.PointerEvent) => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty("--px", ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
    el.style.setProperty("--py", ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
  };
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
  const pasteRoomCode = async () => {
    try {
      setRoomCode(normalizeRoomCode(await navigator.clipboard.readText()));
    } catch {
      useGame.getState().setError("클립보드에 접근할 수 없습니다. 코드 입력창을 길게 눌러 붙여넣어 주세요.");
    }
  };
  if (mode === "home")
    return (
      <section ref={heroRef} onPointerMove={parallax} className={`hero${returning ? " returning" : ""}`}>
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
            <div className="code-field tiled">
              <CodeTiles value={roomCode} />
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
                aria-label="방 코드 6자리"
              />
              <button type="button" className="paste-code" onClick={pasteRoomCode}>
                붙여넣기
              </button>
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

/* 코드 한 글자씩 타일로. cur = 다음에 입력될 칸. 글자가 바뀔 때마다 타일이 뒤집히며 채워지고, 마지막 글자에서 전부 한 번 빛난다 */
function CodeTiles({ value, length = 6 }: { value: string; length?: number }) {
  return (
    <div className={`code-tiles${value.length === length ? " full" : ""}`} aria-label={`코드 ${value}`}>
      {Array.from({ length }, (_, i) => (
        <span key={`${i}-${value[i] ?? ""}`} className={value[i] ? "on" : i === value.length ? "cur" : ""}>
          {value[i] ?? ""}
        </span>
      ))}
    </div>
  );
}

/* 대기실 원탁: 들어온 사람의 자리에 가면이 앉는다 */
function RoundTable({ game, onEditMe }: { game: ClientGameState; onEditMe: () => void }) {
  const n = game.maxPlayers;
  const resolve = useCharacterResolver(game.players, game.playerId);
  const allReady = game.players.length === n && game.players.every((p) => p.isReady);
  return (
    <div className={`round-table${allReady ? " all-ready" : ""}`} role="list" aria-label="참가자">
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
        const isMe = p.id === game.playerId;
        const ch = resolve(p.id);
        return (
          <div
            className={`seat${p.isReady ? " ready" : ""}${isMe ? " me" : ""}`}
            role="listitem"
            aria-label={`${p.nickname}, ${ch.name}${p.isHost ? ", 방장" : ""}${p.isBot ? ", 봇" : ""}, ${p.isReady ? "준비됨" : "대기 중"}`}
            style={style}
            key={p.id}
            onClick={isMe ? onEditMe : undefined}
          >
            <div className="seat-face">
              <CharacterAvatar c={ch} size={50} />
              {p.isHost && <CrownIcon />}
              {p.isReady && <i className="tick"><CheckIcon size={11} /></i>}
              <i className="seat-flame" aria-hidden="true" />
              {isMe && (
                <button type="button" className="seat-edit" aria-label="내 프로필 수정" onClick={(e) => { e.stopPropagation(); onEditMe(); }}>
                  ✎
                </button>
              )}
            </div>
            <b>{p.nickname}</b>
            {p.isBot && <em>봇</em>}
          </div>
        );
      })}
    </div>
  );
}

function Game({ game, dawn }: { game: ClientGameState; dawn: boolean }) {
  if (game.phase === "lobby") return <Lobby game={game} />;
  if (game.phase === "card_reveal") return <Reveal game={game} />;
  if (game.phase === "night") return <Night game={game} />;
  if (game.phase === "day") return <Day game={game} fresh={dawn} />;
  if (game.phase === "voting") return <Voting game={game} />;
  return <Result game={game} />;
}
function Lobby({ game }: { game: ClientGameState }) {
  const me = game.players.find((p) => p.id === game.playerId)!;
  const full = game.players.length === game.maxPlayers;
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // 입장하면 아직 안 쓰인 캐릭터를 자동 배정하고(저장된 선택이 있으면 그대로), 서버에 알린다.
  const lastSynced = useRef("");
  const avatarSig = game.players.map((p) => `${p.id}:${serverAvatarId(p) ?? ""}`).join(",");
  useEffect(() => {
    const taken = new Set(
      game.players.filter((p) => p.id !== game.playerId).map((p) => serverAvatarId(p)).filter(Boolean) as string[],
    );
    let id = myAvatarId;
    if (!characterById(id) || taken.has(id!)) {
      const free = CHARACTERS.filter((c) => !taken.has(c.id));
      const pool = free.length ? free : CHARACTERS;
      id = pool[Math.floor(Math.random() * pool.length)]!.id;
      setMyAvatarId(id);
    }
    const key = `${game.roomCode}:${id}`;
    if (serverAvatarId(me) !== id && lastSynced.current !== key) {
      lastSynced.current = key;
      syncAvatar(game, id!);
    }
  }, [avatarSig, game.roomCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = game.players.length / Math.max(1, game.maxPlayers);
  const copyCode = () => {
    navigator.clipboard?.writeText(game.roomCode);
    buzz(12);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const deckReady = game.selectedRoles.length === game.maxPlayers + 3;
  const canStart = full && deckReady && game.players.every((p) => p.isReady);
  const readyCount = game.players.filter((p) => p.isReady).length;
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
  const start = async () => {
    setStarting(true); // 촛불이 일렁이고 조도가 20%로 떨어진다
    try {
      await emitAck("GAME_START", req(game));
      window.setTimeout(() => setStarting(false), 6000);
    } catch (e) {
      setStarting(false);
      useGame.getState().setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    }
  };
  return (
    <section className={`lobby-scene${starting ? " starting" : ""}`}>
      <InMain>
        <div className="lobby-warm" style={{ opacity: 0.12 + fill * 0.88 }} aria-hidden="true" />
        {starting && (
          <>
            <div className="lobby-dim" aria-hidden="true" />
            <div className="lobby-beat" aria-hidden="true" />
          </>
        )}
      </InMain>
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
      <RoundTable game={game} onEditMe={() => setProfileOpen(true)} />
      <p className="profile-hint">내 자리를 눌러 캐릭터를 바꿀 수 있어요</p>
      {profileOpen && <ProfileDialog game={game} onClose={() => setProfileOpen(false)} />}
      <div className={`lobby-actions${game.hostId === game.playerId ? " host" : ""}`}>
        <button
          className={`lobby-ready${me.isReady ? " is-ready" : ""}`}
          aria-pressed={me.isReady}
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
            className={`lobby-start${canStart ? " unlocked" : ""}`}
            disabled={!canStart || starting}
            onClick={start}
          >
            {!full
              ? `인원 대기 ${game.players.length}/${game.maxPlayers}`
              : !deckReady
                ? "직업 구성 확인"
                : !canStart
                  ? `준비 대기 ${readyCount}/${game.players.length}`
                  : "게임 시작"}
          </button>
        )}
      </div>
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
    </section>
  );
}
const REVEAL_HOLD_MS = 1400;
/* 카드 공개: 어둠 속 한 장 → 꾹 눌러 금빛이 차오름 → 0.45초 정적 → 뒤집힘 + 진영 색 충격파
   진영 색은 뒤집히는 순간 전까지 DOM에 클래스로 존재하지 않는다(곁눈질 방지). */
function Reveal({ game }: { game: ClientGameState }) {
  const me = game.players.find((p) => p.id === game.playerId)!;
  const r = game.selfRole && ROLE_DEFINITIONS[game.selfRole];
  const [stage, setStage] = useState<"idle" | "holding" | "hush" | "revealed">("idle");
  const [hold, setHold] = useState(0);
  const [tint, setTint] = useState(false);
  const [sent, setSent] = useState(false);
  const raf = useRef(0);
  const hushTimer = useRef<number>();
  const startedAt = useRef(0);
  const tiltRef = useRef<HTMLDivElement>(null);
  const tilt = (e: React.PointerEvent) => {
    const el = tiltRef.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const x = (e.clientX - b.left) / b.width - 0.5;
    const y = (e.clientY - b.top) / b.height - 0.5;
    el.style.setProperty("--tx", `${(-y * 14).toFixed(2)}deg`);
    el.style.setProperty("--ty", `${(x * 18).toFixed(2)}deg`);
  };
  const untilt = () => {
    tiltRef.current?.style.setProperty("--tx", "0deg");
    tiltRef.current?.style.setProperty("--ty", "0deg");
  };
  const locked = me.hasConfirmedCard || sent;
  const faction = r?.faction ?? "village";
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(hushTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (stage === "revealed") {
      setTint(true);
      return;
    }
    const t = window.setTimeout(() => setTint(false), 1000); // 다시 뒤집히는 동안은 색을 유지
    return () => window.clearTimeout(t);
  }, [stage]);
  useEffect(() => {
    if (me.hasConfirmedCard) {
      window.clearTimeout(hushTimer.current);
      setStage("idle");
      setHold(0);
    }
  }, [me.hasConfirmedCard]);
  const complete = () => {
    cancelAnimationFrame(raf.current);
    setHold(1);
    setStage("hush");
    hushTimer.current = window.setTimeout(() => setStage("revealed"), 450);
  };
  const begin = () => {
    if (stage !== "idle" || locked) return;
    setStage("holding");
    startedAt.current = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - startedAt.current) / REVEAL_HOLD_MS);
      setHold(p);
      if (p >= 1) complete();
      else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const release = () => {
    if (stage !== "holding") return;
    cancelAnimationFrame(raf.current);
    setStage("idle");
    setHold(0);
  };
  const confirm = () => {
    if (stage !== "revealed" || locked) return;
    setSent(true);
    setStage("idle"); // 카드가 다시 뒷면으로 덮인다
    setHold(0);
    void event("CARD_CONFIRM", req(game));
  };
  const up = stage === "revealed" || locked;
  return (
    <section className={`center reveal s-${stage}${locked ? " confirmed" : ""}`}>
      <div className="moon smallmoon">☾</div>
      <Header kicker="YOUR SECRET" title={`${me.nickname}님의 카드`} />
      <p>주변에 아무도 보고 있지 않은지 확인하세요.</p>
      <div className="card-stage" onPointerMove={tilt} onPointerLeave={untilt} onPointerUp={untilt}>
        <div className="card-tilt" ref={tiltRef}>
        <motion.div
          className="flip"
          role="button"
          tabIndex={0}
          aria-label="카드를 꾹 눌러 내 역할 확인 (키보드: Enter)"
          style={{ ["--hold" as string]: hold } as never}
          animate={{ rotateY: stage === "revealed" ? 180 : 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            begin();
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && stage === "idle" && !locked) {
              e.preventDefault();
              complete();
            }
          }}
        >
          <svg className="hold-ring" viewBox="0 0 248 358" aria-hidden="true">
            <rect x="4" y="4" width="240" height="350" rx="22" pathLength={1} strokeDasharray={`${hold} 1`} />
          </svg>
          <div className="card-face back">
            <Sigil size={84} />
            <small>{stage === "holding" ? "계속 누르세요…" : "꾹 눌러 역할 확인"}</small>
          </div>
          <div
            className={`card-face front${tint ? ` faction-${faction}` : ""}`}
            aria-hidden={stage !== "revealed"}
          >
            <span><RoleIcon id={game.selfRole ?? undefined} faction={r?.faction} size={76} /></span>
            <h2 aria-label={r?.name}>
              {[...(r?.name ?? "")].map((ch, i) => (
                <span className="ch" style={{ ["--c" as string]: i } as React.CSSProperties} aria-hidden="true" key={i}>
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </h2>
            <b>{r && factionName(r.faction)}</b>
            <p>{r?.description}</p>
          </div>
        </motion.div>
        </div>
        {stage === "revealed" && (
          <>
            <div className={`flip-burst faction-${faction}`} aria-hidden="true" />
            <ImpactFlash faction={faction} />
          </>
        )}
      </div>
      <button
        className={`reveal-confirm${up ? " up" : ""}`}
        disabled={stage !== "revealed" || locked}
        onClick={confirm}
      >
        {locked ? "다른 플레이어를 기다리는 중" : "역할을 확인했습니다"}
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
                  <PlayerAvatar playerId={p.id} size={40} />
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
/* ------------------------------------------------------------------
   채팅 UI — 모바일 메신저(카카오톡·iMessage·텔레그램·디스코드) 패턴
   · 모바일에서 입력창/대화를 누르면 전체 화면 채팅 시트로 확장
   · 시트 높이는 visualViewport 에 맞춰 키보드 바로 위에 입력창을 고정
   · 대화 목록만 스크롤, 헤더·입력창은 항상 제자리
   · 읽던 위치 보호(위로 스크롤 시 자동 스크롤 중단 + "새 메시지" 버튼)
   · 같은 사람의 연속 메시지는 묶어서 표시, 시간은 묶음 마지막에만 표시
   ------------------------------------------------------------------ */
const CHAT_MOBILE_QUERY = "(max-width: 640px), (pointer: coarse) and (max-width: 900px)";
const CHAT_GROUP_MS = 3 * 60_000;
type ChatMsg = ClientGameState["chat"][number];
const formatChatTime = (at: number) =>
  new Date(at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });

function useChatMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(CHAT_MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(CHAT_MOBILE_QUERY);
    const update = () => setMobile(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

function ChatMessages({ messages, myId, players, inline, onTap }: { messages: ChatMsg[]; myId: string; players: ClientGameState["players"]; inline?: boolean; onTap?: () => void }) {
  const resolve = useCharacterResolver(players, myId);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const seen = useRef(messages.length);
  const [unread, setUnread] = useState(0);
  const toBottom = (smooth = false) => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };
  useLayoutEffect(() => { toBottom(); }, []);
  useLayoutEffect(() => {
    const added = messages.length - seen.current;
    seen.current = messages.length;
    if (added <= 0) return;
    // 내가 보냈거나 맨 아래를 보고 있으면 따라가고, 위쪽을 읽는 중이면 위치를 지킨다.
    if (stick.current || messages[messages.length - 1]?.playerId === myId) { toBottom(); setUnread(0); }
    else setUnread((n) => n + added);
  }, [messages.length]);
  useEffect(() => {
    // 키보드가 열리거나 입력창이 늘어나 목록 높이가 바뀌어도 맨 아래를 유지한다.
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (stick.current) toBottom(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current) setUnread(0);
  };
  const joins = (a?: ChatMsg, b?: ChatMsg) => !!a && !!b && a.playerId === b.playerId && b.at - a.at < CHAT_GROUP_MS;
  return (
    <div className={`chat-list-wrap${inline ? " inline" : ""}`}>
      <div className="chat-list" ref={listRef} onScroll={onScroll} onClick={onTap} role="log" aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">아직 대화가 없습니다.<br />첫 마디를 건네보세요.</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const mine = m.playerId === myId;
          const first = !joins(prev, m);
          const last = !next || !joins(m, next) || formatChatTime(next.at) !== formatChatTime(m.at);
          return (
            <div key={m.id} className={`chat-msg${mine ? " mine" : ""}${first ? " first" : ""}${last ? " last" : ""}`}>
              {!mine && (
                <i className={`chat-avatar${first ? " has-char" : ""}`} style={first ? { background: resolve(m.playerId).bg } : undefined} aria-hidden="true">
                  {first ? resolve(m.playerId).emoji : ""}
                </i>
              )}
              <div className="chat-msg-main">
                {!mine && first && <b>{m.nickname}</b>}
                <div className="chat-bubble-row">
                  <span className="chat-bubble">{m.text}</span>
                  {last && <time>{formatChatTime(m.at)}</time>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {unread > 0 && (
        <button type="button" className="chat-new" onClick={() => { toBottom(true); setUnread(0); }}>
          새 메시지 {unread > 1 ? `${unread}개 ` : ""}↓
        </button>
      )}
    </div>
  );
}

const SendArrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
  </svg>
);

function ChatComposer({ text, setText, placeholder, onSend, inputRef, autoFocus }: {
  text: string;
  setText: (value: string) => void;
  placeholder: string;
  onSend: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  autoFocus?: boolean;
}) {
  useLayoutEffect(() => {
    // 줄이 늘어나면 입력창도 최대 약 4줄까지 함께 커진다.
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return (
    <form className="chat-composer" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
      <textarea
        ref={inputRef}
        rows={1}
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // 데스크톱: Enter 전송 / Shift+Enter 줄바꿈. 모바일: Enter 는 줄바꿈, 전송은 버튼.
          // 한글 조합 중 Enter(isComposing)는 마지막 글자가 두 번 보내지지 않도록 무시한다.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !coarse) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <button
        type="submit"
        className="chat-send"
        aria-label="전송"
        disabled={!text.trim()}
        // 전송 버튼을 눌러도 입력창 포커스(= 키보드)가 내려가지 않게 한다.
        onMouseDown={(e) => e.preventDefault()}
      >
        <SendArrow />
      </button>
    </form>
  );
}

function ChatPanel({ game, scope, title, placeholder, status }: { game: ClientGameState; scope: 'day' | 'lobby'; title: string; placeholder: string; status?: React.ReactNode }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const focusOnOpen = useRef(false);
  const isMobile = useChatMobile();
  const sheetOpen = isMobile && open;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const messages = scope === 'lobby' ? game.lobbyChat : game.chat;

  const openSheet = (withKeyboard: boolean) => { focusOnOpen.current = withKeyboard; setOpen(true); };
  const closeSheet = () => { inputRef.current?.blur(); setOpen(false); };

  // 시트가 열려 있는 동안: 배경 스크롤 잠금 + 키보드를 뺀 보이는 영역에 높이 맞춤.
  useEffect(() => {
    if (!sheetOpen) return;
    const root = document.documentElement;
    root.classList.add("chat-open");
    const vv = window.visualViewport;
    const sheet = sheetRef.current;
    const fit = () => {
      if (!sheet) return;
      const h = vv?.height ?? window.innerHeight;
      sheet.style.setProperty("--chat-h", `${h}px`);
      sheet.style.setProperty("--chat-top", `${vv?.offsetTop ?? 0}px`);
      sheet.dataset.keyboard = String(window.innerHeight - h > 120);
    };
    fit();
    vv?.addEventListener("resize", fit);
    vv?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    return () => {
      vv?.removeEventListener("resize", fit);
      vv?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      root.classList.remove("chat-open");
    };
  }, [sheetOpen]);

  // 안드로이드 뒤로가기 버튼 / iOS 스와이프 뒤로가기로 시트만 닫는다.
  useEffect(() => {
    if (!sheetOpen) return;
    history.pushState({ chatSheet: true }, "");
    const onPop = () => setOpen(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (history.state?.chatSheet) history.back();
    };
  }, [sheetOpen]);

  const sendChat = () => {
    const value = text.trim();
    if (!value) return;
    const message = { id: crypto.randomUUID(), playerId: game.playerId, nickname: game.players.find((p) => p.id === game.playerId)?.nickname ?? "", text: value, at: Date.now() };
    setText("");
    // 보낸 뒤에도 키보드를 유지해 연속으로 바로 입력할 수 있게 한다.
    inputRef.current?.focus();
    useGame.getState().addChat(message, scope);
    void emitAck("CHAT_SEND", { ...req(game), messageId: message.id, text: value })
      .catch((error) => {
        useGame.getState().removeChat(message.id, scope);
        useGame.getState().setError(error instanceof Error ? error.message : "채팅을 보내지 못했습니다.");
      });
  };

  const host = document.querySelector("main") ?? document.body;
  return (
    <Panel className="chat-panel">
      <h3>{title}</h3>
      <ChatMessages messages={messages} myId={game.playerId} players={game.players} inline onTap={isMobile ? () => openSheet(false) : undefined} />
      {isMobile ? (
        <button type="button" className="chat-fake-input" onClick={() => openSheet(true)}>
          <span>{placeholder}</span>
          <i aria-hidden="true"><SendArrow /></i>
        </button>
      ) : (
        <ChatComposer text={text} setText={setText} placeholder={placeholder} onSend={sendChat} inputRef={inputRef} />
      )}
      {sheetOpen && createPortal(
        <div className="chat-sheet" ref={sheetRef} role="dialog" aria-label={title}>
          <div className="chat-sheet-head">
            <button type="button" className="chat-sheet-back" onClick={closeSheet} aria-label="채팅 닫기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <strong className="chat-sheet-title">{title}</strong>
            {status}
          </div>
          <ChatMessages messages={messages} myId={game.playerId} players={game.players} onTap={() => inputRef.current?.blur()} />
          <div className="chat-sheet-foot">
            <ChatComposer text={text} setText={setText} placeholder={placeholder} onSend={sendChat} inputRef={inputRef} autoFocus={focusOnOpen.current} />
          </div>
        </div>,
        host,
      )}
    </Panel>
  );
}
function Day({ game, fresh }: { game: ClientGameState; fresh: boolean }) {
  const remain = useCountdown(game.dayExpiresAt, game.serverNow);
  const synced = useRef(false);
  const total = Math.max(1, game.settings.dayTimeLimitSeconds);
  const [tab, setTab] = useState<"chat" | "info">("chat");
  const used = [...new Set(game.selectedRoles)];
  useEffect(() => {
    if (remain <= 0 && !synced.current) {
      synced.current = true;
      syncRoom();
    }
  }, [remain]);
  const progress = Math.min(1, Math.max(0, 1 - remain / total));
  const dusk = progress >= 0.7; // 시간 후반: 하늘이 노을로 기운다
  const urgent = remain <= 10; // 마지막 10초: 숫자가 커지고 가장자리가 붉게 맥박친다
  const ratio = game.totalPlayers ? game.dayVoteRequests / game.totalPlayers : 0;
  return (
    <section className={`day-scene${dusk ? " dusk" : ""}${urgent ? " urgent" : ""}${fresh ? " fresh" : ""}`}>
      <Header kicker="DAYBREAK" title="날이 밝았습니다" />
      <div className="sun-timer">
        <SunArc p={progress} />
        <b className={urgent ? "urgent" : ""}>{formatTime(remain)}</b>
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
        <ChatPanel
          game={game}
          scope="day"
          title="마을 대화"
          placeholder="의심과 단서를 나누세요"
          status={<span className={`chat-sheet-timer${urgent ? " urgent" : ""}`}>☀ {formatTime(remain)}</span>}
        />
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
      <div className={`vote-dock${ratio >= 1 ? " full" : ""}`}>
        <button
          className="vote-request"
          style={{ ["--p" as string]: `${ratio * 100}%`, ["--k" as string]: ratio } as React.CSSProperties}
          disabled={game.hasRequestedDayVote}
          onClick={() => event("DAY_START", req(game))}
        >
          <span>{game.hasRequestedDayVote ? "투표 동의 완료" : "투표하기 동의"}</span>
          <em>
            {game.dayVoteRequests} / {game.totalPlayers}
          </em>
        </button>
        {ratio >= 1 && <WaxSeal size={46} />}
      </div>
    </section>
  );
}

/* 꾹 눌러야 확정된다. 누르는 동안 게이지가 차고 화면 가장자리가 좁아진다. 키보드(Enter/Space)는 즉시 확정 */
const VOTE_HOLD_MS = 1100;
const setVignette = (v: number) => document.documentElement.style.setProperty("--hold-v", String(v));
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
  const [holding, setHolding] = useState(false);
  const raf = useRef(0);
  const t0 = useRef(0);
  const fired = useRef(false);
  const off = disabled || done;
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      setVignette(0);
    },
    [],
  );
  useEffect(() => {
    if (done) setP(1);
    else {
      fired.current = false; // 서버 거절로 롤백되면 다시 누를 수 있다
      setP(0);
    }
  }, [done]);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    setHolding(false);
    if (!fired.current) {
      setP(0);
      setVignette(0);
    }
  };
  const start = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (off || fired.current || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setHolding(true);
    t0.current = performance.now();
    const tick = (now: number) => {
      const v = Math.min(1, (now - t0.current) / VOTE_HOLD_MS);
      setP(v);
      setVignette(v);
      if (v >= 1) {
        fired.current = true;
        setHolding(false);
        setVignette(0);
        onConfirm();
      } else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  return (
    <button
      className={`hold-confirm${done ? " done" : ""}${holding ? " holding" : ""}`}
      style={{ ["--hold" as string]: p } as React.CSSProperties}
      disabled={off}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        // 키보드로 발생한 click(detail 0)만 즉시 확정. 포인터는 위의 길게 누르기로 처리
        if (e.detail === 0 && !off && !fired.current) {
          fired.current = true;
          onConfirm();
        }
      }}
    >
      <span>{done ? doneLabel : holding ? "계속 누르세요…" : label}</span>
    </button>
  );
}

function Voting({ game }: { game: ClientGameState }) {
  const [target, setTarget] = useState("");
  const me = game.players.find((p) => p.id === game.playerId)!;
  const others = game.players.filter((p) => p.id !== game.playerId);
  const allLit = game.totalPlayers > 0 && game.votesCompleted >= game.totalPlayers;
  return (
    <section className={`voting-scene${me.hasVoted ? " voted" : ""}${allLit ? " all-lit" : ""}`}>
      <Header kicker="THE VERDICT" title="운명의 투표" />
      <p>가장 의심스러운 한 명을 선택하세요. 확정 후에는 바꿀 수 없습니다.</p>
      <div className="vote-grid">
        {others.map((p, i) => (
          <div className="suspect-wrap" style={{ ["--i" as string]: i } as React.CSSProperties} key={p.id}>
            <button
              className={`suspect ${target === p.id ? "vote selected" : "vote"}`}
              onClick={() => setTarget(p.id)}
              disabled={me.hasVoted}
              aria-pressed={target === p.id}
            >
              <PlayerAvatar playerId={p.id} size={64} />
              <b>{p.nickname}</b>
              {target === p.id && <WaxSeal size={40} />}
            </button>
          </div>
        ))}
      </div>
      <HoldConfirm
        disabled={!target}
        done={me.hasVoted}
        label={target ? "꾹 눌러 이 선택으로 확정" : "의심되는 사람을 고르세요"}
        doneLabel="투표 완료 · 결과 대기 중"
        onConfirm={() =>
          optimistic(() => useGame.getState().confirmVote(), "VOTE_CONFIRM", {
            ...req(game),
            targetPlayerId: target,
          })
        }
      />
      <div className={`candles${allLit ? " all-lit" : ""}`} role="img" aria-label={`${game.votesCompleted} / ${game.totalPlayers}명 투표 완료`}>
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
/* ============================================================
   결과 공개 — 개표(화살) → 정적 → 처형 카드 → 승리 선언 → 정체 카드 → 요약
   stage: 0 암전 · 1 개표 · 2 정적/카드 상승 · 3 뒤집힘 · 4 승리 선언 · 5 정체 공개 · 6 요약
   ============================================================ */
type ResultData = NonNullable<ClientGameState["result"]>;
type ResultPlayer = ResultData["players"][number];
type EndingKind = "village" | "wolf" | "tanner" | "none";

const endingOf = (r: ResultData): EndingKind => {
  const f = String(r.winners[0] ?? "none");
  return f === "village" ? "village" : f === "werewolf" || f === "minion" ? "wolf" : f === "tanner" ? "tanner" : "none";
};

function WinnerBlock({ r, stamped }: { r: ResultData; stamped: boolean }) {
  const f = String(r.winners[0] ?? "none");
  const win = r.winners.length ? r.winners.map(factionName).join(" · ") : "승자 없음";
  const iconId: Record<string, string> = { village: "villager", werewolf: "werewolf", minion: "minion", tanner: "tanner" };
  return (
    <div className={`winner faction-${f}${stamped ? " stamped" : ""}`}>
      <div>{iconId[f] ? <RoleIcon id={iconId[f]} faction={f} size={56} /> : <Icon.Sparkle />}</div>
      <span>THE NIGHT IS OVER</span>
      <h1>
        {win}
        <br />
        <i>승리</i>
      </h1>
    </div>
  );
}

/* 누가 누구를 지목했는지: 아바타에서 대상으로 화살이 한 줄씩 그어지고, 밀랍 도장이 쌓인다 */
function TallyBoard({ r }: { r: ResultData }) {
  const n = r.players.length;
  const pos = (i: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + Math.cos(a) * 36, y: 50 + Math.sin(a) * 36 };
  };
  const index = new Map(r.players.map((p, i) => [p.id, i] as const));
  const votes = Object.entries(r.votes).filter(([from, to]) => index.has(from) && index.has(to));
  const step = Math.min(0.45, 1.5 / Math.max(1, votes.length));
  const landed: Record<string, number> = {};
  const marks = votes.map(([from, to], k) => {
    const a = pos(index.get(from)!);
    const b = pos(index.get(to)!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = a.x + ux * 9;
    const sy = a.y + uy * 9;
    const ex = b.x - ux * 10.5;
    const ey = b.y - uy * 10.5;
    const mx = (sx + ex) / 2 - uy * 7;
    const my = (sy + ey) / 2 + ux * 7;
    const ang = (Math.atan2(ey - my, ex - mx) * 180) / Math.PI;
    const j = landed[to] ?? 0;
    landed[to] = j + 1;
    return {
      from,
      to,
      j,
      d: `M${sx} ${sy}Q${mx} ${my} ${ex} ${ey}`,
      head: `translate(${ex} ${ey}) rotate(${ang})`,
      delay: 0.35 + k * step,
      b,
    };
  });
  const end = 0.35 + votes.length * step + 0.5;
  return (
    <div className="tally-board" role="img" aria-label="투표 집계">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {marks.map((m) => (
          <g key={m.from}>
            <path className="tally-line" pathLength={1} d={m.d} style={{ animationDelay: `${m.delay}s` }} />
            <path className="tally-head" d="M0 0L-3.4 -2L-3.4 2z" transform={m.head} style={{ animationDelay: `${m.delay + 0.42}s` }} />
          </g>
        ))}
      </svg>
      {r.players.map((p, i) => {
        const { x, y } = pos(i);
        return (
          <div
            className={`tally-node${r.executedIds.includes(p.id) ? " top" : ""}`}
            style={{ left: `${x}%`, top: `${y}%`, ["--tdelay" as string]: `${end}s` } as React.CSSProperties}
            key={p.id}
          >
            <PlayerAvatar playerId={p.id} size={46} />
            <b>{p.nickname}</b>
          </div>
        );
      })}
      {marks.map((m) => {
        const c = r.receivedVoteCounts[m.to] ?? 1;
        return (
          <div
            className="tally-seal"
            key={`seal-${m.from}`}
            style={{
              left: `calc(${m.b.x}% + ${(m.j - (c - 1) / 2) * 15}px)`,
              top: `calc(${m.b.y}% + 27px)`,
              animationDelay: `${m.delay + 0.4}s`,
            }}
          >
            <WaxSeal size={18} />
          </div>
        );
      })}
    </div>
  );
}

/* 최다 득표자 카드: 어둠 속에서 올라와 한 번 멈춘 뒤, 진영 색 충격파와 함께 뒤집힌다 */
function ExecCard({ p, votes, flipped }: { p: ResultPlayer; votes: number; flipped: boolean }) {
  const role = ROLE_DEFINITIONS[p.currentRole];
  return (
    <div className="exec-wrap">
      <motion.div
        className="flip exec"
        initial={{ rotateY: 0, y: 150, opacity: 0 }}
        animate={{ rotateY: flipped ? 180 : 0, y: 0, opacity: 1 }}
        transition={{
          rotateY: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
          opacity: { duration: 0.6 },
        }}
      >
        <div className="card-face back"><Sigil size={64} /></div>
        <div className={`card-face front faction-${role.faction}`}>
          <span><RoleIcon id={p.currentRole} faction={role.faction} size={56} /></span>
          <h2>{role.name}</h2>
          <b>{factionName(role.faction)}</b>
        </div>
      </motion.div>
      {flipped && <div className={`flip-burst faction-${role.faction}`} aria-hidden="true" />}
      <b>{p.nickname}</b>
      <small>{votes}표</small>
    </div>
  );
}

function ResultTheater({ r, stage, skip }: { r: ResultData; stage: number; skip: () => void }) {
  const executed = r.players.filter((p) => r.executedIds.includes(p.id));
  return (
    <InMain>
      <div className={`theater s-${stage}${stage >= 5 ? " out" : ""}${endingOf(r) === "wolf" ? " end-wolf" : ""}`}>
        <div className="theater-backdrop" />
        {stage >= 3 && executed[0] && <ImpactFlash faction={ROLE_DEFINITIONS[executed[0].currentRole].faction} />}
        {stage < 5 && (
          <button className="theater-skip" onClick={skip}>
            건너뛰기
          </button>
        )}
        <div className="theater-stage">
          {stage === 0 && <p className="theater-intro">개표를 시작합니다</p>}
          {(stage === 1 || stage === 2) && (
            <div className={`tally-layer${stage >= 2 ? " out" : ""}`}>
              <h3>누가 누구를 지목했을까요</h3>
              <TallyBoard r={r} />
            </div>
          )}
          {stage >= 2 && (
            <div className="exec-layer">
              {executed.length ? (
                <div className={`exec-row${executed.length > 1 ? " multi" : ""}`}>
                  {executed.map((p) => (
                    <ExecCard key={p.id} p={p} votes={r.receivedVoteCounts[p.id] ?? 0} flipped={stage >= 3} />
                  ))}
                </div>
              ) : (
                <div className="exec-none">
                  <Icon.Sparkle />
                  <p>아무도 처형되지 않았습니다</p>
                </div>
              )}
              <div className="theater-winner">{stage >= 4 && <WinnerBlock r={r} stamped />}</div>
            </div>
          )}
        </div>
      </div>
    </InMain>
  );
}

/* 승리 진영별 엔딩: 같은 장면에 색만 바꾸지 않는다 */
function EndingSky({ kind }: { kind: EndingKind }) {
  return (
    <InMain>
      <div className={`ending-sky is-${kind}`} aria-hidden="true">
        {kind === "village" && <i className="sky-rise" />}
        {kind === "wolf" && (
          <>
            <i className="sky-redmoon" />
            <i className="sky-fog a" />
            <i className="sky-fog b" />
            <WolfSilhouette className="sky-wolfshape" />
          </>
        )}
        {kind === "tanner" && <i className="sky-brown" />}
        {(kind === "village" || kind === "wolf") && <VillageStrip mode={kind === "village" ? "on" : "off"} />}
      </div>
    </InMain>
  );
}

/* 모든 플레이어의 정체 카드. 처음 역할 → 최종 역할이 바뀐 사람은 카드가 한 번 더 뒤집힌다 */
function TableCards({ r, started, finished, onDone }: { r: ResultData; started: boolean; finished: boolean; onDone: () => void }) {
  const finalStep = (p: ResultPlayer) => (p.originalRole !== p.currentRole ? 2 : 1);
  const [steps, setSteps] = useState<number[]>(() => r.players.map((p) => (finished ? finalStep(p) : 0)));
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (finished) setSteps(r.players.map(finalStep));
  }, [finished]);
  useEffect(() => {
    if (!started || finished) return;
    const timers: number[] = [];
    const n = r.players.length;
    const set = (i: number, v: number) => setSteps((old) => old.map((x, j) => (j === i ? Math.max(x, v) : x)));
    r.players.forEach((_, i) => timers.push(window.setTimeout(() => set(i, 1), 150 + i * 250)));
    const changed = r.players.map((p, i) => (p.originalRole !== p.currentRole ? i : -1)).filter((i) => i >= 0);
    const base = 150 + (n - 1) * 250 + 900;
    changed.forEach((i, k) => timers.push(window.setTimeout(() => set(i, 2), base + k * 650)));
    const end = (changed.length ? base + (changed.length - 1) * 650 + 900 : base) + 600;
    timers.push(window.setTimeout(() => doneRef.current(), Math.max(2500, end)));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [started]);
  const winSet = new Set(r.winners.map(String));
  const tannerWin = String(r.winners[0]) === "tanner";
  return (
    <div className={`table-grid${tannerWin ? " focus-tanner" : ""}`} role="list">
      {r.players.map((p, i) => {
        const orig = ROLE_DEFINITIONS[p.originalRole];
        const cur = ROLE_DEFINITIONS[p.currentRole];
        const changed = p.originalRole !== p.currentRole;
        const step = steps[i] ?? 0;
        const final = step === (changed ? 2 : 1);
        const win = winSet.has(String(cur.faction));
        const dead = r.executedIds.includes(p.id);
        return (
          <div
            role="listitem"
            aria-label={`${p.nickname}: ${changed ? `처음 ${orig.name}, 최종 ${cur.name}` : cur.name}`}
            className={`tcard${final ? ` final faction-${cur.faction}` : ""}${win ? " is-win" : " is-lose"}${dead ? " is-dead" : ""}`}
            key={p.id}
          >
            <motion.div
              className="tcard-card"
              aria-hidden="true"
              initial={false}
              animate={{ rotateY: step === 0 ? 0 : step === 1 ? 180 : 360 }}
              transition={{ duration: 0.6, ease: [0.3, 1.2, 0.4, 1] }}
            >
              <div className={`tface a${step === 2 ? ` faction-${cur.faction}` : " cover"}`}>
                {step === 2 ? (
                  <>
                    <RoleIcon id={p.currentRole} faction={cur.faction} size={34} />
                    <b>{cur.name}</b>
                  </>
                ) : (
                  <Sigil size={40} />
                )}
              </div>
              <div className={`tface b faction-${orig.faction}`}>
                <RoleIcon id={p.originalRole} faction={orig.faction} size={34} />
                <b>{orig.name}</b>
              </div>
            </motion.div>
            <span className="nick">
              {dead && <Icon.Skull />}
              {p.nickname}
            </span>
            {changed && step === 2 && (
              <small className="tcard-change">
                {orig.name} → {cur.name}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Result({ game }: { game: ClientGameState }) {
  const r = game.result!;
  const seenKey = `${game.roomCode}:${r.executedIds.join(",")}:${JSON.stringify(r.votes)}:${r.players.map((p) => p.currentRole).join(",")}`;
  const [skipIntro] = useState(() => {
    try {
      return sessionStorage.getItem("ww-result-seen") === seenKey || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  const [stage, setStage] = useState(skipIntro ? 6 : 0);
  const to = (s: number) => setStage((old) => Math.max(old, s));
  useEffect(() => {
    if (skipIntro) return;
    const times: Array<[number, number]> = [[1000, 1], [3000, 2], [3800, 3], [5000, 4], [6500, 5]];
    const ids = times.map(([ms, s]) => window.setTimeout(() => to(s), ms));
    return () => ids.forEach((t) => window.clearTimeout(t));
  }, []);
  useEffect(() => {
    if (stage >= 5 && !skipIntro) window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (stage >= 6) {
      try { sessionStorage.setItem("ww-result-seen", seenKey); } catch { /* noop */ }
    }
  }, [stage]);
  const winners = r.players.filter((p) =>
    r.winners.includes(ROLE_DEFINITIONS[p.currentRole].faction),
  );
  const losers = r.players.filter(
    (p) => !r.winners.includes(ROLE_DEFINITIONS[p.currentRole].faction),
  );
  const show = (s: number) => (stage >= s ? " show" : "");
  return (
    <section className="result-scene">
      {stage >= 4 && <EndingSky kind={endingOf(r)} />}
      {stage < 6 && !skipIntro && <ResultTheater r={r} stage={stage} skip={() => to(6)} />}
      <div className={`result-winner${show(5)}`}>
        <WinnerBlock r={r} stamped={false} />
      </div>
      <Panel className={`table-panel${show(5)}`}>
        <h3>정체 공개</h3>
        <TableCards r={r} started={stage >= 5} finished={stage >= 6} onDone={() => to(6)} />
      </Panel>
      <Panel className={`final-result result-rise${show(6)}`}>
        <h3>최종 결과</h3>
        <div className="outcome-groups">
          <div className="outcome-group winners">
            <b>
              <Icon.Trophy /> 승리자 <small>{winners.length}명</small>
            </b>
            <div className="outcome-list">
              {winners.map((p) => (
                <span key={p.id}><PlayerAvatar playerId={p.id} size={18} />{p.nickname}</span>
              ))}
            </div>
          </div>
          <div className="outcome-group losers">
            <b>
              패배자 <small>{losers.length}명</small>
            </b>
            <div className="outcome-list">
              {losers.map((p) => (
                <span key={p.id}><PlayerAvatar playerId={p.id} size={18} />{p.nickname}</span>
              ))}
            </div>
          </div>
        </div>
      </Panel>
      <Panel className={`result-rise${show(6)}`}>
        <h3>최종 역할</h3>
        {r.players.map((p) => (
          <div className={r.executedIds.includes(p.id) ? "result-row dead" : "result-row"} key={p.id}>
            <PlayerAvatar playerId={p.id} size={40} />
            <div>
              <b>{p.nickname}</b>
              <small>처음 {ROLE_DEFINITIONS[p.originalRole].name} · 득표 {r.receivedVoteCounts[p.id] ?? 0}표</small>
            </div>
            <strong>
              <RoleIcon id={p.currentRole} size={18} />{" "}
              {ROLE_DEFINITIONS[p.currentRole].name}
            </strong>
            {r.executedIds.includes(p.id) && <em><Icon.Skull /></em>}
          </div>
        ))}
      </Panel>
      <Panel className={`result-rise${show(6)}`}>
        <h3>개별 투표</h3>
        {Object.entries(r.votes).map(([from, toId]) => (
          <p className="vote-line" key={from}>
            {name(r, from)} <span>→</span> {name(r, toId)}
          </p>
        ))}
      </Panel>
      {game.hostId === game.playerId ? (
        <button className={`result-rise${show(6)}`} onClick={() => event("GAME_RESTART", req(game))}>
          모두 대기실로 돌아가기
        </button>
      ) : (
        <p className={`center tiny result-rise${show(6)}`}>
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
              <PlayerAvatar nickname={person.nickname} size={40} />
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
