import { useEffect, useRef, useState } from "react";
import type {
  RoomView,
  PublicEvent,
} from "../../../packages/shared-types/src/index";
import type { Copy } from "./i18n";
import { readLocal, writeLocal, useApp } from "./store";
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
  const oscillator = ctx.createOscillator(),
    gain = ctx.createGain(),
    now = ctx.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}
function sound(type: string) {
  if (readLocal("sh-sound", "0") !== "1") return;
  // Every cue uses public events. No cue examines policies in a private hand.
  if (type === "execution") {
    tone(45, 0.5, 0.09, "triangle");
    tone(80, 0.18, 0.03, "sawtooth");
    return;
  }
  if (type === "chaos") {
    for (let i = 0; i < 5; i++) tone(180, 0.06, 0.015, "square", i * 0.13);
    return;
  }
  if (type === "victory") {
    tone(130, 0.9, 0.025);
    tone(195, 1.2, 0.02, "sine", 0.18);
    return;
  }
  tone(type === "policy" ? 75 : 125, 0.24, 0.035, "triangle");
  tone(280, 0.05, 0.012, "triangle", 0.03);
}
function label(e: PublicEvent, t: Copy) {
  switch (e.type) {
    case "policy":
      return e.policy === "liberal" ? t.policyL : t.policyF;
    case "vote":
      return Object.values(e.votes ?? {}).filter(Boolean).length >
        Object.keys(e.votes ?? {}).length / 2
        ? "JA! / APPROVED"
        : "NEIN! / REJECTED";
    case "chaos":
      return "CHAOS / NOTVERORDNUNG";
    case "execution":
      return t.executed;
    case "nomination":
      return t.nomination;
    case "investigation":
      return t.investigated;
    case "special_election":
      return t.special_election;
    case "veto_request":
      return t.vetoRequest;
    case "veto_answer":
      return t.veto;
    case "night_end":
      return t.start;
    case "victory":
      return t.finished;
    default:
      return null;
  }
}
export function Presentation({
  room,
  t,
  reduced,
}: {
  room: RoomView | null;
  t: Copy;
  reduced: boolean;
}) {
  const { connected, resuming } = useApp(),
    [cue, setCue] = useState<PublicEvent | null>(null),
    [enabled, setEnabled] = useState(readLocal("sh-sound", "0") === "1");
  const previous = useRef<{ code: string; id: number } | null>(null),
    fresh = useRef(true);
  useEffect(() => {
    if (!connected || resuming) {
      fresh.current = true;
      setCue(null);
    }
  }, [connected, resuming]);
  useEffect(() => {
    const g = room?.game;
    if (!g || !connected || resuming) {
      if (!g) previous.current = null;
      return;
    }
    const latest = g.events.at(-1);
    if (!latest) return;
    const baseline = fresh.current || previous.current?.code !== room.code;
    fresh.current = false;
    if (
      !baseline &&
      latest.id > (previous.current?.id ?? 0) &&
      label(latest, t)
    ) {
      setCue(latest);
      sound(latest.type);
    }
    previous.current = { code: room.code, id: latest.id };
  }, [room?.game?.version, room?.code, connected, resuming]);
  useEffect(() => {
    if (!cue) return;
    const timer = setTimeout(
      () => setCue(null),
      reduced
        ? 900
        : cue.type === "chaos"
          ? 4000
          : cue.type === "execution"
            ? 3000
            : 2200,
    );
    return () => clearTimeout(timer);
  }, [cue, reduced]);
  useEffect(() => {
    const g = room?.game;
    const tension = g
      ? Math.min(1, (g.fascist / 6) * 0.8 + (g.tracker / 3) * 0.2)
      : 0;
    document.documentElement.style.setProperty("--tension", String(tension));
  }, [room?.game?.fascist, room?.game?.tracker]);
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      context();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    const ctx = context();
    if (!ctx) return;
    const oscillators: OscillatorNode[] = [],
      gains: GainNode[] = [];
    const count = 1 + (room?.game?.fascist ?? 0);
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 60 : 48 + i * 13.25;
      gain.gain.value = i === 0 ? 0.005 : 0.0015;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      oscillators.push(osc);
      gains.push(gain);
    }
    const tick = setInterval(() => {
      if (ctx.state === "running") tone(540, 0.025, 0.003, "triangle");
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      clearInterval(tick);
      oscillators.forEach((o) => {
        o.stop();
        o.disconnect();
      });
      gains.forEach((g) => g.disconnect());
    };
  }, [enabled, room?.game?.fascist]);
  return (
    <>
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
      {cue && (
        <div
          key={`${room?.code}-${cue.id}`}
          className={`presentation ${cue.type} ${cue.policy ?? ""}`}
          aria-hidden="true"
        >
          <div className="event-stamp">
            <small>PROTOKOLL / {String(cue.id).padStart(3, "0")}</small>
            <strong>{label(cue, t)}</strong>
          </div>
          <button onClick={() => setCue(null)}>{t.skip}</button>
        </div>
      )}
    </>
  );
}
