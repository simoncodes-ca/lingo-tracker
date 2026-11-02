import {
  InvalidConfigError,
  type LingoTrackerConfig,
  type TranslateRequest,
  TranslationError,
  type TranslationProvider,
} from '@simoncodes-ca/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandCancelledError } from '../runner/command-runner';
import { type CommandProject, createCommandProject } from '../testing/command-project';
import { createTranslateLocaleCommand, translateLocaleCommand } from './translate-locale';

function createProvider(
  translate: (request: TranslateRequest) => string = ({ text, targetLocale }) => `[${targetLocale}] ${text}`,
): TranslationProvider & { readonly calls: TranslateRequest[][] } {
  const calls: TranslateRequest[][] = [];
  return {
    calls,
    translate: (requests) => {
      calls.push([...requests]);
      return Promise.resolve(
        requests.map((request) => ({ translatedText: translate(request), provider: 'in-memory' })),
      );
    },
    getCapabilities: () => ({ supportsBatch: true, maxBatchSize: Number.MAX_SAFE_INTEGER, supportsFormality: false }),
  };
}

const noDelay = (): Promise<void> => Promise.resolve();

const CONFIG: LingoTrackerConfig = {
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  baseLocale: 'en',
  locales: ['en', 'fr', 'de'],
  translation: { enabled: true, provider: 'google-translate', apiKeyEnv: 'TRANSLATE_CLI_SPEC_KEY', delayMs: 0 },
  collections: { main: { translationsFolder: 'src/i18n' } },
};

describe('translateLocaleCommand', () => {
  let project: CommandProject;
  let provider: ReturnType<typeof createProvider>;
  beforeEach(() => {
    project = createCommandProject({ ...CONFIG, translation: undefined });
    project.seed('a.b', 'Save');
    project.configure(CONFIG);
    provider = createProvider();
  });
  afterEach(() => project.cleanup());
  const command = () => createTranslateLocaleCommand({ provider, delay: noDelay });

  it('translates the locale in the only collection', async () => {
    const result = await project.run(command(), { locale: 'fr' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Translated: 1');
    expect(project.json('src/i18n/a/resource_entries.json')).toMatchObject({ b: { fr: '[fr] Save' } });
  });
  it('passes a progress callback with --verbose', async () => {
    const result = await project.run(command(), { locale: 'fr', verbose: true });
    expect(result.stdout).toContain('[batch 1/1] translated: 1, skipped: 0, failed: 0');
  });
  it('exits 1 when some entries failed', async () => {
    provider = createProvider(() => {
      throw new Error('quota');
    });
    const result = await project.run(command(), { locale: 'fr' });
    expect(result.stderr).toContain('❌ Errors (1):\n  - a.b: quota');
    expect(result.exitCode).toBe(1);
  });
  it('reports a typed provider startup error and exits 1', async () => {
    const result = await project.run(translateLocaleCommand, { locale: 'fr' });
    expect(result.stderr).toMatch(/^❌ /);
    expect(result.stderr).toContain('TRANSLATE_CLI_SPEC_KEY');
    expect(result.exitCode).toBe(1);
  });
  it('keeps a typed provider error in the batch failure report', async () => {
    const error = new TranslationError('API key missing', 'MISSING_API_KEY', false);
    // A provider error is now exercised through the real batch and printed in failures.
    provider = createProvider(() => {
      throw error;
    });
    const result = await project.run(command(), { locale: 'fr' });
    expect(result.stderr).toContain('❌ Errors (1):\n  - a.b: API key missing');
    expect(error.code).toBe('MISSING_API_KEY');
    expect(result.exitCode).toBe(1);
  });
  it('keeps a disabled-translation error and prints its configuration hint', async () => {
    project.configure({ ...CONFIG, translation: undefined });
    const result = await project.run(command(), { locale: 'fr' });
    expect(result.stderr).toContain(
      'Auto-translation is not enabled for collection "main". Set translation.enabled = true',
    );
    expect(result.exitCode).toBe(1);
  });
  it('prints a typed error cause under the translation failure', async () => {
    const error = new InvalidConfigError('Cannot translate', { cause: new Error('API request failed') });
    const failing = createTranslateLocaleCommand({
      delay: async () => {
        throw error;
      },
      provider,
    });
    project.configure({ ...CONFIG, translation: undefined });
    project.seed('a.c', 'Cancel');
    project.configure({
      ...CONFIG,
      translation: {
        ...CONFIG.translation,
        enabled: true,
        provider: 'google-translate',
        apiKeyEnv: 'KEY',
        batchSize: 1,
      },
    });
    const result = await project.run(failing, { locale: 'fr' });
    expect(result.stderr).toContain('❌ Cannot translate');
    expect(result.stderr).toContain('API request failed');
  });
  it.each([
    ['the base locale', 'en', 'Cannot translate to the base locale "en".'],
    ['an unconfigured locale', 'ja', 'Locale "ja" is not configured. Available locales: en, fr, de'],
  ])('exits 1 for %s', async (_label, locale, message) => {
    const result = await project.run(command(), { locale });
    expect(result.stderr).toContain(message);
    expect(provider.calls).toHaveLength(0);
    expect(result.exitCode).toBe(1);
  });
  it.each([
    ['disabled', { ...CONFIG, translation: { enabled: false, provider: 'none', apiKeyEnv: 'NONE' } }],
    ['absent', { ...CONFIG, translation: undefined }],
  ])('exits 1 with a configuration hint, before any core call, when auto-translation is %s', async (_label, config) => {
    project.configure(config);
    const result = await project.run(command(), { locale: 'fr' });
    expect(result.stderr).toContain('Set translation.enabled = true');
    expect(provider.calls).toHaveLength(0);
    expect(result.exitCode).toBe(1);
  });
  it('exits 1 when the collection has no target locales', async () => {
    project.configure({ ...CONFIG, locales: ['en'] });
    const result = await project.run(command(), { locale: 'fr' });
    expect(result.stderr).toContain('No target locales configured. Add locales other than the base locale "en".');
    expect(result.exitCode).toBe(1);
  });
  it('exits 1 without --locale in non-interactive mode', async () => {
    const result = await project.run(command(), {}, { interactive: false });
    expect(result.stderr).toContain('Missing required options in non-interactive mode: --locale');
    expect(result.exitCode).toBe(1);
  });
  describe('interactive', () => {
    it('offers the target locales', async () => {
      const result = await project.run(
        command(),
        {},
        {
          interactive: true,
          ask: async (questions) => {
            expect(questions).toMatchObject([
              {
                name: 'locale',
                choices: [
                  { title: 'fr', value: 'fr' },
                  { title: 'de', value: 'de' },
                ],
              },
            ]);
            return { locale: 'de' };
          },
        },
      );
      expect(result.exitCode).toBe(0);
      expect(provider.calls[0]?.[0]?.targetLocale).toBe('de');
    });
    it('offers only collection target locales and passes the prompted choice to core', async () => {
      project.configure({
        ...CONFIG,
        collections: { main: { translationsFolder: 'src/i18n', baseLocale: 'fr', locales: ['fr', 'de'] } },
      });
      const result = await project.run(
        command(),
        {},
        {
          interactive: true,
          ask: async (questions) => {
            expect(questions).toMatchObject([{ choices: [{ title: 'de', value: 'de' }] }]);
            return { locale: 'de' };
          },
        },
      );
      expect(result.exitCode).toBe(0);
    });
    it('refuses a collection with auto-translation disabled before asking for a locale', async () => {
      project.configure({ ...CONFIG, translation: undefined });
      const ask = vi.fn(async () => {
        throw new Error('unexpected prompt');
      });
      const result = await project.run(
        command(),
        {},
        {
          interactive: true,
          ask,
        },
      );
      expect(result.stderr).toContain('Set translation.enabled = true');
      expect(ask).not.toHaveBeenCalled();
      expect(result.exitCode).toBe(1);
    });
    it('refuses a collection with no target locales before asking for a locale', async () => {
      project.configure({ ...CONFIG, locales: ['en'] });
      const ask = vi.fn(async () => {
        throw new Error('unexpected prompt');
      });
      const result = await project.run(
        command(),
        {},
        {
          interactive: true,
          ask,
        },
      );
      expect(result.stderr).toContain('No target locales configured');
      expect(ask).not.toHaveBeenCalled();
      expect(result.exitCode).toBe(1);
    });
    it.each([
      ['en', 'Cannot translate to the base locale "en".'],
      ['ja', 'Locale "ja" is not configured. Available locales: en, fr, de'],
    ])('refuses an invalid locale flag %s before prompting or running', async (locale, message) => {
      const ask = vi.fn(async () => {
        throw new Error('unexpected prompt');
      });
      const result = await project.run(
        command(),
        { locale },
        {
          interactive: true,
          ask,
        },
      );
      expect(result.stderr).toContain(message);
      expect(provider.calls).toHaveLength(0);
      expect(ask).not.toHaveBeenCalled();
      expect(result.exitCode).toBe(1);
    });
    it('cancelling prints one cancel line and exits 0', async () => {
      const result = await project.run(
        command(),
        {},
        {
          interactive: true,
          ask: async () => {
            throw new CommandCancelledError();
          },
        },
      );
      expect(result.stderr).toContain('Translate locale cancelled.');
      expect(provider.calls).toHaveLength(0);
      expect(result.exitCode).toBe(0);
    });
  });
});
