import { useState } from 'react';
import type { Card } from './types';
import { CardFace, MarkerRail } from './ui';
import { cardName } from './lib';
import { CoachResult, GuidedLesson, HiddenCard, MoreRules } from './lesson/GuidedLesson';

const card = (id: string): Card => ({ id, suit: id[0] as Card['suit'], value: Number(id.slice(1)) });
const stages = ['우리의 목표', '과제 담당', '내 카드 내기', '함께 성공', '로켓 비교', '통신 연습', '준비 완료'];
const names = ['가람', '나래 · 나', '다온'];
function Trick({ ids, winner }: { ids: Array<string | null>; winner?: number }) {
  return <div className="gl-trick" aria-label="공개된 트릭 카드">{ids.map((id, i) => <figure key={i} className={`gl-seat${winner === i ? ' winner' : ''}`}>
    <b>{names[i]}</b>{id ? <CardFace card={card(id)} size="sm" /> : <HiddenCard />}
    <figcaption>{id ? cardName(card(id)) : '아직 내지 않음'}</figcaption>{winner === i && <strong>세 장 모두 획득</strong>}
  </figure>)}</div>;
}

/** 나래 한 사람의 시점. 미션 1의 한 트릭과 별도 로켓·통신 연습을 구분한다. */
export function HelpExample() {
  const [step, setStep] = useState(0);
  const [attempt, setAttempt] = useState<string | null>(null);
  const [played, setPlayed] = useState(false);
  const [rocketChoice, setRocketChoice] = useState<string | null>(null);
  const [commChoice, setCommChoice] = useState<string | null>(null);
  const next = () => { if (step === 2) setPlayed(true); setStep(n => n + 1); };
  const restart = () => { setStep(0); setAttempt(null); setPlayed(false); setRocketChoice(null); setCommChoice(null); };
  const core = step < 4;
  const headings = ['이번에는 동료가 이기게 도와봐요', '과제 카드는 목표 표시예요', '파랑이 시작됐어요. 내 카드 하나를 눌러보세요', '파랑 3이 가람에게 갔어요!', '파랑이 없으면? 두 선택을 비교해요', '말 대신 카드 한 장으로 알려줘요', '이 세 가지만 기억하고 출발해요'];
  const coaches = [
    '당신은 나래예요. 미션 1의 목표는 가람이 파랑 3을 가져가는 거예요. 세 사람 모두 한 팀입니다.',
    '로켓 4를 받은 가람이 커맨더라 먼저 과제를 골랐어요. 파랑 3 과제를 가람이 맡았어요.',
    '가람이 파랑 8을 냈어요. 손패에 파랑이 있으면 반드시 파랑을 내야 해요. 낼 수 없는 카드도 눌러 이유를 볼 수 있어요.',
    '한 사람씩 한 장, 총 세 장을 내는 한 묶음이 ‘트릭’이에요. 이긴 사람이 세 장을 모두 가져가요.',
    '여기부터는 본 미션과 별개의 연습이에요. 이번 내 손패에는 파랑이 없어요. 초록과 로켓을 번갈아 눌러보세요.',
    '다른 예시의 손패예요. 초록은 2·9, 파랑은 3 한 장뿐이에요. 공개할 카드를 눌러 마커의 뜻을 확인해요.',
    '카드의 숫자보다 먼저 ‘처음 나온 색’을 보세요. 그리고 과제 카드를 누가 가져가야 하는지 확인하세요.',
  ];
  const marker = commChoice === 'G9' ? 'top' : commChoice === 'G2' ? 'bottom' : 'mid';

  return <div className="help-example"><GuidedLesson theme="space" title="더 크루 3인 예시" goal={core ? '가람이 파랑 3을 가져오면 모두 성공' : step === 4 ? '낼 수 있는 카드와 승자를 따로 확인하기' : step === 5 ? '허용된 통신으로만 손패 알려주기' : '동료와 함께 과제 완료하기'} perspective="나 = 나래 · 3인 협력" step={step} labels={stages} heading={headings[step]!} coach={coaches[step]!}
    status={core ? <span>미션 1 · 과제 {step === 3 ? '1/1 완료 ✓' : '0/1'}</span> : <span>{step === 4 || step === 5 ? '별도 상황 연습' : '기본 설명 완료'}</span>}
    onPrevious={() => setStep(n => n - 1)} onNext={next} onRestart={restart}>
    {step === 0 && <>
      <div className="gl-arrow"><CardFace card={card('B3')} size="sm" /><span>이 카드 → 가람이 가져가면 성공</span><small>내가 많이 이기는 게임이 아니에요.</small></div>
      <p>가람 · 나래(나) · 다온 순서로 카드를 내요. 다른 사람의 손패는 보이지 않아요.</p>
      <MoreRules title="카드는 몇 장씩 받나요?"><p>40장을 모두 나눠요. 3인은 14·13·13장을 받고, 끝까지 진행하면 13트릭 뒤 남은 한 장은 쓰지 않아요. 여기서는 필요한 카드만 보여줘요.</p></MoreRules>
    </>}
    {step === 1 && <>
      <div className="gl-arrow"><span>작은 과제 카드 · 파랑 3</span><CardFace card={card('B3')} size="sm" /><span>담당자 = 가람</span></div>
      <p>실제 파랑 3은 내 손패에 있어요. <b>내가 그 카드를 낸 뒤, 가람이 이겨서 세 장을 모두 가져가면</b> 과제가 완료돼요.</p>
      <MoreRules title="과제 카드와 손패 카드가 다른 건가요?"><p>과제 카드는 ‘누가 어떤 카드를 따야 하는지’ 표시하는 목표예요. 게임에서 내는 카드는 손패의 큰 카드예요. 과제가 여러 장이면 커맨더부터 차례로 골라요.</p></MoreRules>
    </>}
    {step === 2 && <>
      <p className="gl-caption">세 사람이 한 장씩 내는 한 묶음을 ‘트릭’이라고 해요.</p>
      <Trick ids={['B8', played ? 'B3' : null, null]} />
      {!played && <><p className="gl-own-label">내 손패 일부 · 선택해보세요</p><div className="gl-hand">{['B3', 'G9', 'R1'].map(id => <figure key={id}><CardFace card={card(id)} size="sm" playable={id === 'B3'} onClick={() => { setAttempt(id); if (id === 'B3') setPlayed(true); }} selected={attempt === id} /><figcaption>{id === 'B3' ? '낼 수 있어요' : '지금 못 내는 이유 보기'}</figcaption></figure>)}</div></>}
      <CoachResult>{played ? <p><b>파랑 3을 냈어요.</b> 이제 다온이 낼 차례예요. 다음 장면에서 결과를 확인해요.</p> : attempt ? <p><b>파랑 3이 손패에 남아 있어요.</b> 그래서 {attempt === 'R1' ? '로켓도' : '초록 9도'} 지금은 낼 수 없어요. 파랑 3을 눌러보세요.</p> : <p>먼저 나온 색 = 파랑 → 내 손패에 파랑 있음 → 파랑을 내요.</p>}</CoachResult>
      {!played && <button type="button" className="gl-action" onClick={() => { setAttempt('B3'); setPlayed(true); }}>룰마스터와 파랑 3 내보기</button>}
    </>}
    {step === 3 && <>
      <Trick ids={['B8', 'B3', 'Y9']} winner={0} />
      <div className="gl-arrow"><span>파랑 8 · 파랑 3 · 노랑 9 → 가람</span><strong>과제 파랑 3 ✓ → 모두 성공!</strong></div>
      <p>다온은 파랑이 없어 노랑 9를 냈어요. <b>처음 나온 파랑 중 가장 큰 8</b>이 이겨요. 노랑 9는 숫자가 커도 이 트릭을 이기지 못해요.</p>
      <MoreRules title="손패가 남았는데 끝나도 되나요?"><p>이 미션은 과제 한 장을 완료했으니 즉시 성공이에요. 계속할 과제가 있으면 방금 이긴 가람이 다음 트릭을 시작해요. 특수 미션은 추가 목표도 지켜야 해요.</p></MoreRules>
    </>}
    {step === 4 && <>
      <Trick ids={['B8', rocketChoice, 'B5']} winner={rocketChoice ? rocketChoice === 'R1' ? 1 : 0 : undefined} />
      <p className="gl-own-label">이번 내 손패에는 파랑이 없어요</p>
      <div className="gl-hand">{['G9', 'R1'].map(id => <figure key={id}><CardFace card={card(id)} size="sm" onClick={() => setRocketChoice(id)} selected={rocketChoice === id} /><figcaption>낼 수 있어요 · 결과 비교</figcaption></figure>)}</div>
      <CoachResult>{rocketChoice === 'R1' ? <p><b>나래가 이겨요.</b> 낼 수 있는 이유는 손패에 파랑이 없어서예요. 이기는 이유는 <b>로켓 1도 모든 색 카드보다 강해서</b>예요.</p> : rocketChoice ? <p><b>가람이 이겨요.</b> 파랑이 없어 초록 9를 낼 수는 있지만, 이 트릭의 색은 파랑이라 초록은 이기지 못해요.</p> : <p>두 카드 모두 낼 수 있어요. ‘낼 수 있다’가 ‘이긴다’는 뜻은 아니에요.</p>}</CoachResult>
      <MoreRules title="로켓이 여러 장이거나 로켓으로 시작하면?"><p>로켓끼리는 가장 큰 숫자가 이겨요. 로켓으로 시작한 트릭에서는 로켓이 있는 사람은 반드시 로켓을 내야 해요.</p></MoreRules>
    </>}
    {step === 5 && <>
      <p className="gl-caption">별도 예시 · 트릭의 첫 카드가 나오기 전</p>
      <div className="gl-hand">{['G9', 'G2', 'B3', 'R1'].map(id => <figure key={id}><CardFace card={card(id)} size="sm" onClick={() => setCommChoice(id)} selected={commChoice === id} /><figcaption>{cardName(card(id))}</figcaption></figure>)}</div>
      {commChoice && commChoice !== 'R1' && <div className="example-communication"><span className="with-rail"><CardFace card={card(commChoice)} size="sm" /><MarkerRail spot={marker} still /></span></div>}
      <CoachResult><p>{commChoice === 'R1' ? '로켓은 통신할 수 없어요. 색 카드를 골라보세요.' : commChoice === 'G9' ? '맨 위 마커: 내 초록 카드 중 가장 높아요.' : commChoice === 'G2' ? '맨 아래 마커: 내 초록 카드 중 가장 낮아요.' : commChoice === 'B3' ? '가운데 마커: 파랑은 이 한 장뿐이에요.' : '카드 한 장을 공개하고 마커로 최고·최저·유일 중 하나를 알려줘요.'}</p></CoachResult>
      <p>통신한 카드도 내 손패예요. 나중에 정상적으로 낼 수 있어요.</p>
      <MoreRules title="언제, 몇 번 통신하나요?"><p>과제 배정 뒤, 트릭이 시작되기 전에 한 사람당 미션에서 한 번이에요. 자신의 차례가 아니어도 돼요. 손패를 말로 알려주면 안 돼요. 데드 존 등 특수 미션은 통신 제한이 달라요.</p></MoreRules>
    </>}
    {step === 6 && <>
      <div className="gl-arrow"><span>① 처음 나온 색 확인</span><span>② 그 색이 있으면 반드시 따라내기</span><span>③ 과제 담당자가 그 카드를 따도록 돕기</span></div>
      <p>나는 나래예요. 내가 내는 파랑 3을 가람이 가져가야 했어요. 그래서 <b>동료의 승리가 우리 모두의 성공</b>이 됐어요.</p>
      <MoreRules title="다음 미션에서는 무엇이 달라지나요?"><p>과제 수·담당자·완료 순서와 특수 목표가 달라져요. 시작할 때 현재 미션 설명을 확인하세요. 기본 카드 내기와 트릭 판정은 같아요.</p></MoreRules>
    </>}
  </GuidedLesson></div>;
}
