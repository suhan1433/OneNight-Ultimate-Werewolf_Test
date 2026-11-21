import { useLayoutEffect, useRef, useState } from 'react';
import { CountdownClock } from './countdown-clock';

/** Animate only the timer DOM; never re-render the role controls per frame. */
export function NightCountdown({ expires, serverNow, total, onExpire }: {
  expires?: number | null; serverNow: number; total: number; onExpire: () => void;
}) {
  const ring = useRef<SVGCircleElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const clock = useRef(new CountdownClock());
  const callback = useRef(onExpire);
  const latestServerNow = useRef(serverNow);
  const [expired, setExpired] = useState(false);
  callback.current = onExpire;
  latestServerNow.current = serverNow;
  useLayoutEffect(() => {
    let frame = 0;
    let finished = false;
    let lastText = '';
    setExpired(false);
    clock.current.sync(expires, latestServerNow.current, performance.now());
    const paint = () => {
      const remaining = clock.current.remaining(performance.now());
      const fraction = Math.min(1, remaining / Math.max(.001, total));
      ring.current?.setAttribute('stroke-dashoffset', String(339.3 * (1 - fraction)));
      const text = remaining.toFixed(1);
      if (text !== lastText && label.current) { label.current.textContent = text; lastText = text; }
      container.current?.classList.toggle('danger', remaining > 0 && remaining <= 2);
      if (remaining > 0) frame = requestAnimationFrame(paint);
      else if (!finished && expires) { finished = true; setExpired(true); callback.current(); }
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [expires, total]);
  return <>
    <div ref={container} className="ring-wrap smooth-countdown" role="timer" aria-label="밤 행동 남은 시간" aria-live="off">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ring-bg" cx="60" cy="60" r="54"/>
        <circle ref={ring} className="ring-fg" cx="60" cy="60" r="54" strokeDashoffset="0"/>
      </svg>
      <div ref={label} className="timer">{total.toFixed(1)}</div>
    </div>
    {expired && <p className="transitioning" role="status">다음 순서를 준비 중…</p>}
  </>;
}
