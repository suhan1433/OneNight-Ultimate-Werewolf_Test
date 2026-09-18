// Vercel routes this Function and its Socket.IO upgrade path at
// /api/socket-io/socket.io. The server itself must be exported, never listen().
import server from '../apps/server/dist/server.js';

export default server;
