import { useEffect, useMemo, useRef, useState } from 'react';
import type { Meld, Tile } from '@rummikub/rules';
import { validateMeld } from '@rummikub/rules';
import type { PublicView } from '@rummikub/protocol';
import { webPlatform } from '@rummikub/platform';
import { emit } from './socket.js';
import { sfx } from './sound.js';
import { COLORS, Ring, SortMode, SoundToggle, TileView, isNum, smartSort, sortByColor, sortByNumber, suggestedMelds } from './tiles.js';
import { Ctx, Dest, Draft, Result, mergeHandOrder, moveTiles, signature, swapJoker, whyInvalid } from './editor.js';

export type GameApi = { online: boolean; notice: string; setNotice: (s: string) => void; next: () => number };
type Drop = { kind: 'none' | 'new' | 'rack' | 'meld'; meldId?: string; tid?: number; after?: boolean };
type Drag = { ids: number[]; x: number; y: number; drop: Drop };

/**
 * 보드 v3 — "잡아서 끌어 놓는다"가 전부인 구조.
 * 카메라/줌/미니맵/편집 시트/분할 모드를 없애고, 테이블은 일반 스크롤, 타일은 고정 크기로 둔다.
 * 끌기: 조합 위=그 위치에 삽입 · 테이블 빈 곳=새 조합 · 손패 위=손패로. 탭=선택(여러 장 이동 가능).
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
  const [now, setNow] = useState(Date.now());
  const [flash, setFlash] = useState<Set<number>>(new Set());
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const [banner, setBanner] = useState(false);
  const [drawArm, setDrawArm] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('smart');
  const order = useRef<number[]>([]);
  const seenTable = useRef<Set<number> | null>(null);
  const justCommitted = useRef(false);
  const feltRef = useRef<HTMLElement | null>(null);
  const gest = useRef<{ id: number; sx: number; sy: number; started: boolean; pid: number } | null>(null);
  const A = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void }>({ move: () => {}, up: () => {} });

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
  const origIds = useMemo(() => new Set(view.table.flatMap(m => m.tiles.map(e => e.tileId))), [view.table]);
  const ctx: Ctx = { tile: resolve, orig: origIds, fix: rebuild, newId: () => `draft-${crypto.randomUUID()}` };

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
    if (!myTurn || !ids.length) return;
    const reorder = dest.to === 'hand' && ids.every(id => handSet.has(id));
    if (!apply(moveTiles(draft, ids, dest, ctx), !reorder)) return;
    if (dest.to === 'hand') { setBreaks(new Set()); setSortMode('custom'); sfx.pick(); } else sfx.clack();
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
  const commit = () => { justCommitted.current = true; return emit('turn:commit', { roomId: view.roomId, version: view.version, table: draft.table, hand: draft.hand.map(t => t.id), clientSeq: game.next() }).then(() => { webPlatform.haptics.success(); sfx.chime(); }).catch((e: Error) => { justCommitted.current = false; game.setNotice(e.message); }); };
  const onDraw = () => { if (!drawArm) { setDrawArm(true); setTimeout(() => setDrawArm(false), 2500); webPlatform.haptics.tick(); } else { setDrawArm(false); send('turn:draw'); } };

  // 끌기: 포인터 위치 아래의 요소로 놓을 곳을 판정한다
  const probe = (x: number, y: number): Drop => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const tile = el?.closest<HTMLElement>('[data-tid]'), meld = el?.closest<HTMLElement>('[data-m]');
    let tid: number | undefined, after = false;
    if (tile) { const r = tile.getBoundingClientRect(); tid = Number(tile.dataset.tid); after = x > r.left + r.width / 2; }
    if (meld) return { kind: 'meld', meldId: meld.dataset.m!, tid, after };
    if (el?.closest('[data-rack]')) return { kind: 'rack', tid, after };
    if (el?.closest('[data-felt]')) return { kind: 'new' };
    return { kind: 'none' };
  };
  const dropTo = (ids: number[], d: Drop) => {
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

  const onDown = (e: React.PointerEvent) => {
    if (e.button > 0 || !myTurn) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]'); if (!t) return;
    gest.current = { id: Number(t.dataset.t), sx: e.clientX, sy: e.clientY, started: false, pid: e.pointerId };
  };
  A.current.move = (e: PointerEvent) => {
    const g = gest.current; if (!g || g.pid !== e.pointerId) return;
    if (!g.started) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < (e.pointerType === 'mouse' ? 5 : 8)) return;
      g.started = true; sfx.pick(); webPlatform.haptics.tick();
      setDrag({ ids: selSet.has(g.id) ? selected : [g.id], x: e.clientX, y: e.clientY, drop: probe(e.clientX, e.clientY) }); return;
    }
    const f = feltRef.current?.getBoundingClientRect(); // 테이블 가장자리로 끌면 자동 스크롤
    if (f && feltRef.current && e.clientX > f.left && e.clientX < f.right) { if (e.clientY < f.top + 44) feltRef.current.scrollTop -= 12; else if (e.clientY > f.bottom - 44 && e.clientY < f.bottom + 20) feltRef.current.scrollTop += 12; }
    setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY, drop: probe(e.clientX, e.clientY) } : d));
  };
  A.current.up = (e: PointerEvent) => {
    const g = gest.current; if (!g || g.pid !== e.pointerId) return; gest.current = null;
    if (!g.started) { if (e.type !== 'pointercancel') toggle(g.id); return; }
    const d = drag; setDrag(null);
    if (d && e.type !== 'pointercancel') dropTo(d.ids, probe(e.clientX, e.clientY));
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

  const hint = !myTurn ? (view.message || `${current?.name ?? ''}님 차례예요`)
    : selected.length ? `${selected.length}장 선택 · 조합 위에 끌어 놓거나 아래 버튼을 누르세요`
    : changed ? (canCommit ? '좋아요! ✓ 확정을 누르세요' : placed.length === 0 ? '손패 타일을 1장 이상 내야 해요' : !initialReady ? `첫 등록 ${placedPoints}/${view.config.initialMeldMin}점` : badIds.length ? (info.get(badIds[0]!)?.why ?? '고쳐야 할 조합이 있어요') : '확인이 필요해요')
    : needInitial ? `첫 등록 ${view.config.initialMeldMin}점 이상 · 타일을 테이블로 끌어 놓으세요` : '타일을 테이블로 끌어 놓거나, 낼 게 없으면 뽑기';
  const insOf = (id: number) => (drag && drag.drop.tid === id && (drag.drop.kind === 'meld' || drag.drop.kind === 'rack') ? (drag.drop.after ? 'a' : 'b') : null);
  const sortLabel = { smart: '조합순', num: '숫자순', color: '색상순', custom: '내 배열' }[sortMode];
  const tv = (t: Tile, extra: Partial<React.ComponentProps<typeof TileView>> = {}) => <TileView key={t.id} tile={t} selected={selSet.has(t.id)} ghosted={!!drag?.ids.includes(t.id)} ins={insOf(t.id)} {...extra} />;

  return (
    <main className={`bd ${myTurn ? 'mine' : ''} ${drag ? 'dragging' : ''} ${myTurn && remaining <= 10 ? 'urgent' : ''}`} onContextMenu={e => e.preventDefault()} onPointerDown={onDown}>
      {banner && <div className="banner" aria-hidden="true">내 차례!</div>}
      <header className="bd-top">
        <div className="chips">{opps.map(p => <OppChip key={p.id} p={p} active={view.turn?.playerId === p.id} remaining={remaining} pct={pct} />)}</div>
        {!game.online && <span className="offline">연결 끊김</span>}
        <div className={`mytimer ${myTurn ? 'on' : ''} ${myTurn && remaining <= 10 ? 'danger' : ''}`}>{myTurn ? `내 차례 ${remaining}` : `${current?.name ?? ''} ${remaining}`}</div>
        <SoundToggle />
        <button className="exit compact" onClick={onExit}>나가기</button>
      </header>

      <p className={`bd-say ${canCommit ? 'good' : ''}`} aria-live="polite">{hint}</p>

      <section ref={feltRef} className={`bd-felt ${drag?.drop.kind === 'new' ? 'over' : ''}`} data-felt aria-label="테이블">
        <div className="bd-melds">
          {draft.table.map(m => { const i = info.get(m.id); return (
            <div key={m.id} data-m={m.id} className={`bm ${i?.ok ? 'ok' : 'bad'} ${drag?.drop.kind === 'meld' && drag.drop.meldId === m.id ? 'over' : ''}`}
              onClick={() => { if (myTurn && selected.length) place(selected, { to: 'meld', meldId: m.id }); }}>
              {m.tiles.map(e => { const t = resolve(e.tileId); return t ? tv(t, { repC: !isNum(t) ? e.represents?.color : undefined, repV: !isNum(t) ? e.represents?.value : undefined, fresh: !origIds.has(t.id), flash: flash.has(t.id) }) : null; })}
              <i className="bm-badge">{i?.ok ? `✓ ${i.sum}` : '⚠'}</i>
            </div>); })}
          {myTurn && <button className={`bd-new ${drag?.drop.kind === 'new' ? 'over' : ''}`} onClick={() => selected.length && place(selected, { to: 'new' })}>＋<small>새 조합</small></button>}
        </div>
        {draft.table.length === 0 && !myTurn && <p className="bd-empty">테이블이 비어 있어요</p>}
      </section>

      {selected.length > 0 && myTurn && (
        <div className="bd-sel" role="toolbar" aria-label="선택한 타일">
          <b>{selected.length}장</b>
          <button className="primary" onClick={() => place(selected, { to: 'new' })}>새 조합</button>
          <button disabled={!returnable.length && selHand.length !== selected.length} onClick={() => place(selHand.length === selected.length ? selected : returnable, { to: 'hand' })}>손패로</button>
          <button onClick={() => setSelected([])} aria-label="선택 해제">✕</button>
        </div>)}

      <section className={`bd-rack ${drag?.drop.kind === 'rack' ? 'over' : ''}`} data-rack aria-label="내 손패">
        <div className="bd-rhead">
          <span>손패 <b>{draft.hand.length}</b>{newIds.size > 0 && <em className="newbadge">NEW {newIds.size}</em>}</span>
          {needInitial && <span className={`meter ${initialReady ? 'done' : ''}`}><i style={{ width: `${Math.min(100, (placedPoints / view.config.initialMeldMin) * 100)}%` }} />첫 등록 {placedPoints}/{view.config.initialMeldMin}</span>}
          {myTurn && !selected.length && suggestions[0] && <button className="bd-sug" onClick={() => placeMeld(suggestions[0]!)} aria-label="추천 조합 내기">💡 추천 {suggestions.length}</button>}
          <button className="bd-sort" onClick={cycleSort} aria-label={`손패 정렬: 지금 ${sortLabel}`}>정렬 · {sortLabel}</button>
        </div>
        <div className="bd-hand">
          {draft.hand.map(t => <span className="hs" key={t.id}>{breaks.has(t.id) && <i className="brk" />}{tv(t, { isNew: newIds.has(t.id) })}</span>)}
        </div>
      </section>

      <aside className="bd-act">
        {changed
          ? <button className={`primary go ${canCommit ? 'ready' : ''}`} disabled={!canCommit} onClick={commit}>{canCommit ? '✓ 확정' : placed.length && !initialReady ? `${placedPoints}/${view.config.initialMeldMin}점` : '확인 필요'}</button>
          : <button className={`primary go ${drawArm ? 'arm' : ''}`} disabled={!myTurn} onClick={onDraw}>{drawArm ? '한 번 더!' : '뽑기'}<small>{drawArm ? '눌러서 뽑기' : `남은 ${view.poolCount}`}</small></button>}
        <div className="urow">
          <button disabled={!myTurn || !past.length} onClick={undo} aria-label="되돌리기">↶</button>
          <button disabled={!myTurn || !future.length} onClick={redo} aria-label="다시 실행">↷</button>
          <button disabled={!myTurn || !changed} onClick={reset} aria-label="처음 상태로">⟲</button>
        </div>
      </aside>

      {drag && <div className="ghost" style={{ left: drag.x, top: Math.max(28, drag.y - 56), ['--tw' as string]: '44px' }}>{drag.ids.slice(0, 4).map((id, k) => { const t = resolve(id); return t ? <div key={id} style={{ transform: `translate(${k * 10}px,${k * -4}px) rotate(${k * 3}deg)` }}><TileView tile={t} passive /></div> : null; })}{drag.ids.length > 1 && <em>{drag.ids.length}</em>}</div>}
      {game.notice && <p className="toast" role="alert">{game.notice}</p>}
    </main>
  );
}
