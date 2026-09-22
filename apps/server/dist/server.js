import http from 'node:http';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from './services/redis.js';
import { registerHandlers } from './socket/handlers.js';
import { startScheduler } from './services/scheduler.js';
const log = pino();
export function createGameServer(socketPath = '/socket.io') {
    const app = express();
    const origin = process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:5173'];
    app.use(cors({ origin, credentials: true }));
    app.use(express.json());
    app.get('/health', (_req, res) => res.json({ ok: true, instance: process.env.INSTANCE_NAME ?? 'server' }));
    const server = http.createServer(app);
    const io = new Server(server, {
        path: socketPath,
        cors: { origin, credentials: true },
        transports: ['websocket', 'polling'],
        maxHttpBufferSize: 100_000,
        pingInterval: 10_000,
        pingTimeout: 20_000,
    });
    io.adapter(createAdapter(pubClient, subClient));
    io.on('connection', (socket) => registerHandlers(io, socket));
    return { server, io };
}
const isStandaloneServer = process.env.RUN_STANDALONE_SERVER === 'true';
const localServer = createGameServer(isStandaloneServer ? '/socket.io' : '/api/socket');
// Vercel imports this HTTP server as a Function. Never infer this from Vercel
// system environment variables: projects can choose not to expose them. Local
// scripts opt in explicitly, so an imported Function can never call listen().
if (isStandaloneServer) {
    startScheduler(localServer.io);
    const port = Number(process.env.PORT ?? 3001);
    localServer.server.listen(port, () => log.info({ port }, 'werewolf_server_started'));
}
export default localServer.server;
