import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: 'silence-vite-ws-error',
      transform(code, id) {
        if (id.includes('vite/dist/client/client.mjs')) {
          return code
            .replace(
              /reject\([^)]*"WebSocket closed without opened\."\)\);/g,
              'resolve();'
            )
            .replace(
              'transport.connect(createHMRHandler(handleMessage));',
              'transport.connect(createHMRHandler(handleMessage)).catch(() => {});'
            )
            .replace(
              'console.error(`[vite] failed to connect to websocket (${e}). `);',
              ''
            );
        }
        return null;
      },
    },
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'manifest.json'],
      manifest: {
        id: '/',
        name: 'Medical Lab Management System - نظام إدارة معمل التحاليل الطبية',
        short_name: 'MedLab Pro',
        description: 'نظام متكامل لإدارة معامل التحاليل الطبية، العينات، النتائج، الفواتير، المحاسبة وعمولات الأطباء',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        dir: 'rtl',
        lang: 'ar',
        icons: [
          {
            src: '/icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  server: {
    hmr: false,
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/services/**/*.ts'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '**/*.d.ts',
      ],
    },
  },
});
