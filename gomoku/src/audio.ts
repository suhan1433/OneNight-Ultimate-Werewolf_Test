let context: AudioContext | undefined;
export function playTone(kind: string, volume: number) {
  if (volume <= 0) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const t = context.currentTime;
    const osc = context.createOscillator(),
      gain = context.createGain();
    osc.connect(gain);
    gain.connect(context.destination);
    osc.type = kind === "SKILL_CAST" ? "sine" : "triangle";
    osc.frequency.setValueAtTime(
      kind === "PLACE_STONE" ? 240 : kind === "FINAL_MOVE" ? 660 : 440,
      t,
    );
    osc.frequency.exponentialRampToValueAtTime(
      kind === "PLACE_STONE" ? 75 : 220,
      t + 0.16,
    );
    gain.gain.setValueAtTime(volume * 0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.start(t);
    osc.stop(t + 0.25);
  } catch {}
}
let ambient:
  | { context: AudioContext; nodes: OscillatorNode[]; gain: GainNode }
  | undefined;
export function ambience(volume: number, tension: number) {
  if (volume <= 0) {
    if (ambient) {
      ambient.nodes.forEach((n) => n.stop());
      void ambient.context.close();
      ambient = undefined;
    }
    return;
  }
  try {
    if (!ambient) {
      const c = new AudioContext(),
        gain = c.createGain();
      gain.connect(c.destination);
      const nodes = [55, 82.41, 110].map((f, i) => {
        const o = c.createOscillator();
        o.type = "sine";
        o.frequency.value = f + i * 0.12;
        o.connect(gain);
        o.start();
        return o;
      });
      ambient = { context: c, nodes, gain };
    }
    void ambient.context.resume();
    ambient.gain.gain.setTargetAtTime(
      volume * (0.012 + tension * 0.008),
      ambient.context.currentTime,
      0.5,
    );
  } catch {}
}
