import { io } from 'socket.io-client';
// Structural socket type supports the independently installed client versions.
type Socket = {
  connected: boolean;
  timeout(ms: number): { emit(event: string, ...args: any[]): unknown };
  emit(event: string, ...args: any[]): unknown;
  on(event: string, listener: (...args: any[]) => void): unknown;
  once(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
  disconnect(): unknown;
  onAnyOutgoing(listener: (...args: any[]) => void): unknown;
  offAnyOutgoing(listener: (...args: any[]) => void): unknown;
};
const development = (import.meta as ImportMeta & { env: { DEV: boolean } }).env.DEV;
import './switch.css';

import { games, entry, type GameId, type Member } from './catalog';
const request = <T,>(socket: Socket, event: string, data: unknown): Promise<T> => new Promise((resolve, reject) => {
  if (!socket.connected) return reject(Error('서버 연결을 확인해 주세요.'));
  socket.timeout(15000).emit(event, data, (error: Error | null, reply: { ok: boolean; data: T; error?: string }) => {
    if (error) reject(Error('서버 응답이 늦어지고 있습니다. 다시 시도해 주세요.'));
    else if (!reply?.ok) reject(Error(reply?.error || '게임을 변경하지 못했습니다.'));
    else resolve(reply.data);
  });
});

function targetSocket(game: GameId): Promise<Socket> {
  const config = games[game];
  const local = development;
  const socket = io(local ? `${location.protocol}//${location.hostname}:${config.port}` : location.origin, {
    path: local && game !== 'secret_hitler' ? '/socket.io' : config.path,
    forceNew: true, reconnection: false, timeout: 10000, transports: ['websocket', 'polling'],
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', () => { socket.disconnect(); reject(Error('선택한 게임 서버에 연결할 수 없습니다.')); });
  });
}

/** Attach to the game's existing authenticated socket; no second source session is created. */
export function installGameSwitch(socket: Socket, current: GameId): () => void {
  // Fragments stay in the browser and also work between local frontend origins.
  const fragment = new URLSearchParams(location.hash.slice(1));
  const incoming = fragment.get('club-move');
  if (incoming) {
    try {
      const transfer = JSON.parse(incoming);
      if (transfer.game === current && transfer.session) {
        localStorage.setItem(games[current].key, JSON.stringify(transfer.session));
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch { /* Existing reconnect handling reports an invalid saved session. */ }
  }
  document.getElementById('club-game-switch')?.remove();
  const root = document.createElement('div');
  root.id = 'club-game-switch'; root.hidden = true;
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'club-switch-trigger'; trigger.textContent = '게임 변경';
  const dialog = document.createElement('dialog'); dialog.className = 'club-switch-dialog';
  const heading = document.createElement('h2'); heading.textContent = '함께 다른 게임으로';
  const note = document.createElement('p');
  const choices = document.createElement('div'); choices.className = 'club-switch-choices';
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기'; close.className = 'club-switch-close';
  dialog.append(heading, note, choices, status, close); root.append(trigger, dialog); document.body.append(root);
  let state: any = null;
  let busy = false;
  let moving = false;
  const buttons: HTMLButtonElement[] = [];
  const people = () => (state?.players ?? state?.members ?? []).filter((p: any) => !p.isBot && !p.bot && !p.spectator);
  const host = () => state && (state.playerId ?? state.selfId ?? state.me?.id ?? state.you?.id) === state.hostId;
  const render = () => {
    root.hidden = !state;
    const count = people().length;
    trigger.disabled = busy || !socket.connected;
    note.textContent = host() ? `현재 참가자 ${count}명이 이름을 유지하고 새 대기실로 이동합니다. 새 대기실에서 다시 시작합니다. 봇은 이동하지 않습니다.` : '방장이 게임을 선택하면 모든 참가자가 함께 이동합니다.';
    buttons.forEach(button => {
      const id = button.dataset.game as GameId;
      button.disabled = busy || !host() || count < games[id].min || count > games[id].max || !socket.connected;
    });
    close.disabled = busy;
  };
  const switchTo = async (game: GameId) => {
    if (busy) return;
    busy = true; status.textContent = '참가자 정보를 확인하고 있습니다…'; render();
    const targets: Socket[] = [];
    try {
      // Probe storage before creating seats so storage restrictions leave the source untouched.
      localStorage.setItem('club-switch-check', '1'); localStorage.removeItem('club-switch-check');
      const roster = await request<{ members: Member[]; hostId: string }>(socket, 'GAME_SWITCH', { game });
      const members = [...roster.members].sort((a, b) => Number(b.id === roster.hostId) - Number(a.id === roster.hostId));
      const sessions: Record<string, any> = {};
      let code = '';
      for (const member of members) {
        status.textContent = `${games[game].label} 대기실 준비 중 (${targets.length + 1}/${members.length})…`;
        const target = await targetSocket(game); targets.push(target);
        const [event, payload] = entry(game, member.name, members.length, code || undefined);
        const session = await request<any>(target, event, payload);
        await request(target, 'GAME_SWITCH_RESERVE', {});
        sessions[member.id] = session;
        code = session.roomCode ?? session.code ?? session.roomId;
      }
      status.textContent = '모두 함께 이동하고 있습니다…';
      await request(socket, 'GAME_SWITCH', { game, code, sessions });
    } catch (error) {
      if (!moving) status.textContent = error instanceof Error ? error.message : '게임을 변경하지 못했습니다.';
    } finally {
      // The destination clients resume their reserved seats with their own credentials.
      targets.reverse().forEach(target => target.disconnect());
      busy = false; if (!moving) render();
    }
  };
  for (const id of Object.keys(games) as GameId[]) {
    if (id === current) continue;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.game = id;
    button.textContent = `${games[id].label} · ${games[id].min}–${games[id].max}명`;
    button.onclick = () => { void switchTo(id); }; choices.append(button); buttons.push(button);
  }
  trigger.onclick = () => { status.textContent = ''; render(); dialog.showModal(); };
  close.onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  const onState = (value: any) => { state = value; render(); };
  const onSwitched = (data: { game: GameId; session: any; name: string }) => {
    if (!games[data.game] || moving) return;
    try {
      const saved = data.game === 'rummikub' ? { ...data.session, name: data.name } : data.session;
      localStorage.setItem(games[data.game].key, JSON.stringify(saved));
      localStorage.removeItem(games[current].key);
      moving = true;
      const destination = new URL(`/${data.game}/`, location.origin);
      // Vite uses a separate frontend port for each app in local development.
      if (development) {
        const ports: Record<GameId, number> = { werewolf: 5173, avalon: 5174, skullking: 5175, spacecrew: 5177, rummikub: 5178, deception: 5176, secret_hitler: 5179 };
        destination.port = String(ports[data.game]);
      }
      destination.hash = new URLSearchParams({ 'club-move': JSON.stringify({ game: data.game, session: saved }) }).toString();
      location.assign(destination.href);
    } catch { status.textContent = '이동 정보를 저장하지 못했습니다. 브라우저 저장소를 확인해 주세요.'; }
  };
  const onLeave = (event: string) => { if (['ROOM_LEAVE','room:leave','leave','LEAVE'].includes(event)) { state = null; dialog.close(); render(); } };
  const onRemoved = () => { state = null; dialog.close(); render(); };
  const stateEvent = current === 'deception' ? 'state' : current === 'rummikub' ? 'state:sync' : 'ROOM_STATE';
  socket.on(stateEvent, onState); socket.on('GAME_SWITCHED', onSwitched); socket.on('connect', render); socket.on('disconnect', render);
  socket.onAnyOutgoing(onLeave);
  const removed = ['ROOM_KICKED','room:kicked','REMOVED','removed','replaced','SESSION_REPLACED'];
  removed.forEach(event => socket.on(event, onRemoved));
  return () => {
    socket.off(stateEvent, onState); socket.off('GAME_SWITCHED', onSwitched); socket.off('connect', render); socket.off('disconnect', render); socket.offAnyOutgoing(onLeave);
    removed.forEach(event => socket.off(event, onRemoved)); root.remove();
  };
}
