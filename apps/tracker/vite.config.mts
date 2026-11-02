/// <reference types='vitest' />

import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/tracker',
  plugins: [angular()],
  resolve: {
    tsconfigPaths: true,
    dedupe: [
      '@angular/core',
      '@angular/core/testing',
      '@angular/common',
      '@angular/platform-browser',
      '@angular/platform-browser/testing',
      '@angular/platform-browser-dynamic',
      '@angular/platform-browser-dynamic/testing',
    ],
  },
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  test: {
    name: 'tracker',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default', ['junit', { outputFile: '../../dist/test-results/apps/tracker/junit.xml' }]],
    server: {
      deps: {
        inline: ['@ngneat/spectator'],
      },
    },
    coverage: {
      reportsDirectory: '../../coverage/apps/tracker',
      provider: 'v8' as const,
    },
  },
}));
