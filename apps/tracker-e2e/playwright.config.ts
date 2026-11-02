import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const outputRoot = resolve(__dirname, '../../dist/.playwright/apps/tracker-e2e');

export default defineConfig({
  testDir: './src',
  testMatch: '**/*.e2e.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  outputDir: resolve(outputRoot, 'test-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: resolve(outputRoot, 'report') }],
    ['junit', { outputFile: resolve(__dirname, '../../dist/test-results/apps/tracker-e2e/junit.xml') }],
    ...(process.env.CI ? [['github'] as const] : []),
  ],
  use: { trace: 'on-first-retry', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // Documentation screenshots; run only through the `screenshots` target, never by `e2e` or CI.
      name: 'screenshots',
      testMatch: 'screenshots/**/*.shot.ts',
      retries: 0,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
  ],
});
