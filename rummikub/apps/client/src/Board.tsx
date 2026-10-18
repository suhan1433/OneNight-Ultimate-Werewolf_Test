import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Meld, Tile } from '@rummikub/rules';
import { validateMeld } from '@rummikub/rules';
import type { PublicView } from '@rummikub/protocol';
import { webPlatform } from '@rummikub/platform';
import { emit } from './socket.js';
import { sfx } from './sound.js';
import { COLORS, Ring, SortMode, SoundToggle, TileView, isNum, smartSort, sortByColor, sortByNumber, suggestedMelds } from './tiles.js';
import { Ctx, Dest, Draft, Result, mergeHandOrder, moveTiles, signature, swapJoker, tidyMeld, whyInvalid } from './editor.js';
import { fitHand, fitTable, handLine } from './layout.js';

export type GameApi = { online: boolean; notice: string; setNotice: (s: string) => void; next: () => number };
type Drop = { kind: 'none' | 'new' | 'rack' | 'meld'; meldId?: string; tid?: number; after?: boolean };
type Drag = { ids: number[]; tw: number; x: number; y: number; drop: Drop };
type Gest = {
  id: number; sx: number; sy: number; pid: number; tw: number; started: boolean;
  /** 길게 누르기: line = 이어진 타일 줄, lo..hi = 지금 선택된 구간, dir = 먼저 늘어날 방향 */
  long: boolean; line: number[]; lo: number; hi: number; dir: 1 | -1;
  timer?: ReturnType<typeof setTimeout>; grow?: ReturnType<typeof setInterval>;
};

const LONG_MS = 380;   // 이 시간 이상 누르면 "이어진 타일 늘리기" 시작
const GROW_MS = 230;   // 계속 누르고 있으면 이 간격으로 한 장씩 늘어난다
/** 첫 등록(30점) 전에는 테이블에 있던 타일/조합을 건드릴 수 없다(루미큐브 규칙). 서버 규칙이 다르면 false로. */
const LOCK_TABLE_BEFORE_INITIAL = true;
const stopTimers = (g: Gest | null | undefined) => { if (g?.timer) clearTimeout(g.timer); if (g?.grow) clearInterval(g.grow); };

/** 요소 크기(content box)를 추적한다. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect, w = Math.round(r.width), h = Math.round(r.height);
      setSize(s => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * 보드 v4 — 가로 화면 전용.
 *  · 손패: 전부 한 화면에 보이도록 타일 크기를 자동으로 줄이고(스크롤 없음), 높이도 화면의 1/3 이하로 제한한다.
 *  · 테이블: 모든 조합이 스크롤 없이 보이도록 타일 크기를 자동으로 맞춘다.
 *  · 타일을 길게 누르면 이어진 타일이 한 장씩 늘어나 선택되고, 그대로 끌어서 한꺼번에 옮긴다.
 *  · 끌 때는 손가락 위쪽에 타일이 떠서 놓을 자리가 가려지지 않는다.
 */
function OppChip({ p, active, remaining, pct }: { p: PublicView['players'][number]; active: boolean; remaining: number; pct: number }) {
  return (
    <div className={`chip2 ${active ? 'active' : ''} ${p.handCount <= 3 ? 'low' : ''}`}>
      <Ring active={active} pct={active ? pct : 0} danger={active && remaining <= 10} sec={remaining}><div className="avatar">{p.isBot ? '봇' : p.name.slice(0, 1)}</div></Ring>
      <div className="who"><b>{p.name}</b><small>{active ? `${remaining}초` : p.hasInitialMeld ? '등록 완료' : '미등록'}</small></div>
      <em className="cnt" aria-label={`타일 ${p.handCount}개`}>{p.handCount}</em>
    </div>
  );
}

export function Board({ view, game, onExit }: { view: PublicView; game: GameApi; onExit: () => void }) {
  const [draft, setDraft] = useState<Draft>({ hand: view.hand, table: view.table });
  const [past, setPast] = useState<Draft[]>([]);
  const [future, setFuture] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [breaks, setBreaks] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [press, setPress] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [banner, setBanner] = useState(false);
  const [drawBusy, setDrawBusy] = useState(false);
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState('');
  const committing = useRef(false);
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const order = useRef<number[]>([]);
  const seenTable = useRef<Set<number> | null>(null);
  const justCommitted = useRef(false);
  const gest = useRef<Gest | null>(null);
  const A = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void }>({ move: () => {}, up: () => {} });
  const [bdRef, bsz] = useSize<HTMLElement>();
  const [feltRef, fsz] = useSize<HTMLElement>();
  const [handRef, hsz] = useSize<HTMLDivElement>();

  const me = view.playerId, myTurn = view.turn?.playerId === me;
  const self = view.players.find(p => p.id === me);
  const allow = view.config.allowTwoJokersInMeld;
  const pool = useMemo(() => new Map<number, Tile>([...view.hand, ...view.tableTiles].map(t => [t.id, t])), [view.hand, view.tableTiles]);
  const resolve = (id: number) => pool.get(id);
  const tilesOf = (m: Meld) => m.tiles.map(e => resolve(e.tileId)).filter((t): t is Tile => !!t);
  const val = (e: Meld['tiles'][number]) => { const t = resolve(e.tileId); return t && isNum(t) ? t.value : e.represents?.value ?? 0; };
  const orderMeld = (meld: Meld): Meld => {
    const color = (e: Meld['tiles'][number]) => { const t = resolve(e.tileId); const c = t && isNum(t) ? t.color : e.represents?.color; return c ? COLORS.indexOf(c) : 4; };
    return { ...meld, tiles: [...meld.tiles].sort((a, b) => (meld.type === 'run' ? val(a) - val(b) : color(a) - color(b))) };
  };
  const rebuild = (m: Meld): Meld => { const r = validateMeld(tilesOf(m), allow, m.id); return r.ok ? orderMeld(r.meld) : tidyMeld(m, resolve); };
  const origIds = useMemo(() => new Set(view.table.flatMap(m => m.tiles.map(e => e.tileId))), [view.table]);
  const ctx: Ctx = { tile: resolve, orig: origIds, fix: rebuild, newId: () => `draft-${crypto.randomUUID()}`, ok: m => validateMeld(tilesOf(m), allow, m.id).ok };

  // 가로 화면 고정 시도(지원하는 브라우저/전체화면에서만 동작). 안 되면 CSS가 "가로로 돌려 주세요"를 띄운다.
  useEffect(() => { try { void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}); } catch { /* 미지원 */ } }, []);
  useEffect(() => () => stopTimers(gest.current), []);
  useEffect(() => { if (!tip) return; const t = setTimeout(() => setTip(''), 2600); return () => clearTimeout(t); }, [tip]);

  // 서버 확정 상태가 오면 편집 중이던 임시 상태를 버리고 서버 기준으로 복구한다
  useEffect(() => {
    const byId = new Map(view.hand.map(t => [t.id, t]));
    let hand: Tile[]; let fresh = new Set<number>();
    if (!order.current.length) { const s = smartSort(view.hand); hand = s.hand; setBreaks(s.breaks); sfx.deal(view.hand.length); }
    else { const kept = order.current.filter(id => byId.has(id)), known = new Set(kept); const added = view.hand.filter(t => !known.has(t.id)); fresh = new Set(added.map(t => t.id)); hand = [...kept.map(id => byId.get(id)!), ...added]; }
    order.current = hand.map(t => t.id); setNewIds(fresh);
    setDraft({ hand, table: view.table }); setPast([]); setFuture([]); setSelected([]);
  }, [view.version]);
  useEffect(() => { order.current = draft.hand.map(t => t.id); }, [draft.hand]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => { // 상대가 방금 놓은 타일을 잠깐 비춘다
    const ids = new Set(view.tableTiles.map(t => t.id)); const prev = seenTable.current; seenTable.current = ids;
    if (justCommitted.current) { justCommitted.current = false; return; }
    if (!prev) return; const added = [...ids].filter(id => !prev.has(id)); if (!added.length) return;
    setFlash(new Set(added)); const t = setTimeout(() => setFlash(new Set()), 3400); return () => clearTimeout(t);
  }, [view.version]);

  // 파생 값
  const handSet = useMemo(() => new Set(draft.hand.map(t => t.id)), [draft.hand]);
  const selSet = useMemo(() => new Set(selected), [selected]);
  const info = useMemo(() => new Map(draft.table.map(m => { const ts = tilesOf(m); const ok = validateMeld(ts, allow, m.id).ok; return [m.id, { ok, sum: m.tiles.reduce((s, e) => s + val(e), 0), why: ok ? '' : whyInvalid(ts) }]; })), [draft.table, pool, allow]);
  const baseSig = useMemo(() => signature({ hand: view.hand, table: view.table }), [view.hand, view.table]);
  const changed = useMemo(() => signature(draft) !== baseSig, [draft, baseSig]);
  const handIds = useMemo(() => new Set(view.hand.map(t => t.id)), [view.hand]);
  const placed = draft.table.flatMap(m => m.tiles).filter(e => handIds.has(e.tileId));
  const placedPoints = placed.reduce((s, e) => s + val(e), 0);
  const badIds = draft.table.filter(m => !info.get(m.id)?.ok).map(m => m.id);
  const needInitial = !!self && !self.hasInitialMeld;
  const initialReady = !needInitial || placedPoints >= view.config.initialMeldMin;
  const canCommit = myTurn && changed && placed.length > 0 && badIds.length === 0 && initialReady;
  const suggestions = useMemo(() => (myTurn ? suggestedMelds(draft.hand, allow) : []), [draft.hand, allow, myTurn]);
  const selHand = selected.filter(id => handSet.has(id));
  const returnable = selected.filter(id => !handSet.has(id) && !origIds.has(id));
  const remaining = Math.max(0, Math.ceil(((view.turn?.deadline ?? now) - now) / 1000));
  const pct = Math.min(100, (remaining / view.config.turnSeconds) * 100);
  const current = view.players.find(p => p.id === view.turn?.playerId);
  const n = view.players.length, mineIdx = Math.max(0, view.players.findIndex(p => p.id === me));
  const opps = Array.from({ length: Math.max(0, n - 1) }, (_, i) => view.players[(mineIdx + i + 1) % n]!);

  // 자동 맞춤: 손패는 "전부 보이게", 테이블은 "한눈에 보이게"
  const wide = bsz.w >= 900;
  const hf = useMemo(
    // 턴 중 크기가 들썩이지 않도록 턴 시작 손패 장수 기준으로 잡고, 묶음 구분선은 최소 4개분을 여유로 둔다
    () => fitHand(Math.max(draft.hand.length, view.hand.length), Math.max(breaks.size, 4), hsz.w, Math.floor(bsz.h * 0.34), wide ? 54 : 44),
    [draft.hand.length, view.hand.length, breaks.size, hsz.w, bsz.h, wide]);
  const mtw = useMemo(() => fitTable(draft.table.map(m => m.tiles.length), myTurn, fsz.w - 8, fsz.h - 10, wide ? 60 : 52) /* 투명 놓기 영역/배지가 삐져나갈 여유 */, [draft.table, myTurn, fsz.w, fsz.h, wide]);

  // 효과음/진동
  const validCount = [...info.values()].filter(v => v.ok).length; const prevValid = useRef(validCount);
  useEffect(() => { if (myTurn && changed && validCount > prevValid.current) sfx.chime(); prevValid.current = validCount; }, [validCount]);
  const wasMine = useRef(myTurn);
  useEffect(() => { if (myTurn && !wasMine.current) { sfx.turn(); webPlatform.haptics.success(); setBanner(true); setTimeout(() => setBanner(false), 1300); } wasMine.current = myTurn; }, [myTurn]);

  // 편집 명령
  const apply = (r: Result, history = true) => {
    if (!r.ok) { game.setNotice(r.reason); return false; }
    if (history) { setPast(p => [...p.slice(-99), draft]); setFuture([]); }
    setDraft(r.draft); setSelected([]); return true;
  };
  const place = (ids: number[], dest: Dest) => {
    if (!ids.length) return;
    const toHandOnly = dest.to === 'hand' && ids.every(id => handSet.has(id)); // 손패 안 정렬은 내 차례가 아니어도 된다
    if (!myTurn && !toHandOnly) return;
    if (myTurn && needInitial && LOCK_TABLE_BEFORE_INITIAL) {
      if (ids.some(id => origIds.has(id))) { game.setNotice('첫 등록 전에는 테이블에 있던 타일을 옮길 수 없어요.'); return; }
      const t = dest.to === 'meld' ? draft.table.find(m => m.id === dest.meldId) : undefined;
      if (t?.tiles.some(e => origIds.has(e.tileId))) { game.setNotice('첫 등록 전에는 기존 조합에 끼울 수 없어요. 새 조합으로 만들어 주세요.'); return; }
    }
    const r = moveTiles(draft, ids, dest, ctx);
    if (!apply(r, !toHandOnly)) return;
    if (dest.to === 'hand') { setBreaks(new Set()); setSortMode('custom'); sfx.pick(); } else sfx.clack();
    if (r.ok && r.splitId) { setPulse(new Set([r.meldId ?? '', r.splitId])); setTimeout(() => setPulse(new Set()), 1000); setTip('끼운 자리에서 조합을 나눴어요'); }
    webPlatform.haptics.tick();
  };
  const placeMeld = (m: Meld) => place(m.tiles.map(e => e.tileId), { to: 'new' });
  const step = (from: Draft[], setFrom: (f: Draft[]) => void, to: Draft[], setTo: (t: Draft[]) => void) => {
    const s = from[from.length - 1]; if (!s) return;
    setFrom(from.slice(0, -1)); setTo([...to.slice(-99), draft]);
    setDraft({ hand: mergeHandOrder(draft.hand, s.hand), table: s.table }); setSelected([]); webPlatform.haptics.tick();
  };
  const undo = () => step(past, setPast, future, setFuture);
  const redo = () => step(future, setFuture, past, setPast);
  const reset = () => { if (!changed) return; setPast(p => [...p.slice(-99), draft]); setFuture([]); setDraft({ hand: mergeHandOrder(draft.hand, view.hand), table: view.table }); setSelected([]); };
  const cycleSort = () => {
    const next: SortMode = sortMode === 'smart' ? 'num' : sortMode === 'num' ? 'color' : 'smart';
    const r = next === 'smart' ? smartSort(draft.hand) : next === 'color' ? sortByColor(draft.hand) : { hand: sortByNumber(draft.hand), breaks: new Set<number>() };
    setDraft(p => ({ ...p, hand: r.hand })); setBreaks(r.breaks); setSortMode(next); setNewIds(new Set());
  };
  const send = (event: string) => emit(event, { roomId: view.roomId, clientSeq: game.next() }).catch((e: Error) => game.setNotice(e.message));
  const commit = () => { if (committing.current) return; committing.current = true; justCommitted.current = true; return emit('turn:commit', { roomId: view.roomId, version: view.version, table: draft.table, hand: draft.hand.map(t => t.id), clientSeq: game.next() }).then(() => { webPlatform.haptics.success(); sfx.chime(); }).catch((e: Error) => { justCommitted.current = false; game.setNotice(e.message); }).finally(() => { committing.current = false; }); };
  const onDraw = () => { if (drawBusy || !myTurn) return; setDrawBusy(true); webPlatform.haptics.tick(); send('turn:draw').finally(() => setTimeout(() => setDrawBusy(false), 700)); };

  // 끌기: "놓을 곳"은 손가락이 아니라 손가락 위에 뜬 타일(aim) 아래의 요소로 판정한다
  const aim = (e: { clientX: number; clientY: number; pointerType: string }) => {
    if (e.pointerType === 'mouse') return { x: e.clientX, y: e.clientY };
    // 손가락 위쪽에 타일을 띄우되, 손패 영역에 가까워지면 오프셋을 0으로 줄여 손패에도 정확히 놓을 수 있게 한다
    const top = document.querySelector('[data-rack]')?.getBoundingClientRect().top ?? Infinity;
    const k = Math.min(1, Math.max(0, 1 - (e.clientY - (top - 44)) / 64));
    return { x: e.clientX, y: Math.max(8, e.clientY - 44 * k) };
  };
  const nearest = (root: Element, x: number, y: number) => {
    let best: HTMLElement | undefined, bd = Infinity;
    root.querySelectorAll<HTMLElement>('[data-tid]').forEach(t => { const r = t.getBoundingClientRect(); const d = Math.hypot(x - (r.left + r.width / 2), (y - (r.top + r.height / 2)) * 0.6); if (d < bd) { bd = d; best = t; } });
    return best;
  };
  const probe = (x: number, y: number): Drop => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null; if (!el) return { kind: 'none' };
    const meldEl = el.closest<HTMLElement>('[data-m]'), rackEl = el.closest<HTMLElement>('[data-rack]');
    const pick = (root: HTMLElement) => {
      const hit = el.closest<HTMLElement>('[data-tid]'); const tile = hit && root.contains(hit) ? hit : nearest(root, x, y);
      if (!tile) return { tid: undefined, after: false };
      const r = tile.getBoundingClientRect(); return { tid: Number(tile.dataset.tid), after: x > r.left + r.width / 2 };
    };
    if (meldEl) return { kind: 'meld', meldId: meldEl.dataset.m!, ...pick(meldEl) };
    if (rackEl) return { kind: 'rack', ...pick(rackEl) };
    if (el.closest('[data-felt]')) return { kind: 'new' };
    return { kind: 'none' };
  };
  const dropTo = (ids: number[], d: Drop) => {
    if (!myTurn && d.kind !== 'rack') return;
    if (d.kind === 'new') return place(ids, { to: 'new' });
    if (d.kind === 'rack') { const at = d.tid !== undefined && !ids.includes(d.tid) ? draft.hand.findIndex(t => t.id === d.tid) + (d.after ? 1 : 0) : undefined; return place(ids, { to: 'hand', at: at !== undefined && at < 0 ? undefined : at }); }
    if (d.kind !== 'meld') return;
    const m = draft.table.find(x => x.id === d.meldId); if (!m) return;
    const target = d.tid !== undefined ? resolve(d.tid) : undefined, e = m.tiles.find(x => x.tileId === d.tid);
    const one = ids.length === 1 ? resolve(ids[0]!) : undefined;
    if (target && !isNum(target) && one && isNum(one) && handSet.has(one.id) && e?.represents && e.represents.color === one.color && e.represents.value === one.value && !needInitial) {
      if (apply(swapJoker(draft, m.id, target.id, one.id, ctx))) { game.setNotice('조커를 꺼냈어요. 확정 전에 다른 조합에 꼭 써야 해요.'); sfx.clack(); }
      return;
    }
    const idx = d.tid !== undefined ? m.tiles.findIndex(x => x.tileId === d.tid) + (d.after ? 1 : 0) : undefined;
    place(ids, { to: 'meld', meldId: m.id, index: idx });
  };
  const toggle = (id: number) => { sfx.pick(); setSelected(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id])); };

  // 길게 누르기: 눌린 타일과 "이어진" 타일(조합 안 이웃 / 손패에서 이어지는 이웃)이 한 장씩 늘어난다
  const lineOf = (id: number): number[] => {
    const m = draft.table.find(x => x.tiles.some(e => e.tileId === id));
    return m ? m.tiles.map(e => e.tileId) : handLine(draft.hand, breaks, id);
  };
  const growStep = (g: Gest) => {
    if (gest.current !== g || g.started) { clearInterval(g.grow); return; }
    const canR = g.hi < g.line.length - 1, canL = g.lo > 0;
    if (!canR && !canL) { clearInterval(g.grow); return; }
    if (g.dir === 1 ? canR : !canL) g.hi++; else g.lo--;
    setSelected(g.line.slice(g.lo, g.hi + 1)); sfx.pick(); webPlatform.haptics.tick();
    if (g.lo === 0 && g.hi === g.line.length - 1) clearInterval(g.grow);
  };
  const beginLong = (g: Gest) => {
    if (gest.current !== g || g.started) return;
    g.long = true; g.line = lineOf(g.id); g.lo = g.hi = Math.max(0, g.line.indexOf(g.id));
    setPress(null); setSelected([g.id]); sfx.pick(); webPlatform.haptics.tick();
    if (g.line.length > 1) g.grow = setInterval(() => growStep(g), GROW_MS);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button > 0) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]'); if (!t) return;
    if (!myTurn && !t.closest('[data-rack]')) return; // 상대 차례에도 손패는 미리 정리할 수 있다
    if (myTurn && needInitial && LOCK_TABLE_BEFORE_INITIAL && origIds.has(Number(t.dataset.t))) { game.setNotice('첫 등록 전에는 테이블 타일을 옮길 수 없어요.'); return; }
    stopTimers(gest.current);
    const r = t.getBoundingClientRect();
    const g: Gest = { id: Number(t.dataset.t), sx: e.clientX, sy: e.clientY, pid: e.pointerId, tw: Math.max(34, r.width), started: false, long: false, line: [], lo: 0, hi: 0, dir: e.clientX >= r.left + r.width / 2 ? 1 : -1 };
    g.timer = setTimeout(() => beginLong(g), LONG_MS);
    gest.current = g; setPress(g.id);
  };
  A.current.move = (e: PointerEvent) => {
    const g = gest.current; if (!g || g.pid !== e.pointerId) return;
    if (!g.started) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < (g.long ? 16 : e.pointerType === 'mouse' ? 5 : 9)) return;
      stopTimers(g); g.started = true; setPress(null); sfx.pick(); webPlatform.haptics.tick();
      const ids = g.long ? g.line.slice(g.lo, g.hi + 1) : selSet.has(g.id) ? selected : [g.id];
      if (g.long) setSelected(ids);
      const a = aim(e); setDrag({ ids, tw: g.tw, ...a, drop: probe(a.x, a.y) }); return;
    }
    const a = aim(e);
    const f = feltRef.current; // 테이블이 넘칠 때만(최소 크기에서도 안 들어갈 때) 가장자리 자동 스크롤
    if (f && f.scrollHeight > f.clientHeight) { const b = f.getBoundingClientRect(); if (a.x > b.left && a.x < b.right) { if (a.y < b.top + 36) f.scrollTop -= 10; else if (a.y > b.bottom - 36 && a.y < b.bottom + 16) f.scrollTop += 10; } }
    setDrag(d => (d ? { ...d, ...a, drop: probe(a.x, a.y) } : d));
  };
  A.current.up = (e: PointerEvent) => {
    const g = gest.current; if (!g || g.pid !== e.pointerId) return;
    stopTimers(g); gest.current = null; setPress(null);
    if (!g.started) { if (e.type !== 'pointercancel' && !g.long) toggle(g.id); return; } // 길게 눌렀다 떼면 선택이 그대로 남는다
    const d = drag; setDrag(null);
    if (d && e.type !== 'pointercancel') { const a = aim(e); dropTo(d.ids, probe(a.x, a.y)); }
  };
  useEffect(() => {
    const mv = (e: PointerEvent) => A.current.move(e), up = (e: PointerEvent) => A.current.up(e);
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!myTurn || document.activeElement !== document.body) return;
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      if (e.key === 'Enter' && canCommit) { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') setSelected([]);
      else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const hint = !myTurn ? (view.message || `${current?.name ?? ''}님 차례예요 · 손패는 미리 정리해 둘 수 있어요`)
    : tip ? tip
    : selected.length ? `${selected.length}장 선택 · 끌어서 옮기세요`
    : changed ? (canCommit ? '좋아요! ✓ 확정을 누르세요' : placed.length === 0 ? '손패 타일을 1장 이상 내야 해요' : !initialReady ? `첫 등록 ${placedPoints}/${view.config.initialMeldMin}점` : badIds.length ? (info.get(badIds[0]!)?.why ?? '고쳐야 할 조합이 있어요') : '확인이 필요해요')
    : needInitial ? `첫 등록 ${view.config.initialMeldMin}점 이상 · 타일을 끌어 놓으세요` : '끌어서 놓기 · 길게 누르면 이어진 타일이 늘어나요';
  const insOf = (id: number) => (drag && drag.drop.tid === id && (drag.drop.kind === 'meld' || drag.drop.kind === 'rack') ? (drag.drop.after ? 'a' : 'b') : null);
  const sortLabel = { smart: '조합순', num: '숫자순', color: '색상순', custom: '내 배열' }[sortMode];
  const tv = (t: Tile, extra: Partial<React.ComponentProps<typeof TileView>> = {}) => <TileView key={t.id} tile={t} selected={selSet.has(t.id)} ghosted={!!drag?.ids.includes(t.id)} pressing={press === t.id} ins={insOf(t.id)} {...extra} />;

  return (
    <main ref={bdRef} className={`bd ${myTurn ? 'mine' : ''} ${drag ? 'dragging' : ''} ${myTurn && remaining <= 10 ? 'urgent' : ''}`} style={{ ['--mtw' as string]: `${mtw}px`, ['--rtw' as string]: `${hf.tw}px` }} onContextMenu={e => e.preventDefault()} onPointerDown={onDown}>
      <div className="rot" role="alert"><b aria-hidden="true">⟳</b>화면을 가로로 돌려 주세요</div>
      {banner && <div className="banner" aria-hidden="true">내 차례!</div>}
      <header className="bd-top">
        <div className="chips">{opps.map(p => <OppChip key={p.id} p={p} active={view.turn?.playerId === p.id} remaining={remaining} pct={pct} />)}</div>
        <p className={`bd-say ${canCommit ? 'good' : ''}`} aria-live="polite">{hint}</p>
        {!game.online && <span className="offline">연결 끊김</span>}
        <div className={`mytimer ${myTurn ? 'on' : ''} ${myTurn && remaining <= 10 ? 'danger' : ''}`}>{myTurn ? `내 차례 ${remaining}` : `${current?.name ?? ''} ${remaining}`}</div>
        <SoundToggle />
        <button className="exit compact" onClick={onExit}>나가기</button>
      </header>

      <div className="bd-fw">
        <section ref={feltRef} className={`bd-felt ${drag?.drop.kind === 'new' ? 'over' : ''}`} data-felt aria-label="테이블">
          <div className="bd-melds">
            {draft.table.map(m => { const i = info.get(m.id); return (
              <div key={m.id} data-m={m.id} className={`bm ${i?.ok ? 'ok' : 'bad'} ${drag?.drop.kind === 'meld' && drag.drop.meldId === m.id ? 'over' : ''} ${pulse.has(m.id) ? 'pulse' : ''}`}
                onClick={() => { if (myTurn && selected.length) place(selected, { to: 'meld', meldId: m.id }); }}>
                {m.tiles.map(e => { const t = resolve(e.tileId); return t ? tv(t, { repC: !isNum(t) ? e.represents?.color : undefined, repV: !isNum(t) ? e.represents?.value : undefined, fresh: !origIds.has(t.id), flash: flash.has(t.id) }) : null; })}
                <i className="bm-badge">{i?.ok ? `✓ ${i.sum}` : '⚠'}</i>
              </div>); })}
            {myTurn && <button className={`bd-new ${drag?.drop.kind === 'new' ? 'over' : ''}`} onClick={() => selected.length && place(selected, { to: 'new' })}>＋<small>새 조합</small></button>}
          </div>
          {draft.table.length === 0 && !myTurn && <p className="bd-empty">테이블이 비어 있어요</p>}
        </section>
        {selected.length > 0 && myTurn && !drag && (
          <div className="bd-sel" role="toolbar" aria-label="선택한 타일">
            <b>{selected.length}장</b>
            <button className="primary" onClick={() => place(selected, { to: 'new' })}>새 조합</button>
            <button disabled={!returnable.length && selHand.length !== selected.length} onClick={() => place(selHand.length === selected.length ? selected : returnable, { to: 'hand' })}>손패로</button>
            <button onClick={() => setSelected([])} aria-label="선택 해제">✕</button>
          </div>)}
      </div>

      <section className={`bd-rack ${drag?.drop.kind === 'rack' ? 'over' : ''}`} data-rack aria-label="내 손패">
        <div ref={handRef} className="bd-hand" style={{ height: hf.h }}>
          {draft.hand.map(t => <span className="hs" key={t.id}>{breaks.has(t.id) && <i className="brk" />}{tv(t, { isNew: newIds.has(t.id) })}</span>)}
        </div>
      </section>

      <aside className="bd-act">
        <div className="bd-info">
          <span>손패 <b>{draft.hand.length}</b>{newIds.size > 0 && <em className="newbadge">NEW {newIds.size}</em>}</span>
          {needInitial && <span className={`meter ${initialReady ? 'done' : ''}`}><i style={{ width: `${Math.min(100, (placedPoints / view.config.initialMeldMin) * 100)}%` }} />첫 등록 {placedPoints}/{view.config.initialMeldMin}</span>}
        </div>
        <div className="bd-tools">
          {myTurn && !selected.length && suggestions[0] && <button className="bd-sug" onClick={() => placeMeld(suggestions[0]!)} aria-label="추천 조합 내기">💡 추천 {suggestions.length}</button>}
          <button onClick={cycleSort} aria-label={`손패 정렬: 지금 ${sortLabel}`}>{sortLabel}</button>
        </div>
        <div className="urow">
          <button disabled={!myTurn || !past.length} onClick={undo} aria-label="되돌리기">↶</button>
          <button disabled={!myTurn || !future.length} onClick={redo} aria-label="다시 실행">↷</button>
          <button disabled={!myTurn || !changed} onClick={reset} aria-label="처음 상태로">⟲</button>
        </div>
        {changed
          ? <button className={`primary go ${canCommit ? 'ready' : ''}`} disabled={!canCommit} onClick={commit}>{canCommit ? '✓ 확정' : placed.length && !initialReady ? `${placedPoints}/${view.config.initialMeldMin}점` : '확인 필요'}</button>
          : <button className="primary go" disabled={!myTurn || drawBusy} onClick={onDraw}>뽑기<small>남은 {view.poolCount}</small></button>}
      </aside>

      {drag && (
        <div className="ghost" style={{ left: drag.x, top: drag.y, ['--tw' as string]: `${drag.tw}px`, ['--th' as string]: `${Math.round(drag.tw * 1.4)}px` }}>
          <div className="gstack">{drag.ids.slice(0, 8).map(id => { const t = resolve(id); return t ? <TileView key={id} tile={t} passive /> : null; })}</div>
          {drag.ids.length > 1 && <em>{drag.ids.length}</em>}
        </div>)}
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}
