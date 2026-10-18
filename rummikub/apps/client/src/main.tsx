import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { Meld, Tile } from '@rummikub/rules';
import { validateMeld } from '@rummikub/rules';
import type { PublicView } from '@rummikub/protocol';
import { webPlatform } from '@rummikub/platform';
import { clearSession, emit, saveSession, session, socket } from './socket.js';
import { sfx } from './sound.js';
import './styles.css';

type Game = ReturnType<typeof useGame>;
type Draft = { hand: Tile[]; table: Meld[] };
type Target = 'hand' | 'new' | string;
type Num = Exclude<Tile, { kind: 'joker' }>;
type Drag = { ids: number[]; x: number; y: number; over: string | null };
const isNum = (t: Tile): t is Num => t.kind !== 'joker';
const SUIT = { red: '●', blue: '◆', orange: '▲', black: '■' } as const;
const COLORS = ['red', 'blue', 'orange', 'black'] as const;

const JokerMark = () => (
  <svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
    <path d="M6 13 8 4l5 5 3-6 3 6 5-5 2 9Z" fill="currentColor" /><circle cx="16" cy="21" r="8" /><circle cx="13" cy="20" r=".9" fill="currentColor" /><circle cx="19" cy="20" r=".9" fill="currentColor" /><path d="M12.5 23.5q3.5 3 7 0" />
  </svg>
);

function TileView({ tile, selected, ghosted, fresh, flash, onPointerDown }: { tile: Tile; selected?: boolean; ghosted?: boolean; fresh?: boolean; flash?: boolean; onPointerDown?: (e: React.PointerEvent) => void }) {
  const j = !isNum(tile);
  return (
    <button className={`tile ${j ? 'joker' : tile.color} ${selected ? 'selected' : ''} ${ghosted ? 'ghosted' : ''} ${fresh ? 'fresh' : ''} ${flash ? 'flash' : ''}`} onPointerDown={onPointerDown} aria-pressed={!!selected} aria-label={j ? '조커' : `${tile.color} ${tile.value}`}>
      <strong>{j ? <JokerMark /> : tile.value}</strong><span>{j ? '' : SUIT[tile.color]}</span>
    </button>
  );
}
const Letters = ({ text, tilt = true }: { text: string; tilt?: boolean }) => (
  <div className="letters" aria-label={text}>{[...text].map((c, i) => <b key={i} className={`tile letter ${COLORS[i % 4]}`} style={{ ['--i' as string]: i, ['--r' as string]: `${tilt ? [-5, 3, -2, 5][i % 4] : 0}deg` }}>{c}</b>)}</div>
);

const SEATS: Record<number, string[]> = { 2: ['b', 't'], 3: ['b', 'l', 'r'], 4: ['b', 'l', 't', 'r'] };
/** 테이블 둘레 자리 배치: 항상 내가 아래(b), 이후 시계 방향(왼쪽 → 위 → 오른쪽) */
const seatsFor = (n: number) => SEATS[Math.min(4, Math.max(2, n))] ?? SEATS[4]!;

function SoundToggle() {
  const muted = useSyncExternalStore(sfx.subscribe, sfx.isMuted);
  return (
    <button className="snd" onClick={() => sfx.toggle()} aria-pressed={!muted} aria-label={muted ? '소리 켜기' : '소리 끄기'} title={muted ? '소리 켜기' : '소리 끄기'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />{muted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
    </button>
  );
}

const RING = 2 * Math.PI * 23;
/** 아바타 둘레에 남은 시간을 얇은 호로 보여준다. active일 때만 램프색으로 켜진다. */
function Ring({ active, pct, danger, sec, children }: { active: boolean; pct: number; danger?: boolean; sec: number; children: React.ReactNode }) {
  return (
    <div className={`ring ${active ? 'on' : ''} ${danger ? 'danger' : ''}`} role={active ? 'timer' : undefined} aria-label={active ? `${sec}초 남음` : undefined}>
      <svg viewBox="0 0 52 52" aria-hidden="true"><circle className="track" cx="26" cy="26" r="23" /><circle className="arc" cx="26" cy="26" r="23" style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - pct / 100) }} /></svg>
      {children}
    </div>
  );
}

function OppSeat({ p, pos, active, remaining, pct }: { p: PublicView['players'][number]; pos: string; active: boolean; remaining: number; pct: number }) {
  return (
    <div className={`opp ${pos} ${active ? 'active' : ''}`}>
      <Ring active={active} pct={active ? pct : 0} sec={remaining}><div className="avatar">{p.isBot ? '봇' : p.name.slice(0, 1)}</div></Ring>
      <div className="who"><b>{p.name}</b><small>{active ? `생각 중 ${remaining}초` : p.hasInitialMeld ? '등록 완료' : '미등록'}</small></div>
      <div className="backs" role="img" aria-label={`타일 ${p.handCount}개`}>{Array.from({ length: Math.min(p.handCount, 10) }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}<em>{p.handCount}</em></div>
    </div>
  );
}

/** 손패 추천 정리: 같은 색 연속(런) → 같은 숫자 다른 색(그룹) → 나머지 → 조커 */
function smartSort(hand: Tile[]) {
  const rest = hand.filter(isNum).sort((a, b) => a.color.localeCompare(b.color) || a.value - b.value);
  const clusters: Tile[][] = [];
  const take = (g: Tile[]) => { clusters.push(g); g.forEach(t => rest.splice(rest.indexOf(t as Num), 1)); };
  for (const c of COLORS) {
    let run: Num[] = [];
    const flush = () => { if (run.length >= 3) take(run); run = []; };
    for (const t of rest.filter(t => t.color === c)) {
      const last = run[run.length - 1];
      if (last && t.value === last.value) continue;
      if (last && t.value === last.value + 1) run.push(t); else { flush(); run = [t]; }
    }
    flush();
  }
  for (let v = 1; v <= 13; v++) { const g = [...new Map(rest.filter(t => t.value === v).map(t => [t.color, t])).values()]; if (g.length >= 3) take(g); }
  if (rest.length) clusters.push([...rest]);
  const jokers = hand.filter(t => !isNum(t)); if (jokers.length) clusters.push(jokers);
  return { hand: clusters.flat(), breaks: new Set(clusters.slice(1).map(c => c[0]!.id)) };
}

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

function Lobby({ view, game }: { view: PublicView; game: Game }) {
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
      {host && !allReady && <p className="fine">모두 준비하면 시작할 수 있어요.</p>}
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}

function Board({ view, game }: { view: PublicView; game: Game }) {
  const [draft, setDraft] = useState<Draft>({ hand: view.hand, table: view.table });
  const [hist, setHist] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [breaks, setBreaks] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dealing, setDealing] = useState(() => view.table.length === 0 && view.players.every(p => !p.hasInitialMeld));
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const seenTable = useRef<Set<number> | null>(null);
  const justCommitted = useRef(false);
  const me = view.playerId, myTurn = view.turn?.playerId === me;
  const self = view.players.find(p => p.id === me);
  const allow = view.config.allowTwoJokersInMeld;
  const pool = useMemo(() => new Map<number, Tile>([...view.hand, ...view.tableTiles].map(t => [t.id, t])), [view.hand, view.tableTiles]);
  const resolve = (id: number) => pool.get(id);
  const tilesOf = (m: Meld) => m.tiles.map(e => resolve(e.tileId)).filter((t): t is Tile => !!t);

  useEffect(() => { setDraft({ hand: view.hand, table: view.table }); setHist([]); setSelected([]); setBreaks(new Set()); }, [view.version, view.hand, view.table]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  // 게임 시작 연출: 타일이 한 장씩 손패로 들어온다
  useEffect(() => { if (!dealing) return; sfx.deal(view.hand.length); const t = setTimeout(() => setDealing(false), 1700); return () => clearTimeout(t); }, []);
  // 상대가 새로 놓은 타일을 잠깐 비춰준다(내가 방금 확정한 것은 제외)
  useEffect(() => {
    const ids = new Set(view.tableTiles.map(t => t.id));
    const prev = seenTable.current; seenTable.current = ids;
    if (justCommitted.current) { justCommitted.current = false; return; }
    if (!prev) return;
    const added = [...ids].filter(id => !prev.has(id));
    if (!added.length) return;
    setFlash(new Set(added));
    const t = setTimeout(() => setFlash(new Set()), 3400);
    return () => clearTimeout(t);
  }, [view.version]);

  const rebuild = (m: Meld): Meld => { const r = validateMeld(tilesOf(m), allow, m.id); return r.ok ? r.meld : m; };
  const info = useMemo(() => new Map(draft.table.map(m => { const ts = tilesOf(m); return [m.id, { ok: validateMeld(ts, allow, m.id).ok, sum: ts.reduce((s, t) => s + (isNum(t) ? t.value : 0), 0) }]; })), [draft.table, pool, allow]);
  const handIds = useMemo(() => new Set(view.hand.map(t => t.id)), [view.hand]);
  const origIds = useMemo(() => new Set(view.table.flatMap(m => m.tiles.map(e => e.tileId))), [view.table]);
  const placedPoints = draft.table.flatMap(m => m.tiles).reduce((s, e) => { const t = resolve(e.tileId); return t && isNum(t) && handIds.has(t.id) ? s + t.value : s; }, 0);
  const changed = draft.hand.length !== view.hand.length;
  const allValid = [...info.values()].every(v => v.ok);
  const needInitial = !!self && !self.hasInitialMeld;
  const validCount = [...info.values()].filter(v => v.ok).length;
  const prevValid = useRef(validCount);
  useEffect(() => { if (myTurn && changed && validCount > prevValid.current) sfx.chime(); prevValid.current = validCount; }, [validCount]);
  const wasMine = useRef(myTurn);
  useEffect(() => { if (myTurn && !wasMine.current) sfx.turn(); wasMine.current = myTurn; }, [myTurn]);

  const place = (ids: number[], target: Target) => {
    if (!myTurn || !ids.length) return;
    setHist(h => [...h, draft]);
    setDraft(prev => {
      const set = new Set(ids);
      let hand = prev.hand.filter(t => !set.has(t.id));
      let table = prev.table.map(m => ({ ...m, tiles: m.tiles.filter(e => !set.has(e.tileId)) })).filter(m => m.tiles.length);
      const moved = ids.map(resolve).filter((t): t is Tile => !!t);
      if (target === 'hand') hand = [...hand, ...moved];
      else {
        const id = target === 'new' ? `draft-${crypto.randomUUID()}` : target;
        const entries = moved.map(t => ({ tileId: t.id }));
        table = table.some(m => m.id === id) ? table.map(m => m.id === id ? { ...m, tiles: [...m.tiles, ...entries] } : m) : [...table, { id, type: 'run', tiles: entries } as Meld];
      }
      return { hand, table: table.map(rebuild) };
    });
    setSelected([]); webPlatform.haptics.tick();
    if (target === 'hand') sfx.pick(); else sfx.clack();
  };
  const toggle = (id: number) => myTurn && setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  // 포인터 기반 드래그: 마우스·터치 공통. 움직이지 않고 떼면 '선택 토글'(탭).
  const down = (id: number) => (e: React.PointerEvent) => {
    if (!myTurn || e.button > 0) return;
    sfx.pick();
    const sx = e.clientX, sy = e.clientY, ids = selected.includes(id) ? selected : [id];
    let active = false;
    const at = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null;
    const move = (ev: PointerEvent) => { if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return; active = true; setDrag({ ids, x: ev.clientX, y: ev.clientY, over: at(ev.clientX, ev.clientY) }); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!active) return toggle(id);
      const t = ev.type === 'pointerup' ? at(ev.clientX, ev.clientY) : null;
      if (t) place(ids, t);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const sortSmart = () => { const r = smartSort(draft.hand); setDraft(p => ({ ...p, hand: r.hand })); setBreaks(r.breaks); };
  const sortNum = () => { setDraft(p => ({ ...p, hand: [...p.hand].sort((a, b) => (isNum(a) ? a.value : 99) - (isNum(b) ? b.value : 99) || (isNum(a) && isNum(b) ? a.color.localeCompare(b.color) : 0)) })); setBreaks(new Set()); };
  const undo = () => { const last = hist[hist.length - 1]; if (!last) return; setDraft(last); setHist(h => h.slice(0, -1)); setSelected([]); };
  const reset = () => { setDraft({ hand: view.hand, table: view.table }); setHist([]); setSelected([]); };
  const send = (event: string) => emit(event, { roomId: view.roomId, clientSeq: game.next() }).catch(e => game.setNotice(e.message));
  const commit = () => { justCommitted.current = true; return emit('turn:commit', { roomId: view.roomId, version: view.version, table: draft.table, hand: draft.hand.map(t => t.id), clientSeq: game.next() }).then(() => { webPlatform.haptics.success(); sfx.chime(); }).catch(e => { justCommitted.current = false; game.setNotice(e.message); }); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!myTurn || document.activeElement !== document.body) return;
      if (e.key === 'Enter' && changed && allValid) { e.preventDefault(); commit(); }
      else if (e.key === ' ' && !changed) { e.preventDefault(); send('turn:draw'); }
      else if (e.key === 'Escape') setSelected([]);
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const remaining = Math.max(0, Math.ceil(((view.turn?.deadline ?? now) - now) / 1000));
  const pct = Math.min(100, (remaining / view.config.turnSeconds) * 100);
  const current = view.players.find(p => p.id === view.turn?.playerId);
  const over = drag?.over;
  const n = view.players.length, mineIdx = Math.max(0, view.players.findIndex(p => p.id === me));
  const opps = Array.from({ length: Math.max(0, n - 1) }, (_, i) => view.players[(mineIdx + i + 1) % n]!);
  const where = seatsFor(n).slice(1);
  const hint = !myTurn ? `${current?.name ?? ''}님이 생각하고 있어요` : selected.length ? `${selected.length}개 선택됨 — 조합의 + 를 누르거나 끌어서 놓으세요` : changed ? (allValid ? '좋아요! 확정하거나 계속 배치해 보세요' : '빨간 조합을 고쳐 주세요') : '타일을 누르거나 끌어서 시작하세요';

  return (
    <main className={`board ${myTurn ? 'mine' : ''} ${drag ? 'dragging' : ''}`}>
      <header className="top">
        {game.online ? <span /> : <span className="offline">연결 끊김</span>}
        <SoundToggle />
      </header>

      <div className="arena">
        {opps.map((p, i) => <OppSeat key={p.id} p={p} pos={where[i] ?? 'top'} active={view.turn?.playerId === p.id} remaining={remaining} pct={pct} />)}
        <div className="tablewrap">
          <section className={`felt ${over === 'new' ? 'over' : ''}`} data-drop="new">
            <p className="hint" aria-live="polite">{view.message && !myTurn ? view.message : hint}</p>
            {draft.table.length === 0 && <p className="empty">비어 있는 테이블<br /><small>타일을 이곳으로 끌어다 놓으면 새 조합이 만들어져요</small></p>}
            <div className="melds">
              {draft.table.map(m => { const i = info.get(m.id); return (
                <div key={m.id} data-drop={m.id} className={`meld ${i?.ok ? 'ok' : 'bad'} ${over === m.id ? 'over' : ''}`}>
                  <div className="tiles">{tilesOf(m).map(t => <TileView key={t.id} tile={t} fresh={!origIds.has(t.id)} flash={flash.has(t.id)} selected={selected.includes(t.id)} ghosted={!!drag?.ids.includes(t.id)} onPointerDown={down(t.id)} />)}
                    {selected.length > 0 && <button className="slot" onClick={() => place(selected, m.id)} aria-label="이 조합에 놓기">+</button>}</div>
                  {(needInitial || !i?.ok) && <small className="tag">{i?.ok ? `${i.sum}점` : '조합이 맞지 않아요'}</small>}
                </div>); })}
            </div>
          </section>
          <button className="pile" disabled={!myTurn || changed} onClick={() => send('turn:draw')} aria-label={`남은 타일 ${view.poolCount}개, 눌러서 뽑고 넘기기`} title="타일 뽑고 넘기기">
            <span className="stack" aria-hidden="true"><i /><i /><i /></span><b>{view.poolCount}</b><small>남은 타일</small>
          </button>
        </div>
      </div>

      <section className={`rack ${over === 'hand' ? 'over' : ''}`} data-drop="hand">
        <div className="rack-head">
          <div className="me">
            <Ring active={myTurn} pct={myTurn ? pct : 0} danger={myTurn && remaining <= 10} sec={remaining}><div className="avatar">{self?.name.slice(0, 1)}</div></Ring>
            <div><b>{selected.length ? `${selected.length}개 선택` : `내 타일 ${draft.hand.length}`}</b><small>{myTurn ? `내 차례 · ${remaining}초` : `${current?.name ?? ''}의 차례`}</small></div>
          </div>
          {!selected.length && needInitial && <span className={`meter ${placedPoints >= 30 ? 'done' : ''}`}><i style={{ width: `${Math.min(100, placedPoints / 30 * 100)}%` }} />첫 등록 {placedPoints}/30점</span>}
          {selected.length
            ? <span className="tools"><button className="primary" onClick={() => place(selected, 'new')}>새 조합 만들기</button><button onClick={() => place(selected, 'hand')}>손패로</button><button onClick={() => setSelected([])}>선택 해제</button></span>
            : <span className="tools"><button onClick={sortSmart}>추천 정리</button><button onClick={sortNum}>숫자순</button></span>}
        </div>
        <div className={`hand ${dealing ? 'deal' : ''}`}>{draft.hand.map((t, k) => <span key={t.id} className={breaks.has(t.id) ? 'gap' : ''} style={{ ['--n' as string]: k }}><TileView tile={t} selected={selected.includes(t.id)} ghosted={!!drag?.ids.includes(t.id)} onPointerDown={down(t.id)} /></span>)}</div>
      </section>

      <footer className="dock">
        <button disabled={!myTurn || !hist.length} onClick={undo}>한 단계 취소</button>
        <button disabled={!myTurn || !changed} onClick={reset}>처음으로</button>
        {changed
          ? <button className="primary go" disabled={!myTurn || !allValid} onClick={commit}>{allValid ? '배치 확정' : '조합 확인 필요'}<kbd>Enter</kbd></button>
          : <button className="primary go" disabled={!myTurn} onClick={() => send('turn:draw')}>타일 뽑고 넘기기<kbd>Space</kbd></button>}
      </footer>

      {drag && <div className="ghost" style={{ left: drag.x, top: drag.y }}>{drag.ids.slice(0, 4).map((id, k) => { const t = resolve(id); return t ? <div key={id} style={{ transform: `translate(${k * 10}px,${k * -4}px) rotate(${k * 3}deg)` }}><TileView tile={t} /></div> : null; })}{drag.ids.length > 1 && <em>{drag.ids.length}</em>}</div>}
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}

function Results({ view, game }: { view: PublicView; game: Game }) {
  const winner = view.players.find(p => p.id === view.roundWinnerId);
  return (
    <main className="screen results">
      <SoundToggle />
      <p className="fine">이번 판의 승자</p>
      <Letters text={winner?.name.slice(0, 4) ?? '—'} />
      <section className="paper"><h2>점수표</h2>{[...view.players].sort((a, b) => b.score - a.score).map((p, i) => <div key={p.id} className={i === 0 ? 'first' : ''}><b>{p.name}</b><strong className={p.score < 0 ? 'neg' : ''}>{p.score > 0 ? '+' : ''}{p.score}</strong></div>)}</section>
      {view.hostId === view.playerId ? <button className="primary" onClick={() => emit('game:lobby', { roomId: view.roomId, clientSeq: game.next() })}>대기실로 돌아가기</button> : <p className="fine">방장이 다음 판을 준비하고 있어요.</p>}
    </main>
  );
}

function App() {
  const game = useGame(); const view = game.view;
  if (!view) return <Landing game={game} />;
  if (view.phase === 'lobby') return <Lobby view={view} game={game} />;
  if (view.phase === 'roundEnd' || view.phase === 'matchEnd') return <Results view={view} game={game} />;
  return <Board view={view} game={game} />;
}
createRoot(document.getElementById('root')!).render(<App />);
