import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const integrated = process.env.DECEPTION_INTEGRATED === "true";
export default defineConfig({
  base: integrated ? "/deception/" : "/",
  plugins: [react()],
  build: {
    outDir: integrated ? "../../../apps/web/dist/deception" : "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      "/socket.io": { target: "http://127.0.0.1:3004", ws: true },
      "/health": "http://127.0.0.1:3004",
    },
  },
});
