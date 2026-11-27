# Lumen Tether · 루멘 테더

좌우 이동과 자동 사격으로 탄막을 피하는 1–2인 협동 슈터입니다. 게임 선택 화면의 **루멘 테더** 카드에서 입장합니다.

## 실행

저장소 루트에서 Node.js 22로 실행합니다.

```sh
npm --prefix hushfall ci
npm run dev:hushfall
```

개발 주소는 **http://localhost:5181/hushfall/** 입니다. 같은 Wi-Fi에서 테스트할 때는 두 기기 모두 개발 PC의 LAN IP로 접속합니다. 호스트는 온라인 2인에서 방을 만들고 링크 또는 5자리 코드를 보냅니다. 게스트가 준비하면 호스트가 출격합니다.

```sh
npm run build:hushfall
npm --prefix hushfall start
```

빌드 후 단독 실행 주소는 **http://localhost:3012/hushfall/** 입니다. 통합 Render 배포는 루트 `npm run build:render`와 기존 Docker/Nginx 진입점을 사용합니다. 클라이언트는 `/hushfall/`, 웹소켓은 `/api/hushfall/socket`, 상태 확인은 `/api/hushfall/health`입니다. 온라인 플레이 환경은 WebSocket 업그레이드가 가능한 장기 실행 Node 프로세스가 필요합니다.

## 플레이

- 솔로와 온라인은 A/D 또는 방향키로 이동하고 Space로 기체 스킬, E로 Nova 또는 Duet을 사용합니다. 모바일은 아래쪽에서 좌우로 드래그하고 하단 버튼으로 스킬을 사용합니다.
- 로컬 2인은 P1이 A/D, W, S를 쓰고 P2가 방향키를 씁니다. 터치 화면은 좌우 절반을 각각 사용합니다.
- 두 기체가 가까워지면 테더가 연결됩니다. 공명 100에서 둘이 1초 안에 Duet을 누르면 탄막을 걷어냅니다. 파트너 잔해에 겹쳐 정지하면 구조할 수 있습니다.
- 항해는 5개 구역을 이어서 진행합니다. 무한 모드는 이후 구역이 반복되며 강해지고, 오늘의 항해는 같은 UTC 날짜에 같은 시드로 첫 번째 구역에 도전합니다. 강화는 전투 중 제한된 시점과 재정비 구간에 고르고, 보스를 쓰러뜨리면 관문에서 유물과 경로를 선택합니다.
- 빌드된 PWA는 최초 접속 후 오프라인 솔로와 로컬 2인을 지원합니다. 솔로는 구역 시작점에서 이어할 수 있습니다. 최고 점수와 Stardust는 이 브라우저에 저장되며 설정의 백업 코드로 병합할 수 있습니다.

## 검증

```sh
npm --prefix hushfall run lint
npm --prefix hushfall test
npm run build:hushfall
PLAYWRIGHT_CHANNEL=chrome npm --prefix hushfall run test:browser
PLAYWRIGHT_CHANNEL=chrome npm run test:selector
```

브라우저 기본은 Playwright Chromium입니다. 설치된 Chrome을 쓸 때는 위처럼 채널을 지정합니다. 두 브라우저 사이에 지연과 손실을 추가하려면 게임 주소에 `?netsim=120,30,5`를 붙입니다. 세 값은 RTT(ms), 지터(ms), 손실률(%)입니다.

밸런스는 [src/data/flight.ts](src/data/flight.ts)에서 관리합니다. 적을 추가할 때는 적 정의와 웨이브의 타입 인덱스, 렌더러의 적 스타일을 함께 등록합니다. 카드는 정의의 ID와 수치를 추가한 뒤 시뮬레이션의 해당 스탯 적용 지점에 연결합니다. 패턴은 발사 간격·탄수·탄속·예고를 패턴 정의에서 조정하고, 새 종류만 `bossAttack`에 추가합니다. 런 데이터 호환성이 깨지는 변경에서는 체크포인트 버전을 올립니다.

### 현재 검증 결과

- 기반 및 전투. 같은 입력 1,000틱의 상태가 일치했고, 탄 700개 헤드리스 스트레스 1,000틱은 개발 Mac에서 약 50ms가 걸렸습니다. 두 봇이 첫 보스를 격파하고 관문을 통과했습니다.
- 빌드. 진입 JavaScript 116.28kB(gzip), PWA 프리캐시 648.72KiB입니다.
- 멀티플레이. 데스크톱과 모바일 크기의 Chrome 두 컨텍스트에서 방 생성·링크 참가·준비·출격·일시정지·게스트 새로고침 재접속·결과·대기실 복귀를 확인했습니다. WebRTC를 끄고 120ms RTT, 30ms 지터, 5% 손실을 주입한 WebSocket 연결에서도 통과했습니다. 오프라인 솔로와 새로고침 후 체크포인트 재개도 통과했습니다.
- 렌더링. 데스크톱 Chrome 소프트웨어 렌더러의 짧은 초기 전투 샘플은 41 FPS, p95 33ms였습니다. 물리 모바일 기기의 성능 기준은 실기기 QA 범위로 남아 있습니다.
- 배포. Vite 프록시에서 방 생성을 확인했고 Render용 정적 빌드 복사와 시작 스크립트 문법을 검사했습니다. Docker 데몬이 꺼져 있어 컨테이너 통합 실행은 미검증입니다.

검증과 추가 콘텐츠 범위는 [BACKLOG.md](BACKLOG.md)에 정리했습니다.

전투와 난이도의 최신 검증은 [PLAYTEST.md](PLAYTEST.md)에 기록합니다.
