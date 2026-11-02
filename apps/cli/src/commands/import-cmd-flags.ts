import type { ImportFormat, ImportRunOptions } from '@simoncodes-ca/core';
import {
  canImportLocale,
  DEFAULT_IMPORT_STRATEGY,
  IMPORT_STRATEGIES,
  type ImportStrategy,
  importableLocales,
  importStrategyPolicy,
  isImportStrategy,
} from '@simoncodes-ca/domain';
import type prompts from 'prompts';
import { importHelpText } from '../runner/help-text';
import { flagName, resolveFlag, type OrderedResolvingFlagRecords } from '../runner/flag-record';
import type { ImportCommandOptions, ImportOptionsContext } from './import-options';

type ImportAnswers = ImportCommandOptions & Readonly<Record<string, unknown>>;
export interface ImportPromptContext extends ImportOptionsContext {
  readonly sourceFormat: (source: string) => ImportFormat | undefined;
}
export type ResolvedImportOptions = Required<Omit<ImportRunOptions, 'locale' | 'onProgress'>> &
  Pick<ImportRunOptions, 'onProgress'> & {
    source: string | undefined;
    format: ImportFormat | undefined;
    locale: string | undefined;
  };
type ImportOptionResults = {
  [Key in keyof Required<ImportCommandOptions>]: Pick<ResolvedImportOptions, Extract<Key, keyof ResolvedImportOptions>>;
};

const strategyDefaults = importStrategyPolicy(DEFAULT_IMPORT_STRATEGY).defaults;
const migration = (values: ImportCommandOptions) => resolveStrategy(values.strategy) === 'migration';
const migrationAdvice = (flag: string) => (values: ImportCommandOptions) => {
  if (migration(values)) return undefined;
  const strategy = resolveStrategy(values.strategy);
  return values.strategy === undefined
    ? `${flag} has no effect with the default --strategy ${strategy}.`
    : `${flag} has no effect with --strategy ${strategy}.`;
};
const migrationDefaults = importStrategyPolicy('migration').defaults;
/** Strategy drives locale choices and migration-only prompt visibility. */
function importOptionState(
  values: ImportCommandOptions,
  context: Pick<ImportOptionsContext, 'configuredLocales' | 'baseLocale'>,
) {
  const strategy = resolveStrategy(values.strategy);
  return {
    strategy,
    locales: importableLocales(context.configuredLocales, context.baseLocale, strategy),
  };
}

/** Validate Commander flags and prompt answers before reading the strategy policy. */
export function resolveStrategy(value: unknown): ImportStrategy {
  if (value === undefined) value = IMPORT_FLAGS.strategy.helpDefault;
  if (isImportStrategy(value)) return value;
  throw new Error(
    `Invalid ${flagName(IMPORT_FLAGS.strategy)} "${String(value)}". Valid strategies: ${IMPORT_STRATEGIES.join(', ')}.`,
  );
}

export const IMPORT_FLAGS: OrderedResolvingFlagRecords<ImportCommandOptions, ImportPromptContext, ImportOptionResults> =
  {
    format: {
      flags: '-f, --format <format>',
      description: 'Import format (xliff | json) - auto-detected from file extension if omitted',
      promptOrder: 1,
      mergePromptAnswers: true,
      prompt: (options, context) => {
        const questions: prompts.PromptObject[] = [];
        if (!options.format) {
          questions.push({
            // Keep format unset for core when the source extension is sufficient.
            type: (_prev: unknown, values: ImportAnswers) => {
              return context.sourceFormat(values.source ?? '') ? null : 'select';
            },
            name: 'format',
            message: 'Select import format:',
            choices: [
              { title: 'JSON', value: 'json', description: 'JSON format (flat or hierarchical)' },
              { title: 'XLIFF 1.2', value: 'xliff', description: 'XLIFF format for professional translation services' },
            ],
          });
        }

        return questions;
      },
      resolve: (values) => ({ format: values.format }),
    },
    source: {
      flags: '-s, --source <path>',
      description: 'Path to import file (required)',
      promptOrder: 0,
      prompt: (options, context) => {
        const { sourceExists } = context;
        const questions: prompts.PromptObject[] = [];
        if (!options.source) {
          questions.push({
            type: 'text',
            name: 'source',
            message: 'Enter path to import file:',
            validate: (value: string) => {
              if (!value || value.trim() === '') {
                return 'Source file is required';
              }
              if (!sourceExists(value)) {
                return `File not found: ${value}`;
              }
              return true;
            },
          });
        }

        return questions;
      },
      resolve: (values) => ({ source: values.source }),
    },
    locale: {
      flags: '-l, --locale <locale>',
      description: 'Target locale for import (e.g., es, fr-ca)',
      promptOrder: 3,
      mergePromptAnswers: true,
      prompt: (options, context) => {
        const { configuredLocales, baseLocale } = context;
        const questions: prompts.PromptObject[] = [];
        const stateOf = (answers: ImportAnswers) => importOptionState(answers, { configuredLocales, baseLocale });
        if (!options.locale) {
          questions.push({
            type: (_prev: unknown, values: ImportAnswers) => (stateOf(values).locales.length > 0 ? 'select' : null),
            name: 'locale',
            message: 'Select target locale for import:',
            choices: (_prev: unknown, values: ImportAnswers) =>
              stateOf(values).locales.map((loc) => ({
                title: loc === baseLocale ? `${loc} (base locale)` : loc,
                value: loc,
              })),
            validate: () => true,
          });
          // prompts does not pass prior answers to validate. Mutually exclusive text
          // descriptors bind an immutable policy instead of changing state in type.
          for (const strategy of IMPORT_STRATEGIES) {
            questions.push({
              type: (_prev: unknown, values: ImportAnswers) => {
                const state = stateOf(values);
                return state.strategy === strategy && state.locales.length === 0 ? 'text' : null;
              },
              name: 'locale',
              message: 'Select target locale for import:',
              choices: [],
              validate: (value: string) => {
                if (!value || value.trim() === '') return 'Locale is required';
                return (
                  canImportLocale(value, baseLocale, strategy) ||
                  `Cannot import into base locale "${baseLocale}" with strategy "${strategy}"`
                );
              },
            });
          }
        }

        return questions;
      },
      resolve: (values) => ({ locale: values.locale }),
    },
    collection: {
      flags: '-c, --collection <name>',
      description: 'Target collection to import into',
      resolve: () => ({}),
    },
    // flagDefault uses helpDefault ?? defaultValue ?? runtimeDefault, preserving the help-only strategy prompt initial.
    strategy: {
      flags: '--strategy <strategy>',
      description: 'Import strategy (translation-service | verification | migration | update)',
      helpDefault: DEFAULT_IMPORT_STRATEGY,
      promptOrder: 2,
      prompt: (options, _context, defaultValue) => {
        const questions: prompts.PromptObject[] = [];
        if (!options.strategy) {
          questions.push({
            type: 'select',
            name: 'strategy',
            message: 'Select import strategy:',
            choices: [
              {
                title: 'Translation Service',
                value: defaultValue,
                description: 'Import from professional translation services (default)',
              },
              { title: 'Verification', value: 'verification', description: 'Language expert verification workflow' },
              { title: 'Migration', value: 'migration', description: 'Migrate from another translation system' },
              { title: 'Update', value: 'update', description: 'Bulk update existing translations' },
            ],
          });
        }

        return questions;
      },
      resolve: (values) => ({ strategy: resolveStrategy(values.strategy) }),
    },
    updateComments: {
      flags: '--update-comments',
      description: `Update resource comments from import data (migration: ${migrationDefaults.updateComments})`,
      helpDefault: strategyDefaults.updateComments,
      promptOrder: 4,
      appliesWhen: migration,
      inapplicableMessage: migrationAdvice('--update-comments'),
      prompt: () => [
        {
          type: 'confirm',
          name: 'updateComments',
          message: 'Update comments from import data?',
          initial: migrationDefaults.updateComments,
        },
      ],
      resolve: (values) => ({ updateComments: values.updateComments }),
    },
    updateTags: {
      flags: '--update-tags',
      description: `Update resource tags from rich JSON (migration: ${migrationDefaults.updateTags})`,
      helpDefault: strategyDefaults.updateTags,
      promptOrder: 5,
      appliesWhen: migration,
      inapplicableMessage: migrationAdvice('--update-tags'),
      prompt: () => [
        {
          type: 'confirm',
          name: 'updateTags',
          message: 'Update tags from import data?',
          initial: migrationDefaults.updateTags,
        },
      ],
      resolve: (values) => ({ updateTags: values.updateTags }),
    },
    preserveStatus: {
      flags: '--preserve-status',
      description: 'Allow rich JSON to specify status (advanced)',
      helpDefault: false,
      resolve: (values, defaultValue) => ({ preserveStatus: values.preserveStatus ?? Boolean(defaultValue) }),
    },
    createMissing: {
      flags: '--create-missing',
      description: `Create new resources if they don't exist (migration: ${migrationDefaults.createMissing})`,
      helpDefault: strategyDefaults.createMissing,
      promptOrder: 6,
      appliesWhen: migration,
      inapplicableMessage: migrationAdvice('--create-missing'),
      prompt: () => [
        {
          type: 'confirm',
          name: 'createMissing',
          message: 'Create missing resources?',
          initial: migrationDefaults.createMissing,
        },
      ],
      resolve: (values) => ({ createMissing: values.createMissing }),
    },
    validateBase: {
      flags: '--no-validate-base',
      description: 'Do not warn when source base value differs from existing',
      helpDefault: true,
      positive: { flags: '--validate-base', description: 'Warn if source base value differs from existing' },
      resolve: (values, defaultValue) => ({ validateBase: values.validateBase ?? Boolean(defaultValue) }),
    },
    dryRun: {
      flags: '--dry-run',
      description: 'Show what would be imported without modifying files',
      defaultValue: false,
      resolve: (values) => ({ dryRun: values.dryRun }),
    },
    verbose: {
      flags: '--verbose',
      description: 'Show detailed import progress',
      defaultValue: false,
      resolve: (values) => ({ verbose: values.verbose }),
    },
  };

/** Every resolved field must be present, including fields whose value is undefined. */
export function resolveImportFlags(values: ImportCommandOptions): ResolvedImportOptions {
  return {
    ...resolveFlag(IMPORT_FLAGS.source, values),
    ...resolveFlag(IMPORT_FLAGS.format, values),
    ...resolveFlag(IMPORT_FLAGS.locale, values),
    ...resolveFlag(IMPORT_FLAGS.strategy, values),
    ...resolveFlag(IMPORT_FLAGS.updateComments, values),
    ...resolveFlag(IMPORT_FLAGS.updateTags, values),
    ...resolveFlag(IMPORT_FLAGS.preserveStatus, values),
    ...resolveFlag(IMPORT_FLAGS.createMissing, values),
    ...resolveFlag(IMPORT_FLAGS.validateBase, values),
    ...resolveFlag(IMPORT_FLAGS.dryRun, values),
    ...resolveFlag(IMPORT_FLAGS.verbose, values),
  };
}

export const IMPORT_REGISTRATION = {
  name: 'import',
  description: 'Import translation resources from XLIFF or JSON',
  flags: IMPORT_FLAGS,
  helpText: () => importHelpText(IMPORT_FLAGS),
};
