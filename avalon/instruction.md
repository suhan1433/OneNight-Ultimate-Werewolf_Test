한밤의 늑대인간 온라인 웹게임

AI Coding Agent용 최종 구현 프롬프트

⸻

0. 프로젝트 목표

보드게임 **One Night Ultimate Werewolf(한밤의 늑대인간)**의 게임 진행을 웹 기반 실시간 멀티플레이 게임으로 구현한다.

목표는 다음 전체 과정을 자동화하는 것이다.

방 생성
  ↓
역할 구성
  ↓
플레이어 입장
  ↓
준비 완료
  ↓
게임 시작
  ↓
역할 카드 랜덤 배정
  ↓
카드 확인
  ↓
밤 페이즈
  ├─ 역할별 순차 진행
  ├─ 사회자 음성 안내
  ├─ 개인 행동 UI
  └─ 행동 시간 제한
  ↓
낮 페이즈
  ├─ 사용 역할 목록 공개
  ├─ 밤 행동 순서 공개
  ├─ 토론
  └─ 타이머
  ↓
투표
  ↓
결과 공개
  ├─ 최종 역할
  ├─ 처형자
  ├─ 투표 결과
  └─ 승리 진영
  ↓
다시하기

핵심 요구사항:

1. 실시간 멀티플레이
2. 모바일 우선 UI
3. 서버가 게임 상태의 Single Source of Truth
4. 클라이언트에는 자신에게 필요한 정보만 전달
5. 치팅 방지
6. Node.js 서버 여러 대로 수평 확장 가능
7. Redis 기반 분산 상태 관리
8. Socket.io 기반 실시간 통신
9. 밤 페이즈 완전 자동 진행
10. 사회자 음성은 모든 플레이어가 동일하게 듣도록 구현
11. 각 역할 행동은 설정된 최대 시간(기본 5초) 후 자동 종료
12. 도움말에서 모든 역할 설명 및 승리 조건 확인 가능
13. 낮 화면에서 해당 게임에 사용된 역할과 밤 행동 순서를 모두 공개

⸻

1. 기술 스택

Frontend

* React
* TypeScript
* Vite
* Zustand
* TailwindCSS
* Framer Motion
* Socket.io Client

Backend

* Node.js
* TypeScript
* Express
* Socket.io

Distributed Infrastructure

* Redis
* Redis Pub/Sub
* Socket.io Redis Adapter
* Redis 기반 Room/Game State 저장
* Redis 기반 분산 락 또는 턴 실행 제어

선택 기술

* Zod: Socket 이벤트 및 API 입력 검증
* Pino: 구조화 로그
* Vitest: Unit Test
* Playwright: E2E Test

⸻

2. 프로젝트 구조

다음과 같이 Frontend와 Backend를 분리한다.

werewolf-game/
│
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── features/
│   │   │   │   ├── lobby/
│   │   │   │   ├── cardReveal/
│   │   │   │   ├── night/
│   │   │   │   ├── day/
│   │   │   │   ├── voting/
│   │   │   │   ├── result/
│   │   │   │   └── help/
│   │   │   ├── store/
│   │   │   ├── socket/
│   │   │   ├── constants/
│   │   │   └── types/
│   │   └── ...
│   │
│   └── server/
│       ├── src/
│       │   ├── server.ts
│       │   ├── socket/
│       │   │   ├── roomHandlers.ts
│       │   │   ├── gameHandlers.ts
│       │   │   ├── chatHandlers.ts
│       │   │   └── connectionHandlers.ts
│       │   ├── game/
│       │   │   ├── engine/
│       │   │   ├── roles/
│       │   │   ├── night/
│       │   │   ├── voting/
│       │   │   └── victory/
│       │   ├── services/
│       │   │   ├── gameStateService.ts
│       │   │   ├── roomService.ts
│       │   │   ├── turnService.ts
│       │   │   └── redisService.ts
│       │   ├── middleware/
│       │   └── types/
│       └── ...
│
├── packages/
│   └── shared/
│       ├── types/
│       ├── constants/
│       ├── roles/
│       └── events/
│
├── docker-compose.yml
├── package.json
└── README.md

Frontend와 Backend에서 공통으로 사용하는 타입은 packages/shared에 둔다.

⸻

3. 게임 데이터 모델

Player

interface Player {
  id: string;
  nickname: string;
  socketId: string | null;
  originalRole: RoleType;
  currentRole: RoleType;
  isReady: boolean;
  hasConfirmedCard: boolean;
  hasActedTonight: boolean;
  vote: string | null;
  connected: boolean;
}

⸻

4. Room

interface Room {
  roomCode: string;
  hostId: string;
  players: Player[];
  selectedRoles: RoleType[];
  centerCards: CenterCard[];
  phase:
    | "lobby"
    | "card_reveal"
    | "night"
    | "day"
    | "voting"
    | "result";
  nightActionQueue: NightAction[];
  currentNightActionIndex: number;
  currentNightAction: NightAction | null;
  actionTimeLimitSeconds: number;
  dayTimeLimitSeconds: number;
  ttsEnabled: boolean;
  nightLog: NightActionLog[];
  votes: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

⸻

5. 역할 타입

type RoleType =
  | "werewolf"
  | "alpha_wolf"
  | "mystic_wolf"
  | "dream_wolf"
  | "minion"
  | "apprentice_tanner"
  | "seer"
  | "apprentice_seer"
  | "robber"
  | "witch"
  | "troublemaker"
  | "drunk"
  | "insomniac"
  | "journalist"
  | "doppelganger"
  | "shield_bearer"
  | "villager"
  | "mason"
  | "hunter"
  | "bodyguard"
  | "prince"
  | "cursed"
  | "tanner";

⸻

6. 역할 정의를 데이터 기반으로 관리

역할별 로직을 React 컴포넌트나 Socket Handler에 하드코딩하지 않는다.

다음과 같은 Role Definition 구조를 사용한다.

interface RoleDefinition {
  id: RoleType;
  name: string;
  description: string;
  faction: "village" | "werewolf" | "neutral";
  nightOrder: number | null;
  nightAction:
    | "none"
    | "inspect_player"
    | "inspect_center"
    | "inspect_players"
    | "swap_player"
    | "swap_players"
    | "swap_center"
    | "protect"
    | "confirm";
  winCondition: string;
  canActAtNight: boolean;
}

역할 설명과 승리 조건은 별도의 상수 파일에서 관리한다.

packages/shared/roles/roleDefinitions.ts

이 데이터를 다음 UI에서 공통으로 사용한다.

* 도움말
* 역할 카드
* 밤 행동 안내
* 결과 화면
* 역할 선택 화면

⸻

7. 방 생성

방장은 다음을 설정한다.

인원

3~10명

선택된 인원:

5명

이면 필요한 역할 카드:

5 + 3 = 8장

⸻

8. 역할 선택

역할 카드 선택 UI를 제공한다.

예:

🐺 늑대인간
🐺 대장 늑대
🔮 예언자
🃏 도둑
🍺 주정뱅이
😈 무두장이
👨 마을사람
...

선택 카운터:

현재 6 / 8장 선택

정확히 인원 + 3장이 선택되어야 게임 시작 가능하다.

역할 중복 선택도 지원한다.

예:

늑대인간 x2
마을사람 x3
예언자 x1
도둑 x1
주정뱅이 x1

⸻

9. 프리셋

다음과 같은 프리셋을 제공한다.

입문자용
추리 중심
늑대 다수
혼돈형
초보자 추천

프리셋은 단순히 selectedRoles를 채우는 기능으로 구현한다.

⸻

10. 방 코드

방 생성 시 6자리 영문/숫자 코드 생성.

예:

A7K29P

충돌 시 다시 생성한다.

⸻

11. 로비

플레이어는:

방 코드 입력
닉네임 입력
입장

할 수 있다.

로비 화면:

┌─────────────────────────┐
│        방 코드           │
│         A7K29P           │
│                          │
│ 👑 수한                  │
│ 🧑 철수                  │
│ 🧑 영희                  │
│ 🧑 민수                  │
│                          │
│ [준비 완료]              │
│                          │
│ 방장 설정                │
│ 밤 행동 시간: 5초        │
│ 낮 토론 시간: 5분        │
│ 사회자 음성: ON          │
│                          │
│ [게임 시작]              │
└─────────────────────────┘

게임 시작 조건:

현재 인원 == 설정 인원
AND
모든 플레이어 ready

⸻

12. 사회자 음성 정책

매우 중요

사회자 음성은 모든 플레이어가 동일한 음성을 듣도록 한다.

역할별 개인 지시 음성을 따로 보내지 않는다.

밤 진행 예:

"밤이 되었습니다. 모두 눈을 감아주세요."
"도플갱어, 눈을 뜨세요."
"도플갱어는 한 명의 플레이어를 선택하세요."
"방패병, 눈을 뜨세요."
"방패병은 한 명의 플레이어를 보호하세요."
"늑대인간, 눈을 뜨세요."
"늑대인간은 서로를 확인하세요."
"예언자, 눈을 뜨세요."
"예언자는 플레이어 한 명 또는 센터카드 두 장을 확인하세요."

이 음성은 모든 연결된 플레이어에게 동일하게 전달된다.

단, 행동 UI와 결과 데이터는 해당 역할 플레이어에게만 전달한다.

즉:

                 ┌─ 전체 플레이어 → 사회자 음성
Server ──────────┤
                 └─ 해당 역할 플레이어 → 개인 행동 UI/정보

⸻

13. TTS 구현

기본:

window.speechSynthesis

를 사용한다.

사회자 음성 스크립트는:

packages/shared/constants/narratorLines.ts

에서 관리한다.

예:

const narratorLines = {
  nightStart:
    "밤이 되었습니다. 모두 눈을 감아주세요.",
  seerStart:
    "예언자, 눈을 뜨세요.",
  seerAction:
    "예언자는 플레이어 한 명 또는 센터카드 두 장을 확인하세요."
};

⸻

14. TTS 동기화

서버가 다음 이벤트를 전송한다.

{
  type: "NARRATOR_SPEECH",
  text: "예언자, 눈을 뜨세요.",
  actionId: "night-12",
  timestamp: ...
}

모든 클라이언트는 해당 이벤트를 받으면 자신의 TTS 엔진으로 같은 문장을 재생한다.

중요:

* 서버에서 개인별 다른 음성을 보내지 않는다.
* 동일한 text를 모든 클라이언트에 전달한다.
* 각 클라이언트에서 동일한 문장을 TTS한다.
* TTS 재생 여부는 개인별 ttsEnabled 설정으로 끌 수 있다.
* 한 명이 TTS를 꺼도 다른 사람에게 영향을 주지 않는다.

⸻

15. 밤 행동 시간 제한

기본 행동 시간:

5초

방장이 설정 가능:

3초
5초
10초
15초

등의 옵션을 제공한다.

예:

밤 행동 제한시간
[ 5초 ▼ ]

⸻

16. 밤 행동 타이머의 핵심 규칙

각 밤 행동은 반드시 서버에서 시간을 관리한다.

클라이언트 타이머만 믿지 않는다.

예:

08:00:00.000
역할 행동 시작
08:00:05.000
행동 시간 종료

5초 안에 행동하면:

행동 결과 저장
→ 다음 역할

5초 안에 행동하지 않으면:

자동 PASS
→ 다음 역할

즉:

action completed
OR
action timeout
        ↓
다음 night action

⸻

17. 서버 authoritative timer

다음과 같은 구조를 사용한다.

interface NightAction {
  id: string;
  role: RoleType;
  playerIds: string[];
  order: number;
  startedAt: number;
  expiresAt: number;
  status:
    | "pending"
    | "active"
    | "completed"
    | "timeout"
    | "skipped";
}

서버가:

expiresAt = Date.now() + actionTimeLimitSeconds * 1000

를 생성한다.

클라이언트는 expiresAt을 기준으로 UI 타이머를 표시한다.

⸻

18. 서버 타이머 안정성

Node.js의 단순 setTimeout()만 사용하여 게임 진행을 의존하지 않는다.

멀티 서버 환경에서 서버가 재시작되거나 요청이 다른 서버로 들어와도 게임이 계속 진행되어야 한다.

따라서:

Redis에 currentNightAction 저장
Redis에 expiresAt 저장

한다.

각 서버는 만료 여부를 확인할 수 있어야 한다.

예:

Redis
room:A7K29P
  phase = night
  currentActionIndex = 8
  expiresAt = 178...

⸻

19. 멀티 서버 구조

최종 배포 구조는 다음과 같다.

                    ┌───────────────┐
                    │ Load Balancer │
                    └───────┬───────┘
                            │
               ┌────────────┼────────────┐
               │            │            │
               ▼            ▼            ▼
          Node Server 1 Node Server 2 Node Server 3
               │            │            │
               └────────────┼────────────┘
                            │
                     ┌──────▼──────┐
                     │    Redis    │
                     │             │
                     │ Game State  │
                     │ Pub/Sub     │
                     │ Lock        │
                     └─────────────┘

⸻

20. Socket.io 멀티 서버

Socket.io Redis Adapter를 사용한다.

각 Node 서버가 독립적으로 실행되어도:

Server 1의 socket
Server 2의 socket
Server 3의 socket

이 서로 같은 room에 있는 플레이어에게 이벤트를 전달할 수 있어야 한다.

예:

io.adapter(createAdapter(pubClient, subClient));

⸻

21. Socket.io Room

Socket.io의 room과 게임 Room을 구분한다.

예:

game room:
A7K29P
socket room:
game:A7K29P

플레이어 입장:

socket.join(`game:${roomCode}`);

⸻

22. 게임 상태 저장

게임 상태를 Node.js 메모리에만 저장하지 않는다.

잘못된 구조:

const rooms = new Map();

이 구조는 멀티 서버에서 사용하지 않는다.

반드시:

Redis

를 기준으로 한다.

예:

game:room:A7K29P

Redis Hash 또는 JSON 형태로 저장한다.

⸻

23. 게임 상태 변경 원칙

게임 상태 변경은 반드시 서버에서 한다.

클라이언트:

"나는 예언자이고 A를 확인했다"

를 직접 상태로 반영하지 않는다.

클라이언트:

NIGHT_ACTION_SUBMIT

이벤트만 서버에 전송한다.

서버가:

1. 현재 phase 확인
2. 현재 action 확인
3. 요청 socket의 player 확인
4. 해당 player가 해당 역할 소유자인지 확인
5. 선택 대상 유효성 확인
6. 행동 가능 여부 확인
7. 게임 상태 변경
8. Redis 저장
9. 필요한 이벤트 broadcast

순서로 처리한다.

⸻

24. 분산 Lock

멀티 서버에서 동일한 밤 행동이 동시에 처리되는 것을 방지한다.

예:

Server 1:
action timeout 처리
Server 2:
player action 제출 처리

가 동시에 발생할 수 있다.

따라서:

lock:game:A7K29P:night-action:12

형태의 Redis Lock을 사용한다.

한 번의 action transition은 반드시 atomic하게 처리한다.

⸻

25. 밤 페이즈 시작

게임 시작:

selectedRoles shuffle

후:

players = 역할 카드 배정
centerCards = 남은 3장

한다.

⸻

26. 카드 배정

예:

플레이어 5명
역할 카드 8장
Player A → 늑대인간
Player B → 예언자
Player C → 도둑
Player D → 마을사람
Player E → 주정뱅이
Center 1 → 늑대인간
Center 2 → 무두장이
Center 3 → 마을사람

카드는 서버에서 shuffle한다.

클라이언트에서 랜덤 배정하지 않는다.

⸻

27. 카드 확인

카드:

[ 뒤집힌 카드 ]

탭:

3D flip

으로 공개.

Framer Motion:

rotateY

사용.

본인의 역할만 확인 가능하다.

⸻

28. 카드 정보 보안

서버는 일반 게임 상태에 전체 역할을 넣어서 모든 클라이언트에 broadcast하지 않는다.

잘못된 방식:

io.to(room).emit("GAME_STATE", {
  players: players
});

여기에 originalRole과 currentRole을 그대로 포함하지 않는다.

⸻

29. Player View / Admin View / Public View

서버에서 상태를 view model로 변환한다.

buildPublicGameState(room)
buildPlayerGameState(room, playerId)
buildHostGameState(room, playerId)

예:

PlayerGameState {
  self: {
    originalRole,
    currentRole
  },
  publicPlayers: [
    {
      id,
      nickname
    }
  ],
  phase,
  currentNightAction,
  expiresAt
}

타인의 비공개 역할은 포함하지 않는다.

⸻

30. 밤 행동 순서

밤 행동은 반드시 다음 순서로 진행한다.

1. 도플갱어
2. 방패병
3. 늑대인간
4. 대장 늑대
5. 신비한 늑대
6. 하수인
7. 견습 무두장이
8. 예언자
9. 견습 예언자
10. 도둑
11. 마법사
12. 말썽쟁이
13. 주정뱅이
14. 불면증 환자
15. 신문기자

⸻

31. 매우 중요한 밤 진행 규칙

역할이 선택되지 않았더라도:

해당 역할이 이번 게임의 selectedRoles에 포함되어 있고 밤 행동 역할이라면 반드시 밤 순서에 등장한다.

즉:

선택된 역할:
늑대인간
예언자
도둑
주정뱅이
마을사람

이면 실제 플레이어 중 해당 역할이 없더라도:

늑대인간 → 행동
예언자 → 행동
도둑 → 행동
주정뱅이 → 행동

순서가 진행되어야 한다.

단, 그 역할을 실제로 가진 플레이어가 없다면:

해당 역할 행동 UI 없음
자동 PASS

한다.

⸻

32. 낮 화면에 밤 순서 공개

낮 페이즈가 시작되면 모든 플레이어에게 이번 게임에서 사용된 역할과 밤 행동 순서를 보여준다.

예:

🌞 낮이 되었습니다
이번 게임의 밤 순서
① 도플갱어
② 방패병
③ 늑대인간
④ 대장 늑대
⑤ 신비한 늑대
⑥ 하수인
⑦ 견습 무두장이
⑧ 예언자
⑨ 견습 예언자
⑩ 도둑
⑪ 마법사
⑫ 말썽쟁이
⑬ 주정뱅이
⑭ 불면증 환자
⑮ 신문기자

단, 실제 게임에서 선택되지 않은 역할은 표시하지 않는다.

예:

선택된 역할:
늑대인간
예언자
도둑
주정뱅이
마을사람

이면:

① 늑대인간
② 예언자
③ 도둑
④ 주정뱅이

처럼 표시한다.

즉 selectedRoles 중 nightOrder !== null인 역할을 nightOrder 순서로 정렬한다.

이 정보는 낮에는 모두에게 공개한다.

⸻

33. 낮 화면 UI

낮 화면 상단:

☀️ DAY
남은 토론 시간
04:32

중간:

[ 이번 게임의 역할 ]
🐺 늑대인간
🔮 예언자
🃏 도둑
🍺 주정뱅이
👨 마을사람

그리고:

[ 밤 행동 순서 ]
① 늑대인간
② 예언자
③ 도둑
④ 주정뱅이

역할 카드를 클릭하면 간단한 설명을 볼 수 있도록 한다.

⸻

34. 도움말 버튼

모든 주요 게임 화면의 오른쪽 위에 작고 눈에 잘 띄지 않는 도움말 버튼을 배치한다.

예:

                    [?]

모바일에서도 터치하기 쉽도록 실제 hit area는 최소 40~44px 정도로 한다.

⸻

35. 도움말 화면

? 버튼을 누르면 Help Modal / Bottom Sheet를 연다.

탭:

게임 규칙
역할 설명
승리 조건

⸻

36. 역할 설명 화면

모든 역할을 카드 형태로 표시한다.

예:

🐺 늑대인간
진영:
늑대 진영
밤 행동:
다른 늑대인간을 확인합니다.
승리 조건:
늑대 진영의 승리 조건을 만족해야 합니다.

각 역할에:

이름
아이콘
진영
능력
밤 행동
승리 조건

을 표시한다.

⸻

37. 도움말은 게임 상태와 독립

도움말은 게임 진행 중 언제든 열 수 있어야 한다.

단:

* 다른 플레이어의 역할을 공개하지 않는다.
* 현재 자신의 역할 정보와 혼동하지 않는다.
* 역할 설명 자체는 공개 정보이므로 누구나 볼 수 있다.

⸻

38. 밤 화면

밤 화면은 다크 판타지 테마.

🌙
밤이 되었습니다.

페이즈 전환:

fade
blur
scale

애니메이션.

1.5~2초 정도.

⸻

39. 밤 역할 안내

예:

┌─────────────────────────┐
│                         │
│       🐺 늑대인간        │
│                         │
│     눈을 뜨세요.         │
│                         │
│ 다른 늑대인간을           │
│ 확인하세요.              │
│                         │
│        4.2초              │
│                         │
│     [ 행동완료 ]          │
└─────────────────────────┘

단, 이 UI는 해당 역할을 가진 플레이어에게만 표시한다.

다른 플레이어:

🌙
다음 역할이 행동 중입니다.
잠시 기다려주세요.
● ● ●

⸻

40. 사회자 음성

현재 역할이:

예언자

라면 모든 플레이어에게:

"예언자, 눈을 뜨세요."
"예언자는 플레이어 한 명 또는 센터카드 두 장을 확인하세요."

를 동일하게 재생한다.

예언자가 실제 플레이어로 존재하지 않아도:

"예언자, 눈을 뜨세요."
"예언자는 플레이어 한 명 또는 센터카드 두 장을 확인하세요."

를 모든 플레이어에게 재생하고 자동 PASS한다.

⸻

41. 역할별 행동 UI

플레이어 1명 선택

대상:

예언자
신비한 늑대
신문기자
도둑

플레이어 카드 클릭.

⸻

42. 플레이어 2명 선택

대상:

말썽쟁이

2명을 선택.

⸻

43. 카드 선택

대상:

견습 예언자
주정뱅이
예언자

센터카드를 클릭.

⸻

44. 정보 확인

대상:

늑대인간
하수인
견습 무두장이
불면증 환자

결과를 확인하고:

[ 확인했습니다 ]

버튼을 누른다.

⸻

45. 행동 제출 검증

서버는 반드시 검증한다.

예:

예언자가 자기 자신을 선택

등의 invalid action을 방지한다.

검증 항목:

현재 phase == night
현재 action == 요청 역할
player == action owner
action == 아직 완료되지 않음
target == 유효한 대상
target != 자기 자신
target == 현재 연결 가능한 player

역할별 규칙에 따라 허용 여부를 판단한다.

⸻

46. 도플갱어

도플갱어는 가장 먼저 행동한다.

플레이어 1명 선택
→ 해당 플레이어의 현재 역할 확인
→ 자신의 currentRole 변경
→ 해당 역할 능력 즉시 발동

단:

불면증 환자
신문기자

등의 특수 역할은 명시된 규칙에 따라 처리한다.

도플갱어가 복사한 역할에 따라 추가 행동을 실행할 수 있는 구조를 만든다.

⸻

47. 늑대인간

늑대인간이 존재하면:

다른 늑대인간 확인

한다.

늑대인간이 한 명뿐이면:

센터카드 1장 확인

한다.

이 정보는 늑대인간에게만 전달한다.

⸻

48. 대장 늑대

늑대가 아닌 플레이어 한 명을 선택하여:

늑대 카드
↔
선택한 플레이어 카드

를 교환한다.

⸻

49. 신비한 늑대

플레이어 한 명을 선택하고 역할을 확인한다.

⸻

50. 하수인

늑대인간을 확인한다.

⸻

51. 견습 무두장이

무두장이를 확인한다.

⸻

52. 예언자

둘 중 하나를 선택한다.

① 플레이어 1명 확인
② 센터카드 2장 확인

⸻

54. 견습 예언자

센터카드 1장을 확인한다.

⸻

55. 도둑

플레이어 한 명을 선택한다.

자신의 카드
↔
상대방 카드

교환 후 새 카드를 확인한다.

⸻

56. 마법사

센터카드 1장을 확인한 후:

센터카드
↔
플레이어 카드

강제 교환한다.

⸻

57. 말썽쟁이

서로 다른 두 플레이어를 선택하여:

Player A ↔ Player B

교환한다.

교환 결과는 확인하지 않는다.

⸻

58. 주정뱅이

센터카드 1장과 자신의 카드를 교환한다.

교환 결과는 확인하지 않는다.

⸻

59. 불면증 환자

밤 행동 종료 시 현재 자신의 역할을 확인한다.

⸻

60. 신문기자

플레이어 한 명을 확인한다.

해당 플레이어가 마을 진영이라면 게임 규칙에 따라 전체 공개 정보를 기록한다.

⸻

61. 밤 종료

모든 nightAction이:

completed
timeout
skipped

중 하나가 되면 밤 종료.

자동으로:

night → day

전환한다.

⸻

62. 낮 토론

낮 시작:

☀️ 낮이 되었습니다.

사회자 음성:

"날이 밝았습니다. 모두 눈을 뜨세요."

낮 화면에는:

토론 타이머
채팅
현재 플레이어 목록
이번 게임 사용 역할
밤 행동 순서

를 표시한다.

⸻

63. 낮 타이머

방장이 설정.

예:

3분
5분
7분
10분

타이머 종료 시:

자동으로 투표 단계

로 이동할 수 있도록 한다.

또는 방장이:

[ 투표 시작 ]

버튼을 눌러 조기 종료할 수 있다.

⸻

64. 채팅

최소 구현:

[ 채팅 입력 ]

실시간 Socket.io 채팅.

예:

수한:
나는 예언자였어.
철수:
거짓말 같은데?
영희:
나는 도둑이야.

⸻

65. 투표

각 플레이어는 자기 자신을 제외한 플레이어 중 한 명을 선택.

○ 수한
○ 철수
○ 영희
○ 민수

선택 후:

[ 투표 확정 ]

을 눌러야 한다.

⸻

66. 투표 비공개

모든 투표가 완료되기 전:

3 / 5명 투표 완료

만 공개.

누가 누구에게 투표했는지는 공개하지 않는다.

⸻

67. 투표 완료

모든 플레이어가 투표하면:

voting → result

자동 전환.

⸻

68. 투표 집계

서버 순수 함수로 구현한다.

calculateVotes(...)

동률이면 최다 득표자를 모두 처형한다.

단:

최다 득표수가 1표

라면 아무도 처형하지 않는다.

⸻

69. 보정 효과

다음 순서로 처리한다.

1. 보디가드 효과
2. 왕자 효과
3. 최종 득표 집계
4. 처형자 결정
5. 사냥꾼 효과
6. 승리 조건 판정

⸻

70. 보디가드

보디가드가 특정 플레이어를 보호한 경우 해당 대상에 대한 득표를 0으로 처리한다.

⸻

71. 왕자

왕자는 자신의 득표를 0으로 처리한다.

⸻

72. 저주받은자

늑대에게 1표 이상 받은 경우:

currentRole = werewolf

로 변경된다.

최종 역할 기준으로 결과를 표시한다.

⸻

73. 사냥꾼

사냥꾼이 처형되면:

사냥꾼이 투표한 플레이어

도 함께 사망한다.

⸻

74. 승리 조건

서버 함수:

determineWinner(gameState)

로 구현한다.

기본 규칙:

Case 1

늑대 진영 존재

AND

늑대 중 1명 이상 처형

→ 마을 승리

Case 2

늑대 진영 없음

AND

아무도 처형되지 않음

→ 마을 승리

Case 3

늑대 없음

AND

하수인만 처형

→ 전원 패배

Case 4

늑대 진영 존재

AND

늑대가 모두 생존

AND

무두장이 조건도 만족

→ 늑대 진영 승리

Case 5

늑대 없음

AND

하수인만 존재

AND

누군가 처형

AND

하수인 생존

→ 하수인 승리

Case 6

무두장이 존재

AND

무두장이 처형

→ 무두장이 단독 승리

단, 게임 규칙상 중복 승리가 허용되는 경우에는:

winners: Faction[]

형태로 여러 승리 진영을 표현한다.

예:

{
  winners: ["village", "tanner"]
}

⸻

75. 결과 화면

결과 화면:

🎉 마을 진영 승리!

또는:

🐺 늑대 진영 승리!

또는:

😈 무두장이 승리!

⸻

76. 최종 역할 공개

모든 플레이어의 최종 역할 공개.

예:

수한
원래 역할: 도둑
최종 역할: 늑대인간
철수
원래 역할: 늑대인간
최종 역할: 도둑
영희
원래 역할: 예언자
최종 역할: 예언자

역할 카드를 순차적으로 flip한다.

⸻

77. 투표 결과

모든 투표 공개.

수한 → 철수
철수 → 수한
영희 → 철수
민수 → 철수

처형자는:

☠ 철수

처럼 표시.

사망자는:

grayscale
X overlay

를 적용한다.

⸻

78. 결과 애니메이션

승리:

confetti
particle
card reveal

사용.

카드는 순차적으로 공개한다.

⸻

79. 다시하기

결과 화면:

[ 다시하기 ]

누르면 같은 방에서:

역할 재셔플
카드 재배정
투표 초기화
nightLog 초기화
ready 상태 초기화
phase = card_reveal

한다.

방 자체를 삭제하지 않는다.

⸻

80. 연결 끊김 처리

플레이어 연결이 끊어져도:

Player.connected = false

로 변경한다.

일정 시간 동안 세션을 유지한다.

재접속하면:

socketId 업데이트
connected = true
현재 GameState 전송

한다.

⸻

81. 재접속 시 복구

재접속한 플레이어는:

현재 phase
자신의 역할
현재 행동
현재 타이머
낮 타이머
투표 상태

를 복구할 수 있어야 한다.

단, 현재 역할이 아닌 타인의 비공개 정보는 절대 전달하지 않는다.

⸻

82. 방장 이탈

방장이 연결 종료하면:

다음 플레이어를 hostId로 지정

한다.

새 방장에게만:

방장 설정
게임 시작
게임 재시작

권한을 부여한다.

⸻

83. Socket 이벤트

최소 다음 이벤트를 구현한다.

Client → Server

ROOM_CREATE
ROOM_JOIN
PLAYER_READY
GAME_START
CARD_CONFIRM
NIGHT_ACTION_SUBMIT
NIGHT_ACTION_CONFIRM
DAY_START
CHAT_SEND
VOTE_SELECT
VOTE_CONFIRM
GAME_RESTART

⸻

84. Server → Client

ROOM_STATE
PLAYER_JOINED
PLAYER_LEFT
GAME_STARTED
CARD_ASSIGNED
CARD_CONFIRM_PROGRESS
PHASE_CHANGED
NARRATOR_SPEECH
NIGHT_ACTION_STARTED
NIGHT_ACTION_TICK
NIGHT_ACTION_COMPLETED
NIGHT_ACTION_TIMEOUT
DAY_STARTED
DAY_TIMER
CHAT_MESSAGE
VOTE_PROGRESS
VOTE_COMPLETED
GAME_RESULT

⸻

85. Socket 이벤트 보안

모든 Socket 이벤트에는:

roomCode
playerId
requestId

등의 검증 가능한 정보를 사용한다.

서버는 Socket ID만 믿지 말고 서버 세션과 player ID를 매핑한다.

예:

socket.data.playerId
socket.data.roomCode

⸻

86. 멱등성

특히 다음 요청은 중복 처리되지 않아야 한다.

NIGHT_ACTION_SUBMIT
VOTE_CONFIRM
CARD_CONFIRM

각 요청에:

requestId

를 사용하여 중복 요청을 방지한다.

예:

processedRequest:{roomCode}:{requestId}

⸻

87. Redis 데이터 구조

예:

game:room:A7K29P
game:room:A7K29P:state
game:room:A7K29P:players
game:room:A7K29P:events
lock:game:A7K29P:night-action:12

Redis TTL을 사용하여 종료된 방을 자동 정리한다.

⸻

88. Redis Pub/Sub

서버 간 이벤트 전달에 사용.

예:

game-events:A7K29P

서버 1에서 상태 변경:

PHASE_CHANGED

→ Redis Pub/Sub

→ Server 1/2/3

→ 각 서버의 해당 Socket Client에게 전달.

Socket.io Redis Adapter를 사용하여 room broadcast를 처리한다.

⸻

89. 멀티 서버에서 가장 중요한 원칙

다음 구조를 반드시 지킨다.

Client
   ↓
Socket.io Server
   ↓
Game Engine
   ↓
Redis

게임의 진실:

Redis

게임 로직:

Game Engine

실시간 전달:

Socket.io

UI:

React

⸻

90. Game Engine은 Socket.io와 분리

다음과 같이 구현한다.

gameEngine.startNight()
gameEngine.startAction()
gameEngine.submitAction()
gameEngine.timeoutAction()
gameEngine.startDay()
gameEngine.startVoting()
gameEngine.calculateResult()

Game Engine은 Socket.io에 직접 의존하지 않는다.

이를 통해 Unit Test가 가능하도록 한다.

⸻

91. 순수 함수 중심 구현

다음 함수는 최대한 pure function으로 구현한다.

shuffleRoles()
assignRoles()
buildNightActionQueue()
validateNightAction()
applyNightAction()
applyVoteModifiers()
calculateVotes()
determineExecutions()
applyHunterEffect()
determineWinner()
buildPublicGameState()
buildPlayerGameState()

⸻

92. 게임 상태 변경은 Command 방식으로 처리

예:

submitNightAction({
  roomCode,
  playerId,
  actionId,
  command
})

서버에서:

Command
 ↓
Validation
 ↓
Game Engine
 ↓
New State
 ↓
Redis
 ↓
Event
 ↓
Clients

구조로 처리한다.

⸻

93. UI 상태

Zustand에서:

interface ClientGameState {
  roomCode: string;
  playerId: string;
  phase: Phase;
  selfRole: RoleType | null;
  currentNightAction: NightAction | null;
  expiresAt: number | null;
  players: PublicPlayer[];
  votesCompleted: number;
  totalPlayers: number;
  dayExpiresAt: number | null;
}

등을 관리한다.

⸻

94. 서버 상태와 UI 상태 분리

서버:

전체 게임 상태

클라이언트:

현재 플레이어가 볼 수 있는 상태

만 가진다.

절대로:

전체 currentRole
전체 originalRole
전체 nightLog

를 클라이언트에 전달하지 않는다.

⸻

95. 디자인

전체적인 디자인:

Dark Fantasy

밤:

남색
보라색
검은색
달
별
안개

낮:

밝은 배경
햇빛
따뜻한 분위기

밤 → 낮 전환:

dark
→ blur
→ brightness
→ sunlight

⸻

96. 모바일 우선

주 사용자는 스마트폰.

반드시:

375px
390px
414px

정도의 모바일 화면에서 자연스럽게 동작하도록 한다.

버튼 터치 영역은 충분히 크게 만든다.

⸻

97. 카드 UI

역할 카드는:

3D card

형태.

앞면:

아이콘
역할명
진영

뒷면:

?

Framer Motion:

rotateY: 0 → 180

사용.

⸻

98. 밤 행동 UI

현재 행동 역할을 강조한다.

예:

🌙
예언자
눈을 뜨세요.
무엇을 확인할까요?
[ 👤 플레이어 ]
[ 🃏 센터카드 2장 ]
남은 시간
3.4초
[ 행동완료 ]

⸻

99. 도움말 버튼 위치

전체 화면 공통 Layout에:

Top Right

로 고정.

예:

┌─────────────────────────────┐
│ 게임                  [?]   │
│                             │
│                             │

버튼은 작게 디자인하되 실제 터치 영역은 충분히 확보한다.

⸻

100. 에러 처리

예:

이미 행동이 완료되었습니다.
현재는 당신의 차례가 아닙니다.
잘못된 플레이어입니다.
유효하지 않은 대상입니다.
게임이 종료되었습니다.
방을 찾을 수 없습니다.
게임이 이미 시작되었습니다.

Toast 또는 Modal로 처리.

⸻

101. 테스트

최소 다음 Unit Test를 작성한다.

역할 배정

5명 → 역할 8장
3명 → 역할 6장
10명 → 역할 13장

⸻

밤 순서

selectedRoles
→ nightOrder 정렬

검증.

⸻

없는 역할

선택된 역할이지만 실제 소유 플레이어 없음
→ 해당 역할 음성 출력
→ 자동 PASS

검증.

⸻

타임아웃

5초
→ action timeout
→ 다음 역할

검증.

⸻

투표

2,2,1
→ 2표 플레이어 둘 다 처형

검증.

1,1,1
→ 아무도 처형되지 않음

검증.

⸻

보디가드

보호 대상의 득표가 0이 되는지 확인.

⸻

왕자

왕자의 득표가 0이 되는지 확인.

⸻

사냥꾼

사냥꾼 처형 시 투표 대상도 처형되는지 확인.

⸻

승리 조건

각 승리 조건별 테스트를 작성한다.

⸻

102. E2E 테스트

Playwright를 사용하여 최소:

브라우저 A
브라우저 B
브라우저 C

3개 플레이어로 게임을 진행하는 테스트를 작성한다.

테스트:

방 생성
→ 참가
→ ready
→ 게임 시작
→ 카드 확인
→ 밤
→ 역할 행동
→ timeout
→ 낮
→ 투표
→ 결과

까지 자동 검증한다.

⸻

103. 멀티 서버 테스트

Docker Compose로 최소 2개의 Node.js 서버를 실행할 수 있게 한다.

server-1
server-2
redis

구성.

예:

client A → server-1
client B → server-2
client C → server-1

이어도 동일한 게임이 정상 작동해야 한다.

⸻

104. Docker Compose

최소:

frontend
backend-1
backend-2
redis

구성을 제공한다.

로드밸런서는 Nginx 또는 Traefik을 사용할 수 있다.

⸻

105. WebSocket Sticky Session

Socket.io 연결 특성을 고려하여 Load Balancer에서 WebSocket 연결이 안정적으로 유지되도록 구성한다.

Redis Adapter를 사용하더라도 필요한 환경에서는 sticky session 설정을 고려한다.

README에 이유와 설정 방법을 설명한다.

⸻

106. 서버 재시작 복구

Server 1이 게임 진행 중 종료되어도:

Server 2

로 요청이 전달되면 Redis의 게임 상태를 읽어 현재 게임을 이어갈 수 있어야 한다.

특히:

night
currentNightAction
expiresAt

상태를 기준으로 진행을 복구한다.

⸻

107. 게임 상태 복구 로직

서버가 방 상태를 로드하면:

phase == night
AND
currentAction.status == active
AND
expiresAt < Date.now()

이면:

timeoutAction()

을 실행한다.

반대로:

expiresAt > Date.now()

이면 남은 시간을 계산하여 행동을 계속 진행한다.

⸻

108. 로그

Pino 등을 사용하여 다음 로그를 남긴다.

room_created
player_joined
game_started
card_assigned
night_started
night_action_started
night_action_completed
night_action_timeout
phase_changed
vote_submitted
game_finished

로그에 다른 플레이어가 보면 안 되는 민감한 역할 정보를 무분별하게 남기지 않는다.

⸻

109. 개발 단계

AI Coding Agent는 한 번에 모든 기능을 대충 구현하지 말고 다음 순서로 개발한다.

Phase 1

프로젝트 초기화

React
TypeScript
Tailwind
Node
Express
Socket.io
Redis

⸻

Phase 2

Lobby

방 생성
방 입장
닉네임
ready
host

⸻

Phase 3

Role System

RoleDefinition
Role Selection
Role Assignment
Center Cards

⸻

Phase 4

Card Reveal

3D flip
개인 역할 공개
ready

⸻

Phase 5

Night Engine

NightActionQueue
Action State
Timer
Timeout
Role Actions

⸻

Phase 6

TTS

Narrator
NARRATOR_SPEECH
Web Speech API

⸻

Phase 7

Day

Role List
Night Order
Chat
Timer

⸻

Phase 8

Voting

Vote
Vote Lock
Vote Count
Modifiers

⸻

Phase 9

Result

Victory
Final Roles
Votes
Animation

⸻

Phase 10

Help

Help Button
Role Guide
Win Conditions

⸻

Phase 11

Distributed Server

Redis
Socket.io Redis Adapter
Distributed Lock
Server Restart Recovery

⸻

Phase 12

Testing

Unit Test
Integration Test
E2E
Multi-server Test

⸻

110. 구현 시 가장 중요한 원칙

다음 원칙을 반드시 지킨다.

1.

게임 규칙을 클라이언트에서 판정하지 않는다.

2.

역할 정보는 서버에서 필터링한다.

3.

밤 행동 타이머는 서버가 권위(authoritative)를 가진다.

4.

TTS는 모든 플레이어에게 동일한 사회자 문장을 전달한다.

5.

역할이 실제 플레이어에게 배정되지 않았더라도 selectedRoles에 존재하는 밤 행동 역할이면 사회자 음성이 나오고 해당 순서를 진행한다.

6.

행동 제한 시간이 지나면 자동으로 다음 역할로 넘어간다.

7.

멀티 서버 환경에서 Node.js 메모리를 게임 상태 저장소로 사용하지 않는다.

8.

Redis를 게임 상태의 중앙 저장소로 사용한다.

9.

Socket.io Redis Adapter를 사용하여 서버 간 Socket Room 이벤트를 동기화한다.

10.

동시 요청으로 게임 상태가 두 번 변경되지 않도록 Redis Lock 또는 원자적 상태 변경을 사용한다.

11.

Game Engine과 Socket.io Layer를 분리한다.

12.

역할 정보/승리 조건/밤 순서는 데이터 기반으로 관리한다.

13.

도움말은 게임 중 언제든 열 수 있다.

14.

낮 화면에서는 해당 게임에 사용된 역할과 실제 밤 행동 순서를 모든 플레이어에게 공개한다.

⸻

111. 최종 완료 조건

다음 시나리오가 실제로 동작해야 프로젝트 완료로 간주한다.

A가 방 생성
        ↓
B/C/D/E 입장
        ↓
5명 모두 ready
        ↓
8개 역할 선택
        ↓
게임 시작
        ↓
각자 카드 확인
        ↓
밤 시작
        ↓
"도플갱어, 눈을 뜨세요."
        ↓
도플갱어가 없으면 자동 PASS
        ↓
"방패병, 눈을 뜨세요."
        ↓
방패병이 없으면 자동 PASS
        ↓
"늑대인간, 눈을 뜨세요."
        ↓
늑대인간 행동
        ↓
"예언자, 눈을 뜨세요."
        ↓
예언자가 행동
        ↓
각 행동 최대 5초
        ↓
시간 초과 시 자동 다음 역할
        ↓
밤 종료
        ↓
낮 시작
        ↓
사용 역할 목록 공개
        ↓
밤 행동 순서 공개
        ↓
토론
        ↓
투표
        ↓
투표 결과 공개
        ↓
최종 역할 공개
        ↓
승리 진영 판정
        ↓
다시하기

그리고 다음 환경에서도 정상 동작해야 한다.

Player A → Node Server 1
Player B → Node Server 2
Player C → Node Server 1
Player D → Node Server 2
Player E → Node Server 1
        ↓
      Redis

⸻

112. AI Coding Agent 작업 방식

구현을 시작하기 전에 먼저:

1. 프로젝트 디렉토리 구조 생성
2. 공유 TypeScript 타입 정의
3. Role Definition 작성
4. Game State 구조 작성
5. Socket Event 타입 정의
6. Redis 구조 설계
7. Game Engine 인터페이스 설계

를 수행한다.

그 후 Phase 1부터 순차적으로 구현한다.

각 Phase가 끝날 때마다:

- 구현 내용
- 변경된 파일
- 실행 방법
- 테스트 결과
- 남은 TODO

를 README 또는 작업 로그에 기록한다.

코드는 실제 실행 가능한 상태를 유지한다.

임시 mock 구현을 실제 구현으로 착각하지 않도록 명확하게 TODO를 표시한다.

⸻

113. 최종 명령

이 프로젝트를 실제로 실행 가능한 수준까지 구현하라.

단순히 UI mockup만 만들지 말고:

Frontend
+
Backend
+
Socket.io
+
Redis
+
Game Engine
+
Role System
+
Night Timer
+
TTS
+
Voting
+
Victory
+
Help
+
Multi-server
+
Tests

를 모두 연결한다.

특히 게임의 핵심 로직은 서버 authoritative 방식으로 구현하고, 멀티 서버 환경에서 게임 상태가 꼬이지 않도록 Redis와 분산 Lock을 사용한다.

먼저 현재 프로젝트 디렉토리를 검사하고 기존 코드가 있다면 재사용 가능한 부분을 파악한 뒤 구현을 시작한다.

구현 전에 전체 구조를 설명하는 문서를 먼저 작성하고, 이후 Phase 1 → Phase 12 순서로 실제 코드를 작성하라.
