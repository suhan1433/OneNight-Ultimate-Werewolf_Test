/**
 * 자동 가로 모드 — 폰의 "자동 회전"이 잠겨 있어도 보드는 항상 가로로 놓인다.
 *
 * 브라우저는 사용자의 회전 잠금을 무시하고 방향을 강제할 수 없다(Screen Orientation lock은 전체 화면/PWA에서만 동작).
 * 그래서 세로 화면이면 보드 전체를 CSS로 90° 돌려서 그린다. 이때 손가락 좌표(client)와 레이아웃 좌표(local)가
 * 어긋나므로, 보드는 항상 local 좌표로만 계산하고 이 모듈의 변환 함수를 거친다.
 *
 *   dir =  1 : 보드의 위쪽이 화면 오른쪽 (폰을 시계 반대 방향으로 눕혔을 때 바르게 보인다)
 *   dir = -1 : 보드의 위쪽이 화면 왼쪽  (시계 방향으로 눕혔을 때)
 */
import { useCallback, useEffect, useState } from 'react';

export type Frame = { rot: boolean; dir: 1 | -1; vw: number; vh: number };
export type LRect = { x: number; y: number; w: number; h: number };

/** 스테이지(보드) 요소의 화면상 바운딩 박스 s 기준으로 client → local */
export function toLocalPoint(s: DOMRect, f: Pick<Frame, 'rot' | 'dir'>, x: number, y: number) {
  if (!f.rot) return { x: x - s.left, y: y - s.top };
  return f.dir === 1 ? { x: y - s.top, y: s.right - x } : { x: s.bottom - y, y: x - s.left };
}
export function toClientPoint(s: DOMRect, f: Pick<Frame, 'rot' | 'dir'>, lx: number, ly: number) {
  if (!f.rot) return { x: s.left + lx, y: s.top + ly };
  return f.dir === 1 ? { x: s.right - ly, y: s.top + lx } : { x: s.left + ly, y: s.bottom - lx };
}
/** 화면상 사각형(바운딩 박스) → local 사각형. 돌려진 화면에서는 가로세로가 바뀐다. */
export function toLocalRect(s: DOMRect, f: Pick<Frame, 'rot' | 'dir'>, r: DOMRect): DOMRect {
  if (!f.rot) return new DOMRect(r.left - s.left, r.top - s.top, r.width, r.height);
  return f.dir === 1
    ? new DOMRect(r.top - s.top, s.right - r.right, r.height, r.width)
    : new DOMRect(s.bottom - r.bottom, r.left - s.left, r.height, r.width);
}

const KEY = 'rk-dir';
const readDir = (): 1 | -1 => { try { return localStorage.getItem(KEY) === '-1' ? -1 : 1; } catch { return 1; } };
const isCoarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const viewport = () => ({ vw: Math.round(window.visualViewport?.width ?? window.innerWidth), vh: Math.round(window.visualViewport?.height ?? window.innerHeight) });

let pointerDown = false;

export function useFrame(): { frame: Frame; flip: () => void } {
  const [vp, setVp] = useState(viewport);
  const [dir, setDir] = useState<1 | -1>(readDir);
  const [manual, setManual] = useState(false);
  const rot = isCoarse() && vp.vh > vp.vw;

  useEffect(() => {
    const on = () => setVp(v => { const n = viewport(); return v.vw === n.vw && v.vh === n.vh ? v : n; });
    window.addEventListener('resize', on); window.addEventListener('orientationchange', on);
    window.visualViewport?.addEventListener('resize', on);
    const down = () => { pointerDown = true; }, up = () => { pointerDown = false; };
    window.addEventListener('pointerdown', down, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    // 지원하는 환경(전체 화면/설치형 앱)에서는 진짜 가로 고정을 먼저 시도한다. 성공하면 rot은 자연스럽게 꺼진다.
    try { void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape').catch(() => {}); } catch { /* 미지원 */ }
    return () => {
      window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); window.visualViewport?.removeEventListener('resize', on);
      window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
    };
  }, []);

  // 폰을 어느 쪽으로 눕혔는지 중력 센서로 알아내 보드가 항상 바로 서게 한다(권한 팝업이 필요한 iOS는 제외 → 수동 뒤집기).
  useEffect(() => {
    if (!rot || manual) return;
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent;
    if (!DOE || typeof DOE.requestPermission === 'function') return;
    const on = (e: DeviceOrientationEvent) => {
      const g = e.gamma; if (g == null || pointerDown) return;
      if (g < -55) setDir(1); else if (g > 55) setDir(-1);
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [rot, manual]);

  const flip = useCallback(() => {
    setManual(true);
    setDir(d => { const n = (d === 1 ? -1 : 1) as 1 | -1; try { localStorage.setItem(KEY, String(n)); } catch { /* 무시 */ } return n; });
  }, []);
  return { frame: { rot, dir, vw: vp.vw, vh: vp.vh }, flip };
}
