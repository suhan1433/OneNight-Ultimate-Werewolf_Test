/** A server deadline anchored to a monotonic browser clock for one turn. */
export class CountdownClock {
  private deadline?: number | null;
  private anchor = 0;
  private duration = 0;

  sync(deadline: number | null | undefined, serverNow: number, monotonicNow: number) {
    // A repeated room snapshot must not restart the same countdown. Its
    // transport delay varies, so re-anchoring on each packet causes jumps.
    if (deadline === this.deadline) return;
    this.deadline = deadline;
    this.anchor = monotonicNow;
    this.duration = Math.max(0, (deadline ?? serverNow) - serverNow);
  }

  remaining(monotonicNow: number) {
    return Math.max(0, this.duration - Math.max(0, monotonicNow - this.anchor)) / 1000;
  }
}
