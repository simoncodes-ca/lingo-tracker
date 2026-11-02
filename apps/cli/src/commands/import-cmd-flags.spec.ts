import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';
import { registerFlags } from '../runner/flag-record';
import {
  IMPORT_FLAGS,
  type ImportPromptContext,
  type ResolvedImportOptions,
  resolveImportFlags,
} from './import-cmd-flags';
import type { ImportCommandOptions } from './import-options';
import { type OrderedResolvingFlagRecords, flagQuestions } from '../runner/flag-record';

vi.mock('@simoncodes-ca/core', () => {
  throw new Error('Flag records must load without core or command handlers.');
});

const flagCases: Record<string, { argv: string[]; value: unknown }> = {
  format: { argv: ['--format', 'json'], value: 'json' },
  source: { argv: ['--source', 'messages.json'], value: 'messages.json' },
  locale: { argv: ['--locale', 'fr'], value: 'fr' },
  collection: { argv: ['--collection', 'main'], value: 'main' },
  strategy: { argv: ['--strategy', 'migration'], value: 'migration' },
  updateComments: { argv: ['--update-comments'], value: true },
  updateTags: { argv: ['--update-tags'], value: true },
  preserveStatus: { argv: ['--preserve-status'], value: true },
  createMissing: { argv: ['--create-missing'], value: true },
  validateBase: { argv: ['--no-validate-base'], value: false },
  dryRun: { argv: ['--dry-run'], value: true },
  verbose: { argv: ['--verbose'], value: true },
};
const context: ImportPromptContext = {
  configuredLocales: ['en', 'fr'],
  baseLocale: 'en',
  sourceExists: () => true,
  sourceFormat: () => undefined,
};

// @ts-expect-error A prompted import record must specify its prompt order.
const _missingOrder: OrderedResolvingFlagRecords<
  ImportCommandOptions,
  ImportPromptContext,
  Record<keyof Required<ImportCommandOptions>, object>
>['source'] = {
  flags: '--source <path>',
  description: 'Source',
  defaultValue: undefined,
  prompt: () => [],
  resolve: () => ({}),
};
// @ts-expect-error The locale record must return its locale field.
const _missingLocaleRule: typeof IMPORT_FLAGS.locale = { ...IMPORT_FLAGS.locale, resolve: () => ({}) };

describe('import flag records', () => {
  for (const [key, record] of Object.entries(IMPORT_FLAGS)) {
    it(`defines registration, defaults and resolution for ${key}`, () => {
      const command = new Command();
      registerFlags(command, { [key]: record });
      const testCase = flagCases[key];
      expect(testCase).toBeDefined();
      command.parse(testCase.argv, { from: 'user' });
      expect(command.opts()[key]).toEqual(testCase.value);
    });
  }

  it('covers every command options key and registers without loading handlers', () => {
    const registrations = IMPORT_FLAGS;
    const command = new Command();
    registerFlags(command, registrations);
    expect(command.options).toHaveLength(13);
    command.parse([], { from: 'user' });
    expect(command.opts()).toEqual({ dryRun: false, verbose: false });
    const helpDefaults = {
      strategy: 'translation-service',
      updateComments: false,
      updateTags: false,
      preserveStatus: false,
      createMissing: false,
      validateBase: true,
    };
    for (const [key, value] of Object.entries(helpDefaults)) {
      expect(command.options.find((option) => option.attributeName() === key)?.description).toContain(
        `(default: ${JSON.stringify(value)})`,
      );
    }
  });

  it('builds every import prompt in dependency order and omits supplied flags', () => {
    const questions = flagQuestions<ImportCommandOptions, ImportPromptContext>(IMPORT_FLAGS, {}, context);
    expect(questions.map((question) => question.name)).toEqual([
      'source',
      'format',
      'strategy',
      'locale',
      'locale',
      'locale',
      'locale',
      'locale',
      'updateComments',
      'updateTags',
      'createMissing',
    ]);
    const visible = questions.filter((question) =>
      typeof question.type === 'function'
        ? question.type(undefined, { strategy: 'migration' }, question)
        : question.type,
    );
    expect(visible.map((question) => question.name)).toEqual([
      'source',
      'format',
      'strategy',
      'locale',
      'updateComments',
      'updateTags',
      'createMissing',
    ]);
    expect(
      flagQuestions<ImportCommandOptions, ImportPromptContext>(
        IMPORT_FLAGS,
        {
          source: 'messages.json',
          format: 'json',
          strategy: 'migration',
          locale: 'fr',
          updateComments: false,
          updateTags: false,
          createMissing: false,
        },
        context,
      ),
    ).toEqual([]);
  });

  it('resolves the complete result while rejecting omitted fields at compile time', () => {
    const options = resolveImportFlags({});
    expect(options).toEqual({
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
    });
    const { locale, ...withoutLocale } = options;
    // @ts-expect-error A complete result must include locale, even when undefined.
    const _missingLocale: ResolvedImportOptions = withoutLocale;
    expect(locale).toBeUndefined();
  });
});
