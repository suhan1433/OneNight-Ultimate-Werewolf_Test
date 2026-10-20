import { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PublicView } from '@rummikub/protocol';
import { webPlatform } from '@rummikub/platform';
import { clearSession, emit, ensureConnected, saveSession, session, socket } from './socket.js';
import { COLORS, Letters, SoundToggle } from './tiles.js';
import { sfx } from './sound.js';
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
    const onKicked = ({ reason }: { reason?: string }) => { clearSession(); location.hash = ''; setView(null); setNotice(reason ?? '방장에서 강퇴되었습니다.'); };
    const onConnect = () => { setOnline(true); const saved = session(); if (saved) emit('room:join', { ...saved, clientSeq: next() }).catch(() => { clearSession(); setView(null); }); };
    const onDown = () => setOnline(false);
    socket.on('state:sync', onState); socket.on('turn:rejected', onReject); socket.on('room:kicked', onKicked); socket.on('connect', onConnect); socket.on('disconnect', onDown);
    return () => { socket.off('state:sync', onState); socket.off('turn:rejected', onReject); socket.off('room:kicked', onKicked); socket.off('connect', onConnect); socket.off('disconnect', onDown); };
  }, [next]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(t); }, [notice]);
  return { view, setView, online, notice, setNotice, next };
}

/** 배경에서 천천히 떠오르는 타일들: 장식일 뿐이라 스크린 리더와 터치에서는 빠진다. */
const FLOATERS = [[6, 0, 26, 38, -12, 7, 'red'], [16, 9, 32, 30, 8, 11, 'blue'], [27, 4, 29, 44, -6, 3, 'black'], [39, 14, 35, 34, 14, 9, 'orange'], [51, 2, 27, 40, -9, 12, 'red'], [62, 11, 31, 32, 6, 5, 'blue'],
  [73, 6, 34, 42, -14, 1, 'orange'], [84, 15, 28, 36, 10, 8, 'black'], [92, 3, 33, 30, -5, 13, 'red'], [45, 19, 38, 28, 12, 6, 'blue']] as const;
const Ambient = () => (
  <div className="lb-amb" aria-hidden="true">
    {FLOATERS.map(([x, delay, dur, size, rot, v, c], i) => (
      <i key={i} className={c} style={{ ['--x' as string]: `${x}%`, ['--delay' as string]: `-${delay}s`, ['--d' as string]: `${dur}s`, ['--s' as string]: `${size}px`, ['--r' as string]: `${rot}deg` }}>{v}</i>
    ))}
  </div>
);
const Crown = () => <svg className="lb-crown" viewBox="0 0 24 24" aria-label="방장" role="img"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5Z" /></svg>;

/** 6칸 타일 모양 코드 입력: 실제 입력은 투명한 input이 받는다(모바일 키보드/붙여넣기 그대로 동작). */
function CodeInput({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter: () => void }) {
  return (
    <label className="lb-code">
      <span className="sr">방 코드</span>
      <input value={value} maxLength={6} autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
        onChange={e => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onKeyDown={e => { if (e.key === 'Enter') onEnter(); }} />
      <span className="lb-slots" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <b key={i} className={`${value[i] ? 'on' : ''} ${i === Math.min(value.length, 5) ? 'cur' : ''}`}>{value[i] ?? ''}</b>)}</span>
    </label>
  );
}

function Landing({ game }: { game: Game }) {
  const [name, setName] = useState(session()?.name ?? '');
  const [code, setCode] = useState(location.hash.replace('#/join/', '').toUpperCase());
  const [size, setSize] = useState(4);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  type Entry = { roomId: string; playerId: string; sessionToken: string };
  const enter = async (type: 'create' | 'join') => {
    if (!name.trim()) return game.setNotice('닉네임을 입력해 주세요.');
    setBusy(type); sfx.pick();
    try {
      await ensureConnected();
      const data = type === 'create' ? await emit<Entry>('room:create', { name, maxPlayers: size, clientSeq: game.next() }) : await emit<Entry>('room:join', { roomId: code, name, clientSeq: game.next() });
      saveSession({ ...data, name }); location.hash = `#/join/${data.roomId}`;
    } catch (e) { game.setNotice(e instanceof Error ? e.message : '입장할 수 없습니다.'); } finally { setBusy(null); }
  };
  return (
    <main className="screen lb lb-landing">
      <Ambient />
      <SoundToggle />
      <header className="lb-hero">
        <Letters text="루미큐브" />
        <p className="lb-tag">타일을 모아 조합을 만들고,<br />손패를 먼저 비우세요</p>
      </header>
      <section className="lb-card" aria-label="입장">
        <label className="lb-field"><span>닉네임</span><input value={name} maxLength={16} autoComplete="nickname" onChange={e => setName(e.target.value)} placeholder="이름을 입력하세요" /></label>
        <div className="lb-field" role="group" aria-labelledby="size-label">
          <span id="size-label">인원</span>
          <div className="lb-seg">{[2, 3, 4].map(v => (
            <button key={v} type="button" aria-pressed={size === v} aria-label={`${v}명`} onClick={() => { setSize(v); sfx.pick(); }}>
              <span className="lb-pips" aria-hidden="true">{Array.from({ length: v }, (_, i) => <i key={i} />)}</span>{v}명
            </button>))}
          </div>
        </div>
        <button className="lb-cta" disabled={!!busy} onClick={() => enter('create')}>{busy === 'create' ? '방을 만드는 중…' : '방 만들기'}</button>
        <div className="lb-or"><i />초대 코드가 있나요?<i /></div>
        <div className="lb-join">
          <CodeInput value={code} onChange={setCode} onEnter={() => { if (code.length >= 4 && !busy) void enter('join'); }} />
          <button className="lb-go" disabled={!!busy || code.length < 4} onClick={() => enter('join')}>{busy === 'join' ? '…' : '입장'}</button>
        </div>
      </section>
      <ul className="lb-rules" aria-label="게임 규칙"><li>첫 등록 30점 이상</li><li>조커 포함</li><li>Sabra 룰</li></ul>
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}

function Lobby({ view, game, onExit }: { view: PublicView; game: Game; onExit: () => void }) {
  const self = view.players.find(p => p.id === view.playerId)!;
  const host = view.hostId === view.playerId;
  const allReady = view.players.length >= 2 && view.players.every(p => p.ready);
  const action = (event: string) => emit(event, { roomId: view.roomId, clientSeq: game.next() }).catch(e => game.setNotice(e.message));
  const setTimer = (turnSeconds: number) => { sfx.pick(); emit('room:setTurnSeconds', { roomId: view.roomId, turnSeconds, clientSeq: game.next() }).catch(e => game.setNotice(e.message)); };
  const kick = (player: PublicView['players'][number]) => {
    if (!window.confirm(`${player.name}님을 강퇴할까요?`)) return;
    emit('room:kick', { roomId: view.roomId, playerId: player.id, clientSeq: game.next() }).catch(e => game.setNotice(e.message));
  };
  const [copied, setCopied] = useState(false);
  const invite = () => { webPlatform.share.inviteRoom(view.roomId, `${location.origin}${location.pathname}#/join/${view.roomId}`); sfx.pick(); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const seats = Math.min(4, Math.max(view.players.length, 2));
  const mineIdx = Math.max(0, view.players.findIndex(p => p.id === view.playerId));
  const slots = Array.from({ length: seats }, (_, i) => i < view.players.length ? view.players[(mineIdx + i) % view.players.length] : undefined);
  const where = seatsFor(seats);
  const readyCount = view.players.filter(p => p.ready).length;
  const total = Math.max(view.players.length, 1);
  const missing = view.players.length < 2 ? '친구를 기다리는 중이에요' : `${view.players.length - readyCount}명이 아직 준비 중이에요`;

  // 입장/준비 순간에 작은 소리로 방 안의 분위기를 전한다.
  const prev = useRef({ n: view.players.length, r: readyCount, all: allReady });
  useEffect(() => {
    const p = prev.current;
    if (view.players.length > p.n) sfx.clack(); else if (readyCount > p.r) sfx.pick();
    if (allReady && !p.all) sfx.chime();
    prev.current = { n: view.players.length, r: readyCount, all: allReady };
  }, [view.players.length, readyCount, allReady]);

  const R = 2 * Math.PI * 34;
  return (
    <main className="screen lb lb-lobby">
      <Ambient />
      <header className="lb-top">
        <button className="lb-leave" onClick={onExit}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>나가기</button>
        <SoundToggle />
      </header>
      <section className="lb-room" aria-label="방 코드">
        <p className="lb-cap">친구에게 이 코드를 알려주세요</p>
        <button className="lb-codebtn" onClick={invite} aria-label="초대 링크 복사·공유">
          <Letters text={view.roomId} tilt={false} />
          <small className={copied ? 'done' : ''}>{copied ? '✓ 초대 링크를 보냈어요' : '눌러서 초대 링크 공유'}</small>
        </button>
      </section>
      <section className="lb-table" aria-label="자리">
        <div className={`lb-center ${allReady ? 'all' : ''}`} aria-live="polite">
          <svg viewBox="0 0 80 80" aria-hidden="true"><circle className="trk" cx="40" cy="40" r="34" /><circle className="arc" cx="40" cy="40" r="34" style={{ strokeDasharray: R, strokeDashoffset: R * (1 - readyCount / total) }} /></svg>
          <b>{readyCount}<em>/{view.players.length}</em></b>
          <small>{allReady ? '모두 준비!' : '준비'}</small>
        </div>
        {slots.map((p, i) => {
          const idx = p ? view.players.findIndex(x => x.id === p.id) : -1;
          return (
            <article key={p?.id ?? `empty-${i}`} className={`lb-seat ${where[i] ?? ''} ${p?.ready ? 'ready' : ''} ${p ? '' : 'empty'} ${p?.id === view.playerId ? 'me' : ''}`}>
              {host && p && p.id !== view.playerId && <button className="lb-kick" onClick={() => kick(p)} aria-label={p.isBot ? `${p.name} 내보내기` : `${p.name} 강퇴`}>×</button>}
              <div className={`lb-av ${p ? COLORS[idx % 4] : 'none'}`}>{p ? (p.isBot ? '봇' : p.name.slice(0, 1)) : '+'}{p?.id === view.hostId && <Crown />}</div>
              <b className="lb-name">{p?.name ?? '빈 자리'}{p?.id === view.playerId && <u>나</u>}</b>
              {p ? (p.isBot ? <span className="lb-st bot">컴퓨터</span>
                : p.ready ? <span className="lb-st ok">✓ 준비 완료</span>
                : <span className="lb-st wait">대기 중<i /><i /><i /></span>)
                : <span className="lb-st none">기다리는 중</span>}
            </article>
          );
        })}
      </section>
      <section className="lb-settings" aria-label="게임 설정">
        {host
          ? <div className="lb-timer" role="group" aria-label="턴 타이머 설정"><span>턴 타이머</span><div className="lb-seg sm">{[30, 60, 90, 120, 180].map(seconds => <button key={seconds} aria-pressed={view.config.turnSeconds === seconds} onClick={() => setTimer(seconds)}>{seconds}초</button>)}</div></div>
          : <p className="lb-chip">⏱ 턴 타이머 {view.config.turnSeconds}초 <small>방장이 정해요</small></p>}
        <ul className="lb-rules"><li>첫 등록 {view.config.initialMeldMin}점 이상</li><li>조합당 조커 {view.config.allowTwoJokersInMeld ? '2장까지' : '1장'}</li></ul>
      </section>
      <section className="lb-actions">
        <button className={`lb-ready ${self.ready ? 'on' : ''}`} aria-pressed={self.ready} onClick={() => action('room:ready')}>{self.ready ? <>✓ 준비 완료<small>다시 누르면 취소</small></> : '준비 완료'}</button>
        {host && <button className="lb-bots" onClick={() => action('room:fillBots')}>빈 자리를 봇으로 채우기</button>}
        {host && <button className={`lb-start ${allReady ? 'go' : ''}`} disabled={!allReady} onClick={() => action('game:start')}>게임 시작{!allReady && <small>{missing}</small>}</button>}
        {!host && <p className="lb-wait">방장이 시작하기를 기다리고 있어요</p>}
      </section>
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
