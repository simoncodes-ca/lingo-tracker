import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateCommand } from './validate';

vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return {
    loadConfig: vi.fn(),
    openCollection: actual.openCollection,
    ConfigNotFoundError: actual.ConfigNotFoundError,
    ConfigParseError: actual.ConfigParseError,
    CONFIG_FILENAME: '.lingo-tracker.json',
    runValidate: vi.fn(),
  };
});

import * as core from '@simoncodes-ca/core';

const mockRunValidate = vi.mocked(core.runValidate);
const CONFIG = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'fr', 'es'],
  collections: { common: { translationsFolder: 'translations/common' } },
};

const success = {
  status: 'complete' as const,
  outcome: 'succeeded' as const,
  summary: 'summary',
  warnings: [],
  validation: {
    totalResourcesValidated: 0,
    totalUniqueKeys: 0,
    localesValidated: 2,
    collectionsValidated: 1,
    statusCounts: { new: 0, translated: 0, stale: 0, verified: 0 },
    failures: [],
    warnings: [],
    successes: [],
    passed: true,
  },
};

describe('validateCommand ICU flag forwarding', () => {
  const originalLog = console.log;
  const originalWarn = console.warn;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.warn = vi.fn();
    process.env.INIT_CWD = '/project';
    process.exitCode = undefined;
    vi.mocked(core.loadConfig).mockReturnValue(CONFIG);
    mockRunValidate.mockReturnValue(success);
  });

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    process.exitCode = undefined;
  });

  it('passes default options to the Validate Run', async () => {
    await validateCommand({});
    expect(mockRunValidate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({}));
    expect(console.log).toHaveBeenCalledWith('summary');
  });

  it('passes opened collections with their own base locales', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({
      ...CONFIG,
      collections: {
        common: { translationsFolder: 'translations/common' },
        other: { translationsFolder: 'translations/other', baseLocale: 'en-GB' },
      },
    });
    await validateCommand({});
    expect(mockRunValidate.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ name: 'common', baseLocale: 'en' }),
      expect.objectContaining({ name: 'other', baseLocale: 'en-GB' }),
    ]);
  });

  it('does not request portability by default', async () => {
    await validateCommand({});
    expect(mockRunValidate.mock.calls[0]?.[1].requirePortablePlurals).toBe(false);
  });

  it('forwards a portability request', async () => {
    await validateCommand({ requirePortablePlurals: true });
    expect(mockRunValidate.mock.calls[0]?.[1].requirePortablePlurals).toBe(true);
  });

  it('leaves ICU enabled by default', async () => {
    await validateCommand({});
    expect(mockRunValidate.mock.calls[0]?.[1].skipIcu).toBe(false);
  });

  it('forwards --skip-icu', async () => {
    await validateCommand({ skipIcu: true });
    expect(mockRunValidate.mock.calls[0]?.[1].skipIcu).toBe(true);
  });

  it('forwards portability alongside --skip-icu', async () => {
    await validateCommand({ skipIcu: true, requirePortablePlurals: true });
    expect(mockRunValidate.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ skipIcu: true, requirePortablePlurals: true }),
    );
  });

  it('passes a base locale in --skip-locales for core to partition', async () => {
    await validateCommand({ skipLocales: ['en'] });
    expect(mockRunValidate.mock.calls[0]?.[1].skipLocales).toEqual(['en']);
  });

  it('passes a target locale in --skip-locales for core to partition', async () => {
    await validateCommand({ skipLocales: ['es'] });
    expect(mockRunValidate.mock.calls[0]?.[1].skipLocales).toEqual(['es']);
  });
});
