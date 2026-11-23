import { useState } from "react";
import { PracticeGuide } from "./PracticeGuide";

export const FIRST_GAME_TIPS = [
  "준비 시간에는 상점을 둘러볼 수 있어요. 처음에는 아무것도 사지 않아도 됩니다. [정비 완료]를 누르면 상대도 준비한 뒤 대국이 시작돼요.",
  "상단에 “당신의 차례”가 보이면 내 차례예요. [기본 돌] 선택 → 빈 교차점 탭 → [착수 확정] 순서로 돌 하나를 놓아보세요.",
  "돌을 놓았으면 [턴 마치기]를 누르세요. 스킬은 쓰지 않아도 됩니다. 시간 안에 턴을 마쳐야 시간 초과가 쌓이지 않아요.",
  "상대 돌 4개가 한 줄로 이어져 있다면, 다음 돌을 놓을 빈칸을 내 돌로 막아보세요. 내 돌 5개를 먼저 이어도 승리합니다.",
  "석혼은 능력이 있는 돌이에요. 준비 시간에 상점 카드를 눌러 사고, 벤치에서 그 석혼을 골라 보드에 놓으면 사용할 수 있어요.",
  "스킬을 쓰려면 보드의 내 액티브 석혼 → [스킬] → 대상 선택 → [스킬 확정]을 누르세요. ✧ 마나가 부족하면 사용할 수 없어요.",
  "스킬로 새로 열린 5목 완성 자리는 같은 턴에 쓸 수 없어요. 상대에게 한 번 대응할 기회를 준 뒤, 다음 내 차례에 사용할 수 있습니다.",
  "3·7·11라운드에는 증강(추가 능력)을, 4·8·12라운드에는 제단의 무료 석혼을 골라요. 자세한 내용은 상단 [게임 방법]에서 언제든 볼 수 있어요.",
];

export function Rules({
  onClose,
  inGame = false,
}: {
  onClose?: () => void;
  inGame?: boolean;
}) {
  const [mode, setMode] = useState<"practice" | "read">("practice");
  return (
    <>
      <div className="help-mode-switch" role="group" aria-label="배우는 방법">
        <button
          aria-pressed={mode === "practice"}
          onClick={() => setMode("practice")}
        >
          직접 연습
        </button>
        <button aria-pressed={mode === "read"} onClick={() => setMode("read")}>
          설명 읽기
        </button>
      </div>
      {inGame && (
        <p className="help-live-note">
          진행 중인 실제 대국의 타이머는 계속 흘러가요. 이 연습은 시작 화면에서
          먼저 이용하는 것을 권해요.
        </p>
      )}
      {mode === "practice" ? (
        <PracticeGuide onClose={onClose} onRead={() => setMode("read")} />
      ) : (
        <WrittenRules />
      )}
    </>
  );
}
function WrittenRules() {
  return (
    <div className="rules help-guide">
      <section className="help-start" aria-labelledby="help-goal">
        <span className="help-kicker">처음에는 이것만 알아도 돼요</span>
        <h3 id="help-goal">내 돌 5개를 한 줄로 먼저 이으면 승리!</h3>
        <p>
          가로·세로·대각선 중 한 방향으로, 빈칸 없이 이어야 해요. 돌은 선이
          만나는 <strong>교차점</strong>에 놓습니다.
        </p>
        <div
          className="help-five"
          role="img"
          aria-label="내 돌 네 개 옆의 빈자리에 하나를 더 놓아 다섯 개를 잇는 예시"
        >
          {[0, 1, 2, 3].map((i) => (
            <span className="help-example-stone" key={i}>
              ●
            </span>
          ))}
          <span className="help-example-empty">＋</span>
        </div>
        <p className="help-caption">
          이 빈자리에 내 돌을 직접 놓으면 5목 완성입니다.
        </p>
        <p>
          <strong>상점과 스킬은 추가 전략이에요.</strong> 처음에는 무료인{" "}
          <strong>기본 돌</strong>만 사용해도 끝까지 플레이할 수 있어요.
        </p>
      </section>

      <section aria-labelledby="help-first-game">
        <h3 id="help-first-game">첫 판은 이렇게 시작하세요</h3>
        <ol className="help-steps">
          <li>
            <b>혼자 연습하거나 친구를 초대해요.</b>
            <p>
              이름을 입력하고 <strong>사범과 연습</strong>을 누르면 AI와 연습할
              수 있어요. 친구와 하려면 <strong>방 만들기</strong>로 방을 열고,
              초대 링크나 방 코드를 보내세요.
            </p>
          </li>
          <li>
            <b>대기실에서 준비하고 시작해요.</b>
            <p>
              두 사람 모두 <strong>준비 완료</strong>를 누르면 방장이{" "}
              <strong>대국 시작</strong>을 누를 수 있어요. 흑돌이 먼저 두고,
              백돌이 나중에 둡니다. 순서는 무작위로 정해져요.
            </p>
          </li>
          <li>
            <b>준비 시간이 끝나면 내 차례를 기다려요.</b>
            <p>
              처음에는 구매하지 말고 <strong>정비 완료</strong>를 눌러도
              괜찮아요. 상대도 정비를 마치면 바로 진행하고, 그렇지 않으면 준비
              시간이 끝날 때까지 기다려요.
            </p>
          </li>
          <li>
            <b>돌 하나를 놓고 턴을 마쳐요.</b>
            <p>
              상단의 <strong>당신의 차례</strong>를 확인하세요. 아래 순서대로
              누르면 한 턴이 끝납니다.
            </p>
            <p className="help-button-path">
              기본 돌 선택 · 빈 교차점 탭 · <strong>착수 확정</strong> ·{" "}
              <strong>턴 마치기</strong>
            </p>
            <p>
              칸을 잘못 골랐다면 확정하기 전에 다른 빈칸을 누르세요. 스킬은 쓰지
              않아도 됩니다.
            </p>
          </li>
        </ol>
        <p className="help-note">
          처음이라면 시작 화면의 <strong>첫 대국 안내</strong>도 이용해 보세요.
          시간 제한 없이 정해진 상황을 직접 눌러보며 연습할 수 있어요.
        </p>
      </section>

      <section aria-labelledby="help-round">
        <h3 id="help-round">한 라운드는 이렇게 흘러가요</h3>
        <ol className="help-round-flow" aria-label="라운드 진행 순서">
          <li>
            <b>함께 준비</b>
            <span>20초 · 상점 이용</span>
          </li>
          <li>
            <b>흑돌의 차례</b>
            <span>30초 · 돌 하나 놓기</span>
          </li>
          <li>
            <b>백돌의 차례</b>
            <span>30초 · 돌 하나 놓기</span>
          </li>
        </ol>
        <p>
          둘 다 한 수를 두면 골드와 경험치를 받고 다음 라운드로 넘어가요.{" "}
          <strong>내 차례에는 돌 1개가 필수</strong>이고, 스킬은 기본적으로
          1회까지 선택해서 쓸 수 있어요. 스킬을 먼저 써도 되지만, 돌을 놓아야
          턴을 마칠 수 있어요.
        </p>
        <p className="help-note">
          <strong>첫 수의 요령:</strong> 내 돌을 이어가면서 상대의 다음 수를
          살펴보세요. 상대 돌 4개가 이어졌다면, 다섯 번째 돌을 놓을 빈자리를 내
          돌로 막는 것이 우선이에요. 양끝이 모두 비어 있다면 한쪽만 막아서는
          부족할 수 있어요.
        </p>
      </section>

      <h3 className="help-more-heading">익숙해지면 하나씩 펼쳐보세요</h3>
      <details className="help-topic">
        <summary>석혼은 무엇이고, 어떻게 사서 놓나요?</summary>
        <div className="help-topic-body">
          <p>
            <strong>석혼</strong>은 능력이 있는 돌이에요. <strong>벤치</strong>
            는 구매한 석혼을 보관하는 곳이고, 보드 아래에 있어요.
          </p>
          <ol>
            <li>
              준비 시간에 <strong>상점의 카드</strong>를 누르면 표시된 골드를
              내고 구매해요. 예를 들어 <strong>1G는 골드 1개</strong>라는
              뜻이에요.
            </li>
            <li>
              내 차례에 <strong>벤치의 석혼</strong>을 골라요.
            </li>
            <li>
              빈 교차점을 누르고 <strong>착수 확정</strong>을 누르면 그 석혼이
              보드에 놓여요.
            </li>
          </ol>
          <p>
            석혼도 내 돌 하나로 세어서 5목을 만들 수 있어요.{" "}
            <strong>
              구매해서 벤치에 두기만 하면 능력이나 특성이 적용되지 않아요.
            </strong>{" "}
            먼저 보드에 놓아야 해요.
          </p>
          <p>
            벤치는 최대 9칸이에요. 꽉 찼다면 준비 시간에 석혼 아래의{" "}
            <strong>판매</strong>를 눌러 자리를 비울 수 있어요. 구매할 때 실제
            지불한 금액을 돌려받습니다. 무료로 받은 석혼의 판매가는 0G예요.
          </p>
          <p>
            석혼마다 능력이 달라요. 상점의 <strong>ⓘ</strong>를 누르거나 돌을
            길게 누르면 상세 내용을 볼 수 있고, 상단 <strong>석혼 도감</strong>
            에서 전체 목록을 볼 수 있어요.
          </p>
        </div>
      </details>

      <details className="help-topic">
        <summary>마나와 스킬은 어떻게 사용하나요?</summary>
        <div className="help-topic-body">
          <p>
            <strong>마나(✧)</strong>는 스킬을 쓸 때 드는 자원이에요. 골드(◎)와는
            달라요. 기본적으로 내 턴을 마칠 때 2씩 회복하고, 기본 최대치는 내
            레벨 +2예요.
          </p>
          <dl className="help-glossary">
            <div>
              <dt>배치 효과</dt>
              <dd>석혼을 보드에 놓는 순간 자동으로 발동해요.</dd>
            </div>
            <div>
              <dt>패시브</dt>
              <dd>보드에 있는 동안 조건에 맞으면 자동으로 적용돼요.</dd>
            </div>
            <div>
              <dt>액티브</dt>
              <dd>내가 직접 스킬 버튼을 눌러 사용하는 능력이에요.</dd>
            </div>
          </dl>
          <p className="help-button-path">
            보드의 내 액티브 석혼 탭 · <strong>스킬</strong> · 대상 선택 ·{" "}
            <strong>스킬 확정</strong>
          </p>
          <p>
            예를 들어 <strong>번개 술사</strong>를 보드에 놓았다면, 내 차례에
            번개 술사를 누르고 스킬을 선택한 뒤 상대 돌을 지정해 봉인할 수
            있어요.
          </p>
          <p>
            <strong>밀기</strong>는 밀어낼 상대 돌과 인접한 빈 도착 칸을
            순서대로 골라요. <strong>교환</strong>은 아군 돌을 먼저, 상대 돌을
            나중에 골라요. 대상이 필요 없는 스킬은 바로 확정할 수 있어요.
          </p>
          <p>
            <strong>쿨다운</strong>은 다시 쓰기까지 기다리는 차례 수예요. 버튼을
            누를 수 없다면 내 차례인지, 마나가 충분한지, 봉인이나 쿨다운 중인지
            확인하세요. 같은 턴의 스킬을 이미 썼을 수도 있어요.
          </p>
          <p>
            기본 스킬 횟수는 턴당 1회예요. <strong>연쇄 시전</strong> 증강을
            고르면 2회까지 쓸 수 있지만 두 번째 스킬은 마나가 1 더 들어요.
          </p>
        </div>
      </details>

      <details className="help-topic">
        <summary>방패·봉인·토큰은 무슨 뜻인가요?</summary>
        <div className="help-topic-body">
          <dl className="help-glossary">
            <div>
              <dt>방패 ◇</dt>
              <dd>
                제거·이동·봉인·교환 효과를 한 번 막고 사라져요. 방패가 있어도
                상대가 빈자리에 돌을 놓는 것은 막지 못해요.
              </dd>
            </div>
            <div>
              <dt>봉인 封</dt>
              <dd>
                돌은 그 자리에 남지만, 표시된 시간 동안 5목 연결과 특성 계산에서
                빠져요.
              </dd>
            </div>
            <div>
              <dt>토큰 ✧</dt>
              <dd>
                빈칸을 차지하는 임시 소환물이에요. 시간이 지나면 사라지고,
                보통은 5목에 포함되지 않아요. 대지의 정령왕 옆의 아군 토큰만
                연결에 포함될 수 있어요.
              </dd>
            </div>
            <div>
              <dt>제거</dt>
              <dd>
                보드에서 돌을 치워 그 자리를 비워요. 방패가 있다면 먼저 방패만
                깨집니다.
              </dd>
            </div>
          </dl>
        </div>
      </details>

      <details className="help-topic">
        <summary>같은 돌을 모으면 어떻게 강해지나요?</summary>
        <div className="help-topic-body">
          <p>서로 다른 두 가지 성장 방식이 있어요.</p>
          <p>
            <strong>별 합성:</strong> 벤치에 같은 이름의 ★1 석혼이 3개 모이면 ★2
            하나로 자동 합성돼요. 1G짜리 석혼만 ★2 세 개를 모아 ★3까지 합성할 수
            있어요. 일반 합성으로는 2~4G 석혼은 ★2까지, 5G 석혼은 합성하지
            않아요. 일부 증강은 별을 추가로 올려주기도 합니다. 별이 오르면
            능력이 강해져요.
          </p>
          <p>
            <strong>특성:</strong> 보드 위에서 같은 소속을 가진{" "}
            <strong>서로 다른 이름의 석혼</strong>을 모으면 추가 효과가 생겨요.
            벤치에 있는 석혼은 세지 않아요.
          </p>
          <p className="help-note">
            <strong>예시:</strong> 견습 수호병과 방패 기사를 보드에 놓으면 두
            이름 모두 수호자라서 <strong>수호자 2</strong>가 됩니다. 견습
            수호병만 두 개 놓으면 같은 이름이므로 <strong>수호자 1</strong>로
            세어요.
          </p>
          <p>
            모바일에서는 <strong>대국 정보</strong>를 눌러 특성과 상대 정보를
            펼칠 수 있어요. 특성 이름을 누르면 효과를 확인할 수 있습니다. 돌이
            제거되거나 봉인되면 특성 인원이 줄어들 수 있어요.
          </p>
        </div>
      </details>

      <details className="help-topic">
        <summary>골드·레벨·상점은 어떻게 관리하나요?</summary>
        <div className="help-topic-body">
          <p>
            <strong>골드(◎)</strong>는 석혼 구매, 상점 새로고침, 경험치 구매에
            쓰는 돈이에요. 시작할 때 흑돌은 5G, 백돌은 8G를 받아요. 백돌은 시작
            마나도 2 더 받습니다.
          </p>
          <ul>
            <li>
              <strong>라운드가 끝나면:</strong> 기본 5G와 경험치 2XP를 받아요.
              판세가 뒤지면 추가 골드를 받을 수 있어요.
            </li>
            <li>
              <strong>돈을 모으면:</strong> 정산 시 가진 골드 10개당 이자 1G를
              더 받아요. 기본 이자 상한은 5G예요.
            </li>
            <li>
              <strong>새로고침:</strong> 기본 2G를 내고 상점의 석혼 5개를 새로
              뽑아요. 일부 능력으로 비용이 줄어들 수 있어요.
            </li>
            <li>
              <strong>경험치 +4:</strong> 4G를 내고 4XP를 사요. 경험치가 쌓이면
              최대 8레벨까지 올라가고, 비싼 석혼이 상점에 나올 확률과 최대
              마나가 올라가요.
            </li>
          </ul>
          <p>
            각 석혼의 개수는 두 사람이 함께 쓰는 풀에 제한되어 있어요. 상대가
            많이 가져간 석혼은 상점에서 찾기 어려울 수 있습니다.
          </p>
          <p>
            처음부터 돈을 모두 써야 하는 것은 아니에요. 필요한 석혼만 사고,{" "}
            <strong>기본 돌로 수를 이어가며</strong> 천천히 익혀보세요.
          </p>
        </div>
      </details>

      <details className="help-topic">
        <summary>증강과 운명의 제단에서는 무엇을 고르나요?</summary>
        <div className="help-topic-body">
          <p>
            <strong>증강 = 이번 판에 적용되는 추가 능력</strong>이에요.
            3·7·11라운드에 후보 중 하나를 골라요. 예를 들어{" "}
            <strong>비상금</strong>은 즉시 8G, <strong>마나 샘</strong>은 턴
            종료 시 마나 1을 추가로 줍니다. 설명을 읽고 필요한 것을 고르세요.
          </p>
          <p>
            승급 증강은 벤치에 적합한 석혼이 있어야 고를 수 있어요. 선택 창
            아래에서 대상을 지정할 수 있습니다. 일부 증강에는 불이익도 있으니
            효과 전체를 읽어주세요. 고른 증강은 상대에게 공개돼요.
          </p>
          <p>
            <strong>운명의 제단 = 무료 석혼을 번갈아 고르는 시간</strong>이에요.
            4·8·12라운드에 열리며, 두 사람이 같은 석혼 4개를 나눠 가져요.
          </p>
          <p>
            판세가 뒤진 쪽이 1개, 상대가 2개, 다시 뒤진 쪽이 1개를 골라요.
            동점이면 백돌이 먼저 골라요.{" "}
            <strong>화면에 표시된 선택자 이름</strong>이 내 이름일 때 카드를
            누르세요.
          </p>
        </div>
      </details>

      <details className="help-topic">
        <summary>스킬로 판을 바꾸면 왜 바로 이길 수 없나요?</summary>
        <div className="help-topic-body">
          <p>
            <strong>직접 돌을 놓아 만든 5목은 바로 승리</strong>해요. 다만
            스킬로 갑자기 승부가 끝나지 않도록, 상대에게 한 차례 대응할 기회를
            주는 <strong>예고 규칙</strong>이 있어요.
          </p>
          <ol>
            <li>
              <strong>
                스킬로 새로 열린 5목 완성 자리는 같은 턴에 사용할 수 없어요.
              </strong>{" "}
              예를 들어 내 돌 4개를 막고 있던 상대 돌을 제거했다면, 그 빈자리에
              곧바로 돌을 놓아 이길 수 없어요. 다른 칸에 한 수를 두고 턴을 마친
              뒤, 상대 차례가 지나야 사용할 수 있어요.
            </li>
            <li>
              <strong>
                스킬 자체로 5목이 만들어져도 바로 승리하지 않아요.
              </strong>{" "}
              상대 차례가 끝나고 다음 내 차례가 시작될 때에도 그 5목이
              유지되어야 승리해요.
            </li>
            <li>
              <strong>
                상대의 5목 완성 자리를 토큰이나 밀기로 막을 수 없어요.
              </strong>{" "}
              그 자리에 직접 내 돌을 놓아 막거나, 상대 라인의 보호되지 않은 돌을
              봉인·제거해야 해요.
            </li>
            <li>
              <strong>방금 놓은 돌은 다음 상대 차례 동안 보호돼요.</strong> 상대
              스킬의 대상으로 바로 지우거나 움직일 수 없어요.
            </li>
            <li>
              <strong>추가 착수 스킬의 돌로는 5목을 완성할 수 없어요.</strong>{" "}
              기본 착수와 구분해 사용해야 해요.
            </li>
          </ol>
          <p className="help-note">
            처음에는 복잡한 스킬보다{" "}
            <strong>상대의 빈자리를 기본 돌로 직접 막는 방법</strong>부터
            연습하면 좋아요.
          </p>
        </div>
      </details>

      <details className="help-topic">
        <summary>돌을 놓을 수 없거나 시간이 끝나면 어떻게 되나요?</summary>
        <div className="help-topic-body">
          <p>
            <strong>돌을 놓을 수 없을 때:</strong> 내 차례인지, 빈 교차점인지,
            이번 턴에 이미 돌을 놓았는지 확인하세요. 예고 규칙으로 잠시 금지된
            자리일 수도 있어요.
          </p>
          <p>
            <strong>시간이 끝났을 때:</strong> 아직 돌을 놓지 않았다면 서버가
            대신 한 수를 두고 턴을 마쳐요. 이미 놓았어도 턴을 마치지 않아 시간이
            끝나면 시간 초과가 쌓여요. <strong>누적 3회면 기권</strong>입니다.
          </p>
          <p>
            <strong>연결이 끊겼을 때:</strong> 같은 브라우저에서 다시 접속하면
            서버에 남아 있는 좌석을 복구해요. 접속이 끊겨도 타이머는 멈추지
            않으며, 서버가 재시작됐다면 이전 대국은 복구되지 않아요.
          </p>
          <p>
            <strong>다섯 개처럼 보이는데 승리하지 않을 때:</strong> 한 줄로 빈칸
            없이 이어졌는지, 봉인된 돌이나 일반 토큰이 섞였는지 확인하세요.
            스킬로 만든 5목이라면 상대의 대응이 끝날 때까지 기다려야 합니다.
          </p>
          <p>
            6개 이상 이어도 승리하고, 특정 자리의 착수를 금지하는 일반 오목의
            금수 규칙은 없어요. 상대의 상점·벤치 내용·증강 후보는 비공개입니다.
          </p>
        </div>
      </details>

      <details className="help-topic">
        <summary>조작 설정과 키보드 단축키</summary>
        <div className="help-topic-body">
          <p>
            위 설명은 기본 설정인 <strong>미리보기 후 확정</strong> 기준이에요.
            설정에서 <strong>한 번 탭으로 착수</strong>를 켜면 빈칸을 누르는
            즉시 돌이 놓이니 주의하세요.
          </p>
          <p>
            키보드에서는 <strong>1~5</strong> 상점 구매, <strong>D</strong>{" "}
            새로고침, <strong>F</strong> 경험치 구매, <strong>Space</strong>{" "}
            착수·스킬 확정 또는 턴 종료, <strong>Q/W</strong> 선택한 석혼의
            스킬, <strong>Esc</strong> 취소를 사용할 수 있어요.
          </p>
        </div>
      </details>
    </div>
  );
}
