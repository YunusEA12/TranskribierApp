/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app under /<repo>/; the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Mitschrift',
        short_name: 'Mitschrift',
        description: 'Aufnehmen, transkribieren, im Obsidian-Vault ablegen.',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0b0e13',
        theme_color: '#0b0e13',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The Phase 0 spike is deployed next to the app and must not be swallowed by the SPA fallback.
        navigateFallbackDenylist: [/\/spike\//],
      },
    }),
  ],
  build: {
    // The Gemini SDK alone is several hundred kB; one chunk is fine for a PWA that is cached once.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
