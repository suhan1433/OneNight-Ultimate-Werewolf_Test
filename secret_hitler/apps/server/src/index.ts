import { createGameServer } from "./server.js";
const { server, close } = createGameServer({
  dataDir: process.env.DATA_DIR,
  botDelayMs: process.env.BOT_DELAY_MS
    ? Math.max(10, Number(process.env.BOT_DELAY_MS) || 900)
    : undefined,
});
const port = Number(process.env.PORT ?? 3007);
server.listen(port, "0.0.0.0", () =>
  console.log(`Secret Hitler server: http://localhost:${port}/secret_hitler/`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void close().then(() => process.exit(0));
  });
