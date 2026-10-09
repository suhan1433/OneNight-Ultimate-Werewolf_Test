/**
 * 분위기 사운드 + 햅틱 (외부 음원 없이 WebAudio로 합성)
 *  - ambience : 파도(필터 노이즈 + 느린 LFO) · 가끔 들리는 선체 삐걱임
 *  - drums    : 비딩 공개 3박 (두 번 낮게, 마지막은 크게)
 *  - thud     : 내 카드가 탁자에 닿는 소리
 *  - coin     : 트릭 획득 차임
 * 카드 던지는 소리는 기존 ./sound 의 playCardSound 가 계속 담당한다.
 * 브라우저 정책상 사용자 제스처 이후(unlock)에만 시작된다.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let amb: { stop: () => void } | null = null;
let enabled = true;
let wantAmbience = false;

const AC = () => (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const C = AC();
  if (!C) return null;
  try {
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

function noiseBuffer(c: AudioContext, seconds: number, brown = true) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } else d[i] = w;
  }
  return buf;
}

function startAmbience() {
  const c = ensure();
  if (!c || !master || amb || !enabled) return;
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(master);
  out.gain.linearRampToValueAtTime(0.5, c.currentTime + 2.5);

  // 파도: 갈색 노이즈 → 로우패스 → 느린 LFO로 밀려왔다 빠지는 느낌
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 8);
  src.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.4;
  const swell = c.createGain(); swell.gain.value = 0.55;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.09;
  const lfoAmt = c.createGain(); lfoAmt.gain.value = 0.32;
  lfo.connect(lfoAmt); lfoAmt.connect(swell.gain);
  const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.17;
  const lfo2Amt = c.createGain(); lfo2Amt.gain.value = 180;
  lfo2.connect(lfo2Amt); lfo2Amt.connect(lp.frequency);
  src.connect(lp); lp.connect(swell); swell.connect(out);
  src.start(); lfo.start(); lfo2.start();

  // 선체 삐걱임: 가끔, 낮은 톱니파의 피치가 천천히 흔들림
  let timer = 0;
  const creak = () => {
    if (!ctx || !master) return;
    const t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = 70 + Math.random() * 50;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * (1.15 + Math.random() * 0.25), t + 0.9);
    o.frequency.linearRampToValueAtTime(f0 * 0.92, t + 1.8);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260 + Math.random() * 160; bp.Q.value = 7;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.5);
    g.gain.linearRampToValueAtTime(0, t + 1.9);
    o.connect(bp); bp.connect(g); g.connect(out);
    o.start(t); o.stop(t + 2);
    timer = window.setTimeout(creak, 7000 + Math.random() * 9000);
  };
  timer = window.setTimeout(creak, 3500);

  amb = {
    stop: () => {
      window.clearTimeout(timer);
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.8);
      window.setTimeout(() => { try { src.stop(); lfo.stop(); lfo2.stop(); out.disconnect(); } catch { /* 이미 정지됨 */ } }, 900);
    },
  };
}

function stopAmbience() { amb?.stop(); amb = null; }

function tone(freq: number, to: number, dur: number, gain: number, type: OscillatorType = 'sine', delay = 0) {
  const c = ensure(); if (!c || !master || !enabled) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function click(delay: number, gain: number, freq = 1400, dur = 0.05) {
  const c = ensure(); if (!c || !master || !enabled) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = noiseBuffer(c, 0.2, false);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.02);
}

export const haptic = (pattern: number | number[]) => {
  if (!enabled) return;
  try { navigator.vibrate?.(pattern); } catch { /* 지원하지 않는 기기 */ }
};

export const fx = {
  /** 사용자 제스처 안에서 호출: 오디오 컨텍스트를 깨우고 앰비언트를 시작 */
  unlock() {
    const c = ensure();
    if (!c) return;
    if (c.state === 'suspended') void c.resume();
    if (wantAmbience && enabled) startAmbience();
  },
  setEnabled(on: boolean) {
    enabled = on;
    if (!on) stopAmbience();
    else if (wantAmbience) startAmbience();
  },
  ambience(on: boolean) {
    wantAmbience = on;
    if (!on) stopAmbience();
    else if (ctx && ctx.state === 'running') startAmbience();
  },
  /** 비딩 공개 3박: 쿵 · 쿵 · 쿵(크게) */
  drums() {
    [0, 0.46, 0.92].forEach((d, i) => {
      const big = i === 2;
      tone(big ? 120 : 100, big ? 38 : 44, big ? 0.55 : 0.36, big ? 0.9 : 0.6, 'sine', d);
      click(d, big ? 0.35 : 0.2, 220, 0.07);
    });
    haptic([24, 420, 24, 420, 60]);
  },
  /** 내 카드가 탁자에 닿는 소리 + 진동 */
  thud() {
    tone(150, 52, 0.18, 0.55, 'sine');
    click(0, 0.16, 900, 0.04);
    haptic(14);
  },
  /** 트릭 획득 */
  coin(mine = false) {
    tone(1320, 1320, 0.5, 0.12, 'triangle');
    tone(1980, 1980, 0.7, 0.08, 'sine', 0.07);
    click(0, 0.05, 5200, 0.03);
    if (mine) haptic([26, 50, 26]);
  },
  /** 내 차례 */
  nudge() { haptic(18); },
};
