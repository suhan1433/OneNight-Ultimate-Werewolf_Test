# 더 크루: 행성 9 탐사 — 온라인

참고 HTML의 협력 트릭테이킹 규칙을 각 기기에서 접속하는 실시간 방 코드 게임으로 바꾼 버전입니다.

```bash
cd spacecrew
npm install
npm run dev
```

React/Vite 웹 앱은 `http://localhost:5177`에서, Socket.IO 게임 서버는 `http://localhost:3005`에서 실행됩니다. 같은 Wi-Fi의 휴대폰에서는 `localhost` 대신 실행 중인 PC의 LAN IP와 `:5177`을 사용하세요.

프로덕션 정적 앱은 `npm run build`로 `dist/`에 생성됩니다. UI는 `src/main.tsx`, 스타일은 `src/styles.css`, 서버 판정은 `server.mjs`에 있습니다.
