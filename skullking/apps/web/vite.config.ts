import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';
export default defineConfig({base:'/skullking/',plugins:[react()],server:{host:true,port:5176},build:{outDir:'../../../apps/web/dist/skullking',emptyOutDir:true}});
