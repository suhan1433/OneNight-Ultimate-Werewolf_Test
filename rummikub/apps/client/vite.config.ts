import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react';
export default defineConfig({
  base: '/rummikub/',
  plugins: [react()],
  server: { host: true, port: 5177 },
  build: { outDir: '../../../apps/web/dist/rummikub', emptyOutDir: true },
});
