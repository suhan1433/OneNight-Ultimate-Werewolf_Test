import { useEffect, useRef, useState } from 'react';
import { cardLessons } from './card-examples';

const artUrl = (art: string) => `${import.meta.env.BASE_URL}card-art/${art}.jpg`;

export function CardExample({ art, title, close }: { art: string; title: string; close: () => void }) {
  const lesson = cardLessons[art];
  const [variant, setVariant] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const example = lesson.examples[variant];
  const end = example.plays.length + 2;
  const effect = step > example.plays.length;
  const finished = step === end;
  const captions = [
    { title: '세 사람이 한 트릭을 시작합니다', text: 'A → B → C 순서로 카드를 냅니다. 다음 버튼으로 한 장씩 보거나 자동 재생해 보세요.' },
    ...example.plays.map((play, index) => ({ title: `${index + 1}. ${'ABC'[play.player]}의 ${index > 2 ? '추가 카드' : '차례'}`, text: `${play.name}${play.declaration ? ` · ${play.declaration}` : ''}를 냅니다.${index === 2 && example.plays.length > 3 ? ' 모두 첫 카드를 냈으므로 마지막 포격의 추가 카드를 냅니다.' : ''}` })),
    { title: '카드 효과 적용', text: example.effect },
    { title: '결과와 다음 행동', text: example.result },
  ];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); event.stopImmediatePropagation(); setPlaying(false);
        setStep(current => Math.min(end, Math.max(0, current + (event.key === 'ArrowRight' ? 1 : -1))));
      }
      if (event.key === 'Tab') {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [close, end]);
  useEffect(() => {
    if (!playing || finished) return;
    const timer = window.setTimeout(() => setStep(current => Math.min(end, current + 1)), step === 0 ? 1400 : effect ? 4200 : 2300);
    return () => window.clearTimeout(timer);
  }, [step, playing, finished, effect, end]);
  const move = (next: number) => { setPlaying(false); setStep(next); };

  return <div className="modal card-example-overlay" onClick={event => { event.stopPropagation(); close(); }}>
    <div className="card-example" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="card-example-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <button type="button" className="help-x" onClick={close} aria-label="카드 예시 닫기" title="예시 닫기">×</button>
      <header className="example-heading"><img src={artUrl(art)} alt=""/><div><small>3인 플레이 · 카드 사용 예시</small><h2 id="card-example-title">{title}</h2><p>{lesson.rule}</p></div></header>
      {lesson.examples.length > 1 && <div className="example-variants" role="group" aria-label="예시 선택">{lesson.examples.map((item, index) => <button key={item.label} type="button" aria-pressed={variant === index} className={variant === index ? 'selected' : ''} onClick={() => { setVariant(index); setStep(0); }}>{item.label}</button>)}</div>}
      <div className={`example-table${effect && example.destroy ? ' destroyed' : ''}`} aria-label="3인 예시 테이블">
        <div className="example-table-label">{effect ? example.destroy ? '트릭 파괴 · 획득 없음' : finished ? '결과 확인' : '효과 적용 중' : '카드를 내는 중'}</div>
        <div className="example-seats">{[0, 1, 2].map(player => <section className={'example-seat' + (effect && example.winner === player ? ' winner' : '')} key={player} aria-label={`${'ABC'[player]} 플레이어`}>
          <b>{'ABC'[player]} <span>{effect && example.winner === player ? '승리 · +1트릭' : '플레이어'}</span></b>
          <div className="example-played">{example.plays.map((play, index) => play.player === player && <div key={`${variant}-${index}`} className={`example-card-slot${step > index ? ' revealed' : ''}${effect && example.removed?.includes(index) ? ' removed' : ''}${effect && example.destroy ? ' sunk' : ''}`}>
            {step > index ? <figure><img src={artUrl(play.art)} alt={play.name}/><figcaption>{play.declaration || play.name}</figcaption>{effect && example.removed?.includes(index) && <span className="example-card-mark">{example.destroy ? '파괴' : '제거'}</span>}</figure> : <div className="example-card-back"><span>{index > 2 ? '추가 카드' : '대기'}</span></div>}
          </div>)}</div>
        </section>)}</div>
        {effect && example.destroy && <div className="example-vortex" aria-hidden="true"/>}
      </div>
      <div className="example-caption" aria-live="polite" aria-atomic="true"><small>{step + 1} / {end + 1} 단계</small><h3>{captions[step].title}</h3><p>{captions[step].text}</p>
        {finished && example.after && <div className="example-outcomes">{example.after.map(item => <span key={item}>{item}</span>)}</div>}
      </div>
      <div className="example-progress" role="group" aria-label="예시 단계">{captions.map((caption, index) => <button type="button" key={index} className={index <= step ? 'reached' : ''} aria-label={`${index + 1}단계: ${caption.title}`} aria-current={index === step ? 'step' : undefined} onClick={() => move(index)}/>)}</div>
      <div className="example-controls">
        <button type="button" disabled={step === 0} onClick={() => move(step - 1)}>이전</button>
        <button type="button" onClick={() => { if (finished) setStep(0); setPlaying(finished || !playing); }}>{finished ? '↻ 다시 보기' : playing ? '일시정지' : '자동 재생'}</button>
        <button type="button" className="primary" disabled={finished} onClick={() => move(step + 1)}>다음</button>
      </div>
      {lesson.note && <p className="example-note">{lesson.note}</p>}
      <button type="button" className="text example-back" onClick={close}>도움말로 돌아가기</button>
    </div>
  </div>;
}
