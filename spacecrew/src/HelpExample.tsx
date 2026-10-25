import { useEffect, useRef, useState } from 'react';
import type { Card } from './types';
import { CardFace, MarkerRail } from './ui';

const names = ['가람', '나래', '다온'];
const card = (id: string): Card => ({ id: `example-${id}`, suit: id[0] as Card['suit'], value: Number(id.slice(1)) });

function ExampleTrick({ cards, notes, winner, start = 0 }: { cards: string[]; notes: string[]; winner?: number; start?: number }) {
  return <div className="example-trick" aria-label="세 승무원이 낸 카드">
    {names.map((_, turn) => { const i = (start + turn) % names.length; return <figure key={names[i]} className={winner === i ? 'example-winner' : ''}>
      <b>{turn + 1}. {names[i]}</b>
      <CardFace card={card(cards[i])} size="sm" />
      <figcaption>{notes[i]}{winner === i && <strong>트릭 승리</strong>}</figcaption>
    </figure>; })}
  </div>;
}

/** 실제 게임과 분리된 3인 학습 예시. 손패는 설명에 필요한 카드만 보여 준다. */
export function HelpExample() {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'nearest' });
  }, [step]);

  const steps = [
    { title: '세 명이 한 팀으로 출발해요', content: <>
      <p>가람·나래·다온이 <b>미션 2</b>에 도전해요. 목표는 과제 카드 2장을 각각 맡은 사람이 가져오는 거예요. 세 사람은 함께 성공하거나 함께 실패해요.</p>
      <div className="example-goals"><CardFace card={card('B3')} size="sm" /><CardFace card={card('G2')} size="sm" /></div>
      <p>과제는 <b>파랑 3</b>과 <b>초록 2</b>예요. 작은 과제 카드는 목표 표시이고, 같은 색·숫자의 실제 카드는 누군가의 손패에 있어요.</p>
      <p>40장을 나누면 한 명은 14장, 나머지는 13장씩 받아요. <b>로켓 4를 받은 가람이 커맨더</b>예요. 진행 순서는 가람 → 나래 → 다온 → 가람이에요.</p>
      <p className="example-note">설명에 필요한 카드만 보여 줄게요. 실제 게임에서는 자기 손패만 볼 수 있어요.</p>
    </> },
    { title: '커맨더부터 과제를 골라요', content: <>
      <div className="example-assignments">
        <p><b>가람 · 커맨더</b><span><CardFace card={card('B3')} size="sm" />파랑 3 담당</span></p>
        <p><b>나래</b><span><CardFace card={card('G2')} size="sm" />초록 2 담당</span></p>
        <p><b>다온</b><span>과제 없음 · 두 사람을 도와요</span></p>
      </div>
      <p>가람이 파랑 3을 고르고, 다음 순서인 나래가 초록 2를 골랐어요. 과제가 모두 배정됐으니 다온은 맡은 과제 없이 시작해요.</p>
      <p><b>과제를 맡았다고 그 카드를 직접 내야 하는 건 아니에요.</b> 누가 내든, 그 카드가 포함된 트릭을 담당자가 이기면 돼요.</p>
      <p className="example-note">‘트릭’은 각자 카드 한 장씩 내는 한 묶음이에요. 3인 게임에서는 카드 3장이 모이면 트릭 하나가 끝나요.</p>
    </> },
    { title: '첫 카드를 내기 전에 통신해요', content: <>
      <p>과제 배정이 끝났어요. 이 예시에서는 조난 신호를 사용하지 않고, 나래가 <b>📡 통신하기</b>를 눌러 초록 9을 공개해요.</p>
      <figure className="example-communication"><span className="with-rail"><CardFace card={card('G9')} size="sm" /><MarkerRail spot="top" still /></span><figcaption>맨 위 마커 = 내 초록 카드 중 가장 높아요</figcaption></figure>
      <p>나래는 초록 9과 초록 2를 가지고 있어요. 초록 9이 자신의 초록 카드 중 가장 높으므로 맨 위에 마커를 놓을 수 있어요. <b>이 카드는 손패에 남아 나중에 낼 수 있어요.</b></p>
      <p>통신은 한 사람당 미션마다 한 번, 트릭의 첫 카드가 나오기 전에 할 수 있어요. 자신의 차례가 아니어도 돼요. 로켓은 공개할 수 없어요.</p>
      <p className="example-note">초록 2도 가졌다는 설명은 학습용이에요. 실제로는 “초록 2도 있어요”처럼 손패를 말로 알려 주면 안 돼요.</p>
    </> },
    { title: '첫 트릭: 파랑 3 과제를 완료해요', content: <>
      <ExampleTrick cards={['B8', 'B3', 'Y9']} notes={['파랑으로 시작', '파랑이 있어 따라내기', '파랑이 없어 노랑 내기']} winner={0} />
      <p>가람이 파랑 8을 먼저 냈으므로, 파랑이 있는 사람은 반드시 파랑을 내야 해요. 나래는 파랑 3을 내고, 파랑이 없는 다온은 노랑 9를 내요.</p>
      <p><b>가람의 파랑 8이 이겨요.</b> 노랑 9는 숫자가 더 커도 처음 나온 색이 아니어서 이길 수 없어요. 가람이 카드 3장을 모두 가져가므로 <b>가람의 파랑 3 과제가 완료</b>돼요.</p>
      <p className="example-note">남은 과제는 나래의 초록 2예요. 방금 이긴 가람이 다음 트릭의 첫 카드를 내요. 같은 색 카드가 여러 장이면 그중 어떤 숫자를 낼지는 자유예요.</p>
    </> },
    { title: '선택 연습: 로켓을 내면 누가 이길까요?', content: <>
      <p>다음 트릭에서 가람은 초록 5, 나래는 초록 9을 냈어요. <b>초록이 없는 다온</b>이 로켓 1을 낸다면 누가 이길까요? 아래 카드는 가상의 선택이에요.</p>
      <ExampleTrick cards={['G5', 'G9', 'R1']} notes={['초록으로 시작', '초록을 따라냄', '초록이 없어 로켓 선택']} />
      <div className="example-answers" role="group" aria-label="이 트릭의 승자는 누구일까요?">{names.map((name, i) => <button key={name} type="button" aria-pressed={answer === i} onClick={() => setAnswer(i)}>{name}</button>)}</div>
      <div className="example-feedback" role="status">{answer === null ? <p>승무원 이름을 눌러 결과를 확인해 보세요.</p> : <>
        <p><b>{answer === 2 ? '맞아요! 다온이 이겨요.' : '이 경우에는 다온이 이겨요.'}</b> 로켓은 색 카드보다 강해서 로켓 1도 초록 9을 이겨요. 로켓이 여러 장이면 가장 큰 로켓이 이겨요.</p>
        <p>이번 트릭에는 과제 카드가 없어 바로 실패하지는 않지만, 다음 트릭은 다온이 시작하게 돼요. 다음 단계에서는 <b>다온이 로켓을 아껴 두는 선택</b>으로 이어가 볼게요.</p>
      </>}</div>
      <p className="example-note">초록이 있다면 초록을 따라야 하므로 로켓을 낼 수 없어요. 로켓으로 시작한 트릭에서는 로켓이 있는 사람이 반드시 로켓을 내야 해요.</p>
    </> },
    { title: '두 번째 트릭: 나래가 이겨요', content: <>
      <ExampleTrick cards={['G5', 'G9', 'Y7']} notes={['초록으로 시작', '통신했던 카드를 냄', '로켓 대신 노랑 선택']} winner={1} />
      <p>다온이 노랑 7을 내면 나래의 초록 9이 이겨요. 통신했던 카드를 냈으므로 나래의 통신 표시는 사용 완료로 바뀌어요. <b>초록 2는 아직 나오지 않았으니 과제는 남아 있어요.</b></p>
      <p><b>이제 다음 트릭은 나래가 시작해요.</b> 진행 방향은 그대로라서 나래 → 다온 → 가람 순서예요.</p>
      <p className="example-note">모든 트릭을 이길 필요는 없어요. 과제 카드가 나온 트릭을 담당자가 이기는 게 중요해요.</p>
    </> },
    { title: '세 번째 트릭: 모두 함께 성공!', content: <>
      <ExampleTrick cards={['Y1', 'G2', 'Y6']} notes={['초록이 없어 노랑 내기', '남은 과제 카드로 시작', '초록이 없어 노랑 내기']} winner={1} start={1} />
      <p>나래가 초록 2로 시작해요. 이 예시에서 다온과 가람은 남은 초록 카드가 없어서 각각 노랑 6과 노랑 1을 냈어요. <b>처음 나온 색인 초록을 낸 나래가 이겨요.</b></p>
      <p>초록 2는 숫자가 작아도 이길 수 있어요. 노랑 카드들은 초록 트릭을 이길 수 없고, 아무도 로켓을 내지 않았기 때문이에요.</p>
      <p><b>가람의 파랑 3, 나래의 초록 2 과제가 모두 끝나 세 사람 모두 성공!</b> 만약 다온이 여기서 로켓 1을 냈다면 초록 2를 다온이 가져가므로 즉시 모두 실패했을 거예요.</p>
      <p className="example-note">과제를 모두 끝내면 손패가 남아도 성공해요. 3인 게임을 끝까지 진행하면 13트릭을 하고 남은 한 장은 쓰지 않아요. 특수 목표가 있는 미션은 해당 목표도 지켜야 해요.</p>
    </> },
  ];

  return <div className="help-example">
    <p className="example-progress">3인 예시 · {step + 1}/{steps.length}단계</p>
    <section className="example-step" aria-labelledby="example-step-title">
      <h3 id="example-step-title" ref={heading} tabIndex={-1}>{steps[step].title}</h3>
      {steps[step].content}
    </section>
    <nav className="example-nav" aria-label="예시 플레이 단계">
      <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>이전</button>
      {step < steps.length - 1
        ? <button type="button" className="primary" disabled={step === 4 && answer === null} onClick={() => setStep(step + 1)}>다음</button>
        : <button type="button" className="primary" onClick={() => { setStep(0); setAnswer(null); }}>처음부터 보기</button>}
    </nav>
  </div>;
}
