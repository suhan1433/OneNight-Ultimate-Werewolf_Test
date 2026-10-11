import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5177, proxy: { '/socket.io': { target: 'http://localhost:3005', ws: true } } },
  base: '/spacecrew/',
  build: { outDir: '../apps/web/dist/spacecrew', emptyOutDir: true },
});
