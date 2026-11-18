export type SwitchMember = {
  id: string;
  name?: string;
  nickname?: string;
  socketId?: string | null;
  connected?: boolean;
  isBot?: boolean;
  bot?: boolean;
  spectator?: boolean;
};
export type SwitchSource = { hostId: string; members: SwitchMember[]; actorId: string; reserve?: () => void | Promise<void> };
/** Accepts each standalone workspace's Socket.IO version. */
export function registerGameSwitch(io: unknown, socket: unknown, source: () => SwitchSource | Promise<SwitchSource>): void;
