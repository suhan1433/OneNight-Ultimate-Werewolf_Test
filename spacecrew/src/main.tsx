import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { io, type Socket } from 'socket.io-client';
import './styles.css';

type Card = { id: string; suit: 'P' | 'B' | 'G' | 'Y' | 'R'; value: number };
type Player = { id: string; nickname: string; connected: boolean; ready: boolean; cardsLeft: number; wins: number; comm?: { card: Card; marker: string } | null };
type Task = Card & { ownerId: string | null; done: boolean; order?: number | null; arrow?: number | null; omega?: boolean };
type Mission = { tasks: number; label: string; text: string; order?: number; arrows?: number; omega?: boolean; deadZone?: boolean; special?: string; distribute?: boolean; pick?: string; commFrom?: number; tokenSwap?: boolean; tokenMove?: boolean; fiveTransfer?: boolean };
type Game = { code: string; playerId: string; hostId: string; maxPlayers: number; missionId: number; mission: Mission; phase: string; players: Player[]; commanderId: string | null; turnId: string | null; leaderId: string | null; hand: Card[]; legalCardIds: string[]; tasks: Task[]; trick: { playerId: string; card: Card }[]; lastTrick?: { winnerId: string | null; cards?: { playerId: string; card: Card }[] }; trickNo: number; totalTricks: number; assignmentCursor: number; targetId?: string | null; targetBId?: string | null; targetStep?: number; decisionResponses?: Record<string, boolean>; distressVotes?: Record<string, boolean>; distressActive?: boolean; distressPassed?: boolean; distressPassCount?: number; result?: { win: boolean; reason: string } | null; log: string[] };
type TrickCard = { playerId: string; card: Card | null };
type Session = { code: string; playerId: string; sessionToken: string };

const suits = { P: ['분홍', '●', '#ff7eb6'], B: ['파랑', '▲', '#72adff'], G: ['초록', '■', '#66e099'], Y: ['노랑', '★', '#ffd467'], R: ['로켓', '🚀', '#edf2ff'] } as const;
const storageKey = 'planet-nine-online-session';
const readSession = (): Session | null => { try { return JSON.parse(localStorage.getItem(storageKey) ?? 'null'); } catch { return null; } };
const saveSession = (session: Session) => localStorage.setItem(storageKey, JSON.stringify(session));
const campaignKey = 'planet-nine-campaign';
const readCampaign = (): number[] => { try { const value = JSON.parse(localStorage.getItem(campaignKey) ?? '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const markCleared = (mission: number) => { try { localStorage.setItem(campaignKey, JSON.stringify([...new Set([...readCampaign(), mission])])); } catch { /* 저장 불가 시 무시 */ } };
const label = (card: Card) => `${suits[card.suit][1]} ${card.value}`;
type Spot = 'top' | 'mid' | 'bottom';
const spotInfo: Record<Spot, [string, string]> = { top: ['▲', '가장 높음'], mid: ['●', '유일함'], bottom: ['▼', '가장 낮음'] };
const spotOf = (marker: string): Spot | null => { const m = marker.toLowerCase(); if (/높|high|top|max|▲|↑/.test(m)) return 'top'; if (/낮|low|bottom|min|▼|↓/.test(m)) return 'bottom'; if (/유일|only|single|unique|mid|cent|●|•/.test(m)) return 'mid'; return null; };
const spotText = (marker: string) => { const spot = spotOf(marker); return spot ? spotInfo[spot][1] : marker; };
const Pin = ({ spot, still = false }: { spot: Spot; still?: boolean }) => <span className={`pin ${spot} ${still ? 'still' : ''}`} aria-hidden="true" />;
const missionRules = (mission: Mission): string[] => {
  const rules = [`과제 카드 ${mission.tasks}장을 정해진 담당자가 트릭에서 따내야 해요.`];
  if (mission.order) rules.push(`순서 과제 ${mission.order}개: 숫자 1부터 차례대로 달성해야 해요.`);
  if (mission.arrows) rules.push(`화살표 과제 ${mission.arrows}개: › 표시 순서대로 달성해야 해요.`);
  if (mission.omega) rules.push('Ω 과제: 다른 과제를 모두 끝낸 맨 마지막에 달성해야 해요.');
  if (mission.distribute) rules.push('과제 담당자는 커맨더가 직접 지정해요.');
  if (mission.tokenSwap) rules.push('시작 전에 커맨더가 순서 토큰 두 개를 한 번 맞바꿀 수 있어요.');
  if (mission.tokenMove) rules.push('시작 전에 커맨더가 순서 토큰 하나를 다른 과제로 한 번 옮길 수 있어요.');
  if (mission.fiveTransfer) rules.push('5인 게임에서는 시작 전에 과제 한 장을 다른 승무원에게 전달할 수 있어요.');
  if (mission.pick === 'notCommander') rules.push('커맨더가 아닌 승무원 중에서 대상을 지정해요.');
  if (mission.deadZone) rules.push('데드 존: 통신 카드는 공개하지만 최고·유일·최저 마커는 표시되지 않아요.');
  if (mission.commFrom && mission.commFrom > 1) rules.push(`${mission.commFrom}번째 트릭부터 통신할 수 있어요.`);
  if (mission.special) rules.push('특수 규칙이 있어요. 위의 미션 설명을 꼭 확인하세요.');
  return rules;
};
const Rules = ({ mission }: { mission: Mission }) => <ul className="rules">{missionRules(mission).map(rule => <li key={rule}>{rule}</li>)}</ul>;
const MissionBrief = ({ game }: { game: Game }) => <details className="brief" open><summary><b>미션 {game.missionId}</b><span>{game.mission.text}</span></summary><Rules mission={game.mission} /></details>;
const HandPeek = ({ hand }: { hand: Card[] }) => <div className="hand-peek"><span>내 손패 {hand.length}장 (나만 볼 수 있어요)</span><div>{[...hand].sort((a, b) => a.suit.localeCompare(b.suit) || a.value - b.value).map(card => <CardView key={card.id} card={card} small disabled />)}</div></div>;
const markerOf = (card: Card, hand: Card[]): Spot => { const same = hand.filter(item => item.suit === card.suit).map(item => item.value); return same.length === 1 ? 'mid' : card.value === Math.max(...same) ? 'top' : 'bottom'; };
function Track({ current, onPick }: { current: number; onPick?: (mission: number) => void }) {
  const list = useRef<HTMLOListElement>(null); const cleared = new Set(readCampaign());
  useEffect(() => { list.current?.querySelector('.now')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [current]);
  return <nav className="track" aria-label="미션 지도"><ol ref={list}>{Array.from({ length: 50 }, (_, i) => { const n = i + 1; const done = cleared.has(n); return <li key={n} className={`${n === current ? 'now' : ''} ${done ? 'cleared' : ''}`}>{onPick ? <button type="button" aria-current={n === current} aria-label={`미션 ${n}${done ? ' 완료' : ''}`} onClick={() => onPick(n)}>{n}</button> : <span aria-current={n === current} aria-label={`미션 ${n}${done ? ' 완료' : ''}`}>{n}</span>}</li>; })}</ol></nav>;
}

function CardView({ card, small = false, disabled = false, onClick, index = 0 }: { card: Card; small?: boolean; disabled?: boolean; onClick?: () => void; index?: number }) {
  const [name, icon, color] = suits[card.suit];
  return <button type="button" className={`card ${small ? 'small' : ''} ${disabled ? 'disabled' : ''}`} style={{ '--card': color, '--i': index } as CSSProperties} disabled={disabled} onClick={onClick} aria-label={`${name} ${card.value}`}><span className="corner">{icon}</span><b>{card.value}</b><i>{name}</i></button>;
}
function Brand({ compact = false }: { compact?: boolean }) { return <header className={`brand ${compact ? 'compact' : ''}`}><span className="orb">◌</span><div><h1>더 크루</h1><p>THE CREW · PLANET NINE</p></div></header>; }
function taskToken(task: Task) { const text = task.omega ? 'Ω' : task.arrow ? '›'.repeat(task.arrow) : task.order ? String(task.order) : ''; return text ? <span className="token">{text}</span> : null; }

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [commOpen, setCommOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const leavingRef = useRef(false);
  useEffect(() => {
    const next = io({ path: '/api/spacecrew/socket/', transports: ['websocket', 'polling'] }); setSocket(next);
    next.on('ROOM_STATE', (state: Game) => { if (leavingRef.current) return; setGame(state); });
    next.on('ERROR', ({ message }: { message: string }) => setError(message));
    next.on('connect', () => { leavingRef.current = false; const previous = readSession(); if (previous) next.emit('ROOM_JOIN', previous, (reply: { ok: boolean }) => { if (!reply.ok) localStorage.removeItem(storageKey); }); });
    next.on('disconnect', () => { if (!leavingRef.current) setError('서버와 연결이 끊겼습니다. 재연결 중…'); });
    return () => { next.close(); };
  }, []);
  useEffect(() => { if (!error) return; const id = window.setTimeout(() => setError(''), 3500); return () => window.clearTimeout(id); }, [error]);
  const request = async (event: string, payload: Record<string, unknown> = {}): Promise<unknown> => { try { return await new Promise<unknown>((resolve, reject) => { if (!socket) return reject(Error('연결 중입니다.')); socket.emit(event, { ...payload, code: game?.code ?? payload.code }, (reply: { ok: boolean; data?: unknown; error?: string }) => reply.ok ? resolve(reply.data) : reject(Error(reply.error))); }); } catch (reason) { setError(reason instanceof Error ? reason.message : '요청을 처리하지 못했습니다.'); throw reason; } };
  const saveAndJoin = (reply: unknown) => { const session = reply as Session; saveSession(session); };
  const leave = () => {
    if (game && game.phase !== 'lobby' && game.phase !== 'result' && !window.confirm('미션 진행 중입니다. 정말 나갈까요? 다른 승무원의 게임이 중단될 수 있어요.')) return;
    leavingRef.current = true; socket?.emit('ROOM_LEAVE', { code: game?.code }); localStorage.removeItem(storageKey); setGame(null); setCommOpen(false);
    window.setTimeout(() => { socket?.disconnect(); socket?.connect(); }, 200);
  };
  const help = <><button type="button" className="help-fab" onClick={() => setHelpOpen(true)}><b>?</b>도움말</button>{helpOpen && <Help onClose={() => setHelpOpen(false)} />}</>;
  const toast = error && <div className="toast" role="alert">{error}</div>;
  if (!game) return <><Home request={request} onSession={saveAndJoin} />{help}{toast}</>;
  const me = game.players.find(player => player.id === game.playerId)!;
  return <><div className="stars" aria-hidden="true" />{game.phase === 'lobby' ? <Lobby game={game} me={me} request={request} copied={copied} setCopied={setCopied} onLeave={leave} /> : <Board game={game} me={me} request={request} commOpen={commOpen} setCommOpen={setCommOpen} onLeave={leave} />}{help}{toast}</>;
}

function Home({ request, onSession }: { request: (event: string, payload?: Record<string, unknown>) => Promise<unknown>; onSession: (reply: unknown) => void }) {
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); const reply = await request('ROOM_CREATE', form); if (reply) onSession(reply); };
  const join = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = Object.fromEntries(new FormData(event.currentTarget)); form.code = String(form.code).toUpperCase(); const reply = await request('ROOM_JOIN', form); if (reply) onSession(reply); };
  return <><div className="stars" aria-hidden="true" /><section className="home"><Brand /><div className="intro"><div className="mission-mark">9</div><div><p className="eyebrow">협력 트릭테이킹 · React 멀티플레이</p><h2>행성 9의 신호를<br />함께 해독하세요.</h2><p className="lead">각자의 손패는 비밀입니다. 카드 선택과 통신 토큰만으로 탐사대를 이끄세요.</p></div></div><div className="home-panels"><form className="panel" onSubmit={create}><h3>새 탐사대</h3><label>내 호출명<input name="nickname" maxLength={16} required placeholder="예: 루나" /></label><label>승무원 수<select name="maxPlayers" defaultValue="4"><option value="3">3명</option><option value="4">4명</option><option value="5">5명</option></select></label><label>첫 미션<select name="missionId">{Array.from({ length: 50 }, (_, i) => <option key={i} value={i + 1}>미션 {i + 1}</option>)}</select></label><button className="primary">탐사대 만들기 <span>→</span></button></form><form className="panel ghost" onSubmit={join}><h3>탐사대 합류</h3><label>내 호출명<input name="nickname" maxLength={16} required placeholder="예: 솔" /></label><label>방 코드<input name="code" maxLength={6} required className="code-input" placeholder="ABC123" /></label><button>방에 합류하기</button></form></div><p className="footnote">3–5명의 승무원 · 총 50개 미션</p></section></>;
}

function Lobby({ game, me, request, copied, setCopied, onLeave }: { game: Game; me: Player; request: (event: string, payload?: Record<string, unknown>) => Promise<unknown>; copied: boolean; setCopied: (value: boolean) => void; onLeave: () => void }) {
  const host = game.hostId === game.playerId; const filled = game.players.length === game.maxPlayers; const ready = game.players.every(player => player.ready || player.id === game.hostId);
  const copy = async () => { await navigator.clipboard?.writeText(game.code); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };
  return <section className="shell lobby"><div className="topbar"><Brand compact /><button type="button" className="leave" onClick={onLeave}>나가기</button></div><div className="lobby-title"><div><p className="eyebrow">탐사대 대기실 · 미션 {game.missionId} / 50</p><h2>{game.mission.label}</h2><p>{game.mission.text}</p></div><button className="room-code" onClick={copy}><span>방 코드</span><b>{game.code}</b><small>{copied ? '복사됨!' : '눌러서 복사'}</small></button></div><div className="mission-selector panel"><div><span className="eyebrow">항해일지</span><strong>미션 {game.missionId}</strong><p>{game.mission.text}</p><Rules mission={game.mission} /></div>{host && <label>미션 선택<select value={game.missionId} onChange={event => void request('MISSION_SET', { missionId: Number(event.target.value) })}>{Array.from({ length: 50 }, (_, i) => <option key={i} value={i + 1}>미션 {i + 1}</option>)}</select></label>}</div><Track current={game.missionId} onPick={host ? mission => void request('MISSION_SET', { missionId: mission }) : undefined} /><section className="roster"><h3>승무원 <span>{game.players.length}/{game.maxPlayers}</span></h3><div className="seats">{Array.from({ length: game.maxPlayers }, (_, index) => { const player = game.players[index]; return player ? <article key={player.id} className={`seat ${player.id === game.playerId ? 'me' : ''}`}><span className={`lamp ${player.connected ? (player.ready || player.id === game.hostId ? 'on' : 'wait') : 'off'}`} aria-hidden="true" /><span className="avatar">{player.nickname.slice(0, 1)}</span><b>{player.nickname}{player.id === game.hostId && <em>방장</em>}</b><small>{player.connected ? (player.ready || player.id === game.hostId ? '● 준비됨' : '○ 준비 중') : '연결 끊김'}</small></article> : <article key={index} className="seat empty"><span className="avatar">+</span><b>빈 좌석</b><small>방 코드를 공유하세요</small></article>; })}</div></section><div className="lobby-actions">{host ? <><button className="primary" disabled={!filled || !ready} onClick={() => void request('GAME_START')}>미션 시작 →</button><p>{!filled ? `모든 좌석(${game.maxPlayers}명)이 채워져야 합니다.` : !ready ? '모든 승무원의 준비를 기다리는 중…' : '출발 준비 완료'}</p></> : <><button className={`ready ${me.ready ? 'active' : ''}`} onClick={() => void request('PLAYER_READY')}>{me.ready ? '준비 취소' : '준비 완료'}</button><p>방장이 미션을 시작하면 손패가 배정됩니다.</p></>}</div></section>;
}

function Board({ game, me, request, commOpen, setCommOpen, onLeave }: { game: Game; me: Player; request: (event: string, payload?: Record<string, unknown>) => Promise<unknown>; commOpen: boolean; setCommOpen: (value: boolean) => void; onLeave: () => void }) {
  const turn = game.turnId === game.playerId; const legal = new Set(game.legalCardIds);
  const eligible = useMemo(() => game.hand.filter(card => card.suit !== 'R').filter(card => { const values = game.hand.filter(item => item.suit === card.suit).map(item => item.value); return card.value === Math.min(...values) || card.value === Math.max(...values); }), [game.hand]);
  const [held, setHeld] = useState<{ trick: TrickCard[]; winnerId: string } | null>(null);
  const prevTrick = useRef<Game['trick']>([]); const prevNo = useRef(game.trickNo); const myPlay = useRef<Card | null>(null); const holdTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const winnerId = game.lastTrick?.winnerId;
    if (game.trickNo > prevNo.current && winnerId && game.trick.length === 0) {
      const known: TrickCard[] = game.lastTrick?.cards ?? prevTrick.current;
      const missing = game.players.filter(player => !known.some(item => item.playerId === player.id)).map(player => ({ playerId: player.id, card: player.id === game.playerId ? myPlay.current : null }));
      setHeld({ trick: [...known, ...missing], winnerId });
      window.clearTimeout(holdTimer.current); holdTimer.current = window.setTimeout(() => setHeld(null), 1800);
    }
    if (game.trick.length) prevTrick.current = game.trick;
    prevNo.current = game.trickNo;
  }, [game.trickNo, game.trick, game.lastTrick, game.players, game.playerId]);
  const shown: TrickCard[] = game.trick.length ? game.trick : held?.trick ?? []; const winId = !game.trick.length && held ? held.winnerId : null; const resolving = !!winId;
  const playing = !['chooseTarget', 'assign', 'tokenEdit', 'taskTransfer', 'distressVote', 'distressPass', 'result'].includes(game.phase);
  const notYet = game.trickNo + 1 < (game.mission.commFrom ?? 1); const commWindow = playing && game.trick.length === 0 && !notYet; const canComm = commWindow && !me.comm && !(game.mission.special === 'noComm' && game.targetId === game.playerId);
  useEffect(() => { if (!canComm) setCommOpen(false); }, [canComm, setCommOpen]);
  const commPanel = <section className="comm-panel" aria-label="통신 패널"><div className="section-head"><h3>통신 패널</h3><span className={commWindow ? 'open' : 'closed'}>{notYet ? `${game.mission.commFrom}번째 트릭부터 통신 가능` : game.trick.length ? '이번 트릭 통신 창 닫힘' : '통신 창 열림 · 첫 카드 전까지'}</span></div><div className="comm-slots">{game.players.map(player => { const spot = player.comm ? spotOf(player.comm.marker) : null; return <figure className={`commslot ${player.comm ? '' : 'empty'}`} key={player.id}>{player.comm ? <div className="commcard"><CardView card={player.comm.card} disabled />{spot && <Pin spot={spot} />}</div> : <div className="commcard slot">통신 전</div>}<figcaption><b>{player.nickname}</b>{player.comm && <small>{spot ? `${spotInfo[spot][0]} ${spotInfo[spot][1]}` : player.comm.marker}</small>}</figcaption></figure>; })}</div></section>;
  const overlay = ['chooseTarget', 'assign', 'tokenEdit', 'taskTransfer', 'distressVote', 'distressPass'].includes(game.phase); const assigner = game.players[(game.players.findIndex(player => player.id === game.commanderId) + game.assignmentCursor) % game.players.length]; const commander = game.commanderId === game.playerId;
  return <section className="shell board"><header className="game-head"><Brand compact /><div className="head-right"><div className="progress"><span>미션 {game.missionId}</span><b>트릭 {Math.min(game.trickNo + 1, game.totalTricks)}/{game.totalTricks}</b></div><button type="button" className="leave" onClick={onLeave}>나가기</button></div></header><div className="board-grid"><aside><section className="crew-status">{game.players.map(player => <div className={`crew ${player.id === game.turnId ? 'turn' : ''} ${player.id === game.commanderId ? 'commander' : ''}`} key={player.id}><span className="avatar">{player.nickname.slice(0, 1)}</span><div><b>{player.nickname}{player.id === game.commanderId && <em>커맨더</em>}</b><small>{player.cardsLeft}장 · {player.wins}승{player.comm && ` · 📡 ${label(player.comm.card)} ${spotText(player.comm.marker)} (사용됨)`}</small></div>{player.id === game.turnId && <i>차례</i>}<span className="meter" style={{ '--w': game.totalTricks ? player.wins / game.totalTricks : 0 } as CSSProperties} /></div>)}</section><section className="tasks"><div className="section-head"><h3>과제</h3><span>{game.tasks.filter(task => task.done).length}/{game.tasks.length}</span></div><div className="task-list">{game.tasks.map(task => <article className={`task ${task.done ? 'done' : ''}`} key={task.id}><CardView card={task} small disabled /><div>{taskToken(task)}<b>{task.done ? '완료' : task.ownerId ? game.players.find(player => player.id === task.ownerId)?.nickname : '미배정'}</b></div></article>)}</div></section><section className="log"><h3>항해 기록</h3>{game.log.map((line, index) => <p key={index}>{line}</p>)}</section></aside><main>{game.phase === 'result' && !held ? <Result game={game} request={request} /> : <><MissionBrief game={game} /><section className="table"><div className="trick-title"><span>현재 트릭</span><b>{winId ? '트릭 판정' : shown[0]?.card ? `선도 ${suits[shown[0].card.suit][0]}` : '선도 플레이어가 시작'}</b></div><div className="trick">{shown.length ? shown.map(item => <article className={`played ${item.playerId === winId ? 'winner' : ''}`} key={item.playerId}>{item.card ? <CardView card={item.card} small disabled /> : <span className="card small back" role="img" aria-label="공개되지 않은 카드"><b>?</b></span>}<small>{game.players.find(player => player.id === item.playerId)?.nickname}{item.playerId === winId && ' · 승리'}</small></article>) : <p>카드를 내면 트릭이 시작됩니다.</p>}</div></section>{commPanel}<section className="hand-section"><div className="hand-top"><div><span className="eyebrow">내 손패</span><b>{game.hand.length}장</b></div><div className="hand-actions">{canComm && <button className="communicate" onClick={() => setCommOpen(true)}>📡 통신하기</button>}<small>{resolving ? '트릭 판정 중…' : turn ? '카드를 선택해 내세요' : `${game.players.find(player => player.id === game.turnId)?.nickname} 님의 차례`}</small></div></div><div className="hand">{game.hand.map((card, i) => <CardView key={card.id} index={i} card={card} disabled={!legal.has(card.id) || resolving} onClick={() => { myPlay.current = card; void request('CARD_PLAY', { cardId: card.id }); }} />)}</div></section></>}</main></div>{overlay && <Overlay game={game} request={request} commander={commander} assigner={assigner} />}{commOpen && <div className="overlay-panel"><section className="modal-card"><button className="close" onClick={() => setCommOpen(false)}>×</button><p className="eyebrow">통신 토큰</p><h2>공개할 카드를 고르세요</h2><p>마커가 놓인 위치로 단서를 줘요. 가장 높은 카드는 맨 위, 유일한 카드는 가운데, 가장 낮은 카드는 맨 아래입니다. 첫 카드가 놓이기 전까지 한 번 쓸 수 있어요.</p><div className="assign-cards">{eligible.map(card => <div key={card.id}><div className="commcard"><CardView card={card} onClick={() => { setCommOpen(false); void request('COMMUNICATE', { cardId: card.id }); }} /><Pin spot={markerOf(card, game.hand)} still /></div><small className="marker-preview">{spotInfo[markerOf(card, game.hand)].join(' ')}</small></div>)}</div></section></div>}</section>;
}
function Overlay({ game, request, commander, assigner }: { game: Game; request: (event: string, payload?: Record<string, unknown>) => Promise<unknown>; commander: boolean; assigner: Player }) {
  if (game.phase === 'distressVote') { const mine = game.distressVotes?.[game.playerId]; const all = game.players.every(player => player.id in (game.distressVotes ?? {})); return <div className="overlay-panel"><section className="modal-card"><p className="eyebrow">선택 규칙 · 조난 신호</p><h2>조난 신호를 사용할까요?</h2><p>전원이 찬성해야 사용합니다. 사용하면 각자 로켓이 아닌 카드 한 장을 오른쪽 이웃에게 동시에 전달하고, 이 도전 동안 통신 전에 적용됩니다.</p><div className="choice-row"><button disabled={mine !== undefined} onClick={() => void request('DISTRESS_VOTE', { use: true })}>사용</button><button disabled={mine !== undefined} onClick={() => void request('DISTRESS_VOTE', { use: false })}>사용 안 함</button></div><p>{all ? '응답을 확인하는 중…' : `${game.players.filter(player => player.id in (game.distressVotes ?? {})).length}/${game.players.length}명 응답`}</p><HandPeek hand={game.hand} /></section></div>; }
  if (game.phase === 'distressPass') return <div className="overlay-panel"><section className="modal-card"><p className="eyebrow">조난 신호 활성화</p><h2>오른쪽 이웃에게 보낼 카드를 고르세요</h2><p>{game.distressPassed ? `카드를 골랐습니다. 다른 승무원을 기다리는 중 (${game.distressPassCount}/${game.players.length})` : '모두 동시에 고릅니다. 로켓은 전달할 수 없습니다.'}</p><div className="assign-cards">{game.hand.filter(card => card.suit !== 'R').map(card => <CardView key={card.id} card={card} disabled={game.distressPassed} onClick={() => void request('DISTRESS_PASS', { cardId: card.id })} />)}</div></section></div>;
  if (game.phase === 'tokenEdit') { const tokenTasks = game.tasks.filter(task => task.order || task.arrow || task.omega); const from = tokenTasks[0]; const to = game.mission.tokenMove ? game.tasks.find(task => task.id !== from?.id && !task.order && !task.arrow && !task.omega) : tokenTasks[1]; return <div className="overlay-panel"><section className="modal-card"><p className="eyebrow">시작 전 순서 토큰</p><h2>{game.mission.tokenSwap ? '순서 토큰을 맞바꿀 수 있어요' : '순서 토큰을 옮길 수 있어요'}</h2><p>커맨더만 조정할 수 있으며, 하지 않고 진행해도 됩니다.</p><div className="assign-cards">{game.tasks.map(task => <div key={task.id}><CardView card={task} disabled />{taskToken(task)}</div>)}</div><div className="choice-row">{commander && from && to && <button onClick={() => void request('TOKEN_EDIT', { fromId: from.id, toId: to.id })}>표시된 토큰 조정</button>}<button disabled={!commander} onClick={() => void request('TOKEN_EDIT_SKIP')}>그대로 진행</button></div></section></div>; }
  if (game.phase === 'taskTransfer') { const mine = game.tasks.filter(task => task.ownerId === game.playerId); return <div className="overlay-panel"><section className="modal-card"><p className="eyebrow">5인 선택 규칙</p><h2>과제 한 장을 전달할 수 있어요</h2><p>원하면 과제 담당자가 자신의 과제 한 장을 다른 승무원에게 넘깁니다. 전달하지 않으려면 커맨더가 진행을 누르세요.</p>{mine.flatMap(task => game.players.filter(player => player.id !== game.playerId).map(player => <button key={`${task.id}-${player.id}`} onClick={() => void request('TASK_TRANSFER', { taskId: task.id, recipientId: player.id })}>{label(task)} → {player.nickname}</button>))}<div className="choice-row"><button disabled={!commander} onClick={() => void request('TASK_TRANSFER_SKIP')}>전달 없이 진행</button></div><HandPeek hand={game.hand} /></section></div>; }
  if (game.phase === 'chooseTarget') { const excluded = game.mission.pick === 'notCommander' ? game.commanderId : game.targetStep === 1 ? game.targetId : null; const answered = game.decisionResponses?.[game.playerId]; const allAnswered = game.players.every(player => player.id in (game.decisionResponses ?? {})); return <div className="overlay-panel"><section className="modal-card"><p className="eyebrow">커맨더의 결정</p><h2>{game.mission.special === 'finalPattern' && game.targetStep === 1 ? '마지막 트릭 담당자를 지정하세요' : '특수 미션 대상을 지정하세요'}</h2><p>{game.mission.text} 먼저 각자 예/아니오로 대답한 뒤, 커맨더가 결정을 내립니다.</p><div className="choice-row"><button disabled={answered !== undefined} onClick={() => void request('DECISION_RESPONSE', { yes: true })}>예</button><button disabled={answered !== undefined} onClick={() => void request('DECISION_RESPONSE', { yes: false })}>아니오</button></div><p>{allAnswered ? '모든 응답 완료 — 커맨더가 선택하세요.' : `${game.players.filter(player => player.id in (game.decisionResponses ?? {})).length}/${game.players.length}명 응답`}</p><div className="choice-row">{game.players.filter(player => player.id !== excluded).map(player => <button key={player.id} disabled={!commander || !allAnswered} onClick={() => void request('TARGET_SELECT', { targetId: player.id })}>{player.nickname}</button>)}</div><HandPeek hand={game.hand} /></section></div>; }
  const pending = game.tasks.filter(task => !task.ownerId); const mine = assigner.id === game.playerId; const distribution = game.mission.distribute; return <div className="overlay-panel"><section className="modal-card"><p className="eyebrow">미션 브리핑 · 과제 배정</p><h2>{mine ? (distribution ? '과제 담당자를 고르세요' : '맡을 과제를 고르세요') : `${assigner.nickname} 님이 선택 중`}</h2><p>{game.mission.text}</p><Rules mission={game.mission} />{distribution && pending[0] ? <><div className="assign-cards"><CardView card={pending[0]} disabled /></div><div className="choice-row">{game.players.map(player => <button key={player.id} disabled={!mine} onClick={() => void request('TASK_ASSIGN', { taskId: pending[0].id, ownerId: player.id })}>{player.nickname}</button>)}</div></> : <div className="assign-cards">{pending.map(task => <div key={task.id}><CardView card={task} disabled={!mine} onClick={() => void request('TASK_ASSIGN', { taskId: task.id })} />{taskToken(task)}</div>)}</div>}<HandPeek hand={game.hand} /></section></div>;
}
function Result({ game, request }: { game: Game; request: (event: string, payload?: Record<string, unknown>) => Promise<unknown> }) { const success = game.result?.win; useEffect(() => { if (success) markCleared(game.missionId); }, [success, game.missionId]); return <section className={`result ${success ? 'success' : 'failure'}`}><span className="stamp">{success ? '✦' : '×'}</span><p className="eyebrow">미션 {game.missionId}</p><h2>{success ? '미션 성공' : '미션 실패'}</h2><p>{game.result?.reason}</p>{!success && game.tasks.some(task => !task.done) && <ul className="missed" aria-label="미완료 과제">{game.tasks.filter(task => !task.done).map(task => <li key={task.id}><CardView card={task} small disabled />{taskToken(task)}<span>미완료</span></li>)}</ul>}{success && game.missionId === 50 && <Epilogue />}{game.playerId === game.hostId && <button className="primary" onClick={() => void request('GAME_RESTART')}>대기실로 돌아가기</button>}</section>; }

const sample = (suit: Card['suit'], value: number): Card => ({ id: `help-${suit}${value}`, suit, value });
const Demo = ({ card, note, spot }: { card: Card; note: string; spot?: Spot }) => <figure>{spot ? <div className="commcard"><CardView card={card} disabled /><Pin spot={spot} still /></div> : <CardView card={card} small disabled />}<figcaption>{note}</figcaption></figure>;
const helpTabs = ['처음 시작하기', '카드 내는 법', '과제와 통신', '화면 보는 법', '자주 묻는 질문'];
function Help({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(0);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const pages = [
    <>
      <p className="help-lead">더 크루는 모두가 한 팀인 협력 카드 게임입니다. 서로 이기는 게임이 아니라, 미션에 적힌 ‘과제 카드’를 정해진 사람이 따내면 모두 함께 성공합니다.</p>
      <h4>한 판의 흐름</h4>
      <ol>
        <li><b>모이기</b> 방장이 만든 방 코드를 공유하세요. 모든 좌석이 차고 다들 ‘준비 완료’를 누르면 방장이 미션을 시작합니다.</li>
        <li><b>과제 나누기</b> 과제 카드가 공개되면, 커맨더(로켓 4를 가진 사람)부터 차례로 자기가 맡을 과제를 하나씩 고릅니다. 이때 창 아래에서 내 손패를 확인할 수 있어요.</li>
        <li><b>카드 내기</b> 한 사람이 카드 한 장씩 내면 ‘트릭’ 한 판입니다. 가장 센 카드를 낸 사람이 카드를 가져가고 다음 판을 시작합니다.</li>
        <li><b>끝내기</b> 손패를 모두 쓰면 미션이 끝납니다. 모든 과제를 담당자가 해냈다면 성공입니다.</li>
      </ol>
      <h4>이럴 때 실패해요</h4>
      <ul><li>내 과제 카드를 다른 사람이 가져갔을 때</li><li>순서 표시가 있는 과제를 순서에 어긋나게 달성했을 때</li></ul>
      <p>실패해도 대기실로 돌아가 같은 미션에 다시 도전할 수 있어요.</p>
      <p className="help-tip">처음이라면 미션 1부터 시작하세요. 번호가 올라갈수록 새 규칙이 하나씩 더해집니다.</p>
    </>,
    <>
      <h4>카드 구성</h4>
      <p>색 카드 4가지(분홍 ●, 파랑 ▲, 초록 ■, 노랑 ★)는 각각 1~9, 로켓 🚀은 1~4가 있습니다. 40장을 모두 나눠 가집니다.</p>
      <h4>카드를 내는 규칙</h4>
      <ul>
        <li>먼저 나온 카드와 <b>같은 색이 손에 있으면 반드시 그 색</b>을 내야 해요.</li>
        <li>같은 색이 없다면 <b>아무 카드나</b> 낼 수 있어요.</li>
        <li>같은 색끼리는 <b>숫자가 큰 카드</b>가 이겨요.</li>
        <li><b>로켓은 가장 강해요.</b> 색 카드는 모두 이기고, 로켓끼리는 숫자가 큰 쪽이 이겨요.</li>
        <li>내 차례에는 <b>밝게 표시된 카드</b>만 누를 수 있어요. 흐린 카드는 규칙상 낼 수 없는 카드입니다.</li>
      </ul>
      <h4>예시</h4>
      <p>파랑 5가 먼저 나왔고 내 손에 파랑 3이 있다면 파랑 3을 내야 합니다. 파랑이 없다면 로켓 1을 낼 수도 있고, 그러면 파랑 5를 이깁니다.</p>
      <div className="help-demo"><Demo card={sample('B', 5)} note="먼저 나온 카드" /><Demo card={sample('B', 3)} note="같은 색이라 낼 수 있음" /><Demo card={sample('R', 1)} note="파랑이 없을 때 이김" /></div>
    </>,
    <>
      <h4>과제 카드 읽는 법</h4>
      <p>화면의 ‘과제’ 목록에서 확인합니다. 카드 아래 이름이 그 카드를 따내야 할 담당자입니다.</p>
      <dl className="help-terms">
        <dt><span className="token">1</span><span className="token">2</span></dt><dd>순서 표시. 작은 번호의 과제부터 달성해야 해요.</dd>
        <dt><span className="token">›</span><span className="token">››</span></dt><dd>화살표 표시. › 과제를 먼저, 그다음 ›› 과제를 달성해요.</dd>
        <dt><span className="token">Ω</span></dt><dd>가장 마지막에 달성해야 하는 과제예요.</dd>
        <dt>완료</dt><dd>이미 달성한 과제. 카드가 흐리게 보여요.</dd>
      </dl>
      <h4>통신: 말 대신 카드로 알려주기</h4>
      <p>카드에 대한 힌트는 말로 할 수 없어요. 대신 승무원마다 미션당 한 번, 카드 한 장을 공개해 단서를 줍니다.</p>
      <ul>
        <li>새 트릭에서 <b>첫 카드가 나오기 전</b>이라면 차례와 상관없이 누구나 <b>📡 통신하기</b>를 누를 수 있어요. 첫 카드가 놓이면 그 트릭의 통신 창은 닫혀요.</li><li>이번 기회를 넘겨도 괜찮아요. 아직 통신하지 않았다면 다음 트릭 전에 쓸 수 있어요. 모두가 ‘완료’를 누를 필요도 없어요.</li>
        <li>공개할 수 있는 카드는 색 카드 중, 그 색에서 <b>가장 높은 카드·가장 낮은 카드·한 장뿐인 카드</b>입니다. 로켓은 안 돼요.</li>
        <li>공개하면 카드 위에 마커가 놓여요. <b>가장 높은 카드는 맨 위, 유일한 카드는 가운데, 가장 낮은 카드는 맨 아래</b>예요.</li>
        <li>미션에 따라 통신이 막혀 있거나 몇 번째 트릭부터 열려요. 버튼이 안 보이면 지금은 쓸 수 없는 때예요.</li>
      </ul>
      <div className="help-demo"><Demo card={sample('G', 7)} spot="top" note="맨 위: 내 초록 중 가장 높은 카드가 7이에요" /><Demo card={sample('Y', 4)} spot="mid" note="가운데: 내 노랑은 이 한 장뿐이에요" /><Demo card={sample('B', 2)} spot="bottom" note="맨 아래: 내 파랑 중 가장 낮은 카드가 2예요" /></div>
    </>,
    <>
      <h4>게임 화면</h4>
      <ul>
        <li><b>승무원 목록</b> 이름, 남은 카드 수, 딴 트릭 수(막대)가 보여요. ‘차례’ 표시가 있는 사람이 지금 카드를 낼 사람이고, ‘커맨더’ 표시는 커맨더입니다. 모바일에서는 화면 아래쪽에 있어요.</li>
        <li><b>과제</b> 달성한 수와 전체 수, 각 과제의 담당자를 보여줘요.</li>
        <li><b>항해 기록</b> 방금 일어난 일을 글로 남겨요.</li>
        <li><b>가운데 테이블</b> 이번 트릭에 놓인 카드가 보여요. 트릭이 끝나면 이긴 카드가 잠깐 금빛으로 빛나요.</li>
        <li><b>내 손패</b> 나만 볼 수 있어요. 다른 사람은 내가 몇 장 남았는지만 알아요.</li><li><b>미션 설명</b> 테이블 위쪽에서 지금 미션의 목표와 특수 규칙을 볼 수 있어요. 눌러서 접고 펼 수 있어요.</li><li><b>통신 패널</b> 승무원마다 공개한 카드와 마커 위치가 보이고, 통신 창이 열려 있는지도 알려줘요.</li><li><b>나가기</b> 오른쪽 위 버튼으로 방에서 나가요.</li>
      </ul>
      <h4>대기실</h4>
      <ul>
        <li><b>좌석 표시등</b> 청록은 준비 완료, 황동색은 준비 중, 꺼져 있으면 연결이 끊긴 상태예요.</li>
        <li><b>미션 지도</b> 숫자 50개가 미션입니다. 채워진 황동색 원이 지금 미션이고, ✦ 표시는 이 기기에서 성공한 미션이에요. 방장은 숫자를 눌러 미션을 바꿀 수 있어요.</li>
      </ul>
    </>,
    <>
      <details><summary>다른 사람의 카드를 볼 수 있나요?</summary><p>아니요. 내 손패만 보이고, 다른 사람은 남은 장수만 알 수 있어요. 그래서 통신이 중요합니다.</p></details>
      <details><summary>커맨더는 무슨 일을 하나요?</summary><p>첫 트릭을 시작하고, 과제를 나눌 때 가장 먼저 고릅니다. 일부 특수 미션에서는 대상 승무원을 지정하기도 해요.</p></details>
      <details><summary>몇 명이 할 수 있나요?</summary><p>3~5명이에요. 정한 인원의 좌석이 모두 차야 방장이 시작할 수 있어요.</p></details>
      <details><summary>미션에 실패하면요?</summary><p>결과 화면에서 어떤 과제가 달성되지 못했는지 표시돼요. 방장이 ‘대기실로 돌아가기’를 누르면 다시 도전할 수 있어요.</p></details>
      <details><summary>나가기를 누르면 어떻게 되나요?</summary><p>방에서 나가 첫 화면으로 돌아가요. 미션 중이라면 다른 승무원의 게임이 중단될 수 있어서 한 번 더 확인해요.</p></details>
      <details><summary>연결이 끊기거나 새로고침했어요.</summary><p>같은 기기와 브라우저로 다시 열면 자동으로 이어서 들어가요. 손패는 다시 나눠지지 않습니다.</p></details>
      <details><summary>미션을 바꾸고 싶어요.</summary><p>대기실에서 방장이 ‘미션 선택’이나 미션 지도의 숫자를 눌러 바꿀 수 있어요.</p></details>
    </>,
  ];
  return <div className="overlay-panel help-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card help-card" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="close" onClick={onClose} aria-label="도움말 닫기" autoFocus>×</button><p className="eyebrow">처음이신가요?</p><h2 id="help-title">더 크루 도움말</h2><div className="help-tabs" role="tablist">{helpTabs.map((name, i) => <button key={name} role="tab" aria-selected={tab === i} onClick={() => setTab(i)}>{name}</button>)}</div><div className="help-body" role="tabpanel">{pages[tab]}</div></section></div>;
}

function Epilogue() {
  const orbits = [[-24, 140, 60], [18, 130, 48], [62, 120, 40], [-58, 110, 34], [90, 135, 52]];
  return <figure className="epilogue"><svg viewBox="0 0 320 220" role="img" aria-label="외곽 궤도들이 한 지점으로 모이며 행성 9의 실루엣이 나타납니다"><g fill="none" stroke="#79aaff" strokeWidth="1">{orbits.map(([angle, rx, ry], i) => <ellipse key={i} className="orbit" pathLength={1} cx="160" cy="110" rx={rx} ry={ry} transform={`rotate(${angle} 160 110)`} style={{ animationDelay: `${i * 0.35}s` }} />)}</g><circle className="planet" cx="160" cy="110" r="22" /></svg><figcaption>궤도 자료가 하나의 천체를 가리킵니다. 행성 9의 윤곽이 드러났습니다.</figcaption></figure>;
}

createRoot(document.getElementById('root')!).render(<App />);
