/**
 * 탁자 카드 배치 설정 (기기에 저장)
 *  - 'stack' : 가운데로 모아 겹쳐 놓기 (기존)
 *  - 'ring'  : 각자 자기 자리 앞에 놓기 (겹침 최소 · 카드 크게)
 */
import { useSyncExternalStore } from 'react';

export type TableLayout = 'stack' | 'ring';
const KEY = 'skullking-table-layout';

const read = (): TableLayout => {
  try { return localStorage.getItem(KEY) === 'ring' ? 'ring' : 'stack'; } catch { return 'stack'; }
};

let current: TableLayout = read();
const subs = new Set<() => void>();

export function setTableLayout(next: TableLayout) {
  if (next === current) return;
  current = next;
  try { localStorage.setItem(KEY, next); } catch { /* 저장 불가 환경은 이번 접속에만 적용 */ }
  subs.forEach(f => f());
}

export function useTableLayout(): TableLayout {
  return useSyncExternalStore(
    f => { subs.add(f); return () => { subs.delete(f); }; },
    () => current,
    () => 'stack' as TableLayout,
  );
}
