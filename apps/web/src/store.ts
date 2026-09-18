import { create } from 'zustand';
import type { ClientGameState } from '@werewolf/shared';
interface Store { game: ClientGameState | null; tts: boolean; help: boolean; error: string | null; setGame: (game: ClientGameState | null) => void; setTts: (tts: boolean) => void; setHelp: (help: boolean) => void; setError: (error: string | null) => void; }
export const useGame = create<Store>((set) => ({ game: null, tts: localStorage.getItem('tts') !== 'off', help: false, error: null, setGame: (game) => set({ game }), setTts: (tts) => { localStorage.setItem('tts', tts ? 'on' : 'off'); set({ tts }); }, setHelp: (help) => set({ help }), setError: (error) => set({ error }) }));
