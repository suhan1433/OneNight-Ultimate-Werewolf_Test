import { installGameSwitch } from '../../../../game-switch/client';
import { create } from "zustand";
import { io } from "socket.io-client";
import type {
  Action,
  RoomView,
  Ack,
} from "../../../packages/shared-types/src/index";
type Session = { code: string; id: string; token: string };
export function readLocal(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
export const useApp = create<{
  room: RoomView | null;
  error: string | null;
  connected: boolean;
  resuming: boolean;
  busy: boolean;
  setRoom: (room: RoomView | null) => void;
  setError: (error: string | null) => void;
}>((set) => ({
  room: null,
  error: null,
  connected: false,
  resuming: false,
  busy: false,
  setRoom: (room) => set({ room }),
  setError: (error) => set({ error }),
}));
const configured = (import.meta as any).env.VITE_SERVER_URL as
  string | undefined;
export function invitationUrl(code: string): string {
  const url = (window as any).Capacitor && configured
    ? new URL("/secret_hitler/", configured)
    : new URL(location.pathname, location.origin);
  url.searchParams.set("room", code);
  return url.toString();
}
export const socket = io(configured ?? window.location.origin, {
  path: "/secret_hitler/socket.io",
  autoConnect: false,
  transports: ["websocket", "polling"],
});
export function call<T = unknown>(
  event: string,
  data: unknown = {},
): Promise<T> {
  return new Promise((resolve, reject) =>
    socket
      .timeout(10000)
      .emit(event, data, (err: Error | null, result: Ack<T>) => {
        if (err)
          reject(
            Error("@errTimeout"),
          );
        else if (result.ok) resolve(result.data);
        else reject(Error(result.error));
      }),
  );
}
export async function run(event: string, data: unknown = {}) {
  if (!socket.connected || useApp.getState().resuming) {
    useApp.setState({ error: "@errResuming" });
    return;
  }
  if (useApp.getState().busy) return;
  useApp.setState({ busy: true, error: null });
  try {
    await call(event, data);
  } catch (e) {
    useApp.setState({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    useApp.setState({ busy: false });
  }
}
export async function enter(event: "CREATE_ROOM" | "JOIN_ROOM", data: unknown) {
  useApp.setState({ busy: true, error: null });
  try {
    const session = await call<Session>(event, data);
    writeLocal("sh-session", JSON.stringify(session));
  } catch (e) {
    useApp.setState({ error: String((e as Error).message) });
  } finally {
    useApp.setState({ busy: false });
  }
}
export function act(action: Action) {
  const game = useApp.getState().room?.game;
  if (game)
    void run("ACTION", {
      action,
      version: game.version,
      requestId: requestId(),
    });
}
function requestId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function leave() {
  if (!socket.connected) {
    useApp.setState({ error: "@errLeaveOffline" });
    return;
  }
  try {
    await call("LEAVE");
    writeLocal("sh-session", "");
    useApp.setState({ room: null });
  } catch (e) {
    useApp.setState({ error: (e as Error).message });
  }
}
export function connect() {
  socket.on("ROOM_STATE", (room: RoomView) =>
    useApp.setState({ room, resuming: false }),
  );
  socket.on("connect", async () => {
    const raw = readLocal("sh-session", "");
    useApp.setState({ connected: true, resuming: !!raw });
    if (!raw) return;
    try {
      await call("RESUME", JSON.parse(raw));
    } catch (e) {
      writeLocal("sh-session", "");
      useApp.setState({ room: null, error: (e as Error).message });
    } finally {
      useApp.setState({ resuming: false });
    }
  });
  socket.on("disconnect", () => useApp.setState({ connected: false }));
  socket.on("connect_error", () => useApp.setState({ connected: false }));
  socket.on("REMOVED", () => {
    writeLocal("sh-session", "");
    useApp.setState({ room: null, error: "@errRemoved" });
  });
  socket.on("SESSION_REPLACED", () => {
    writeLocal("sh-session", "");
    socket.disconnect();
    useApp.setState({
      room: null,
      error: "@errReplaced",
    });
  });
  socket.connect();
}

installGameSwitch(socket, 'secret_hitler');
