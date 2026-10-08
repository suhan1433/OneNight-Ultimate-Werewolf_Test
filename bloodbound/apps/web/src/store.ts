import { create } from 'zustand';
import type { ClientGameState } from '@bloodbound/shared';

type Link = 'connecting' | 'online' | 'offline';

type Store = {
  game: ClientGameState | null;
  error: string | null;
  /** 소켓 연결 상태. 끊김 배너와 버튼 비활성화에 사용 */
  link: Link;
  /** 저장된 세션으로 방에 돌아가는 중인지. 홈 화면 깜빡임 방지 */
  restoring: boolean;
  setGame: (game: ClientGameState) => void;
  setError: (error: string | null) => void;
  setLink: (link: Link) => void;
  setRestoring: (restoring: boolean) => void;
};

const hasSavedSession = () => {
  try {
    return localStorage.getItem('bloodbound-session') !== null;
  } catch {
    return false;
  }
};

export const useGame = create<Store>(set => ({
  game: null,
  error: null,
  link: 'connecting',
  restoring: hasSavedSession(),
  setGame: game => set({ game, error: null, restoring: false }),
  setError: error => set({ error }),
  setLink: link => set({ link }),
  setRestoring: restoring => set({ restoring }),
}));
