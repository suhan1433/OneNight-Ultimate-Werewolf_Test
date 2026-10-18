# Rummikub — Neon Noir Parlor

Sabra 룰 기반의 2–4인 실시간 루미큐브입니다. 각 게임은 서버가 권위를 가지며, 클라이언트에는 본인 손패와 공개 테이블만 전달됩니다.

## Run

```bash
cd rummikub
npm install
npm run dev
```

- Client: `http://localhost:5177`
- Socket/health server: `http://localhost:3010/health`
- 두 브라우저 탭에서 한 사람이 방을 만들고, 표시된 6자리 코드(또는 공유 링크)로 다른 사람이 입장합니다.
- 방장은 `봇으로 채우기`를 사용해 빈 좌석을 채울 수 있습니다.

```bash
npm run build
npm test
npm run typecheck
```

## Structure

- `packages/rules`: 순수 Sabra 규칙, 106장 덱, 시드 셔플, 멜드/턴 검증 및 점수 계산
- `packages/protocol`: Socket 이벤트 입력 검증(zod) 및 비공개 정보가 빠진 `PublicView`
- `packages/platform`: 웹 구현체. UI가 플랫폼 API를 직접 참조하지 않도록 하는 저장소·공유·햅틱·생명주기 추상화
- `apps/server`: 메모리 `GameStore` 기반 Socket.IO 서버. Redis 구현체로 교체 가능한 경계
- `apps/client`: React/Vite PWA 셸, 네온 느와르 보드 및 반응형 터치 타일 랙

## Rule defaults

기본값은 Sabra 룰 사양을 따릅니다: 첫 등록 30점, 턴 120초, 타임아웃 페널티 3장, 조커 페널티 30점, 한 멜드의 조커 2장 허용, 조커 재사용 `free`입니다. 첫 등록 중 기존 테이블 조작은 기본적으로 허용하지 않습니다. 방 생성 API는 모든 `RuleConfig` 값을 받아 서버에서 검증합니다.

## Multiplayer and privacy

서버의 내부 상태에는 `hands: Record<playerId, TileId[]>`가 있지만 송신하는 `PublicView`에는 요청자 자신의 `hand`만 담깁니다. 다른 플레이어는 `handCount`만 받습니다. `apps/server/src/game.test.ts`가 이를 검증합니다.

클라이언트는 드래그/선택으로 로컬 초안을 편집하고 `turn:commit`에 의도만 보냅니다. 서버가 버전, 차례, 타일 보존, 최초 등록, 모든 멜드의 유효성을 다시 확인합니다. 거부되면 최신 서버 상태로 동기화됩니다.

## Native shells

`packages/platform`은 Capacitor 연결 지점으로 준비되어 있습니다. 실제 iOS/Android 네이티브 프로젝트와 푸시 인증서는 Apple/Google 서명 자격 증명이 필요한 별도 배포 단계입니다. 해당 환경에서 Capacitor를 추가한 뒤 루트의 `cap:ios` / `cap:android` 명령을 사용할 수 있습니다.
