import { create } from "zustand";
import { io } from "socket.io-client";
import type { Action, RoomView, Session } from "@deception/shared";
const SESSION_KEY = "neon.session.v1";
export const socket = io(
  import.meta.env.VITE_SERVER_URL || window.location.origin,
  {
    autoConnect: false,
    reconnection: true,
    path: import.meta.env.VITE_SOCKET_PATH ||
      (import.meta.env.BASE_URL === "/deception/" ? "/api/deception/socket/" : "/socket.io"),
  },
);
export const useRoom = create<{
  room: RoomView | null;
  connected: boolean;
  error: string | null;
  offset: number;
  setError: (error: string | null) => void;
}>((set) => ({
  room: null,
  connected: false,
  error: null,
  offset: 0,
  setError: (error) => set({ error }),
}));
export function request<T = void>(
  event: string,
  payload: unknown = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) {
      const e = "서버 연결을 확인해 주세요.";
      useRoom.setState({ error: e });
      reject(new Error(e));
      return;
    }
    socket
      .timeout(8_000)
      .emit(
        event,
        payload,
        (
          error: Error | null,
          reply: { ok: boolean; data: T; error?: string },
        ) => {
          if (error || !reply?.ok) {
            const message = error
              ? "응답을 기다리는 중입니다. 연결을 확인해 주세요."
              : reply.error || "요청을 처리할 수 없습니다.";
            useRoom.setState({ error: message });
            reject(new Error(message));
          } else resolve(reply.data);
        },
      );
  });
}
export async function enter(event: "create" | "join", payload: unknown) {
  const session = await request<Session>(event, payload);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.removeItem("neon.notes.v1");
}
export async function leave() {
  await request("leave");
  localStorage.removeItem(SESSION_KEY);
  useRoom.setState({ room: null });
}
export function command(action: Action) {
  return request("command", {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    action,
  });
}
export function run(promise: Promise<unknown>): void {
  void promise.catch(() => {});
}
socket.on("state", (room: RoomView) =>
  useRoom.setState({ room, offset: room.serverNow - Date.now() }),
);
socket.on("connect", () => {
  useRoom.setState({ connected: true });
  let saved: Session | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    localStorage.removeItem(SESSION_KEY);
  }
  if (saved)
    void request("resume", saved).catch(() => {
      localStorage.removeItem(SESSION_KEY);
      useRoom.setState({ room: null });
    });
});
socket.on("disconnect", () => useRoom.setState({ connected: false }));
socket.on("connect_error", () => useRoom.setState({ connected: false }));
for (const event of ["kicked", "replaced"])
  socket.on(event, ({ message }: { message: string }) => {
    localStorage.removeItem(SESSION_KEY);
    useRoom.setState({ room: null, error: message });
  });
socket.connect();
