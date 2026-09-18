import type { Server } from 'socket.io';
import { advanceNight, startCurrentAction } from '../game/engine.js';
import { emitActionStart, emitDayStart, emitRoomState } from '../socket/handlers.js';
import { redis, saveRoom, withRoomLock } from './redis.js';

export function startScheduler(io: Server) {
  const timer = setInterval(async () => {
    for (const code of await redis.smembers('game:rooms')) {
      await processExpiredRoom(io, code);
    }
  }, 400);
  timer.unref();
}

/**
 * Advances one persisted room if its deadline passed. Multiple Vercel Functions
 * may call this concurrently; withRoomLock ensures that only one applies and
 * publishes a transition. In production this is driven by connected clients'
 * ROOM_SYNC heartbeats, rather than an unreliable process-global interval.
 */
export async function processExpiredRoom(io: Server, code: string) {
  try {
    let transitioned = false; let dayTransition = false;
    const room = await withRoomLock(code, async (room) => {
      const now = Date.now();
      if (room.phase === 'night') {
        const current = room.nightActionQueue[room.currentNightActionIndex];
        if (current?.status === 'pending' && current.expiresAt <= now) {
          room = startCurrentAction(room, now);
          transitioned = true;
          await saveRoom(room);
        } else if (current?.status === 'active' && current.expiresAt <= now) {
          const wasLast = room.currentNightActionIndex === room.nightActionQueue.length - 1;
          room = advanceNight(room, current.playerIds.length ? 'timeout' : 'skipped', now);
          transitioned = true; dayTransition = wasLast;
          await saveRoom(room);
        }
      } else if (room.phase === 'day' && room.dayExpiresAt && room.dayExpiresAt <= now) {
        room.phase = 'voting'; room.dayExpiresAt = null; room.updatedAt = now;
        transitioned = true;
        await saveRoom(room);
      }
      return room;
    });
    if (transitioned) {
      // Queue the narration before the state that reveals its controls. Socket
      // ordering makes the audio instruction arrive before its timer begins.
      if (room.phase === 'night') emitActionStart(io, room);
      await emitRoomState(io, room);
      if (room.phase === 'day' && dayTransition) emitDayStart(io, room);
      else if (room.phase !== 'night') io.to(`game:${code}`).emit('PHASE_CHANGED', { phase: room.phase });
    }
  } catch {
    // The room can expire or another instance can own the lock. The next sync
    // will retry safely, so neither case is an application error.
  }
}
