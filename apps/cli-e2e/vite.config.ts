import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/cli-e2e',
  test: {
    name: 'cli-e2e',
    watch: false,
    environment: 'node',
    include: ['src/**/*.e2e.spec.ts'],
    testTimeout: 30_000,
    reporters: ['verbose'],
  },
});
