# 시크릿 히틀러 · Secret Hitler

5~10인 실시간 멀티플레이. 서버가 역할·정책·투표·권한을 판정하고, 각 참가자에게 허용된 정보만 전송합니다. 홈과 대기실은 `../avalon`의 React/Vite + Socket.IO 흐름을 참고했으며 시크릿 히틀러 규칙과 상태는 독립 구현했습니다.

## 실행

Node.js 22 이상. 이 폴더에서 실행합니다. 부모 프로젝트의 npm workspace와 독립되어 있습니다.

```sh
npm ci
npm run dev
```

- 웹: **http://localhost:5179/secret_hitler/**
- 서버: http://localhost:3007/health
- 개발 프록시가 Socket.IO를 서버에 연결합니다. 다른 기기에서 개발 서버에 접속하려면 `WEB_ORIGIN`에 해당 LAN 주소와 포트를 추가하십시오.
- 이름과 신분증 사진 선택 → 새 의회 개설 → 초대 링크 전달 → 5~10명 준비 완료 → 개회 선언.
- 혼자 확인할 때는 **훈련 의원 추가**로 4명 이상 채웁니다. 봇은 본인에게 허용된 정보만 사용합니다.
- 모바일 브라우저에서도 같은 링크로 참가합니다. 음향은 기본 꺼짐이며 상단 음향 버튼을 눌러 활성화합니다.

빌드 후 한 서버에서 서비스:

```sh
npm run build
npm start
# http://localhost:3007/secret_hitler/
```

Docker:

```sh
docker compose up --build -d
```

HTTPS 역방향 프록시는 `/secret_hitler/socket.io`의 WebSocket 업그레이드를 전달해야 합니다. 이 서버는 장시간 실행되는 Node 프로세스용입니다. 여러 서버 인스턴스에서 같은 게임을 동시에 운영하거나 Vercel의 단기 실행 함수에 배포하는 구조는 아닙니다. 상위 프로젝트의 Render 통합 배포에서는 내부 포트 `3008`로 실행되며, 게임 선택 화면과 `/secret_hitler/`에서 접속합니다. 배포 및 저장 경로 설정은 상위 `README.md`를 참고하십시오.

## 저장과 재접속

- `.env.example`은 설정 예시입니다. 자동으로 로드하지 않습니다. 환경변수를 export하거나 호스팅 서비스에 설정하십시오.
- `DATA_DIR` 기본값은 서버 실행 디렉터리의 `.data`입니다. `npm start` 사용 시 `apps/server/.data`입니다. 운영에서는 별도의 영속 볼륨 경로를 지정하십시오.
- 서버 명령마다 비공개 append-only JSONL 저널에 복구 스냅샷을 기록하고 fsync합니다. 서버 재시작 시 마지막 완전한 기록을 복구합니다. 게임 중 재시작은 사람들의 재접속까지 일시정지됩니다.
- 브라우저는 재접속용 256비트 토큰을 로컬에 보관합니다. 서버는 토큰의 SHA-256 해시를 저장합니다. 토큰은 공유하지 마십시오.
- 연결이 끊기면 살아 있는 참가자가 돌아올 때까지 일시정지합니다. 연결된 의장이 대기·봇 대체·종료를 선택할 수 있습니다. 의장이 끊기면 연결된 참가자에게 의장을 이전합니다.
- 봇으로 대체한 자리는 원래 토큰으로 복귀할 수 없습니다. 관전으로 다시 입장할 수 있습니다.
- 대기실·종료된 방은 마지막 갱신 1시간 후, 진행 중 방은 24시간 후 정리합니다. 관전자 포함 방 전체 최대 30명을 허용합니다.
- 저널에는 비밀 역할과 정책이 포함됩니다. 정적 파일 경로 밖에 두고 접근 권한을 제한해야 합니다. 기본 파일 권한은 0600, 저장 폴더는 0700입니다.
- 현재 영속 저장은 파일 기반입니다. Redis/PostgreSQL 및 여러 인스턴스 간 분산 동기화는 포함하지 않습니다.

## 규칙과 구현 매핑

기준은 제공된 `Secret_Hitler_Rules.pdf`와 `instruction.md`입니다. 두 문서의 재셔플 시점 차이는 사용자 승인에 따라 **공식 PDF**를 적용했습니다.

| 규칙 | 구현 |
| --- | --- |
| 5~10인 역할 배분·초대 대통령 무작위 선택 | `createGame`, `rule-tables.json` |
| 인원별 밤 정보, 관전·사망자 정보 제한 | `gameView` |
| 임기 제한: 생존 5명 이하면 직전 수상만 제외 | `eligibleChancellors` |
| 과반 투표, 동수 부결, 투표 동시 공개 | `transition`의 `vote` |
| 선거 트래커는 가결 때 유지, 정책 제정 때 초기화 | `enact`, `failedGovernment` |
| 혼란은 임기 제한 해제, 권한 미발동 | `enact(..., true)` |
| 입법: 대통령 폐기 → 수상 제정 | `discard`, `enact` 액션 |
| **입법 종료·혼란 제정 직후** 잔여 3장 미만 재셔플 | `reshuffle`, PDF 4~5쪽 |
| 승인된 거부권은 트래커 +1, 3이면 혼란 | `request_veto`, `answer_veto` |
| 정당만 조사·재조사 금지 | `power: investigate` |
| 특별 선거 뒤 원래 대통령의 다음 생존자로 복귀 | `specialResume`, `advance` |
| 엿보기 순서 보존 | `power: peek` |
| 처형 후 히틀러 외 역할 미공개 | `power: execute`, `gameView` |
| 네 가지 승리 조건 즉시 판정 | `finish`, `vote`, `enact`, `execute` |
| 입법 중 대통령·수상 발언 차단 | 서버 `CHAT` + `canChat` |

명시적 상태 전이: `night → nomination → voting → president_discard → chancellor_enact → executive/nomination`. 거부권은 `veto`, 종료는 `finished`입니다. 순수 규칙 엔진은 React·Socket.IO·연출·시간에 의존하지 않습니다. 거절된 액션은 원본 상태를 변경하지 않습니다.

`packages/shared-types`는 프로토콜과 필터링된 뷰, `packages/rules-engine`은 상태머신·룰 테이블·봇 전략, `apps/server`는 인증·방·저널·스케줄러, `apps/client`는 표시와 입력을 담당합니다.

## 보안·멀티플레이

클라이언트는 액션만 제출합니다. 서버는 세션, 역할, 단계, 대상, 입력 형식을 검증합니다. 방 전체에 원본 게임 객체를 브로드캐스트하지 않습니다. 공용 플레이어 객체는 필드 허용 목록으로 생성합니다. 정책 더미·버린 정책·다른 플레이어의 역할·진행 중 비공개 기록은 전송하지 않습니다.

투표와 역할 확인은 동일 단계에서 동시에 입력할 수 있습니다. 다른 액션은 현재 버전이 일치해야 합니다. 요청 UUID로 동일 명령을 재전송해도 중복 처리하지 않습니다. IP·소켓·채팅별 제한, 방 수·연결 수·메시지 크기 제한을 둡니다. 귓속말·진영 채팅은 없습니다. 음성/WebRTC는 선택 기능으로 이번 구현에는 포함하지 않았습니다.

행동 타이머 기본값은 꺼짐입니다. 30/60/120초를 설정하면 제한 시간 만료 시 미제출 투표는 반대, 다른 결정은 본인 정보만 보는 훈련 의원 전략으로 처리합니다. 역할 확인에는 강제 타이머가 없습니다.

## 모바일·PWA·앱

모바일 반응형 UI, 키보드로 역할 열람, 모달 포커스, 모션 줄이기, 저사양 옵션을 제공합니다. HTTPS 또는 localhost에서 브라우저의 홈 화면 추가/앱 설치 기능을 사용할 수 있습니다. 서비스 워커는 정적 파일만 캐시하며 Socket.IO·게임 상태·개인 정보를 캐시하지 않습니다. 오프라인에서는 게임을 진행하지 않고 연결 복구를 안내합니다.

Capacitor 7 설정과 iOS/Android 의존성이 포함되어 있습니다. 배포된 서버 주소를 지정해 네이티브 프로젝트를 생성할 수 있습니다.

```sh
VITE_SERVER_URL=https://your-game-server.example npm run build:app
npm run native:ios
npm run native:android
npm run native:sync
npm run native:open:ios
# 또는 npm run native:open:android
```

서버 `WEB_ORIGIN`에 `capacitor://localhost,http://localhost,https://localhost`를 추가하십시오. 네이티브 빌드는 Xcode 또는 Android SDK가 필요합니다. 실제 서버 URL·기기 서명 정보가 제공되지 않았으므로 서명된 IPA/APK와 기기 테스트 결과는 포함하지 않습니다. 제공된 PDF 7쪽의 배포 조건을 별도로 확인한 후 스토어 공개를 진행하십시오.

## 검증

```sh
npm run typecheck
npm test                     # 규칙·소켓·20,000판 검증, 약 4~5분
npm run build
npx playwright install chromium
npm run test:e2e             # 실제 브라우저, 빌드가 먼저 필요
```

이미 설치된 Chromium을 사용할 때는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에 실행 파일 경로를 지정할 수 있습니다. 결과는 [테스트 보고서](docs/TEST_REPORT.md), 화면은 `docs/screenshots`, 연출·음향 구현은 [에셋 목록](docs/ASSETS.md)을 참고하십시오.

## 크레딧

원작: Goat, Wolf & Cabbage / Max Temkin, Mike Boxleiter, Tommy Maranges, Mac Schubert. [Secret Hitler](https://www.secrethitler.com/). 비영리 팬 디지털 각색입니다. 원작과 본 각색은 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 조건을 따릅니다. 변경 사항과 출처는 게임 내 크레딧 및 `LICENSE`에 표시했습니다.
