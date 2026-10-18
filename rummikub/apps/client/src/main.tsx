import { useCallback, useEffect, useMemo, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
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
type Anchor = { id: number; after: boolean };
type Drag = { ids: number[]; x: number; y: number; over: string | null; ins: Anchor | null };
const isNum = (t: Tile): t is Num => t.kind !== 'joker';
const SUIT = { red: '●', blue: '◆', orange: '▲', black: '■' } as const;
const COLORS = ['red', 'blue', 'orange', 'black'] as const;

const JokerMark = () => (
  <svg viewBox="0 0 32 32" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
    <path d="M6 13 8 4l5 5 3-6 3 6 5-5 2 9Z" fill="currentColor" /><circle cx="16" cy="21" r="8" /><circle cx="13" cy="20" r=".9" fill="currentColor" /><circle cx="19" cy="20" r=".9" fill="currentColor" /><path d="M12.5 23.5q3.5 3 7 0" />
  </svg>
);

function TileView({ tile, selected, ghosted, fresh, flash, onPointerDown, onKeyDown }: { tile: Tile; selected?: boolean; ghosted?: boolean; fresh?: boolean; flash?: boolean; onPointerDown?: (e: React.PointerEvent) => void; onKeyDown?: (e: React.KeyboardEvent) => void }) {
  const j = !isNum(tile);
  return (
    <button className={`tile ${j ? 'joker' : tile.color} ${selected ? 'selected' : ''} ${ghosted ? 'ghosted' : ''} ${fresh ? 'fresh' : ''} ${flash ? 'flash' : ''}`} data-t={tile.id} onPointerDown={onPointerDown} onKeyDown={onKeyDown} aria-pressed={!!selected} aria-label={j ? '조커' : `${tile.color} ${tile.value}`}>
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

/** 손패에서 바로 낼 수 있는 3장 조합을 겹치지 않게 골라 준다.
 * 완전한 솔버가 아니라, 처음 플레이하는 사람이 한 번에 시작할 수 있게 하는 보조 기능이다. */
function suggestedMelds(hand: Tile[], allowTwoJokers: boolean): Meld[] {
  const rest = [...hand];
  const out: Meld[] = [];
  while (rest.length >= 3) {
    const candidates: Array<{ meld: Meld; ids: number[]; value: number }> = [];
    for (let a = 0; a < rest.length - 2; a += 1) for (let b = a + 1; b < rest.length - 1; b += 1) for (let c = b + 1; c < rest.length; c += 1) {
      const sample = [rest[a]!, rest[b]!, rest[c]!];
      const checked = validateMeld(sample, allowTwoJokers, `auto-${sample.map(tile => tile.id).join('-')}`);
      if (checked.ok) candidates.push({ meld: checked.meld, ids: sample.map(tile => tile.id), value: sample.reduce((sum, tile) => sum + (isNum(tile) ? tile.value : 13), 0) });
    }
    const best = candidates.sort((a, b) => b.value - a.value)[0];
    if (!best) break;
    out.push(best.meld);
    const used = new Set(best.ids);
    for (let index = rest.length - 1; index >= 0; index -= 1) if (used.has(rest[index]!.id)) rest.splice(index, 1);
  }
  return out;
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

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [s, setS] = useState({ w: 0, h: 0 });
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setS({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect(); }, []);
  return s;
}
/** 테이블: 조합이 몇 개든 스크롤 없이 다 보이도록 타일 크기를 가장 크게 맞춘다 */
const fitMelds = (lens: number[], w: number, h: number) => {
  for (let tw = 46; tw >= 20; tw -= 2) { let x = 0, rows = 1; for (const n of lens) { const mw = n * (tw + 3) + 14; if (x && x + mw > w) { rows++; x = 0; } x += mw + 8; } if (rows * (tw * 1.4 + 20) <= h) return tw; }
  return 20;
};
const fitHand = (n: number, w: number, h: number) => {
  for (let tw = 48; tw >= 30; tw -= 2) { const cols = Math.max(1, Math.floor(w / (tw + 5))); if (Math.ceil(n / cols) * (tw * 1.4 + 28) <= h) return tw; }
  return 30;
};

function OppChip({ p, active, remaining, pct }: { p: PublicView['players'][number]; active: boolean; remaining: number; pct: number }) {
  return (
    <div className={`chip2 ${active ? 'active' : ''} ${p.handCount <= 3 ? 'low' : ''}`}>
      <Ring active={active} pct={active ? pct : 0} danger={active && remaining <= 10} sec={remaining}><div className="avatar">{p.isBot ? '봇' : p.name.slice(0, 1)}</div></Ring>
      <div className="who"><b>{p.name}</b><small>{active ? `${remaining}초` : p.hasInitialMeld ? '등록 완료' : '미등록'}</small></div>
      <em className="cnt" aria-label={`타일 ${p.handCount}개`}>{p.handCount}</em>
    </div>
  );
}

function Board({ view, game }: { view: PublicView; game: Game }) {
  const [draft, setDraft] = useState<Draft>({ hand: view.hand, table: view.table });
  const [hist, setHist] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [breaks, setBreaks] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [big, setBig] = useState(false);
  const lastTap = useRef<{ id: number; at: number } | null>(null);
  const rects = useRef(new Map<string, DOMRect>());
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const seenTable = useRef<Set<number> | null>(null);
  const order = useRef<number[]>([]);
  const justCommitted = useRef(false);
  const feltRef = useRef<HTMLElement | null>(null), handRef = useRef<HTMLDivElement | null>(null);
  const fs = useSize(feltRef), hs = useSize(handRef);
  const me = view.playerId, myTurn = view.turn?.playerId === me;
  const self = view.players.find(p => p.id === me);
  const allow = view.config.allowTwoJokersInMeld;
  const pool = useMemo(() => new Map<number, Tile>([...view.hand, ...view.tableTiles].map(t => [t.id, t])), [view.hand, view.tableTiles]);
  const resolve = (id: number) => pool.get(id);
  const tilesOf = (m: Meld) => m.tiles.map(e => resolve(e.tileId)).filter((t): t is Tile => !!t);
  const val = (e: Meld['tiles'][number]) => { const t = resolve(e.tileId); return t && isNum(t) ? t.value : e.represents?.value ?? 0; };

  useEffect(() => {
    const byId = new Map(view.hand.map(t => [t.id, t]));
    let hand: Tile[]; let fresh = new Set<number>();
    if (!order.current.length) { const s = smartSort(view.hand); hand = s.hand; setBreaks(s.breaks); sfx.deal(view.hand.length); }
    else { const kept = order.current.filter(id => byId.has(id)), known = new Set(kept); const added = view.hand.filter(t => !known.has(t.id)); fresh = new Set(added.map(t => t.id)); hand = [...kept.map(id => byId.get(id)!), ...added]; }
    order.current = hand.map(t => t.id); setNewIds(fresh);
    setDraft({ hand, table: view.table }); setHist([]); setSelected([]);
  }, [view.version]);
  useEffect(() => { if (draft.hand.length === view.hand.length) order.current = draft.hand.map(t => t.id); }, [draft.hand]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => {
    const ids = new Set(view.tableTiles.map(t => t.id));
    const prev = seenTable.current; seenTable.current = ids;
    if (justCommitted.current) { justCommitted.current = false; return; }
    if (!prev) return;
    const added = [...ids].filter(id => !prev.has(id)); if (!added.length) return;
    setFlash(new Set(added)); const t = setTimeout(() => setFlash(new Set()), 3400); return () => clearTimeout(t);
  }, [view.version]);

  // 타일이 옮겨질 때마다 이전 자리에서 새 자리로 미끄러지듯 이동한다(손패↔테이블, 정렬, 취소, 상대의 수 모두)
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>(); const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll<HTMLElement>('.ghand [data-t],.gmelds .m [data-t]').forEach(el => {
      const id = el.dataset.t!, r = el.getBoundingClientRect(), p = rects.current.get(id); next.set(id, r);
      if (p && !calm && (Math.abs(p.left - r.left) > 2 || Math.abs(p.top - r.top) > 2)) el.animate([{ transform: `translate(${p.left - r.left}px,${p.top - r.top}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.25,1)' });
    });
    rects.current = next;
  });
  const orderMeld = (meld: Meld): Meld => {
    const color = (e: Meld['tiles'][number]) => { const t = resolve(e.tileId); const c = t && isNum(t) ? t.color : e.represents?.color; return c ? COLORS.indexOf(c) : 4; };
    return { ...meld, tiles: [...meld.tiles].sort((a, b) => meld.type === 'run' ? val(a) - val(b) : color(a) - color(b)) };
  };
  const rebuild = (m: Meld): Meld => { const r = validateMeld(tilesOf(m), allow, m.id); return r.ok ? orderMeld(r.meld) : m; };
  const info = useMemo(() => new Map(draft.table.map(m => [m.id, { ok: validateMeld(tilesOf(m), allow, m.id).ok, sum: m.tiles.reduce((s, e) => s + val(e), 0) }])), [draft.table, pool, allow]);
  const handIds = useMemo(() => new Set(view.hand.map(t => t.id)), [view.hand]);
  const origIds = useMemo(() => new Set(view.table.flatMap(m => m.tiles.map(e => e.tileId))), [view.table]);
  const placedPoints = draft.table.flatMap(m => m.tiles).reduce((s, e) => handIds.has(e.tileId) ? s + val(e) : s, 0);
  const changed = draft.hand.length !== view.hand.length;
  const allValid = [...info.values()].every(v => v.ok);
  const needInitial = !!self && !self.hasInitialMeld;
  const initialReady = !needInitial || placedPoints >= view.config.initialMeldMin;
  const canCommit = myTurn && changed && allValid && initialReady;
  const suggestions = useMemo(() => suggestedMelds(draft.hand, allow), [draft.hand, allow]);
  /** 손패 묶음: 다음 턴을 위한 작업대. 구분선(breaks)으로 나뉜 타일 덩어리 */
  const groups = useMemo(() => { const out: Tile[][] = []; draft.hand.forEach(t => { if (!out.length || breaks.has(t.id)) out.push([t]); else out[out.length - 1]!.push(t); }); return out; }, [draft.hand, breaks]);
  /** 이 묶음을 완성하려면 어떤 타일이 필요한가(같은 색 연속 / 같은 숫자 다른 색) */
  const needsOf = (g: Tile[]) => {
    const nums = g.filter(isNum); if (g.length < 2 || nums.length !== g.length) return [];
    const out: { color: Num['color']; value: number }[] = []; const c0 = nums[0]!;
    if (nums.every(t => t.color === c0.color)) { const v = nums.map(t => t.value).sort((a, b) => a - b); if (v.every((x, i) => !i || x === v[i - 1]! + 1)) { if (v[0]! > 1) out.push({ color: c0.color, value: v[0]! - 1 }); if (v[v.length - 1]! < 13) out.push({ color: c0.color, value: v[v.length - 1]! + 1 }); } }
    else if (nums.length < 4 && nums.every(t => t.value === c0.value) && new Set(nums.map(t => t.color)).size === nums.length) COLORS.filter(c => !nums.some(t => t.color === c)).forEach(c => out.push({ color: c, value: c0.value }));
    return out;
  };
  const copies = (c: string, v: number) => [...draft.hand, ...view.tableTiles].filter(t => isNum(t) && t.color === c && t.value === v).length;
  const canReturn = selected.every(id => !origIds.has(id));
  const validCount = [...info.values()].filter(v => v.ok).length;
  const prevValid = useRef(validCount);
  useEffect(() => { if (myTurn && changed && validCount > prevValid.current) sfx.chime(); prevValid.current = validCount; }, [validCount]);
  const wasMine = useRef(myTurn);
  useEffect(() => { if (myTurn && !wasMine.current) { sfx.turn(); webPlatform.haptics.success(); } wasMine.current = myTurn; }, [myTurn]);

  const place = (ids: number[], target: Target, anchor?: Anchor | null) => {
    if (!myTurn || !ids.length) return;
    if ((target === 'hand' || target === 'group') && ids.some(id => origIds.has(id))) { game.setNotice('테이블에 있던 타일은 손패로 가져올 수 없어요.'); return; }
    const nb = new Set(breaks), rem = new Set(ids); // 빠져나가는 타일이 구분선을 쥐고 있으면 다음 타일로 넘긴다
    draft.hand.forEach((t, i) => { if (rem.has(t.id) && nb.has(t.id)) { nb.delete(t.id); const nx = draft.hand.slice(i + 1).find(x => !rem.has(x.id)); if (nx) nb.add(nx.id); } });
    setHist(h => [...h, draft]);
    setDraft(prev => {
      const set = new Set(ids);
      let hand = prev.hand.filter(t => !set.has(t.id));
      let table = prev.table.map(m => ({ ...m, tiles: m.tiles.filter(e => !set.has(e.tileId)) })).filter(m => m.tiles.length);
      const moved = ids.map(resolve).filter((t): t is Tile => !!t);
      if (target === 'hand' || target === 'group') { const i = anchor && target === 'hand' ? hand.findIndex(t => t.id === anchor.id) : -1; if (i < 0) hand = [...hand, ...moved]; else { const k = i + (anchor!.after ? 1 : 0); hand = [...hand.slice(0, k), ...moved, ...hand.slice(k)]; } }
      else {
        const id = target === 'new' ? `draft-${crypto.randomUUID()}` : target; const entries = moved.map(t => ({ tileId: t.id }));
        table = table.some(m => m.id === id) ? table.map(m => m.id === id ? { ...m, tiles: [...m.tiles, ...entries] } : m) : [...table, { id, type: 'run', tiles: entries } as Meld];
      }
      return { hand, table: table.map(rebuild) };
    });
    setSelected([]); setBreaks(target === 'group' ? new Set([...nb, ids[0]!]) : nb); webPlatform.haptics.tick();
    if (target === 'hand' || target === 'group') sfx.pick(); else sfx.clack();
  };
  /** 추천 조합 하나를 한 번에 놓는다 */
  const placeMeld = (meld: Meld) => {
    if (!myTurn) return; const used = new Set(meld.tiles.map(e => e.tileId));
    setHist(h => [...h, draft]); setSelected([]);
    setDraft(p => ({ table: [...p.table, { ...meld, id: `draft-${crypto.randomUUID()}` }], hand: p.hand.filter(t => !used.has(t.id)) })); webPlatform.haptics.tick(); sfx.clack();
  };
  const toggle = (id: number) => myTurn && setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const keyToggle = (id: number) => (e: React.KeyboardEvent) => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); toggle(id); };

  const groupOf = (id: number, meldId?: string) => meldId ? (draft.table.find(m => m.id === meldId)?.tiles.map(e => e.tileId) ?? [id]) : (groups.find(g => g.some(t => t.id === id))?.map(t => t.id) ?? [id]);
  // 탭 = 선택, 두 번 탭 = 묶음/조합 통째 선택, 드래그 = 이동. 이미 선택한 타일이 있을 때 테이블 타일을 탭하면 그 조합에 한꺼번에 붙는다.
  const down = (id: number, meldId?: string) => (e: React.PointerEvent) => {
    if (!myTurn || e.button > 0) return;
    sfx.pick();
    const sx = e.clientX, sy = e.clientY, ids = selected.includes(id) ? selected : [id];
    let active = false;
    const at = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null;
    const hit = (x: number, y: number): Anchor | null => { const el = document.elementFromPoint(x, y)?.closest('[data-tid]') as HTMLElement | null; if (!el) return null; const r = el.getBoundingClientRect(); return { id: Number(el.dataset.tid), after: x > r.left + r.width / 2 }; };
    const move = (ev: PointerEvent) => { if (!active && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return; active = true; const over = at(ev.clientX, ev.clientY); setDrag({ ids, x: ev.clientX, y: ev.clientY - 36, over, ins: over === 'hand' ? hit(ev.clientX, ev.clientY) : null }); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!active) { const t0 = lastTap.current; lastTap.current = { id, at: Date.now() }; if (t0 && t0.id === id && Date.now() - t0.at < 320) { lastTap.current = null; return setSelected(groupOf(id, meldId)); } if (meldId && selected.length && !selected.includes(id)) return place(selected, meldId); return toggle(id); }
      const t = ev.type === 'pointerup' ? at(ev.clientX, ev.clientY) : null;
      if (t === 'hand') { const a = hit(ev.clientX, ev.clientY); if (a && ids.includes(a.id)) return; place(ids, t, a); } else if (t) place(ids, t);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const sortSmart = () => { const r = smartSort(draft.hand); setDraft(p => ({ ...p, hand: r.hand })); setBreaks(r.breaks); };
  const sortNum = () => { setDraft(p => ({ ...p, hand: [...p.hand].sort((a, b) => (isNum(a) ? a.value : 99) - (isNum(b) ? b.value : 99) || (isNum(a) && isNum(b) ? a.color.localeCompare(b.color) : 0)) })); setBreaks(new Set()); };
  const undo = () => { const last = hist[hist.length - 1]; if (!last) return; setDraft(last); setHist(h => h.slice(0, -1)); setSelected([]); };
  const reset = () => { setDraft({ hand: order.current.map(id => pool.get(id)).filter((t): t is Tile => !!t), table: view.table }); setHist([]); setSelected([]); };
  const send = (event: string) => emit(event, { roomId: view.roomId, clientSeq: game.next() }).catch(e => game.setNotice(e.message));
  const commit = () => { justCommitted.current = true; return emit('turn:commit', { roomId: view.roomId, version: view.version, table: draft.table, hand: draft.hand.map(t => t.id), clientSeq: game.next() }).then(() => { webPlatform.haptics.success(); sfx.chime(); }).catch(e => { justCommitted.current = false; game.setNotice(e.message); }); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!myTurn || document.activeElement !== document.body) return;
      if (e.key === 'Enter' && canCommit) { e.preventDefault(); commit(); }
      else if (e.key === ' ' && !changed) { e.preventDefault(); send('turn:draw'); }
      else if (e.key === 'Escape') setSelected([]);
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const remaining = Math.max(0, Math.ceil(((view.turn?.deadline ?? now) - now) / 1000));
  const pct = Math.min(100, (remaining / view.config.turnSeconds) * 100);
  const current = view.players.find(p => p.id === view.turn?.playerId);
  const n = view.players.length, mineIdx = Math.max(0, view.players.findIndex(p => p.id === me));
  const opps = Array.from({ length: Math.max(0, n - 1) }, (_, i) => view.players[(mineIdx + i + 1) % n]!);
  const over = drag?.over;
  const mtw = big ? 40 : fitMelds(draft.table.map(m => m.tiles.length + (selected.length ? 0 : 0)), Math.max(200, fs.w - 20), Math.max(60, fs.h - 16));
  const htw = fitHand(draft.hand.length + groups.length, Math.max(200, hs.w - 12), Math.max(60, hs.h - 8));
  const hint = !myTurn ? (view.message || `${current?.name ?? ''}님 차례`) : selected.length ? `${selected.length}장 선택 · 조합이나 빈 테이블을 탭하세요` : changed ? (canCommit ? '좋아요! 확정을 누르세요' : !initialReady ? `첫 등록 ${placedPoints}/${view.config.initialMeldMin}점` : '빨간 조합을 고쳐 주세요') : needInitial ? `첫 등록 ${view.config.initialMeldMin}점 이상 · 추천 조합을 탭해 보세요` : '탭=선택 · 두 번 탭=묶음/조합 통째 선택 · 묶음으로 다음 턴을 계획하세요';

  return (
    <main className={`game ${myTurn ? 'mine' : ''} ${drag ? 'dragging' : ''}`}>
      <header className="gtop">
        <div className="chips">{opps.map(p => <OppChip key={p.id} p={p} active={view.turn?.playerId === p.id} remaining={remaining} pct={pct} />)}</div>
        {!game.online && <span className="offline">연결 끊김</span>}
        <div className={`mytimer ${myTurn ? 'on' : ''} ${myTurn && remaining <= 10 ? 'danger' : ''}`}>{myTurn ? `내 차례 ${remaining}` : `${current?.name ?? ''} ${remaining}`}</div>
        <button className="snd" aria-pressed={big} onClick={() => setBig(b => !b)} aria-label="테이블 크게 보기" title="테이블 크게/전체">{big ? '⤡' : '⤢'}</button>
        <SoundToggle />
      </header>

      <section ref={feltRef} className={`gfelt ${big ? 'big' : ''} ${over === 'new' ? 'over' : ''}`} data-drop="new" style={{ ['--tw' as string]: `${mtw}px` }}
        onClick={e => { if (selected.length && !(e.target as HTMLElement).closest('.m,.newslot')) place(selected, 'new'); }}>
        <p className="say" aria-live="polite">{hint}</p>
        {draft.table.length === 0 && <div className="empty2">테이블이 비어 있어요</div>}
        <div className="gmelds">
          {draft.table.map(m => { const i = info.get(m.id); return (
            <div key={m.id} data-drop={m.id} className={`m ${i?.ok ? 'ok' : 'bad'} ${over === m.id ? 'over' : ''} ${selected.length ? 'tap' : ''}`} onClick={e => { if (e.target === e.currentTarget && selected.length) place(selected, m.id); }}>
              {tilesOf(m).map(t => <TileView key={t.id} tile={t} fresh={!origIds.has(t.id)} flash={flash.has(t.id)} selected={selected.includes(t.id)} ghosted={!!drag?.ids.includes(t.id)} onPointerDown={down(t.id, m.id)} onKeyDown={keyToggle(t.id)} />)}
              <i className="mb">{i?.ok ? i.sum : '!'}</i>
            </div>); })}
          {myTurn && (selected.length > 0 || drag) && <button data-drop="new" className={`newslot ${over === 'new' ? 'over' : ''}`} onClick={() => place(selected, 'new')}>＋ 새 조합</button>}
        </div>
      </section>

      <section className={`grack ${over === 'hand' ? 'over' : ''}`} data-drop="hand">
        {myTurn && !selected.length && suggestions.length > 0 && <div className="sugg"><span>추천</span>{suggestions.map(s => <button key={s.id} className="sg" onClick={() => placeMeld(s)} aria-label="이 조합 놓기">{tilesOf(s).map(t => <TileView key={t.id} tile={t} />)}</button>)}</div>}
        <div ref={handRef} className="ghand" style={{ ['--tw' as string]: `${htw}px` }}>
          {groups.map(g => {
            const r = g.length >= 3 ? validateMeld(g, allow, `auto-${g[0]!.id}`) : null, nd = needsOf(g);
            return (
              <div key={g[0]!.id} className={`grp ${r?.ok ? 'ok' : ''}`}>
                <div className="gt">{g.map(t => <span key={t.id} data-tid={t.id} className={drag?.ins?.id === t.id ? (drag.ins.after ? 'ins-a' : 'ins-b') : ''}><TileView tile={t} fresh={newIds.has(t.id)} selected={selected.includes(t.id)} ghosted={!!drag?.ids.includes(t.id)} onPointerDown={down(t.id)} onKeyDown={keyToggle(t.id)} /></span>)}</div>
                {r?.ok && myTurn ? <button className="gplay" onClick={() => placeMeld(r.meld)}>▶ 내기 {g.reduce((a, t) => a + (isNum(t) ? t.value : 0), 0)}</button> : nd.length > 0 && <small className="need">필요 {nd.map(x => <b key={x.color + x.value} className={`${x.color} ${copies(x.color, x.value) >= 2 ? 'dead' : ''}`}>{SUIT[x.color]}{x.value}</b>)}</small>}
              </div>);
          })}
          {myTurn && (drag || selected.length > 0) && <button data-drop="group" className={`gnew ${over === 'group' ? 'over' : ''}`} onClick={() => place(selected, 'group')}>＋ 새 묶음</button>}
        </div>
      </section>

      <aside className="gside">
        {selected.length > 0 ? <>
          <button className="primary go" onClick={() => place(selected, 'new')}>새 조합<small>{selected.length}장</small></button>
          <button disabled={!canReturn} onClick={() => place(selected, selected.every(id => draft.hand.some(t => t.id === id)) ? 'group' : 'hand')}>{selected.every(id => draft.hand.some(t => t.id === id)) ? '묶음으로' : '손패로'}</button>
          <button onClick={() => setSelected([])}>선택 해제</button>
        </> : <>
          {changed
            ? <button className="primary go" disabled={!canCommit} onClick={commit}>{canCommit ? '확정' : initialReady ? '확인 필요' : `${placedPoints}/${view.config.initialMeldMin}점`}</button>
            : <button className="primary go" disabled={!myTurn} onClick={() => send('turn:draw')}>뽑기<small>남은 {view.poolCount}</small></button>}
          <button disabled={!myTurn || !hist.length} onClick={undo}>↶ 취소</button>
          <button disabled={!myTurn || !changed} onClick={reset}>처음으로</button>
          <div className="srt"><button onClick={sortSmart}>조합순</button><button onClick={sortNum}>숫자순</button></div>
        </>}
        {needInitial && <span className={`meter ${initialReady ? 'done' : ''}`}><i style={{ width: `${Math.min(100, placedPoints / view.config.initialMeldMin * 100)}%` }} />첫 등록 {placedPoints}/{view.config.initialMeldMin}</span>}
      </aside>

      <div className="rotate"><b>↻</b>가로로 돌려서 플레이해 주세요</div>
      {drag && <div className="ghost" style={{ left: drag.x, top: drag.y, ['--tw' as string]: '40px' }}>{drag.ids.slice(0, 4).map((id, k) => { const t = resolve(id); return t ? <div key={id} style={{ transform: `translate(${k * 10}px,${k * -4}px) rotate(${k * 3}deg)` }}><TileView tile={t} /></div> : null; })}{drag.ids.length > 1 && <em>{drag.ids.length}</em>}</div>}
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
