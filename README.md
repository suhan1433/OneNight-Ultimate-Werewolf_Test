# 한밤의 늑대인간 온라인

기존 `werewolf.html`의 다크 판타지 시각 언어를 바탕으로 다시 만든, 각자 다른 기기에서 접속하는 실시간 멀티플레이 버전입니다. 게임 판정과 타이머는 서버가 담당하며 Redis가 유일한 게임 상태 저장소입니다.

## 빠른 실행

Node.js 22와 Redis가 필요합니다.

```bash
npm install
redis-server
npm run dev
```

- 웹: `http://localhost:5173`
- API/Socket.IO: `http://localhost:3001`
- 상태 확인: `http://localhost:3001/health`

Redis가 다른 주소라면 `.env.example`을 참고해 `REDIS_URL`을 설정합니다. 스마트폰에서는 Vite 주소의 `localhost` 대신 개발 PC의 LAN IP로 접속하고, `VITE_SOCKET_URL`도 같은 PC의 `3001` 포트로 지정합니다.

## Docker 멀티 서버 실행

```bash
docker compose up --build
```

`http://localhost:8080`에서 접속합니다. Nginx가 두 Node 서버에 sticky routing(`ip_hash`)을 적용하고, 두 서버는 Socket.IO Redis Adapter와 같은 Redis 게임 상태를 공유합니다. WebSocket만 쓸 때는 sticky session이 필수는 아니지만 polling fallback의 연속 요청을 같은 인스턴스에 유지하기 위해 설정했습니다.

## GitHub + Vercel 배포

이 프로젝트는 Vercel에 프런트엔드만 배포해야 합니다. `apps/server`는 Socket.IO 연결을 계속 유지하고 400ms 주기 스케줄러를 실행하므로, Vercel의 일반 정적 배포/함수 모델에 넣을 수 없습니다. 서버는 Docker를 지원하는 지속 실행 호스트(Render, Railway, Fly.io 등)에 배포하고, Redis는 TLS를 지원하는 관리형 Redis(예: Upstash)에 연결합니다.

저장소를 GitHub에 push한 뒤 Vercel에서 해당 저장소를 import하면 루트의 `vercel.json`이 다음을 설정합니다.

- Build Command: `npm run build -w @werewolf/shared && npm run build -w @werewolf/web`
- Output Directory: `apps/web/dist`
- Install Command: `npm ci`

Vercel 프로젝트 환경 변수에는 `VITE_SOCKET_URL=https://배포된-서버-주소`를 추가합니다. 서버 환경 변수에는 `REDIS_URL=rediss://...`, `WEB_ORIGIN=https://배포된-vercel-주소`, `PORT=3001`을 추가합니다. `WEB_ORIGIN`에는 쉼표로 여러 Preview/Production 주소를 넣을 수 있습니다.

Vercel에서 Root Directory를 `apps/web`로 바꾸면 루트 workspace와 `packages/shared`를 빌드에서 볼 수 없으므로, 이 저장소에서는 Root Directory를 저장소 루트(`.`)로 유지해야 합니다. GitHub push 후 Vercel이 자동으로 Preview/Production 배포를 생성합니다.

## 구현 구조

```text
apps/web       React + TypeScript + Zustand + Framer Motion
apps/server    Express + Socket.IO + Redis 게임 서비스/스케줄러
packages/shared 역할, 타입, 이벤트, 사회자 문장
infra          Nginx 멀티 서버 프록시
```

서버의 모든 변경 명령은 다음 경로를 따릅니다.

```text
Socket command → 세션/입력 검증 → Redis 분산 락 → 순수 게임 엔진
               → Redis 저장 → 플레이어별 비공개 view 생성 → Socket 전송
```

전체 `Room`을 클라이언트로 전송하지 않습니다. 각 플레이어는 자신의 최초 역할과 자신의 행동 결과만 받고, 다른 플레이어의 역할은 결과 단계 전까지 payload에 포함되지 않습니다. 재접속 토큰은 브라우저 `localStorage`에 저장되며 서버의 토큰과 일치할 때만 같은 플레이어로 복구됩니다.

밤 타이머의 `expiresAt`은 Redis 상태에 저장됩니다. 모든 서버의 짧은 scheduler가 만료를 감시하지만 분산 락을 얻은 서버 하나만 전이를 적용하므로, 프로세스가 중단돼도 다른 서버가 timeout/다음 행동을 이어갑니다. 실제 소유자가 없는 선택 역할도 큐에 들어가며, 역할 보유 여부를 유추할 수 없도록 설정된 행동 시간 전체가 지난 뒤 자동 `skipped` 처리됩니다.

## 게임 흐름

1. 방장이 3~10명과 인원수 + 3장의 역할을 선택해 방을 만듭니다.
2. 참가자가 6자리 코드로 입장하고 전원이 준비합니다.
3. 서버가 역할을 섞어 배정하고 각 기기에 본인 카드만 보냅니다.
4. 전원이 카드를 확인하면 서버가 밤 역할을 정해진 순서로 진행합니다.
5. 각 행동은 3/5/10/15초 안에 제출하며 미제출 시 자동으로 넘어갑니다.
6. 낮에는 사용 역할, 밤 순서, 공개 단서, 채팅과 서버 토론 타이머가 표시됩니다.
7. 투표는 완료 인원만 공개되고 전원 완료 시 최종 역할·투표·처형·승리 진영을 공개합니다.
8. 결과 확인 후 방장이 모든 참가자를 같은 방의 대기실로 돌려보낼 수 있으며, 각 참가자는 상단 `나가기` 버튼으로 방을 떠날 수 있습니다.

브라우저 TTS는 서버가 모든 접속자에게 보낸 동일한 `NARRATOR_SPEECH` 문장을 재생합니다. 음소거는 기기별 설정이며 다른 플레이어에게 영향을 주지 않습니다. 브라우저 정책상 첫 사용자 제스처 전에는 음성이 제한될 수 있습니다.

## 검증

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e -w @werewolf/web
```

Unit test는 역할 배정(3/5/10명), 밤 순서와 부재 역할, timeout 전이, 동률/1표 투표, 보디가드, 왕자, 사냥꾼, 저주받은 자와 주요 승리 조건을 검증합니다. Playwright E2E는 Docker 구성이 실행 중일 때 세 개의 독립 브라우저 컨텍스트로 방 생성부터 결과까지 검증합니다.

## 구현 작업 로그

- Phase 1–3: workspace, React/Express/Socket.IO/Redis 기반과 공유 역할 정의, 로비/역할 선택/서버 배정 완료
- Phase 4–6: 개인 카드 view, 3D reveal, Redis authoritative 밤 큐/타이머, 역할 행동, 공통 TTS 완료
- Phase 7–10: 낮 공개 정보/채팅, 비공개 투표, 보정 및 승패, 결과/도움말 완료
- Phase 11: Redis Adapter, 분산 락, 재접속, 프로세스 재시작 후 timer recovery, Nginx 2-server Compose 완료
- Phase 12: 게임 엔진 unit test, 타입 검사 및 production build 구성 완료

운영 환경에서는 Redis TLS/인증, HTTPS, rate limit, 방 정리 정책과 관측 시스템을 배포 플랫폼에 맞게 추가하십시오.
