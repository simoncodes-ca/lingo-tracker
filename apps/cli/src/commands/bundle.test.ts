import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bundleCommand } from './bundle';
import prompts from 'prompts';
import { isInteractiveTerminal } from '../runner/terminal';

vi.mock('prompts');
vi.mock('../runner/terminal', () => ({ isInteractiveTerminal: vi.fn(() => false) }));

vi.mock('@simoncodes-ca/core', async () => {
  const actual = await vi.importActual<typeof import('@simoncodes-ca/core')>('@simoncodes-ca/core');
  return { ...actual, loadConfig: vi.fn(), generateBundles: vi.fn() };
});

import * as core from '@simoncodes-ca/core';
const mockGenerateBundles = vi.mocked(core.generateBundles);
type BundleEvent = Parameters<NonNullable<core.GenerateBundlesOptions['onEvent']>>[0];
type BundleResult = core.GenerateBundleResult;
type BundleRun = core.GenerateBundlesResult;

function makeBundleResult(overrides: Partial<BundleResult> = {}): BundleResult {
  return {
    outcome: overrides.typeOutcome?.status === 'failed' ? 'failed' : 'succeeded',
    bundleKey: 'core',
    filesGenerated: 3,
    writtenFiles: [],
    warnings: [],
    localesProcessed: ['en', 'fr', 'es'],
    keysPerLocale: {},
    typeOutcome: { status: 'not-configured' },
    ...overrides,
  };
}

function setRun(events: readonly BundleEvent[], result: BundleRun): void {
  mockGenerateBundles.mockImplementationOnce(async (_config, options) => {
    for (const event of events) options.onEvent?.(event);
    return result;
  });
}

function setSingle(overrides: Partial<BundleResult> = {}, name = 'core'): void {
  const result = makeBundleResult(overrides);
  const outcome = { name, outcome: result.outcome, result };
  const events: BundleEvent[] = [{ kind: 'start', name }];
  if (result.typeOutcome.warning) events.push({ kind: 'type-warning', warning: result.typeOutcome.warning });
  events.push({ kind: 'result', outcome });
  setRun(events, {
    outcome: result.outcome,
    outcomes: [outcome],
    totals: { bundlesProcessed: 1, filesGenerated: result.filesGenerated, warningsCount: result.warnings.length },
  });
}

function setFailure(error: Error, name = 'core'): void {
  const outcome = { name, outcome: 'failed' as const, error };
  setRun([{ kind: 'result', outcome }], {
    outcome: 'failed',
    outcomes: [outcome],
    totals: { bundlesProcessed: 0, filesGenerated: 0, warningsCount: 0 },
  });
}

function setTwo(first: Partial<BundleResult>, second: Partial<BundleResult>): void {
  const firstResult = makeBundleResult(first);
  const secondResult = makeBundleResult(second);
  const firstOutcome = { name: 'core', outcome: firstResult.outcome, result: firstResult };
  const secondOutcome = { name: 'admin', outcome: secondResult.outcome, result: secondResult };
  setRun(
    [
      { kind: 'start', name: 'core' },
      { kind: 'result', outcome: firstOutcome },
      { kind: 'start', name: 'admin' },
      { kind: 'result', outcome: secondOutcome },
    ],
    {
      outcome: firstResult.outcome === 'succeeded' && secondResult.outcome === 'succeeded' ? 'succeeded' : 'failed',
      outcomes: [firstOutcome, secondOutcome],
      totals: { bundlesProcessed: 2, filesGenerated: 5, warningsCount: 1 },
    },
  );
}

function setPartialFailure(message: string): void {
  const failed = { name: 'core', outcome: 'failed' as const, error: new Error(message) };
  const succeeded = {
    name: 'admin',
    outcome: 'succeeded' as const,
    result: makeBundleResult({ bundleKey: 'admin', filesGenerated: 2, localesProcessed: ['en', 'fr'] }),
  };
  setRun(
    [
      { kind: 'start', name: 'core' },
      { kind: 'result', outcome: failed },
      { kind: 'start', name: 'admin' },
      { kind: 'result', outcome: succeeded },
    ],
    {
      outcome: 'failed',
      outcomes: [failed, succeeded],
      totals: { bundlesProcessed: 1, filesGenerated: 2, warningsCount: 0 },
    },
  );
}

describe('bundleCommand', () => {
  const mockConfig = {
    exportFolder: 'dist/export',
    importFolder: 'dist/import',
    baseLocale: 'en',
    locales: ['en', 'fr', 'es'],
    collections: {
      common: {
        translationsFolder: 'translations/common',
      },
    },
    bundles: {
      core: {
        bundleName: '{locale}',
        dist: './dist/i18n',
        collections: 'All' as const,
      },
      admin: {
        bundleName: 'admin-{locale}',
        dist: './dist/admin-i18n',
        collections: 'All' as const,
      },
    },
  };

  const originalLog = console.log;

  beforeEach(() => {
    vi.clearAllMocks();
    console.log = vi.fn();
    process.env.INIT_CWD = '/test';
    process.exitCode = undefined;
    vi.mocked(isInteractiveTerminal).mockReturnValue(false);
    vi.mocked(core.loadConfig).mockReturnValue(mockConfig);

    mockGenerateBundles.mockReset();
    mockGenerateBundles.mockResolvedValue({
      outcome: 'succeeded',
      outcomes: [],
      totals: { bundlesProcessed: 0, filesGenerated: 0, warningsCount: 0 },
    });
  });

  afterEach(() => {
    console.log = originalLog;
    process.exitCode = undefined;
  });

  it('keeps bundle fallback for empty name flags', async () => {
    const options = { name: [], bundleOrAll: 'core' };
    await bundleCommand(options);
    expect(mockGenerateBundles).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ names: ['core'] }));
    expect(process.exitCode).toBe(0);
  });

  describe('configuration validation', () => {
    it('should error when config file is missing', async () => {
      vi.mocked(core.loadConfig).mockImplementation(() => {
        throw new core.ConfigNotFoundError('/test/.lingo-tracker.json');
      });

      await bundleCommand({});

      expect(core.loadConfig).toHaveBeenCalledWith({ cwd: '/test' });
      expect(mockGenerateBundles).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('should error when no bundles are configured', async () => {
      const configWithoutBundles = { ...mockConfig, bundles: {} };
      vi.mocked(core.loadConfig).mockReturnValue(configWithoutBundles);

      await bundleCommand({});

      expect(console.error).toHaveBeenCalledWith('❌ No bundles configured in .lingo-tracker.json');
      expect(process.exitCode).toBe(1);
    });

    it('should error when bundles property is missing', async () => {
      const configWithoutBundles = { ...mockConfig };
      delete (configWithoutBundles as { bundles?: unknown }).bundles;
      vi.mocked(core.loadConfig).mockReturnValue(configWithoutBundles);

      await bundleCommand({});

      expect(console.error).toHaveBeenCalledWith('❌ No bundles configured in .lingo-tracker.json');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('bundle selection', () => {
    it('should process all bundles by default in non-TTY mode', async () => {
      await bundleCommand({});

      expect(process.exitCode).toBe(0);
      expect(mockGenerateBundles).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ names: undefined }));
    });

    it('should process single bundle when --name is provided', async () => {
      await bundleCommand({ name: ['core'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ names: ['core'] }));
    });

    it('should process multiple bundles when comma-separated names are provided', async () => {
      await bundleCommand({ name: ['core', 'admin'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({ names: ['core', 'admin'] }),
      );
    });

    it('should handle bundle names with spaces after comma', async () => {
      await bundleCommand({ name: ['core', 'admin'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({ names: ['core', 'admin'] }),
      );
    });

    it('should show error for non-existent bundle', async () => {
      setFailure(new core.BundleNotFoundError('nonexistent'), 'nonexistent');
      await bundleCommand({ name: ['nonexistent'] });

      expect(console.error).toHaveBeenCalledWith('❌ Bundle "nonexistent" not found.');
      expect(mockGenerateBundles).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ names: ['nonexistent'] }));
      expect(process.exitCode).toBe(1);
    });

    it('reports a prototype-member name as not found', async () => {
      setFailure(new core.BundleNotFoundError('constructor'), 'constructor');

      await bundleCommand({ name: ['constructor'] });

      expect(console.error).toHaveBeenCalledWith('❌ Bundle "constructor" not found.');
      expect(process.exitCode).toBe(1);
    });

    it('reports an unconfigured locale from core and exits 1', async () => {
      setFailure(new core.InvalidBundleLocalesError('Unknown locale "xx": must be defined in the project locales'));

      await bundleCommand({ name: ['core'], locale: ['xx'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ locales: ['xx'] }));
      expect(console.error).toHaveBeenCalledWith('❌ Unknown locale "xx": must be defined in the project locales');
      expect(process.exitCode).toBe(1);
    });

    it('prints a missing-collection warning and exits 0 for a completed bundle', async () => {
      setSingle({ warnings: ["Collection 'deleted' not found in config"], writtenFiles: ['dist/i18n/en.json'] });

      await bundleCommand({ name: ['core'], verbose: true });

      expect(console.error).toHaveBeenCalledWith("  - Collection 'deleted' not found in config");
      expect(process.exitCode).toBe(0);
    });
  });

  describe('project directory', () => {
    it('passes the directory the config was loaded from to generateBundle', async () => {
      await bundleCommand({ name: ['core'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ cwd: '/test' }));
    });
  });

  describe('locale filtering', () => {
    it('should pass single locale filter to generateBundle', async () => {
      await bundleCommand({ name: ['core'], locale: ['en'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          locales: ['en'],
        }),
      );
    });

    it('should pass multiple locales filter to generateBundle', async () => {
      await bundleCommand({ name: ['core'], locale: ['en', 'fr'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          locales: ['en', 'fr'],
        }),
      );
    });

    it('should handle locale filter with spaces', async () => {
      await bundleCommand({ name: ['core'], locale: ['en', 'fr', 'es'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          locales: ['en', 'fr', 'es'],
        }),
      );
    });

    it('should not pass locales when no filter is provided', async () => {
      await bundleCommand({ name: ['core'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          locales: undefined,
        }),
      );
    });
  });

  describe('output modes', () => {
    it('prints a returned legacy type warning on the existing console stream', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      setSingle({
        bundleKey: 'core',
        filesGenerated: 1,
        warnings: [],
        localesProcessed: ['en'],
        typeOutcome: {
          status: 'written',
          path: 'types.ts',
          keysCount: 1,
          warning: "Warning: Bundle 'core': 'typeDist' is deprecated",
        },
      });

      await bundleCommand({ name: ['core'] });

      expect(warn).toHaveBeenCalledWith("Warning: Bundle 'core': 'typeDist' is deprecated");
      warn.mockRestore();
    });

    it('prints the legacy warning before a failed type outcome', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      setSingle({
        typeOutcome: {
          status: 'failed',
          reason: 'disk full',
          warning: "Warning: Bundle 'core': 'typeDist' is deprecated",
        },
      });

      await bundleCommand({ name: ['core'] });

      expect(warn).toHaveBeenCalledWith("Warning: Bundle 'core': 'typeDist' is deprecated");
      expect(console.error).toHaveBeenCalledWith('❌ Type generation failed: disk full');
      warn.mockRestore();
    });

    it('should display normal output for single bundle', async () => {
      setSingle({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en', 'fr', 'es'],
        typeOutcome: { status: 'not-configured' },
      });

      await bundleCommand({ name: ['core'] });

      expect(console.log).toHaveBeenCalledWith('🔄 Generating bundle: core');
      expect(console.log).toHaveBeenCalledWith('  ✅ Files generated: 3');
      expect(console.log).toHaveBeenCalledWith('  ✅ Locales: en, fr, es');
    });

    it('should suppress progress and success output in quiet mode', async () => {
      setSingle();
      await bundleCommand({ name: ['core'], quiet: true });

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should display warnings in quiet mode', async () => {
      setSingle({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: ['Warning 1'],
        localesProcessed: ['en', 'fr'],
        typeOutcome: { status: 'not-configured' },
      });

      await bundleCommand({ name: ['core'], quiet: true });

      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('⚠️  Warnings: 1');
    });

    it('should display errors in quiet mode', async () => {
      setFailure(new Error('Bundle generation failed'));

      await bundleCommand({ name: ['core'], quiet: true });

      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('❌ Bundle generation failed');
    });

    it('should display type generation errors in quiet mode', async () => {
      setSingle({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en'],
        typeOutcome: { status: 'failed', reason: 'Unable to write type file' },
      });

      await bundleCommand({ name: ['core'], quiet: true });

      expect(console.log).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('❌ Type generation failed: Unable to write type file');
      expect(process.exitCode).toBe(1);
    });

    it('should display warnings count when warnings exist', async () => {
      setSingle({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: ['Warning 1', 'Warning 2'],
        localesProcessed: ['en', 'fr'],
        typeOutcome: { status: 'not-configured' },
      });

      await bundleCommand({ name: ['core'] });

      expect(console.error).toHaveBeenCalledWith('⚠️  Warnings: 2');
      expect(console.error).not.toHaveBeenCalledWith('  - Warning 1');
    });

    it('should display warning details in verbose mode', async () => {
      setSingle({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: ['Warning 1', 'Warning 2'],
        localesProcessed: ['en', 'fr'],
        typeOutcome: { status: 'not-configured' },
      });

      await bundleCommand({ name: ['core'], verbose: true });

      expect(vi.mocked(console.error).mock.calls).toEqual([['⚠️  Warnings: 2'], ['  - Warning 1'], ['  - Warning 2']]);
    });

    it('should display locale filter in verbose mode', async () => {
      setSingle();
      await bundleCommand({ name: ['core'], locale: ['en', 'fr'], verbose: true });

      expect(console.log).toHaveBeenCalledWith('  Locales: en, fr');
    });

    it('should display summary for multiple bundles', async () => {
      setTwo(
        {
          bundleKey: 'core',
          filesGenerated: 3,
          warnings: [],
          localesProcessed: ['en', 'fr', 'es'],
          typeOutcome: { status: 'not-configured' },
        },
        {
          bundleKey: 'admin',
          filesGenerated: 2,
          warnings: ['Warning 1'],
          localesProcessed: ['en', 'fr'],
          typeOutcome: { status: 'not-configured' },
        },
      );

      await bundleCommand({ name: ['core', 'admin'] });

      expect(console.log).toHaveBeenCalledWith('\n📊 Summary (2 bundles)');
      expect(console.log).toHaveBeenCalledWith('─'.repeat(50));
      expect(console.log).toHaveBeenCalledWith('  Total files generated: 5');
      expect(console.log).toHaveBeenCalledWith('  Total warnings: 1');
    });

    it('should display warning totals in quiet mode for multiple bundles', async () => {
      setTwo(
        {
          bundleKey: 'core',
          filesGenerated: 3,
          warnings: [],
          localesProcessed: ['en', 'fr', 'es'],
          typeOutcome: { status: 'not-configured' },
        },
        {
          bundleKey: 'admin',
          filesGenerated: 2,
          warnings: ['Warning 1'],
          localesProcessed: ['en', 'fr'],
          typeOutcome: { status: 'not-configured' },
        },
      );

      await bundleCommand({ name: ['core', 'admin'], quiet: true });

      expect(console.log).not.toHaveBeenCalledWith('\n📊 Summary (2 bundles)');
      expect(console.log).not.toHaveBeenCalledWith('  Total files generated: 5');
      expect(console.log).toHaveBeenCalledWith('  Total warnings: 1');
      expect(console.log).toHaveBeenCalledWith('  Run with --verbose to see warning details');
      expect(console.error).toHaveBeenCalledWith('⚠️  Warnings: 1');
      expect(console.error).not.toHaveBeenCalledWith('  - Warning 1');
    });

    it('should display type generation success', async () => {
      setSingle({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en'],
        typeOutcome: { status: 'written', path: 'src/generated/core-tokens.ts', keysCount: 100 },
      });

      await bundleCommand({ name: ['core'] });

      expect(console.log).toHaveBeenCalledWith('  └─ Types: src/generated/core-tokens.ts (100 keys)');
    });

    it('should display type generation skipped (empty)', async () => {
      setSingle({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en'],
        typeOutcome: { status: 'skipped', reason: 'empty-bundle' },
      });

      await bundleCommand({ name: ['core'] });

      expect(console.log).toHaveBeenCalledWith('  └─ Types: Skipped (bundle is empty)');
    });

    it('should display type generation skipped (not-configured reason from result)', async () => {
      setSingle({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en'],
        typeOutcome: { status: 'not-configured' },
      });

      await bundleCommand({ name: ['core'] });

      expect(console.log).toHaveBeenCalledWith('  └─ Types: Skipped (no typeDistFile configured)');
    });

    it('should display type generation skipped (no config)', async () => {
      setSingle({
        bundleKey: 'core',
        filesGenerated: 3,
        warnings: [],
        localesProcessed: ['en'],
        typeOutcome: { status: 'not-configured' },
      });

      await bundleCommand({ name: ['core'] });

      expect(console.log).toHaveBeenCalledWith('  └─ Types: Skipped (no typeDistFile configured)');
    });
  });

  describe('--token-constant-name option', () => {
    it('should pass tokenConstantName to generateBundle when --token-constant-name is provided', async () => {
      await bundleCommand({ name: ['core'], tokenConstantName: 'MY_CUSTOM_TOKENS' });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          names: ['core'],
          overrides: expect.objectContaining({ tokenConstantName: 'MY_CUSTOM_TOKENS' }),
        }),
      );
    });

    it('should error when --token-constant-name is used with multiple bundles via --name', async () => {
      mockGenerateBundles.mockRejectedValueOnce(new core.MultipleBundleConstantNameError());
      await bundleCommand({ name: ['core', 'admin'], tokenConstantName: 'MY_CUSTOM_TOKENS' });

      expect(console.error).toHaveBeenCalledWith(
        '❌ Cannot use --token-constant-name with multiple bundles. Please target a single bundle.',
      );
      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({ names: ['core', 'admin'] }),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should error when --token-constant-name is used in non-TTY mode (all bundles)', async () => {
      // In non-TTY mode with no --name, all bundles are processed
      mockGenerateBundles.mockRejectedValueOnce(new core.MultipleBundleConstantNameError());
      await bundleCommand({ tokenConstantName: 'MY_CUSTOM_TOKENS' });

      expect(console.error).toHaveBeenCalledWith(
        '❌ Cannot use --token-constant-name with multiple bundles. Please target a single bundle.',
      );
      expect(mockGenerateBundles).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ names: undefined }));
    });

    it('should not pass tokenConstantName when not provided', async () => {
      await bundleCommand({ name: ['core'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          overrides: expect.objectContaining({ tokenConstantName: undefined }),
        }),
      );
    });
  });

  describe('--debug-keys option', () => {
    it('passes debugKeysLocale as "99" when --debug-keys flag is set (boolean true)', async () => {
      await bundleCommand({ name: ['core'], debugKeys: true });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          overrides: expect.objectContaining({ debugKeysLocale: '99' }),
        }),
      );
    });

    it('passes debugKeysLocale with custom locale when --debug-keys <locale> is provided', async () => {
      await bundleCommand({ name: ['core'], debugKeys: 'keys' });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          overrides: expect.objectContaining({ debugKeysLocale: 'keys' }),
        }),
      );
    });

    it('passes undefined debugKeysLocale when --debug-keys is not set', async () => {
      await bundleCommand({ name: ['core'] });

      expect(mockGenerateBundles).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          overrides: expect.objectContaining({ debugKeysLocale: undefined }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle generateBundle errors and continue', async () => {
      setPartialFailure('Bundle generation failed');

      await bundleCommand({ name: ['core', 'admin'] });

      expect(console.error).toHaveBeenCalledWith('❌ Bundle generation failed');
      expect(console.log).toHaveBeenCalledWith('🔄 Generating bundle: admin');
      expect(mockGenerateBundles).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
    });

    it('should show error count in summary', async () => {
      setPartialFailure('Failed');

      await bundleCommand({ name: ['core', 'admin'] });

      expect(console.error).toHaveBeenCalledWith('⚠️  1 bundle(s) failed to generate');
    });
  });

  describe('interactive mode (TTY)', () => {
    beforeEach(() => {
      vi.mocked(isInteractiveTerminal).mockReturnValue(true);
    });

    it('should prompt for bundle selection when no --name provided', async () => {
      vi.mocked(prompts).mockResolvedValue({
        bundleOrAll: 'core',
      });

      await bundleCommand({});

      expect(prompts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'bundleOrAll',
            message: 'Select bundle to generate',
          }),
        ]),
        expect.any(Object),
      );
    });

    it('should process all bundles when "All bundles" is selected', async () => {
      vi.mocked(prompts).mockResolvedValue({
        bundleOrAll: '__ALL__',
      });

      await bundleCommand({});

      expect(mockGenerateBundles).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ names: undefined }));
    });

    it('should process single bundle when specific bundle is selected', async () => {
      vi.mocked(prompts).mockResolvedValue({
        bundleOrAll: 'core',
      });

      await bundleCommand({});

      expect(mockGenerateBundles).toHaveBeenCalledWith(mockConfig, expect.objectContaining({ names: ['core'] }));
    });

    it('should error when "All bundles" is selected and --token-constant-name is set', async () => {
      vi.mocked(prompts).mockResolvedValue({
        bundleOrAll: '__ALL__',
      });
      mockGenerateBundles.mockRejectedValueOnce(new core.MultipleBundleConstantNameError());

      await bundleCommand({ tokenConstantName: 'MY_CUSTOM_TOKENS' });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Cannot use --token-constant-name with multiple bundles'),
      );
      expect(mockGenerateBundles).toHaveBeenCalledTimes(1);
    });

    it('should report prompt cancellation and return without exiting or generating', async () => {
      const exit = vi.spyOn(process, 'exit');
      // The user presses Esc: prompts calls onCancel.
      vi.mocked(prompts).mockImplementation(async (questions, options) => {
        const [question] = Array.isArray(questions) ? questions : [questions];
        options?.onCancel?.(question, {});
        return {};
      });

      await expect(bundleCommand({})).resolves.toBeUndefined();

      expect(console.error).toHaveBeenCalledWith('❌ Bundle generation cancelled.');
      expect(mockGenerateBundles).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(0);
      exit.mockRestore();
    });
  });
});
