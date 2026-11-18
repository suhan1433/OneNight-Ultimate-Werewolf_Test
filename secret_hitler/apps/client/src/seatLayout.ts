/**
 * Seat ring layout: seats sit on the perimeter of the table box (top row, right
 * column, bottom row, left column) instead of an ellipse, which wastes the
 * corners and made 9–10 players overlap on phones. The largest seat size that
 * still fits `n` seats without overlap is chosen for the measured box.
 * Slots are numbered clockwise starting at the top-left corner.
 */
export type SeatRing = {
  ph: number; // portrait width (px)
  sw: number; // seat width
  sh: number; // seat height
  slots: { x: number; y: number }[]; // seat centres, clockwise from top-left
  bottomCenter: number; // slot index at the bottom middle (where the local player sits)
};

export function layoutSeats(W: number, H: number, n: number): SeatRing {
  const gap = 4;
  for (let ph = 60; ph >= 24; ph -= 2) {
    const sw = Math.max(ph + 10, 54),
      sh = Math.round(1.2 * ph) + 47,
      Rw = W - sw,
      Rh = H - sh;
    if (Rw < 0 || Rh < 0) continue;
    const rowMax = Math.floor(Rw / (sw + gap)) + 1,
      colMax = Math.max(0, Math.floor(Rh / (sh + gap)) - 1),
      ideal = (n / 2) * (Rh / (Rw + Rh));
    let best: [number, number, number] | null = null,
      bestScore = Infinity;
    for (let nl = 0; nl <= colMax; nl++) {
      const rest = n - 2 * nl;
      if (rest < 0 || (n >= 2 && rest < 2)) continue; // always keep a top and a bottom row (local seat = bottom centre)
      const nt = Math.ceil(rest / 2),
        nb = rest - nt;
      if (nt > rowMax || nb > rowMax) continue;
      if (nb > 0 && Rh < sh + gap) continue; // top and bottom rows must not collide vertically
      const score = Math.abs(nl - ideal);
      if (score < bestScore) {
        bestScore = score;
        best = [nt, nb, nl];
      }
    }
    if (!best) continue;
    const [nt, nb, nl] = best,
      slots: { x: number; y: number }[] = [],
      row = (count: number, k: number) =>
        count === 1 ? W / 2 : sw / 2 + (k * Rw) / (count - 1);
    for (let k = 0; k < nt; k++) slots.push({ x: row(nt, k), y: sh / 2 });
    for (let j = 0; j < nl; j++)
      slots.push({ x: W - sw / 2, y: sh / 2 + ((j + 1) * Rh) / (nl + 1) });
    for (let k = 0; k < nb; k++)
      slots.push({ x: W - row(nb, k), y: H - sh / 2 }); // right → left
    for (let j = 0; j < nl; j++)
      slots.push({ x: sw / 2, y: sh / 2 + ((nl - j) * Rh) / (nl + 1) });
    return {
      ph,
      sw,
      sh,
      slots,
      bottomCenter: nt + nl + Math.floor((nb - 1) / 2),
    };
  }
  // degenerate box: fall back to a plain circle of tiny seats
  const sw = 54,
    sh = 80;
  return {
    ph: 24,
    sw,
    sh,
    slots: Array.from({ length: n }, (_, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      return {
        x: W / 2 + ((W - sw) / 2) * Math.cos(a),
        y: H / 2 + ((H - sh) / 2) * Math.sin(a),
      };
    }),
    bottomCenter: Math.floor(n / 2),
  };
}

/** slot for player index k when player `selfIdx` should sit at the bottom centre */
export const slotFor = (ring: SeatRing, k: number, selfIdx: number, n: number) =>
  ring.slots[(((ring.bottomCenter + k - selfIdx) % n) + n) % n];
