import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Meld, Tile } from '@rummikub/rules';
import { validateMeld } from '@rummikub/rules';
import type { PublicView } from '@rummikub/protocol';
import { webPlatform } from '@rummikub/platform';
import { emit } from './socket.js';
import { sfx } from './sound.js';
import { Ring, SortMode, SoundToggle, TileView, isNum, smartSort, sortByColor, sortByNumber, suggestedMelds } from './tiles.js';
import { Ctx, Dest, Draft, Result, mergeHandOrder, moveTiles, signature, swapJoker } from './editor.js';
import { MELD, Pos, Slots, TableItem, arrangeSlots, findSpot, fitHand, fitMobileHand, layoutTable, meldSize, normalizeSlots, placeInSlots, slotLine } from './layout.js';
import { ORDER_HINT, checkMeld } from './meldRules.js';
import { useTileMotion } from './motion.js';

export type GameApi = { online: boolean; notice: string; setNotice: (s: string) => void; next: () => number };
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
 * 보드 v6 — 가로 화면 전용, 자유 배치.
 *  · 손패: 칸(slot) 랙. 타일을 빈 칸 아무 데나 놓을 수 있고, 빈 칸이 곧 내가 만든 묶음 구분선이다.
 *  · 테이블: 조합마다 위치가 있다. 위쪽 손잡이(⠿)를 끌어 원하는 곳으로 옮기고, 빈 곳에 놓으면 그 자리에 새 조합이 생긴다.
 *  · 규칙: 같은 색 연속 숫자(런)는 왼쪽 → 오른쪽으로 작은 수부터 "놓인 순서대로" 유효하다(6·5·7 은 ⚠).
 *  · 길게 누르면 이어진 타일이 한 장씩 늘어나 선택되고, 그대로 끌어 한꺼번에 옮긴다.
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
  const [pulse, setPulse] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState('');
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
  const asServer = (m: Meld): Meld => {
    const r = validateMeld(tilesOf(m), allow, m.id);
    if (!r.ok || r.meld.type !== 'run') return m;
    const v = (e: Meld['tiles'][number]) => { const t = resolve(e.tileId); return t && isNum(t) ? t.value : r.meld.tiles.find(x => x.tileId === e.tileId)?.represents?.value ?? e.represents?.value ?? 0; };
    const c = check({ ...m, tiles: [...m.tiles].sort((a, b) => v(a) - v(b)) });
    return c.ok ? c.meld : m;
  };
  const origIds = useMemo(() => new Set(view.table.flatMap(m => m.tiles.map(e => e.tileId))), [view.table]);
  const ctx: Ctx = { tile: resolve, orig: origIds, fix: rebuild, newId: () => `draft-${crypto.randomUUID()}`, ok: m => check(m).ok };

  // 가로 화면 고정 시도(지원하는 브라우저/전체화면에서만 동작). 안 되면 CSS가 "가로로 돌려 주세요"를 띄운다.
  useEffect(() => { try { void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}); } catch { /* 미지원 */ } }, []);
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

  // 손패(칸 랙)와 테이블(자유 캔버스)은 한 화면을 나눠 쓴다.
  // 모바일은 손패가 늘어도 테이블 공간을 유지하고, 양쪽 타일을 각각 자동 축소한다.
  const wide = bsz.w >= 900 && bsz.h >= 600;
  const { hf, layout } = useMemo(() => {
    const N = Math.max(draft.hand.length, view.hand.length);
    const items: TableItem[] = draft.table.map(m => ({ id: m.id, n: m.tiles.length, pos: tpos[m.id] }));
    if (!wide) {
      const hf = fitMobileHand(N, hsz.w, bsz.h);
      const feltH = Math.max(0, bsz.h - 104 - hf.h);
      const maxT = Math.max(MELD.min, Math.min(38, Math.floor(bsz.h * 0.085)));
      return { hf, layout: layoutTable(items, fsz.w, feltH, maxT, focus) };
    }
    const maxH = 64, maxT = 60;
    const handRatios = N >= 36 ? [0.48, 0.44, 0.40, 0.36]
      : N >= 24 ? [0.44, 0.40, 0.36, 0.32]
        : [0.38, 0.34, 0.30, 0.26];
    let best: { hf: ReturnType<typeof fitHand>; layout: ReturnType<typeof layoutTable>; score: number } | null = null;
    for (const f of handRatios) {
      const h = fitHand(N, hsz.w, Math.floor(bsz.h * f), maxH);
      const feltH = bsz.h - 44 - 12 - (h.h + 12) - 20 - 8; // 위줄 + 간격 + 손패 받침 + 테이블 안쪽 여백 + 여유
      const L = layoutTable(items, fsz.w, Math.max(0, feltH), maxT, focus);
      // 테이블 타일이 손패보다 최대 14px 작아지는 것은 허용해, 타일이 많은 손패를 읽기 쉽게 유지한다.
      const score = Math.min(h.tw, L.tw + 14);
      if (!best || score > best.score) best = { hf: h, layout: L, score };
    }
    return best!;
  }, [draft.hand.length, view.hand.length, draft.table, tpos, focus, hsz.w, bsz.h, fsz.w, wide]);
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
  const captureMotion = useTileMotion(bdRef, [slotsV, layout]);
  const arrange = (hand: Tile[], breaks: ReadonlySet<number>): Slots | null => { const g = groupsOf(hand, breaks); return arrangeSlots(g, hf.cols, hf.cells, 1) ?? arrangeSlots(g, hf.cols, hf.cells, 0); };
  useEffect(() => { // 첫 입장: 추천 정리(묶음 사이는 빈 칸)로 시작
    if (arranged.current || !hsz.w || !draft.hand.length) return; arranged.current = true;
    const s = smartSort(draft.hand), a = arrange(s.hand, s.breaks); if (a) setSlots(a); sfx.deal(draft.hand.length);
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
  useEffect(() => { if (myTurn && remaining > 0 && remaining <= 5) { sfx.tick(); if (remaining <= 3) webPlatform.haptics.tick(); } }, [remaining, myTurn]);
  const wasMine = useRef(myTurn);
  useEffect(() => { if (myTurn && !wasMine.current) { sfx.turn(); webPlatform.haptics.success(); setBanner('내 차례!'); setTimeout(() => setBanner(''), 1300); } wasMine.current = myTurn; }, [myTurn]);

  // 편집 명령
  const apply = (r: Result, history = true) => {
    if (!r.ok) { game.setNotice(r.reason); return false; }
    captureMotion();
    if (history) { setPast(p => [...p.slice(-99), draft]); setFuture([]); }
    setDraft(r.draft); setSelected([]); return true;
  };
  const toFrac = (s: { x: number; y: number }): Pos => ({ fx: s.x / layout.W, fy: s.y / layout.H });
  /** 조합(n장)을 손가락(aim) 위치 가운데에 두고 싶을 때 실제로 놓일 자리: 겹치면 가장 가까운 빈자리 */
  const spotFor = (count: number, a: { x: number; y: number }, exclude: string[] = []): Spot | null => {
    const c = canvasRef.current; if (!c) return null;
    const cr = c.getBoundingClientRect(), { w, h } = meldSize(count, layout.tw), H = Math.max(layout.H, layout.height);
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
      captureMotion();
      setSlots(placeInSlots(slotsV, slotsV.filter((v): v is number => v !== null && ids.includes(v)), at, hf.cols));
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
    captureMotion();
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
  const step = (from: Draft[], setFrom: (f: Draft[]) => void, to: Draft[], setTo: (t: Draft[]) => void) => {
    const s = from[from.length - 1]; if (!s) return;
    captureMotion();
    setFrom(from.slice(0, -1)); setTo([...to.slice(-99), draft]);
    setDraft({ hand: mergeHandOrder(draft.hand, s.hand), table: s.table }); setSelected([]); webPlatform.haptics.tick();
  };
  const undo = () => step(past, setPast, future, setFuture);
  const redo = () => step(future, setFuture, past, setPast);
  const reset = () => { if (!changed) return; captureMotion(); setPast(p => [...p.slice(-99), draft]); setFuture([]); setDraft({ hand: mergeHandOrder(draft.hand, view.hand), table: view.table.map(asServer) }); setSelected([]); };
  const cycleSort = () => {
    captureMotion('sort');
    const next: SortMode = sortMode === 'smart' ? 'num' : sortMode === 'num' ? 'color' : 'smart';
    const cur = handBySlots;
    const r = next === 'smart' ? smartSort(cur) : next === 'color' ? sortByColor(cur) : { hand: sortByNumber(cur), breaks: new Set<number>() };
    const a = arrange(r.hand, r.breaks); if (a) setSlots(a);
    setSortMode(next); setNewIds(new Set());
  };
  const tidyTable = () => { captureMotion('sort'); setTpos({}); setFocus(new Set()); sfx.pick(); };
  const send = (event: string) => emit(event, { roomId: view.roomId, clientSeq: game.next() }).catch((e: Error) => game.setNotice(e.message));
  const commit = () => { if (committing.current) return; committing.current = true; justCommitted.current = true; return emit('turn:commit', { roomId: view.roomId, version: view.version, table: draft.table, hand: draft.hand.map(t => t.id), clientSeq: game.next() }).then(() => { webPlatform.haptics.success(); sfx.chime(); setBanner('✓ 확정!'); setTimeout(() => setBanner(''), 1100); }).catch((e: Error) => { justCommitted.current = false; game.setNotice(e.message); }).finally(() => { committing.current = false; }); };
  const onDraw = () => { if (drawBusy || !myTurn) return; setDrawBusy(true); webPlatform.haptics.tick(); send('turn:draw').finally(() => setTimeout(() => setDrawBusy(false), 700)); };

  // 끌기: "놓을 곳"은 손가락이 아니라 손가락 위에 뜬 타일(aim) 아래의 요소로 판정한다
  const aim = (e: { clientX: number; clientY: number; pointerType: string }) => {
    if (e.pointerType === 'mouse') return { x: e.clientX, y: e.clientY };
    // 손가락 위쪽에 타일을 띄우되, 손패 영역에 가까워지면 오프셋을 0으로 줄여 손패에도 정확히 놓을 수 있게 한다
    const top = handRef.current?.getBoundingClientRect().top ?? Infinity;
    const k = Math.min(1, Math.max(0, 1 - (e.clientY - (top - 44)) / 64));
    return { x: e.clientX, y: Math.max(8, e.clientY - 44 * k) };
  };
  const nearest = (root: Element, sel: string, x: number, y: number) => {
    let best: HTMLElement | undefined, bd = Infinity;
    root.querySelectorAll<HTMLElement>(sel).forEach(t => { const r = t.getBoundingClientRect(); const d = Math.hypot(x - (r.left + r.width / 2), (y - (r.top + r.height / 2)) * 0.6); if (d < bd) { bd = d; best = t; } });
    return best;
  };
  const probe = (x: number, y: number): Drop => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null; if (!el) return { kind: 'none' };
    const meldEl = el.closest<HTMLElement>('[data-m]'), rackEl = el.closest<HTMLElement>('[data-rack]');
    if (meldEl) {
      const hit = el.closest<HTMLElement>('[data-tid]'), tile = hit && meldEl.contains(hit) ? hit : nearest(meldEl, '[data-tid]', x, y);
      if (!tile) return { kind: 'meld', meldId: meldEl.dataset.m!, after: false };
      const r = tile.getBoundingClientRect(); return { kind: 'meld', meldId: meldEl.dataset.m!, tid: Number(tile.dataset.tid), after: x > r.left + r.width / 2 };
    }
    if (rackEl) { const cell = el.closest<HTMLElement>('[data-slot]') ?? nearest(rackEl, '[data-slot]', x, y); return { kind: 'rack', slot: cell ? Number(cell.dataset.slot) : undefined }; }
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
    const target = d.tid !== undefined ? resolve(d.tid) : undefined, e = m.tiles.find(x => x.tileId === d.tid);
    const one = ids.length === 1 ? resolve(ids[0]!) : undefined;
    if (target && !isNum(target) && one && isNum(one) && handSet.has(one.id) && e?.represents && e.represents.color === one.color && e.represents.value === one.value && !needInitial) {
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
    if (e.button > 0 || gest.current || !e.isPrimary) return;
    suppressClick.current = false;
    const target = e.target as HTMLElement;
    const grip = target.closest<HTMLElement>('[data-mh]');
    if (grip) { // 조합 손잡이: 조합 전체를 끈다(위치만 바꾸는 건 첫 등록 전이나 상대 차례에도 가능)
      const m = draft.table.find(x => x.id === grip.dataset.mh); if (!m) return;
      stopTimers(gest.current);
      suppressClick.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
      const first = grip.parentElement?.querySelector<HTMLElement>('.tile')?.getBoundingClientRect();
      gest.current = { id: -1, meld: m.id, ids: m.tiles.map(x => x.tileId), sx: e.clientX, sy: e.clientY, pid: e.pointerId, tw: layout.tw, grabX: first ? e.clientX - first.left : 0, grabY: first ? e.clientY - first.top : 0, started: false, long: false, line: [], lo: 0, hi: 0, dir: 1 };
      return;
    }
    const t = target.closest<HTMLElement>('[data-t]'); if (!t) return;
    if (!myTurn && !t.closest('[data-rack]')) return; // 상대 차례에도 손패는 미리 정리할 수 있다
    if (myTurn && needInitial && LOCK_TABLE_BEFORE_INITIAL && origIds.has(Number(t.dataset.t))) { game.setNotice('첫 등록 전에는 테이블 타일을 옮길 수 없어요.'); return; }
    stopTimers(gest.current);
    suppressClick.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = t.getBoundingClientRect();
    const g: Gest = { id: Number(t.dataset.t), sx: e.clientX, sy: e.clientY, pid: e.pointerId, tw: r.width, grabX: e.clientX - r.left, grabY: e.clientY - r.top, started: false, long: false, line: [], lo: 0, hi: 0, dir: e.clientX >= r.left + r.width / 2 ? 1 : -1 };
    g.timer = setTimeout(() => beginLong(g), LONG_MS);
    gest.current = g; setPress(g.id);
  };
  const movePointer = (e: PointerEvent) => {
    const g = gest.current; if (!g || g.pid !== e.pointerId) return;
    if (!g.started) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < (g.long ? 16 : e.pointerType === 'mouse' ? 5 : 9)) return;
      stopTimers(g); g.started = true; setPress(null); sfx.pick(); webPlatform.haptics.tick();
      const ids = g.meld ? g.ids! : g.long ? g.line.slice(g.lo, g.hi + 1) : selSet.has(g.id) ? selected : [g.id];
      g.ids = ids; if (g.long) setSelected(ids);
      suppressClick.current = true;
      const a = aim(e);
      const index = g.meld ? 0 : Math.max(0, ids.indexOf(g.id));
      const floating = { tw: g.tw, ox: -index * (g.tw + 2) - g.grabX, oy: -g.grabY };
      const next = { ids, ...floating, ...a, meld: g.meld, drop: probeFull(a, ids.length, g.meld, floating) };
      dragRef.current = next; setDrag(next); return;
    }
    const a = aim(e);
    const f = feltRef.current; // 테이블이 넘칠 때만(최소 크기에서도 안 들어갈 때) 가장자리 자동 스크롤
    if (f && f.scrollHeight > f.clientHeight) { const b = f.getBoundingClientRect(); if (a.x > b.left && a.x < b.right) { if (a.y < b.top + 36) f.scrollTop -= 10; else if (a.y > b.bottom - 36 && a.y < b.bottom + 16) f.scrollTop += 10; } }
    const cnt = g.ids?.length ?? 1;
    const previous = dragRef.current; if (!previous) return;
    const drop = probeFull(a, cnt, g.meld, previous);
    dragRef.current = { ...previous, ...a, drop };
    if (ghostRef.current) ghostRef.current.style.transform = `translate3d(${a.x + previous.ox}px, ${a.y + previous.oy}px, 0)`;
    if (spotRef.current && drop.kind === 'new' && drop.spot) spotRef.current.style.transform = `translate3d(${drop.spot.x}px, ${drop.spot.y}px, 0)`;
    // React only needs to update when the destination changes, not for every pixel.
    if (!sameDrop(previous.drop, drop)) setDrag(dragRef.current);
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
    if (e.type !== 'pointercancel') movePointer(e);
    stopTimers(g); gest.current = null; setPress(null);
    if (bdRef.current?.hasPointerCapture(e.pointerId)) bdRef.current.releasePointerCapture(e.pointerId);
    if (!g.started) { if (!g.meld && e.type !== 'pointercancel' && !g.long) toggle(g.id); return; } // 길게 눌렀다 떼면 선택이 그대로 남는다
    captureMotion(); // Also animate rejected drops and pointer cancellation back home.
    const d = dragRef.current; dragRef.current = null; setDrag(null);
    if (d && e.type !== 'pointercancel') { const a = aim(e); dropTo(d.ids, probe(a.x, a.y), landingAim(a, d.ids.length, d), g.meld); }
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
    window.addEventListener('blur', cancel);
    return () => { cancel(); window.removeEventListener('blur', cancel); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gest.current) { e.preventDefault(); A.current.cancel(); return; }
      if (!myTurn || document.activeElement !== document.body) return;
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      if (e.key === 'Enter' && canCommit) { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') setSelected([]);
      else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  const hint = !myTurn ? (view.message || `${current?.name ?? ''}님 차례예요 · 손패와 테이블 자리는 미리 정리해 둘 수 있어요`)
    : tip ? tip
    : selected.length ? `${selected.length}장 선택 · 끌어서 옮기세요`
    : changed ? (canCommit ? '좋아요! ✓ 확정을 누르세요' : placed.length === 0 ? '손패 타일을 1장 이상 내야 해요' : !initialReady ? `첫 등록 ${placedPoints}/${view.config.initialMeldMin}점` : badIds.length ? (info.get(badIds[0]!)?.why ?? '고쳐야 할 조합이 있어요') : '확인이 필요해요')
    : needInitial ? `첫 등록 ${view.config.initialMeldMin}점 이상 · 타일을 끌어 놓으세요` : '끌어서 놓기 · 길게 누르면 이어진 타일이 늘어나요';
  const insOf = (id: number) => (drag && drag.drop.tid === id && drag.drop.kind === 'meld' ? (drag.drop.after ? 'a' : 'b') : null);
  const sortLabel = { smart: '조합순', num: '숫자순', color: '색상순', custom: '내 배열' }[sortMode];
  const tv = (t: Tile, extra: Partial<React.ComponentProps<typeof TileView>> = {}) => <TileView key={t.id} tile={t} selected={selSet.has(t.id)} ghosted={!!drag?.ids.includes(t.id)} pressing={press === t.id} ins={insOf(t.id)} {...extra} />;
  const tgt = useMemo(() => { const s = new Set<number>(); if (drag?.drop.kind === 'rack' && drag.drop.slot !== undefined) { const row = Math.floor(drag.drop.slot / hf.cols); for (let k = 0; k < Math.min(drag.ids.length, hf.cols); k++) { const i = Math.min(drag.drop.slot + k, (row + 1) * hf.cols - 1); s.add(i); } } return s; }, [drag?.drop.kind, drag?.drop.slot, drag?.ids.length, hf.cols]);
  const sp = drag?.drop.kind === 'new' ? drag.drop.spot : null;

  return (
    <main ref={bdRef} className={`bd ${myTurn ? 'mine' : ''} ${drag ? 'dragging' : ''} ${myTurn && remaining <= 10 ? 'urgent' : ''}`} style={{ ['--mtw' as string]: `${mtw}px`, ['--rtw' as string]: `${hf.tw}px` }} onContextMenu={e => e.preventDefault()} onPointerDown={onDown} onLostPointerCapture={() => { if (gest.current) A.current.cancel(); }} onClickCapture={e => { if (suppressClick.current) { e.stopPropagation(); suppressClick.current = false; } }}>
      <div className="rot" role="alert"><b aria-hidden="true">⟳</b>화면을 가로로 돌려 주세요</div>
      {banner && <div className="banner" aria-hidden="true">{banner}</div>}
      <header className="bd-top">
        <div className="chips">{opps.map(p => <OppChip key={p.id} p={p} active={view.turn?.playerId === p.id} remaining={remaining} pct={pct} />)}</div>
        <p className={`bd-say ${canCommit ? 'good' : ''}`} aria-live="polite">{hint}</p>
        {!game.online && <span className="offline">연결 끊김</span>}
        <div className={`mytimer ${myTurn ? 'on' : ''} ${myTurn && remaining <= 10 ? 'danger' : ''}`}>{myTurn ? `내 차례 ${remaining}` : `${current?.name ?? ''} ${remaining}`}</div>
        <SoundToggle />
        <button className="snd help" onClick={() => setCoach(true)} aria-label="조작 방법">?</button>
        <button className="exit compact" onClick={onExit}>나가기</button>
      </header>

      <div className="bd-fw">
        <section ref={feltRef} className={`bd-felt ${drag?.drop.kind === 'new' ? 'over' : ''}`} data-felt aria-label="테이블">
          <div ref={canvasRef} className="bd-melds" style={{ height: layout.fits ? '100%' : layout.height }}>
            {draft.table.map(m => {
              const i = info.get(m.id), r = layout.rects.get(m.id); if (!r) return null;
              return (
                <div key={m.id} data-m={m.id} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
                  className={`bm ${i?.ok ? 'ok' : 'bad'} ${drag?.drop.kind === 'meld' && drag.drop.meldId === m.id ? 'over' : ''} ${pulse.has(m.id) ? 'pulse' : ''} ${fits.has(m.id) ? 'fit' : ''} ${drag?.meld === m.id ? 'lifted' : ''}`}
                  onClick={() => { if (!myTurn) return; if (selected.length) place(selected, { to: 'meld', meldId: m.id }); else if (i && !i.ok) setTip(i.why); }}>
                  <button type="button" tabIndex={-1} className="bm-grip" data-mh={m.id} aria-label="조합 옮기기"><span className="dots" aria-hidden="true">⠿</span><i className="bm-badge">{i?.ok ? `✓ ${i.sum}` : `⚠ ${m.tiles.length < 3 ? `${m.tiles.length}/3` : i?.why === ORDER_HINT ? '순서' : '규칙'}`}</i></button>
                  <div className="bm-row">{m.tiles.map(e => { const t = resolve(e.tileId); return t ? tv(t, { repC: !isNum(t) ? e.represents?.color : undefined, repV: !isNum(t) ? e.represents?.value : undefined, fresh: !origIds.has(t.id), flash: flash.has(t.id) }) : null; })}</div>
                </div>);
            })}
            {sp && <div ref={spotRef} className="spot" style={{ left: 0, top: 0, transform: `translate3d(${sp.x}px, ${sp.y}px, 0)`, width: sp.w, height: sp.h }} aria-hidden="true" />}
          </div>
          {draft.table.length === 0 && <div className="bd-empty"><b>{myTurn ? '첫 조합을 놓아 보세요' : '테이블이 비어 있어요'}</b><span>{myTurn ? `같은 색 연속 숫자 · 같은 숫자 다른 색${needInitial ? ` · 합계 ${view.config.initialMeldMin}점 이상` : ''}` : '내 차례가 오기 전에 손패를 정리해 보세요'}</span></div>}
        </section>
        <button className="bd-tidy" onClick={tidyTable} aria-label="테이블 조합 자동 정돈" title="조합을 자동으로 가지런히 정돈">⊞ 정돈</button>
        {selected.length > 0 && myTurn && !drag && (
          <div className="bd-sel" role="toolbar" aria-label="선택한 타일">
            <b>{selected.length}장</b>
            <button className="primary" onClick={() => place(selected, { to: 'new' })}>새 조합</button>
            <button disabled={!returnable.length && selHand.length !== selected.length} onClick={() => placeHand(selHand.length === selected.length ? selected : returnable)}>손패로</button>
            <button onClick={() => setSelected([])} aria-label="선택 해제">✕</button>
          </div>)}
      </div>

      <section className={`bd-rack ${drag?.drop.kind === 'rack' ? 'over' : ''}`} data-rack aria-label="내 손패">
        <div ref={handRef} className="bd-hand" style={{ height: hf.h, gridTemplateColumns: `repeat(${hf.cols}, var(--rtw))` }}>
          {slotsV.map((id, i) => { const t = id == null ? undefined : handMap.get(id); return <div key={i} data-slot={i} className={`cell ${t ? '' : 'vacant'} ${tgt.has(i) ? 'tgt' : ''}`}>{t && tv(t, { isNew: newIds.has(t.id) })}</div>; })}
        </div>
      </section>

      <aside className="bd-act">
        <div className="bd-info">
          <span>손패 <b>{draft.hand.length}</b>{newIds.size > 0 && <em className="newbadge">NEW {newIds.size}</em>}</span>
          {needInitial && <span className={`meter ${initialReady ? 'done' : ''}`}><i style={{ width: `${Math.min(100, (placedPoints / view.config.initialMeldMin) * 100)}%` }} />첫 등록 {placedPoints}/{view.config.initialMeldMin}</span>}
        </div>
        <div className="bd-tools">
          {myTurn && !selected.length && suggestions[0] && <button className="bd-sug" onClick={() => placeSuggestion(suggestions[0]!)} aria-label="추천 조합 내기">💡 추천 {suggestions.length}</button>}
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
        <div ref={ghostRef} className="ghost" aria-hidden="true" style={{ transform: `translate3d(${drag.x + drag.ox}px, ${drag.y + drag.oy}px, 0)`, ['--tw' as string]: `${drag.tw}px`, ['--th' as string]: `${drag.tw * 1.4}px` }}>
          <div className="gstack">{drag.ids.map(id => { const t = resolve(id), entry = draft.table.flatMap(m => m.tiles).find(e => e.tileId === id); return t ? <TileView key={id} tile={t} passive repC={entry?.represents?.color} repV={entry?.represents?.value} /> : null; })}</div>
          {drag.ids.length > 1 && <em>{drag.ids.length}</em>}
          <span className={`drop-hint ${drag.drop.kind === 'meld' && fits.has(drag.drop.meldId ?? '') ? 'valid' : ''}`}>{drag.drop.kind === 'rack' ? '손패에 놓기' : drag.drop.kind === 'new' ? drag.meld ? '조합 자리 옮기기' : '새 조합 만들기' : drag.drop.kind === 'meld' ? fits.has(drag.drop.meldId ?? '') ? '✓ 조합에 이어 놓기' : '이 위치에 끼우기' : '테이블이나 손패에 놓으세요'}</span>
        </div>)}
      {coach && (
        <div className="coach" role="dialog" aria-label="조작 방법">
          <div className="coach-card">
            <h2>이렇게 움직여요</h2>
            <ul>
              <li><b>끌어서 놓기</b><span>조합 위에 놓으면 끼워지고, 빈 곳에 놓으면 그 자리에 새 조합이 생겨요. 초록으로 빛나는 조합에는 끼울 수 있어요.</span></li>
              <li><b>길게 누르기</b><span>계속 누르면 이어진 타일이 하나씩 늘어나요. 그대로 끌면 한꺼번에 옮겨요.</span></li>
              <li><b>순서대로</b><span>같은 색 숫자 조합은 왼쪽에서 오른쪽으로 작은 수부터 놓아야 ✓가 돼요. 중간에 끼워 규칙이 깨지면 그 자리에서 나눠 줘요.</span></li>
              <li><b>조커 옮기기</b><span>조커를 빼도 원래 조합이 3장 이상으로 유효하면, 조커를 직접 다른 조합으로 끌어 옮길 수 있어요. 교체라면 조커가 나타내던 정확한 타일이 필요해요.</span></li>
              <li><b>자유 배치</b><span>손패는 빈 칸 아무 데나 놓아 묶음을 만들고, 테이블 조합은 위쪽 ⠿ 손잡이를 끌어 원하는 곳으로 옮겨요.</span></li>
              <li><b>확정</b><span>모든 조합이 ✓가 되면 오른쪽 확정! 낼 게 없으면 뽑기.</span></li>
            </ul>
            <button className="primary" onClick={() => { setCoach(false); try { localStorage.setItem('rk-coach2', '1'); } catch { /* 무시 */ } }}>알겠어요</button>
          </div>
        </div>)}
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}
