import { useEffect, useRef, useState } from 'react';

const names = ['가람', '나래', '다온'];
type ExampleCard = { art: string; name: string };
const cards = {
  green9: { art: 'parrot-9', name: '앵무새 9 · 초록' },
  green4: { art: 'parrot-4', name: '앵무새 4 · 초록' },
  green2: { art: 'parrot-2', name: '앵무새 2 · 초록' },
  black2: { art: 'jolly-2', name: '졸리 로저 2 · 검정' },
  purple14: { art: 'map-14', name: '지도 14 · 보라' },
  yellow14: { art: 'treasure-14', name: '보물 14 · 노랑' },
  pirate: { art: 'pirate-rosie', name: '해적 · Rosie' },
  escape: { art: 'escape', name: '탈출 · 백기' },
} satisfies Record<string, ExampleCard>;
const hands = [
  [cards.green9, cards.black2, cards.escape],
  [cards.green4, cards.purple14, cards.pirate],
  [cards.green2, cards.yellow14, cards.escape],
];

function Picture({ card }: { card: ExampleCard }) {
  return <><img src={`${import.meta.env.BASE_URL}card-art/${card.art}.jpg`} alt={card.name} draggable={false} /><figcaption>{card.name}</figcaption></>;
}

function Trick({ played, notes, winner }: { played: ExampleCard[]; notes: string[]; winner?: number }) {
  return <div className="walk-trick" aria-label="3인 예시 트릭">
    <p className="walk-table-label">가람 → 나래 → 다온 순서로 한 장씩 내요</p>
    <div className="walk-plays">{played.map((card, i) => <figure key={names[i]} className={winner === i ? 'walk-winner' : ''}>
      <b>{i + 1}. {names[i]}</b><Picture card={card} /><p>{notes[i]}</p>
      {winner === i && <strong>승리 · 1트릭 획득</strong>}
    </figure>)}</div>
  </div>;
}

/** 고정된 카드 배분으로 기본 덱의 한 라운드를 끝까지 설명한다. */
export function RoundExample() {
  const [step, setStep] = useState(0);
  const [winnerAnswer, setWinnerAnswer] = useState<number | null>(null);
  const [scoreAnswer, setScoreAnswer] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'nearest' });
  }, [step]);

  const steps = [
    { title: '3라운드, 한 사람당 카드 3장', content: <>
      <p>가람·나래·다온이 <b>Classic 기본 덱</b>으로 게임 중이에요. 확장 카드와 해적 능력은 끄고, <b>3라운드</b>를 예로 볼게요.</p>
      <p>Classic은 1라운드에 1장, 2라운드에 2장처럼 늘어나므로 이번에는 각자 3장을 받아요. 한 사람이 한 장씩 내서 모인 카드 3장을 <b>‘트릭’</b>이라고 해요. 이번 라운드에는 총 3트릭을 진행해요.</p>
      <p>각자 이번에 이길 트릭 수를 예측해요. <b>많이 이기기보다 예측한 만큼 정확히 이기는 것</b>이 중요해요. 게임이 끝났을 때 누적 점수가 가장 높은 사람이 우승해요.</p>
      <p className="walk-note">이 예시에서는 딜러가 다온이라 그 왼쪽인 가람이 첫 트릭을 시작해요. 순서는 가람 → 나래 → 다온이에요.</p>
    </> },
    { title: '세 사람의 손패를 살펴봐요', content: <>
      <div className="walk-hands">{hands.map((hand, i) => <section key={names[i]} aria-label={`${names[i]}의 예시 손패`}><h4>{names[i]} · 3장</h4><div>{hand.map((card, j) => <figure key={j}><Picture card={card} /></figure>)}</div></section>)}</div>
      <p>초록·보라·노랑·검정은 숫자 카드의 <b>수트(무늬)</b>예요. 숫자는 1~14이고, 검정 졸리 로저는 다른 무늬의 숫자 카드를 이기는 <b>트럼프</b>예요.</p>
      <p><b>해적과 탈출은 특수 카드</b>예요. 해적은 숫자 카드보다 강하고, 탈출은 트릭을 피할 때 쓸 수 있어요.</p>
      <p className="walk-note">설명을 위해 세 손패를 모두 보여 줘요. 실제 게임에서는 자기 손패만 볼 수 있어요. 여기의 탈출 두 장은 서로 다른 카드예요.</p>
    </> },
    { title: '이번에 몇 트릭을 이길지 예측해요', content: <>
      <div className="walk-bids">{[2, 1, 0].map((bid, i) => <div key={names[i]}><b>{names[i]}</b><strong>{bid}트릭</strong><span>{['초록 9와 검정 2로 이길 계획', '해적으로 한 번 이길 계획', '트릭을 모두 피할 계획'][i]}</span></div>)}</div>
      <p>각자 <b>0~3 중 하나</b>를 고르고 봉인해요. 다른 사람의 예측은 모두 제출한 뒤 동시에 공개돼요.</p>
      <p>이번 예시는 가람 2, 나래 1, 다온 0으로 진행할게요. <b>0 예측은 “한 번도 이기지 않겠다”</b>는 뜻이에요.</p>
      <p className="walk-note">예측의 합을 트릭 수에 맞출 필요는 없어요. 손패가 강해 보여도 다른 사람이 어떤 카드를 낼지에 따라 결과가 달라질 수 있어요.</p>
    </> },
    { title: '첫 트릭: 같은 무늬 중 큰 숫자가 이겨요', content: <>
      <Trick played={[cards.green9, cards.green4, cards.green2]} notes={['초록으로 시작', '초록이 있어 따라내기', '초록이 있어 따라내기']} winner={0} />
      <p>가람이 초록 9로 시작했어요. 나래와 다온도 초록이 있으므로, <b>숫자 카드를 내기로 했다면 초록을 따라야 해요.</b> 같은 무늬에서는 가장 큰 9가 이겨요.</p>
      <p>가람이 카드 3장을 모두 가져가며 <b>1트릭을 획득</b>했어요. 카드 3장을 얻어도 트릭 수는 1만 늘어요. 방금 이긴 가람이 다음 트릭도 시작해요.</p>
      <p className="walk-note">같은 무늬가 있더라도 해적·탈출 같은 특수 카드는 낼 수 있어요. 같은 무늬의 숫자 카드가 여러 장이면 그중 어떤 숫자를 낼지는 자유예요.</p>
    </> },
    { title: '두 번째 트릭: 검정 2와 다른 무늬 14', content: <>
      <Trick played={[cards.black2, cards.purple14, cards.yellow14]} notes={['검정으로 시작', '검정이 없어 보라 내기', '검정이 없어 노랑 내기']} winner={winnerAnswer === null ? undefined : 0} />
      <p>가람이 검정 2를 냈어요. 검정이 없는 나래와 다온은 각각 보라 14, 노랑 14를 냈어요. <b>누가 이 트릭을 가져갈까요?</b></p>
      <div className="walk-answers" role="group" aria-label="두 번째 트릭의 승자 고르기">{names.map((name, i) => <button type="button" key={name} aria-pressed={winnerAnswer === i} onClick={() => setWinnerAnswer(i)}>{name}</button>)}</div>
      <div className="walk-feedback" role="status">{winnerAnswer === null ? <p>이름을 눌러 승자와 이유를 확인해 보세요.</p> : <>
        <p><b>{winnerAnswer === 0 ? '맞아요! 가람이 이겨요.' : '이 경우에는 가람이 이겨요.'}</b> 검정은 트럼프라 숫자가 2여도 다른 무늬의 14를 이겨요. 검정이 여러 장이면 그중 가장 큰 숫자가 이겨요.</p>
        <p>가람은 총 <b>2트릭</b>을 획득했어요. 가져간 보라 14와 노랑 14는 각각 +10점이라 <b>보너스 +20점을 적립</b>해요. 이 보너스는 라운드 예측을 맞혀야 실제로 받아요.</p>
      </>}</div>
      <p className="walk-note">검정이 나오지 않으면 처음 나온 무늬의 숫자 카드 중 가장 큰 카드가 이겨요. 다른 무늬는 숫자만 크다고 이기지 않아요.</p>
    </> },
    { title: '세 번째 트릭: 탈출로 승리를 피해요', content: <>
      <Trick played={[cards.escape, cards.pirate, cards.escape]} notes={['2승을 채워 탈출 선택', '해적으로 승리', '0승을 지키며 탈출']} winner={1} />
      <p>가람은 이미 예측한 2승을 채워서 탈출을 내요. 나래가 해적을 내고 다온도 탈출을 내면, <b>해적을 낸 나래가 이겨요.</b></p>
      <p>가람 2승, 나래 1승, 다온 0승으로 끝났어요. 각자 세 장을 다 썼으므로 <b>라운드가 끝나고 점수를 계산</b>해요.</p>
      <p className="walk-note">모두 탈출 계열 카드만 내면 가장 먼저 낸 사람이 이겨요. 탈출이 언제나 지는 건 아니에요. 해적도 스컬킹에게 지는 등 상성이 있으니 ‘서열’ 탭에서 이어서 확인할 수 있어요.</p>
    </> },
    { title: '예측과 실제 획득 수로 점수를 계산해요', content: <>
      <div className="walk-ledger"><table><caption>이번 3라운드에서 얻은 점수</caption><thead><tr><th scope="col">선원</th><th scope="col">예측</th><th scope="col">획득</th><th scope="col">기본</th><th scope="col">보너스</th><th scope="col">합계</th></tr></thead><tbody>
        <tr><th scope="row">가람</th><td>2</td><td>2</td><td>+40</td><td>+20</td><td><b>+60</b></td></tr>
        <tr><th scope="row">나래</th><td>1</td><td>1</td><td>+20</td><td>0</td><td><b>+20</b></td></tr>
        <tr><th scope="row">다온</th><td>0</td><td>0</td><td>+30</td><td>0</td><td><b>+30</b></td></tr>
      </tbody></table></div>
      <p><b>가람:</b> 2승 예측 적중으로 2 × 20 = +40점, 14 카드 두 장의 보너스 +20점을 더해 <b>+60점</b>이에요.</p>
      <p><b>나래:</b> 1승 예측 적중으로 1 × 20 = <b>+20점</b>이에요.</p>
      <p><b>다온:</b> 0승 예측을 지켰으므로 이번에 받은 카드 수 3 × 10 = <b>+30점</b>이에요. 한 번도 이기지 않고도 점수를 얻을 수 있어요.</p>
      <p className="walk-note">위 표는 이번 라운드의 증감이에요. 이전 라운드까지의 점수에 더한 값이 누적 점수예요. 이 게임은 개인전이라 세 사람 모두 예측을 맞히는 라운드도 가능해요.</p>
    </> },
    { title: '마지막 확인: 0승 예측을 놓쳤다면?', content: <>
      <p>다온이 이번 3장 라운드에서 <b>0승을 예측했는데 1트릭을 가져갔다면</b>, 보너스 없이 기본 점수는 몇 점일까요?</p>
      <div className="walk-answers" role="group" aria-label="0승 예측 실패 점수 고르기">{[20, -10, -30].map(score => <button type="button" key={score} aria-pressed={scoreAnswer === score} onClick={() => setScoreAnswer(score)}>{score > 0 ? '+' : '−'}{Math.abs(score)}점</button>)}</div>
      <div className="walk-feedback" role="status">{scoreAnswer === null ? <p>점수를 골라 예측 실패 규칙도 확인해 보세요.</p> : <>
        <p><b>{scoreAnswer === -30 ? '맞아요! −30점이에요.' : '정답은 −30점이에요.'}</b> 0승 예측에 실패하면 딴 트릭 수와 관계없이 <b>−10 × 이번에 받은 카드 수</b>예요. 이번에는 −10 × 3 = −30점이에요.</p>
        <p>1승 이상 예측은 다르게 계산해요. 예를 들어 가람이 2승을 예측하고 3승을 했다면 차이 1 × −10 = <b>−10점</b>이고, 적립했던 14 카드 보너스도 받지 못해요.</p>
      </>}</div>
      <p>이제 다음 라운드로 넘어가 점수를 계속 쌓아요. Classic은 <b>10라운드가 끝나면 누적 점수가 가장 높은 사람이 우승</b>해요.</p>
      <p className="walk-note">처음에는 ‘예측한 횟수 지키기 → 숫자 카드의 무늬 따라내기 → 특수 카드의 상성’ 순서로 익혀 보세요. ‘특수 카드’ 탭의 카드를 누르면 카드별 3인 동작 예시도 볼 수 있어요.</p>
    </> },
  ];
  const waitingForAnswer = step === 4 && winnerAnswer === null;

  return <div className="round-example">
    <header className="hhead"><h2>3인 예시 플레이</h2><p>카드 받기부터 점수 계산까지, 한 라운드를 끝까지 따라가 보세요.</p></header>
    <p className="walk-progress">3인 · Classic 기본 덱 · {step + 1}/{steps.length}단계</p>
    <section className="walk-step" aria-labelledby="round-example-step">
      <h3 id="round-example-step" ref={heading} tabIndex={-1}>{steps[step].title}</h3>
      {steps[step].content}
    </section>
    <nav className="walk-controls" aria-label="3인 예시 플레이 단계 이동">
      <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>예시 이전</button>
      {step < steps.length - 1
        ? <button type="button" className="primary" disabled={waitingForAnswer} onClick={() => setStep(step + 1)}>예시 다음</button>
        : <button type="button" className="primary" onClick={() => { setStep(0); setWinnerAnswer(null); setScoreAnswer(null); }}>처음부터 보기</button>}
    </nav>
  </div>;
}
