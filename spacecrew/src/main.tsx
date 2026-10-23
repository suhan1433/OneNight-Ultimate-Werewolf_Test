/**
 * 더 크루: 행성 9를 찾아서 — 장면 중심 UI 재설계
 *
 * [서버 계약] 소켓 이벤트·페이로드는 원본과 동일(ROOM_CREATE/ROOM_JOIN/ROOM_LEAVE/ROOM_STATE/MISSION_SET/PLAYER_READY/GAME_START/
 *  GAME_RESTART/CARD_PLAY/COMMUNICATE/TASK_ASSIGN/TARGET_SELECT/DECISION_RESPONSE/DISTRESS_VOTE/DISTRESS_PASS/TOKEN_EDIT(_SKIP)/TASK_TRANSFER(_SKIP)).
 *
 * [가정 — 서버 코드를 보지 못해 원본 클라이언트 동작에서 추정한 부분]
 *  1. phase: 'lobby' | 'result' | 'assign' | 'chooseTarget' | 'tokenEdit' | 'taskTransfer' | 'distressVote' | 'distressPass' 만 구분하고,
 *     그 밖의 모든 phase 이름은 "카드 플레이"로 취급한다(view.ts 의 KIND).
 *  2. 트릭 종료 = 비어 있지 않던 game.trick 이 비워지고 lastTrick.winnerId 가 있는 순간. lastTrick.cards 가 있으면 마지막 카드까지 보여주고,
 *     없으면 직전 trick + 내가 낸 카드(myPlay)로 채우며 다른 사람의 마지막 카드는 뒷면으로 둔다.
 *  3. comm.marker 문자열은 '높/낮/유일/high/low/only/▲▼●' 등 키워드로 해석한다(lib.ts spotOf). 해석 못 하면 원문을 그대로 표시.
 *  4. game.log 는 오래된 → 최신 순. 마지막 요소를 "최근 이벤트"로 쓴다.
 *  5. 통신 창 = playing && trick 이 비어 있음 && commFrom 이후 && 내 comm 없음 && !(special==='noComm' && targetId===나). 차례와 무관.
 *     데드 존(mission.deadZone) 미션은 마커 미리보기를 숨긴다.
 *  6. GAME_RESTART 는 대기실(lobby)로 돌아가는 이벤트이며 방장만 호출한다(원본과 동일). 실패 화면의 "재도전" 버튼도 이 이벤트를 쓴다.
 *  7. 과제 달성 연출은 판정 직전/직후 tasks[].done 변화로 감지한다. 달성된 과제 카드 id 가 트릭의 카드 id 와 같다고 가정.
 *  9. 진행 순서는 players 배열 순서로 이어지며, 트릭 선도(trick[0] → leaderId → turnId)부터 시계 방향이라고 가정한다(하단 승무원 보드의 번호).
 *  8. mission.special==='noComm', 'finalPattern' 등 special 값은 원본 코드에 나온 것만 처리한다.
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, type Socket } from 'socket.io-client';
import './styles.css';
import type { DrawerTab, Game, Request, Send, Session } from './types';
import { clearSession, readSession, saveSession, tutorialSeen, watchAppHeight } from './lib';
import { useGameView } from './view';
import { Confirm, Starfield } from './ui';
import { Title } from './Title';
import { Lobby } from './Lobby';
import { Table } from './Table';
import { Drawer } from './Drawer';
import { Tutorial } from './Help';

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [drawer, setDrawer] = useState<{ open: boolean; tab: DrawerTab }>({ open: false, tab: 'help' });
  const [tutorial, setTutorial] = useState(() => !tutorialSeen());
  const leavingRef = useRef(false);
  const { view, recordPlay, dismissBriefing } = useGameView(game);

  useEffect(() => watchAppHeight(), []);
  useEffect(() => {
    const next = io({ path: '/api/spacecrew/socket/', transports: ['websocket', 'polling'] }); setSocket(next);
    next.on('ROOM_STATE', (state: Game) => { if (leavingRef.current) return; setGame(state); });
    next.on('ERROR', ({ message }: { message: string }) => setError(message));
    next.on('ROOM_KICKED', ({ message }: { message: string }) => { leavingRef.current = true; clearSession(); setGame(null); setDrawer(d => ({ ...d, open: false })); setError(message); });
    next.on('connect', () => { // 재접속 복구
      leavingRef.current = false; setError(''); setOnline(true);
      const previous = readSession();
      if (previous) next.emit('ROOM_JOIN', previous, (reply: { ok: boolean }) => { if (!reply.ok) clearSession(); });
    });
    next.on('disconnect', () => { if (!leavingRef.current) setOnline(false); });
    return () => { next.close(); };
  }, []);
  useEffect(() => { if (!error) return; const id = window.setTimeout(() => setError(''), 3500); return () => window.clearTimeout(id); }, [error]);

  const request: Request = async (event, payload = {}) => {
    try {
      return await new Promise<unknown>((resolve, reject) => {
        if (!socket) return reject(Error('연결 중입니다.'));
        socket.emit(event, { ...payload, code: game?.code ?? payload.code }, (reply: { ok: boolean; data?: unknown; error?: string }) => reply.ok ? resolve(reply.data) : reject(Error(reply.error)));
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '요청을 처리하지 못했어요.'); throw reason; }
  };
  const send: Send = (event, payload) => { request(event, payload).catch(() => undefined); };
  const doLeave = () => {
    setConfirmLeave(false);
    leavingRef.current = true; socket?.emit('ROOM_LEAVE', { code: game?.code }); clearSession(); setGame(null); setDrawer(d => ({ ...d, open: false }));
    window.setTimeout(() => { socket?.disconnect(); socket?.connect(); }, 200);
  };
  const leave = () => { if (game && game.phase !== 'lobby' && game.phase !== 'result') setConfirmLeave(true); else doLeave(); };
  const openDrawer = (tab: DrawerTab) => setDrawer({ open: true, tab });

  return <>
    <Starfield />
    {!game ? <Title request={request} onSession={reply => saveSession(reply as Session)} onHelp={() => openDrawer('help')} />
      : game.phase === 'lobby' ? <Lobby game={game} send={send} onLeave={leave} onHelp={() => openDrawer('help')} />
      : view && <Table game={game} view={view} send={send} recordPlay={recordPlay} dismissBriefing={dismissBriefing} openDrawer={openDrawer} onLeave={leave} />}
    {drawer.open && <Drawer onClose={() => setDrawer(d => ({ ...d, open: false }))} game={game} />}
    {!game && tutorial && <Tutorial onDone={() => setTutorial(false)} />}
    {confirmLeave && <Confirm title="미션을 중단할까요?" body="진행 중인 미션에서 나가면 다른 승무원의 게임이 중단될 수 있어요." confirmLabel="나가기" onConfirm={doLeave} onCancel={() => setConfirmLeave(false)} />}
    {!online && game && <div className="conn-banner" role="status"><i aria-hidden="true" />신호가 끊겼어요 · 다시 연결하는 중…</div>}
    {error && <div className="toast" role="alert" onClick={() => setError('')} title="눌러서 닫기">{error}</div>}
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
