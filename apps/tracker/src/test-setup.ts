import '@angular/compiler';
import '@analogjs/vitest-angular/setup-zone';

import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { getTestBed } from '@angular/core/testing';
import { vi } from 'vitest';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

/**
 * Suppress Angular NG0912 warnings globally during tests.
 * NG0912 warnings occur when multiple components with the same selector are registered,
 * which commonly happens in test environments with CDK components like CdkVirtualScrollViewport.
 */
const originalConsoleWarn = console.warn;
console.warn = vi.fn((message: unknown, ...args: unknown[]) => {
  const messageStr = String(message);

  // Suppress NG0912 component ID collision warnings
  if (messageStr.includes('NG0912')) {
    return;
  }

  // Pass through other warnings
  originalConsoleWarn(message, ...args);
});
