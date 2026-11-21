import { describe, expect, it } from 'vitest';
import { CountdownClock } from '../../../web/src/countdown-clock';
describe('browser monotonic countdown',()=>{
  it('keeps advancing through every frame rather than stepping every 250ms',()=>{
    const clock=new CountdownClock();clock.sync(9_000,1_000,500);
    expect(clock.remaining(500)).toBe(8);
    const samples=Array.from({length:120},(_,i)=>clock.remaining(500+i*1000/60));
    expect(new Set(samples).size).toBe(120);
    for(let i=1;i<samples.length;i++)expect(samples[i-1]!-samples[i]!).toBeCloseTo(1/60,6);
  });
  it('never jumps backwards or restarts after a room update or copied-role substep',()=>{
    const clock=new CountdownClock();clock.sync(9_000,1_000,100);
    expect(clock.remaining(2_100)).toBe(6);
    clock.sync(9_000,2_900,2_100);expect(clock.remaining(2_100)).toBe(6);
    clock.sync(9_000,2_000,3_100);expect(clock.remaining(3_100)).toBe(5);
    expect(clock.remaining(9_100)).toBe(0);
  });
  it('resets once for a new deadline and catches up after background suspension',()=>{
    const clock=new CountdownClock();clock.sync(9_000,1_000,100);
    expect(clock.remaining(20_100)).toBe(0);
    clock.sync(40_000,30_000,20_100);expect(clock.remaining(20_100)).toBe(10);
    expect(clock.remaining(21_100)).toBe(9);
  });
});
