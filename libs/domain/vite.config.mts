import { defineConfig } from 'vite';

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/domain',
  test: {
    name: 'domain',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default', ['junit', { outputFile: '../../dist/test-results/libs/domain/junit.xml' }]],
    coverage: {
      reportsDirectory: '../../coverage/libs/domain',
      provider: 'v8' as const,
    },
  },
}));
