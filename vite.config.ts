/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Installable app with offline play: the service worker precaches the whole game.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Rocket Builder Tycoon',
        short_name: 'Rocket Tycoon',
        description: 'Buy parts, build a rocket, fly it as far as you can.',
        theme_color: '#060b1a',
        background_color: '#060b1a',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev') },
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'src/engines/**/*.ts', 'src/services/persistence/**/*.ts', 'supabase/functions/**/verify.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
