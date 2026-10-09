import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The narrator recordings live in the repository-level mp3 directory so they
// can be maintained independently from the web source.
const dockerBuild=process.env.DOCKER_BUILD==='true';
export default defineConfig({
  base: '/avalon/',
  plugins: [react()],
  publicDir: '../../mp3',
  server: { host: true, port: 5174 },
  // The integrated site collects Avalon under apps/web/dist/avalon. Docker has
  // no parent site checkout, so it builds the same /avalon/ directory locally.
  build: { outDir: dockerBuild?'dist/avalon':'../../../apps/web/dist/avalon', emptyOutDir: true },
});
