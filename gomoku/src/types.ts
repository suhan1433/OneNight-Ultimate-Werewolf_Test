import type { GameView } from "../shared/types";
export interface Seat {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  bot: boolean;
}
export interface RoomView {
  code: string;
  host: string;
  self: string;
  public: boolean;
  tutorial: boolean;
  serverTime: number;
  seats: Seat[];
  game: GameView | null;
  chat: { id: string; name: string; text: string; at: number }[];
}
export interface RoomListing {
  code: string;
  hostName: string;
  count: number;
}
