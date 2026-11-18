import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: process.env.CAPACITOR_BUILD === "true" ? "./" : "/secret_hitler/",
  plugins: [react()],
  server: {
    host: true,
    port: 5179,
    proxy: {
      "/secret_hitler/socket.io": { target: "http://127.0.0.1:3008", ws: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
