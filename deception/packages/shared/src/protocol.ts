import type { GameView, Settings } from "./types.js";
export interface LobbyMember {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
  ready: boolean;
  isBot?: boolean;
}
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  at: number;
  channel: "public" | "criminals";
}
export interface RoomView {
  code: string;
  hostId: string;
  selfId: string;
  members: LobbyMember[];
  settings: Settings;
  forensicChoice: string | null;
  game: GameView | null;
  chat: ChatMessage[];
  serverNow: number;
  pausedAt: number | null;
  abortAvailableAt: number | null;
}
export interface Session {
  code: string;
  playerId: string;
  token: string;
}
export interface VoiceAdapter {
  connect(roomCode: string): Promise<void>;
  disconnect(): Promise<void>;
  setMuted(muted: boolean): void;
}
