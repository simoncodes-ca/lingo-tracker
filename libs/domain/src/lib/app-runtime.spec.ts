import { describe, expect, it } from 'vitest';
import { APP_RUNTIMES, DEFAULT_APP_RUNTIME, isAppRuntime } from './app-runtime';

describe('app runtime', () => {
  it('lists the supported runtimes and the backward-compatible default', () => {
    expect(APP_RUNTIMES).toEqual(['transloco-messageformat', 'transloco']);
    expect(DEFAULT_APP_RUNTIME).toBe('transloco-messageformat');
  });

  it('accepts both runtimes and rejects other values', () => {
    for (const runtime of APP_RUNTIMES) expect(isAppRuntime(runtime)).toBe(true);
    for (const value of ['Transloco', '', undefined, 1, null, {}, 'constructor']) {
      expect(isAppRuntime(value)).toBe(false);
    }
  });
});
