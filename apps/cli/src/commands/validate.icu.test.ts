import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateCommand } from './validate';
import * as fs from 'node:fs';

vi.mock('node:fs');

vi.mock('@simoncodes-ca/core', () => ({
  CONFIG_FILENAME: '.lingo-tracker.json',
  validateResources: vi.fn(),
  generateValidationSummary: vi.fn(),
}));

import * as core from '@simoncodes-ca/core';
const mockValidateResources = vi.mocked(core.validateResources);
const mockGenerateValidationSummary = vi.mocked(core.generateValidationSummary);

const CONFIG = {
  baseLocale: 'en',
  locales: ['en', 'fr', 'es'],
  collections: { common: { translationsFolder: 'translations/common' } },
};

/** The ICU options `validateResources` was called with. */
function icuOptions() {
  return mockValidateResources.mock.calls[0]?.[2].icu;
}

describe('validateCommand ICU options', () => {
  const originalLog = console.log;
  const originalExit = process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.warn = vi.fn();
    process.exit = vi.fn() as unknown as (code?: number | string | null | undefined) => never;

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(CONFIG));
    mockGenerateValidationSummary.mockReturnValue('summary');
    mockValidateResources.mockReturnValue({
      totalResourcesValidated: 0,
      totalUniqueKeys: 0,
      localesValidated: 2,
      collectionsValidated: 1,
      statusCounts: { new: 0, translated: 0, stale: 0, verified: 0 },
      failures: [],
      warnings: [],
      successes: [],
      passed: true,
    });
  });

  afterEach(() => {
    console.log = originalLog;
    process.exit = originalExit;
  });

  it('checks ICU by default', async () => {
    await validateCommand({});

    expect(icuOptions()).toBeDefined();
  });

  it('includes the base locale, whose value is copied into every translation slot', async () => {
    await validateCommand({});

    expect(icuOptions()?.baseLocale).toBe('en');
  });

  it('leaves the portability rule off unless asked', async () => {
    await validateCommand({});

    expect(icuOptions()?.requirePortablePlurals).toBe(false);
  });

  it('enables the portability rule on request', async () => {
    await validateCommand({ requirePortablePlurals: true });

    expect(icuOptions()?.requirePortablePlurals).toBe(true);
  });

  it('compiles values by default', async () => {
    await validateCommand({});

    expect(icuOptions()?.compileValues).toBe(true);
  });

  it('skips ICU checking entirely when asked', async () => {
    await validateCommand({ skipIcu: true });

    expect(icuOptions()).toBeUndefined();
  });

  it('still runs the portability rule alongside --skip-icu, since it only parses', async () => {
    await validateCommand({ skipIcu: true, requirePortablePlurals: true });

    expect(icuOptions()?.requirePortablePlurals).toBe(true);
    expect(icuOptions()?.compileValues).toBe(false);
  });

  it('keeps --skip-locales a statement about target locales only', async () => {
    // The base locale is not a target locale, so skipping it is a no-op —
    // the ICU pass still covers the source value every translation copies.
    await validateCommand({ skipLocales: ['en'] });

    expect(icuOptions()?.baseLocale).toBe('en');
    expect(mockValidateResources.mock.calls[0]?.[1]).toEqual(['fr', 'es']);
  });

  it('does not check a skipped target locale', async () => {
    await validateCommand({ skipLocales: ['es'] });

    expect(mockValidateResources.mock.calls[0]?.[1]).toEqual(['fr']);
  });
});
