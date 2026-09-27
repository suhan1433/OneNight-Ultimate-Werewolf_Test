// This entrypoint must remain ESM: apps/server is an ESM workspace package and
// Vercel compiles .ts API entries as CommonJS unless the project opts into ESM.
import server from '../apps/server/dist/server.js';

export default server;
