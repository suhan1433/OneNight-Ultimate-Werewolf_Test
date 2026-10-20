import { gameAudio } from './audio-settings';
import { preferAmbientAudio } from '../../../../game-audio/audio';
// 합성 효과음: 오디오 파일 없이 WebAudio로 "딱" 소리를 만든다.
// 브라우저 정책상 첫 터치/클릭 이후에만 소리가 난다. 음소거 상태는 localStorage에 저장된다.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unbind: (() => void) | undefined;
const isMuted = () => gameAudio.volume('effects') === 0;
/** 음소거 시 컨텍스트까지 닫아 모바일의 오디오 포커스를 확실히 반납한다. */
function releaseAudioSession() {
  const active = ctx;
  ctx = null;
  noiseBuf = null;
  master = null; unbind?.(); unbind = undefined;
  if (active && active.state !== 'closed') void active.close().catch(() => undefined);
}

function ac(): AudioContext | null {
  if (isMuted()) return null;
  try {
    preferAmbientAudio();
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    if (!ctx) { ctx = new C(); master = ctx.createGain(); unbind = gameAudio.bindGain(master, 'effects'); master.connect(ctx.destination); }
    if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => undefined);
    return ctx;
  } catch { return null; }
}

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.2), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

/** 짧은 타격음: 대역 필터를 건 노이즈(표면 소리) + 빠르게 떨어지는 사인(몸통 소리) */
function knock(vol: number, freq: number, when = 0, body = 150) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + when;
  const n = noise(c), f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  n.connect(f); f.connect(g); g.connect(master!);
  n.start(t); n.stop(t + 0.08);
  const o = c.createOscillator(), og = c.createGain();
  o.frequency.setValueAtTime(body, t); o.frequency.exponentialRampToValueAtTime(body * 0.5, t + 0.06);
  og.gain.setValueAtTime(vol * 0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(og); og.connect(master!);
  o.start(t); o.stop(t + 0.09);
}

function tone(freq: number, when: number, dur: number, vol: number) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master!);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  /** 타일을 집을 때(가볍게) */
  pick: () => knock(0.12, 2600, 0, 220),
  /** 타일을 테이블에 놓을 때("딱") */
  clack: () => knock(0.35, 1800, 0, 140),
  /** 게임 시작 때 타일이 한 장씩 들어오는 소리 */
  deal: (n: number) => { for (let i = 0; i < Math.min(n, 14); i++) knock(0.16, 1500 + (i % 3) * 300, i * 0.055 + 0.1, 170); },
  /** 조합이 완성됐을 때 / 배치를 확정했을 때 */
  chime: () => { tone(660, 0, 0.35, 0.08); tone(880, 0.09, 0.4, 0.07); },
  /** 내 차례가 됐을 때 */
  turn: () => { tone(523, 0, 0.3, 0.07); tone(784, 0.12, 0.45, 0.07); },
  /** 남은 시간 5초 이하 */
  tick: () => tone(1050, 0, 0.06, 0.05),
  isMuted,
  toggle: () => { gameAudio.update({ muted: !gameAudio.getSettings().muted }); if (!isMuted()) sfx.pick(); return isMuted(); },
  subscribe: gameAudio.subscribe,
};
gameAudio.subscribe(() => { if (isMuted()) releaseAudioSession(); });
