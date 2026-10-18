export interface PlatformService {
  kind: 'web' | 'ios' | 'android'; storage: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void>; remove(k: string): Promise<void> };
  haptics: { tick(): void; success(): void; warning(): void; error(): void }; share: { inviteRoom(code: string, url: string): Promise<void> };
  push: { requestPermission(): Promise<boolean>; getToken(): Promise<string | null>; onTap(cb: (data: { roomId: string }) => void): void };
  lifecycle: { onForeground(cb: () => void): void; onBackground(cb: () => void): void }; network: { isOnline(): boolean; onChange(cb: (online: boolean) => void): void };
  orientation: { lockLandscape(): Promise<void>; unlock(): Promise<void> }; keepAwake: { enable(): Promise<void>; disable(): Promise<void> }; audio: { unlock(): Promise<void> };
}
const vibrate = (pattern: number | number[]) => { navigator.vibrate?.(pattern); };
export const webPlatform: PlatformService = {
  kind: 'web', storage: { async get(k) { return localStorage.getItem(k); }, async set(k, v) { localStorage.setItem(k, v); }, async remove(k) { localStorage.removeItem(k); } },
  haptics: { tick: () => vibrate(8), success: () => vibrate([12, 35, 20]), warning: () => vibrate([30, 20, 30]), error: () => vibrate([50, 25, 50]) },
  share: { async inviteRoom(code, url) { if (navigator.share) await navigator.share({ title: 'Rummikub Neon Parlor', text: `Join room ${code}`, url }); else await navigator.clipboard.writeText(url); } },
  push: { async requestPermission() { return Notification.requestPermission().then(value => value === 'granted'); }, async getToken() { return null; }, onTap() {} },
  lifecycle: { onForeground(cb) { document.addEventListener('visibilitychange', () => { if (!document.hidden) cb(); }); }, onBackground(cb) { document.addEventListener('visibilitychange', () => { if (document.hidden) cb(); }); } },
  network: { isOnline: () => navigator.onLine, onChange(cb) { addEventListener('online', () => cb(true)); addEventListener('offline', () => cb(false)); } },
  orientation: { async lockLandscape() { const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> }; await orientation?.lock?.('landscape').catch(() => undefined); }, async unlock() { (screen.orientation as ScreenOrientation & { unlock?: () => void })?.unlock?.(); } },
  keepAwake: { async enable() {}, async disable() {} }, audio: { async unlock() {} }
};
