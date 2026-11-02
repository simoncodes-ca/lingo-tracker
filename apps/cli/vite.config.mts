/// <reference types='vitest' />

import { defineConfig } from 'vite';

export default defineConfig(() => ({
  resolve: {
    tsconfigPaths: true,
  },
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/cli',
  define: {
    __CLI_VERSION__: JSON.stringify('0.0.0-test'),
  },
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [ nxViteTsPaths() ],
  // },
  test: {
    name: 'cli',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    reporters: ['default', ['junit', { outputFile: '../../dist/test-results/apps/cli/junit.xml' }]],
    coverage: {
      reportsDirectory: '../../coverage/apps/cli',
      provider: 'v8' as const,
    },
    server: {
      deps: {
        inline: ['@simoncodes-ca/core'],
      },
    },
  },
}));
