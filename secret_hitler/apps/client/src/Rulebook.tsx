import { useState } from 'react';
import type { Copy, Language } from './i18n';
import { PolicyFace } from './Art';
import { PlayGuide } from './Guide';
import tables from '../../../packages/rules-engine/src/rule-tables.json';

function PolicyExample({ t, ko }: { t: Copy; ko: boolean }) {
  const [step, setStep] = useState(0);
  const cards: ('liberal' | 'fascist')[] = step === 0 ? ['liberal','fascist','fascist'] : step === 1 ? ['liberal','fascist'] : ['liberal'];
  const titles = ko
    ? ['대통령 화면: 3장 중 버릴 1장을 고르세요', '수상 화면: 받은 2장 중 통과시킬 1장을 고르세요', '모두의 화면: 제정된 정책 1장만 공개돼요']
    : ['President: choose 1 of 3 cards to discard', 'Chancellor: choose 1 of 2 cards to enact', 'Everyone: see the single enacted policy'];
  const explanations = ko
    ? ['이 예시에서는 세 번째 파시스트 카드를 버려 볼게요. 남은 자유·파시스트 2장은 수상에게 갑니다.', '이번에는 자유 정책을 통과시켜 볼게요. 남은 파시스트 카드 1장은 자동으로 버려집니다.', '보드의 자유 정책 칸이 1칸 채워집니다. 누가 무엇을 버렸는지는 다른 사람에게 공개되지 않아요.']
    : ['In this example, discard the third Fascist card. The Liberal and Fascist cards go to the Chancellor.', 'Now enact the Liberal policy. The remaining Fascist card is discarded automatically.', 'The Liberal track gains 1 policy. Other players do not see the discarded cards.'];
  return <section id="guide-example" className="guide-section guide-legislation-demo" aria-labelledby="guide-example-title">
    <h3 id="guide-example-title" tabIndex={-1}>{ko ? '입법, 직접 넘겨 보며 이해하기' : 'Try a legislative session'}</h3>
    <p className="guide-important">{ko ? '대통령은 버릴 카드, 수상은 통과시킬 카드를 고릅니다.' : 'The President chooses what to discard. The Chancellor chooses what to enact.'}</p>
    <p className="guide-example-note">{ko ? '연습용 예시입니다. 아래 버튼은 실제 게임에 영향을 주지 않아요.' : 'Practice only. These buttons do not affect your game.'}</p>
    <ol className="guide-demo-flow" aria-label={ko ? '입법 순서' : 'Legislative order'}>
      {(ko ? ['3장 받기', '2장 전달', '1장 제정'] : ['Draw 3', 'Pass 2', 'Enact 1']).map((label,i)=><li key={label} aria-current={step===i?'step':undefined}>{label}</li>)}
    </ol>
    <div className="guide-demo-status" role="status" aria-live="polite" aria-atomic="true"><strong>{titles[step]}</strong><p>{explanations[step]}</p></div>
    <div className="guide-demo-cards" aria-label={ko ? '가상의 정책 카드' : 'Example policy cards'}>
      {cards.map((policy,i)=><div key={`${step}:${i}`} className={`guide-demo-card${step===0&&i===2?' discard-example':''}${step===1&&i===0?' enact-example':''}`}>
        <PolicyFace policy={policy} title={policy==='liberal'?t.policyL:t.policyF} size={28} />
        <small>{step===0&&i===2 ? (ko?'이 카드를 버려요':'Discard this') : step===1&&i===0 ? (ko?'이 카드를 제정해요':'Enact this') : step===2 ? (ko?'모두에게 공개':'Public policy') : (ko?'예시 카드':'Example card')}</small>
      </div>)}
    </div>
    <div className="guide-demo-controls">
      <button type="button" disabled={step===0} onClick={()=>setStep(value=>value-1)}>{ko?'이전':'Back'}</button>
      <button type="button" className="primary" onClick={()=>setStep(value=>value===2?0:value+1)}>{ko ? ['파시스트 1장 버려 보기','자유 정책 제정해 보기','처음부터 다시 보기'][step] : ['Discard 1 Fascist card','Enact the Liberal policy','Try again'][step]}</button>
    </div>
  </section>;
}

export function Rulebook({ t, lang }: { t: Copy; lang: Language }) {
  const ko = lang === 'ko';
  const jump = (id: string) => { const heading = document.getElementById(id)?.querySelector<HTMLElement>('h3'); heading?.focus(); heading?.scrollIntoView({block:'start'}); };
  const faq = ko ? [
    ['투표는 정책에 찬성하는 건가요?', '아니요. 대통령·수상 두 사람에게 이번 입법을 맡길지 결정하는 투표입니다. 생존자 전원이 투표하고, 절반을 넘어야 통과해요. 예를 들어 5명이라면 찬성 3명 이상이 필요하고, 6명이라면 4명 이상이 필요합니다. 동수는 부결이에요.'],
    ['왜 받은 카드가 모두 파시스트인가요?', '처음부터 파시스트 정책이 11장으로 자유 정책 6장보다 많아요. 대통령이 파시스트 3장을 뽑거나 수상이 파시스트 2장만 받는 일도 가능합니다. 받은 카드 중에서만 고를 수 있으므로, 파시스트 정책이 나왔다는 사실 하나로 누군가의 정체를 단정할 수는 없어요.'],
    ['다른 사람은 입법 중에 무엇을 보나요?', '대통령만 처음 3장을 보고, 수상은 전달받은 2장을 봅니다. 나머지 사람은 대통령 검토 → 봉인된 카드 2장 전달 → 수상 검토 안내를 봐요. 제정된 1장만 모두에게 공개되고, 버린 카드와 선택 중인 카드는 공개되지 않습니다.'],
    ['정책을 고르면서 서로 이야기해도 되나요?', '대통령과 수상은 입법이 진행되는 동안 말·신호·채팅으로 의논하면 안 됩니다. 입법이 끝나면 어떤 카드를 받았는지 설명할 수 있어요. 그 설명이 사실인지 거짓말인지는 다른 사람들이 판단합니다.'],
    ['사진이나 카드를 눌렀는데 왜 확정되지 않나요?', '인물 사진은 한 번 눌러 대상을 고른 뒤, 이름을 확인하고 아래 행동 버튼을 길게 눌러 확정합니다. 투표·입법 카드는 첫 번째 누르기가 선택, 같은 카드를 다시 누르거나 위로 미는 동작이 확정이에요. 다른 카드를 한 번 누르면 선택만 바뀝니다.'],
    ['선거가 계속 부결되면 어떻게 되나요?', '부결될 때마다 선거 트래커가 1 올라가요. 3이 되면 정부를 뽑지 않고 맨 위 정책 1장을 자동으로 통과시키는 ‘혼란’이 일어납니다. 이때 대통령 권한은 발동하지 않고, 수상 지명 제한도 풀립니다. 정책이 제정되면 트래커는 0으로 돌아가요.'],
    ['거부권은 언제 사용할 수 있나요?', '파시스트 정책이 5장 제정된 뒤부터 사용할 수 있어요. 수상이 받은 두 장을 모두 버리고 싶다면 거부권을 요청합니다. 대통령이 승인하면 두 장을 버리고 선거 트래커가 1 올라가요. 거절하면 수상이 받은 두 장 중 하나를 반드시 제정해야 합니다.'],
    ['카드가 부족하면 어떻게 하나요?', '입법이 끝났거나 혼란으로 정책을 제정한 뒤, 뽑는 더미가 3장 미만이면 남은 카드와 버린 카드를 합쳐 다시 섞어요. 이미 보드에 제정된 정책은 다시 섞지 않습니다. 앱이 자동으로 처리하니 직접 계산하거나 섞을 필요는 없어요.'],
  ] : [
    ['Am I voting for a policy?', 'No. You are deciding whether to trust the President–Chancellor pair with this session. Every living player votes; more than half must approve. With 5 voters you need 3 Yes votes; with 6 you need 4. Ties fail.'],
    ['Can all the cards I receive be Fascist?', 'Yes. The starting deck has 11 Fascist and only 6 Liberal policies. The President can draw three Fascist cards, or the Chancellor can receive two. You can only choose from the cards you receive, so one Fascist policy alone does not prove anyone’s secret role.'],
    ['What do the other players see during legislation?', 'The President sees the initial 3 cards; the Chancellor sees the 2 received cards. Others see review → two sealed cards passed → review. Only the enacted policy is revealed to everyone. Discards and selections remain private.'],
    ['Can the officials discuss their cards?', 'The President and Chancellor must not communicate through speech, signals or chat during legislation. Afterward, they may explain what they received. Their claims may be truthful or lies.'],
    ['Why did a single tap not confirm my choice?', 'For a person, select a portrait, check the name, then hold the action button. For a ballot or policy card, the first tap selects; tap the same card again or slide it upward to confirm. Tapping a different card changes your selection.'],
    ['What happens after repeated failed elections?', 'Each rejection advances the election tracker by 1. At 3, the top policy is enacted automatically as chaos. It triggers no executive power and clears Chancellor term limits. Any enacted policy resets the tracker to 0.'],
    ['When is a veto available?', 'After 5 Fascist policies have been enacted. The Chancellor may ask to discard both received cards. The President’s consent discards them and advances the tracker by 1. If refused, the Chancellor must enact one of the two.'],
    ['What happens when the deck runs low?', 'After legislation or a chaos enactment, fewer than 3 cards in the draw pile triggers an automatic reshuffle of the remaining and discarded cards. Enacted policies stay on the board and never return to the deck.'],
  ];
  return <div className="rulebook">
    <nav className="guide-navigation" aria-label={ko?'도움말 바로가기':'Help sections'}>
      {[["guide-start",ko?'먼저 알아보기':'Start here'],["guide-example",ko?'입법 예시':'Policy example'],["guide-steps",ko?'단계별 도움말':'Each step'],["guide-questions",ko?'자주 묻는 질문':'Questions']].map(([id,label])=><button type="button" key={id} onClick={()=>jump(id)}>{label}</button>)}
    </nav>
    <section id="guide-start" className="guide-section">
      <h3 tabIndex={-1}>{ko?'처음이라면, 이것부터 알아 두세요':'New to the game? Start here'}</h3>
      <p>{ko?'5~10명이 정체를 숨긴 채 두 진영으로 나뉘어 싸우는 게임이에요. 대화를 통해 믿을 사람을 고르고, 우리 편이 이길 수 있도록 정책을 통과시키세요.':'5–10 players split into two secret teams. Discuss whom to trust, choose a government, and try to pass the policies your team needs.'}</p>
      <section className="guide-deck" aria-labelledby="guide-deck-title">
        <h4 id="guide-deck-title">{ko?'정책 카드는 총 17장':'The policy deck starts with 17 cards'}</h4>
        <div className="guide-deck-counts"><p><b>6</b><span>{ko?'자유당 정책 6장':'6 Liberal policies'}</span></p><p><b>11</b><span>{ko?'파시스트 정책 11장':'11 Fascist policies'}</span></p></div>
        <p>{ko?'인원이 5명이든 10명이든 정책 카드 수는 같아요. 이 카드는 사람의 비밀 역할 카드와는 별개입니다.':'The policy deck has the same counts with 5 or 10 players. These are separate from the players’ secret role cards.'}</p>
        <p className="guide-important">{ko?'6장·11장은 처음 더미에 들어 있는 수, 5장·6장은 보드에 제정하면 이기는 수예요.':'6 and 11 are the starting deck counts. 5 and 6 are the policy totals needed to win.'}</p>
      </section>
      <h4>{ko?'우리 편은 어떻게 이기나요?':'How does my team win?'}</h4>
      <div className="guide-win-grid">
        <article className="guide-liberal"><strong>{t.liberal}</strong><p>{ko?'자유 정책 5장을 제정하면 승리':'Win by enacting 5 Liberal policies'}</p><small>{ko?'또는 대통령이 히틀러를 처형하면 즉시 승리해요.':'Or win immediately if the President executes Hitler.'}</small></article>
        <article className="guide-fascist"><strong>{ko?'파시스트·히틀러':'Fascists & Hitler'}</strong><p>{ko?'파시스트 정책 6장을 제정하면 승리':'Win by enacting 6 Fascist policies'}</p><small>{ko?'또는 파시스트 정책이 3장 이상일 때 히틀러가 수상에 당선되면 즉시 승리해요. 후보로 지명만 된 것은 당선이 아닙니다.':'Or win if Hitler is elected Chancellor with at least 3 Fascist policies enacted. Nomination alone does not count.'}</small></article>
      </div>
      <div className="guide-basics-grid">
        <article><h4>{ko?'내 편은 게임 내내 같아요':'Your team stays the same'}</h4><p>{ko?'비밀 역할은 자유당·파시스트·히틀러입니다. 히틀러는 파시스트 편이에요. 역할은 시작할 때 무작위로 정해지고, 다른 사람에게 내 화면을 보여 주면 안 돼요.':'Your secret role is Liberal, Fascist or Hitler. Hitler belongs to the Fascist team. Roles are randomly assigned at the start; keep your role screen private.'}</p></article>
        <article><h4>{ko?'대통령·수상은 맡는 일이에요':'Offices are temporary jobs'}</h4><p>{ko?'대통령과 수상은 이번 입법을 맡은 사람을 뜻해요. 다음 선거에서는 다른 사람이 맡을 수 있지만 비밀 역할과 진영은 바뀌지 않습니다. 대통령이라고 같은 편인 것은 아니에요.':'President and Chancellor are the two officials handling this session. These jobs can change each election, but secret roles and teams do not. A President is not necessarily your ally.'}</p></article>
      </div>
      <h4>{ko?'한 라운드의 흐름':'One round at a glance'}</h4>
      <ol className="guide-round-flow">
        {(ko?['대통령이 수상 후보 1명을 지명해요.','생존자 모두가 두 사람에게 맡길지 찬성·반대 투표를 해요.','가결되면 대통령이 정책 3장 중 1장을 버리고, 나머지 2장을 수상에게 넘겨요.','수상이 받은 2장 중 1장을 제정해요. 필요한 대통령 권한까지 처리하면 다음 선거로 넘어가요.']:['The President nominates a Chancellor.','Every living player votes on trusting the pair.','If approved, the President draws 3 policies, discards 1, and passes 2.','The Chancellor enacts 1 of the 2. Resolve any executive power, then begin the next election.']).map(line=><li key={line}>{line}</li>)}
      </ol>
      <p>{ko?'제정은 “정책을 통과시켜 보드에 올린다”, 폐기는 “카드를 버린다”는 뜻입니다. 토론 중 거짓말은 가능하지만, 입법 중 대통령과 수상은 의논할 수 없어요.':'Enact means pass a policy and add it to the board. Discard means throw a card away. Lying during discussion is allowed, but the two officials must not confer during legislation.'}</p>
    </section>
    <PolicyExample t={t} ko={ko} />
    <div id="guide-steps"><PlayGuide t={t} ko={ko} /></div>
    <section id="guide-questions" className="guide-section guide-questions">
      <h3 tabIndex={-1}>{ko?'헷갈릴 때 찾아보세요':'Common questions'}</h3>
      {faq.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
      <details><summary>{ko?'인원별 비밀 역할은 몇 명씩인가요?':'How many players are on each team?'}</summary>
        <p>{ko?'히틀러는 항상 1명이며 파시스트 편입니다. 아래 파시스트 숫자는 히틀러를 제외한 수예요. 자유당은 동료를 모르고, 5~6명일 때는 파시스트와 히틀러가 서로를 압니다. 7~10명일 때는 파시스트만 동료와 히틀러를 알고, 히틀러는 동료를 몰라요.':'Hitler is always one player on the Fascist team. The Fascist column below excludes Hitler. Liberals know no allies. With 5–6 players, Hitler and the Fascist know each other; with 7–10, Fascists know the others, but Hitler knows no allies.'}</p>
        <div className="guide-table-wrap"><table><caption>{ko?'정책 카드 수가 아닌, 참가자의 역할 구성입니다.':'Player roles, not policy cards'}</caption><thead><tr>{[ko?'전체 인원':'Players',t.liberal,ko?'파시스트 (히틀러 제외)':'Fascists (excluding Hitler)',t.hitler].map(text=><th scope="col" key={text}>{text}</th>)}</tr></thead><tbody>{Object.entries(tables.roles).map(([count,roles])=><tr key={count}><th scope="row">{count}</th>{roles.map((n,i)=><td key={i}>{n}</td>)}</tr>)}</tbody></table></div>
      </details>
      <details><summary>{ko?'대통령 권한은 언제 생기고, 무엇을 할 수 있나요?':'When do executive powers become available?'}</summary>
        <p>{ko?'파시스트 정책을 제정했을 때 해당 칸에 권한이 있으면 대통령이 사용합니다. 인원수에 따라 표가 달라요. 혼란으로 자동 제정된 정책은 권한을 발동하지 않습니다.':'After a Fascist policy is enacted, the President uses any power shown on that slot. Powers depend on player count. Policies enacted by chaos trigger no power.'}</p>
        <div className="guide-table-wrap"><table><caption>{ko?'지금까지 제정된 파시스트 정책 수 → 대통령 권한':'Total enacted Fascist policies → executive power'}</caption><thead><tr><th scope="col">{ko?'파시스트 정책':'Fascist policies'}</th><th scope="col">5–6</th><th scope="col">7–8</th><th scope="col">9–10</th></tr></thead><tbody>{Array.from({length:6},(_,index)=><tr key={index}><th scope="row">{index+1}</th>{(['5-6','7-8','9-10'] as const).map(range=>{const power=tables.powers[range][index];return <td key={range}>{index===5?(ko?'파시스트 승리':'Fascists win'):power?t[power as 'investigate'|'peek'|'special_election'|'execute']:'—'}</td>;})}</tr>)}</tbody></table></div>
        <p>{ko?'정체 조사는 정당만 알려 줍니다. 히틀러도 파시스트로 보여요. 처형된 사람은 발언·투표·출마를 할 수 없으며, 히틀러가 아니면 역할은 공개되지 않습니다. 권한의 자세한 조작은 위 단계별 도움말의 7-A~7-D를 참고하세요.':'Investigations reveal party membership only: Hitler appears Fascist. Executed players cannot speak, vote or hold office; only Hitler’s role is revealed upon execution. See the step-by-step guide for each power’s controls.'}</p>
      </details>
      <details><summary>{ko?'시간이 끝나거나 연결이 끊기면요?':'What if time runs out or someone disconnects?'}</summary><p>{t.timerNote}</p><p>{ko?'살아 있는 참가자의 연결이 끊기면 게임이 일시정지됩니다. 방장은 재접속을 기다리거나 해당 자리를 훈련 의원으로 바꿀 수 있어요.':'If a living player disconnects, the game pauses. The host can wait for reconnection or replace the disconnected player with a bot.'}</p></details>
    </section>
  </div>;
}
