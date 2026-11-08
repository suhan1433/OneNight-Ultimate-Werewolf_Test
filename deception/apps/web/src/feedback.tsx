import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { GameView } from "@deception/shared";
import { useRoom } from "./store";

const useFeedbackSettings = create<{
  sound: boolean;
  haptic: boolean;
  set: (key: "sound" | "haptic", value: boolean) => void;
}>((set) => ({
  sound: localStorage.getItem("neon.sound") !== "off",
  haptic: localStorage.getItem("neon.haptic") !== "off",
  set: (key, value) => {
    localStorage.setItem(`neon.${key}`, value ? "on" : "off");
    set({ [key]: value });
  },
}));

let context: AudioContext | null = null;
export function unlockAudio() {
  if (!useFeedbackSettings.getState().sound) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
  } catch {
    /* Device has no audio context. */
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = "sine",
  vol = 0.07,
  to?: number,
  at = 0,
) {
  const c = context;
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.08, from = 2000, to = from, at = 0) {
  const c = context;
  if (!c) return;
  const t = c.currentTime + at;
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = c.createBufferSource();
  source.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  source.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  source.start(t);
}

const sfx = {
  marker() {
    noise(0.05, 0.12, 5000);
    tone(1900, 0.06, "square", 0.03, 1200);
    tone(130, 0.14, "sine", 0.12, 60, 0.01);
  },
  replace() {
    noise(0.28, 0.08, 600, 4200);
  },
  deal() {
    for (let i = 0; i < 6; i++) noise(0.12, 0.06, 1200, 3600, i * 0.14);
  },
  banner() {
    for (let i = 0; i < 3; i++) tone(110, 0.05, "sawtooth", 0.03, undefined, i * 0.09);
    tone(220, 0.3, "sawtooth", 0.02, undefined, 0.28);
  },
  stamp() {
    tone(90, 0.3, "sine", 0.18, 40);
    noise(0.08, 0.1, 900, 300);
  },
  startSolve() {
    for (let i = 0; i < 4; i++)
      tone(i % 2 ? 480 : 640, 0.18, "square", 0.025, undefined, i * 0.2);
  },
  wrong() {
    tone(220, 0.35, "sawtooth", 0.05, 110);
    tone(165, 0.35, "sawtooth", 0.04, 80, 0.12);
  },
  right() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 0.25, "triangle", 0.06, undefined, i * 0.09),
    );
  },
  turn() {
    tone(660, 0.12, "sine", 0.06);
    tone(880, 0.2, "sine", 0.06, undefined, 0.1);
  },
  tick() {
    tone(1000, 0.03, "square", 0.03);
  },
};
type Cue = keyof typeof sfx;
const haptics: Partial<Record<Cue, number | number[]>> = {
  marker: 12,
  replace: 10,
  deal: [8, 60, 8, 60, 8],
  banner: 10,
  stamp: [30, 40, 60],
  startSolve: [40, 30, 40],
  wrong: [20, 35, 20],
  right: [20, 45, 40],
  turn: [25, 40, 25],
};

function cue(name: Cue) {
  const { sound, haptic } = useFeedbackSettings.getState();
  if (sound && context?.state === "running") sfx[name]();
  const pattern = haptics[name];
  if (haptic && pattern !== undefined && navigator.vibrate)
    navigator.vibrate(pattern);
}

const SILENT = ["CRIME_NIGHT", "ROLE_REVEAL"];

export function useGameFeedback(game: GameView | null | undefined) {
  const previous = useRef<{
    count: number;
    phase: string;
    presenter: string | null;
  } | null>(null);
  useEffect(() => {
    if (!game) {
      previous.current = null;
      return;
    }
    const last = previous.current;
    previous.current = {
      count: game.history.length,
      phase: game.phase,
      presenter: game.presenterId ?? null,
    };
    // 밤 단계와 역할 확인은 정보 누출을 막기 위해 소리·진동을 내지 않습니다.
    if (!last || SILENT.includes(game.phase)) return;
    if (game.phase !== last.phase) {
      if (game.phase === "SOLVING") cue("startSolve");
      else if (game.phase === "DEAL") cue("deal");
      else if (game.phase === "RESULT") cue("stamp");
      else if (last.phase !== "SOLVING") cue("banner");
    }
    if (
      game.presenterId &&
      game.presenterId !== last.presenter &&
      game.presenterId === useRoom.getState().room?.selfId
    )
      cue("turn");
    for (const entry of game.history.slice(last.count).slice(-3)) {
      if (entry.type === "marker") cue("marker");
      else if (entry.type === "replace") cue("replace");
      else if (entry.type === "solve") cue(entry.correct ? "right" : "wrong");
    }
  }, [game]);

  const deadline = game?.timer.deadline ?? null;
  const phase = game?.phase;
  useEffect(() => {
    if (deadline === null || !phase || SILENT.includes(phase)) return;
    let lastSecond = -1;
    const id = setInterval(() => {
      const { room, offset } = useRoom.getState();
      if (room?.pausedAt != null) return;
      const left = Math.ceil((deadline - (Date.now() + offset)) / 1000);
      if (left >= 1 && left <= 5 && left !== lastSecond) {
        lastSecond = left;
        cue("tick");
      }
    }, 200);
    return () => clearInterval(id);
  }, [deadline, phase]);
}

export function FeedbackSettings() {
  const settings = useFeedbackSettings();
  return (
    <div className="settings-form">
      <label className="switch-row">
        효과음
        <input
          type="checkbox"
          checked={settings.sound}
          onChange={(e) => {
            settings.set("sound", e.target.checked);
            if (e.target.checked) unlockAudio();
          }}
        />
      </label>
      <label className="switch-row">
        진동
        <input
          type="checkbox"
          checked={settings.haptic}
          onChange={(e) => settings.set("haptic", e.target.checked)}
        />
      </label>
      <p className="muted">밤 단계에는 효과음과 진동이 나오지 않습니다.</p>
    </div>
  );
}
