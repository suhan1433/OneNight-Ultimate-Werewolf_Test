import { useState, type CSSProperties } from 'react';
import { ROLE_DEFINITIONS, type RoleType } from '@werewolf/shared';
import { roleArtFor } from './role-art';
import { CoachResult, GuidedLesson, MoreRules } from './lesson/GuidedLesson';
import './five-player-example.css';

const people: Array<{ name: string; role: RoleType; x: number; y: number }> = [
  { name: '가람', role: 'merlin', x: 50, y: 13 }, { name: '나래', role: 'loyal', x: 83, y: 38 },
  { name: '다온', role: 'loyal', x: 71, y: 81 }, { name: '라온', role: 'assassin', x: 29, y: 81 },
  { name: '마루', role: 'minion', x: 17, y: 38 },
];
const stages = ['내 역할', '원정대', '전원 투표', '카드 제출', '실패 단서', '부결 이해', '원정 기록', '암살', '정체 공개'];
function Table({ team = [], leader, pick, suspect, reveal = false, assassin = false }: { team?: number[]; leader?: number; pick?: (i: number) => void; suspect?: number | null; reveal?: boolean; assassin?: boolean }) {
  return <div className="ae-practice-table" aria-label="5인 원탁: 나는 나래">{people.map((person, i) => {
    const known = reveal || i === 1 || (assassin && i === 3);
    const label = `${person.name}${i === 1 ? ' · 나' : ''}`;
    const inside = <><span className="ae-practice-face">{known ? <img src={roleArtFor(person.role, `lesson-${i}`)} alt="" /> : <span aria-hidden="true">?</span>}</span><b>{label}</b><small>{leader === i ? '리더 · ' : ''}{known ? ROLE_DEFINITIONS[person.role].name : '정체 모름'}</small>{team.includes(i) && <em>원정대</em>}</>;
    const className = `ae-practice-seat${i === 1 ? ' self' : ''}${team.includes(i) ? ' chosen' : ''}${suspect === i ? ' suspect' : ''}`;
    const style = { '--seat-x': `${person.x}%`, '--seat-y': `${person.y}%` } as CSSProperties;
    return pick ? <button type="button" key={i} className={className} style={style} onClick={() => pick(i)} aria-pressed={suspect === i} aria-label={`${label}, ${known ? ROLE_DEFINITIONS[person.role].name : '정체 모름'}${team.includes(i) ? ', 이번 원정대' : ''}`}>{inside}</button> : <div key={i} className={className} style={style}>{inside}</div>;
  })}<div className="ae-practice-center">{reveal ? '게임 종료' : '선 3 · 악 2'}<small>{reveal ? '모든 역할 공개' : '내 역할만 확실해요'}</small></div></div>;
}
function QuestCards({ success, fail, hidden = false }: { success: number; fail: number; hidden?: boolean }) {
  return <div><p className="gl-caption">{hidden ? '원정대원만 제출 · 아직 비공개' : '카드를 섞어서 공개 · 이름은 붙지 않아요'}</p><div className="ae-quest-cards" aria-label={hidden ? '봉인된 원정 카드' : `성공 ${success}장, 실패 ${fail}장`}>{Array.from({ length: success + fail }, (_, i) => <span key={i} className={hidden ? 'hidden' : i === 1 && fail ? 'fail' : 'success'}>{hidden ? '?' : i === 1 && fail ? '실패' : '성공'}</span>)}</div></div>;
}
function MissionMeter({ success, fail }: { success: number; fail: number }) {
  return <div className="gl-meters">{[['성공', success], ['실패', fail]].map(([title, count]) => <div className="gl-meter" key={title}><b>원정 {title} {count}/3</b>{[1, 2, 3].map(n => <span className={`gl-dot${n <= Number(count) ? ' filled' : ''}`} key={n}>{n <= Number(count) ? '●' : '○'}</span>)}</div>)}</div>;
}

/** 고정된 예시를 신하 나래의 시점으로 진행한다. 실제 방의 정체나 행동을 읽지 않는다. */
export function FivePlayerExample() {
  const [step, setStep] = useState(0);
  const [vote, setVote] = useState<boolean | null>(null);
  const [votesShown, setVotesShown] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [failureShown, setFailureShown] = useState(false);
  const [suspect, setSuspect] = useState<number | null>(null);
  const [rejected, setRejected] = useState(false);
  const [later, setLater] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [perspective, setPerspective] = useState(1);
  const next = () => {
    if (step === 2 && !votesShown) { setVote(vote ?? true); setVotesShown(true); return; }
    if (step === 3 && !submitted) { setSubmitted(true); return; }
    if (step === 4 && !failureShown) { setFailureShown(true); return; }
    if (step === 5 && !rejected) { setRejected(true); return; }
    if (step === 6 && later < 2) { setLater(2); return; }
    if (step === 7 && target === null) setTarget(1);
    setStep(n => n + 1);
  };
  const restart = () => { setStep(0); setVote(null); setVotesShown(false); setSubmitted(false); setFailureShown(false); setSuspect(null); setRejected(false); setLater(0); setTarget(null); setPerspective(1); };
  const successes = step >= 7 ? 3 : step === 6 ? 1 + later : step >= 4 || (step === 3 && submitted) ? 1 : 0;
  const failures = step >= 5 || (step === 4 && failureShown) ? 1 : 0;
  const headings = ['나는 선의 신하예요. 다른 사람은 몰라요', '빛나는 테두리의 두 사람이 출발 후보예요', '이 두 사람을 보낼까요? 내가 투표해봐요', '원정대인 나만 성공 카드를 제출해요', '실패가 한 장 나왔어요. 어디까지 알 수 있죠?', '부결은 원정 실패와 별개예요', '이후 원정 두 번의 결과를 확인해요', '원정 3회 성공 뒤에도 암살이 남아요', '끝나고 나서야 정체를 확인해요'];
  const coaches = [
    '당신은 나래, 특별한 정보가 없는 선의 신하예요. 다른 네 사람의 정체는 물음표예요.',
    '첫 리더 가람이 자신과 나래를 골랐어요. 5인의 첫 원정에는 두 명이 필요해요. 아직 출발한 건 아니에요.',
    '원정대에 안 뽑힌 사람도 포함해 다섯 명 모두 투표해요. 내 찬성·반대는 정체를 밝히는 카드가 아니에요.',
    '이번 원정대는 가람과 나예요. 나는 선이라 성공만 낼 수 있어요. 나머지 세 사람은 제출하지 않아요.',
    '2차 원정대는 나래(나)·다온·라온이에요. 모두의 투표로 승인됐고, 나는 다시 성공을 냈어요.',
    '3차 원정의 후보는 가람·다온이었어요. 그런데 찬성 2표, 반대 3표로 출발이 취소됐어요.',
    '같은 3차 원정을 새 리더 라온이 다시 제안해요. 성공한 팀도 전원이 선이라고 확신할 수 없어요.',
    '암살자 라온이 멀린을 한 번 지목해요. 나는 신하이므로 실전에서는 이 선택을 하지 않아요. 여기서는 두 결말만 비교해봐요.',
    '누가 실패를 냈는지, 멀린이 누구였는지는 게임이 끝난 뒤 확인해요. 진행 중에는 내게 보인 정보로 판단해야 해요.',
  ];
  const knowledge = ['멀린 가람은 라온·마루가 악인 걸 알았어요. 대신 암살자에게 멀린이라는 사실을 들키면 안 돼요.', '나래는 선의 신하라는 사실만 알았어요. 그래서 실패 결과에서 다온·라온을 의심할 수 있었지만 확정할 수는 없었어요.', '다온도 신하라 다른 사람의 정체를 모르고 시작했어요.', '암살자 라온은 마루가 악의 동료라는 건 알았지만 누가 멀린인지는 몰랐어요.', '수하 마루는 라온이 악의 동료라는 걸 알았어요. 악도 선처럼 말하고 성공 카드를 낼 수 있어요.'];
  const revealNext = (step === 2 && !votesShown) || (step === 3 && !submitted) || (step === 4 && !failureShown) || (step === 5 && !rejected) || (step === 6 && later < 2);

  return <section id="avalon-five-player-example" className="avalon-example"><h3>5인 예시 플레이 · 신하가 되어보기</h3>
    <GuidedLesson theme="avalon" title="아발론 5인 예시" goal="원정 3회 성공, 그리고 멀린 지키기" perspective="나 = 나래 · 선의 신하" step={step} labels={stages} heading={headings[step]!} coach={coaches[step]!}
      status={<MissionMeter success={successes} fail={failures} />} onPrevious={() => setStep(n => n - 1)} onNext={next} onRestart={restart} nextLabel={revealNext ? '결과 바로 보기' : step === 7 && target === null ? '룰마스터의 결말 보기' : '다음 장면'}>
      {step === 0 && <><Table /><p>다섯 명 중 선은 3명, 악은 2명이에요. <b>나는 선이라는 것만 확실</b>해요. 나머지는 대화와 행동 기록으로 추리해요.</p><MoreRules title="이번 예시에서 쓰는 역할"><p>멀린·신하 2명은 선, 암살자·수하 1명은 악이에요. 퍼시벌·모르가나 등 다른 특수 역할은 사용하지 않아요. 역할 카드를 다른 사람에게 보여주면 안 돼요.</p></MoreRules></>}
      {step === 1 && <><Table leader={0} team={[0, 1]} /><div className="gl-arrow"><span>리더가 지명 → 모두 투표 → 승인되면 출발</span></div><MoreRules title="리더와 원정 인원은 어떻게 바뀌나요?"><p>리더는 가람 → 나래 → 다온 → 라온 → 마루 순서로 넘어가요. 리더 자신을 원정대에 넣어도 빼도 돼요. 5인의 원정 인원은 2·3·2·3·3명이에요.</p></MoreRules></>}
      {step === 2 && <>
        <div className="ae-selected-party">출발 후보: 가람 · 나래(나)</div>
        <div className="gl-choices" role="group" aria-label="내 원정대 투표"><button type="button" aria-pressed={vote === true} onClick={() => { setVote(true); setVotesShown(false); }}>찬성</button><button type="button" aria-pressed={vote === false} onClick={() => { setVote(false); setVotesShown(false); }}>반대</button></div>
        {!votesShown && <button type="button" className="gl-action" onClick={() => { setVote(vote ?? true); setVotesShown(true); }}>모두의 투표 공개</button>}
        {votesShown && <><div className="ae-votes">{people.map((person, i) => <div key={i}><b>{person.name}{i === 1 ? '(나)' : ''}</b><span className={(i === 1 ? vote : i !== 4) ? 'approve' : 'reject'}>{(i === 1 ? vote : i !== 4) ? '찬성' : '반대'}</span></div>)}</div><CoachResult><p><b>찬성 {vote ? 4 : 3}표 → 승인!</b> 5명 중 최소 3명이 찬성해야 해요. {vote === false ? '내가 반대해도 나머지 세 명이 찬성하면 출발해요.' : '나는 찬성했지만, 전체 표를 세어 승인 여부를 정해요.'}</p></CoachResult></>}
        <MoreRules title="찬성한 사람은 선인가요?"><p>찬성·반대만으로 편을 알 수는 없어요. 악도 찬성할 수 있고 선도 반대할 수 있어요. 이 예시는 투표자 공개 옵션을 사용해요.</p></MoreRules>
      </>}
      {step === 3 && <>
        <div className="ae-selected-party">원정대 2명: 가람 · 나래(나)</div><QuestCards success={2} fail={0} hidden={!submitted} />
        {!submitted && <div className="gl-choices"><button type="button" className="primary" onClick={() => setSubmitted(true)}>성공 제출하기</button><button type="button" disabled>실패 · 선은 선택 불가</button></div>}
        {submitted && <CoachResult><p><b>성공 2장 → 1차 원정 성공!</b> 내가 낸 카드도 섞였어요. 공개 결과에는 제출자 이름이 없어요.</p></CoachResult>}
        <MoreRules title="투표와 원정 카드가 어떻게 달라요?"><p>찬성·반대 투표는 전원이 ‘이 팀을 보낼지’ 결정해요. 성공·실패 카드는 승인된 원정대원만 비밀리에 내요. 선은 성공만, 악은 성공·실패 중 하나를 고를 수 있어요.</p></MoreRules>
      </>}
      {step === 4 && <>
        <div className="ae-selected-party">2차 원정대: 나래(나) · 다온 · 라온</div><QuestCards success={2} fail={1} hidden={!failureShown} />
        {!failureShown ? <button type="button" className="gl-action" onClick={() => setFailureShown(true)}>섞인 원정 카드 공개</button> : <>
          <CoachResult><p><b>실패 1장 → 원정 실패.</b> 나는 성공을 냈으니 <b>다온·라온 중 적어도 한 명은 악</b>이에요. 아직 둘 중 누구인지는 몰라요.</p></CoachResult>
          <MoreRules title="원탁에서 한 명씩 의심해보기"><p className="gl-caption">사람을 눌러 이 단서로 어디까지 판단할 수 있는지 보세요.</p><Table leader={1} team={[1, 2, 3]} pick={setSuspect} suspect={suspect} />
          {suspect !== null && <CoachResult><p>{suspect === 2 || suspect === 3 ? `${people[suspect]!.name}는 이번 원정대라 의심할 수 있어요. 하지만 이 결과만으로 다온·라온 중 누가 악인지 확정할 수는 없어요.` : suspect === 1 ? '나래는 나예요. 나는 선이고 성공을 냈다는 사실을 알아요.' : `${people[suspect]!.name}는 이번 원정대가 아니어서 이 실패 카드를 낸 사람은 아니에요. 그렇다고 선으로 확정되는 건 아니에요.`}</p></CoachResult>}</MoreRules>
        </>}
        <MoreRules title="성공 카드가 두 장인데 왜 실패인가요?"><p>원정 카드는 다수결이 아니에요. 5인에서는 실패 한 장만 있어도 실패예요. 7인 이상 게임의 4차 원정만 실패 두 장이 필요해요.</p></MoreRules>
      </>}
      {step === 5 && <>
        <Table leader={rejected ? 3 : 2} team={rejected ? [] : [0, 2]} />
        <div className="ae-vote-separate"><b>3차 원정 · 연속 부결 {rejected ? 1 : 0}/5</b><div className="gl-meter">{[1, 2, 3, 4, 5].map(n => <span className={`gl-dot${rejected && n === 1 ? ' filled' : ''}`} key={n}>{n}</span>)}</div></div>
        {!rejected ? <button type="button" className="gl-action" onClick={() => setRejected(true)}>부결된 뒤의 상황 보기</button> : <CoachResult><p><b>원정 기록은 성공 1·실패 1 그대로.</b> 출발하지 않았으니 원정 실패는 늘지 않아요. 리더만 다온 → 라온으로 바뀌고, 같은 3차 원정의 2명을 다시 뽑아요.</p></CoachResult>}
        <MoreRules title="계속 반대만 하면 어떻게 되나요?"><p>같은 원정에서 5회 연속 부결되면 즉시 악이 승리해요. 원정 3회 실패와는 별개의 승리 조건이에요.</p></MoreRules>
      </>}
      {step === 6 && <>
        <div className="ae-results" aria-label="원정 결과 기록"><span className="success">1차 성공</span><span className="fail">2차 실패</span><span className={later >= 1 ? 'success' : ''}>3차 {later >= 1 ? '성공' : '대기'}</span><span className={later >= 2 ? 'success' : ''}>4차 {later >= 2 ? '성공' : '대기'}</span><span>5차 미진행</span></div>
        <Table leader={later >= 2 ? 4 : 3} team={later >= 2 ? [0, 1, 2] : [0, 3]} />
        {later < 2 && <button type="button" className="gl-action" onClick={() => setLater(n => n + 1)}>{later === 0 ? '승인된 3차 원정 결과 보기' : '이후 4차 원정 결과 보기'}</button>}
        <CoachResult><p>{later === 0 ? '리더 라온이 가람·라온을 제안해 찬성 3표로 승인됐어요. 두 원정대원이 카드를 제출해요.' : later === 1 ? '3차 원정도 성공했어요. 하지만 악도 성공을 낼 수 있어서 가람·라온 모두 선이라고 단정할 수 없어요. 다음 리더는 마루예요.' : '마루가 자신을 빼고 가람·나래·다온을 제안했고 찬성 3표로 승인됐어요. 4차도 성공해 성공 원정이 3개가 됐어요. 5차는 진행하지 않아요.'}</p></CoachResult>
      </>}
      {step === 7 && <>
        <Table assassin />
        <div className="gl-choices" role="group" aria-label="학습용 암살 결말 비교"><button type="button" aria-pressed={target === 0} onClick={() => setTarget(0)}>가람 지목 시</button><button type="button" aria-pressed={target === 1} onClick={() => setTarget(1)}>나래 지목 시</button></div>
        <CoachResult><p>{target === 0 ? '가람이 멀린이었어요. 원정을 3번 성공했어도 멀린 암살로 악이 승리해요.' : target === 1 ? '나래는 신하라 멀린 암살에 실패했어요. 멀린이 살아남아 선이 승리해요.' : '실제 암살자는 누가 멀린인지 모른 채 한 번만 확정할 수 있어요. 여기서는 이름을 바꿔 두 결과를 비교해봐요.'}</p></CoachResult>
      </>}
      {step === 8 && <>
        <div className={`ae-ending ${target === 0 ? 'evil' : 'good'}`}><b>{target === 0 ? '악 승리 · 멀린 암살 성공' : '선 승리 · 원정 3회 성공, 멀린 생존'}</b></div>
        <Table reveal />
        <p>2차 원정의 실패는 라온이 냈어요. <b>라온은 3차에는 성공을 내서</b> 정체를 숨겼어요. 원정 성공만으로 편을 확정할 수 없었던 이유예요.</p>
        <MoreRules title="이제 역할별로 알았던 정보 비교하기"><div className="gl-choices">{people.map((person, i) => <button type="button" key={i} aria-pressed={perspective === i} onClick={() => setPerspective(i)}>{person.name}</button>)}</div><p role="status">{knowledge[perspective]}</p></MoreRules>
        <div className="gl-arrow"><span>제안은 리더 · 찬반 투표는 전원</span><span>성공·실패 제출은 원정대원만</span><span>추리는 내 정보와 공개 기록으로</span></div>
      </>}
    </GuidedLesson>
  </section>;
}
