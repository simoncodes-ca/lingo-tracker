import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../runner/command-runner';
import { flagValues, registerFlags } from '../runner/flag-record';
import { validateCommand } from './validate';
import { VALIDATE_FLAGS } from './validate-options';

vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
    runValidate: vi.fn(),
  };
});

import * as core from '@simoncodes-ca/core';

const mockRunValidate = vi.mocked(core.runValidate);

const passed = {
  status: 'complete' as const,
  outcome: 'succeeded' as const,
  summary: 'Validation summary output',
  warnings: [],
  validation: {
    totalResourcesValidated: 0,
    totalUniqueKeys: 0,
    localesValidated: 0,
    collectionsValidated: 2,
    statusCounts: { new: 0, translated: 0, stale: 0, verified: 0 },
    failures: [],
    warnings: [],
    successes: [],
    passed: true,
  },
};

const config = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'fr', 'es', 'de'],
  collections: {
    common: { translationsFolder: 'translations/common' },
    admin: { translationsFolder: 'translations/admin' },
  },
};

describe('validateCommand', () => {
  const parsedFlags = (...args: string[]) => {
    const command = new Command();
    registerFlags(command, VALIDATE_FLAGS);
    command.parse(args, { from: 'user' });
    return flagValues(VALIDATE_FLAGS, command.opts(), []);
  };
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    console.error = vi.fn();
    console.warn = vi.fn();
    process.env.INIT_CWD = '/project';
    process.exitCode = undefined;
    vi.mocked(core.loadConfig).mockReturnValue(config);
    mockRunValidate.mockReturnValue(passed);
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exitCode = undefined;
  });

  it('passes every validation flag and the opened collections to the Validate Run', async () => {
    await validateCommand({
      allowTranslated: true,
      skipLocales: ['fr'],
      skipIcu: true,
      skipRuntime: true,
      skipPlaceholders: true,
      skipProtectedTerms: true,
      requirePortablePlurals: true,
    });

    expect(mockRunValidate).toHaveBeenCalledExactlyOnceWith(
      [
        expect.objectContaining({ name: 'common', baseLocale: 'en', targetLocales: ['fr', 'es', 'de'] }),
        expect.objectContaining({ name: 'admin', baseLocale: 'en', targetLocales: ['fr', 'es', 'de'] }),
      ],
      {
        allowTranslated: true,
        skipLocales: ['fr'],
        skipIcu: true,
        skipRuntime: true,
        skipPlaceholders: true,
        skipProtectedTerms: true,
        requirePortablePlurals: true,
      },
    );
  });

  it('resolves parsed --skip-locales "" to the empty-list default', async () => {
    const flags = parsedFlags('--skip-locales', '');
    expect(flags.skipLocales).toBeUndefined();
    const result = await runCommand(validateCommand, flags, { cwd: '/project' });
    expect(result.exitCode).toBe(0);
    expect(mockRunValidate).toHaveBeenCalledExactlyOnceWith(
      expect.any(Array),
      expect.objectContaining({ skipLocales: [] }),
    );
  });

  it('reports a missing config file', async () => {
    vi.mocked(core.loadConfig).mockImplementation(() => {
      throw new core.ConfigNotFoundError('/project/.lingo-tracker.json');
    });
    await validateCommand({});
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith('❌ Configuration file .lingo-tracker.json not found.');
    expect(console.error).toHaveBeenCalledWith('Run "lingo-tracker init" to initialize a project.');
  });

  it('reports a malformed config file', async () => {
    vi.mocked(core.loadConfig).mockImplementation(() => {
      throw new core.ConfigParseError('/project/.lingo-tracker.json', 'Unexpected token i in JSON');
    });
    await validateCommand({});
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('❌ Failed to parse configuration file'));
  });

  it('prints no-collections failure', async () => {
    vi.mocked(core.loadConfig).mockReturnValue({ ...config, collections: {} });
    mockRunValidate.mockReturnValue({
      status: 'failed',
      outcome: 'failed',
      error: 'No collections found in configuration.',
      details: [],
      warnings: [],
    });
    await validateCommand({});
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith('❌ No collections found. Run `lingo-tracker add-collection` first.');
    expect(console.log).not.toHaveBeenCalled();
  });

  it('prints the no-target-locales hint', async () => {
    mockRunValidate.mockReturnValue({
      status: 'failed',
      outcome: 'failed',
      error: 'No target locales found in configuration.',
      details: ["Target locales are each collection's locales except its base locale."],
      warnings: [],
    });
    await validateCommand({});
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith('❌ No target locales found in configuration.');
    expect(console.error).toHaveBeenCalledWith(
      "  Target locales are each collection's locales except its base locale.",
    );
  });

  it('prints the summary on success and leaves exit code zero', async () => {
    await validateCommand({});
    expect(console.log).toHaveBeenCalledWith('Validation summary output');
    expect(process.exitCode).toBe(0);
  });

  it('prints the summary and exits one when validation fails', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      outcome: 'failed',
      validation: { ...passed.validation, passed: false },
    });
    await validateCommand({});
    expect(console.log).toHaveBeenCalledWith('Validation summary output');
    expect(process.exitCode).toBe(1);
  });

  it('reports new-resource failures in the summary', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      outcome: 'failed',
      summary: 'new: title (fr)',
      validation: { ...passed.validation, passed: false },
    });
    await validateCommand({});
    expect(console.log).toHaveBeenCalledWith('new: title (fr)');
    expect(process.exitCode).toBe(1);
  });

  it('reports stale-resource failures in the summary', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      outcome: 'failed',
      summary: 'stale: title (fr)',
      validation: { ...passed.validation, passed: false },
    });
    await validateCommand({});
    expect(console.log).toHaveBeenCalledWith('stale: title (fr)');
    expect(process.exitCode).toBe(1);
  });

  it('reports translated-resource failures in strict mode', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      outcome: 'failed',
      summary: 'translated: title (fr)',
      validation: { ...passed.validation, passed: false },
    });
    await validateCommand({});
    expect(console.log).toHaveBeenCalledWith('translated: title (fr)');
    expect(process.exitCode).toBe(1);
  });

  it('prints a summary with failures from multiple locales', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      outcome: 'failed',
      summary: 'fr: title\nes: title',
      validation: { ...passed.validation, passed: false },
    });
    await validateCommand({});
    expect(console.log).toHaveBeenCalledWith('fr: title\nes: title');
    expect(process.exitCode).toBe(1);
  });

  it('prints a summary with failures from multiple collections', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      outcome: 'failed',
      summary: 'common: title\nadmin: title',
      validation: { ...passed.validation, passed: false },
    });
    await validateCommand({});
    expect(console.log).toHaveBeenCalledWith('common: title\nadmin: title');
    expect(process.exitCode).toBe(1);
  });

  it('prints a large failure summary without changing the exit code', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      outcome: 'failed',
      summary: '100 failures and more',
      validation: { ...passed.validation, passed: false },
    });
    await validateCommand({});
    expect(console.log).toHaveBeenCalledWith('100 failures and more');
    expect(process.exitCode).toBe(1);
  });

  it('keeps a successful exit when validation has findings', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      validation: {
        ...passed.validation,
        warnings: [{ key: 'title', locale: 'fr', collection: 'common', status: 'translated' }],
      },
    });
    await validateCommand({ allowTranslated: true });
    expect(process.exitCode).toBe(0);
    expect(console.log).toHaveBeenCalledWith('Validation summary output');
  });

  it('prints unknown skip-locale warnings to stderr before the summary', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      warnings: ["Skipping unknown locale 'xx' — not in configured locales"],
    });
    await validateCommand({ skipLocales: ['xx'] });
    expect(console.error).toHaveBeenCalledWith("⚠️  Skipping unknown locale 'xx' — not in configured locales");
    expect(console.log).toHaveBeenCalledWith('Validation summary output');
  });

  it('prints the skipped-locale summary without a warning for a known locale', async () => {
    mockRunValidate.mockReturnValue({ ...passed, summary: 'Skipped Locales: fr (1)' });
    await validateCommand({ skipLocales: ['fr'] });
    expect(console.log).toHaveBeenCalledWith('Skipped Locales: fr (1)');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('keeps the base locale silent in the skip list', async () => {
    await validateCommand({ skipLocales: ['en'] });
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('prints warnings before an all-skipped failure', async () => {
    mockRunValidate.mockReturnValue({
      status: 'failed',
      outcome: 'failed',
      error: 'All target locales were skipped; nothing to validate.',
      details: [],
      warnings: ["Skipping unknown locale 'xx' — not in configured locales"],
    });
    await validateCommand({ skipLocales: ['xx', 'fr', 'es', 'de'] });
    expect(console.error).toHaveBeenCalledWith("⚠️  Skipping unknown locale 'xx' — not in configured locales");
    expect(console.error).toHaveBeenCalledWith('❌ All target locales were skipped; nothing to validate.');
    expect(process.exitCode).toBe(1);
  });

  it('prints term-file warnings once and keeps the result exit code', async () => {
    mockRunValidate.mockReturnValue({ ...passed, warnings: ['Protected terms checks skipped: broken file'] });
    await validateCommand({});
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('⚠️  Protected terms checks skipped: broken file');
    expect(process.exitCode).toBe(0);
  });

  it('prints each missing named term-file warning to stderr', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      warnings: ['Protected terms file not found', 'Preferred terminology file not found'],
    });
    await validateCommand({});
    expect(console.error).toHaveBeenCalledWith('⚠️  Protected terms file not found');
    expect(console.error).toHaveBeenCalledWith('⚠️  Preferred terminology file not found');
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(0);
  });

  it('prints terminology findings in the summary without failing', async () => {
    mockRunValidate.mockReturnValue({ ...passed, summary: '⚠️  Preferred Terminology Warnings (1)' });
    await validateCommand({});
    expect(console.log).toHaveBeenCalledWith('⚠️  Preferred Terminology Warnings (1)');
    expect(process.exitCode).toBe(0);
  });

  it('exits one when validation reports a broken terminology file', async () => {
    mockRunValidate.mockReturnValue({
      ...passed,
      outcome: 'failed',
      validation: { ...passed.validation, passed: false },
    });
    await validateCommand({});
    expect(process.exitCode).toBe(1);
  });
});
