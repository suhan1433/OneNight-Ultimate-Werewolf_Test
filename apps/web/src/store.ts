import { create } from 'zustand';
import type { ChatMessage, ClientGameState } from '@werewolf/shared';
type ChatScope = 'day' | 'lobby';
interface Store { game: ClientGameState | null; tts: boolean; help: boolean; error: string | null; setGame: (game: ClientGameState | null) => void; setChatHistory: (messages: ChatMessage[]) => void; setLobbyChatHistory: (messages: ChatMessage[]) => void; addChat: (message: ChatMessage, scope: ChatScope) => void; removeChat: (id: string, scope: ChatScope) => void; toggleReady: () => void; confirmVote: () => void; rollback: (game: ClientGameState) => void; setTts: (tts: boolean) => void; setHelp: (help: boolean) => void; setError: (error: string | null) => void; }
export const useGame = create<Store>((set) => ({ game: null, tts: localStorage.getItem('tts') !== 'off', help: false, error: null, setGame: (game) => set((state) => {
  // A chat event can arrive just before an older state snapshot from another
  // Function instance. Preserve only same-day messages that snapshot lacks.
  if (!game || !state.game || game.roomCode !== state.game.roomCode) return { game };
  if (game.stateVersion < state.game.stateVersion) return state;
  if (game.stateVersion === state.game.stateVersion) return state;
  if (game.phase === 'day' && state.game.phase === 'day') {
    const chat = [...game.chat, ...state.game.chat.filter((message) => !game.chat.some((current) => current.id === message.id))].slice(-100);
    return { game: { ...game, chat } };
  }
  if (game.phase === 'lobby' && state.game.phase === 'lobby') {
    const lobbyChat = [...game.lobbyChat, ...state.game.lobbyChat.filter((message) => !game.lobbyChat.some((current) => current.id === message.id))].slice(-100);
    return { game: { ...game, lobbyChat } };
  }
  return { game };
}), setChatHistory: (messages) => set((state) => !state.game || state.game.phase !== 'day' ? state : ({ game: { ...state.game, chat: messages.slice(-100) } })), setLobbyChatHistory: (messages) => set((state) => !state.game || state.game.phase !== 'lobby' ? state : ({ game: { ...state.game, lobbyChat: messages.slice(-100) } })), addChat: (message, scope) => set((state) => {
  if (!state.game || state.game.phase !== scope || (scope === 'day' ? state.game.chat : state.game.lobbyChat).some((current) => current.id === message.id)) return state;
  return scope === 'day'
    ? { game: { ...state.game, chat: [...state.game.chat, message].slice(-100) } }
    : { game: { ...state.game, lobbyChat: [...state.game.lobbyChat, message].slice(-100) } };
}), removeChat: (id, scope) => set((state) => !state.game ? state : (scope === 'day'
  ? { game: { ...state.game, chat: state.game.chat.filter((message) => message.id !== id) } }
  : { game: { ...state.game, lobbyChat: state.game.lobbyChat.filter((message) => message.id !== id) } })), toggleReady: () => set((state) => !state.game ? state : ({ game: { ...state.game, players: state.game.players.map((p) => p.id === state.game!.playerId ? { ...p, isReady: !p.isReady } : p) } })), confirmVote: () => set((state) => !state.game ? state : ({ game: { ...state.game, players: state.game.players.map((p) => p.id === state.game!.playerId ? { ...p, hasVoted: true } : p), votesCompleted: state.game.votesCompleted + 1 } })), rollback: (game) => set({ game }), setTts: (tts) => { localStorage.setItem('tts', tts ? 'on' : 'off'); set({ tts }); }, setHelp: (help) => set({ help }), setError: (error) => set({ error }) }));
