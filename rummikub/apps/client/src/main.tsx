import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PublicView } from '@rummikub/protocol';
import { webPlatform } from '@rummikub/platform';
import { clearSession, emit, ensureConnected, saveSession, session, socket } from './socket.js';
import { Letters, SoundToggle } from './tiles.js';
import { Board } from './Board.js';
import './styles.css';

type Game = ReturnType<typeof useGame>;

const SEATS: Record<number, string[]> = { 2: ['b', 't'], 3: ['b', 'l', 'r'], 4: ['b', 'l', 't', 'r'] };
/** 테이블 둘레 자리 배치: 항상 내가 아래(b), 이후 시계 방향(왼쪽 → 위 → 오른쪽) */
const seatsFor = (n: number) => SEATS[Math.min(4, Math.max(2, n))] ?? SEATS[4]!;

function useGame() {
  const [view, setView] = useState<PublicView | null>(null);
  const [online, setOnline] = useState(socket.connected);
  const [notice, setNotice] = useState('');
  const seq = useRef(0);
  const next = useCallback(() => ++seq.current, []);
  useEffect(() => {
    const onState = (s: PublicView) => { setView(s); setNotice(''); };
    const onReject = ({ reason }: { reason: string }) => setNotice(reason);
    const onConnect = () => { setOnline(true); const saved = session(); if (saved) emit('room:join', { ...saved, clientSeq: next() }).catch(() => { clearSession(); setView(null); }); };
    const onDown = () => setOnline(false);
    socket.on('state:sync', onState); socket.on('turn:rejected', onReject); socket.on('connect', onConnect); socket.on('disconnect', onDown);
    return () => { socket.off('state:sync', onState); socket.off('turn:rejected', onReject); socket.off('connect', onConnect); socket.off('disconnect', onDown); };
  }, [next]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(t); }, [notice]);
  return { view, setView, online, notice, setNotice, next };
}

function Landing({ game }: { game: Game }) {
  const [name, setName] = useState(session()?.name ?? '');
  const [code, setCode] = useState(location.hash.replace('#/join/', '').toUpperCase());
  const [size, setSize] = useState(4);
  const [busy, setBusy] = useState(false);
  type Entry = { roomId: string; playerId: string; sessionToken: string };
  const enter = async (type: 'create' | 'join') => {
    if (!name.trim()) return game.setNotice('닉네임을 입력해 주세요.');
    setBusy(true);
    try {
      await ensureConnected();
      const data = type === 'create' ? await emit<Entry>('room:create', { name, maxPlayers: size, clientSeq: game.next() }) : await emit<Entry>('room:join', { roomId: code, name, clientSeq: game.next() });
      saveSession({ ...data, name }); location.hash = `#/join/${data.roomId}`;
    } catch (e) { game.setNotice(e instanceof Error ? e.message : '입장할 수 없습니다.'); } finally { setBusy(false); }
  };
  return (
    <main className="screen landing">
      <SoundToggle />
      <Letters text="루미큐브" />
      <p className="lede">타일을 모아 조합을 만들고, 손패를 먼저 비우세요.</p>
      <div className="desk">
        <label className="field">닉네임<input value={name} maxLength={16} onChange={e => setName(e.target.value)} placeholder="이름을 입력하세요" /></label>
        <div className="field" role="group" aria-labelledby="size-label">
          <span id="size-label">인원</span>
          <div className="sizes">{[2, 3, 4].map(v => <button key={v} type="button" className="chip" aria-pressed={size === v} aria-label={`${v}명`} onClick={() => setSize(v)}>{v}</button>)}</div>
        </div>
        <button className="primary wide" disabled={busy} onClick={() => enter('create')}>방 만들기</button>
        <div className="or">초대 코드가 있나요?</div>
        <div className="join">
          <label className="field">방 코드<input value={code} maxLength={6} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="6자리" /></label>
          <button disabled={busy || !code} onClick={() => enter('join')}>입장</button>
        </div>
      </div>
      <p className="fine">첫 등록은 30점 이상 · 조커 포함 Sabra 룰</p>
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}

function Lobby({ view, game, onExit }: { view: PublicView; game: Game; onExit: () => void }) {
  const self = view.players.find(p => p.id === view.playerId)!;
  const host = view.hostId === view.playerId;
  const allReady = view.players.length >= 2 && view.players.every(p => p.ready);
  const action = (event: string) => emit(event, { roomId: view.roomId, clientSeq: game.next() }).catch(e => game.setNotice(e.message));
  const invite = () => webPlatform.share.inviteRoom(view.roomId, `${location.origin}${location.pathname}#/join/${view.roomId}`);
  const seats = Math.min(4, Math.max(view.players.length, 2));
  const mineIdx = Math.max(0, view.players.findIndex(p => p.id === view.playerId));
  const slots = Array.from({ length: seats }, (_, i) => i < view.players.length ? view.players[(mineIdx + i) % view.players.length] : undefined);
  const where = seatsFor(seats);
  const readyCount = view.players.filter(p => p.ready).length;
  return (
    <main className="screen lobby">
      <SoundToggle />
      <p className="fine">친구에게 이 코드를 알려주세요</p>
      <button className="code" onClick={invite} aria-label="초대 링크 복사·공유"><Letters text={view.roomId} tilt={false} /><small>눌러서 초대 링크 공유</small></button>
      <section className="round" aria-label="자리">
        <div className="tbl">{allReady ? '모두 준비됐어요' : `${readyCount}/${view.players.length}명 준비`}</div>
        {slots.map((p, i) => (
          <article key={i} className={`chair ${where[i] ?? ''} ${p?.ready ? 'ready' : ''} ${p ? '' : 'empty'}`}>
            <div className="avatar">{p ? (p.isBot ? '봇' : p.name.slice(0, 1)) : '+'}</div>
            <b>{p?.name ?? '빈 자리'}</b><small>{p ? (p.isBot ? '컴퓨터' : p.ready ? '준비 완료' : '대기 중') : '기다리는 중'}</small>
          </article>))}
      </section>
      <div className="btns">
        <button onClick={() => action('room:ready')} className={self.ready ? 'on' : ''}>{self.ready ? '준비 취소' : '준비 완료'}</button>
        {host && <button onClick={() => action('room:fillBots')}>빈 자리 봇으로 채우기</button>}
        {host && <button className="primary" disabled={!allReady} onClick={() => action('game:start')}>게임 시작</button>}
      </div>
      <button className="exit" onClick={onExit}>나가기</button>
      {host && !allReady && <p className="fine">모두 준비하면 시작할 수 있어요.</p>}
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}

function Results({ view, game, onExit }: { view: PublicView; game: Game; onExit: () => void }) {
  const winner = view.players.find(p => p.id === view.roundWinnerId);
  return (
    <main className="screen results">
      <SoundToggle />
      <p className="fine">이번 판의 승자</p>
      <Letters text={winner?.name.slice(0, 4) ?? '—'} />
      <section className="paper"><h2>점수표</h2>{[...view.players].sort((a, b) => b.score - a.score).map((p, i) => <div key={p.id} className={i === 0 ? 'first' : ''}><b>{p.name}</b><strong className={p.score < 0 ? 'neg' : ''}>{p.score > 0 ? '+' : ''}{p.score}</strong></div>)}</section>
      {view.hostId === view.playerId ? <button className="primary" onClick={() => emit('game:lobby', { roomId: view.roomId, clientSeq: game.next() })}>대기실로 돌아가기</button> : <p className="fine">방장이 다음 판을 준비하고 있어요.</p>}
      <button className="exit" onClick={onExit}>나가기</button>
    </main>
  );
}

function App() {
  const game = useGame(); const view = game.view;
  const leave = () => {
    const message = view?.phase === 'playing' ? '진행 중인 게임에서 나가시겠어요? 다시 연결하려면 새로 입장해야 합니다.' : '방에서 나가시겠어요?';
    if (!window.confirm(message)) return;
    clearSession();
    location.hash = '';
    socket.disconnect();
    game.setNotice('');
    game.setView(null);
  };
  if (!view) return <Landing game={game} />;
  if (view.phase === 'lobby') return <Lobby view={view} game={game} onExit={leave} />;
  if (view.phase === 'roundEnd' || view.phase === 'matchEnd') return <Results view={view} game={game} onExit={leave} />;
  return <Board view={view} game={game} onExit={leave} />;
}
createRoot(document.getElementById('root')!).render(<App />);
