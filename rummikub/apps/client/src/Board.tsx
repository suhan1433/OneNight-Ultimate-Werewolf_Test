import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Meld, Tile } from '@rummikub/rules';
import { orderMeld, validateMeld } from '@rummikub/rules';
import type { PublicView } from '@rummikub/protocol';
import { webPlatform } from '@rummikub/platform';
import { emit } from './socket.js';
import { sfx } from './sound.js';
import { Ring, SortMode, TileView, isNum, smartSort, sortByColor, sortByNumber, suggestedMelds } from './tiles.js';
import { Ctx, Dest, Draft, Result, mergeHandOrder, moveTiles, signature, swapJoker, jokerReplacement } from './editor.js';
import { HAND, MELD, Pos, Slots, arrangeSlots, findSpot, fitHand, fitMobileHand, layoutTable, meldInsertIndex, meldSize, normalizeSlots, placeInSlots, slotLine } from './layout.js';
import { checkMeld } from './meldRules.js';
import { useTileMotion } from './motion.js';
import { toClientPoint, toLocalPoint, toLocalRect, useFrame } from './orient.js';

export type GameApi = { online: boolean; notice: string; setNotice: (s: string) => void; next: () => number };
type EditSnapshot = { draft: Draft; slots: Slots; tpos: Record<string, Pos>; sortMode: SortMode };
type Spot = { x: number; y: number; w: number; h: number };
type Drop = { kind: 'none' | 'new' | 'rack' | 'meld'; meldId?: string; tid?: number; after?: boolean; slot?: number; spot?: Spot | null };
type Drag = { ids: number[]; tw: number; x: number; y: number; ox: number; oy: number; drop: Drop; meld?: string };
type Gest = {
  id: number; sx: number; sy: number; pid: number; tw: number; grabX: number; grabY: number; started: boolean;
  /** 조합 손잡이(⠿)로 시작한 제스처: 조합 전체를 옮긴다 */
  meld?: string; ids?: number[];
  /** 길게 누르기: line = 이어진 타일 줄, lo..hi = 지금 선택된 구간, dir = 먼저 늘어날 방향 */
  long: boolean; line: number[]; lo: number; hi: number; dir: 1 | -1;
  timer?: ReturnType<typeof setTimeout>; grow?: ReturnType<typeof setInterval>;
};

const LONG_MS = 380;   // 이 시간 이상 누르면 "이어진 타일 늘리기" 시작
const GROW_MS = 230;   // 계속 누르고 있으면 이 간격으로 한 장씩 늘어난다
/** 첫 등록(30점) 전에는 테이블에 있던 타일/조합을 건드릴 수 없다(루미큐브 규칙). 서버 규칙이 다르면 false로. */
const LOCK_TABLE_BEFORE_INITIAL = true;
const stopTimers = (g: Gest | null | undefined) => { if (g?.timer) clearTimeout(g.timer); if (g?.grow) clearInterval(g.grow); };
const sameSlots = (a: Slots, b: Slots) => a.length === b.length && a.every((v, i) => v === b[i]);
const sameDrop = (a: Drop, b: Drop) => a.kind === b.kind && a.meldId === b.meldId && a.tid === b.tid && a.after === b.after && a.slot === b.slot && !!a.spot === !!b.spot && a.spot?.w === b.spot?.w && a.spot?.h === b.spot?.h;
const groupsOf = (hand: Tile[], breaks: ReadonlySet<number>) => { const g: number[][] = []; hand.forEach(t => { if (!g.length || breaks.has(t.id)) g.push([]); g[g.length - 1]!.push(t.id); }); return g; };

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
 * 가로 전용 보드 — 전체 테이블 맞춤, 자유 배치.
 *  · 손패: 칸(slot) 랙. 타일을 빈 칸 아무 데나 놓을 수 있고, 빈 칸이 곧 내가 만든 묶음 구분선이다.
 *  · 테이블: 조합마다 위치가 있다. 위쪽 손잡이(⠿)를 끌어 원하는 곳으로 옮기고, 빈 곳에 놓으면 그 자리에 새 조합이 생긴다.
 *  · 규칙: 같은 색 연속 숫자(런)는 왼쪽 → 오른쪽으로 작은 수부터 "놓인 순서대로" 유효하다(6·5·7 은 ⚠).
 *  · 길게 누르면 이어진 타일이 한 장씩 늘어나 선택되고, 그대로 끌어 한꺼번에 옮긴다.
 */
function OppChip({ p, active, remaining, pct }: { p: PublicView['players'][number]; active: boolean; remaining: number; pct: number }) {
  return (
    <div className={`chip2 ${active ? 'active' : ''} ${p.handCount <= 3 ? 'low' : ''}`} aria-current={active ? 'true' : undefined}>
      <Ring active={active} pct={active ? pct : 0} danger={active && remaining <= 10} sec={remaining}><div className="avatar">{p.isBot ? '봇' : p.name.slice(0, 1)}</div></Ring>
      <div className="who"><b>{p.name}</b><small>{active ? '차례' : p.hasInitialMeld ? '등록 완료' : '미등록'}</small></div>
      <em className="cnt" aria-label={`타일 ${p.handCount}개`}>{p.handCount}</em>
    </div>
  );
}
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function Board({ view, game, onExit }: { view: PublicView; game: GameApi; onExit: () => void }) {
  const [draft, setDraft] = useState<Draft>({ hand: view.hand, table: view.table });
  const [past, setPast] = useState<EditSnapshot[]>([]);
  const [future, setFuture] = useState<EditSnapshot[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [slots, setSlots] = useState<Slots>([]);
  const [tpos, setTpos] = useState<Record<string, Pos>>({});
  const [focus, setFocus] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [press, setPress] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [banner, setBanner] = useState('');
  const [coach, setCoach] = useState(() => { try { return localStorage.getItem('rk-coach2') !== '1'; } catch { return false; } });
  const [drawBusy, setDrawBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState('');
  const [menu, setMenu] = useState(false);
  const [landed, setLanded] = useState<Set<number>>(new Set());
  const [pop, setPop] = useState<Set<string>>(new Set());
  const [dealing, setDealing] = useState(false);
  const tiltT = useRef<ReturnType<typeof setTimeout>>();
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const committing = useRef(false);
  const home = useRef(new Map<number, number>());        // 손패를 떠난 타일의 원래 칸(되돌리면 거기로)
  const arranged = useRef(false);
  const prevHand = useRef<Set<number> | null>(null);
  const seenTable = useRef<Set<number> | null>(null);
  const justCommitted = useRef(false);
  const gest = useRef<Gest | null>(null);
  const A = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: () => void }>({ move: () => {}, up: () => {}, cancel: () => {} });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const spotRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const dragFrame = useRef<number | null>(null);
  const pendingPointer = useRef<PointerEvent | null>(null);
  const suppressClick = useRef(false);
  const [bdRef, bsz] = useSize<HTMLElement>();
  const [feltRef, fsz] = useSize<HTMLElement>();
  const [handRef, hsz] = useSize<HTMLDivElement>();
  // 세로 화면이면 보드를 돌려 그린다. 계산은 모두 local(보드 기준) 좌표로 하고, 화면 좌표는 여기서만 오간다.
  const { frame: fr, flip } = useFrame();
  const stage = () => bdRef.current!.getBoundingClientRect();
  const L = (x: number, y: number) => toLocalPoint(stage(), fr, x, y);
  const C = (x: number, y: number) => toClientPoint(stage(), fr, x, y);
  const RL = (el: Element) => toLocalRect(stage(), fr, el.getBoundingClientRect());
  const muted = useSyncExternalStore(sfx.subscribe, sfx.isMuted);

  const me = view.playerId, myTurn = view.turn?.playerId === me;
  const self = view.players.find(p => p.id === me);
  const allow = view.config.allowTwoJokersInMeld;
  const pool = useMemo(() => new Map<number, Tile>([...view.hand, ...view.tableTiles].map(t => [t.id, t])), [view.hand, view.tableTiles]);
  const resolve = (id: number) => pool.get(id);
  const tilesOf = (m: Meld) => m.tiles.map(e => resolve(e.tileId)).filter((t): t is Tile => !!t);
  const val = (e: Meld['tiles'][number]) => { const t = resolve(e.tileId); return t && isNum(t) ? t.value : e.represents?.value ?? 0; };
  /** 순서까지 보는 조합 검사(런은 놓인 순서대로) */
  const check = (m: Meld) => checkMeld(m, resolve, allow, validateMeld);
  const rebuild = (m: Meld): Meld => { const c = check(m); return c.ok ? c.meld : m; };
  /** 서버가 준 조합(이미 유효)은 런을 숫자순으로 가지런히 해서 시작한다. 이후 순서는 사용자가 정한다. */
  const asServer = (m: Meld): Meld => orderMeld(m, pool);
  const origIds = useMemo(() => new Set(view.table.flatMap(m => m.tiles.map(e => e.tileId))), [view.table]);
  const ctx: Ctx = { tile: resolve, orig: origIds, fix: rebuild, newId: () => `draft-${crypto.randomUUID()}`, ok: m => check(m).ok };

  // 게임 중에는 문서 스크롤/당겨서 새로고침을 막는다.
  useEffect(() => { document.documentElement.classList.add('in-game'); return () => document.documentElement.classList.remove('in-game'); }, []);
  useEffect(() => () => stopTimers(gest.current), []);
  useEffect(() => { if (!tip) return; const t = setTimeout(() => setTip(''), 2600); return () => clearTimeout(t); }, [tip]);

  // 서버 확정 상태가 오면 편집 중이던 임시 상태를 버리고 서버 기준으로 복구한다(손패 칸 배치는 그대로 유지)
  useLayoutEffect(() => {
    const g = gest.current;
    const ids = g?.ids ?? (g ? [g.id] : []);
    // Opponents' draws must not interrupt the rack organization allowed on their turn.
    const keepRackGesture = !!g && !g.meld && ids.every(id => view.hand.some(t => t.id === id));
    const keepMeldGesture = !!g?.meld && view.table.some(m => m.id === g.meld && m.tiles.length === ids.length && m.tiles.every(e => ids.includes(e.tileId)));
    if (!keepRackGesture && !keepMeldGesture) {
      stopTimers(g); gest.current = null;
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null; pendingPointer.current = null; dragRef.current = null;
      setDrag(null); setPress(null);
      if (g && bdRef.current?.hasPointerCapture(g.pid)) bdRef.current.releasePointerCapture(g.pid);
    }
    const prev = prevHand.current; prevHand.current = new Set(view.hand.map(t => t.id));
    setNewIds(prev ? new Set(view.hand.filter(t => !prev.has(t.id)).map(t => t.id)) : new Set());
    setDraft({ hand: view.hand, table: view.table.map(asServer) }); setPast([]); setFuture([]);
    if (!keepRackGesture && !keepMeldGesture) setSelected([]);
  }, [view.version]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { // 상대가 방금 놓은 타일을 잠깐 비춘다
    const ids = new Set(view.tableTiles.map(t => t.id)); const prev = seenTable.current; seenTable.current = ids;
    if (justCommitted.current) { justCommitted.current = false; return; }
    if (!prev) return; const added = [...ids].filter(id => !prev.has(id)); if (!added.length) return;
    setFlash(new Set(added)); sfx.clack(); const t = setTimeout(() => setFlash(new Set()), 3400); return () => clearTimeout(t);
  }, [view.version]);

  // 파생 값
  const handSet = useMemo(() => new Set(draft.hand.map(t => t.id)), [draft.hand]);
  const selSet = useMemo(() => new Set(selected), [selected]);
  const info = useMemo(() => new Map(draft.table.map(m => { const c = check(m); return [m.id, { ok: c.ok, sum: m.tiles.reduce((s, e) => s + val(e), 0), why: c.ok ? '' : c.reason }]; })), [draft.table, pool, allow]);
  const baseSig = useMemo(() => signature({ hand: view.hand, table: view.table.map(asServer) }), [view.hand, view.table, pool, allow]);
  const changed = useMemo(() => signature(draft) !== baseSig, [draft, baseSig]);
  const handIds = useMemo(() => new Set(view.hand.map(t => t.id)), [view.hand]);
  const placed = draft.table.flatMap(m => m.tiles).filter(e => handIds.has(e.tileId));
  const placedPoints = placed.reduce((s, e) => s + val(e), 0);
  const badIds = draft.table.filter(m => !info.get(m.id)?.ok).map(m => m.id);
  const needInitial = !!self && !self.hasInitialMeld;
  const initialReady = !needInitial || placedPoints >= view.config.initialMeldMin;
  const canCommit = myTurn && changed && placed.length > 0 && badIds.length === 0 && initialReady;
  const suggestions = useMemo(() => (myTurn ? suggestedMelds(draft.hand, allow) : []), [draft.hand, allow, myTurn]);
  const remaining = Math.max(0, Math.ceil(((view.turn?.deadline ?? now) - now) / 1000));
  const pct = Math.min(100, (remaining / view.config.turnSeconds) * 100);
  const current = view.players.find(p => p.id === view.turn?.playerId);
  const n = view.players.length, mineIdx = Math.max(0, view.players.findIndex(p => p.id === me));
  const opps = Array.from({ length: Math.max(0, n - 1) }, (_, i) => view.players[(mineIdx + i + 1) % n]!);

  // 손패(칸 랙)와 테이블(자유 캔버스)은 한 화면을 나눠 쓴다.
  // 모바일은 손패가 늘어도 테이블 공간을 유지하고, 양쪽 타일을 각각 자동 축소한다.
  const wide = bsz.w >= 900 && bsz.h >= 600;
  const hf = useMemo(() => {
    const n = Math.max(draft.hand.length, view.hand.length);
    return wide ? fitHand(n, hsz.w, Math.floor(bsz.h * 0.3), 52) : fitMobileHand(n, hsz.w, bsz.h);
  }, [draft.hand.length, view.hand.length, hsz.w, bsz.h, wide]);
  // ResizeObserver measures the actual felt after the rack, header and safe areas have taken space.
  const layout = useMemo(() => layoutTable(
    draft.table.map(m => ({ id: m.id, n: m.tiles.length, pos: tpos[m.id] })),
    fsz.w, fsz.h, wide ? 54 : Math.max(26, Math.min(46, Math.floor(bsz.h * 0.12))), focus,
  ), [draft.table, tpos, focus, fsz.w, fsz.h, bsz.h, wide]);
  const mtw = layout.tw;

  // 레이아웃이 정한 자리를 저장해 두어, 다른 조합이 늘거나 줄어도 내 조합이 제자리에 있게 한다
  useEffect(() => {
    const upd: Record<string, Pos> = {}; let any = false;
    layout.rects.forEach((r, id) => {
      const p = tpos[id], fx = r.x / layout.W, fy = r.y / layout.H;
      if (!p || Math.abs(p.fx - fx) * layout.W > 1.5 || Math.abs(p.fy - fy) * layout.H > 1.5) { upd[id] = { fx, fy }; any = true; }
    });
    if (any) setTpos(p => ({ ...p, ...upd }));
  }, [layout]);

  // 손패 칸 배치: 이전 배치를 유지하고, 새 타일/돌아온 타일만 알맞은 칸에 넣는다
  const slotsV = useMemo(() => normalizeSlots(slots, draft.hand.map(t => t.id), hf.cells, home.current), [slots, draft.hand, hf.cells]);
  useEffect(() => { if (!sameSlots(slots, slotsV)) setSlots(slotsV); }, [slotsV]);
  const handMap = useMemo(() => new Map(draft.hand.map(t => [t.id, t])), [draft.hand]);
  const handBySlots = useMemo(() => slotsV.map(id => (id == null ? undefined : handMap.get(id))).filter((t): t is Tile => !!t), [slotsV, handMap]);
  const captureMotion = useTileMotion(bdRef, [slotsV, layout], r => (bdRef.current ? toLocalRect(stage(), fr, r) : r));
  const arrange = (hand: Tile[], breaks: ReadonlySet<number>): Slots | null => { const g = groupsOf(hand, breaks); return arrangeSlots(g, hf.cols, hf.cells, 1) ?? arrangeSlots(g, hf.cols, hf.cells, 0); };
  useEffect(() => { // 첫 입장: 추천 정리(묶음 사이는 빈 칸)로 시작
    if (arranged.current || !hsz.w || !draft.hand.length) return; arranged.current = true;
    const s = smartSort(draft.hand), a = arrange(s.hand, s.breaks); if (a) setSlots(a); sfx.deal(draft.hand.length);
    if (!view.tableTiles.length) { setDealing(true); setTimeout(() => setDealing(false), 1400); }
  }, [hsz.w, draft.hand.length, hf.cols, hf.cells]);

  // 끄는 동안: 이 타일들을 끼워서 "유효해지는" 조합을 초록으로 알려준다
  const fits = useMemo(() => {
    const s = new Set<string>(); if (!drag || !myTurn) return s;
    const dt = drag.ids.map(resolve).filter((t): t is Tile => !!t);
    for (const m of draft.table) {
      if (m.id === drag.meld || m.tiles.some(e => drag.ids.includes(e.tileId))) continue;
      if (needInitial && LOCK_TABLE_BEFORE_INITIAL && m.tiles.some(e => origIds.has(e.tileId))) continue;
      if (validateMeld([...tilesOf(m), ...dt], allow, m.id).ok) s.add(m.id);
    }
    return s;
  }, [drag?.ids, draft.table, myTurn, needInitial]);

  // 효과음/진동
  const validCount = [...info.values()].filter(v => v.ok).length; const prevValid = useRef(validCount);
  useEffect(() => { if (myTurn && changed && validCount > prevValid.current) sfx.chime(); prevValid.current = validCount; }, [validCount]);
  // 방금 완성된 조합은 잠깐 초록으로 반짝인다.
  const validIds = useMemo(() => new Set([...info].filter(([, v]) => v.ok).map(([id]) => id)), [info]);
  const prevIds = useRef(validIds);
  useEffect(() => {
    const fresh = myTurn && changed ? [...validIds].filter(id => !prevIds.current.has(id)) : [];
    prevIds.current = validIds;
    if (!fresh.length) return;
    setPop(new Set(fresh)); const t = setTimeout(() => setPop(new Set()), 800); return () => clearTimeout(t);
  }, [validIds]);
  useEffect(() => { if (myTurn && remaining > 0 && remaining <= 5) { sfx.tick(); if (remaining <= 3) webPlatform.haptics.tick(); } }, [remaining, myTurn]);
  const wasMine = useRef(myTurn);
  useEffect(() => { if (myTurn && !wasMine.current) { sfx.turn(); webPlatform.haptics.success(); setBanner('내 차례!'); setTimeout(() => setBanner(''), 1300); } wasMine.current = myTurn; }, [myTurn]);

  // Game edits and local organization share one chronological undo history.
  const snapshot = (): EditSnapshot => ({ draft, slots: slotsV, tpos, sortMode });
  const remember = () => { setPast(p => [...p.slice(-99), snapshot()]); setFuture([]); };
  // 편집 명령
  const apply = (r: Result, history = true) => {
    if (!r.ok) { game.setNotice(r.reason); return false; }
    captureMotion();
    if (history) remember();
    setDraft(r.draft); setSelected([]); return true;
  };
  const toFrac = (s: { x: number; y: number }): Pos => ({ fx: s.x / layout.W, fy: s.y / layout.H });
  /** 조합(n장)을 손가락(aim) 위치 가운데에 두고 싶을 때 실제로 놓일 자리: 겹치면 가장 가까운 빈자리 */
  const spotFor = (count: number, a: { x: number; y: number }, exclude: string[] = []): Spot | null => {
    const c = canvasRef.current; if (!c) return null;
    const cr = RL(c), { w, h } = meldSize(count, layout.tw), H = Math.max(layout.H, layout.height);
    const want = { x: a.x - cr.left - w / 2, y: a.y - cr.top - h / 2 };
    const others = [...layout.rects.entries()].filter(([id]) => !exclude.includes(id)).map(([, r]) => r);
    const s = findSpot(others, w, h, layout.W, H, want) ?? { x: Math.max(0, Math.min(layout.W - w, want.x)), y: Math.max(0, Math.min(H - h, want.y)) };
    return { ...s, w, h };
  };
  const place = (ids: number[], dest: Exclude<Dest, { to: 'hand' }>, aimPt?: { x: number; y: number }) => {
    if (!ids.length || !myTurn) return;
    if (needInitial && LOCK_TABLE_BEFORE_INITIAL) {
      if (ids.some(id => origIds.has(id))) { game.setNotice('첫 등록 전에는 테이블에 있던 타일을 옮길 수 없어요.'); return; }
      const t = dest.to === 'meld' ? draft.table.find(m => m.id === dest.meldId) : undefined;
      if (t?.tiles.some(e => origIds.has(e.tileId))) { game.setNotice('첫 등록 전에는 기존 조합에 끼울 수 없어요. 새 조합으로 만들어 주세요.'); return; }
    }
    const spot = dest.to === 'new' && aimPt ? spotFor(ids.length, aimPt) : null;
    const leaving = ids.filter(id => handSet.has(id)).map(id => [id, slotsV.indexOf(id)] as const);
    const r = moveTiles({ ...draft, hand: handBySlots }, ids, dest, ctx); // 손패는 "칸 순서"로 넘긴다 → 새 조합의 타일 순서 = 내가 배치한 순서
    if (!apply(r)) return;
    leaving.forEach(([id, i]) => { if (i >= 0) home.current.set(id, i); });
    sfx.clack(); webPlatform.haptics.tick();
    if (!r.ok) return;
    setLanded(new Set(ids)); setTimeout(() => setLanded(new Set()), 520);
    if (spot && r.meldId) { setTpos(p => ({ ...p, [r.meldId!]: toFrac(spot) })); setFocus(new Set([r.meldId])); }
    else if (r.meldId) setFocus(new Set([r.meldId]));
    if (r.splitId) {
      const L = layout.rects.get(r.meldId ?? '');
      if (L) { // 나뉜 오른쪽 조합은 왼쪽 조합 바로 옆에
        const cnt = new Map(r.draft.table.map(m => [m.id, m.tiles.length])), left = { ...L, ...meldSize(cnt.get(r.meldId!) ?? 1, layout.tw) }, { w, h } = meldSize(cnt.get(r.splitId) ?? 1, layout.tw);
        const others = [...layout.rects.entries()].filter(([id]) => id !== r.meldId).map(([, x]) => x);
        const sp = findSpot([...others, left], w, h, layout.W, Math.max(layout.H, layout.height), { x: left.x + left.w + MELD.gap, y: left.y });
        if (sp) setTpos(p => ({ ...p, [r.splitId!]: toFrac(sp) }));
      }
      setFocus(new Set([r.meldId ?? '', r.splitId])); setPulse(new Set([r.meldId ?? '', r.splitId])); setTimeout(() => setPulse(new Set()), 1000); setTip('끼운 자리에서 조합을 나눴어요');
    }
  };
  /** 손패 칸으로 옮기기: 손패 안에서 재배치(언제든) / 내가 이번 턴에 낸 타일 되돌리기(내 차례) */
  const placeHand = (ids: number[], slot?: number) => {
    let last = -1; slotsV.forEach((v, i) => { if (v !== null) last = i; });
    const at = slot ?? Math.min(hf.cells - 1, last + 1);
    if (ids.every(id => handSet.has(id))) {
      const next = placeInSlots(slotsV, slotsV.filter((v): v is number => v !== null && ids.includes(v)), at, hf.cols);
      if (sameSlots(next, slotsV)) { setSelected([]); return; }
      captureMotion(); remember();
      setSlots(next);
      setSortMode('custom'); setSelected([]); sfx.pick(); webPlatform.haptics.tick(); return;
    }
    if (!myTurn) return;
    const r = moveTiles({ ...draft, hand: handBySlots }, ids, { to: 'hand' }, ctx);
    if (!apply(r) || !r.ok) return;
    const base = normalizeSlots(slotsV, r.draft.hand.map(t => t.id), hf.cells, home.current);
    setSlots(placeInSlots(base, r.draft.hand.map(t => t.id).filter(id => ids.includes(id)), at, hf.cols));
    setSortMode('custom'); sfx.pick(); webPlatform.haptics.tick();
  };
  const moveMeldTo = (id: string, a: { x: number; y: number }) => {
    const m = draft.table.find(x => x.id === id); if (!m) return;
    const s = spotFor(m.tiles.length, a, [id]); if (!s) return;
    captureMotion(); remember();
    setTpos(p => ({ ...p, [id]: toFrac(s) })); setFocus(new Set([id])); sfx.clack(); webPlatform.haptics.tick();
  };
  const placeSuggestion = (sm: Meld) => {
    const ordered = asServer(sm), ids = ordered.tiles.map(e => e.tileId);
    const r = moveTiles({ ...draft, hand: handBySlots }, ids, { to: 'new' }, ctx);
    if (!r.ok) { game.setNotice(r.reason); return; }
    const leaving = ids.map(id => [id, slotsV.indexOf(id)] as const);
    const table = r.draft.table.map(m => (m.id === r.meldId ? rebuild({ ...m, tiles: ids.map(tileId => ({ tileId })) }) : m));
    if (apply({ ...r, draft: { ...r.draft, table } })) { leaving.forEach(([id, i]) => { if (i >= 0) home.current.set(id, i); }); sfx.clack(); webPlatform.haptics.tick(); }
  };
  const step = (from: EditSnapshot[], setFrom: (f: EditSnapshot[]) => void, to: EditSnapshot[], setTo: (t: EditSnapshot[]) => void) => {
    const s = from[from.length - 1]; if (!s || commitBusy || drawBusy) return;
    captureMotion();
    setFrom(from.slice(0, -1)); setTo([...to.slice(-99), snapshot()]);
    setDraft(s.draft); setSlots(s.slots); setTpos(s.tpos); setSortMode(s.sortMode);
    setSelected([]); webPlatform.haptics.tick();
  };
  const undo = () => step(past, setPast, future, setFuture);
  const redo = () => step(future, setFuture, past, setPast);
  const reset = () => { if (!changed) return; captureMotion(); remember(); setDraft({ hand: mergeHandOrder(draft.hand, view.hand), table: view.table.map(asServer) }); setSelected([]); };
  const cycleSort = () => {
    captureMotion('sort');
    const next: SortMode = sortMode === 'smart' ? 'num' : sortMode === 'num' ? 'color' : 'smart';
    const cur = handBySlots;
    const r = next === 'smart' ? smartSort(cur) : next === 'color' ? sortByColor(cur) : { hand: sortByNumber(cur), breaks: new Set<number>() };
    const a = arrange(r.hand, r.breaks); if (a && !sameSlots(a, slotsV)) { remember(); setSlots(a); }
    setSortMode(next); setNewIds(new Set());
  };
  const tidyTable = () => { if (!draft.table.length) return; captureMotion('sort'); remember(); setTpos({}); setFocus(new Set()); sfx.pick(); };
  const send = (event: string) => emit(event, { roomId: view.roomId, clientSeq: game.next() }).catch((e: Error) => game.setNotice(e.message));
  const commit = () => { if (committing.current) return; committing.current = true; setCommitBusy(true); justCommitted.current = true; return emit('turn:commit', { roomId: view.roomId, version: view.version, table: draft.table, hand: draft.hand.map(t => t.id), clientSeq: game.next() }).then(() => { webPlatform.haptics.success(); sfx.chime(); setBanner('✓ 확정!'); setTimeout(() => setBanner(''), 1100); }).catch((e: Error) => { justCommitted.current = false; game.setNotice(e.message); }).finally(() => { committing.current = false; setCommitBusy(false); }); };
  const onDraw = () => { if (drawBusy || !myTurn) return; setDrawBusy(true); webPlatform.haptics.tick(); send('turn:draw').finally(() => setTimeout(() => setDrawBusy(false), 700)); };

  // 끌기: "놓을 곳"은 손가락이 아니라 손가락 위에 뜬 타일(aim) 아래의 요소로 판정한다
  const aim = (p: { x: number; y: number }, type: string) => {
    if (type === 'mouse') return p;
    // 손가락 위쪽에 타일을 띄우되, 손패 영역에 가까워지면 오프셋을 0으로 줄여 손패에도 정확히 놓을 수 있게 한다
    const top = handRef.current ? RL(handRef.current).top : Infinity;
    const k = Math.min(1, Math.max(0, 1 - (p.y - (top - 48)) / 68));
    return { x: p.x, y: Math.max(8, p.y - 48 * k) };
  };
  const nearest = (root: Element, sel: string, x: number, y: number) => {
    let best: HTMLElement | undefined, bd = Infinity;
    root.querySelectorAll<HTMLElement>(sel).forEach(t => { const r = RL(t); const d = Math.hypot(x - (r.left + r.width / 2), (y - (r.top + r.height / 2)) * 0.6); if (d < bd) { bd = d; best = t; } });
    return best;
  };
  const probe = (x: number, y: number): Drop => {
    const cp = C(x, y), el = document.elementFromPoint(cp.x, cp.y) as HTMLElement | null; if (!el) return { kind: 'none' };
    const rackEl = el.closest<HTMLElement>('[data-rack]');
    const cr = canvasRef.current ? RL(canvasRef.current) : undefined;
    if (cr && el.closest('[data-felt]')) {
      const cx = x - cr.left, cy = y - cr.top;
      // Hit regions stay still while the visual preview opens a gap.
      const active = dragRef.current?.drop;
      const candidates = [...layout.rects].sort(([a], [b]) => Number(b === active?.meldId) - Number(a === active?.meldId));
      for (const [id, r] of candidates) {
        if (cx < r.x - 9 || cx > r.x + r.w + 9 || cy < r.y - 7 || cy > r.y + r.h + 7) continue;
        const m = draft.table.find(m => m.id === id); if (!m) continue;
        let index = meldInsertIndex(cx - r.x, m.tiles.length, layout.tw);
        if (active?.kind === 'meld' && active.meldId === id && active.tid !== undefined) {
          const previous = m.tiles.findIndex(e => e.tileId === active.tid) + (active.after ? 1 : 0);
          const boundary = r.x + MELD.padX / 2 + previous * (layout.tw + MELD.gapT) - MELD.gapT / 2;
          if (Math.abs(cx - boundary) < layout.tw * .65) index = previous;
        }
        return { kind: 'meld', meldId: id, tid: m.tiles[Math.min(index, m.tiles.length - 1)]?.tileId, after: index === m.tiles.length };
      }
    }
    if (rackEl) { const cell = nearest(rackEl, '[data-slot]', x, y); return { kind: 'rack', slot: cell ? Number(cell.dataset.slot) : undefined }; }
    if (el.closest('[data-felt]')) return { kind: 'new' };
    return { kind: 'none' };
  };
  const landingAim = (a: { x: number; y: number }, count: number, floating: Pick<Drag, 'tw' | 'ox' | 'oy'>) => ({
    x: a.x + floating.ox + (count * floating.tw + (count - 1) * 2) / 2,
    y: a.y + floating.oy + floating.tw * .7 - 4,
  });
  const probeFull = (a: { x: number; y: number }, count: number, meld: string | undefined, floating: Pick<Drag, 'tw' | 'ox' | 'oy'>): Drop => {
    const d = probe(a.x, a.y);
    return d.kind === 'new' ? { ...d, spot: spotFor(count, landingAim(a, count, floating), meld ? [meld] : []) } : d;
  };
  const dropTo = (ids: number[], d: Drop, a: { x: number; y: number }, meldMove?: string) => {
    if (meldMove) { // 조합 통째로: 빈 곳이면 자리 이동, 다른 조합이면 합치기, 손패면 되돌리기
      if (d.kind === 'new') { moveMeldTo(meldMove, a); return; }
      if (d.kind === 'none' || (d.kind === 'meld' && d.meldId === meldMove)) return;
    }
    if (d.kind === 'rack') return placeHand(ids, d.slot);
    if (!myTurn) return;
    if (d.kind === 'new') return place(ids, { to: 'new' }, a);
    if (d.kind !== 'meld') return;
    const m = draft.table.find(x => x.id === d.meldId); if (!m) return;
    const target = d.tid !== undefined ? resolve(d.tid) : undefined;
    const one = ids.length === 1 ? resolve(ids[0]!) : undefined;
    if (target && !isNum(target) && one && isNum(one) && !needInitial && jokerReplacement(m, target.id, one.id, ctx)) {
      if (apply(swapJoker({ ...draft, hand: handBySlots }, m.id, target.id, one.id, ctx))) { game.setNotice('조커를 꺼냈어요. 확정 전에 다른 조합에 꼭 써야 해요.'); sfx.clack(); }
      return;
    }
    const idx = d.tid !== undefined ? m.tiles.findIndex(x => x.tileId === d.tid) + (d.after ? 1 : 0) : undefined;
    place(ids, { to: 'meld', meldId: m.id, index: idx });
  };
  const toggle = (id: number) => { sfx.pick(); setSelected(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id])); };

  // 길게 누르기: 눌린 타일과 "이어진" 타일(조합 안 이웃 / 손패에서 빈 칸 없이 이어지는 이웃)이 한 장씩 늘어난다
  const lineOf = (id: number): number[] => {
    const m = draft.table.find(x => x.tiles.some(e => e.tileId === id));
    return m ? m.tiles.map(e => e.tileId) : slotLine(slotsV, hf.cols, i => handMap.get(i), id);
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
    suppressClick.current = true;
    setPress(null); setSelected([g.id]); sfx.pick(); webPlatform.haptics.tick();
    if (g.line.length > 1) g.grow = setInterval(() => growStep(g), GROW_MS);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button > 0 || gest.current || !e.isPrimary || commitBusy || drawBusy || coach) return;
    suppressClick.current = false;
    const target = e.target as HTMLElement, lp = L(e.clientX, e.clientY);
    const grip = target.closest<HTMLElement>('[data-mh]');
    if (grip) { // 조합 손잡이: 조합 전체를 끈다(위치만 바꾸는 건 첫 등록 전이나 상대 차례에도 가능)
      const m = draft.table.find(x => x.id === grip.dataset.mh); if (!m) return;
      stopTimers(gest.current);
      suppressClick.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      const first = grip.parentElement?.querySelector<HTMLElement>('.tile');
      const fr0 = first ? RL(first) : undefined;
      gest.current = { id: -1, meld: m.id, ids: m.tiles.map(x => x.tileId), sx: lp.x, sy: lp.y, pid: e.pointerId, tw: layout.tw, grabX: fr0 ? lp.x - fr0.left : 0, grabY: fr0 ? lp.y - fr0.top : 0, started: false, long: false, line: [], lo: 0, hi: 0, dir: 1 };
      return;
    }
    const t = target.closest<HTMLElement>('[data-t]'); if (!t) return;
    if (!myTurn && !t.closest('[data-rack]')) return; // 상대 차례에도 손패는 미리 정리할 수 있다
    if (myTurn && needInitial && LOCK_TABLE_BEFORE_INITIAL && origIds.has(Number(t.dataset.t))) { game.setNotice('첫 등록 전에는 테이블 타일을 옮길 수 없어요.'); return; }
    stopTimers(gest.current);
    suppressClick.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = RL(t);
    const g: Gest = { id: Number(t.dataset.t), sx: lp.x, sy: lp.y, pid: e.pointerId, tw: r.width, grabX: lp.x - r.left, grabY: lp.y - r.top, started: false, long: false, line: [], lo: 0, hi: 0, dir: lp.x >= r.left + r.width / 2 ? 1 : -1 };
    g.timer = setTimeout(() => beginLong(g), LONG_MS);
    gest.current = g; setPress(g.id);
  };
  const movePointer = (e: PointerEvent) => {
    const g = gest.current; if (!g || g.pid !== e.pointerId) return;
    const p = L(e.clientX, e.clientY);
    if (!g.started) {
      if (Math.hypot(p.x - g.sx, p.y - g.sy) < (g.long ? 16 : e.pointerType === 'mouse' ? 5 : 9)) return;
      stopTimers(g); g.started = true; setPress(null); sfx.pick(); webPlatform.haptics.tick();
      const chosen = new Set(g.meld ? g.ids! : g.long ? g.line.slice(g.lo, g.hi + 1) : selSet.has(g.id) ? selected : [g.id]);
      // The floating stack must use exactly the same visual order as moveTiles.
      const ids = [...handBySlots.map(t => t.id), ...draft.table.flatMap(m => m.tiles.map(e => e.tileId))].filter(id => chosen.has(id));
      g.ids = ids; if (g.long) setSelected(ids);
      suppressClick.current = true;
      const a = aim(p, e.pointerType);
      const index = g.meld ? 0 : Math.max(0, ids.indexOf(g.id));
      const floating = { tw: g.tw, ox: -index * (g.tw + 2) - g.grabX, oy: -g.grabY };
      const next = { ids, ...floating, ...a, meld: g.meld, drop: probeFull(a, ids.length, g.meld, floating) };
      dragRef.current = next; setDrag(next); return;
    }
    const a = aim(p, e.pointerType);
    const cnt = g.ids?.length ?? 1;
    const previous = dragRef.current; if (!previous) return;
    const drop = probeFull(a, cnt, g.meld, previous);
    dragRef.current = { ...previous, ...a, drop };
    if (ghostRef.current) ghostRef.current.style.transform = `translate3d(${a.x + previous.ox}px, ${a.y + previous.oy}px, 0)`;
    if (ghostRef.current) { // 움직이는 방향으로 살짝 기울어져 무게감이 느껴진다
      const tilt = Math.max(-9, Math.min(9, (a.x - previous.x) * .7));
      ghostRef.current.style.setProperty('--tilt', `${tilt}deg`);
      clearTimeout(tiltT.current); tiltT.current = setTimeout(() => ghostRef.current?.style.setProperty('--tilt', '0deg'), 90);
    }
    if (spotRef.current && drop.kind === 'new' && drop.spot) spotRef.current.style.transform = `translate3d(${drop.spot.x}px, ${drop.spot.y}px, 0)`;
    // React only needs to update when the destination changes, not for every pixel.
    if (!sameDrop(previous.drop, drop)) { if (previous.drop.kind !== drop.kind || previous.drop.meldId !== drop.meldId) webPlatform.haptics.tick(); setDrag(dragRef.current); }
  };
  A.current.move = (e: PointerEvent) => {
    if (!gest.current || gest.current.pid !== e.pointerId) return;
    pendingPointer.current = e;
    if (dragFrame.current !== null) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null;
      const latest = pendingPointer.current; pendingPointer.current = null;
      if (latest) movePointer(latest);
    });
  };
  A.current.up = (e: PointerEvent) => {
    const g = gest.current; if (!g || g.pid !== e.pointerId) return;
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null; pendingPointer.current = null;
    if (g.started && e.type !== 'pointercancel') movePointer(e);
    stopTimers(g); gest.current = null; setPress(null);
    if (bdRef.current?.hasPointerCapture(e.pointerId)) bdRef.current.releasePointerCapture(e.pointerId);
    if (!g.started) { if (!g.meld && e.type !== 'pointercancel' && !g.long) toggle(g.id); return; } // 길게 눌렀다 떼면 선택이 그대로 남는다
    captureMotion(); // Also animate rejected drops and pointer cancellation back home.
    const d = dragRef.current; dragRef.current = null; setDrag(null);
    if (d && e.type !== 'pointercancel') { const a = aim(L(e.clientX, e.clientY), e.pointerType); dropTo(d.ids, d.drop, landingAim(a, d.ids.length, d), g.meld); }
  };
  A.current.cancel = () => {
    const g = gest.current;
    if (g?.started) captureMotion();
    stopTimers(g); gest.current = null; dragRef.current = null; pendingPointer.current = null;
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    if (g && bdRef.current?.hasPointerCapture(g.pid)) bdRef.current.releasePointerCapture(g.pid);
    setDrag(null); setPress(null);
  };
  useEffect(() => {
    const mv = (e: PointerEvent) => A.current.move(e), up = (e: PointerEvent) => A.current.up(e);
    const cancel = () => A.current.cancel();
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    const onVisibility = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', onVisibility);
    const portrait = matchMedia('(orientation: portrait)');
    portrait.addEventListener('change', cancel);
    window.addEventListener('blur', cancel);
    return () => { cancel(); document.removeEventListener('visibilitychange', onVisibility); portrait.removeEventListener('change', cancel); window.removeEventListener('blur', cancel); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, []);
  useEffect(() => { if (coach) A.current.cancel(); }, [coach]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gest.current) { e.preventDefault(); A.current.cancel(); return; }
      if (commitBusy || drawBusy || coach || document.activeElement?.matches('input,textarea,[contenteditable=true]')) return;
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      if (e.key === 'Enter' && canCommit && document.activeElement === document.body) { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') setSelected([]);
      else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const hint = !myTurn ? (view.message || '손패는 미리 정리해 둘 수 있어요')
    : tip ? tip
    : selected.length ? `${selected.length}장 선택 · 끌어서 옮기세요`
    : changed ? (canCommit ? '좋아요! ✓ 확정을 누르세요' : placed.length === 0 ? '손패 타일을 1장 이상 내야 해요' : !initialReady ? `첫 등록 ${placedPoints}/${view.config.initialMeldMin}점` : badIds.length ? (info.get(badIds[0]!)?.why ?? '고쳐야 할 조합이 있어요') : '확인이 필요해요')
    : needInitial ? `첫 등록 ${view.config.initialMeldMin}점 이상 · 타일을 끌어 놓으세요` : '끌어서 놓기 · 길게 누르면 이어진 타일이 늘어나요';
  const urgent = myTurn && remaining <= 10;
  const insOf = (id: number) => (drag && drag.drop.tid === id && drag.drop.kind === 'meld' ? (drag.drop.after ? 'a' : 'b') : null);
  const sortLabel = { smart: '조합순', num: '숫자순', color: '색상순', custom: '내 배열' }[sortMode];
  const tv = (t: Tile, extra: Partial<React.ComponentProps<typeof TileView>> = {}) => <TileView key={t.id} tile={t} selected={selSet.has(t.id)} ghosted={!!drag?.ids.includes(t.id)} pressing={press === t.id} landed={landed.has(t.id)} ins={insOf(t.id)} {...extra} />;
  const rackPreview = useMemo(() => {
    if (drag?.drop.kind !== 'rack' || drag.drop.slot === undefined) return null;
    if (drag.ids.some(id => origIds.has(id))) return null;
    return placeInSlots(slotsV, drag.ids, drag.drop.slot, hf.cols);
  }, [drag?.drop.kind, drag?.drop.slot, drag?.ids, slotsV, hf.cols, origIds]);
  const tgt = new Set(rackPreview?.flatMap((id, i) => id !== null && drag?.ids.includes(id) ? [i] : []) ?? []);
  const rackDestinations = new Map(rackPreview?.flatMap((id, i) => id === null ? [] : [[id, i] as const]) ?? []);
  const selectedLine = selected.length === 1 ? lineOf(selected[0]!) : [];
  const feedback = useMemo(() => {
    const neutral = { tone: 'neutral', text: '테이블이나 손패에 놓으세요' };
    if (!drag) return neutral;
    const d = drag.drop;
    const blocked = (text: string) => ({ tone: 'blocked', text });
    if (d.kind === 'none') return neutral;
    if (drag.meld && (d.kind === 'new' || d.meldId === drag.meld)) return { tone: 'neutral', text: '조합 자리 옮기기' };
    if (d.kind === 'rack') return drag.ids.some(id => origIds.has(id)) ? blocked('기존 테이블 타일은 손패로 가져올 수 없어요') : { tone: 'valid', text: '손패에 놓기' };
    if (!myTurn) return blocked('내 차례에 테이블에 놓을 수 있어요');
    const m = d.kind === 'meld' ? draft.table.find(m => m.id === d.meldId) : undefined;
    if (needInitial && (drag.ids.some(id => origIds.has(id)) || m?.tiles.some(e => origIds.has(e.tileId)))) return blocked('첫 등록 전에는 새 조합으로 놓으세요');
    const e = m?.tiles.find(e => e.tileId === d.tid), tile = e && resolve(e.tileId), one = drag.ids.length === 1 ? resolve(drag.ids[0]!) : undefined;
    if (!needInitial && tile?.kind === 'joker' && one && isNum(one) && m && jokerReplacement(m, tile.id, one.id, ctx)) return { tone: 'valid', text: '조커 교체 · 꺼낸 조커는 다시 사용하세요' };
    const index = m && d.tid !== undefined ? m.tiles.findIndex(e => e.tileId === d.tid) + (d.after ? 1 : 0) : undefined;
    let previewId = 0;
    const result = moveTiles({ ...draft, hand: handBySlots }, drag.ids, m ? { to: 'meld', meldId: m.id, index } : { to: 'new' }, { ...ctx, newId: () => `preview-${++previewId}` });
    if (!result.ok) return blocked(result.reason);
    const affected = result.draft.table.filter(m => !draft.table.includes(m));
    if (affected.every(m => check(m).ok)) return { tone: 'valid', text: result.splitId ? '✓ 나눠서 조합 완성' : d.kind === 'new' ? '✓ 새 조합 완성' : '✓ 이 위치에 이어 놓기' };
    return { tone: 'repair', text: result.splitId ? '조합 나누기 · 남은 타일 정리가 필요해요' : '이 위치에 놓기 · 조합을 더 완성해 주세요' };
  }, [drag?.drop, drag?.ids, drag?.meld, draft, handBySlots, needInitial, myTurn, origIds, pool, allow]);
  const sp = drag?.drop.kind === 'new' ? drag.drop.spot : null;

  return (
    <main ref={bdRef} data-turn={myTurn ? 'mine' : 'theirs'}
      className={`bd ${myTurn ? 'mine' : 'theirs'} ${drag ? 'dragging' : ''} ${urgent ? 'urgent' : ''} ${fr.rot ? `rot ${fr.dir === 1 ? 'rot1' : 'rotn'}` : ''} ${dealing ? 'dealing' : ''}`}
      style={{ ['--mtw' as string]: `${mtw}px`, ['--rtw' as string]: `${hf.tw}px`, ['--rth' as string]: `${Math.round(hf.tw * 1.4)}px`, ['--actw' as string]: wide ? '140px' : '96px',
        ...(fr.rot ? { width: fr.vh, height: fr.vw, transform: fr.dir === 1 ? `translateX(${fr.vw}px) rotate(90deg)` : `translateY(${fr.vh}px) rotate(-90deg)` } : null) }}
      onContextMenu={e => e.preventDefault()} onPointerDown={onDown} onLostPointerCapture={() => { if (gest.current) A.current.cancel(); }} onClickCapture={e => { if (suppressClick.current) { e.stopPropagation(); suppressClick.current = false; } }}>
      <div className="edge" aria-hidden="true" />
      <div className="tline" aria-hidden="true"><i style={{ transform: `scaleX(${(view.turn ? pct : 0) / 100})` }} /></div>
      {banner && <div className="banner" aria-hidden="true">{banner}</div>}
      <header className="bd-top">
        <div className="chips">{opps.map(p => <OppChip key={p.id} p={p} active={view.turn?.playerId === p.id} remaining={remaining} pct={pct} />)}</div>
        <div className={`tp ${myTurn ? 'mine' : 'theirs'} ${urgent ? 'danger' : ''}`} role="status" aria-live="polite">
          <span className="tp-main">
            <b>{myTurn ? '내 차례' : `${current?.name ?? '상대'} 차례`}</b>
            <i className="tp-time" aria-label={`${remaining}초 남음`}>{fmt(remaining)}</i>
          </span>
          <span className={`tp-hint ${drag ? feedback.tone : canCommit ? 'good' : ''}`}>{drag ? feedback.text : hint}</span>
        </div>
        {!game.online && <span className="offline">연결 끊김</span>}
        <button className="menu-btn" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label="메뉴"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
      </header>
      {menu && <>
        <div className="scrim" onClick={() => setMenu(false)} />
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => sfx.toggle()}>{muted ? '소리 켜기' : '소리 끄기'}</button>
          <button role="menuitem" onClick={() => { setCoach(true); setMenu(false); }}>조작 방법</button>
          {fr.rot && <button role="menuitem" onClick={flip}>화면 방향 뒤집기</button>}
          {!!document.documentElement.requestFullscreen && <button role="menuitem" onClick={() => { setMenu(false); if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape')).catch(() => {}); }}>전체 화면</button>}
          <button role="menuitem" className="exit" onClick={() => { setMenu(false); onExit(); }}>나가기</button>
        </div>
      </>}

      <div className="bd-fw">
        <section ref={feltRef} className={`bd-felt ${drag?.drop.kind === 'new' ? 'over' : ''}`} data-felt aria-label="테이블">
          <div ref={canvasRef} className="bd-melds" style={{ height: '100%' }}>
            {draft.table.map(m => {
              const i = info.get(m.id), r = layout.rects.get(m.id); if (!r) return null;
              const hovering = drag?.drop.kind === 'meld' && drag.drop.meldId === m.id && drag.meld !== m.id;
              const insert = hovering && drag.drop.tid !== undefined ? m.tiles.findIndex(e => e.tileId === drag.drop.tid) + (drag.drop.after ? 1 : 0) : -1;
              let leftSpace = r.x, rightSpace = layout.W - r.x - r.w;
              for (const [id, other] of layout.rects) {
                if (id === m.id || other.y >= r.y + r.h || other.y + other.h <= r.y) continue;
                if (other.x + other.w <= r.x) leftSpace = Math.min(leftSpace, r.x - other.x - other.w);
                if (other.x >= r.x + r.w) rightSpace = Math.min(rightSpace, other.x - r.x - r.w);
              }
              const gap = insert >= 0 ? Math.max(0, Math.min(36, mtw * .8, leftSpace + rightSpace - 2)) : 0;
              const shift = -Math.min(leftSpace, Math.max(gap / 2, gap - rightSpace));
              return (
                <div key={m.id} data-m={m.id} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                  className={`bm ${i?.ok ? 'ok' : 'bad'} ${drag?.drop.kind === 'meld' && drag.drop.meldId === m.id ? `over ${feedback.tone}` : ''} ${pulse.has(m.id) ? 'pulse' : ''} ${pop.has(m.id) ? 'pop' : ''} ${fits.has(m.id) ? 'fit' : ''} ${drag?.meld === m.id ? 'lifted' : ''}`}
                  onClick={e => { if ((e.target as HTMLElement).closest('[data-t],[data-mh]')) return; if (i && !i.ok) setTip(i.why); }}>
                  <button type="button" tabIndex={-1} className="bm-grip" data-mh={m.id} aria-label="조합 옮기기"><span className="dots" aria-hidden="true">⠿</span></button>
                  <div className="bm-row">{m.tiles.map((e, index) => { const t = resolve(e.tileId); return t ? <span className="bm-tile" key={e.tileId} style={{ transform: `translateX(${insert >= 0 ? shift + (index >= insert ? gap : 0) : 0}px)` }}>{tv(t, { repC: !isNum(t) ? e.represents?.color : undefined, repV: !isNum(t) ? e.represents?.value : undefined, fresh: !origIds.has(t.id), flash: flash.has(t.id) })}</span> : null; })}
                    {insert >= 0 && <span className="bm-insert" aria-hidden="true" style={{ left: insert * (mtw + MELD.gapT) + shift - MELD.gapT / 2, width: gap }}>+</span>}
                  </div>
                  {!i?.ok && <span className="bm-error" title={i?.why} aria-label={i?.why ?? '조합 확인 필요'}>!</span>}
                </div>);
            })}
            {sp && <div ref={spotRef} className="spot" style={{ left: 0, top: 0, transform: `translate3d(${sp.x}px, ${sp.y}px, 0)`, width: sp.w, height: sp.h }} aria-hidden="true" />}
          </div>
          {draft.table.length === 0 && <div className="bd-empty"><b>{myTurn ? '첫 조합을 놓아 보세요' : '테이블이 비어 있어요'}</b><span>{myTurn ? `같은 색 연속 숫자 · 같은 숫자 다른 색${needInitial ? ` · 합계 ${view.config.initialMeldMin}점 이상` : ''}` : '내 차례가 오기 전에 손패를 정리해 보세요'}</span></div>}
        </section>
        {selected.length > 0 && <div className="bd-sel" role="toolbar" aria-label="선택한 타일">
          <b>{selected.length}장</b>
          {selectedLine.length > 1 && selectedLine.length !== selected.length && <button onClick={() => setSelected(selectedLine)}>묶음 선택</button>}
          {myTurn && <button onClick={() => place(selected, { to: 'new' })}>새 조합</button>}
          {myTurn && <button disabled={selected.every(id => handSet.has(id)) || selected.some(id => origIds.has(id))} onClick={() => placeHand(selected)}>손패로</button>}
          <button onClick={() => setSelected([])} aria-label="선택 해제">해제</button>
        </div>}

      </div>

      <section className={`bd-rack ${drag?.drop.kind === 'rack' ? 'over' : ''}`} data-rack aria-label="내 손패">
        <div ref={handRef} className="bd-hand" style={{ height: hf.h, gridTemplateColumns: `repeat(${hf.cols}, var(--rtw))` }}>
          {slotsV.map((id, i) => { const t = id == null ? undefined : handMap.get(id); return <div key={i} data-slot={i} className={`cell ${t ? '' : 'vacant'} ${tgt.has(i) ? 'tgt' : ''}`}>{t && <span className="rack-tile" style={{ ['--k' as string]: i, transform: rackDestinations.has(t.id) && !drag?.ids.includes(t.id) ? `translate(${(rackDestinations.get(t.id)! % hf.cols - i % hf.cols) * (hf.tw + HAND.gapX)}px, ${(Math.floor(rackDestinations.get(t.id)! / hf.cols) - Math.floor(i / hf.cols)) * (Math.round(hf.tw * 1.4) + HAND.rowExtra)}px)` : undefined }}>{tv(t, { isNew: newIds.has(t.id) })}</span>}</div>; })}
        </div>
      </section>

      <aside className="bd-act">
        <fieldset className="bd-controls" disabled={commitBusy || drawBusy} aria-label="게임 조작">
        <div className="bd-info">
          <span className="hc"><b>{draft.hand.length}</b>장{newIds.size > 0 && <em className="newbadge">NEW {newIds.size}</em>}</span>
          {needInitial && <span className={`meter ${initialReady ? 'done' : ''}`}><i style={{ width: `${Math.min(100, (placedPoints / view.config.initialMeldMin) * 100)}%` }} />첫 등록 {placedPoints}/{view.config.initialMeldMin}</span>}
        </div>
        <div className="bd-tools">
          <button className="bd-sort" onClick={cycleSort} aria-label={`손패 정렬: 지금 ${sortLabel}`}>{sortLabel}</button>
          <button className="bd-tidy" onClick={tidyTable} aria-label="테이블 조합 자동 정돈" title="테이블 정돈">정돈</button>
          {myTurn && suggestions[0] && <button className="bd-sug" onClick={() => placeSuggestion(suggestions[0]!)} aria-label="추천 조합 내기">추천 {suggestions.length}</button>}
        </div>
        <div className="urow">
          <button disabled={!past.length || commitBusy || drawBusy} onClick={undo} aria-label="되돌리기">↶</button>
          <button disabled={!future.length || commitBusy || drawBusy} onClick={redo} aria-label="다시 실행">↷</button>
          <button disabled={!myTurn || !changed || commitBusy} onClick={reset} aria-label="처음 상태로">⟲</button>
        </div>
        {!myTurn
          ? <button className="primary go wait" disabled>대기 중<small>손패 정리 가능</small></button>
          : changed
          ? <button className={`primary go ${canCommit ? 'ready' : ''}`} disabled={!canCommit || !game.online || commitBusy} onClick={commit}>{commitBusy ? '확정 중…' : canCommit ? '✓ 확정' : placed.length && !initialReady ? `${placedPoints}/${view.config.initialMeldMin}점` : '확인 필요'}</button>
          : <button className="primary go" disabled={!game.online || drawBusy} onClick={onDraw}>{drawBusy ? '뽑는 중…' : '뽑기'}<small>남은 {view.poolCount}</small></button>}
        </fieldset>
      </aside>

      {drag && (
        <div ref={ghostRef} className="ghost" aria-hidden="true" style={{ transform: `translate3d(${drag.x + drag.ox}px, ${drag.y + drag.oy}px, 0)`, ['--tw' as string]: `${drag.tw}px`, ['--th' as string]: `${drag.tw * 1.4}px` }}>
          <div className="gstack">{drag.ids.map(id => { const t = resolve(id), entry = draft.table.flatMap(m => m.tiles).find(e => e.tileId === id); return t ? <TileView key={id} tile={t} passive repC={entry?.represents?.color} repV={entry?.represents?.value} /> : null; })}</div>
          {drag.ids.length > 1 && <em>{drag.ids.length}</em>}
          <span className={`drop-hint ${feedback.tone}`}>{feedback.text}</span>
        </div>)}
      {coach && (
        <div className="coach" role="dialog" aria-label="조작 방법">
          <div className="coach-card">
            <h2>이렇게 움직여요</h2>
            <ul>
              <li><b>끌어서 놓기</b><span>조합 위에 놓으면 끼워지고, 빈 곳에 놓으면 그 자리에 새 조합이 생겨요. 타일 사이가 벌어지는 위치에 놓으세요. 초록으로 빛나는 조합에는 끼울 수 있어요.</span></li>
              <li><b>길게 누르기</b><span>계속 누르면 이어진 타일이 하나씩 늘어나요. 그대로 끌면 한꺼번에 옮겨요. 한 장을 선택한 뒤 ‘묶음 선택’으로 바로 고를 수도 있어요.</span></li>
              <li><b>순서대로</b><span>같은 색 숫자 조합은 왼쪽에서 오른쪽으로 작은 수부터 놓아야 ✓가 돼요. 중간에 끼워 규칙이 깨지면 그 자리에서 나눠 줘요.</span></li>
              <li><b>조커 옮기기</b><span>조커를 빼도 원래 조합이 3장 이상으로 유효하면, 조커를 직접 다른 조합으로 끌어 옮길 수 있어요. 손패나 테이블의 타일로 남은 조합이 유효해지면 교체할 수 있어요.</span></li>
              <li><b>자유 배치</b><span>손패는 빈 칸 아무 데나 놓아 묶음을 만들고, 테이블 조합은 한 장을 고르고 ‘묶음 선택’을 누른 뒤 끌어 옮겨요. 위쪽 ⠿ 손잡이로도 옮길 수 있어요.</span></li>
              <li><b>확정</b><span>모든 조합이 완성되면 오른쪽 확정! 낼 게 없으면 뽑기.</span></li>
            </ul>
            <button className="primary" onClick={() => { setCoach(false); try { localStorage.setItem('rk-coach2', '1'); } catch { /* 무시 */ } }}>알겠어요</button>
          </div>
        </div>)}
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}
