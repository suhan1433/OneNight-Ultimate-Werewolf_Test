import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5177,
    proxy: {
      '/api/spacecrew/socket': {
        target: 'http://localhost:3005',
        ws: true,
        rewrite: path => path.replace(/^\/api\/spacecrew\/socket/, '/socket.io'),
      },
    },
  },
  base: '/spacecrew/',
  build: { outDir: '../apps/web/dist/spacecrew', emptyOutDir: true },
});
