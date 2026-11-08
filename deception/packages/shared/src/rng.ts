/** Serializable, deterministic PRNG; not a security token generator. */
export function seedOf(seed: string): number {
  let value = 2166136261;
  for (const char of seed)
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function nextRandom(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) >>> 0;
  let value = Math.imul(next ^ (next >>> 15), next | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return [((value ^ (value >>> 14)) >>> 0) / 4294967296, next];
}

export function shuffle<T>(items: readonly T[], seed: number): [T[], number] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const [random, next] = nextRandom(seed);
    seed = next;
    const j = Math.floor(random * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return [result, seed];
}
