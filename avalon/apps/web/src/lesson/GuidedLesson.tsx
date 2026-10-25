import { useEffect, useId, useRef, type ReactNode } from 'react';
import './guided-lesson.css';

/** A lesson is local practice: it never reads or submits a live game's actions. */
export function GuidedLesson({ theme, title, goal, perspective, step, labels, heading, coach, status, children, onPrevious, onNext, onRestart, nextLabel = '다음 장면' }: {
  theme: 'space' | 'pirate' | 'avalon'; title: string; goal: string; perspective: string;
  step: number; labels: string[]; heading: string; coach: string; status?: ReactNode; children: ReactNode;
  onPrevious: () => void; onNext: () => void; onRestart: () => void; nextLabel?: string;
}) {
  const id = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previous = useRef(step);
  useEffect(() => {
    if (previous.current === step) return;
    previous.current = step;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'nearest' });
  }, [step]);
  return <div className={`guided-lesson gl-${theme}`} aria-label={title}>
    <div className="gl-goal"><small>{perspective} · 연습 화면</small><b>{goal}</b></div>
    <div className="gl-progress"><span>배우는 순서 {step + 1}/{labels.length}</span><b>{labels[step]}</b></div>
    <div className="gl-track" aria-hidden="true">{labels.map((label, i) => <i key={label} className={i === step ? 'current' : i < step ? 'done' : ''} />)}</div>
    {status && <div className="gl-status" aria-label="예시의 현재 상황">{status}</div>}
    <h4 className="gl-heading" id={id} ref={headingRef} tabIndex={-1}>{heading}</h4>
    <p className="gl-coach"><b>룰마스터</b><span>{coach}</span></p>
    <div className="gl-content" key={step} role="group" aria-labelledby={id}>{children}</div>
    <nav className="gl-nav" aria-label={`${title} 이동`}>
      <button type="button" disabled={step === 0} onClick={onPrevious}>이전 장면</button>
      {step === labels.length - 1
        ? <button type="button" className="primary" onClick={onRestart}>처음부터 보기</button>
        : <button type="button" className="primary" onClick={onNext}>{nextLabel}</button>}
    </nav>
    <p className="gl-sandbox">실제 게임에는 반영되지 않아요. 선택을 바꾸거나 설명만 보고 넘어가도 돼요.</p>
  </div>;
}

export function CoachResult({ children }: { children: ReactNode }) {
  return <div className="gl-feedback" role="status" aria-live="polite">{children}</div>;
}

export function MoreRules({ children, title = '궁금할 때 더 보기' }: { children: ReactNode; title?: string }) {
  return <details className="gl-more"><summary>{title}</summary><div>{children}</div></details>;
}

export function HiddenCard({ label = '아직 낸 카드 없음' }: { label?: string }) {
  return <div className="gl-card-back" role="img" aria-label={label}><span aria-hidden="true">?</span></div>;
}
