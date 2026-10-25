import { useState } from 'react';
import { CoachResult, GuidedLesson, HiddenCard, MoreRules } from './lesson/GuidedLesson';
import './round-example.css';

type ExampleCard = { art: string; name: string };
const c = {
  green9: { art: 'parrot-9', name: '초록 9' }, green4: { art: 'parrot-4', name: '초록 4' }, green2: { art: 'parrot-2', name: '초록 2' },
  black2: { art: 'jolly-2', name: '검정 2' }, purple14: { art: 'map-14', name: '보라 14' }, yellow14: { art: 'treasure-14', name: '노랑 14' },
  pirate: { art: 'pirate-rosie', name: '해적 Rosie' }, escape: { art: 'escape', name: '탈출' },
} satisfies Record<string, ExampleCard>;
const hands = [[c.green9, c.black2, c.escape], [c.green4, c.purple14, c.pirate], [c.green2, c.yellow14, c.escape]];
const tricks = [[c.green9, c.green4, c.green2], [c.black2, c.purple14, c.yellow14], [c.escape, c.pirate, c.escape]];
const names = ['가람 · 나', '나래', '다온'];
const winners = [0, 0, 1];
const stages = ['내 목표', '예측하기', '첫 트릭', '검정 카드', '승리 피하기', '점수 확인', '준비 완료'];
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
function Picture({ card }: { card: ExampleCard }) {
  return <img className="sk-lesson-card" src={`${import.meta.env.BASE_URL}card-art/${card.art}.jpg`} alt={card.name} draggable={false} />;
}

/** 플레이어 가람의 시점. 공개되는 순서대로만 카드를 보여 준다. */
export function RoundExample() {
  const [step, setStep] = useState(0);
  const [bid, setBid] = useState(2);
  const [reveals, setReveals] = useState([0, 0, 0]);
  const trickIndex = step >= 2 && step <= 4 ? step - 2 : -1;
  const count = trickIndex >= 0 ? reveals[trickIndex]! : 0;
  const reveal = (value: number) => setReveals(previous => previous.map((n, i) => i === trickIndex ? value : n));
  const next = () => { if (trickIndex >= 0 && count < 4) { reveal(4); return; } setStep(n => n + 1); };
  const restart = () => { setStep(0); setBid(2); setReveals([0, 0, 0]); };
  const base = bid === 0 ? -30 : bid === 2 ? 40 : -10 * Math.abs(bid - 2);
  const bonus = bid === 2 ? 20 : 0;
  const wins = step >= 5 ? 2 : step === 4 ? 2 : step === 3 ? 1 + Number(count === 4) : step === 2 ? Number(count === 4) : 0;
  const headings = ['많이 이기기보다, 예측을 맞혀요', '이번에는 몇 번 이길까요?', '한 장씩 모이면 트릭 하나예요', '검정은 다른 무늬의 숫자보다 강해요', bid === 2 ? '목표 2승을 채웠으니 승리를 피해요' : '마지막 카드인 탈출을 내봐요', '예측과 실제 승리를 나란히 비교해요', '내 차례에는 이렇게 생각해요'];
  const coaches = [
    '당신은 가람이에요. 기본 덱의 3라운드라 세 장을 받았어요. 이번 라운드에 몇 번 이길지 먼저 정해요.',
    '초록 9와 검정 2로 이기고 탈출로 한 번 피하는, 2승 계획으로 시작해볼게요. 다른 예측도 선택할 수 있어요.',
    '이번 첫 리더는 나예요. 초록 9를 내고, 다른 사람이 어떤 카드를 내는지 한 장씩 확인해요.',
    '첫 트릭을 이긴 내가 다시 시작해요. 이번에는 검정 2를 내요. 처음 나온 무늬가 검정으로 바뀌었어요.',
    '이 예시의 마지막 카드는 탈출이에요. 탈출을 낸 뒤 실제 2승과 내 예측을 비교해볼게요.',
    '실제로 딴 횟수는 2예요. 예측을 바꿔보면, 같은 두 번의 승리도 점수가 달라져요.',
    '내 예측과 지금까지 이긴 횟수를 확인하고, 이번에 이길지 피할지 생각해요.',
  ];
  const reasons = [
    '셋 다 초록이므로 가장 큰 초록 9를 낸 내가 이겨요. 카드 세 장을 가져가지만 이긴 횟수는 1만 늘어요.',
    '검정 2가 보라 14·노랑 14를 이겨요. 검정은 다른 무늬의 숫자 카드를 이기는 트럼프예요.',
    '해적을 낸 나래가 이겨요. 두 탈출보다 해적이 강해서, 나는 2승에서 더 늘지 않아요.',
  ];
  const bidChoices = <div className="gl-choices" role="group" aria-label="내 예측 바꾸기">{[0, 1, 2, 3].map(n => <button type="button" key={n} aria-pressed={bid === n} onClick={() => setBid(n)}>{n}승</button>)}</div>;

  return <div className="round-example"><GuidedLesson theme="pirate" title="스컬킹 3인 예시" goal="예측한 만큼만 이기고 점수 얻기" perspective="나 = 가람 · 개인전 · 기본 덱" step={step} labels={stages} heading={headings[step]!} coach={coaches[step]!}
    status={<><span>내 예측 {bid}승</span><span>내가 딴 횟수 {wins}승</span></>}
    onPrevious={() => setStep(n => n - 1)} onNext={next} onRestart={restart} nextLabel={trickIndex >= 0 && count < 4 ? '결과 바로 보기' : '다음 장면'}>
    {step === 0 && <>
      <p className="gl-own-label">내 손패 · 이번 라운드의 세 장 전부</p>
      <div className="gl-hand">{hands[0]!.map(card => <figure key={card.art}><Picture card={card} /><figcaption>{card.name}</figcaption></figure>)}</div>
      <div className="gl-arrow"><span>내 계획 2승 ↔ 실제 2승</span><small>정확히 같으면 기본 점수와 적중 보너스를 받아요.</small></div>
      <MoreRules title="라운드와 트릭이 뭔가요?"><p>각자 한 장씩 내는 한 묶음이 트릭이에요. 이번에는 한 사람당 세 장이라 총 3트릭을 하고 라운드가 끝나요. Classic은 1장부터 시작해 10라운드까지 늘어나요. 누적 점수가 가장 높으면 우승이에요.</p></MoreRules>
    </>}
    {step === 1 && <>
      {bidChoices}<p className="gl-caption">카드를 내는 흐름은 같은 예시예요. 바꾼 예측에 따라 마지막 점수가 어떻게 달라지는지 비교해요.</p><CoachResult><p>{bid === 0 ? '0승은 한 번도 이기지 않겠다는 예측이에요. 이번 세 장 라운드에서 지키면 +30점, 한 번이라도 이기면 −30점이에요.' : `${bid}번 이기겠다고 예측했어요. 실제로 정확히 ${bid}번 이겨야 적중이에요.`}</p></CoachResult>
      <p>숫자를 고른 뒤 봉인해요. <b>다른 사람의 예측은 모두 제출한 뒤 동시에 공개</b>돼요.</p>
      <MoreRules title="예측에는 정답이 있나요?"><p>다른 사람의 손패를 모르므로 확실한 정답은 없어요. 이 예시는 정해진 카드 흐름으로 2승을 하며, 내가 고른 예측에 따라 마지막 점수를 비교해요. 세 사람의 예측 합을 3에 맞출 필요는 없어요.</p></MoreRules>
    </>}
    {trickIndex >= 0 && <>
      <div className="gl-trick" aria-label={`${trickIndex + 1}번째 트릭 공개`}>{tricks[trickIndex]!.map((card, i) => <figure key={i} className={`gl-seat${count === 4 && winners[trickIndex] === i ? ' winner' : ''}`}>
        <b>{i + 1}. {names[i]}</b>{count > i ? <Picture card={card} /> : <HiddenCard label={i === 0 ? '내가 아직 내지 않은 카드' : '다른 사람의 카드는 제출 전 비공개'} />}
        <figcaption>{count > i ? card.name : i === 0 ? '내 차례' : '아직 내지 않음'}</figcaption>{count === 4 && winners[trickIndex] === i && <strong>1트릭 획득</strong>}
      </figure>)}</div>
      {count < 4 && <button type="button" className="gl-action" onClick={() => reveal(count + 1)}>{count === 0 ? `${tricks[trickIndex]![0]!.name} 내보기` : count === 1 ? '나래가 낸 카드 보기' : count === 2 ? '다온이 낸 카드 보기' : '승자 확인하기'}</button>}
      <CoachResult>{count === 4 ? <p><b>{reasons[trickIndex]}</b></p> : <p>{trickIndex === 0 ? '초록을 가진 사람은 숫자 카드를 낼 때 초록을 따라야 해요.' : trickIndex === 1 ? '나래와 다온에게는 검정이 없어서 다른 무늬의 숫자를 낼 수 있어요.' : '탈출은 이 트릭에서 승리를 피하기 위한 선택이에요.'} 카드가 모두 나온 다음 승자를 정해요.</p>}</CoachResult>
      {count === 4 && <div className="gl-arrow"><span>카드 3장 → {winners[trickIndex] === 0 ? '가람 · 나' : '나래'}</span><small>{trickIndex < 2 ? '이긴 사람이 다음 트릭도 시작해요.' : '모두 손패를 썼으니 라운드 점수를 계산해요.'}</small></div>}
      <MoreRules title={trickIndex === 0 ? '초록이 있어도 특수 카드를 낼 수 있나요?' : trickIndex === 1 ? '검정끼리 또는 다른 무늬끼리 붙으면?' : '탈출은 언제나 지나요?'}>
        <p>{trickIndex === 0 ? '네. 스컬킹의 해적·탈출 같은 특수 카드는 무늬와 관계없이 낼 수 있어요. 숫자 카드를 내기로 했다면 손패에 있는 리드 무늬를 따라야 해요.' : trickIndex === 1 ? '검정끼리는 큰 숫자가 이겨요. 검정과 특수 카드가 없다면 처음 나온 무늬 중 가장 큰 숫자가 이겨요. 다른 무늬의 14라고 무조건 이기지는 않아요.' : '모두 탈출 계열 카드만 내면 먼저 낸 사람이 이겨요. 해적도 스컬킹·인어와 상성이 있어요. 도움말의 서열과 카드별 동작 예시에서 더 볼 수 있어요.'}</p>
      </MoreRules>
    </>}
    {step === 5 && <>
      <div className="gl-arrow"><span>예측 {bid}승 {bid === 2 ? '=' : '≠'} 실제 2승</span><strong>{bid === 2 ? '적중!' : '예측과 달라요'} · 이번 라운드 {signed(base + bonus)}점</strong></div>
      {bidChoices}
      <div className="sk-score-equation"><span>기본 <b>{signed(base)}</b></span><span>＋</span><span>보너스 <b>{signed(bonus)}</b></span><span>＝</span><strong>{signed(base + bonus)}</strong></div>
      <CoachResult><p>{bid === 2 ? '2승 예측을 정확히 맞혀 기본 +40점이에요. 내가 가져간 보라 14·노랑 14가 각각 +10점이라 보너스 +20점도 받아 총 +60점이에요.' : bid === 0 ? '0승 예측은 한 번이라도 이기면 실패예요. 받은 카드 수 3 × −10 = −30점이고 보너스는 못 받아요.' : `예측 ${bid}승과 실제 2승의 차이가 1이라 −10점이에요. 예측을 틀리면 적립한 14 카드 보너스도 못 받아요.`}</p></CoachResult>
      <MoreRules title="다른 두 사람은 몇 점인가요?"><p>나래는 1승을 예측해 1승했으니 +20점이에요. 다온은 0승을 예측해 한 번도 이기지 않았으니 +30점이에요. 점수는 지난 라운드의 누적 점수에 더해요.</p></MoreRules>
    </>}
    {step === 6 && <>
      <div className="gl-arrow"><span>① 손패를 보고 이길 횟수 예측</span><span>② 내 예측과 현재 승리 횟수 확인</span><span>③ 무늬를 따라내거나 특수 카드 선택</span></div>
      <p>예측을 채웠다면 무조건 더 이기려 할 필요가 없어요. 같은 카드 흐름에서도 <b>예측을 정확히 맞혔을 때</b> 점수를 잘 얻어요.</p>
      <MoreRules title="지금 몰라도 되는 확장 규칙"><p>이번 예시는 기본 덱이고 해적 능력은 껐어요. 크라켄·고래·확장 카드가 있으면 별도 효과를 적용하므로, 방의 옵션과 카드별 예시를 확인하세요.</p></MoreRules>
    </>}
  </GuidedLesson></div>;
}
