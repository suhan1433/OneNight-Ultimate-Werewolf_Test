import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The narrator recordings live in the repository-level mp3 directory so they
// can be maintained independently from the web source.
export default defineConfig({ plugins: [react()], publicDir: '../../mp3', server: { host: true, port: 5173 } });
