# 검증 결과

검증일: 2026-11-08. 환경: macOS arm64, Node 22.16.0, pnpm 10.11.0, Chromium(Playwright).

| 검증 | 결과 |
| --- | --- |
| `pnpm typecheck` | shared / server / web 통과 |
| `pnpm test` | 공유 엔진 77개 + 서버 통합 7개, 총 84개 통과 |
| 시드 스트레스 매트릭스 | 위 테스트 안에서 1,080개 게임, 인원·난이도·이벤트·승리 조건 변화 |
| `pnpm build` | shared / server / web 프로덕션 빌드 통과 |
| `pnpm test:e2e` | 독립 브라우저 컨텍스트를 사용하는 4개 시나리오 통과 |
| 6인 전체 3라운드 | 타일 교체, 좌석순 발표 후 범인팀 승리 |
| 모바일 대기실 | 도움말, QR, 채팅, 방장 추방, 나가기 |
| 6인 정답 | 역할 확인부터 수사팀 승리까지 |
| 12인 반전 | 정답, 비밀 채팅, 목격자 지목 후 범인팀 역전 |
| 모바일 크기 | 360×640 / 390×844 가로 넘침 없음, 공개 카드 8장 세로 스크롤 없이 표시 |
| 복귀·메모 | 새로고침 복귀, 메모 저장, 입력 포커스 유지 |
| JavaScript 빌드 | 초기 단일 청크 gzip 약 137.91KB, 명세 목표 250KB 이내 |

E2E 실행 시간은 약 3.2분이었다. 밤의 고정 40초를 테스트에서 생략하지 않았다. 원본 실행 결과는 [e2e-results.json](e2e-results.json), 이미지 목록은 [M2 보고서](M2.md)에 있다.

정답·비공개 역할·범인 ID·덱·RNG에 대한 실제 Socket.IO payload 검증과 밤 종료 로컬 수신 편차 50ms 미만 검사를 포함했다. 인터넷 회선의 전송 지연이나 물리 기기의 성능·오디오·진동을 보증하지 않는다. PWA 오프라인 shell과 실제 기기 접근성의 전체 감사는 별도 검증 항목이다.

M3의 이벤트 전원 확인·이론 핀·망설임 전달·세부 연출 완성, 선택 테이블 모드 및 v2 확장 역할은 이 통과 결과에 포함되지 않는다.

## Render 통합 배포 검증

2026-11-08 추가 검증. 독립 실행용 `/` 빌드와 함께 통합 `/deception/` 빌드를 지원한다.

- `npm run build:render`: 기존 5개 게임과 deception 전체 빌드 통과.
- `pnpm --dir deception typecheck`: 통과.
- `docker build -f apps/server/Dockerfile`: 이미지 빌드 및 컨테이너 실행 통과.
- 루트 `docker build`: 이미지 빌드 및 컨테이너 실행 통과.
- `docker build -f apps/web/Dockerfile`: 정적 웹 이미지 빌드 통과. Nginx 설정과 `/deception/`의 HTML·서비스 워커·manifest 포함 확인.
- 두 Render 컨테이너의 `nginx -t`: 통과.
- 기존 게임 5개와 deception, 내부 서버 6개의 `/health`: 정상 응답.
- 두 Render 이미지에 `test:render` 실행: 선택 카드 6개, `/deception` 리다이렉트와 초대 코드 보존, 정적 자산, PWA scope `/deception/`, 다른 캐시 보존, 두 브라우저의 방 입장·채팅·새로고침 복귀 통과.
- 브라우저 Socket.IO 요청은 `/api/deception/socket/`으로만 전달되며, 공개 Nginx에서 내부 `3007` 서버로 연결된다.

검증용 컨테이너는 로컬에서 실행했으며 클라우드 서비스 설정을 변경하지 않았다. 실행 방법은 [README](../README.md)의 Render 절차를 따른다.

[선택 화면](screenshots/selector-render-mobile.png) · [Nginx 경유 대기실](screenshots/lobby-render-mobile.png)
