import type { Server } from 'socket.io';
import { advanceNight } from '../game/engine.js';
import { emitActionStart, emitDayStart, emitRoomState } from '../socket/handlers.js';
import { redis, saveRoom, withRoomLock } from './redis.js';

export function startScheduler(io: Server) {
  const timer = setInterval(async () => {
    for (const code of await redis.smembers('game:rooms')) {
      try {
        let transitioned = false; let dayTransition = false;
        const room = await withRoomLock(code, async (room) => {
          const now = Date.now();
          if (room.phase === 'night') { const current = room.nightActionQueue[room.currentNightActionIndex]; if (current?.status === 'active' && current.expiresAt <= now) { const wasLast = room.currentNightActionIndex === room.nightActionQueue.length - 1; room = advanceNight(room, current.playerIds.length ? 'timeout' : 'skipped', now); transitioned = true; dayTransition = wasLast; await saveRoom(room); } }
          else if (room.phase === 'day' && room.dayExpiresAt && room.dayExpiresAt <= now) { room.phase = 'voting'; room.dayExpiresAt = null; room.updatedAt = now; transitioned = true; await saveRoom(room); }
          return room;
        });
        if (transitioned) { await emitRoomState(io, room); if (room.phase === 'night') emitActionStart(io, room); else if (dayTransition) emitDayStart(io, room); else io.to(`game:${code}`).emit('PHASE_CHANGED', { phase: room.phase }); }
      } catch { /* another server owns the transition or room expired */ }
    }
  }, 400);
  timer.unref();
}
