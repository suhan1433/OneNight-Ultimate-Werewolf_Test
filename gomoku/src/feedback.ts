// Small, locally synthesized sounds: no audio downloads or background music.
let context: AudioContext | null = null;
let enabled = true;
export function setSoundEnabled(value: boolean) {
  enabled = value;
  if (!value && context) {
    void context.close().catch(() => {});
    context = null;
  }
}
export function unlockSound() {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch {
    /* Sound is optional on browsers without Web Audio. */
  }
}
export function stoneSound(black: boolean) {
  if (!enabled || !context || context.state !== "running" || document.hidden)
    return;
  const audio = context,
    at = audio.currentTime;
  const duration = 0.09,
    buffer = audio.createBuffer(
      1,
      Math.ceil(audio.sampleRate * duration),
      audio.sampleRate,
    );
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++)
    samples[i] =
      (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.012));
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = black ? 1700 : 2100;
  filter.Q.value = 0.8;
  const gain = audio.createGain();
  gain.gain.value = 0.2;
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(at);
  const body = audio.createOscillator(),
    envelope = audio.createGain();
  body.frequency.setValueAtTime(black ? 340 : 410, at);
  body.frequency.exponentialRampToValueAtTime(150, at + 0.06);
  envelope.gain.setValueAtTime(0.065, at);
  envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.075);
  body.connect(envelope).connect(audio.destination);
  body.start(at);
  body.stop(at + 0.08);
}
export function finishSound(won: boolean) {
  if (!enabled || !context || context.state !== "running" || document.hidden)
    return;
  const audio = context;
  for (const [index, frequency] of (won
    ? [523.25, 659.25, 783.99]
    : [392, 329.63]
  ).entries()) {
    const at = audio.currentTime + 0.22 + index * 0.13;
    const tone = audio.createOscillator(),
      gain = audio.createGain();
    tone.type = "sine";
    tone.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.035, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.65);
    tone.connect(gain).connect(audio.destination);
    tone.start(at);
    tone.stop(at + 0.7);
  }
}
