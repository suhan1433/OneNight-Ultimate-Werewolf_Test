import { gameAudio } from './audio-settings';
import { useState } from 'react';
import type { Card } from './types';
import { getFx, markTutorialSeen, setFx } from './lib';
import { CardFace, MarkerRail, TaskToken } from './ui';
import { HelpExample } from './HelpExample';
import type { Spot } from './lib';

const sample = (suit: Card['suit'], value: number): Card => ({ id: `help-${suit}${value}`, suit, value });
const Demo = ({ card, note, spot }: { card: Card; note: string; spot?: Spot }) => <figure><span className="with-rail"><CardFace card={card} size="sm" />{spot && <MarkerRail spot={spot} still />}</span><figcaption>{note}</figcaption></figure>;

/** 도움말 본문(서랍 · 튜토리얼 공용 문구) */
export function HelpBody() {
  const [fx, setLocal] = useState(getFx());
  const toggle = (k: 'haptic') => { setFx({ [k]: !fx[k] }); setLocal(getFx()); };
  return <div className="help">
    <details open><summary>한 판의 흐름</summary>
      <p>더 크루는 모두가 한 팀인 협력 카드 게임이에요. 미션에 적힌 ‘과제 카드’를 정해진 사람이 따내면 모두 함께 성공해요.</p>
      <ol><li><b>모이기</b> 방 코드를 공유하고 모두 ‘준비 완료’를 누르면 방장이 시작해요.</li><li><b>과제 나누기</b> 과제 카드가 테이블에 펼쳐져요. 커맨더부터 차례로 맡을 카드를 눌러 가져가요. 이때도 내 손패가 아래에 보여요.</li><li><b>카드 내기</b> 한 사람이 한 장씩 내면 ‘트릭’ 한 판이에요. 로켓이 나왔다면 가장 큰 로켓이, 없다면 처음 나온 색 중 가장 큰 숫자가 이겨요. 이긴 사람이 카드들을 모두 가져가고 다음 트릭을 시작해요.</li><li><b>끝내기</b> 과제를 모두 끝내면 손패가 남아도 함께 성공해요. 특수 목표가 있는 미션은 해당 목표도 지켜야 해요.</li></ol>
      <p className="tip">실패는 이럴 때 나요: 내 과제 카드를 다른 사람이 가져갔을 때, 순서 표시를 어겼을 때. 실패해도 같은 미션에 다시 도전할 수 있어요.</p></details>
    <details open><summary>3인 예시 플레이 · 차근차근 따라가기</summary><HelpExample /></details>
    <details><summary>카드 내는 법</summary>
      <p>색 카드 4가지(분홍 ●, 파랑 ▲, 초록 ■, 노랑 ★)는 1~9, 로켓 🚀은 1~4예요.</p>
      <ul><li>먼저 나온 카드와 <b>같은 색이 있으면 반드시 그 색</b>을 내요.</li><li>같은 색이 없으면 <b>아무 카드나</b> 낼 수 있어요.</li><li>같은 색끼리는 <b>큰 숫자</b>가 이겨요. <b>로켓은 가장 강해요.</b></li><li>내 차례에는 <b>밝게 빛나는 카드</b>만 낼 수 있어요. 어두운 카드는 지금 낼 수 없어요.</li><li>카드를 먼저 선택한 뒤 ‘이 카드 내기’로 확정해요. 모바일에서는 선택한 카드를 한 번 더 눌러도 낼 수 있어요. 키보드는 ←→로 카드를 옮기고 Enter로 선택해요.</li></ul>
      <div className="demo"><Demo card={sample('B', 5)} note="먼저 나온 카드" /><Demo card={sample('B', 3)} note="같은 색이라 낼 수 있음" /><Demo card={sample('R', 1)} note="파랑이 없을 때 이김" /></div></details>
    <details><summary>과제와 통신</summary>
      <dl className="terms"><dt><span className="token">1</span><span className="token">2</span></dt><dd>순서 표시. 작은 번호부터 달성해요.</dd><dt><span className="token">›</span><span className="token">››</span></dt><dd>화살표 표시. › 다음에 ›› 순서예요.</dd><dt><span className="token">Ω</span></dt><dd>가장 마지막에 달성해요.</dd></dl>
      <p>카드 이야기는 말로 할 수 없어요. 대신 미션마다 한 번, 카드 한 장을 공개해 단서를 줘요.</p>
      <ul><li>트릭의 <b>첫 카드가 놓이기 전</b>이라면 차례와 상관없이, 아직 통신하지 않은 사람 누구나 <b>📡 통신하기</b>를 누를 수 있어요. 첫 카드가 놓이면 창이 닫혀요. 모두가 ‘완료’를 누를 필요는 없어요.</li><li>공개할 수 있는 카드는 색 카드 중 <b>가장 높은·가장 낮은·한 장뿐인</b> 카드예요. 로켓은 안 돼요.</li><li>마커 위치: <b>맨 위 = 가장 높음, 가운데 = 유일, 맨 아래 = 가장 낮음</b>.</li></ul>
      <div className="demo"><Demo card={sample('G', 7)} spot="top" note="맨 위: 초록 중 가장 높아요" /><Demo card={sample('Y', 4)} spot="mid" note="가운데: 노랑은 이 한 장뿐" /><Demo card={sample('B', 2)} spot="bottom" note="맨 아래: 파랑 중 가장 낮아요" /></div></details>
    <details><summary>화면 보는 법</summary>
      <ul><li><b>청록 링</b>이 둘러싼 좌석이 지금 차례예요. 아래 한 줄 안내에도 같은 내용이 적혀요.</li><li><b>좌석</b>에는 남은 카드 수, 딴 트릭 수, 맡은 과제 카드(작게), 통신 슬롯이 붙어요. ⌖ 표시는 커맨더예요.</li><li><b>테이블 중앙</b>에 이번 트릭의 카드가 놓여요. 트릭이 끝나면 모든 카드가 보인 뒤 이긴 카드에 렌즈가 비치고, 카드가 승자 쪽으로 쓸려가요. 이 동안은 손패를 낼 수 없어요.</li><li>모바일 승무원 목록의 위치는 고정돼요. 왼쪽 숫자는 이번 진행 순서, ▶는 현재 차례, ✓는 카드를 낸 승무원을 뜻해요.</li><li><b>오른쪽 위 ?</b>를 누르면 현재 미션 정보와 도움말을 볼 수 있어요.</li><li>대기실의 <b>좌석 표시등</b>: 청록은 준비 완료, 황동은 준비 중, 꺼지면 연결 끊김이에요. 미션 지도의 ✦는 이 기기에서 성공한 미션이에요.</li></ul></details>
    <details><summary>자주 묻는 질문</summary>
      <p><b>다른 사람 카드를 볼 수 있나요?</b> 아니요. 남은 장수만 보여요. 그래서 통신이 중요해요.</p>
      <p><b>커맨더는요?</b> 첫 트릭을 시작하고 과제를 가장 먼저 골라요. 일부 미션에서는 대상 승무원을 지정해요.</p>
      <p><b>연결이 끊기거나 새로고침했어요.</b> 같은 기기·브라우저로 다시 열면 자동으로 이어서 들어가요.</p>
      <p><b>나가기를 누르면요?</b> 방에서 나가 첫 화면으로 돌아가요. 진행 중이면 한 번 더 확인해요.</p></details>
    <details><summary>설정</summary>
      <button type="button" onClick={gameAudio.openSettings}>음향 설정 · 전체 음량 / 배경음 / 효과음</button>
      <label className="check"><input type="checkbox" checked={fx.haptic} onChange={() => toggle('haptic')} /> 진동 켜기 (기본 꺼짐, 지원 기기만)</label></details>
  </div>;
}

/** 처음 접속 시 한 번만 보이는 4장짜리 튜토리얼 */
export function Tutorial({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const finish = () => { markTutorialSeen(); onDone(); };
  const slides = [
    { h: '같은 팀, 같은 목표', p: '서로 이기는 게임이 아니에요. 미션의 과제 카드를 정해진 사람이 따내면 모두 성공해요.', demo: <div className="demo"><span className="task-chip"><CardFace card={sample('P', 6)} size="md" /><TaskToken task={{ ...sample('P', 6), ownerId: null, done: false, order: 1 }} /></span><span className="task-chip"><CardFace card={sample('Y', 2)} size="md" /></span></div> },
    { h: '카드는 이렇게 내요', p: '먼저 나온 색이 손에 있으면 반드시 같은 색을 내요. 없으면 아무 카드나, 로켓🚀은 가장 강해요. 낼 수 있는 카드만 밝게 빛나요.', demo: <div className="demo"><Demo card={sample('B', 5)} note="먼저 나온 카드" /><Demo card={sample('B', 3)} note="같은 색을 내요" /><Demo card={sample('R', 1)} note="로켓은 최강" /></div> },
    { h: '말 대신 통신', p: '트릭의 첫 카드가 놓이기 전, 누구나 한 번 카드를 공개해 단서를 줄 수 있어요. 마커가 맨 위면 가장 높은 카드, 가운데면 유일한 카드, 맨 아래면 가장 낮은 카드예요.', demo: <div className="demo"><Demo card={sample('G', 7)} spot="top" note="가장 높음" /><Demo card={sample('Y', 4)} spot="mid" note="유일함" /><Demo card={sample('B', 2)} spot="bottom" note="가장 낮음" /></div> },
    { h: '3초 안에 내 할 일 찾기', p: '청록 링이 켜진 좌석이 지금 차례예요. 손패 위의 한 줄 안내가 내가 할 일을 알려줘요.', demo: <div className="demo col"><span className="mini-seat"><span className="av"><span className="avatar">루</span><span className="turn-ring" /></span><b>루나</b><em className="turn-tag">차례</em></span><p className="status t-act"><b>▶ 내 차례 · 빛나는 카드 중 한 장을 내세요</b></p></div> },
  ];
  const s = slides[i];
  return <div className="layer tut-layer"><section className="paper tut" role="dialog" aria-modal="true" aria-label="처음 시작하기">
    <button type="button" className="x" onClick={finish} aria-label="튜토리얼 건너뛰기">건너뛰기</button>
    <h2>{s.h}</h2><p>{s.p}</p>{s.demo}
    <div className="tut-nav"><span className="dots" aria-label={`${i + 1} / ${slides.length}`}>{slides.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</span>
      {i > 0 && <button type="button" onClick={() => setI(i - 1)}>이전</button>}
      {i < slides.length - 1 ? <button type="button" className="primary" autoFocus onClick={() => setI(i + 1)}>다음</button> : <button type="button" className="primary" autoFocus onClick={finish}>시작하기</button>}</div>
  </section></div>;
}
