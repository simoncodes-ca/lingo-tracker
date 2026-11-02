import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/cli-e2e',
  test: {
    name: 'cli-e2e',
    watch: false,
    environment: 'node',
    include: ['src/**/*.e2e.spec.ts'],
    testTimeout: 30_000,
    reporters: ['tree', ['junit', { outputFile: '../../dist/test-results/apps/cli-e2e/junit.xml' }]],
  },
});
