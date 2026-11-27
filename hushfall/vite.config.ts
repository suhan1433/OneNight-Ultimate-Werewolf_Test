import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/hushfall/',
  server: {
    host: true, port: 5181, strictPort: true,
    proxy: { '/api/hushfall/socket': { target: 'http://127.0.0.1:3012', ws: true } },
  },
  plugins: [VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Lumen Tether · 루멘 테더', short_name: 'Lumen Tether',
      theme_color: '#0b101b', background_color: '#0b101b',
      display: 'standalone', description: 'A two-pilot co-op vertical shooter.',
      icons: [{ src: 'lumen.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        { src: 'lumen-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'lumen-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
    },
    workbox: { globPatterns: ['**/*.{html,css,js,svg,png}'] },
  })],
});
