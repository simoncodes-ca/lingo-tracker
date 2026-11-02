import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportFileName } from './export-file-name';

describe('exportFileName', () => {
  afterEach(() => vi.useRealTimers());

  it('uses the locale and format as the default filename', () => {
    expect(exportFileName('json', 'fr', 'en')).toBe('fr.json');
    expect(exportFileName('xliff', 'de', 'en')).toBe('de.xliff');
  });

  it('resolves every placeholder in both formats', () => {
    const date = new Date('2026-10-19T23:59:59Z');
    for (const format of ['json', 'xliff'] as const) {
      expect(exportFileName(format, 'fr', 'en', '{source}-{target}-{locale}-{date}', date)).toBe(
        `en-fr-fr-2026-10-19.${format}`,
      );
    }
  });

  it('appends the format extension exactly once', () => {
    for (const format of ['json', 'xliff'] as const) {
      expect(exportFileName(format, 'fr', 'en', 'custom')).toBe(`custom.${format}`);
      expect(exportFileName(format, 'fr', 'en', `custom.${format}`)).toBe(`custom.${format}`);
    }
  });

  it('keeps the shared run date when the clock crosses midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T23:59:59Z'));
    const date = new Date();
    expect(exportFileName('json', 'fr', 'en', '{date}-{locale}', date)).toBe('2026-10-19-fr.json');
    vi.setSystemTime(new Date('2026-10-20T00:00:01Z'));
    expect(exportFileName('xliff', 'es', 'en', '{date}-{locale}', date)).toBe('2026-10-19-es.xliff');
  });

  it('preserves the source placeholder when no base locale is available', () => {
    expect(exportFileName('json', 'fr', undefined, '{source}-{target}')).toBe('{source}-fr.json');
  });
});
