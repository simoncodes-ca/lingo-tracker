import type { ErrorCode, ErrorKind, ErrorView } from '@simoncodes-ca/core';
import { describe, expect, it, vi } from 'vitest';
import {
  errorAdapterFixtures,
  ERROR_CODES,
  PROVIDER_ERROR_CODES,
  internalErrors as core,
} from '@simoncodes-ca/core/testing';
import {
  ADD_RESOURCE_COMMAND_NAME,
  CLI_BY_CODE,
  type CliErrorWording,
  cliErrorWording,
  printCliError,
} from './cli-error-wording';
import { defineCommand, runCommand } from './command-runner';

interface Case {
  readonly error: core.LingoTrackerError;
  readonly wording: CliErrorWording;
}
function changed(error: core.LingoTrackerError, wording: CliErrorWording): Case {
  return { error, wording };
}

const cases = {
  INVALID_COLLECTION: changed(new core.InvalidCollectionError('Sample failure', { problem: 'tag-conflict' }), {
    message: '--set-tags cannot be combined with --add-tag or --remove-tag',
  }),
  AUTO_TRANSLATION_DISABLED: changed(new core.AutoTranslationDisabledError('main'), {
    message:
      'Auto-translation is not enabled for collection "main". Set translation.enabled = true in your configuration',
  }),
  BRACED_PLACEHOLDER: changed(new core.BracedPlaceholderError('en', ['first', 'second']), {
    message: 'Value for locale "en" is not valid:',
    details: ['first', 'second'],
  }),
  BUNDLE_NOT_FOUND: changed(new core.BundleNotFoundError('main'), { message: 'Bundle "main" not found.' }),
  CONFIG_NOT_FOUND: changed(new core.ConfigNotFoundError('/project/.lingo-tracker.json'), {
    message: 'Configuration file .lingo-tracker.json not found.',
    hint: 'Run "lingo-tracker init" to initialize a project.',
  }),
  CONFIG_PARSE_FAILED: changed(new core.ConfigParseError('/project/.lingo-tracker.json', 'bad JSON'), {
    message: 'Failed to parse configuration file: bad JSON',
  }),
  GLOSSARY_EXTRACTOR_ERROR: changed(new core.GlossaryExtractorError('ai'), {
    message: 'The "ai" extractor is not yet implemented. Use --extractor ngram (the default).',
  }),
  IMPORT_SOURCE_ERROR: changed(
    new core.ImportSourceError('Source unavailable', { cause: new Error('Source unavailable') }),
    {
      message: 'Import failed: Source unavailable',
      includeCause: false,
    },
  ),
  INVALID_IMPORT_LOCALE: changed(new core.InvalidImportLocaleError('en', 'translation-service'), {
    message:
      'Import failed: Cannot import into base locale "en" with strategy "translation-service". Only "migration" strategy supports base locale imports.',
    includeCause: false,
  }),
  INVALID_PREFERRED_TERMINOLOGY: changed(
    new core.PreferredTerminologyValidationError(
      [{ index: 0, field: 'preferred', code: 'empty', message: 'required' }],
      [{ discouraged: 'old', preferred: '' }],
    ),
    {
      message: 'Preferred terminology not saved:',
      details: ['"old → ": required'],
    },
  ),
  INVALID_PROJECT_TERMS_EDIT: changed(new core.InvalidProjectTermsEditError('Missing edit', 'protected-missing'), {
    message: 'Provide at least one of --add, --remove, --set, --list, or --file',
  }),
  MULTIPLE_BUNDLE_CONSTANT_NAME: changed(new core.MultipleBundleConstantNameError(), {
    message: 'Cannot use --token-constant-name with multiple bundles. Please target a single bundle.',
  }),
  PROTECTED_TERMS_FILE_NOT_SET: changed(new core.ProtectedTermsFileNotSetError('main'), {
    message: 'Collection "main" has no protected terms file. Set one first with --file <path>.',
  }),
  RESOURCE_ALREADY_EXISTS: changed(new core.ResourceAlreadyExistsError('a.b'), {
    message: 'Resource already exists: a.b',
  }),
} satisfies Partial<Record<ErrorCode, Case>>;

const termCases = {
  'protected-conflict': '--set cannot be combined with --add or --remove',
  'protected-missing': 'Provide at least one of --add, --remove, --set, --list, or --file',
  'protected-file-path': 'Core edit message',
  'protected-replacement-conflict': 'Core edit message',
  'preferred-missing': 'Provide one of --list, --add <discouraged> --preferred <preferred>, or --remove <discouraged>',
  'preferred-conflict': '--add and --remove cannot be combined; run them separately',
  'preferred-orphan-flags': '--preferred and --reason can only be used with --add',
  'preferred-incomplete-flags': '--add requires --preferred <preferred>',
  'preferred-remove-shape': 'Core edit message',
  'preferred-replacement-shape': 'Core edit message',
  'preferred-upsert-shape': 'Core edit message',
} satisfies Record<NonNullable<ErrorView<'INVALID_PROJECT_TERMS_EDIT'>['facts']['problem']>, string>;

const tagCases = {
  'tag-conflict': '--set-tags cannot be combined with --add-tag or --remove-tag',
  'tag-missing': 'Provide at least one of --add-tag, --remove-tag, or --set-tags',
} satisfies Record<NonNullable<ErrorView<'INVALID_COLLECTION'>['facts']['problem']>, string>;

/** Keep the closed key union for constructing errors in these contract cases. */
function entries<Key extends string, Value>(table: Record<Key, Value>): [Key, Value][] {
  return Object.entries(table) as [Key, Value][];
}

function runFailure(error: core.LingoTrackerError, formatError?: () => string) {
  return runCommand(
    defineCommand<object>()({
      name: 'Contract',
      collection: 'none',
      config: false,
      formatError,
      run: () => {
        throw error;
      },
    }),
    {},
    { cwd: process.cwd() },
  );
}

describe('CLI Error Wording contract', () => {
  it('keeps every catalogue code wording and default exit behaviour', async () => {
    const overrides: Readonly<Partial<Record<string, Case>>> = cases;
    const errors = errorAdapterFixtures().map((error) => overrides[error.code]?.error ?? error);
    expect(errors.map((error) => error.code).sort()).toEqual(
      [...Object.keys(ERROR_CODES), ...PROVIDER_ERROR_CODES].sort(),
    );
    for (const error of errors) {
      const wording = overrides[error.code]?.wording ?? { message: error.message };
      expect(cliErrorWording(error)).toEqual(wording);
      const result = await runFailure(error);
      const details = wording.details?.map((detail) => `  ${detail}\n`).join('') ?? '';
      const hint = wording.hint ? `${wording.hint}\n` : '';
      expect(result).toEqual({ exitCode: 1, stdout: '', stderr: `❌ ${wording.message}\n${details}${hint}` });
    }
  });

  it.each([
    ['INVALID_PROJECT_TERMS_EDIT', 'Original message'],
    ['INVALID_PREFERRED_TERMINOLOGY', 'Original message'],
    ['BRACED_PLACEHOLDER', 'Original message'],
    ['CONFIG_PARSE_FAILED', 'Failed to parse configuration file: Original message'],
    ['PROTECTED_TERMS_FILE_NOT_SET', 'Collection "" has no protected terms file. Set one first with --file <path>.'],
  ])('keeps legacy wording and exit for %s without catalogue facts', async (code, message) => {
    class LocalError extends core.LingoTrackerError {
      readonly kind = 'invalid' as const;
    }
    const error = new LocalError('Original message', code);
    expect(cliErrorWording(error)).toEqual({ message });
    expect(await runFailure(error)).toEqual({ exitCode: 1, stdout: '', stderr: `❌ ${message}\n` });
  });

  it.each(['not-found', 'conflict', 'invalid', 'forbidden', 'unavailable', 'upstream', 'internal'] as const)(
    'keeps the original message and default exit for a new %s code',
    async (kind: ErrorKind) => {
      class NewError extends core.LingoTrackerError {
        readonly kind = kind;
      }
      const error = new NewError('Original message', 'NEW_CODE');
      expect(cliErrorWording(error)).toEqual({ message: 'Original message' });
      expect(await runFailure(error)).toEqual({ exitCode: 1, stdout: '', stderr: '❌ Original message\n' });
    },
  );

  it.each(Object.keys(CLI_BY_CODE))('has no redundant CLI override for %s', (code) => {
    const error = errorAdapterFixtures().find((error) => error.code === code);
    expect(error).toBeDefined();
    if (!error) throw new Error(`Missing override fixture for ${code}`);
    const defaultError = Object.create(
      Object.getPrototypeOf(error),
      Object.getOwnPropertyDescriptors(error),
    ) as core.LingoTrackerError;
    Object.defineProperty(defaultError, 'code', { value: 'DEFAULT_CODE' });
    expect(cliErrorWording(error, ADD_RESOURCE_COMMAND_NAME)).not.toEqual(
      cliErrorWording(defaultError, ADD_RESOURCE_COMMAND_NAME),
    );
  });

  it.each(Object.entries(cases))('formats %s and reports it through the runner', async (_code, { error, wording }) => {
    const before = { message: error.message, code: error.code, cause: error.cause };
    expect(cliErrorWording(error)).toEqual(wording);
    const hook = vi.fn(() => 'Command override');
    const result = await runFailure(error, hook);
    const details = wording.details?.map((detail) => `  ${detail}\n`).join('') ?? '';
    const hint = wording.hint ? `${wording.hint}\n` : '';
    expect(result).toEqual({ exitCode: 1, stdout: '', stderr: `❌ ${wording.message}\n${details}${hint}` });
    expect(hook).not.toHaveBeenCalled();
    expect({ message: error.message, code: error.code, cause: error.cause }).toEqual(before);
  });

  it.each(entries(termCases))('formats project term problem %s', (problem, message) => {
    expect(cliErrorWording(new core.InvalidProjectTermsEditError('Core edit message', problem))).toEqual({ message });
  });

  it.each(entries(tagCases))('formats collection tag problem %s', (problem, message) => {
    expect(cliErrorWording(new core.InvalidCollectionError('Core edit message', { problem }))).toEqual({ message });
  });

  it('prints supplied core-operation causes without suppressing repeated messages', async () => {
    const print = (error: core.CoreOperationError) =>
      runCommand(
        defineCommand<object>()({
          name: 'Cause print',
          collection: 'none',
          config: false,
          run: () => {
            throw error;
          },
        }),
        {},
        { cwd: process.cwd() },
      );
    expect(
      await print(new core.CoreOperationError('Broken terminology', { cause: new Error('Broken terminology') })),
    ).toEqual({ exitCode: 1, stdout: '', stderr: '❌ Broken terminology\n  Broken terminology\n' });
    expect(await print(new core.CoreOperationError('Write failed', { cause: new Error('Disk full') }))).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ Write failed\n  Disk full\n',
    });
  });

  it('keeps format detection text without an import prefix or duplicate cause', () => {
    expect(
      cliErrorWording(
        new core.ImportSourceError('Unknown format', {
          stage: 'format',
          cause: new Error('Unknown format'),
        }),
      ),
    ).toEqual({ message: 'Unknown format', includeCause: false });
  });

  it('uses a row number when a terminology error has no submitted rule', () => {
    expect(
      cliErrorWording(
        new core.PreferredTerminologyValidationError([
          { index: 2, field: 'preferred', code: 'empty', message: 'required' },
        ]),
      ),
    ).toEqual({ message: 'Preferred terminology not saved:', details: ['row 3: required'] });
  });

  it('keeps unknown typed and provider codes and ignores ordinary failures', () => {
    class FutureError extends core.LingoTrackerError {
      readonly kind = 'internal' as const;
    }
    expect(cliErrorWording(new FutureError('Future failure', 'FUTURE_CODE'))).toEqual({ message: 'Future failure' });
    expect(cliErrorWording(new core.TranslationError('Future provider', 'FUTURE_PROVIDER', false))).toEqual({
      message: 'Future provider',
    });
    expect(cliErrorWording(new FutureError('Own property only', 'toString'))).toEqual({ message: 'Own property only' });
    expect(cliErrorWording(new Error('Plain error'))).toBeUndefined();
    expect(cliErrorWording('Thrown text')).toBeUndefined();
  });

  it.each(['preflight', 'prompts', 'run'] as const)('keeps command hooks for ordinary %s failures', async (stage) => {
    const error = new Error('Command failure');
    const hook = vi.fn(() => 'Command-specific text');
    const fail = () => {
      throw error;
    };
    const command = defineCommand<object>()({
      name: 'Contract',
      collection: 'none',
      config: false,
      formatError: hook,
      ...(stage === 'preflight' ? { preflight: fail } : stage === 'prompts' ? { prompts: fail } : {}),
      run: stage === 'run' ? fail : () => undefined,
    });
    expect(await runCommand(command, {}, { cwd: process.cwd() })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '❌ Command-specific text\n',
    });
    expect(hook).toHaveBeenCalledWith(error, stage === 'run');
  });

  it.each([ADD_RESOURCE_COMMAND_NAME, 'Edit resource', 'Add resources'])(
    'scopes existing-key advice for %s',
    async (name) => {
      const error = new core.ResourceAlreadyExistsError('a.b');
      const command = defineCommand<object>()({
        name,
        collection: 'none',
        config: false,
        run: () => {
          throw error;
        },
      });
      const result = await runCommand(command, {}, { cwd: process.cwd() });
      const hint =
        name === ADD_RESOURCE_COMMAND_NAME ? '  Use --override to replace it, or edit-resource to change it.\n' : '';
      expect(result).toEqual({ exitCode: 1, stdout: '', stderr: `❌ Resource already exists: a.b\n${hint}` });
    },
  );

  it.each([
    [
      new core.ConfigNotFoundError('/project/.lingo-tracker.json'),
      '❌ Configuration file .lingo-tracker.json not found.\nRun "lingo-tracker init" to initialize a project.\n',
    ],
    [
      new core.PreferredTerminologyValidationError([
        { index: 0, field: 'preferred', code: 'empty', message: 'required' },
      ]),
      '❌ Preferred terminology not saved:\n  row 1: required\n',
    ],
    [
      new core.InvalidConfigError('Invalid config', { cause: new Error('Underlying reason') }),
      '❌ Invalid config\n  Underlying reason\n',
    ],
  ] as const)('prints complete diagnostics directly for %p', async (error, stderr) => {
    const command = defineCommand<object>()({
      name: 'Direct print',
      collection: 'none',
      config: false,
      run: () => {
        printCliError(error);
        return { exitCode: 1 };
      },
    });
    expect(await runCommand(command, {}, { cwd: process.cwd() })).toEqual({ exitCode: 1, stdout: '', stderr });
  });
});
