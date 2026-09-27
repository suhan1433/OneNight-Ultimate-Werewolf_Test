import type { Server } from 'socket.io';
import { sweepExpiredRooms } from './redis.js';
/** Avalon phases advance only from player actions; this only reclaims expired in-memory rooms. */
export function startScheduler(_io: Server) { const timer=setInterval(()=>void sweepExpiredRooms(100),60_000); timer.unref(); }
export async function processExpiredRoom(_io: Server, _code: string) { return null; }
