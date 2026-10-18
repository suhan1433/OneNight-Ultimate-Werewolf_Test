import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Meld, Tile } from '@rummikub/rules';
import { validateMeld } from '@rummikub/rules';
import type { PublicView } from '@rummikub/protocol';
import { webPlatform } from '@rummikub/platform';
import { emit } from './socket.js';
import { sfx } from './sound.js';
import { COLORS, Num, Ring, SUIT, SortMode, SoundToggle, TileView, isNum, smartSort, sortByColor, sortByNumber, suggestedMelds } from './tiles.js';
import { Ctx, Dest, Draft, Result, mergeHandOrder, mergeMelds, moveTiles, signature, splitMeld, swapJoker, whyInvalid } from './editor.js';

export type GameApi = { online: boolean; notice: string; setNotice: (s: string) => void; next: () => number };
type Cam = { z: number; x: number; y: number };
type ViewMode = 'read' | 'all' | 'manual';
type Anchor = { id: number; after: boolean };
type Drag = { ids: number[]; x: number; y: number; over: string | null; ins: Anchor | null; gap: string | null };
type MRect = { id: string; x: number; y: number; w: number; h: number; ok: boolean };
type Gesture = { kind: 'tile' | 'pan' | 'drag'; src: 'hand' | 'table'; pid: number; id?: number; meldId?: string; el?: HTMLElement; sx: number; sy: number; cam0: Cam; moved: boolean; touch: boolean; timer?: number };
type Dst = Dest | { to: 'group' };

const TW = 44; // 테이블 타일 기준 폭(px). 화면에 맞추려고 타일을 줄이는 대신 카메라(확대/축소)로 보여준다.
const MIN_READ = 0.62; // "읽기 좋은 보기"의 최소 배율(= 타일 약 27px)
const MIN_Z = 0.25, MAX_Z = 2.4, LONG_PRESS = 190;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const LS = 'rk.view';

/** 손패: 타일을 34px 밑으로 줄이지 않는다. 안 들어가면 손패 영역을 세로 스크롤한다. */
const fitHand = (n: number, w: number, h: number) => {
  for (let tw = 52; tw >= 34; tw -= 2) { const cols = Math.max(1, Math.floor(w / (tw + 5))); if (Math.ceil(n / cols) * (tw * 1.4 + 12) <= h) return tw; }
  return 34;
};
function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [s, setS] = useState({ w: 0, h: 0 });
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setS({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect(); }, [ref]);
  return s;
}

function OppChip({ p, active, remaining, pct }: { p: PublicView['players'][number]; active: boolean; remaining: number; pct: number }) {
  return (
    <div className={`chip2 ${active ? 'active' : ''} ${p.handCount <= 3 ? 'low' : ''}`}>
      <Ring active={active} pct={active ? pct : 0} danger={active && remaining <= 10} sec={remaining}><div className="avatar">{p.isBot ? '봇' : p.name.slice(0, 1)}</div></Ring>
      <div className="who"><b>{p.name}</b><small>{active ? `${remaining}초` : p.hasInitialMeld ? '등록 완료' : '미등록'}</small></div>
      <em className="cnt" aria-label={`타일 ${p.handCount}개`}>{p.handCount}</em>
    </div>
  );
}

export function Board({ view, game }: { view: PublicView; game: GameApi }) {
  // ───────── 편집 상태(임시) — 서버 확정 상태(view)와 분리 ─────────
  const [draft, setDraft] = useState<Draft>({ hand: view.hand, table: view.table });
  const [past, setPast] = useState<Draft[]>([]);
  const [future, setFuture] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [breaks, setBreaks] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [editId, setEditId] = useState<string | null>(null);
  const [drawArm, setDrawArm] = useState(false);
  const [banner, setBanner] = useState(false);
  const [rangeMode, setRangeMode] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const [focus, setFocus] = useState<'bal' | 'hand' | 'table'>('bal');
  const [cam, setCam] = useState<Cam>(() => { try { const v = JSON.parse(localStorage.getItem(LS) ?? 'null'); if (v?.m === 'manual' && v.z) return { z: clamp(v.z, MIN_Z, MAX_Z), x: 8, y: 8 }; } catch { /* ignore */ } return { z: 1, x: 0, y: 0 }; });
  const [viewMode, setViewMode] = useState<ViewMode>(() => { try { const v = JSON.parse(localStorage.getItem(LS) ?? 'null'); if (v?.m === 'all' || v?.m === 'manual') return v.m; } catch { /* ignore */ } return 'read'; });
  const [rects, setRects] = useState<MRect[]>([]);
  const [worldH, setWorldH] = useState(0);
  const [handMore, setHandMore] = useState({ up: false, down: false });

  const camRef = useRef(cam); camRef.current = cam;
  const lastTap = useRef<{ id: number; at: number } | null>(null);
  const anchorId = useRef<number | null>(null);
  const flipRects = useRef(new Map<string, DOMRect>()), flipSig = useRef('');
  const seenTable = useRef<Set<number> | null>(null);
  const order = useRef<number[]>([]);
  const savedCustom = useRef<{ ids: number[]; breaks: number[] } | null>(null);
  const justCommitted = useRef(false);
  const rectsSig = useRef('');
  const pendingReveal = useRef<string | null>(null);
  const badCursor = useRef(0);
  const gameRef = useRef<HTMLElement | null>(null), camBefore = useRef<Cam | null>(null), camRaf = useRef(0), dragRaf = useRef(0);
  const feltRef = useRef<HTMLDivElement | null>(null), worldRef = useRef<HTMLDivElement | null>(null), handRef = useRef<HTMLDivElement | null>(null);
  const fs = useSize(feltRef), hs = useSize(handRef), gz = useSize(gameRef);
  // 제스처 상태: 포인터(손가락) 목록, 현재 제스처, 핀치, 드래그 위치
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gs = useRef<Gesture | null>(null);
  const pinch = useRef<{ d: number; cam: Cam; mx: number; my: number } | null>(null);
  const dragPos = useRef({ x: 0, y: 0 });
  const A = useRef<any>(null); // 매 렌더마다 갱신되는 "최신 핸들러" — 윈도우 리스너가 낡은 클로저를 쓰지 않게 한다

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
  const rebuild = (m: Meld): Meld => { const r = validateMeld(tilesOf(m), allow, m.id); return r.ok ? orderMeld(r.meld) : m; };
  const handIds = useMemo(() => new Set(view.hand.map(t => t.id)), [view.hand]);
  const origIds = useMemo(() => new Set(view.table.flatMap(m => m.tiles.map(e => e.tileId))), [view.table]);
  const ctx: Ctx = { tile: resolve, orig: origIds, fix: rebuild, newId: () => `draft-${crypto.randomUUID()}` };

  // ───────── 서버 상태 동기화: 새 버전이 오면 오래된 편집 상태를 버린다(타일은 서버 기준으로 복구) ─────────
  useEffect(() => {
    const byId = new Map(view.hand.map(t => [t.id, t]));
    let hand: Tile[]; let fresh = new Set<number>();
    if (!order.current.length) { const s = smartSort(view.hand); hand = s.hand; setBreaks(s.breaks); sfx.deal(view.hand.length); }
    else { const kept = order.current.filter(id => byId.has(id)), known = new Set(kept); const added = view.hand.filter(t => !known.has(t.id)); fresh = new Set(added.map(t => t.id)); hand = [...kept.map(id => byId.get(id)!), ...added]; }
    order.current = hand.map(t => t.id); setNewIds(fresh);
    setDraft({ hand, table: view.table }); setPast([]); setFuture([]); setSelected([]); setEditId(null); setRangeMode(false); setSplitMode(false);
  }, [view.version]);
  useEffect(() => { order.current = draft.hand.map(t => t.id); }, [draft.hand]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => {
    const ids = new Set(view.tableTiles.map(t => t.id));
    const prev = seenTable.current; seenTable.current = ids;
    if (justCommitted.current) { justCommitted.current = false; return; }
    if (!prev) return;
    const added = [...ids].filter(id => !prev.has(id)); if (!added.length) return;
    setFlash(new Set(added)); const t = setTimeout(() => setFlash(new Set()), 3400); return () => clearTimeout(t);
  }, [view.version]);
  useEffect(() => { if (editId && !draft.table.some(m => m.id === editId)) setEditId(null); }, [draft.table, editId]);

  // ───────── 파생 값 ─────────
  const info = useMemo(() => new Map(draft.table.map(m => { const ts = tilesOf(m); const ok = validateMeld(ts, allow, m.id).ok; return [m.id, { ok, sum: m.tiles.reduce((s, e) => s + val(e), 0), why: ok ? '' : whyInvalid(ts) }]; })), [draft.table, pool, allow]);
  const baseSig = useMemo(() => signature({ hand: view.hand, table: view.table }), [view.hand, view.table]);
  const changed = useMemo(() => signature(draft) !== baseSig, [draft, baseSig]);
  const placedTiles = draft.table.flatMap(m => m.tiles).filter(e => handIds.has(e.tileId));
  const placedPoints = placedTiles.reduce((s, e) => s + val(e), 0);
  const allValid = [...info.values()].every(v => v.ok);
  const needInitial = !!self && !self.hasInitialMeld;
  const initialReady = !needInitial || placedPoints >= view.config.initialMeldMin;
  // 손패 타일을 1장 이상 내야 확정 가능 — 기존 구현(손패 길이 변화 기준)의 동작을 보존한다(서버가 최종 검증).
  const canCommit = myTurn && changed && placedTiles.length > 0 && allValid && initialReady;
  const badIds = draft.table.filter(m => !info.get(m.id)?.ok).map(m => m.id);
  const suggestions = useMemo(() => (myTurn ? suggestedMelds(draft.hand, allow) : []), [draft.hand, allow, myTurn]);
  const groups = useMemo(() => { const out: Tile[][] = []; draft.hand.forEach(t => { if (!out.length || breaks.has(t.id)) out.push([t]); else out[out.length - 1]!.push(t); }); return out; }, [draft.hand, breaks]);
  const handSet = useMemo(() => new Set(draft.hand.map(t => t.id)), [draft.hand]);
  const meldOf = useMemo(() => { const m = new Map<number, string>(); draft.table.forEach(x => x.tiles.forEach(e => m.set(e.tileId, x.id))); return m; }, [draft.table]);
  const needsOf = (g: Tile[]) => {
    const nums = g.filter(isNum); if (g.length < 2 || nums.length !== g.length) return [];
    const out: { color: Num['color']; value: number }[] = []; const c0 = nums[0]!;
    if (nums.every(t => t.color === c0.color)) { const v = nums.map(t => t.value).sort((a, b) => a - b); if (v.every((x, i) => !i || x === v[i - 1]! + 1)) { if (v[0]! > 1) out.push({ color: c0.color, value: v[0]! - 1 }); if (v[v.length - 1]! < 13) out.push({ color: c0.color, value: v[v.length - 1]! + 1 }); } }
    else if (nums.length < 4 && nums.every(t => t.value === c0.value) && new Set(nums.map(t => t.color)).size === nums.length) COLORS.filter(c => !nums.some(t => t.color === c)).forEach(c => out.push({ color: c, value: c0.value }));
    return out;
  };
  const copies = (c: string, v: number) => [...draft.hand, ...view.tableTiles].filter(t => isNum(t) && t.color === c && t.value === v).length;

  // 선택 컨텍스트
  const selSet = useMemo(() => new Set(selected), [selected]);
  const selHand = selected.filter(id => handSet.has(id));
  const selTable = selected.filter(id => !handSet.has(id));
  const returnable = selTable.filter(id => !origIds.has(id));
  const lockedSel = selTable.length - returnable.length;
  const meldsTouched = [...new Set(selTable.map(id => meldOf.get(id)).filter((x): x is string => !!x))];
  const one = selected.length === 1 && selTable.length === 1 ? (() => { const mid = meldOf.get(selected[0]!); const m = draft.table.find(x => x.id === mid); const i = m ? m.tiles.findIndex(e => e.tileId === selected[0]) : -1; return m && i >= 0 ? { meldId: m.id, i, n: m.tiles.length } : null; })() : null;
  const swapCand = useMemo(() => {
    if (!myTurn || needInitial || selected.length !== 1 || !handSet.has(selected[0]!)) return null;
    const t = resolve(selected[0]!); if (!t || !isNum(t)) return null;
    for (const m of draft.table) for (const e of m.tiles) { const j = resolve(e.tileId); if (j && !isNum(j) && e.represents && e.represents.color === t.color && e.represents.value === t.value) return { meldId: m.id, jokerId: j.id }; }
    return null;
  }, [selected, draft.table, handSet, myTurn, needInitial, pool]);

  const remaining = Math.max(0, Math.ceil(((view.turn?.deadline ?? now) - now) / 1000));
  const pct = Math.min(100, (remaining / view.config.turnSeconds) * 100);
  const current = view.players.find(p => p.id === view.turn?.playerId);
  const n = view.players.length, mineIdx = Math.max(0, view.players.findIndex(p => p.id === me));
  const opps = Array.from({ length: Math.max(0, n - 1) }, (_, i) => view.players[(mineIdx + i + 1) % n]!);
  const gapsOn = myTurn && (selected.length > 0 || splitMode);
  const htw = fitHand(draft.hand.length + groups.length, Math.max(200, hs.w - 12), Math.max(60, hs.h - 8));

  // ───────── 카메라(테이블 확대/이동) ─────────
  // 월드 폭은 "화면 비율에 맞춰" 정한다 → 조합이 많아도 가로로 길게 늘어지지 않고 한 화면에 가깝게 배치된다.
  const world = useMemo(() => {
    const mw = (k: number) => k * (TW + 3) + 24, rowH = TW * 1.4 + 28;
    const area = draft.table.reduce((s, m) => s + (mw(m.tiles.length) + 10) * rowH, 0);
    const longest = Math.max(0, ...draft.table.map(m => mw(m.tiles.length)));
    const aspect = Math.max(0.8, fs.w / Math.max(1, fs.h));
    return { w: Math.round(clamp(Math.sqrt(area * aspect * 1.2) + 24, Math.max(360, longest + 28), 2600)), h: worldH || 200 };
  }, [draft.table, fs.w, fs.h, worldH]);
  const clampCam = (c: Cam): Cam => {
    const z = clamp(c.z, MIN_Z, MAX_Z), cw = world.w * z, ch = world.h * z, M = 56;
    return { z, x: cw + 2 * M <= fs.w ? (fs.w - cw) / 2 : clamp(c.x, fs.w - cw - M, M), y: ch + 2 * M <= fs.h ? (fs.h - ch) / 2 : clamp(c.y, fs.h - ch - M, M) };
  };
  const setCamManual = (c: Cam) => { const cc = clampCam(c); camRef.current = cc; setViewMode('manual'); if (!camRaf.current) camRaf.current = requestAnimationFrame(() => { camRaf.current = 0; setCam(camRef.current); }); };
  const zoomAt = (f: number, cx = fs.w / 2, cy = fs.h / 2) => { const c = camRef.current, z = clamp(c.z * f, MIN_Z, MAX_Z), wx = (cx - c.x) / c.z, wy = (cy - c.y) / c.z; setCamManual({ z, x: cx - wx * z, y: cy - wy * z }); };
  const focusMeld = (id: string, zoom = false) => {
    const r = rects.find(x => x.id === id); if (!r) return;
    const z = zoom ? Math.max(camRef.current.z, 0.95) : camRef.current.z;
    setCamManual({ z, x: fs.w / 2 - (r.x + r.w / 2) * z, y: fs.h / 2 - (r.y + r.h / 2) * z });
  };
  /** 조합 확대 편집: 그 조합으로 카메라를 확대하고, 닫으면 원래 보던 위치로 돌아온다 */
  const openEdit = (id: string) => {
    const r = rects.find(x => x.id === id); if (!r) return;
    if (!editId) camBefore.current = { ...camRef.current };
    setEditId(id);
    const z = clamp(Math.min((fs.w - 60) / r.w, (fs.h - 110) / r.h), 0.8, 1.7);
    setCamManual({ z, x: fs.w / 2 - (r.x + r.w / 2) * z, y: fs.h / 2 + 14 - (r.y + r.h / 2) * z });
  };
  const closeEdit = () => { setEditId(null); setSplitMode(false); const c = camBefore.current; camBefore.current = null; if (c) setCamManual(c); };
  const setMode = (m: 'read' | 'all') => { setViewMode(m); if (m === 'read') setCam({ z: MIN_READ, x: 8, y: 8 }); };
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ m: viewMode, z: cam.z })); } catch { /* ignore */ } }, [viewMode, viewMode === 'manual' ? cam.z : 0]);
  // 자동 카메라: 전체 보기 / 읽기 좋은 보기(최소 배율 보장 + 넘치면 이동)
  useLayoutEffect(() => {
    if (viewMode === 'manual' || !fs.w || !worldH) return;
    const fitZ = Math.min(fs.w / world.w, fs.h / world.h);
    const centered = (z: number): Cam => ({ z, x: (fs.w - world.w * z) / 2, y: (fs.h - world.h * z) / 2 });
    const c = viewMode === 'all' ? centered(clamp(fitZ, MIN_Z, 1.4)) : fitZ >= MIN_READ ? centered(Math.min(fitZ, 1.4)) : clampCam({ z: MIN_READ, x: camRef.current.x, y: camRef.current.y });
    const p = camRef.current;
    if (Math.abs(c.z - p.z) > 0.001 || Math.abs(c.x - p.x) > 0.5 || Math.abs(c.y - p.y) > 0.5) { camRef.current = c; setCam(c); }
  }, [viewMode, fs.w, fs.h, world.w, world.h]);
  // 조합 위치 측정(미니맵·포커스용) — 값이 바뀔 때만 상태 갱신
  useLayoutEffect(() => {
    const w = worldRef.current; if (!w) return;
    const list: MRect[] = [...w.querySelectorAll<HTMLElement>('.m')].map(el => ({ id: el.dataset.m!, x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight, ok: el.classList.contains('ok') }));
    const h = w.offsetHeight, sig = JSON.stringify([h, list]);
    if (sig !== rectsSig.current) { rectsSig.current = sig; setRects(list); setWorldH(h); }
  });
  // 새로 만든/수정한 조합이 화면 밖이면 보이는 곳으로 이동
  useLayoutEffect(() => {
    const id = pendingReveal.current; if (!id) return;
    const r = rects.find(x => x.id === id); if (!r) return; pendingReveal.current = null;
    const c = camRef.current, l = r.x * c.z + c.x, t = r.y * c.z + c.y;
    if (l < 0 || t < 0 || l + r.w * c.z > fs.w || t + r.h * c.z > fs.h) focusMeld(id);
  }, [rects]);
  // 휠: 이동, Ctrl/⌘+휠 또는 트랙패드 핀치: 확대
  useEffect(() => {
    const el = feltRef.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) A.current.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else { const c = camRef.current; A.current.setCamManual({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }); }
    };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  }, []);

  // ───────── FLIP 애니메이션: 타일이 옮겨질 때 이전 자리에서 미끄러지듯 이동 ─────────
  // 카메라/스크롤이 바뀐 프레임에는 건너뛰어(팬·줌이 가짜 이동 애니메이션을 만들지 않도록) 상태 변경과 분리한다.
  useLayoutEffect(() => {
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches, c = camRef.current;
    const sig = `${c.z.toFixed(3)},${c.x.toFixed(1)},${c.y.toFixed(1)},${handRef.current?.scrollTop ?? 0},${fs.w},${fs.h},${hs.w},${hs.h}`;
    const steady = sig === flipSig.current; flipSig.current = sig;
    const next = new Map<string, DOMRect>();
    document.querySelectorAll<HTMLElement>('.ghand [data-t],.world [data-t]').forEach(el => {
      const id = el.dataset.t!, r = el.getBoundingClientRect(), p = flipRects.current.get(id), z = el.closest('.world') ? c.z : 1; next.set(id, r);
      if (steady && p && !calm && (Math.abs(p.left - r.left) > 2 || Math.abs(p.top - r.top) > 2)) el.animate([{ transform: `translate(${(p.left - r.left) / z}px,${(p.top - r.top) / z}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.25,1)' });
    });
    flipRects.current = next;
  });
  useEffect(() => {
    const el = handRef.current; if (!el) return;
    const upd = () => setHandMore({ up: el.scrollTop > 4, down: el.scrollHeight - el.clientHeight - el.scrollTop > 4 });
    upd(); el.addEventListener('scroll', upd, { passive: true }); return () => el.removeEventListener('scroll', upd);
  }, [draft.hand.length, hs.h, htw, groups.length]);

  const validCount = [...info.values()].filter(v => v.ok).length;
  const prevValid = useRef(validCount);
  useEffect(() => { if (myTurn && changed && validCount > prevValid.current) sfx.chime(); prevValid.current = validCount; }, [validCount]);
  const wasMine = useRef(myTurn);
  useEffect(() => { if (myTurn && !wasMine.current) { sfx.turn(); webPlatform.haptics.success(); setBanner(true); setTimeout(() => setBanner(false), 1300); } wasMine.current = myTurn; }, [myTurn]);
  useEffect(() => { if (myTurn && remaining === 10) webPlatform.haptics.tick(); }, [remaining === 10 && myTurn]);

  // ───────── 편집 명령 ─────────
  /** 결과를 적용한다. recordHistory=false 는 손패 순서만 바꾸는 경우(Undo 대상이 아님). */
  const apply = (r: Result, opts: { history?: boolean; select?: number[] } = {}) => {
    if (!r.ok) { game.setNotice(r.reason); return false; }
    if (opts.history !== false) { setPast(p => [...p.slice(-99), draft]); setFuture([]); }
    setDraft(r.draft); setSelected(opts.select ?? []);
    if (r.meldId) pendingReveal.current = r.meldId;
    return true;
  };
  const shiftBreaks = (ids: number[]) => { // 빠져나가는 타일이 구분선을 쥐고 있으면 다음 타일로 넘긴다
    const nb = new Set(breaks), rem = new Set(ids);
    draft.hand.forEach((t, i) => { if (rem.has(t.id) && nb.has(t.id)) { nb.delete(t.id); const nx = draft.hand.slice(i + 1).find(x => !rem.has(x.id)); if (nx) nb.add(nx.id); } });
    return nb;
  };
  const place = (ids: number[], dst: Dst) => {
    if (!myTurn || !ids.length) return;
    const reorder = (dst.to === 'hand' || dst.to === 'group') && ids.every(id => handSet.has(id));
    const r = moveTiles(draft, ids, dst.to === 'group' ? { to: 'hand' } : dst, ctx);
    if (!apply(r, { history: !reorder })) return;
    let nb = shiftBreaks(ids);
    if (dst.to === 'group' && r.ok) { const moved = r.draft.hand.filter(t => ids.includes(t.id)); if (moved[0]) nb = new Set([...nb, moved[0].id]); }
    setBreaks(nb);
    if (reorder || dst.to === 'hand' || dst.to === 'group') setSortMode('custom');
    webPlatform.haptics.tick(); if (dst.to === 'hand' || dst.to === 'group') sfx.pick(); else sfx.clack();
  };
  const placeMeld = (meld: Meld) => {
    if (!myTurn) return; const used = new Set(meld.tiles.map(e => e.tileId));
    const r = moveTiles(draft, [...used], { to: 'new' }, ctx);
    if (apply(r)) { setBreaks(shiftBreaks([...used])); webPlatform.haptics.tick(); sfx.clack(); }
  };
  const splitAt = (meldId: string, index: number) => { if (apply(splitMeld(draft, meldId, index, ctx))) { webPlatform.haptics.tick(); sfx.clack(); } };
  const mergeSelected = () => { if (apply(mergeMelds(draft, meldsTouched, ctx))) { webPlatform.haptics.tick(); sfx.clack(); } };
  const doSwap = () => {
    if (!swapCand) return;
    const r = swapJoker(draft, swapCand.meldId, swapCand.jokerId, selected[0]!, ctx);
    if (apply(r, { select: [swapCand.jokerId] })) { game.setNotice('조커를 꺼냈어요. 쓸 조합(또는 새 조합)을 탭하세요. 확정 전에 꼭 다시 놓아야 해요.'); webPlatform.haptics.tick(); sfx.clack(); }
  };
  const gapAct = (meldId: string, index: number) => { if (!myTurn) return; if (selected.length) place(selected, { to: 'meld', meldId, index }); else if (splitMode) splitAt(meldId, index); };
  const step = (from: Draft[], setFrom: (f: Draft[]) => void, to: Draft[], setTo: (t: Draft[]) => void) => {
    const s = from[from.length - 1]; if (!s) return;
    setFrom(from.slice(0, -1)); setTo([...to.slice(-99), draft]);
    // 되돌릴 때 손패의 "표시 순서"는 사용자가 정렬한 현재 순서를 유지한다. 타일 ID·조커 표현값은 스냅샷 그대로 복구.
    setDraft({ hand: mergeHandOrder(draft.hand, s.hand), table: s.table }); setSelected([]); webPlatform.haptics.tick();
  };
  const undo = () => step(past, setPast, future, setFuture);
  const redo = () => step(future, setFuture, past, setPast);
  const reset = () => { if (!changed) return; setPast(p => [...p.slice(-99), draft]); setFuture([]); setDraft({ hand: mergeHandOrder(draft.hand, view.hand), table: view.table }); setSelected([]); setEditId(null); };
  const sortTo = (m: SortMode) => {
    if (sortMode === 'custom') savedCustom.current = { ids: draft.hand.map(t => t.id), breaks: [...breaks] };
    if (m === 'custom') {
      const sc = savedCustom.current; if (!sc) return;
      const byId = new Map(draft.hand.map(t => [t.id, t])), kept = sc.ids.filter(id => byId.has(id)), known = new Set(kept);
      setDraft(p => ({ ...p, hand: [...kept.map(id => byId.get(id)!), ...draft.hand.filter(t => !known.has(t.id))] })); setBreaks(new Set(sc.breaks.filter(id => byId.has(id))));
    } else if (m === 'smart') { const r = smartSort(draft.hand); setDraft(p => ({ ...p, hand: r.hand })); setBreaks(r.breaks); }
    else if (m === 'num') { setDraft(p => ({ ...p, hand: sortByNumber(draft.hand) })); setBreaks(new Set()); }
    else { const r = sortByColor(draft.hand); setDraft(p => ({ ...p, hand: r.hand })); setBreaks(r.breaks); }
    setSortMode(m); setNewIds(new Set());
  };
  const cycleSort = () => { const seq: SortMode[] = ['smart', 'num', 'color', 'custom']; const i = seq.indexOf(sortMode); for (let k = 1; k <= 4; k++) { const m = seq[(i + k) % 4]!; if (m !== 'custom' || (savedCustom.current && sortMode !== 'custom')) return sortTo(m); } };
  const send = (event: string) => emit(event, { roomId: view.roomId, clientSeq: game.next() }).catch((e: Error) => game.setNotice(e.message));
  const commit = () => { justCommitted.current = true; return emit('turn:commit', { roomId: view.roomId, version: view.version, table: draft.table, hand: draft.hand.map(t => t.id), clientSeq: game.next() }).then(() => { webPlatform.haptics.success(); sfx.chime(); }).catch((e: Error) => { justCommitted.current = false; game.setNotice(e.message); }); };
  const jumpBad = () => { if (!badIds.length) return; const id = badIds[badCursor.current++ % badIds.length]!; openEdit(id); game.setNotice(info.get(id)?.why ?? ''); };

  // ───────── 선택 ─────────
  const toggle = (id: number) => { if (myTurn) { setSelected(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id])); anchorId.current = id; } };
  const listOf = (id: number) => { const mid = meldOf.get(id); return mid ? draft.table.find(m => m.id === mid)!.tiles.map(e => e.tileId) : draft.hand.map(t => t.id); };
  const groupOf = (id: number) => { const mid = meldOf.get(id); return mid ? draft.table.find(m => m.id === mid)!.tiles.map(e => e.tileId) : groups.find(g => g.some(t => t.id === id))?.map(t => t.id) ?? [id]; };
  /** 선택 규칙: 탭=토글 / 두 번 탭=묶음·조합 통째 / [범위] 켠 뒤 끝 타일 탭=범위 선택 / 손패 선택 후 테이블 타일 탭=그 타일 옆에 삽입 */
  const tapTile = (id: number, meldId: string | undefined, x: number, el?: HTMLElement) => {
    if (!myTurn) { if (meldId) openEdit(meldId); return; }
    const t0 = lastTap.current, t = Date.now(); lastTap.current = { id, at: t };
    if (t0 && t0.id === id && t - t0.at < 320) { lastTap.current = null; setSelected(groupOf(id)); anchorId.current = id; sfx.pick(); return; }
    if (rangeMode) {
      setRangeMode(false); const list = listOf(id), a = anchorId.current;
      if (a !== null && list.includes(a)) { const [i, j] = [list.indexOf(a), list.indexOf(id)].sort((p, q) => p - q) as [number, number]; setSelected(prev => [...new Set([...prev, ...list.slice(i, j + 1)])]); sfx.pick(); return; }
    }
    // 선택한 타일이 있고, 그 타일들이 있던 조합과 "다른" 조합의 타일을 탭하면 → 그 타일 옆(왼쪽/오른쪽 절반)에 놓는다.
    // (같은 조합의 타일이면 선택에 추가/해제. 조합 통째 이동 = 두 번 탭으로 조합 선택 → 다른 조합 타일 탭)
    if (meldId && selected.length && !selSet.has(id) && !meldsTouched.includes(meldId)) {
      const m = draft.table.find(x => x.id === meldId)!, idx = m.tiles.findIndex(e => e.tileId === id), r = el?.getBoundingClientRect();
      lastTap.current = null; place(selected, { to: 'meld', meldId, index: idx + (r && x > r.left + r.width / 2 ? 1 : 0) }); return;
    }
    sfx.pick(); toggle(id);
  };
  const keyToggle = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-t],[data-s]'); if (!el) return;
    e.preventDefault(); toggle(Number(el.dataset.t ?? el.dataset.s));
  };

  // ───────── 드래그 ─────────
  const hit = (x: number, y: number, over: string | null): Anchor | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-tid]'); if (!el) return null;
    const inHand = !!el.closest('.ghand'), mid = el.closest<HTMLElement>('[data-m]')?.dataset.m;
    if (over === 'hand' ? !inHand : !(mid && mid === over)) return null;
    const r = el.getBoundingClientRect(); return { id: Number(el.dataset.tid), after: x > r.left + r.width / 2 };
  };
  const probe = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    const over = el?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null, gap = el?.closest<HTMLElement>('[data-gap]')?.dataset.gap ?? null;
    return { over, gap, ins: gap ? null : hit(x, y, over) };
  };
  const activate = (g: Gesture, x: number, y: number) => {
    g.kind = 'drag'; dragPos.current = { x, y };
    const ids = g.id !== undefined && selSet.has(g.id) ? selected : [g.id!];
    setDrag({ ids, x, y: Math.max(28, y - 70), ...probe(x, y) }); webPlatform.haptics.tick(); sfx.pick();
  };
  const dragMove = (x: number, y: number) => { dragPos.current = { x, y }; if (!dragRaf.current) dragRaf.current = requestAnimationFrame(() => { dragRaf.current = 0; const p = dragPos.current; setDrag(d => (d ? { ...d, x: p.x, y: Math.max(28, p.y - 70), ...probe(p.x, p.y) } : d)); }); };
  const dragCancel = () => { cancelAnimationFrame(dragRaf.current); dragRaf.current = 0; setDrag(null); const g = gs.current; if (g) { window.clearTimeout(g.timer); gs.current = null; } };
  const dragEnd = (g: Gesture, x: number, y: number, cancelled: boolean) => {
    const d = drag; cancelAnimationFrame(dragRaf.current); dragRaf.current = 0; setDrag(null); if (!d || cancelled) return;
    const ids = d.ids, p = probe(x, y);
    if (p.gap) { const k = p.gap.lastIndexOf(':'); return place(ids, { to: 'meld', meldId: p.gap.slice(0, k), index: Number(p.gap.slice(k + 1)) }); }
    if (p.over === 'hand') { if (p.ins && ids.includes(p.ins.id)) return; const at = p.ins ? draft.hand.findIndex(t => t.id === p.ins!.id) + (p.ins.after ? 1 : 0) : undefined; return place(ids, { to: 'hand', at }); }
    if (p.over === 'group' || p.over === 'new') return place(ids, { to: p.over });
    if (p.over) { const m = draft.table.find(mm => mm.id === p.over); if (!m) return; const idx = p.ins ? m.tiles.findIndex(e => e.tileId === p.ins!.id) + (p.ins.after ? 1 : 0) : undefined; return place(ids, { to: 'meld', meldId: p.over, index: idx }); }
  };
  const tap = (g: Gesture, x: number) => {
    if (g.kind === 'tile') return tapTile(g.id!, g.meldId, x, g.el);
    if (!myTurn && g.meldId) return openEdit(g.meldId);
    if (g.meldId) { if (selected.length) place(selected, { to: 'meld', meldId: g.meldId }); else openEdit(g.meldId); return; }
    // 빈 곳 탭 = 선택 해제(실수로 새 조합이 생기지 않도록). 새 조합은 [새 조합] 버튼이나 드래그로.
    if (g.src === 'table' && selected.length) { setSelected([]); setRangeMode(false); }
  };

  // ───────── 핀치 ─────────
  const pinchStart = () => {
    if (drag) dragCancel(); const g = gs.current; if (g) { window.clearTimeout(g.timer); gs.current = null; }
    const [a, b] = [...ptrs.current.values()] as [{ x: number; y: number }, { x: number; y: number }], r = feltRef.current!.getBoundingClientRect();
    pinch.current = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), cam: { ...camRef.current }, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
  };
  const pinchMove = () => {
    const p = pinch.current; if (!p || ptrs.current.size < 2) return;
    const [a, b] = [...ptrs.current.values()] as [{ x: number; y: number }, { x: number; y: number }], r = feltRef.current!.getBoundingClientRect();
    const z = clamp(p.cam.z * Math.hypot(a.x - b.x, a.y - b.y) / p.d, MIN_Z, MAX_Z), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    const wx = (p.mx - p.cam.x) / p.cam.z, wy = (p.my - p.cam.y) / p.cam.z;
    setCamManual({ z, x: mx - wx * z, y: my - wy * z });
  };

  /** 포인터 다운: 손패·테이블 컨테이너에서 위임. 타일 위=길게 눌러 드래그(마우스는 바로), 빈 곳=테이블 이동, 두 손가락=핀치 */
  const onDown = (src: 'hand' | 'table') => (e: React.PointerEvent) => {
    if (e.button > 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.gap,.newslot,.gnew,.gplay,.sg')) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (src === 'table' && ptrs.current.size === 2) return pinchStart();
    if (ptrs.current.size > 1 || pinch.current) return;
    const tEl = target.closest<HTMLElement>('[data-t]'), mEl = target.closest<HTMLElement>('[data-m]');
    const isTile = !!tEl && myTurn;
    if (!isTile && src === 'hand') { ptrs.current.delete(e.pointerId); return; }
    const g: Gesture = { kind: isTile ? 'tile' : 'pan', src, pid: e.pointerId, id: tEl ? Number(tEl.dataset.t) : undefined, meldId: mEl?.dataset.m, el: tEl ?? undefined, sx: e.clientX, sy: e.clientY, cam0: { ...camRef.current }, moved: false, touch: e.pointerType !== 'mouse' };
    gs.current = g;
    if (isTile && g.touch) g.timer = window.setTimeout(() => { const p = ptrs.current.get(g.pid); if (gs.current === g && g.kind === 'tile' && !g.moved && p) A.current.activate(g, p.x, p.y); }, LONG_PRESS);
  };

  A.current = { activate, dragMove, dragEnd, dragCancel, tap, pinchMove, setCamManual, zoomAt };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = ptrs.current.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
      if (pinch.current) return A.current.pinchMove();
      const g = gs.current; if (!g || g.pid !== e.pointerId) return;
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy, dist = Math.hypot(dx, dy);
      if (g.kind === 'tile' && !g.moved && dist > (g.touch ? 10 : 6)) {
        g.moved = true; window.clearTimeout(g.timer);
        if (!g.touch) A.current.activate(g, e.clientX, e.clientY);
        else if (g.src === 'table') g.kind = 'pan';
        else { gs.current = null; return; } // 손패에서 길게 누르기 전에 움직이면 → 스크롤에 양보
      }
      if (g.kind === 'pan') { if (!g.moved && dist > 5) g.moved = true; if (g.moved) A.current.setCamManual({ ...g.cam0, x: g.cam0.x + dx, y: g.cam0.y + dy }); }
      else if (g.kind === 'drag') A.current.dragMove(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      if (!ptrs.current.delete(e.pointerId)) return;
      if (pinch.current) { if (ptrs.current.size < 2) pinch.current = null; return; }
      const g = gs.current; if (!g || g.pid !== e.pointerId) return;
      window.clearTimeout(g.timer); gs.current = null;
      if (g.kind === 'drag') return A.current.dragEnd(g, e.clientX, e.clientY, e.type === 'pointercancel');
      if (g.moved || e.type === 'pointercancel') return;
      A.current.tap(g, e.clientX);
    };
    // 드래그/핀치 중에는 브라우저 스크롤을 막는다(길게 눌러 시작한 드래그가 손패 스크롤로 바뀌지 않게)
    const block = (e: TouchEvent) => { if (gs.current?.kind === 'drag' || pinch.current) e.preventDefault(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', block, { passive: false });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('touchmove', block); };
  }, []);
  // 드래그 중 가장자리 자동 스크롤(속도 제한)
  useEffect(() => {
    if (!drag) return; let raf = 0;
    const loop = () => {
      const { x, y } = dragPos.current, E = 40, S = 8, r = feltRef.current?.getBoundingClientRect(), h = handRef.current;
      if (r && x >= r.left && x <= r.right && y >= r.top - 10 && y <= r.bottom) {
        const dx = x < r.left + E ? S * (1 - (x - r.left) / E) : x > r.right - E ? -S * (1 - (r.right - x) / E) : 0;
        const dy = y < r.top + E ? S * (1 - (y - r.top) / E) : y > r.bottom - E ? -S * (1 - (r.bottom - y) / E) : 0;
        if (dx || dy) { const c = camRef.current; A.current.setCamManual({ ...c, x: c.x + dx, y: c.y + dy }); }
      }
      if (h) { const hr = h.getBoundingClientRect(); if (x >= hr.left && x <= hr.right) { if (y > hr.top - 6 && y < hr.top + 30) h.scrollTop -= 7; else if (y > hr.bottom - 30 && y < hr.bottom + 6) h.scrollTop += 7; } }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [!!drag]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!myTurn || document.activeElement !== document.body) return;
      const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
      if (e.key === 'Enter' && canCommit) { e.preventDefault(); commit(); }
      else if (e.key === ' ' && !changed) { e.preventDefault(); setDrawArm(true); setTimeout(() => setDrawArm(false), 2500); }
      else if (e.key === 'Escape') { if (editId) closeEdit(); else if (splitMode) setSplitMode(false); else setSelected([]); }
      else if (mod && k === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      else if (mod && k === 'z') { e.preventDefault(); undo(); }
      else if (mod && k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  // ───────── 표시 ─────────
  const hint = !myTurn ? (view.message || `${current?.name ?? ''}님 차례`)
    : splitMode ? '✂ 나눌 위치(타일 사이)를 탭하세요'
    : rangeMode ? '범위의 끝 타일을 탭하세요'
    : changed ? (canCommit ? '좋아요! 확정을 누르세요' : placedTiles.length === 0 ? '손패 타일을 1장 이상 내야 해요' : !initialReady ? `첫 등록 ${placedPoints}/${view.config.initialMeldMin}점` : badIds.length ? `고쳐야 할 조합 ${badIds.length}개` : '확인이 필요해요')
    : needInitial ? `첫 등록 ${view.config.initialMeldMin}점 이상 · 추천 조합을 탭해 보세요` : '탭=선택 · 길게 눌러 드래그 · 두 번 탭=묶음 전체';
  const overflow = world.w * cam.z > fs.w + 4 || world.h * cam.z > fs.h + 4;
  const mmS = Math.min(112 / world.w, 62 / Math.max(1, world.h));
  const dropLabel = !drag ? '' : drag.gap ? '이 위치에 삽입' : drag.over === 'hand' ? (drag.ins ? '손패 순서 바꾸기' : '손패로') : drag.over === 'group' ? '새 묶음' : drag.over === 'new' ? '새 조합' : drag.over ? (drag.ins ? '조합 중간에 삽입' : '이 조합에 추가') : '놓을 곳을 찾아보세요';
  const stw = clamp(Math.floor((fs.h - 40 - 30 - 34) / 1.4), 34, 56);
  const insOf = (id: number) => (drag?.ins?.id === id ? (drag.ins.after ? 'a' : 'b') : null);
  const selChips = selected.slice(0, 6).map(resolve).filter((t): t is Tile => !!t);
  const sortLabel = { smart: '조합순', num: '숫자순', color: '색상순', custom: '내 배열' }[sortMode];

  /** 조합의 타일들. 타일 사이 ↓/✂ 칸은 레이아웃을 밀지 않는 "겹침(overlay)"이라 선택해도 테이블이 흔들리지 않는다. */
  const meldTiles = (m: Meld) => {
    const showGaps = myTurn && (splitMode || editId === m.id), ins = selected.length > 0, last = m.tiles.length;
    const gap = (idx: number, side: 'l' | 'r') => { if (!ins && (idx <= 0 || idx >= last)) return null; return <button key={`g${idx}${side}`} className={`gap ${side} ${ins ? 'ins' : 'split'}`} data-gap={`${m.id}:${idx}`} aria-label={ins ? '여기에 삽입' : '여기서 나누기'} onClick={() => gapAct(m.id, idx)}><i>{ins ? '↓' : '✂'}</i></button>; };
    return m.tiles.map((e, i) => {
      const t = resolve(e.tileId); if (!t) return null;
      return (
        <span className="tw" key={t.id}>
          {showGaps && i === 0 && gap(0, 'l')}
          <TileView tile={t} repC={!isNum(t) ? e.represents?.color : undefined} repV={!isNum(t) ? e.represents?.value : undefined} fresh={!origIds.has(t.id)} flash={flash.has(t.id)} selected={selSet.has(t.id)} ghosted={!!drag?.ids.includes(t.id)} ins={insOf(t.id)} />
          {showGaps && gap(i + 1, 'r')}
        </span>
      );
    });
  };
  const rackPx = (() => { // 손패 영역 높이: 손패 장수에 맞춰 자동(너무 크거나 작지 않게), 수동 전환도 가능
    const H = gz.h || window.innerHeight, per = Math.max(1, Math.floor(Math.max(200, hs.w - 12) / 45)), rows = Math.ceil((draft.hand.length + groups.length) / per);
    const need = rows * (40 * 1.4 + 16) + 26 + 34;
    return Math.round(focus === 'hand' ? H * 0.56 : focus === 'table' ? H * 0.27 : clamp(need, H * 0.3, H * 0.5));
  })();
  const urgent = myTurn && remaining <= 10;

  return (
    <main ref={gameRef} style={{ ['--rack' as string]: `${rackPx}px` }} className={`game f-${focus} ${myTurn ? 'mine' : ''} ${drag ? 'dragging' : ''} ${urgent ? 'urgent' : ''}`} onContextMenu={e => e.preventDefault()}>
      {banner && <div className="banner" aria-hidden="true">내 차례!</div>}
      <header className="gtop">
        <div className="chips">{opps.map(p => <OppChip key={p.id} p={p} active={view.turn?.playerId === p.id} remaining={remaining} pct={pct} />)}</div>
        {!game.online && <span className="offline">연결 끊김</span>}
        <div className={`mytimer ${myTurn ? 'on' : ''} ${myTurn && remaining <= 10 ? 'danger' : ''}`}>{myTurn ? `내 차례 ${remaining}` : `${current?.name ?? ''} ${remaining}`}</div>
        <button className="snd" onClick={() => setFocus(f => (f === 'bal' ? 'hand' : f === 'hand' ? 'table' : 'bal'))} aria-label="화면 비율 바꾸기" title={`화면 비율: ${focus === 'bal' ? '균형' : focus === 'hand' ? '손패 크게' : '테이블 크게'}`}>{focus === 'bal' ? '▤' : focus === 'hand' ? '▥' : '▦'}</button>
        <SoundToggle />
      </header>

      <section className="fwrap">
        <div ref={feltRef} className={`gfelt ${drag?.over === 'new' ? 'over' : ''} ${viewMode === 'manual' ? 'manual' : ''}`} data-drop="new" onPointerDown={onDown('table')} onKeyDown={keyToggle}>
          <div ref={worldRef} className={`world ${editId ? 'editing' : ''}`} style={{ width: world.w, transform: `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`, ['--z' as string]: cam.z, ['--tw' as string]: `${TW}px` }}>
            <div className="gmelds">
              {draft.table.map(m => { const i = info.get(m.id); return (
                <div key={m.id} data-m={m.id} data-drop={m.id} className={`m ${i?.ok ? 'ok' : 'bad'} ${drag?.over === m.id ? 'over' : ''} ${editId === m.id ? 'open' : ''} ${selected.length ? 'tap' : ''}`}>
                  {meldTiles(m)}
                  <i className="mb">{i?.ok ? `✓${i.sum}` : '⚠'}</i>
                </div>); })}
              {myTurn && (selected.length > 0 || drag) && <button data-drop="new" className={`newslot ${drag?.over === 'new' ? 'over' : ''}`} onClick={() => place(selected, { to: 'new' })}>＋ 새 조합</button>}
            </div>
          </div>
          {draft.table.length === 0 && <div className="empty2">테이블이 비어 있어요</div>}
        </div>

        <div className={`ctxbar ${selected.length ? 'sel' : ''}`}>
          {selected.length > 0 ? <>
            <div className="sinfo" aria-live="polite"><b>{selected.length}장</b><small>{selHand.length ? `손패 ${selHand.length}` : ''}{selHand.length && selTable.length ? ' · ' : ''}{selTable.length ? `테이블 ${selTable.length}${lockedSel ? ` (원래 ${lockedSel})` : ''}` : ''}</small></div>
            <button className="primary" onClick={() => place(selected, { to: 'new' })}>새 조합</button>
            {selHand.length === selected.length ? <button onClick={() => place(selected, { to: 'group' })}>묶음으로</button>
              : <button disabled={!returnable.length} onClick={() => place(returnable, { to: 'hand' })} title={lockedSel ? '원래 테이블에 있던 타일은 손패로 가져올 수 없어요' : ''}>손패로{returnable.length && lockedSel ? ` (${returnable.length}장)` : ''}</button>}
            {one && one.i > 0 && <button onClick={() => splitAt(one.meldId, one.i)}>✂ 앞</button>}
            {one && one.i < one.n - 1 && <button onClick={() => splitAt(one.meldId, one.i + 1)}>✂ 뒤</button>}
            <button aria-pressed={rangeMode} className={rangeMode ? 'on' : ''} onClick={() => setRangeMode(r => !r)}>범위</button>
            {meldsTouched.length > 0 && !editId && <button onClick={() => openEdit(meldsTouched[0]!)}>⤢ 확대</button>}
            {swapCand && <button onClick={doSwap}>조커 교체</button>}
            {editId && <button onClick={closeEdit}>완료</button>}
            <button onClick={() => { setSelected([]); setRangeMode(false); }} aria-label="선택 해제">✕</button>
          </> : <>
            <p className="say" aria-live="polite">{editId ? (info.get(editId)?.ok ? `✓ 유효한 조합 · 합계 ${info.get(editId)?.sum} · 타일 사이 ✂를 탭하면 나뉘어요` : `⚠ ${info.get(editId)?.why ?? ''}`) : hint}</p>
            {editId && <button className="primary" onClick={closeEdit}>완료</button>}
            {myTurn && changed && badIds.length > 0 && <button className="warn" onClick={jumpBad}>⚠ 문제 {badIds.length} ▸</button>}
          </>}
        </div>

        {selected.length > 0 && !editId && <p className="selhint">{selHand.length === selected.length ? '조합의 타일을 탭하면 그 옆에 놓여요 · 길게 눌러 끌어도 돼요' : '다른 조합의 타일을 탭하면 그 옆으로 옮겨져요'}</p>}
        <div className="fctl" role="group" aria-label="테이블 보기">
          <button className="fbtn" onClick={() => zoomAt(1 / 1.3)} aria-label="축소">－</button>
          <button className="fbtn" onClick={() => zoomAt(1.3)} aria-label="확대">＋</button>
          <button className="fbtn txt" onClick={() => setMode(viewMode === 'all' ? 'read' : 'all')} aria-pressed={viewMode === 'all'} title="전체 보기 / 읽기 좋은 크기">{viewMode === 'all' ? '읽기' : '전체'}</button>
          {myTurn && <button className={`fbtn txt ${splitMode ? 'on' : ''}`} aria-pressed={splitMode} onClick={() => { setSplitMode(s => !s); setSelected([]); }} title="조합 나누기">✂ 분할</button>}
        </div>

        {overflow && fs.w > 0 && (
          <div className="minimap" style={{ width: world.w * mmS, height: world.h * mmS }} aria-hidden="true"
            onPointerDown={e => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(), c = camRef.current; setCamManual({ ...c, x: fs.w / 2 - ((e.clientX - r.left) / mmS) * c.z, y: fs.h / 2 - ((e.clientY - r.top) / mmS) * c.z }); }}
            onPointerMove={e => { if (e.buttons !== 1) return; const r = e.currentTarget.getBoundingClientRect(), c = camRef.current; setCamManual({ ...c, x: fs.w / 2 - ((e.clientX - r.left) / mmS) * c.z, y: fs.h / 2 - ((e.clientY - r.top) / mmS) * c.z }); }}>
            {rects.map(r => <i key={r.id} className={r.ok ? 'ok' : 'bad'} style={{ left: r.x * mmS, top: r.y * mmS, width: Math.max(3, r.w * mmS), height: Math.max(3, r.h * mmS) }} />)}
            <b style={{ left: (-cam.x / cam.z) * mmS, top: (-cam.y / cam.z) * mmS, width: (fs.w / cam.z) * mmS, height: (fs.h / cam.z) * mmS }} />
          </div>
        )}

      </section>

      <section className={`grack ${drag?.over === 'hand' ? 'over' : ''}`} data-drop="hand">
        <div className="rhead">
          <span className="rcount">손패 <b>{draft.hand.length}</b>장{newIds.size > 0 && <em className="newbadge">NEW {newIds.size}</em>}</span>
          {myTurn && (drag || selHand.length > 0) && <button data-drop="group" className={`gnew ${drag?.over === 'group' ? 'over' : ''}`} onClick={() => place(selHand, { to: 'group' })}>＋ 새 묶음</button>}
          {myTurn && !selected.length && suggestions.length > 0 && <div className="sugg"><span>추천</span>{suggestions.map(s => <button key={s.id} className="sg" onClick={() => placeMeld(s)} aria-label="이 조합 놓기">{tilesOf(s).map(t => <TileView key={t.id} tile={t} passive />)}</button>)}</div>}
        </div>
        <div className={`hwrap ${handMore.up ? 'mu' : ''} ${handMore.down ? 'md' : ''}`}>
          <div ref={handRef} className="ghand" style={{ ['--tw' as string]: `${htw}px` }} onPointerDown={onDown('hand')} onKeyDown={keyToggle}>
            {groups.map(g => {
              const r = g.length >= 3 ? validateMeld(g, allow, `auto-${g[0]!.id}`) : null, nd = needsOf(g);
              return (
                <div key={g[0]!.id} className={`grp ${r?.ok ? 'ok' : ''}`}>
                  <div className="gt">{g.map(t => <TileView key={t.id} tile={t} isNew={newIds.has(t.id)} selected={selSet.has(t.id)} ghosted={!!drag?.ids.includes(t.id)} ins={insOf(t.id)} />)}</div>
                  {r?.ok && myTurn ? <button className="gplay" onClick={() => placeMeld(r.meld)}>▶ 내기 {g.reduce((a, t) => a + (isNum(t) ? t.value : 0), 0)}</button> : nd.length > 0 && <small className="need">필요 {nd.map(x => <b key={x.color + x.value} className={`${x.color} ${copies(x.color, x.value) >= 2 ? 'dead' : ''}`}>{SUIT[x.color]}{x.value}</b>)}</small>}
                </div>);
            })}
          </div>
        </div>
      </section>

      <aside className="gside">
        {changed
          ? <button className="primary go" disabled={!canCommit} onClick={commit}>{canCommit ? '확정' : placedTiles.length && !initialReady ? `${placedPoints}/${view.config.initialMeldMin}점` : '확인 필요'}</button>
          : <button className={`primary go ${drawArm ? 'arm' : ''}`} disabled={!myTurn} onClick={() => { if (!drawArm) { setDrawArm(true); setTimeout(() => setDrawArm(false), 2500); webPlatform.haptics.tick(); } else { setDrawArm(false); send('turn:draw'); } }}>{drawArm ? '한 번 더!' : '뽑기'}<small>{drawArm ? '눌러서 뽑기' : `남은 ${view.poolCount}`}</small></button>}
        <div className="urow">
          <button disabled={!myTurn || !past.length} onClick={undo} aria-label="되돌리기">↶<small>{past.length || ''}</small></button>
          <button disabled={!myTurn || !future.length} onClick={redo} aria-label="다시 실행">↷<small>{future.length || ''}</small></button>
        </div>
        <button disabled={!myTurn || !changed} onClick={reset}>처음으로</button>
        <button className="sortbtn" onClick={cycleSort} aria-label={`손패 정렬: 지금 ${sortLabel}`}>정렬 <b>{sortLabel}</b></button>
        {needInitial && <span className={`meter ${initialReady ? 'done' : ''}`}><i style={{ width: `${Math.min(100, placedPoints / view.config.initialMeldMin * 100)}%` }} />첫 등록 {placedPoints}/{view.config.initialMeldMin}</span>}
      </aside>

      {drag && <div className="ghost" style={{ left: drag.x, top: drag.y, ['--tw' as string]: '40px' }}>{drag.ids.slice(0, 4).map((id, k) => { const t = resolve(id); return t ? <div key={id} style={{ transform: `translate(${k * 10}px,${k * -4}px) rotate(${k * 3}deg)` }}><TileView tile={t} passive /></div> : null; })}{drag.ids.length > 1 && <em>{drag.ids.length}</em>}<span className="dlabel">{dropLabel}</span></div>}
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}
