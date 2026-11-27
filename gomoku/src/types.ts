import type { Game } from "../shared/types";
export interface Seat {
  id: string;
  name: string;
  connected: boolean;
  bot: boolean;
  rematch: boolean;
}
export interface RoomView {
  code: string;
  self: string;
  seats: Seat[];
  game: Game | null;
}
