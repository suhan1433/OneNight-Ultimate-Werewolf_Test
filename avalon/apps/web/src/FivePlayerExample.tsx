import { useEffect, useRef, useState } from 'react';
import { COUNT_TABLE, ROLE_DEFINITIONS, type RoleType } from '@werewolf/shared';
import { roleArtFor } from './role-art';
import './five-player-example.css';

const people: Array<{ name: string; role: RoleType }> = [
  { name: '가람', role: 'merlin' }, { name: '나래', role: 'loyal' },
  { name: '다온', role: 'loyal' }, { name: '라온', role: 'assassin' },
  { name: '마루', role: 'minion' },
];
const knowledge = [
  '멀린 가람은 라온과 마루가 악이라는 것을 알아요. 선의 원정을 도우면서도, 암살자에게 자신이 멀린임을 들키지 않도록 해야 해요.',
  '신하 나래는 자신의 편이 선이라는 것만 알아요. 다른 네 사람의 정체는 모르므로 대화·투표·원정 기록을 보고 판단해야 해요.',
  '신하 다온도 자신의 편이 선이라는 것만 알아요. 다른 사람에게 멀린인지 아닌지 표시가 붙어 보이지 않아요.',
  '암살자 라온은 마루가 악의 동료라는 것을 알아요. 하지만 가람·나래·다온 중 누가 멀린인지는 몰라요.',
  '수하 마루는 라온이 악의 동료라는 것을 알아요. 선의 원정을 방해하고, 동료가 멀린을 추리할 수 있도록 도와요.',
];

function RoleCards() {
  return <div className="ae-roles">{people.map(person => {
    const role = ROLE_DEFINITIONS[person.role];
    return <figure key={person.name} className={role.team}>
      <img src={roleArtFor(person.role, `example-${person.name}`)} alt={role.name} />
      <figcaption><b>{person.name}</b><span>{role.name}</span><small>{role.team === 'good' ? '선' : '악'}</small></figcaption>
    </figure>;
  })}</div>;
}

function Team({ leader, team }: { leader: number; team: number[] }) {
  return <div className="ae-team"><p><b>리더 · {people[leader]!.name}</b><span>제안한 원정대 · {team.length}명</span></p><div>{team.map(i => <span key={i}>{people[i]!.name}</span>)}</div></div>;
}

function QuestCards({ success, fail }: { success: number; fail: number }) {
  return <div className="ae-quest-cards" aria-label={`익명 원정 카드: 성공 ${success}장, 실패 ${fail}장`}>
    {Array.from({ length: success + fail }, (_, i) => <span key={i} className={i < success ? 'success' : 'fail'}>{i < success ? '성공' : '실패'}</span>)}
  </div>;
}

/** 모든 역할과 제출 내역은 설명용 고정 데이터이며, 실제 방의 비밀 정보를 사용하지 않는다. */
export function FivePlayerExample() {
  const [step, setStep] = useState(0);
  const [perspective, setPerspective] = useState(0);
  const [rejectionAnswer, setRejectionAnswer] = useState<boolean | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'nearest' });
  }, [step]);

  const steps = [
    { title: '5명, 선 3명과 악 2명으로 시작해요', content: <>
      <p>아발론은 정체를 숨기고 상대 진영을 추리하는 <b>팀 게임</b>이에요. 이번 예시는 멀린·암살자를 사용하고, 퍼시벌·모르가나·모드레드·오베론은 사용하지 않아요.</p>
      <RoleCards />
      <p>선은 <b>원정 3회 성공 후 멀린을 지키면</b> 승리해요. 악은 <b>원정 3회 실패, 같은 원정에서 5회 연속 부결, 멀린 암살</b> 중 하나를 이루면 승리해요.</p>
      <p className="ae-note">위 정체는 학습용으로 공개한 예시예요. 실제 게임에서는 자신의 역할과 능력으로 확인한 정보만 볼 수 있고, 역할 카드를 다른 사람에게 보여 주면 안 돼요.</p>
    </> },
    { title: '역할에 따라 아는 정보가 달라요', content: <>
      <p>이름을 눌러 각 플레이어의 시점에서 확인해 보세요.</p>
      <div className="ae-choices" role="group" aria-label="예시 역할 시점 선택">{people.map((person, i) => <button type="button" key={person.name} aria-pressed={perspective === i} onClick={() => setPerspective(i)}>{person.name}</button>)}</div>
      <p className="ae-feedback" role="status">{knowledge[perspective]}</p>
      <p>“나는 선이야”라는 말만으로 정체를 확인할 수는 없어요. <b>악도 선인 척 말할 수 있으므로</b>, 제안한 원정대와 투표 이유, 원정 결과를 함께 살펴봐요.</p>
      <p className="ae-note">멀린은 악을 알지만, 너무 노골적으로 정답만 말하면 암살자에게 들킬 수 있어요. 신하들은 추리에 참여하면서 멀린이 드러나지 않도록 도와요.</p>
    </> },
    { title: '1차 원정: 리더가 2명을 지명해요', content: <>
      <div className="ae-sizes" aria-label="5인 원정 인원표">{COUNT_TABLE[5]!.quests.map((size, i) => <div key={i}><span>{i + 1}차</span><b>{size}명</b></div>)}</div>
      <p>5인의 원정 인원은 차례로 <b>2 → 3 → 2 → 3 → 3명</b>이에요. 이번 예시는 가람이 첫 리더이고, 리더 순서는 가람 → 나래 → 다온 → 라온 → 마루예요.</p>
      <Team leader={0} team={[0, 1]} />
      <p>가람이 자신과 나래를 1차 원정대로 제안했어요. 리더는 <b>자신을 포함해도 되고, 빼도 돼요.</b> 아직 출발한 건 아니고, 다음 단계에서 모두의 승인을 받아야 해요.</p>
    </> },
    { title: '원정대에 들지 않은 사람도 투표해요', content: <>
      <div className="ae-votes" aria-label="1차 원정대 투표 결과">{people.map((person, i) => <div key={person.name}><b>{person.name}</b><span className={i < 3 ? 'approve' : 'reject'}>{i < 3 ? '찬성' : '반대'}</span></div>)}</div>
      <p><b>5명 전원이</b> 찬성·반대를 하나씩 고르고, 모두 선택하면 공개해요. 원정대원인 가람·나래뿐 아니라 다온·라온·마루도 투표해요.</p>
      <p>찬성 3표, 반대 2표이므로 <b>과반수 찬성으로 승인</b>됐어요. 이제 가람과 나래가 출발해요. 5인에서는 찬성이 최소 3표 필요해요.</p>
      <p className="ae-note">찬성·반대는 ‘이 원정대를 보낼지’에 대한 의견이에요. 찬성했다고 선, 반대했다고 악으로 확정되지는 않아요. 이 예시는 투표자 공개 옵션을 켠 경우예요.</p>
    </> },
    { title: '원정 카드는 원정대원만 비밀리에 내요', content: <>
      <Team leader={0} team={[0, 1]} /><QuestCards success={2} fail={0} />
      <p>가람과 나래만 카드를 한 장씩 제출해요. 두 사람은 선이므로 <b>반드시 성공</b>을 내요. 원정대가 아닌 세 사람은 원정 카드를 내지 않아요.</p>
      <p>섞어서 공개한 결과는 성공 2장, 실패 0장! <b>1차 원정 성공</b>이고, 기록은 성공 1회·실패 0회가 돼요. 다음 리더는 나래예요.</p>
      <p className="ae-note">누가 어떤 카드를 냈는지는 공개되지 않아요. 악도 성공을 선택할 수 있으므로, 성공한 원정대라고 전원이 선이라고 단정할 수는 없어요.</p>
    </> },
    { title: '2차 원정: 실패 카드 1장이 나오면?', content: <>
      <Team leader={1} team={[1, 2, 3]} /><QuestCards success={2} fail={1} />
      <p>나래가 나래·다온·라온 3명을 제안했고 찬성 4표, 반대 1표로 승인됐어요. 나래와 다온은 성공을, 악인 라온은 실패를 선택했어요. 이 제출 내역은 설명을 위해 알려 주는 정보예요.</p>
      <p>실제 공개 결과는 <b>성공 2장·실패 1장</b>뿐이에요. 성공 카드가 더 많아도 <b>5인에서는 실패 1장만 나오면 원정 실패</b>예요. 기록은 성공 1회·실패 1회가 돼요.</p>
      <p className="ae-note">정체를 모르는 신하의 입장에서는 원정대 세 명 중 악이 적어도 한 명 있다는 단서예요. 카드의 공개 순서로 누가 실패를 냈는지 알아낼 수는 없어요.</p>
    </> },
    { title: '3차 원정의 제안이 부결되면 어떻게 될까요?', content: <>
      <Team leader={2} team={[0, 2]} />
      <p>다음 리더 다온이 가람·다온을 제안했지만, 찬성 2표·반대 3표로 부결됐어요. <b>이것도 원정 실패 횟수에 더할까요?</b></p>
      <div className="ae-answers" role="group" aria-label="부결과 원정 실패 구분하기"><button type="button" aria-pressed={rejectionAnswer === false} onClick={() => setRejectionAnswer(false)}>아니요, 같은 원정에서 다시 제안해요</button><button type="button" aria-pressed={rejectionAnswer === true} onClick={() => setRejectionAnswer(true)}>네, 원정 실패가 1회 늘어요</button></div>
      <div className="ae-feedback" role="status">{rejectionAnswer === null ? <p>선택해서 부결과 원정 실패의 차이를 확인해 보세요.</p> : <>
        <p><b>{rejectionAnswer === false ? '맞아요. 아직 원정에 나가지 않았어요.' : '아직 원정에 나가지 않아서 실패 횟수는 그대로예요.'}</b> 기록은 성공 1회·실패 1회이고, <b>다음 리더 라온이 같은 3차 원정의 2명</b>을 다시 제안해요.</p>
        <p>대신 연속 부결이 1회 쌓였어요. 같은 원정에서 <b>5회 연속 부결되면 즉시 악이 승리</b>하므로, 반대에도 이유와 논의가 필요해요.</p>
      </>}</div>
    </> },
    { title: '악이 원정에 있어도 성공할 수 있어요', content: <>
      <Team leader={3} team={[0, 3]} /><QuestCards success={2} fail={0} />
      <p>라온이 가람·라온을 제안해 찬성 3표·반대 2표로 승인됐어요. 이번에는 <b>악인 라온도 정체를 숨기려고 성공</b>을 냈어요. 3차 원정이 성공해 기록은 성공 2회·실패 1회예요.</p>
      <p>다음 리더 마루는 가람·나래·다온 3명을 제안해요. 리더 자신은 원정에 안 들어가도 돼요. 찬성 3표로 승인되고 세 사람이 모두 성공을 내서 <b>4차 원정도 성공</b>해요.</p>
      <div className="ae-results" aria-label="원정 기록"><span className="success">1차 성공</span><span className="fail">2차 실패</span><span className="success">3차 성공</span><span className="success">4차 성공</span><span>5차 미진행</span></div>
      <p className="ae-note">선이 원정 3회에 성공했어요. 5차 원정은 진행하지 않고 암살 단계로 넘어가요. 아직 선의 최종 승리가 확정된 건 아니에요.</p>
    </> },
    { title: '마지막 암살: 멀린은 끝까지 숨어야 해요', content: <>
      <p>암살자 라온에게 마지막 기회가 생겼어요. 라온은 악의 동료 마루를 알고 있으니, 가람·나래·다온 중에서 멀린을 추리해요.</p>
      <p><b>라온이 누구를 지목하면 어떻게 될까요?</b> 이름을 눌러 결과를 바꿔 보세요.</p>
      <div className="ae-choices" role="group" aria-label="예시 암살 대상 선택">{people.slice(0, 3).map((person, i) => <button type="button" key={person.name} aria-pressed={target === i} onClick={() => setTarget(i)}>{person.name}</button>)}</div>
      <div className="ae-feedback" role="status">{target === null ? <p>학습용으로 한 명을 지목해 보세요.</p> : <p><b>{target === 0 ? '가람은 멀린이에요. 암살 성공으로 악이 승리해요!' : `${people[target]!.name}는 신하예요. 멀린을 찾지 못해 선이 승리해요!`}</b> 실제 게임에서는 암살 대상을 확정하면 되돌릴 수 없어요.</p>}</div>
      <p className="ae-note">여기서는 두 결말을 비교하려고 정체를 공개했어요. 실제 라온은 누가 멀린인지 몰라요. 선은 원정 성공을 도우면서도 멀린을 지켜야 해요.</p>
    </> },
    { title: '선택한 결말과 꼭 기억할 규칙', content: <>
      <p className={`ae-ending ${target === 0 ? 'evil' : 'good'}`}><b>{target === 0 ? '악의 승리 · 멀린 암살 성공' : '선의 승리 · 원정 3회 성공, 멀린 생존'}</b><span>라온의 지목: {target !== null ? people[target]!.name : '미선택'}</span></p>
      <RoleCards />
      <ul className="ae-recap"><li><b>원정대 투표는 전원</b>, 원정 카드 제출은 <b>선발된 원정대원만</b> 해요.</li><li>선은 성공만, 악은 성공·실패 중 하나를 내요. <b>5인에서는 실패 1장으로 원정 실패</b>예요.</li><li>부결은 출발 취소예요. 같은 원정을 다음 리더가 다시 제안해요. <b>5회 연속 부결은 악의 승리</b>예요.</li><li>성공한 원정대라고 모두 선인 것은 아니에요. 대화·투표·원정 기록을 함께 살펴봐요.</li><li><b>선의 원정 3회 성공 뒤에는 암살</b>이 남아요. 멀린을 지켜야 최종 승리해요.</li></ul>
      <p className="ae-note">실제 게임에서는 게임이 끝났을 때 모두의 역할을 공개해요. 다른 특수 역할을 사용하는 경우는 아래 역할 도감에서 능력을 확인해 보세요.</p>
    </> },
  ];
  const waitingForAnswer = (step === 6 && rejectionAnswer === null) || (step === 8 && target === null);

  return <section id="avalon-five-player-example" className="avalon-example">
    <h3>5인 예시 플레이 · 처음부터 끝까지</h3>
    <p className="ae-intro">정체 확인부터 원정과 암살까지, 한 게임을 따라가 보세요.</p>
    <p className="ae-progress">5인 기본 역할 · {step + 1}/{steps.length}단계</p>
    <article className="ae-step" aria-labelledby="avalon-example-step">
      <h4 id="avalon-example-step" ref={heading} tabIndex={-1}>{steps[step]!.title}</h4>
      {steps[step]!.content}
    </article>
    <nav className="ae-controls" aria-label="5인 예시 플레이 단계 이동">
      <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>예시 이전</button>
      {step < steps.length - 1
        ? <button type="button" className="primary" disabled={waitingForAnswer} onClick={() => setStep(step + 1)}>예시 다음</button>
        : <button type="button" className="primary" onClick={() => { setStep(0); setPerspective(0); setRejectionAnswer(null); setTarget(null); }}>처음부터 보기</button>}
    </nav>
  </section>;
}
