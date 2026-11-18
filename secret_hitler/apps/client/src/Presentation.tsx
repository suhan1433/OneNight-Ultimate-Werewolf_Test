import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  RoomView,
  PublicEvent,
  GameView,
} from "../../../packages/shared-types/src/index";
import type { Copy } from "./i18n";
import { readLocal, writeLocal, useApp } from "./store";
import { Emblem, Portrait, PolicyFace } from "./Art";
import { ElectionRisk } from "./GovernmentProposal";

/* ------------------------------------------------------------------ *
 *  Audio — synthesized placeholder layer. Swap `sound()` bodies for
 *  sampled assets (typewriter, stamp, steel door, gunshot) later; the cue
 *  names are the stable contract. Every cue is driven by PUBLIC events only.
 * ------------------------------------------------------------------ */
let audio: AudioContext | null = null;
function context() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}
function tone(
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  delay = 0,
) {
  const ctx = context();
  if (!ctx) return;
  const osc = ctx.createOscillator(),
    gain = ctx.createGain(),
    now = ctx.currentTime + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}
function noise(
  duration: number,
  volume: number,
  o: { lp?: number; hp?: number; decay?: number; delay?: number } = {},
) {
  const ctx = context();
  if (!ctx) return;
  const n = Math.floor(ctx.sampleRate * duration),
    buf = ctx.createBuffer(1, n, ctx.sampleRate),
    d = buf.getChannelData(0),
    decay = o.decay ?? 3;
  for (let i = 0; i < n; i++)
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  const src = ctx.createBufferSource(),
    gain = ctx.createGain(),
    lp = ctx.createBiquadFilter(),
    hp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = o.lp ?? 3000;
  hp.type = "highpass";
  hp.frequency.value = o.hp ?? 20;
  gain.gain.value = volume;
  src.buffer = buf;
  src.connect(hp);
  hp.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);
  src.start(ctx.currentTime + (o.delay ?? 0));
}
type Cue =
  | "stamp"
  | "wax"
  | "tick"
  | "flip"
  | "gun"
  | "telegraph"
  | "dawn"
  | "doom";
function sound(cue: Cue) {
  if (readLocal("sh-sound", "0") !== "1") return;
  const buzz = (p: number | number[]) => {
    try {
      if (readLocal("sh-reduce", "0") !== "1") navigator.vibrate?.(p);
    } catch {}
  };
  switch (cue) {
    case "stamp":
      tone(78, 0.3, 0.12, "sine");
      tone(150, 0.1, 0.05, "triangle");
      noise(0.08, 0.05, { lp: 1800 });
      buzz(18);
      break;
    case "wax":
      tone(58, 0.45, 0.11, "sine");
      noise(0.14, 0.04, { lp: 900, decay: 2 });
      buzz([14, 30, 22]);
      break;
    case "tick":
      noise(0.03, 0.03, { hp: 1500, lp: 6000, decay: 2 });
      break;
    case "flip":
      noise(0.06, 0.025, { hp: 600, lp: 4500, decay: 2 });
      break;
    case "gun":
      noise(0.7, 0.32, { lp: 1500, decay: 4 });
      tone(48, 0.6, 0.13, "triangle");
      buzz([30, 70, 90]);
      break;
    case "telegraph":
      for (let i = 0; i < 6; i++) {
        tone(900, 0.04, 0.012, "square", i * 0.12);
        noise(0.03, 0.02, { hp: 2000, delay: i * 0.12 });
      }
      buzz([20, 40, 20]);
      break;
    case "dawn":
      [130, 195, 247].forEach((f, i) => tone(f, 2.2, 0.022, "sine", i * 0.25));
      break;
    case "doom":
      tone(55, 2.4, 0.06, "triangle");
      tone(58.3, 2.4, 0.04, "triangle");
      noise(0.5, 0.05, { lp: 500, decay: 1.5 });
      break;
  }
}

/* ------------------------------------------------------------------ *
 *  Scene queue + presented-state gating
 * ------------------------------------------------------------------ */
type SceneKind = "vote" | "policy" | "chaos" | "exec" | "victory" | "stamp" | "focus" | "nomination" | "election";
export type Scene = {
  ev: PublicEvent;
  kind: SceneKind;
  ms: number; // actual duration (compressed when the local player has to act)
  base: number; // authored duration
  focus?: string | null; // seat the lamp goes to (resolved from state, not only from event fields)
  accepted?: boolean; // veto outcome
  outcome?: GameView; // confirmed public state for terminal scenes, independent of the held board
};
/** Does the local player owe the server an action right now? Then scenes must not eat their clock. */
function mustAct(r: RoomView) {
  const g = r.game!,
    me = r.selfId;
  if (!g.players.find((p) => p.id === me)?.alive) return false;
  switch (g.phase) {
    case "night":
      return !g.acknowledged.includes(me);
    case "nomination":
    case "president_discard":
    case "executive":
    case "veto":
      return g.president === me;
    case "chancellor_enact":
      return g.chancellor === me;
    case "voting":
      return !g.voted.includes(me);
    case "vote_result":
      return !g.acknowledged.includes(me);
    default:
      return false;
  }
}
const ACT_BUDGET = 2600; // ms of presentation we allow while a decision is pending
const SCENES: Record<string, { kind: SceneKind; ms: number }> = {
  policy: { kind: "policy", ms: 2800 },
  chaos: { kind: "chaos", ms: 4200 },
  execution: { kind: "exec", ms: 3600 },
  victory: { kind: "victory", ms: 5200 },
  night_end: { kind: "stamp", ms: 1800 },
  investigation: { kind: "stamp", ms: 1600 },
  special_election: { kind: "stamp", ms: 1900 },
  veto_request: { kind: "stamp", ms: 1700 },
  veto_answer: { kind: "stamp", ms: 1900 },
  nomination: { kind: "nomination", ms: 2200 },
};

/**
 * Plays server-confirmed events one by one and returns a "presented" view of
 * the room that lags behind the server state until the scenes are over, so the
 * track, tracker, dead seats and the final screen never spoil a running scene.
 * Reconnects / first load never replay history.
 */
export function useScenes(room: RoomView | null, reduced: boolean) {
  const { connected, resuming } = useApp();
  const [hold, setHold] = useState<RoomView | null>(null),
    [scene, setScene] = useState<Scene | null>(null);
  const prev = useRef<RoomView | null>(null),
    seen = useRef<{ code: string; id: number } | null>(null),
    fresh = useRef(true),
    queue = useRef<Scene[]>([]),
    running = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    queue.current = [];
    running.current = false;
    setScene(null);
    setHold(null);
  }, []);
  const next = useCallback(() => {
    const s = queue.current.shift();
    if (!s) {
      running.current = false;
      setScene(null);
      setHold(null);
      return;
    }
    setScene(s);
    // Keep the identity and short reason readable even when motion is reduced.
    timer.current = setTimeout(next, reducedRef.current && s.kind !== "election" ? Math.min(s.ms, 900) : s.ms);
  }, []);

  useLayoutEffect(() => {
    const g = room?.game;
    if (!room || !g || !connected || resuming) {
      fresh.current = true;
      if (!g) seen.current = null;
      stop();
      prev.current = room;
      return;
    }
    const latest = g.events.at(-1)?.id ?? 0;
    if (fresh.current || seen.current?.code !== room.code) {
      fresh.current = false;
      seen.current = { code: room.code, id: latest };
      prev.current = room;
      return;
    }
    const known = seen.current.id;
    seen.current = { code: room.code, id: latest };
    const pg = prev.current?.game,
      isMe = mustAct(room);
    // Server field names are not guaranteed, so outcomes/targets are also derived
    // from state differences (before → after) instead of trusting a single field.
    let batch: Scene[] = g.events
      .filter((e) => e.id > known && SCENES[e.type])
      .map((ev) => {
        const e = ev as any,
          sc: Scene = { ev, ...SCENES[ev.type], base: SCENES[ev.type].ms };
        if (ev.type === "veto_answer") {
          const a = e.accepted ?? e.accept ?? e.approved;
          sc.accepted =
            typeof a === "boolean"
              ? a
              : g.tracker > (pg?.tracker ?? 0) || g.phase !== "chancellor_enact";
        } else if (ev.type === "execution") {
          sc.focus =
            e.target ??
            pg?.players.find(
              (p) => p.alive && !g.players.find((q) => q.id === p.id)?.alive,
            )?.id ??
            null;
        } else if (ev.type === "nomination") {
          sc.focus = e.chancellor ?? e.target ?? g.chancellor ?? null;
        } else if (ev.type === "special_election") {
          sc.focus = e.target ?? g.president ?? null;
        }
        if (ev.type === "victory") sc.outcome = g;
        return sc;
      });
    batch = batch.flatMap(s => s.kind === "victory" && g.winner === "fascist" && g.fascist >= 3 && g.fascist < 6 && g.chancellor && g.revealedRoles?.[g.chancellor] === "hitler"
      ? [{ ...s, kind: "election" as const, ms: 3000, base: 3000, focus: g.chancellor }, s]
      : [s]);
    if (isMe) {
      batch = batch.filter((s) => s.kind !== "stamp" && s.kind !== "focus");
      const total = batch.reduce((a, s) => a + s.ms, 0),
        k = total > ACT_BUDGET ? ACT_BUDGET / total : 1;
      batch = batch.map((s) => ({ ...s, ms: Math.max(900, Math.round(s.ms * k)) }));
    }
    if (batch.length) {
      queue.current.push(...batch);
      if (!running.current) {
        running.current = true;
        setHold(prev.current);
        next();
      }
    }
    prev.current = room;
  }, [room, connected, resuming, next, stop]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { view: hold ?? room, scene, skip: stop };
}

/* ------------------------------------------------------------------ *
 *  Light rig: one lamp, follows the acting player, tension → colour/size
 * ------------------------------------------------------------------ */
const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)),
    x = p(a),
    y = p(b);
  return (
    "#" +
    x
      .map((v, i) =>
        Math.round(v + (y[i] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
};
export function tensionOf(g?: GameView | null) {
  return g ? Math.min(1, (g.fascist / 6) * 0.8 + (g.tracker / 3) * 0.2) : 0;
}
function focusFor(view: RoomView | null, scene: Scene | null) {
  const g = view?.game,
    e = scene?.ev as any;
  if (g?.phase === "voting")
    return { id: g.president, night: false };
  if (scene) {
    if (scene.kind === "exec" || scene.kind === "focus" || scene.kind === "nomination" || e.type === "special_election")
      return { id: scene.focus ?? null, night: false };
    return { id: null, night: false };
  }
  if (!g) return { id: null, night: false };
  if (g.phase === "night") return { id: null, night: true };
  const p = (g.president as string | undefined) ?? null,
    c = (g.chancellor as string | undefined) ?? null;
  switch (g.phase) {
    case "nomination":
    case "executive":
      return { id: g.selectedTarget || p, night: false };
    case "president_discard":
    case "veto":
      return { id: p, night: false };
    case "chancellor_enact":
      return { id: c ?? p, night: false };
    default:
      return { id: null, night: false };
  }
}
export function LightRig({
  view,
  scene,
  dip,
}: {
  view: RoomView | null;
  scene: Scene | null;
  dip: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    secondRef = useRef<HTMLDivElement>(null),
    g = view?.game,
    tension = tensionOf(g),
    { id, night } = focusFor(view, scene),
    secondId = g?.phase === "voting" ? g.chancellor : null,
    inGame = !!g && g.phase !== "finished";
  const place = useCallback(() => {
    const r = ref.current;
    if (!r) return;
    const el = id
        ? document.querySelector(`[data-seat-id="${id}"]`)
        : document.querySelector("[data-table]"),
      b = el?.getBoundingClientRect(),
      x = b ? b.left + b.width / 2 : window.innerWidth / 2,
      y = b ? b.top + b.height / 2 : window.innerHeight * 0.4;
    r.style.transform = `translate(${x}px,${y}px)`;
    const second = secondId
      ? document.querySelector(`[data-seat-id="${secondId}"]`)?.getBoundingClientRect()
      : null;
    const secondX = second ? second.left + second.width / 2 : x;
    const secondY = second ? second.top + second.height / 2 : y;
    r.style.setProperty("--second-dx", `${secondX - x}px`);
    r.style.setProperty("--second-dy", `${secondY - y}px`);
    if (secondRef.current)
      secondRef.current.style.transform = `translate(${secondX}px,${secondY}px)`;
  }, [id, secondId]);
  useLayoutEffect(place, [place, g?.version, g?.phase]);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        place();
        setVars();
      });
    };
    window.addEventListener("resize", on);
    window.addEventListener("scroll", on, { passive: true });
    const observer = new ResizeObserver(on);
    const table = document.querySelector("[data-table]");
    if (table) observer.observe(table);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", on);
      window.removeEventListener("scroll", on);
    };
  });
  const setVars = () => {
    const s = document.documentElement.style,
      m = Math.min(window.innerWidth, window.innerHeight);
    s.setProperty("--tension", String(tension));
    s.setProperty("--lamp", mix("#f0d9a0", "#aab4b8", tension));
    s.setProperty("--r", `${Math.round(m * (inGame ? 0.3 - 0.07 * tension : 0.42))}px`);
    s.setProperty("--op", String(night ? 0.97 : inGame ? 0.56 + 0.25 * tension : 0.34));
    s.setProperty("--rim", String(0.35 * tension));
    s.setProperty("--fl", String(0.06 * tension));
  };
  useEffect(setVars, [tension, night, inGame]);
  return (
    <div className={`rig-wrap ${secondId ? "dual" : ""} ${dip ? "dip" : ""}`} aria-hidden="true">
      <div className="rig" ref={ref}>
        <div className="shade" />
        <div className="warm" />
      </div>
      {secondId && <div className="rig rig-secondary" ref={secondRef}><div className="warm" /></div>}
      <div className="blk" />
      <div className="rim" />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Scenes
 * ------------------------------------------------------------------ */
export const playCue = sound;
export function useTyped(text: string, on: boolean, ms = 30, delay = 0) {
  const [n, setN] = useState(on ? 0 : text.length);
  useEffect(() => {
    if (!on) return setN(text.length);
    setN(0);
    let i = 0,
      iv: ReturnType<typeof setInterval> | undefined;
    const st = setTimeout(() => {
      iv = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) clearInterval(iv);
      }, ms);
    }, delay);
    return () => {
      clearTimeout(st);
      clearInterval(iv);
    };
  }, [text, on, ms, delay]);
  return text.slice(0, n);
}

export function VoteScene({
  ev,
  g,
  t,
  reduced,
  speed,
}: {
  ev: PublicEvent;
  g: GameView;
  t: Copy;
  reduced: boolean;
  speed: number;
}) {
  const entries = Object.entries(ev.votes ?? {}) as [string, boolean][],
    total = entries.length,
    [n, setN] = useState(reduced ? total : 0),
    [done, setDone] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let iv: ReturnType<typeof setInterval> | undefined,
      i = 0;
    timers.push(
      setTimeout(() => {
        iv = setInterval(() => {
          i += 1;
          setN(i);
          sound("flip");
          if (i >= total) {
            clearInterval(iv);
            timers.push(
              setTimeout(() => {
                setDone(true);
                sound("stamp");
              }, 450 * speed),
            );
          }
        }, 150 * speed);
      }, 1500 * speed),
    );
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(iv);
    };
  }, [reduced, total, speed]);
  const ja = entries.slice(0, n).filter(([, v]) => v).length,
    passed = entries.filter(([, v]) => v).length > total / 2;
  return (
    <div className="sc-vote">
      <p className="sc-eyebrow">{t.voting}</p>
      <div className="ballots-reveal">
        {entries.map(([id, v], i) => {
          const p = g.players.find((q) => q.id === id);
          return (
            <div key={id} className={`ballot-flip ${i < n ? "flipped" : ""}`}>
              <div className="bf-inner">
                <div className="bf-back" />
                <div className={`bf-front ${v ? "ja" : "nein"}`}>
                  <b>{v ? t.jaShort : t.neinShort}</b>
                  <span className="bf-choice">{v ? t.ayes : t.nays}</span>
                  <div className="bf-photo">
                    <Portrait avatar={p?.avatar ?? 0} />
                  </div>
                  <small>{p?.name}</small>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="tally">
        {t.ayes} {ja} : {t.nays} {n - ja}
      </div>
      {done && (
        <div className={`stamp-big ${passed ? "pass" : "fail"}`}>
          {passed ? t.approved : t.rejected}
        </div>
      )}
    </div>
  );
}
function PolicyScene({ ev, t }: { ev: PublicEvent; t: Copy }) {
  const p = (ev.policy ?? "liberal") as "liberal" | "fascist";
  return (
    <div className={`sc-policy ${p}`}>
      <div className="deal">
        <PolicyFace
          policy={p}
          size={84}
          title={p === "liberal" ? t.policyL : t.policyF}
          sub={t.enacted}
        />
      </div>
      <div className={`stamp-big ${p === "liberal" ? "pass" : "fail"}`}>
        {t.enacted}
      </div>
    </div>
  );
}
function ChaosScene({ t, reduced }: { t: Copy; reduced: boolean }) {
  const text = useTyped(`※ ${t.chaosFlash} ※ ${t.chaos} — ${t.chaosBody}`, !reduced, 34);
  return (
    <div className="sc-chaos">
      <div className="tape">
        <small>{t.teletype}</small>
        <strong>{text}</strong>
      </div>
    </div>
  );
}
function ExecScene({ id, g, t, ms, reduced }: { id?: string | null; g: GameView; t: Copy; ms: number; reduced: boolean }) {
  const target = g.players.find((p) => p.id === id);
  const ko = t.confirm === "확인";
  return (
    <div className={`sc-exec${reduced ? " is-reduced" : ""}`} style={{ "--exec-duration": `${ms}ms` } as React.CSSProperties}>
      <div className="exec-heading">
        <span className="exec-rule" />
        <p>{ko ? "대통령 명령 · 사형 집행" : "PRESIDENTIAL ORDER · EXECUTION"}</p>
        <h2>{target?.name ?? (ko ? "집행 대상" : "Condemned player")}</h2>
        <span className="exec-subtitle">{ko ? "명령이 내려졌습니다" : "The order has been given"}</span>
      </div>
      <div className="exec-stage">
        <div className="exec-wall" />
        <div className="exec-beam" />
        <svg className="exec-tableau" viewBox="0 0 720 420" fill="none" aria-hidden="true">
          <path d="M430 0v35m-25 18 12-18h26l12 18Z" stroke="#8d9698" strokeWidth="3" fill="#333e42" />
          <path d="M410 54h40" stroke="#e0c79a" strokeWidth="4" />
          <path d="M0 376h720" stroke="#798080" strokeOpacity=".3" />
          <ellipse cx="438" cy="378" rx="77" ry="9" fill="#05090b" opacity=".65" />
          <g className="exec-person">
            <path d="M420 265 406 371h22l12-85 9 85h23l-12-106Z" fill="#111b22" stroke="#687275" strokeWidth="1.5" />
            <path d="M415 173q25-13 48 0l10 95q-32 15-65 0Z" fill="#253239" stroke="#778083" strokeWidth="1.5" />
            <path d="m416 180-17 67 16 8 11-49m32-26 22 64-13 13-18-51" fill="#202d34" stroke="#657175" strokeWidth="1.5" />
            <path d="m430 170 10 26 10-26M440 196v67" stroke="#87908b" strokeOpacity=".55" strokeWidth="2" />
            <path d="M431 153v19q9 8 18 0v-19" fill="#8d8876" />
            <ellipse cx="440" cy="134" rx="23" ry="29" fill="#aaa18b" stroke="#d1c6aa" />
            <path d="M418 131q-3-35 25-30 24 1 20 34l-9-17-34 7Z" fill="#222b2d" />
            <path d="m418 131 43 2-1 10-42-2Z" fill="#172128" />
            <path d="m436 153 10 1" stroke="#4f5149" strokeWidth="2" />
          </g>
          <g className="exec-rifle" fill="#101a20" stroke="#627079" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M-25 270 65 223l27-8 88-15h65v9l-64 5-27 16-39 3-44 30-60 52Z" />
            <path d="M113 218h64v14h-22l-14 33h-17l6-31h-17Z" />
            <path d="M177 200h88v7h-88Zm63-6h6v7h-6ZM-20 340l85-83 40-12 19 17-44 27-65 79Z" />
          </g>
          <g className="exec-smoke" stroke="#b2b4a8" strokeWidth="3" strokeLinecap="round" opacity="0">
            <path d="M267 203q24-18 45-4t36-12M271 210q22 14 41 2t43 6M280 191q13-22 34-18" />
          </g>
        </svg>
        <div className="exec-impact" />
        <div className="exec-file">
          <Portrait avatar={target?.avatar ?? 0} />
          <span>{ko ? "집행 대상" : "SUBJECT"}</span>
        </div>
        <div className="exec-verdict">
          <span className="exec-pending">{ko ? "집행 대기" : "AWAITING EXECUTION"}</span>
          <strong className="exec-complete">{t.executed}</strong>
        </div>
      </div>
      <p className="exec-footer">{ko ? "의회 기록에 집행 결과가 기재됩니다" : "The execution is entered into the parliamentary record"}</p>
    </div>
  );
}
export function winReason(g: GameView, t: Copy) {
  return g.winner === "liberal"
    ? g.liberal === 5
      ? t.reasonLiberal
      : t.reasonExecution
    : g.winner === "fascist"
      ? g.fascist === 6
        ? t.reasonFascist
        : t.reasonElection
      : t.reasonEnded;
}
function NominationScene({ scene, g, t }: { scene: Scene; g: GameView; t: Copy }) {
  const ko = t.confirm === "확인";
  const president = g.players.find(p => p.id === (scene.ev.president ?? g.president));
  const candidate = g.players.find(p => p.id === scene.focus);
  return <section className="sc-nomination" style={{ "--nomination-duration": `${scene.ms}ms` } as React.CSSProperties}>
    <p className="sc-eyebrow">{ko ? "새 정부 구성" : "FORMING A GOVERNMENT"}</p>
    <h2>{ko ? "수상 후보가 지명되었습니다" : "Chancellor nominee announced"}</h2>
    <div className="nomination-pair">
      <div className="nomination-person president"><span>{t.president}</span><Portrait avatar={president?.avatar ?? 0} /><strong>{president?.name}</strong></div>
      <div className="nomination-transfer"><span>{ko ? "지명" : "NOMINATES"}</span><i aria-hidden="true">→</i></div>
      <div className="nomination-person candidate"><span>{t.nominee}</span><Portrait avatar={candidate?.avatar ?? 0} /><strong>{candidate?.name}</strong><b className="nomination-seal">{ko ? "지명 확정" : "NOMINATED"}</b></div>
    </div>
    <p className="nomination-next">{ko ? "이 두 사람에게 정부를 맡길지, 생존자 모두가 투표합니다." : "Every living player will vote on whether to trust this pair."}</p>
    <ElectionRisk g={g} t={t} />
    <div className="nomination-timeline" aria-hidden="true"><i /></div>
  </section>;
}

/** Rendered only after a server-confirmed Hitler election victory. */
function ElectionScene({ g, t }: { g: GameView; t: Copy }) {
  const ko = t.confirm === "확인";
  const elected = g.players.find(p => p.id === g.chancellor);
  const vote = [...g.events].reverse().find(e => e.type === "vote");
  const ballots = Object.values(vote?.votes ?? {});
  return <section className="sc-election">
    <p className="sc-eyebrow">{ko ? "정부 신임 표결 · 가결" : "GOVERNMENT VOTE · APPROVED"}</p>
    <h2>{ko ? `${elected?.name ?? "수상 후보"} 수상 당선` : `${elected?.name ?? "The nominee"} is elected Chancellor`}</h2>
    {ballots.length > 0 && <p className="election-tally">{t.ayes} {ballots.filter(Boolean).length} · {t.nays} {ballots.filter(v => !v).length}</p>}
    <div className="election-identity">
      <div className="election-identity-inner">
        <div className="election-identity-back"><span>§</span><b>{ko ? "신원 확인" : "IDENTITY CHECK"}</b></div>
        <div className="election-identity-front"><Portrait avatar={elected?.avatar ?? 0} /><span>{ko ? "당선 수상의 정체" : "THE ELECTED CHANCELLOR IS"}</span><strong>{t.hitler}</strong></div>
      </div>
    </div>
    <div className="election-explanation">
      <span className="election-policy-count">{ko ? `파시스트 정책 ${g.fascist}개 제정` : `${g.fascist} Fascist policies enacted`}</span>
      <p>{ko ? "파시스트 정책이 3개 이상인 상태에서 히틀러가 수상에 당선되었습니다." : "Hitler was elected Chancellor with at least 3 Fascist policies enacted."}</p>
    </div>
  </section>;
}

function VictoryScene({ g, t }: { g: GameView; t: Copy }) {
  const w = g.winner === "liberal" ? "liberal" : "fascist";
  return (
    <div className={`sc-victory ${w}`}>
      <div className="blinds-anim">
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} style={{ ["--i" as string]: i } as React.CSSProperties} />
        ))}
      </div>
      <div className="victory-text">
        <Emblem party={w} size={72} />
        <h2>{w === "liberal" ? t.liberalWin : t.fascistWin}</h2>
        <p>{winReason(g, t)}</p>
      </div>
    </div>
  );
}
function stampLabel(ev: PublicEvent, t: Copy, accepted?: boolean) {
  const e = ev as any;
  switch (ev.type) {
    case "night_end":
      return t.sessionOpen;
    case "investigation":
      return t.investigated;
    case "special_election":
      return t.special_election;
    case "veto_request":
      return t.vetoRequest;
    case "veto_answer": {
      const a = typeof accepted === "boolean" ? accepted : (e.accepted ?? e.accept ?? e.approved);
      return typeof a === "boolean" ? (a ? t.vetoApproved : t.vetoRejected) : t.veto;
    }
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ *
 *  Presentation root
 * ------------------------------------------------------------------ */
export function Presentation({
  view,
  scene,
  skip,
  t,
  reduced,
}: {
  view: RoomView | null;
  scene: Scene | null;
  skip: () => void;
  t: Copy;
  reduced: boolean;
}) {
  const [enabled, setEnabled] = useState(readLocal("sh-sound", "0") === "1"),
    [dip, setDip] = useState(false),
    g = scene?.outcome ?? view?.game;

  useEffect(() => {
    // the title screen can switch sound on too
    const on = () => setEnabled(readLocal("sh-sound", "0") === "1");
    window.addEventListener("sh-sound", on);
    return () => window.removeEventListener("sh-sound", on);
  }, []);

  // per-scene timeline: dips (≤1 per scene, never a flash), shake, cue sounds
  useEffect(() => {
    if (!scene) return;
    const timers: ReturnType<typeof setTimeout>[] = [],
      at = (ms: number, f: () => void) => timers.push(setTimeout(f, ms)),
      e = scene.ev as any,
      sp = scene.ms / scene.base;
    switch (scene.kind) {
      case "vote":
        at(1100 * sp, () => setDip(true));
        at(1750 * sp, () => setDip(false));
        break;
      case "policy": {
        const fas = e.policy === "fascist";
        at(520, () => sound(fas ? "wax" : "stamp"));
        if (fas) {
          at(650, () => setDip(true));
          at(1050, () => setDip(false));
          if (!reduced) {
            at(540, () => (document.body.dataset.shake = "1"));
            at(780, () => delete document.body.dataset.shake);
          }
        }
        break;
      }
      case "chaos":
        sound("telegraph");
        break;
      case "exec":
        if (!reduced) at(scene.ms * 0.48, () => sound("gun"));
        break;
      case "victory":
        sound(g?.winner === "liberal" ? "dawn" : "doom");
        break;
      case "stamp":
        at(250, () => sound("stamp"));
        break;
      case "nomination":
        at(350 * sp, () => sound("stamp"));
        break;
      case "election":
        at(reduced ? 0 : 800, () => sound("doom"));
        break;
    }
    return () => {
      timers.forEach(clearTimeout);
      setDip(false);
      delete document.body.dataset.shake;
    };
  }, [scene?.ev.id, scene?.kind]);

  // ambience: drone layers grow with PUBLIC fascist policy count only
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => void context();
    window.addEventListener("pointerdown", unlock, { once: true });
    const ctx = context();
    if (!ctx) return;
    const nodes: AudioNode[] = [],
      oscs: OscillatorNode[] = [],
      lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    lp.connect(ctx.destination);
    nodes.push(lp);
    const ratios = [1, 1.0595, 1.4983, 1.1892, 0.7491, 1.3348, 0.5],
      count = 1 + (g?.fascist ?? 0);
    for (let i = 0; i < Math.min(count, ratios.length); i++) {
      const o = ctx.createOscillator(),
        gn = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = 96 * ratios[i];
      gn.gain.value = i === 0 ? 0.006 : 0.0022;
      o.connect(gn);
      gn.connect(lp);
      o.start();
      oscs.push(o);
      nodes.push(gn);
    }
    if ((g?.fascist ?? 0) >= 3) {
      [233, 247].forEach((f) => {
        const o = ctx.createOscillator(),
          gn = ctx.createGain(),
          f2 = ctx.createBiquadFilter();
        o.type = "sawtooth";
        o.frequency.value = f;
        gn.gain.value = 0.0012;
        f2.type = "lowpass";
        f2.frequency.value = 700;
        o.connect(f2);
        f2.connect(gn);
        gn.connect(ctx.destination);
        o.start();
        oscs.push(o);
        nodes.push(gn, f2);
      });
    }
    const tick = setInterval(() => {
      if (ctx.state === "running") noise(0.02, 0.006, { hp: 1800, lp: 5000, decay: 2 });
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      clearInterval(tick);
      oscs.forEach((o) => {
        o.stop();
        o.disconnect();
      });
      nodes.forEach((n) => n.disconnect());
    };
  }, [enabled, g?.fascist]);

  const sr = scene
    ? scene.kind === "policy"
      ? (scene.ev as any).policy === "liberal"
        ? t.policyL
        : t.policyF
      : scene.kind === "vote"
        ? t.voting
        : scene.kind === "chaos"
          ? t.chaos
          : scene.kind === "exec"
            ? t.executed
            : scene.kind === "victory"
              ? g?.winner === "liberal"
                ? t.liberalWin
                : t.fascistWin
              : scene.kind === "nomination"
                ? (t.confirm === "확인" ? "수상 후보가 지명되었습니다. 정부 신임 투표가 시작됩니다." : "A Chancellor has been nominated. The government vote will begin.")
                : scene.kind === "election"
                  ? t.reasonElection
                  : stampLabel(scene.ev, t, scene.accepted)
    : "";
  return (
    <>
      <LightRig view={view} scene={scene} dip={dip} />
      <button
        className="audio-toggle"
        aria-pressed={enabled}
        aria-label={t.sound}
        title={t.sound}
        onClick={() => {
          const next = !enabled;
          setEnabled(next);
          writeLocal("sh-sound", next ? "1" : "0");
          if (next) {
            context();
            tone(180, 0.15, 0.025);
          }
        }}
      >
        {enabled ? "◖))" : "◖×"}
      </button>
      <div className="sr-only" role="status" aria-live="polite">
        {sr}
      </div>
      {scene && g && scene.kind !== "focus" && (
        <div
          key={`${scene.ev.id}:${scene.kind}`}
          className={`scene ${scene.kind}`}
          role="region"
          aria-label={sr || t.protocol}
        >
          {scene.kind === "nomination" && <NominationScene scene={scene} g={g} t={t} />}
          {scene.kind === "election" && <ElectionScene g={g} t={t} />}
          {scene.kind === "vote" && (
            <VoteScene ev={scene.ev} g={g} t={t} reduced={reduced} speed={scene.ms / scene.base} />
          )}
          {scene.kind === "policy" && <PolicyScene ev={scene.ev} t={t} />}
          {scene.kind === "chaos" && <ChaosScene t={t} reduced={reduced} />}
          {scene.kind === "exec" && (
            <ExecScene id={scene.focus} g={g} t={t} ms={scene.ms} reduced={reduced} />
          )}
          {scene.kind === "victory" && <VictoryScene g={g} t={t} />}
          {scene.kind === "stamp" && (
            <div className="event-stamp">
              <small>
                {t.protocol} / {String(scene.ev.id).padStart(3, "0")}
              </small>
              <strong>{stampLabel(scene.ev, t, scene.accepted)}</strong>
            </div>
          )}
          {scene.kind !== "election" && <button className="scene-skip" onClick={skip}>
            {t.skip}
          </button>}
        </div>
      )}
    </>
  );
}
