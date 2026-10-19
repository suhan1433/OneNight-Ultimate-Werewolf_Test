import { useLayoutEffect, useRef } from 'react';
import type { DependencyList, RefObject } from 'react';

const EASE = 'cubic-bezier(.22,.78,.24,1)';
type TileFrame = { rect: DOMRect; face: HTMLElement; width: string; height: string };
type Snapshot = { tiles: Map<number, TileFrame>; melds: Map<string, DOMRect>; draw?: DOMRect };
type Flight = { node: HTMLElement; target: HTMLElement; opacity: string; animation: Animation };
const empty = (): Snapshot => ({ tiles: new Map(), melds: new Map() });

/** Flights live above scroll containers, so rack ↔ table moves never get clipped. */
export function useTileMotion(root: RefObject<HTMLElement>, layoutKeys: DependencyList) {
  const baseline = useRef<Snapshot>(empty());
  const pending = useRef<Snapshot | null>(null);
  const keys = useRef<DependencyList>([]);
  const mode = useRef<'move' | 'sort'>('move');
  const flights = useRef(new Map<number, Flight>());
  const meldAnimations = useRef(new Set<Animation>());
  const layer = useRef<HTMLDivElement | null>(null);

  const measure = (includeGhost: boolean): Snapshot => {
    const result = empty();
    root.current?.querySelectorAll<HTMLElement>('[data-tid]').forEach(wrapper => {
      if (!includeGhost && wrapper.closest('.ghost')) return;
      const tile = wrapper.querySelector<HTMLElement>('.tile'); if (!tile) return;
      const style = getComputedStyle(tile);
      result.tiles.set(Number(wrapper.dataset.tid), {
        rect: tile.getBoundingClientRect(), face: tile.cloneNode(true) as HTMLElement,
        width: style.width, height: style.height,
      });
    });
    root.current?.querySelectorAll<HTMLElement>('[data-m]').forEach(meld => {
      result.melds.set(meld.dataset.m!, meld.getBoundingClientRect());
    });
    result.draw = root.current?.querySelector('.bd-act .go')?.getBoundingClientRect();
    return result;
  };
  const capture = (kind: 'move' | 'sort' = 'move') => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const snapshot = measure(true);
    // A second action can interrupt a flight: continue from its visible position.
    flights.current.forEach((flight, id) => {
      const tile = snapshot.tiles.get(id);
      if (tile && !root.current?.querySelector(`.ghost [data-tid="${id}"]`)) tile.rect = flight.node.getBoundingClientRect();
    });
    pending.current = snapshot; mode.current = kind;
  };
  const clearFlight = (id: number, flight: Flight) => {
    flight.target.style.opacity = flight.opacity;
    flight.node.remove(); flight.animation.cancel();
    if (flights.current.get(id) === flight) flights.current.delete(id);
  };

  useLayoutEffect(() => {
    const changed = layoutKeys.length !== keys.current.length || layoutKeys.some((key, i) => !Object.is(key, keys.current[i]));
    keys.current = layoutKeys;
    if (!changed && !pending.current) return;
    if (!root.current) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = pending.current ?? { ...baseline.current, tiles: new Map([...baseline.current.tiles].map(([id, tile]) => [id, { ...tile }])), melds: new Map(baseline.current.melds) };
    if (!pending.current) {
      flights.current.forEach((flight, id) => { const tile = from.tiles.get(id); if (tile) tile.rect = flight.node.getBoundingClientRect(); });
      root.current.querySelectorAll<HTMLElement>('[data-m]').forEach(meld => {
        if (meld.getAnimations().length) from.melds.set(meld.dataset.m!, meld.getBoundingClientRect());
      });
    }
    pending.current = null;
    // Cancel old transforms before reading the new, final layout.
    flights.current.forEach((flight, id) => clearFlight(id, flight));
    meldAnimations.current.forEach(animation => animation.cancel()); meldAnimations.current.clear();
    const next = measure(false);
    baseline.current = next;
    if (reduced || !from.tiles.size) return;
    if (!layer.current) {
      const el = document.createElement('div'); el.className = 'tile-flight-layer';
      el.setAttribute('aria-hidden', 'true'); el.inert = true;
      document.body.append(el); layer.current = el;
    }
    const targets = new Map<number, HTMLElement>();
    root.current.querySelectorAll<HTMLElement>('[data-tid]').forEach(wrapper => {
      if (wrapper.closest('.ghost')) return;
      const tile = wrapper.querySelector<HTMLElement>('.tile');
      if (tile) targets.set(Number(wrapper.dataset.tid), tile);
    });
    let index = 0;
    next.tiles.forEach((tile, id) => {
      const prev = from.tiles.get(id), target = targets.get(id); if (!target) return;
      const b = tile.rect;
      // A newly drawn tile comes from the draw button rather than appearing in place.
      const a = prev?.rect ?? (target.closest('[data-rack]') && from.draw ? new DOMRect(from.draw.x + from.draw.width / 2 - b.width * .35, from.draw.y + from.draw.height / 2 - b.height * .35, b.width * .7, b.height * .7) : null);
      if (!a) return;
      const distance = Math.hypot(a.left - b.left, a.top - b.top);
      if (!a.width || !a.height || !b.width || !b.height || (distance < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1)) return;
      const node = document.createElement('div'); node.className = 'tile-flight';
      Object.assign(node.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
      node.style.setProperty('--tw', tile.width); node.style.setProperty('--th', tile.height);
      const face = tile.face;
      face.classList.remove('selected', 'ghosted', 'pressing', 'flash');
      face.removeAttribute('data-t'); face.removeAttribute('data-s'); face.removeAttribute('style');
      face.setAttribute('tabindex', '-1');
      node.append(face); layer.current!.append(node);
      const opacity = target.style.opacity; target.style.opacity = '0';
      const animation = node.animate([
        { transform: `translate3d(${a.left - b.left}px, ${a.top - b.top}px, 0) scale(${a.width / b.width}, ${a.height / b.height})`, opacity: prev ? 1 : .3 },
        { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
      ], { duration: Math.min(340, 190 + distance * .15), delay: mode.current === 'sort' ? Math.min(index++ * 7, 65) : 0, easing: EASE, fill: 'both' });
      const flight = { node, target, opacity, animation };
      flights.current.set(id, flight);
      animation.onfinish = () => clearFlight(id, flight);
    });
    // Move the tray and grip with their tiles instead of snapping the background.
    root.current.querySelectorAll<HTMLElement>('[data-m]').forEach(meld => {
      const a = from.melds.get(meld.dataset.m!), b = next.melds.get(meld.dataset.m!);
      if (!a || !b || Math.hypot(a.left - b.left, a.top - b.top) < 1) return;
      const animation = meld.animate([{ transform: `translate3d(${a.left - b.left}px,${a.top - b.top}px,0)` }, { transform: 'none' }], { duration: 260, easing: EASE });
      meldAnimations.current.add(animation);
      animation.onfinish = () => meldAnimations.current.delete(animation);
    });
    mode.current = 'move';
  });

  useLayoutEffect(() => () => {
    flights.current.forEach((flight, id) => clearFlight(id, flight));
    meldAnimations.current.forEach(animation => animation.cancel());
    layer.current?.remove();
  }, []);
  return capture;
}
