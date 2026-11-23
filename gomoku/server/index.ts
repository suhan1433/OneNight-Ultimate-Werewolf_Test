import { fileURLToPath } from "node:url";
import { createGameServer } from "./app.js";
const staticDir = fileURLToPath(new URL("../../dist", import.meta.url));
// Source execution uses ../dist; compiled execution uses ../../dist.
const dev = import.meta.url.endsWith(".ts");
const service = createGameServer({
  staticDir: dev
    ? fileURLToPath(new URL("../dist", import.meta.url))
    : staticDir,
});
const port = Number(process.env.PORT || 3011);
service.server.listen(port, "0.0.0.0", () =>
  console.log(`천원 서버: http://localhost:${port}/gomoku/`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => void service.close().then(() => process.exit(0)));
