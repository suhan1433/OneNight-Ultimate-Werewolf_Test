# 역할
너는 시니어 풀스택 엔지니어 겸 인터랙션 디자이너다. 아래 사양대로 "루미큐브(Sabra 룰) 실시간 멀티플레이 웹게임"을 React + TypeScript로 구현한다. 모든 코드는 strict TypeScript로 작성하고, 단계별로 나눠서 구현하되 각 단계가 실행 가능한 상태여야 한다.

# 0. 목표와 원칙
- 2~4인 실시간 온라인 대전. 룸 코드로 입장, 봇으로 빈자리 채우기 옵션.
- 서버 권위(Server-Authoritative): 게임 상태의 진실은 서버. 클라이언트는 "의도(intent)"만 전송.
- 룰 엔진은 순수 함수 TypeScript 패키지로 분리해 서버/클라이언트가 공유(클라이언트는 즉시 피드백용, 서버는 최종 검증).
- 상대의 손패 정보는 절대 클라이언트로 전송하지 않는다(타일 개수만 전송).
- 몰입감 있는 애니메이션과 일관된 컨셉(아래 5번)이 최우선 UX 요구사항이다.

# 1. 기술 스택
- 모노레포(pnpm workspaces): `packages/rules`(순수 룰 엔진), `packages/protocol`(공유 타입·zod 스키마), `apps/server`, `apps/web`.
- Web: React 18 + Vite + TypeScript, Zustand(상태), Framer Motion(레이아웃/스프링 애니메이션), @dnd-kit/core(드래그앤드롭, 터치 지원), Tailwind CSS(+CSS 변수 테마), howler.js(사운드), canvas 또는 tsparticles(파티클).
- Server: Node.js + Socket.IO + zod(메시지 검증). 저장소는 메모리 + 인터페이스(`GameStore`)로 추상화해 Redis로 교체 가능하게.
- 테스트: Vitest(룰 엔진 단위테스트 필수), Playwright(2인 접속 E2E 1개 이상).

# 2. 공식 룰 (Sabra) — 룰 엔진 사양
## 2.1 구성
- 106장: 색 4종(black, red, blue, orange) × 숫자 1~13 × 2장 = 104장 + 조커 2장.
- 각 플레이어 14장, 나머지는 pool. 시작 플레이어는 각자 타일 1장을 뽑아 가장 큰 숫자가 시작(동점 재추첨). 시계방향 진행.

## 2.2 조합
- Group: 같은 숫자, 서로 다른 색, 3~4장.
- Run: 같은 색, 연속 숫자, 3장 이상. 1은 낮은 숫자로만 사용(12-13-1 불가).
- 한 타일은 한 조합에만 속함. 조커는 임의 숫자/색을 대신하며 "대신하는 값(represents)"이 조합 내에서 확정되어야 한다.
- 조커 2장이 한 조합에 같이 들어갈 수 있다(옵션 `allowTwoJokersInMeld`, 기본 true). 이때 조합 종류(group/run)를 모호하지 않게 판정해 저장한다.

## 2.3 턴
한 턴 = (A) pool에서 1장 뽑고 턴 종료 또는 (B) 손패를 내려놓는 멜드. 턴 종료 시 아래를 모두 만족해야 확정:
1. 테이블의 모든 조합이 유효하다.
2. 손패에서 최소 1장이 테이블로 이동했다.
3. 첫 등록 전이라면: 이번 턴에 새로 만든 조합들이 손패 타일만으로 구성되고 점수 합이 `initialMeldMin`(기본 30) 이상이다. 조커는 대신하는 숫자 값으로 계산한다. 테이블의 기존 타일을 건드리면 안 된다.
4. 테이블에 있던 타일이 손패로 돌아오면 안 된다(손패→테이블만 가능, 조커 회수 후 손패 보관 금지).

## 2.4 재배열 (첫 등록 이후, 옵션에 따라 같은 턴 허용)
- 테이블 조합 분해/합치기/분할/타일 빼서 새 조합 만들기를 자유롭게 허용하되, 턴 종료 시점의 상태만 검증한다.
- 조커 교체: 조커가 대신하는 실제 타일을 손에서 내서 조커와 교체 가능. 꺼낸 조커는 같은 턴에 반드시 테이블 조합에 사용해야 한다. `RuleConfig.jokerReuse`로 엄격도 선택:
  - 'free'(기본): 어느 조합에든 재사용 가능
  - 'newMeld': 반드시 "새로 생긴 조합"에 사용
  - 'newMeldFromHand': 손패 타일 2장 이상과 새 조합
- `allowJokerMeldManipulation`(기본 true): 조커가 든 조합도 분할/타일 제거 가능. 단, 조커가 대신하는 값은 바뀌면 안 된다(교체 제외).

## 2.5 타임아웃과 페널티
- 턴 제한시간 `turnSeconds`(기본 120). 시간 종료 시 유효하지 않은 상태면 테이블/손패를 턴 시작 스냅샷으로 롤백하고 pool에서 `penaltyDraw`(기본 3)장 드로우.
- 유효하게 완성된 상태라면 그대로 확정하고, 아무것도 안 냈다면 1장 강제 드로우.
- 서버가 스냅샷을 보관한다.

## 2.6 종료와 점수
- 손패 0장이 되면 "RUMMIKUB!" 선언과 함께 종료.
- 패자: -(남은 타일 합), 승자: +(패자 합계 총합). 남은 조커는 `jokerPenalty`(기본 30점).
- 교착(pool 비고 아무도 못 냄): 남은 합이 가장 낮은 사람이 승리, 각자 승자와의 차이만큼 감점하고 승자는 그 합을 획득(총합 0).
- 매치 모드: 여러 라운드 누적 점수, 목표 점수 또는 라운드 수 설정.

## 2.7 룰 엔진 API (packages/rules)
```ts
export type Color = 'black' | 'red' | 'blue' | 'orange';
export type TileId = number; // 0..105 고유 ID
export interface NumberTile { id: TileId; kind: 'number'; color: Color; value: number }
export interface JokerTile  { id: TileId; kind: 'joker' }
export type Tile = NumberTile | JokerTile;

export interface Meld {
  id: string;
  type: 'group' | 'run';
  tiles: Array<{ tileId: TileId; represents?: { color: Color; value: number } }>; // 조커만 represents
}

export interface RuleConfig {
  initialMeldMin: number; turnSeconds: number; penaltyDraw: number; jokerPenalty: number;
  jokerReuse: 'free' | 'newMeld' | 'newMeldFromHand';
  allowJokerMeldManipulation: boolean; allowTwoJokersInMeld: boolean;
  allowManipulationOnInitialMeldTurn: boolean;
}

export function validateMeld(tiles: Tile[]): { ok: true; meld: Meld } | { ok: false; reason: string };
export function validateTurn(args: {
  before: { table: Meld[]; hand: TileId[]; hasInitialMeld: boolean };
  after:  { table: Meld[]; hand: TileId[] };
  config: RuleConfig;
}): { ok: true; initialMeldPoints?: number } | { ok: false; reason: string };
export function scoreRound(...): ...;
```
- 조커의 represents 자동 추론은 "가능한 해석이 여러 개면 유효한 해석 중 하나를 선택하되, 사용자에게 선택지를 제시"하도록 `inferJokerRepresents()`가 후보 목록을 반환하게 한다.
- Vitest 케이스(최소): 유효/무효 Run·Group, 1-2-3 OK / 12-13-1 NG, 첫 등록 29점 NG / 30점 OK, 조커 포함 점수 계산, 조커 교체 후 미사용 NG, 타임아웃 롤백+3장 페널티, 교착 점수 합 0, 5장 Run을 중복 타일로 둘로 분할.

# 3. 멀티플레이 설계
## 3.1 서버 상태
```ts
interface GameState {
  roomId: string; phase: 'lobby'|'dealing'|'playing'|'roundEnd'|'matchEnd';
  config: RuleConfig; seed: string;           // 재현 가능한 셔플(시드 기반 PRNG)
  players: Array<{ id: string; name: string; seat: number; connected: boolean; isBot: boolean;
                   hasInitialMeld: boolean; score: number }>;
  hands: Record<string, TileId[]>;            // 서버만 보유
  pool: TileId[];                             // 서버만 보유
  table: Meld[]; turn: { playerId: string; startedAt: number; deadline: number; snapshot: Snapshot };
  version: number;                            // 모든 변경마다 +1
}
```
- 클라이언트에는 `PublicView`(본인 hand + 타인 handCount + table + pool 개수 + turn)만 전송.

## 3.2 프로토콜 (zod로 검증, packages/protocol)
- C→S: `room:create`, `room:join`, `room:ready`, `game:start`, `turn:draft`(재배열 중 실시간 미리보기용, 다른 플레이어에게 "고스트"로 방송), `turn:commit`(최종 table/hand 상태 제출), `turn:draw`, `turn:reset`, `chat:emoji`.
- S→C: `state:sync`(전체), `state:patch`(version 기반 증분), `turn:started`, `turn:rejected`(reason), `turn:committed`(애니메이션용 diff 포함: moved/added/removed tiles), `timer:tick`, `player:presence`, `round:ended`, `error`.
- 모든 이벤트에 `clientSeq`/`version`을 넣어 순서 보장, 중복 요청 무시(idempotent).

## 3.3 필수 멀티플레이 기능
- 낙관적 UI: 내 턴 중 드래그는 로컬에서 즉시 반영. commit 시 서버 검증 → 실패하면 롤백 애니메이션과 사유 표시.
- 상대 턴 관전: 상대의 재배열 과정을 `turn:draft`로 받아 타일이 부드럽게 움직이는 "고스트 커서/타일" 연출(스로틀 30fps, 상대의 손패 내용은 노출 안 함).
- 재접속: 세션 토큰으로 복구, 연결 끊긴 플레이어는 타이머 만료 시 자동 드로우, 60초 이상 부재 시 봇이 대행 옵션.
- 서버 타이머가 기준이며 클라이언트는 `deadline` 기준으로 표시, 시계 오차 보정.
- 치트 방지: 클라이언트가 보낸 타일 ID가 해당 플레이어 손패/테이블에 실제 존재하는지 검증, 타일 보존(총 106장 불변) 검증.
- 봇(선택): 휴리스틱 솔버(손패로 만들 수 있는 최대 조합 탐색 + 단순 재배열)로 난이도 2단계.

# 4. 화면 구성
1. 랜딩/로비: 닉네임, 방 만들기/코드 입장, 룰 옵션 패널(RuleConfig 프리셋: "공식", "클래식 50점", "커스텀").
2. 대기실: 좌석 4개가 스포트라이트 아래 의자로 표현, 준비 상태 네온 토글, 룸 코드 복사.
3. 게임 보드:
   - 중앙: 테이블(조합은 자동 정렬되는 네온 레일 위에 배치, 새 조합 영역은 "빈 레일 슬롯" 하이라이트).
   - 하단: 내 랙(정렬 버튼: 색/숫자 기준 FLIP 애니메이션 정렬).
   - 상단/좌우: 상대 좌석(아바타, 남은 타일 수, 첫 등록 여부 뱃지, 연결 상태).
   - 우측 상단: 원형 타이머(마지막 10초 심박 펄스), pool 더미(남은 개수 카운터).
   - 하단 액션: [뽑기] [완료] [되돌리기]. 완료 버튼은 현재 테이블 상태가 유효할 때만 점등.
4. 라운드 종료/결과: 점수판 롤링 카운트업, 승자 연출.

# 5. 컨셉: "NEON NOIR PARLOR (심야 타일 라운지)"
## 5.1 비주얼 디렉션
- 배경: 거의 검은 남색(#07080F) 위에 비 오는 창밖 보케(느린 패럴랙스 canvas), 은은한 필름 그레인.
- 테이블: 검은 옻칠 질감(미세한 반사 그라디언트), 가장자리에 네온 튜브 라인.
- 타일: 상아색 베이클라이트 바디 + 두께감(box-shadow 다층 + 상단 하이라이트), 숫자는 네온 글로우. 색 팔레트:
  - red #FF3D6E, blue #36E0FF, orange #FFB224, black = 흑요석 바디 + #F4F1FF 흰 발광
  - 색약 대응: 색별 모양 마커(●◆▲■) 항상 표시 + 설정에서 고대비 모드.
- 조커: 홀로그램 그라디언트로 색이 순환하는 웃는 얼굴 네온, 테이블 위에서 가볍게 일렁임.
- 타이포: 숫자는 두껍고 둥근 디스플레이 폰트(예: "Orbitron" 대신 가독성 위해 "Rubik" 계열), UI는 "Pretendard".
- CSS 변수로 디자인 토큰(`--neon-red` 등)을 정의하고 테마 확장이 쉽게 한다.

## 5.2 애니메이션/모션 사양 (Framer Motion + FLIP, 60fps 목표)
- 딜링: 타일이 pool 더미에서 부채꼴로 날아와 각 좌석 랙에 스태거(40ms 간격) 착지, 착지 시 약한 바운스+네온 깜빡임.
- 내 랙 정렬: layout 애니메이션으로 타일이 부드럽게 재배치(spring stiffness 300 / damping 28).
- 드래그: 집어 올리면 scale 1.08, 그림자 확대, 네온 글로우 강화. 드롭 가능 영역은 레일이 숨 쉬듯 펄스. 놓을 때 자석처럼 스냅하며 짧은 "딸깍" 사운드와 스파크 파티클.
- 조합 유효성 즉시 피드백: 유효해지는 순간 레일이 초록빛 대신 해당 조합 색의 맑은 링 파동(ripple), 무효 상태는 레일이 약하게 붉게 깜빡(과하지 않게, 모션 감소 설정 존중).
- 조커 교체: 두 타일이 스왑되며 조커가 위로 떠올라 궤적을 그리며 새 조합으로 이동, 이동 경로에 홀로그램 잔상.
- 드로우: pool에서 카드가 뒤집히며 내 랙으로 슬라이드. 상대 드로우는 뒷면 상태로 상대 좌석으로 이동.
- 턴 전환: 스포트라이트 원이 다음 플레이어 좌석으로 이동(조명이 켜지는 듯한 radial-gradient 보간), 내 턴 시작 시 랙이 살짝 떠오르고 "YOUR TURN" 네온 사인이 점등.
- 타이머: 원형 링이 줄어들고 마지막 10초에 색이 앰버→레드로 변하며 심박 펄스와 틱 사운드.
- 페널티/롤백: 테이블이 역재생처럼 원래 상태로 되감기(타일이 역궤적 이동), 화면 전체에 글리치 라인 0.4초, 3장 드로우 연출.
- RUMMIKUB! 승리: 화면 암전 → 승자 좌석 스포트라이트 최대 → 네온 타이포 "RUMMIKUB!" 점등 → 남은 타일 합이 상대 랙에서 날아와 점수판에 흡수되는 카운트업 → 색종이 대신 네온 파편 파티클.
- 상대 행동 관전: 상대가 타일을 옮기는 고스트 모션을 약간 지연(80~120ms) 보간해 끊김 없이 보이게.
- 이모트/리액션: 네온 이모지 풍선이 좌석 위로 떠오름(스팸 방지 쿨다운).

## 5.3 사운드
- 로우파이 재즈 + 빗소리 앰비언스 루프(볼륨 개별 조절), 타일 클릭/스냅/드로우/성공/실패/타이머 틱 효과음. 첫 사용자 제스처 후 오디오 활성화, 음소거 설정 저장.

## 5.4 접근성/성능
- `prefers-reduced-motion` 시 파티클/글리치/보케 비활성, 이동은 짧은 페이드로 대체.
- 키보드 조작(타일 선택/이동/완료), 스크린리더용 live region(턴 알림, 거부 사유).
- 모바일(터치) 우선 반응형: 랙은 가로 스크롤+핀치 없는 고정 크기, 테이블은 줌/팬 지원.
- 타일은 SVG/CSS로 렌더, 애니메이션은 transform/opacity 위주, 100개 이상 타일에서도 60fps 유지(필요 시 `will-change`, 레이어 분리, 가상화).

# 6. 구현 순서 (각 단계마다 실행 방법과 테스트 결과 보고)
1. packages/rules: 타입, 덱 생성/시드 셔플, validateMeld, validateTurn, 점수, Vitest 전부 통과.
2. packages/protocol + apps/server: 룸/로비, 딜링, 턴 관리, 타이머, 커밋 검증, 롤백.
3. apps/web 기본 UI: 로비, 보드 정적 렌더, 드래그앤드롭, 로컬 룰 검증.
4. 서버 연동 + 낙관적 UI + 재접속 + 관전 고스트.
5. 컨셉 애니메이션/사운드 전체 적용, 접근성/모바일 튜닝.
6. 봇, E2E 테스트, README(실행법, 룰 옵션, 프로토콜 문서).

# 7. 산출물/완료 조건
- `pnpm dev` 한 번으로 서버+웹 실행, 브라우저 탭 2~4개로 대전 가능.
- 위 룰의 모든 항목이 테스트로 증명되어 있고, 테스트가 통과한다.
- 서버 응답에서 상대 손패가 절대 노출되지 않음을 검증하는 테스트 포함.
- 불명확한 룰은 임의로 정하지 말고 `RuleConfig` 옵션으로 만들고 README에 기본값 근거를 적는다.
- 구현 중 애매한 지점이 생기면 가장 합리적인 가정을 명시하고 진행한다.

# [패치] 웹 + iOS/Android 동시 지원

이 패치는 기존 프롬프트의 "1. 기술 스택", "4. 화면 구성", "5.4 접근성/성능", "6. 구현 순서", "7. 산출물/완료 조건"을 아래 내용으로 교체하거나 보강한다. 나머지(룰 엔진, 서버 권위 구조, 프로토콜, 컨셉, 모션 사양)는 그대로 유지한다.

## 1'. 기술 스택 (교체)
- 모노레포(pnpm workspaces): `packages/rules`, `packages/protocol`, `packages/platform`(플랫폼 추상화), `apps/server`, `apps/client`.
- `apps/client`: React 18 + Vite + TypeScript 단일 코드베이스를 웹(PWA)과 Capacitor 6 기반 iOS/Android 앱으로 함께 빌드한다.
- 상태/모션/DnD: Zustand, Framer Motion, @dnd-kit/core, Tailwind CSS, howler.js (기존과 동일).
- Capacitor 플러그인: @capacitor/app(생명주기·딥링크), @capacitor/haptics, @capacitor/network, @capacitor/preferences(localStorage 대체), @capacitor/share, @capacitor/status-bar, @capacitor/splash-screen, @capacitor/push-notifications, @capacitor/screen-orientation, @capacitor-community/keep-awake.
- 웹 PWA: vite-plugin-pwa(manifest, 아이콘, 앱 셸 캐시. 게임 플레이는 온라인 필수).
- 아이콘/스플래시: @capacitor/assets로 일괄 생성.

## 1-A. 플랫폼 추상화 계층 (packages/platform)
UI 코드는 Capacitor API를 직접 호출하지 않고 아래 인터페이스만 사용한다. 웹 구현체와 네이티브 구현체를 런타임에 `Capacitor.isNativePlatform()`으로 선택한다.
```ts
export interface PlatformService {
  kind: 'web' | 'ios' | 'android';
  storage: { get(k: string): Promise<string|null>; set(k: string, v: string): Promise<void>; remove(k: string): Promise<void> };
  haptics: { tick(): void; success(): void; warning(): void; error(): void };   // 웹은 navigator.vibrate 또는 no-op
  share: { inviteRoom(code: string, url: string): Promise<void> };              // 웹은 Web Share API → 클립보드 폴백
  push: { requestPermission(): Promise<boolean>; getToken(): Promise<string|null>; onTap(cb: (data: {roomId: string}) => void): void };
  lifecycle: { onForeground(cb: () => void): void; onBackground(cb: () => void): void };
  network: { isOnline(): boolean; onChange(cb: (online: boolean) => void): void };
  orientation: { lockLandscape(): Promise<void>; unlock(): Promise<void> };
  keepAwake: { enable(): Promise<void>; disable(): Promise<void> };            // 게임 중 화면 꺼짐 방지
  audio: { unlock(): Promise<void> };                                          // iOS/Android WebView 오디오 해제
}
```

## 4'. 반응형 레이아웃 (4번 화면 구성 보강)
레이아웃 프리셋 4종을 두고 ResizeObserver와 orientation으로 자동 전환한다.
- Phone Landscape(모바일 기본 권장 방향): 좌우에 상대 좌석, 중앙 테이블, 하단에 내 랙 1줄. 게임 진입 시 가로 고정을 제안하되 강제하지는 않는다.
- Phone Portrait: 상단에 상대 좌석을 한 줄로 압축, 중앙 테이블(핀치 줌·팬 지원), 하단에 내 랙 2줄(스크롤 없이 전체 노출).
- Tablet: 데스크톱과 유사하나 터치 타깃을 크게 한다.
- Desktop: 마우스 호버 효과, 키보드 단축키(Space=뽑기, Enter=완료, Ctrl+Z=되돌리기).
- 모든 레이아웃에서 `env(safe-area-inset-*)`로 노치/홈바 영역을 피하고, 뷰포트는 `viewport-fit=cover`, 높이는 `100dvh`를 사용한다.

## 4-A. 터치 인터랙션 사양
- 타일 터치 영역은 최소 44×44px. 타일이 작아지는 상황에서는 시각 크기와 별개로 히트 영역을 확장한다.
- dnd-kit은 PointerSensor(마우스) + TouchSensor(터치, activation delay 100ms, tolerance 8px)를 함께 사용하고, 타일과 랙에는 `touch-action: none`을 적용해 스크롤·브라우저 제스처와 충돌하지 않게 한다.
- 드래그 중 테이블 가장자리에 닿으면 자동 팬(edge auto-scroll), 두 손가락 핀치는 테이블 줌에만 사용한다.
- 더블탭: 랙의 타일을 "가장 적합한 조합 슬롯"으로 자동 배치하는 제안(유효해질 때만 동작).
- 롱프레스: 조합 전체 선택 후 한 번에 이동.
- 햅틱: 집기(tick), 스냅(tick), 조합 유효(success), 무효 거부(warning), 페널티(error), 승리(success 연타). 설정에서 끌 수 있어야 한다.
- 모든 호버 전용 UI에는 터치 대체 수단을 제공한다.

## 5.4' 성능/접근성 (보강)
- 저사양 Android WebView를 기준 기기로 삼는다. 런타임 프레임 시간을 측정해 품질 등급을 자동 하향(High/Medium/Low)한다.
  - High: 전체 효과
  - Medium: 보케 배경 정지, 파티클 50% 감소, 그림자 레이어 축소
  - Low: 파티클/글리치/배경 모션 제거, 타일 이동 애니메이션만 유지
- `filter: blur`, 큰 `backdrop-filter`, 다중 box-shadow 남발을 피하고, 네온 글로우는 사전 렌더링한 레이어나 단일 shadow로 처리한다.
- 애니메이션은 transform/opacity만 사용하고, 타일 100개 이상 상황에서도 프레임 드랍 없이 동작해야 한다.
- 설정 화면에서 품질 등급 수동 선택, 모션 감소, 고대비, 색약 모드, 사운드/햅틱 토글을 제공한다.

## 5-A. 앱 생명주기와 네트워크 (신규 필수)
- 앱이 백그라운드로 가면 소켓이 끊길 수 있다. 포그라운드 복귀 시 즉시 재연결하고 `version`을 기준으로 `state:sync` 재동기화, 진행 중이던 드래그 초안(draft)은 안전하게 폐기한다.
- 서버 타이머는 클라이언트와 무관하게 계속 흐른다. 내 턴에 백그라운드로 가 있었다면 복귀 시 남은 시간과 상태를 명확히 보여준다.
- 푸시 알림: 로그인 후 `device:register {platform, token}` 이벤트로 토큰을 서버에 등록한다. 내 턴이 왔는데 앱이 비활성 상태면 FCM(APNs 경유)으로 "당신의 차례예요" 푸시를 보내고, 탭하면 해당 룸으로 딥링크 이동한다. 알림 권한은 첫 게임 종료 후처럼 맥락이 있을 때 요청한다.
- 네트워크 전환(Wi-Fi↔LTE)과 오프라인을 감지해 상단에 "재연결 중" 네온 배너를 표시하고, 지수 백오프로 재접속한다. 소켓 transport는 websocket 우선.
- 딥링크: 커스텀 스킴 `rummi://join/ABCD`와 유니버설/앱 링크 `https://<domain>/join/ABCD`를 모두 지원해 초대 링크 하나로 웹과 앱 어디서든 입장한다. 앱이 없는 환경에서는 웹으로 폴백한다.
- 게임 중 화면 꺼짐 방지(keep-awake), 방 나가기/앱 종료 시 정리 처리.

## 5-B. 계정/세션
- 1단계: 게스트 로그인(닉네임 + 기기 토큰 기반 익명 세션), 세션 토큰은 Preferences/웹 스토리지에 저장.
- 2단계(옵션): Apple/Google 로그인. 스토어 정책상 소셜 로그인을 제공하면 iOS에서는 Sign in with Apple도 함께 제공해야 한다.

## 6'. 구현 순서 (교체)
1. packages/rules + 테스트
2. packages/protocol + apps/server
3. apps/client 웹 UI, 드래그앤드롭(마우스+터치), 반응형 4프리셋
4. 서버 연동, 낙관적 UI, 재접속, 상대 관전 고스트
5. 컨셉 애니메이션/사운드 + 품질 등급 자동 조절
6. packages/platform 구현 후 Capacitor 연동(iOS/Android 프로젝트 생성, 햅틱/딥링크/푸시/생명주기/keep-awake)
7. PWA 설정, 앱 아이콘/스플래시, 스토어 제출 준비(개인정보처리방침 URL, 연령 등급, 스크린샷 시나리오)
8. 봇, E2E(Playwright), 모바일 스모크 테스트(Maestro 등), README

## 7'. 산출물/완료 조건 (교체)
- `pnpm dev`로 서버+웹 실행, 브라우저 탭 2~4개로 대전 가능.
- `pnpm cap:ios` / `pnpm cap:android`로 시뮬레이터/에뮬레이터에서 앱 실행, 웹과 앱 사용자가 같은 방에서 대전 가능.
- 웹에서 만든 초대 링크를 모바일 앱으로 열면 해당 방에 입장한다.
- 앱을 백그라운드 → 복귀해도 게임 상태가 정확히 복구된다.
- 저사양 Android 에뮬레이터에서도 Low 등급으로 조작이 끊기지 않는다.
- 기존 룰/보안 완료 조건(상대 손패 비노출 테스트 포함)을 모두 만족한다.