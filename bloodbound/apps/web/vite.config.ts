import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';
export default defineConfig({base:'/bloodbound/',plugins:[react()],server:{host:true,port:5175},build:{outDir:'../../../apps/web/dist/bloodbound',emptyOutDir:true}});
