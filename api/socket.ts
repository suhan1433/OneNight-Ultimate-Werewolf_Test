// A real file-system Function route is required for a Socket.IO upgrade on
// Vercel. The imported server uses `/api/socket` outside standalone mode.
import server from '../apps/server/dist/server.js';

export default server;
