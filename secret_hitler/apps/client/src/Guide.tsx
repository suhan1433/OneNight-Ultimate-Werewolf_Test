import type { GameView } from "../../../packages/shared-types/src/index";
import { Emblem, PolicyFace, Portrait } from "./Art";
import type { Copy } from "./i18n";

type Step = { key: string; title: string; who: string; how: string; why: string; next: string };
const steps: Step[] = [
  { key: "night", title: "1. 내 역할 확인", who: "참가자 모두 · 본인 화면에서만", how: "봉투를 길게 누르면 내 역할과 알 수 있는 동료가 보여요. 손을 떼면 다시 가려집니다. 확인한 뒤 ‘역할 확인 완료’를 눌러 주세요.", why: "누구와 같은 편인지 숨긴 채 토론하는 게임이에요. 역할을 다른 사람에게 보여 주지 마세요. 자유당은 동료를 모르고, 7명 이상일 때 히틀러도 동료를 몰라요.", next: "모두 확인하면 대통령이 수상 후보를 지명합니다." },
  { key: "nomination", title: "2. 수상 후보 지명", who: "대통령만 선택 · 나머지는 토론", how: "밝게 표시된 인물 사진을 누르면 선택됩니다. 아래 대상 이름을 확인하고 ‘수상 후보 지명’을 길게 눌러 확정하세요. 사진을 누르는 것만으로 지명이 끝나지는 않아요.", why: "대통령과 수상은 함께 정책을 처리해요. 믿을 만한 사람을 골라 주세요. 본인·처형된 사람·직전 당선 수상은 선택할 수 없어요. 생존자가 6명 이상이면 직전 당선 대통령도 제외됩니다.", next: "지명 후 생존자 전원이 이 정부에 찬성할지 투표합니다. 선택 중인 인물의 스포트라이트는 모두에게 보여요." },
  { key: "voting", title: "3. 정부 신임 표결", who: "생존 참가자 모두 · 선택은 비공개", how: "이 대통령과 수상에게 정책을 맡기고 싶으면 ‘자! · 찬성’, 아니면 ‘부! · 반대’를 선택하세요. 카드를 두 번 누르거나 위로 밀면 제출됩니다.", why: "정책 종류에 투표하는 단계가 아니라 두 사람의 정부를 믿을지 결정하는 단계예요. 5명이 투표하면 찬성 3명 이상이어야 가결되고, 동수는 부결이에요.", next: "모두 제출하면 인물별 선택을 한꺼번에 공개합니다. 그 전에는 다른 사람의 찬반을 볼 수 없어요." },
  { key: "vote_result", title: "4. 결과 함께 확인", who: "생존 참가자 모두 · 관전자는 보기만", how: "각 얼굴의 찬반과 총합을 천천히 확인한 뒤 ‘투표 결과 확인’을 누르세요. ‘확인 완료 · 3/5’는 생존자 5명 중 3명이 확인했다는 뜻이에요.", why: "누가 어떤 정부를 지지했는지 기억하면 다음 토론에 도움이 돼요. 결과는 자동으로 사라지지 않아요.", next: "전원 확인 후 가결이면 입법으로, 부결이면 다음 대통령으로 넘어가요. 파시스트 정책 3개 이상일 때 히틀러가 수상에 당선되면 파시스트가 승리합니다." },
  { key: "president_discard", title: "5. 대통령: 3장 중 1장 폐기", who: "대통령만 카드 확인·선택", how: "화면에 나온 정책 3장 중 버릴 카드 1장을 두 번 누르거나 위로 밀어 확정하세요. 남은 2장은 수상에게 전달됩니다. 이 단계에서는 대통령이 정책을 직접 제정하지 않아요.", why: "자기 진영에 유리한 정책을 남기려는 선택이에요. 더미는 자유 정책 6장, 파시스트 정책 11장으로 시작해요. 대통령과 수상은 입법 중 말·신호·채팅으로 소통할 수 없어요.", next: "다른 사람은 대통령 검토 → 봉인된 카드 2장 전달 → 수상 검토의 진행 상황을 봅니다. 버린 카드의 종류는 공개되지 않아요." },
  { key: "chancellor_enact", title: "6. 수상: 2장 중 1장 제정", who: "수상만 남은 카드 확인·선택", how: "받은 정책 2장 중 실제로 통과시킬 카드 1장을 두 번 누르거나 위로 밀어 확정하세요. 다른 1장은 자동으로 버려집니다. 대통령 때와 달리 지금은 ‘남길 카드’를 선택해요.", why: "제정한 정책이 진영의 승리에 가까워지게 해요. 자유당은 자유 정책 5개, 파시스트는 파시스트 정책 6개를 목표로 합니다. 마음에 드는 정책이 없어도 받은 카드 중 골라야 해요.", next: "제정한 정책은 모두에게 공개됩니다. 파시스트 정책이면 해당 칸의 대통령 권한이 발동할 수 있어요." },
  { key: "investigate", title: "7-A. 대통령 권한: 정체 조사", who: "대통령이 대상 선택·정당 확인", how: "아직 조사하지 않은 생존자 사진을 선택하고 ‘정체 조사’를 길게 누르세요. 정당 카드를 읽은 뒤 ‘열람 완료’를 누릅니다.", why: "자유당인지 파시스트 소속인지 알아볼 수 있어요. 히틀러도 ‘파시스트’로 보이므로 히틀러인지까지 알 수는 없어요. 결과는 대통령에게만 보이고, 말할 때 거짓말도 가능합니다.", next: "모두에게는 선택 대상과 조사 완료 표시만 보여요. 같은 사람은 다시 조사할 수 없고, 확인 후 다음 선거를 시작합니다." },
  { key: "peek", title: "7-B. 대통령 권한: 정책 엿보기", who: "대통령만 상위 3장 열람", how: "‘정책 엿보기’를 누르면 아래 예시처럼 정책 3장이 나타나요. 왼쪽 1번이 더미 맨 위입니다. 카드를 고르거나 버리는 단계가 아니에요. 다 읽었다면 ‘열람 완료’를 누르세요.", why: "앞으로 나올 정책을 미리 보고 다음 정부의 설명을 판단할 수 있어요. 실제 카드 내용은 대통령만 볼 수 있고, 다른 사람에게 어떻게 설명할지는 자유예요.", next: "카드는 원래 순서로 되돌아가고 다음 선거로 넘어가요. 다른 사람에게는 엿보는 중이라는 안내만 보입니다." },
  { key: "special_election", title: "7-C. 대통령 권한: 특별 선거", who: "현재 대통령이 다음 대통령 후보 지정", how: "본인을 제외한 생존자 사진을 선택하고 ‘특별 선거’를 길게 눌러 확정하세요.", why: "이번 한 번의 대통령 순서를 바꿀 수 있어요. 지목한 사람이 바로 당선되는 것은 아니고, 그 사람이 수상을 지명한 다음 모두가 다시 투표합니다.", next: "특별 선거가 끝나면 이 권한을 사용했던 대통령의 다음 생존자부터 원래 순서로 돌아갑니다." },
  { key: "execute", title: "7-D. 대통령 권한: 처형", who: "대통령이 생존자 1명 선택", how: "대상 사진과 이름을 꼭 확인한 뒤 ‘처형’을 길게 눌러 확정하세요. 확정한 처형은 되돌릴 수 없어요.", why: "히틀러를 처형하면 자유당이 즉시 승리합니다. 다른 사람을 처형하면 그 사람의 역할은 공개되지 않고, 이후 발언·투표·출마를 할 수 없어요.", next: "선택한 대상은 모두에게 표시되지만 일반 역할은 숨겨집니다. 게임이 끝나지 않았다면 다음 선거로 넘어가요." },
  { key: "veto", title: "8. 거부권과 혼란", who: "수상이 거부권 요청 → 대통령이 승인 또는 거절", how: "파시스트 정책이 5개 제정되면 수상은 2장을 받은 뒤 거부권을 요청할 수 있어요. 대통령이 승인하면 둘 다 버리고, 거절하면 수상이 반드시 1장을 제정합니다.", why: "둘 다 통과시키고 싶지 않을 때 쓰지만, 승인하면 선거 트래커가 1 올라가요. 정부 부결도 트래커를 1 올립니다. 트래커 3에서는 맨 위 정책이 자동 제정되는 ‘혼란’이 발생해요.", next: "정책이 제정되면 트래커는 0으로 돌아갑니다. 혼란은 임기 제한을 해제하고 대통령 권한은 발동하지 않아요." },
];
const english = [
  ["Check your role", "Everyone privately", "Hold the envelope to read your role, then release to hide it. Press Role confirmed.", "Keep your role secret. Liberals know no allies; Hitler knows no allies with 7–10 players.", "Everyone confirms before nomination begins."],
  ["Nominate a Chancellor", "President chooses; everyone discusses", "Tap an eligible portrait, check the name, then hold Nominate to commit. Tapping alone only selects.", "Choose someone you trust to handle policies. Yourself, dead players and the last elected Chancellor are ineligible; the last elected President is also excluded with 6+ survivors.", "Everyone sees the selected portrait under the spotlight, then votes after nomination."],
  ["Vote on the government", "Every living player, privately", "Tap a Ja/Nein card twice or slide it upward to submit.", "You are voting on the two officials, not a policy. A strict majority passes; ties fail. With 5 voters, 3 Ja votes are needed.", "Votes become public only after everyone submits."],
  ["Review the results", "Every living player confirms", "Read each face and vote, then press Confirm vote results. 3/5 means three of five survivors have confirmed.", "Remembering who supported whom helps discussion. Results do not disappear automatically.", "All confirmations are required. Passing leads to legislation; failure advances the President. Electing Hitler with 3+ Fascist policies wins for Fascists."],
  ["President discards one", "President only", "Tap a policy twice or slide it up to discard it. The other two go to the Chancellor.", "You are choosing what to throw away. The original deck has 6 Liberal and 11 Fascist policies. Both officials must stay silent during legislation.", "Others see the President reviewing, two sealed cards being passed, and the Chancellor reviewing. Discards remain private."],
  ["Chancellor enacts one", "Chancellor only", "Tap a policy twice or slide it up to enact it. The other policy is discarded.", "Choose what to keep this time. Liberals need 5 policies; Fascists need 6. You must choose from the cards you received.", "The enacted policy is public. A Fascist policy may trigger an executive power."],
  ["Investigate loyalty", "President selects and reads privately", "Select an uninvestigated survivor, hold Investigate, then press Done reading after reviewing the party card.", "You learn party membership, not the exact role. Hitler appears Fascist. The President may lie about the result.", "Everyone sees the target and investigated marker, but only the President sees the party."],
  ["Policy Peek", "President reads privately", "Press Policy Peek. Three cards appear as in the example. Card 1 on the left is the top of the deck. Do not choose or discard a card; press Done reading.", "Use this preview to assess later claims. Only the President sees the cards and may describe them truthfully or lie.", "The cards return in the same order and the next election starts. Others only see a waiting message."],
  ["Special election", "President selects the next President", "Select a different living player and hold Special election.", "This changes the President for one election. The chosen player must still nominate a Chancellor and pass a vote.", "Afterward, rotation resumes after the President who called the special election."],
  ["Execution", "President selects one survivor", "Check the target portrait and name, then hold Execute. This decision cannot be undone.", "Executing Hitler immediately wins for Liberals. Otherwise the role stays secret and the executed player may no longer talk, vote or hold office.", "Everyone sees the target. If the game continues, start the next election."],
  ["Veto and chaos", "Chancellor requests; President responds", "After 5 Fascist policies, the Chancellor can request a veto. Consent discards both policies; refusal requires enacting one.", "An approved veto or failed election advances the tracker. At 3, the top policy is automatically enacted as chaos.", "Enacting a policy resets the tracker. Chaos clears term limits and triggers no executive power."],
];

export function PhaseHelp({ g, selfId, t }: { g: GameView; selfId: string; t: Copy }) {
  const ko = t.confirm === "확인";
  const key = g.phase === "executive" ? g.power : g.phase;
  const i = steps.findIndex((s) => s.key === key);
  if (i < 0) return null;
  const acting = g.phase === "chancellor_enact" ? g.chancellor : g.president;
  const collective = ["night", "voting", "vote_result"].includes(g.phase);
  const label = collective ? (ko ? "모두의 차례" : "Everyone acts") : acting === selfId ? (ko ? "내 차례" : "Your turn") : `${g.players.find((p) => p.id === acting)?.name} · ${t.wait}`;
  return <details className="phase-help"><summary>{label} · {ko ? "무엇을 하나요?" : "What do I do?"}</summary><p>{ko ? steps[i].how : english[i][2]}</p><p>{ko ? steps[i].next : english[i][4]}</p></details>;
}

function Example({ kind, t, ko }: { kind: string; t: Copy; ko: boolean }) {
  const policies = kind === "president_discard" ? ["liberal", "fascist", "fascist"] as const : kind === "chancellor_enact" ? ["liberal", "fascist"] as const : ["fascist", "liberal", "fascist"] as const;
  return <figure className="guide-example">
    <figcaption>{ko ? "화면 예시 · 가상의 인물과 카드입니다" : "Screen example · fictional players and cards"}</figcaption>
    {["peek", "president_discard", "chancellor_enact"].includes(kind) ? <>
      <div className="guide-policies">{policies.map((policy, i) => <div key={i}><small>{kind === "peek" ? `${i + 1}${i === 0 ? (ko ? " · 맨 위" : " · top") : ""}` : `${i + 1}`}</small><PolicyFace policy={policy} title={policy === "liberal" ? t.policyL : t.policyF} size={28} /></div>)}</div>
      <p>{kind === "peek" ? (ko ? "보기만 합니다. 순서·내용은 바뀌지 않아요." : "Read only. Order and contents stay the same.") : kind === "president_discard" ? (ko ? "선택한 1장 폐기 → 나머지 2장을 수상에게" : "Discard 1 → pass the remaining 2") : (ko ? "선택한 1장 제정 → 나머지 1장 폐기" : "Enact 1 → discard the other")}</p>
      <span className="guide-button">{kind === "peek" ? t.powerConfirm : kind === "president_discard" ? t.discard : t.enact}</span>
    </> : kind === "vote_result" || kind === "voting" ? <>
      <div className="guide-voters">{[true, false, true].map((ja, i) => <div key={i} className={ja ? "ja" : "nein"}>{kind === "vote_result" && <Portrait avatar={i} />}<strong>{kind === "vote_result" ? `${ko ? "의원" : "Player"} ${i + 1}` : ""}</strong><span>{ja ? t.ja : t.nein}</span></div>)}</div>
      <span className="guide-button">{kind === "vote_result" ? `${t.confirmResult} · 3/5` : (ko ? "카드를 두 번 누르거나 위로 밀기" : "Tap twice or slide up")}</span>
    </> : kind === "night" ? <><div className="guide-role"><Emblem party="liberal" size={34} /><strong>{t.liberal}</strong></div><span className="guide-button">{t.ack}</span></> : kind === "investigate" ? <><div className="guide-role"><Emblem party="fascist" size={34} /><strong>{t.party}: {t.fascist}</strong></div><span className="guide-button">{t.powerConfirm}</span></> : kind === "veto" ? <><p>{ko ? "선거 트래커 ● ● ○ → 부결 또는 거부권 승인 → 혼란" : "Tracker ● ● ○ → failed election / approved veto → chaos"}</p><span className="guide-button">{t.vetoAccept} / {t.vetoReject}</span></> : <><div className="guide-portraits">{[0, 1, 2].map((avatar) => <div key={avatar} className={avatar === 1 ? "chosen" : ""}><Portrait avatar={avatar} /><small>{ko ? "의원" : "Player"} {avatar + 1}</small></div>)}</div><p>{t.target}: {ko ? "의원 2" : "Player 2"}</p><span className="guide-button">{ko ? "대상 확인 → 아래 버튼 길게 누르기" : "Check target → hold the action button"}</span></>}
  </figure>;
}

export function PlayGuide({ t, ko }: { t: Copy; ko: boolean }) {
  return <section className="play-guide">
    <h3>{ko ? "처음이라면: 화면을 따라 한 판 배우기" : "Your first game: a screen-by-screen guide"}</h3>
    <p>{ko ? "대통령·수상은 매번 바뀌는 직책이고, 자유당·파시스트·히틀러는 끝까지 유지되는 비밀 역할이에요. 같은 역할의 편이 승리하는 것이 목표입니다. 토론할 때 거짓말도 할 수 있어요." : "President and Chancellor are rotating offices. Liberal, Fascist and Hitler are secret roles that stay with you. Your goal is your team's victory; lying during discussion is allowed."}</p>
    <p>{ko ? "흐름: 역할 확인 → 수상 지명 → 전원 투표·결과 확인 → 대통령 폐기 → 수상 제정 → 필요하면 대통령 권한 → 다음 선거. 궁금한 단계를 펼치면 실제 카드 모양의 예시를 볼 수 있어요. 예시 내용은 현재 게임의 비밀 정보와 무관합니다." : "Flow: roles → nomination → vote and confirm → President discards → Chancellor enacts → executive power if needed → next election. Expand a step for a sample screen. Examples never use live secret information."}</p>
    {steps.map((step, i) => <details key={step.key} className="guide-step" open={step.key === "peek" ? true : undefined}>
      <summary>{ko ? step.title : `${i + 1}. ${english[i][0]}`}</summary>
      <dl>{[[ko ? "누가" : "Who", ko ? step.who : english[i][1]], [ko ? "무엇을 · 어떻게" : "How", ko ? step.how : english[i][2]], [ko ? "왜" : "Why", ko ? step.why : english[i][3]], [ko ? "다음에는" : "Next", ko ? step.next : english[i][4]]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <Example kind={step.key} t={t} ko={ko} />
    </details>)}
  </section>;
}
