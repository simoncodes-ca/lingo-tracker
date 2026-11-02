import { IMPORT_STRATEGIES } from '@simoncodes-ca/domain';
import type prompts from 'prompts';
import { describe, expect, it, vi } from 'vitest';
import { type ImportCommandOptions, importQuestions, resolveImportOptions } from './import-options';

const context = { configuredLocales: ['en', 'es', 'fr'], baseLocale: 'en', sourceExists: () => true };
function typeOf(question: prompts.PromptObject, answers: Record<string, unknown>) {
  return typeof question.type === 'function' ? question.type(undefined, answers, question) : question.type;
}
function visible(
  flags: ImportCommandOptions,
  answers: Record<string, unknown>,
  configuredLocales = context.configuredLocales,
) {
  return importQuestions(flags, { ...context, configuredLocales }).filter((q) => typeOf(q, answers));
}

describe('import Run Options Resolution', () => {
  const defaults = {
    source: undefined,
    format: undefined,
    locale: undefined,
    strategy: 'translation-service',
    updateComments: undefined,
    updateTags: undefined,
    preserveStatus: false,
    createMissing: undefined,
    validateBase: true,
    dryRun: undefined,
    verbose: undefined,
  };
  const cases: { label: string; answers: ImportCommandOptions; expected: Partial<ImportCommandOptions> }[] = [
    {
      label: 'defaults',
      expected: {},
      answers: {},
    },
    {
      label: 'translation-service',
      expected: {
        strategy: 'translation-service',
      },
      answers: {
        strategy: 'translation-service',
      },
    },
    {
      label: 'verification',
      expected: {
        strategy: 'verification',
      },
      answers: {
        strategy: 'verification',
      },
    },
    {
      label: 'migration',
      expected: {
        strategy: 'migration',
      },
      answers: {
        strategy: 'migration',
      },
    },
    {
      label: 'update',
      expected: {
        strategy: 'update',
      },
      answers: {
        strategy: 'update',
      },
    },
    {
      label: 'answers',
      expected: {
        source: 'data.json',
        format: 'json',
        locale: 'fr',
        strategy: 'migration',
        updateComments: true,
        updateTags: true,
        createMissing: true,
        preserveStatus: true,
        validateBase: false,
        dryRun: true,
        verbose: true,
      },
      answers: {
        source: 'data.json',
        format: 'json',
        locale: 'fr',
        strategy: 'migration',
        updateComments: true,
        updateTags: true,
        createMissing: true,
        preserveStatus: true,
        validateBase: false,
        dryRun: true,
        verbose: true,
      },
    },
    {
      label: 'merged false options',
      expected: {
        strategy: 'update',
        updateComments: false,
        updateTags: false,
        preserveStatus: false,
        createMissing: false,
        validateBase: false,
        dryRun: false,
        verbose: false,
      },
      answers: {
        strategy: 'update',
        updateComments: false,
        updateTags: false,
        preserveStatus: false,
        createMissing: false,
        validateBase: false,
        dryRun: false,
        verbose: false,
      },
    },
    {
      label: 'merged prompt value',
      expected: {
        strategy: 'verification',
        locale: 'fr',
      },
      answers: {
        strategy: 'verification',
        locale: 'fr',
      },
    },
    {
      label: 'source detection remains a core responsibility',
      expected: {
        source: 'data.JSON',
      },
      answers: {
        source: 'data.JSON',
      },
    },
  ];
  for (const { label, answers, expected } of cases) {
    it(`resolves ${label}`, () => expect(resolveImportOptions(answers)).toEqual({ ...defaults, ...expected }));
  }

  for (const strategy of IMPORT_STRATEGIES) {
    it(`uses ${strategy} policy for locale choices and migration prompts`, () => {
      const questions = visible({}, { source: 'data.json', strategy });
      const locale = questions.find((q) => q.name === 'locale');
      expect(locale).toBeDefined();
      const choices = locale?.choices;
      expect(typeof choices === 'function' ? choices(undefined, { strategy }, locale) : choices).toEqual([
        ...(strategy === 'migration' ? [{ title: 'en (base locale)', value: 'en' }] : []),
        { title: 'es', value: 'es' },
        { title: 'fr', value: 'fr' },
      ]);
      expect(
        questions
          .filter((q) => ['updateComments', 'updateTags', 'createMissing'].includes(String(q.name)))
          .map((q) => q.name),
      ).toEqual(strategy === 'migration' ? ['updateComments', 'updateTags', 'createMissing'] : []);
      expect(questions.filter((q) => q.name === 'locale')).toHaveLength(1);
    });

    it(`validates a text locale for ${strategy} without a type callback changing state`, () => {
      const questions = visible({ source: 'data.json' }, { strategy }, []);
      const locale = questions.find((q) => q.name === 'locale');
      expect(questions.filter((q) => q.name === 'locale')).toHaveLength(1);
      expect(locale?.validate?.('', {}, locale)).toBe('Locale is required');
      expect(locale?.validate?.('fr', {}, locale)).toBe(true);
      expect(locale?.validate?.('en', {}, locale)).toBe(
        strategy === 'migration' ? true : `Cannot import into base locale "en" with strategy "${strategy}"`,
      );
    });
  }

  const formats: { flags: ImportCommandOptions; answers: Record<string, unknown>; expected: boolean }[] = [
    { flags: { source: 'data.json' }, answers: {}, expected: false },
    { flags: { source: 'data.XLIFF' }, answers: {}, expected: false },
    { flags: {}, answers: { source: 'data.xlf' }, expected: false },
    { flags: { source: 'data.txt' }, answers: {}, expected: true },
    { flags: {}, answers: { source: 'data' }, expected: true },
    { flags: { source: 'data.txt', format: 'json' }, answers: {}, expected: false },
    { flags: { source: 'data.json' }, answers: { source: 'data.txt' }, expected: false },
  ];
  for (const { flags, answers, expected } of formats) {
    it(`shows format=${expected} for ${JSON.stringify({ flags, answers })}`, () => {
      expect(visible(flags, answers).some((q) => q.name === 'format')).toBe(expected);
    });
  }

  it('keeps visible prompt order, messages and migration initials', () => {
    expect(
      visible({}, { source: 'data.txt', strategy: 'migration' }).map(({ name, message, initial }) => [
        name,
        message,
        initial,
      ]),
    ).toEqual([
      ['source', 'Enter path to import file:', undefined],
      ['format', 'Select import format:', undefined],
      ['strategy', 'Select import strategy:', undefined],
      ['locale', 'Select target locale for import:', undefined],
      ['updateComments', 'Update comments from import data?', true],
      ['updateTags', 'Update tags from import data?', true],
      ['createMissing', 'Create missing resources?', true],
    ]);
  });
  it('does not ask options supplied as false flags', () => {
    expect(
      visible(
        {
          source: 'data.json',
          locale: 'fr',
          strategy: 'migration',
          updateComments: false,
          updateTags: false,
          createMissing: false,
        },
        {},
      ).map((q) => q.name),
    ).toEqual([]);
  });
  it('uses the source existence context without performing I/O', () => {
    const sourceExists = vi.fn(() => false);
    const question = importQuestions({}, { ...context, sourceExists }).find((q) => q.name === 'source');
    expect(question?.validate?.(' ', {}, question)).toBe('Source file is required');
    expect(sourceExists).not.toHaveBeenCalled();
    expect(question?.validate?.('missing.json', {}, question)).toBe('File not found: missing.json');
    expect(sourceExists).toHaveBeenCalledWith('missing.json');
  });
  it('validates strategy flags before required options and prompt answers during resolution', () => {
    const strategy = 'invalid' as ImportCommandOptions['strategy'];
    const message =
      'Invalid --strategy "invalid". Valid strategies: translation-service, verification, migration, update.';
    expect(() => importQuestions({ strategy }, context)).toThrow(message);
    expect(() => resolveImportOptions({ strategy })).toThrow(message);
  });
  it('does not mutate flags, answers, or context during resolution and visibility checks', () => {
    const flags = Object.freeze({ source: 'data.json', strategy: 'migration' as const });
    const answers = Object.freeze({ locale: 'en', updateComments: false });
    expect(resolveImportOptions({ ...flags, ...answers })).toMatchObject({
      strategy: 'migration',
      locale: 'en',
      updateComments: false,
    });
    const questions = importQuestions(flags, context);
    for (const q of questions) typeOf(q, answers);
    expect(flags).toEqual({ source: 'data.json', strategy: 'migration' });
  });

  // Moved from import-cmd.spec.ts; collection inheritance remains covered there.
  it('offers the base locale too when the chosen strategy is migration', () => {
    const locale = visible({ source: 'data.json', format: 'json' }, { strategy: 'migration' }).find(
      (q) => q.name === 'locale',
    );
    const choices = locale?.choices;
    expect(typeof choices === 'function' ? choices(undefined, { strategy: 'migration' }, locale) : choices).toEqual([
      { title: 'en (base locale)', value: 'en' },
      { title: 'es', value: 'es' },
      { title: 'fr', value: 'fr' },
    ]);
  });
  it('asks migration switches left unset by registration', () => {
    expect(
      visible({ source: 'data.json', format: 'json', strategy: 'migration' }, {})
        .filter((q) => ['updateComments', 'updateTags', 'createMissing'].includes(String(q.name)))
        .map((q) => q.initial),
    ).toEqual([true, true, true]);
  });
});
