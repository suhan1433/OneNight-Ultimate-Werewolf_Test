import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/gomoku/",
  plugins: [react()],
  server: {
    host: true,
    port: 5180,
    strictPort: true,
    proxy: {
      "/api/gomoku/socket": { target: "http://127.0.0.1:3011", ws: true },
    },
  },
  build: { outDir: "dist" },
});
