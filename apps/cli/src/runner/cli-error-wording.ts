import {
  CONFIG_FILENAME,
  type ErrorRules,
  type ErrorView,
  LingoTrackerError,
  mapTypedError,
} from '@simoncodes-ca/core';
import { ADD_RESOURCE_FLAGS } from '../add-resource/add-resource-flags';
import { BUNDLE_FLAGS } from '../commands/bundle-flags';
import { EDIT_COLLECTION_FLAGS } from '../commands/edit-collection-flags';
import { GLOSSARY_FLAGS } from '../commands/glossary-flags';
import { PREFERRED_TERMINOLOGY_FLAGS } from '../commands/preferred-terminology-flags';
import { PROTECTED_TERMS_FLAGS } from '../commands/protected-terms-flags';
import { ConsoleFormatter } from '../utils/console-formatter';
import { CommandOutput } from './command-output';
import { flagName } from './flag-record';

/** Shared with the command definition so renaming the command retains its advice. */
export const ADD_RESOURCE_COMMAND_NAME = 'Add resource';

/** Terminal text only; the original error remains available to the runner. */
export interface CliErrorWording {
  readonly message: string;
  readonly details?: readonly string[];
  /** Unindented follow-up line (the config initialization hint). */
  readonly hint?: string;
  /** Defaults to true; import source messages already contain the underlying reason. */
  readonly includeCause?: boolean;
}

type Rule = (error: { readonly message: string }) => CliErrorWording;
const original: Rule = (error) => ({ message: error.message });

const tagProblems: Record<NonNullable<ErrorView<'INVALID_COLLECTION'>['facts']['problem']>, Rule> = {
  'tag-conflict': () => ({
    message: `${flagName(EDIT_COLLECTION_FLAGS.setTags)} cannot be combined with ${flagName(EDIT_COLLECTION_FLAGS.addTag)} or ${flagName(EDIT_COLLECTION_FLAGS.removeTag)}`,
  }),
  'tag-missing': () => ({
    message: `Provide at least one of ${flagName(EDIT_COLLECTION_FLAGS.addTag)}, ${flagName(EDIT_COLLECTION_FLAGS.removeTag)}, or ${flagName(EDIT_COLLECTION_FLAGS.setTags)}`,
  }),
};

const projectProblems: Record<NonNullable<ErrorView<'INVALID_PROJECT_TERMS_EDIT'>['facts']['problem']>, Rule> = {
  'protected-conflict': () => ({
    message: `${flagName(PROTECTED_TERMS_FLAGS.set)} cannot be combined with ${flagName(PROTECTED_TERMS_FLAGS.add)} or ${flagName(PROTECTED_TERMS_FLAGS.remove)}`,
  }),
  'protected-missing': () => ({
    message: `Provide at least one of ${flagName(PROTECTED_TERMS_FLAGS.add)}, ${flagName(PROTECTED_TERMS_FLAGS.remove)}, ${flagName(PROTECTED_TERMS_FLAGS.set)}, ${flagName(PROTECTED_TERMS_FLAGS.list)}, or ${flagName(PROTECTED_TERMS_FLAGS.file)}`,
  }),
  'protected-file-path': original,
  'protected-replacement-conflict': original,

  'preferred-missing': () => ({
    message: `Provide one of ${flagName(PREFERRED_TERMINOLOGY_FLAGS.list)}, ${flagName(PREFERRED_TERMINOLOGY_FLAGS.add)} <discouraged> ${flagName(PREFERRED_TERMINOLOGY_FLAGS.preferred)} <preferred>, or ${flagName(PREFERRED_TERMINOLOGY_FLAGS.remove)} <discouraged>`,
  }),
  'preferred-conflict': () => ({
    message: `${flagName(PREFERRED_TERMINOLOGY_FLAGS.add)} and ${flagName(PREFERRED_TERMINOLOGY_FLAGS.remove)} cannot be combined; run them separately`,
  }),
  'preferred-orphan-flags': () => ({
    message: `${flagName(PREFERRED_TERMINOLOGY_FLAGS.preferred)} and ${flagName(PREFERRED_TERMINOLOGY_FLAGS.reason)} can only be used with ${flagName(PREFERRED_TERMINOLOGY_FLAGS.add)}`,
  }),
  'preferred-incomplete-flags': () => ({
    message: `${flagName(PREFERRED_TERMINOLOGY_FLAGS.add)} requires ${flagName(PREFERRED_TERMINOLOGY_FLAGS.preferred)} <preferred>`,
  }),
  'preferred-remove-shape': original,
  'preferred-replacement-shape': original,
  'preferred-upsert-shape': original,
};

/** Rich wording keys on fact presence, not class. */
function preferredValidation(error: ErrorView<'INVALID_PREFERRED_TERMINOLOGY'>): CliErrorWording {
  if (error.facts.errors === undefined) return original(error);
  return {
    message: 'Preferred terminology not saved:',
    details: error.facts.errors.map((ruleError) => {
      const row = error.facts.submittedRules?.[ruleError.index];
      const label = row ? `"${row.discouraged} → ${row.preferred}"` : `row ${ruleError.index + 1}`;
      return `${label}: ${ruleError.message}`;
    }),
  };
}

/** Rich wording keys on fact presence, not class. */
function bracedPlaceholderWording(error: ErrorView<'BRACED_PLACEHOLDER'>): CliErrorWording {
  if (error.facts.locale === undefined || error.facts.details === undefined) return original(error);
  return { message: `Value for locale "${error.facts.locale}" is not valid:`, details: error.facts.details };
}

/** Codes default by kind; this table holds only deviations. */
export const CLI_BY_CODE = {
  AUTO_TRANSLATION_DISABLED: (error) => ({
    message: `${error.message}. Set translation.enabled = true in your configuration`,
  }),
  BUNDLE_NOT_FOUND: (error) => ({ message: `${error.message}.` }),
  CONFIG_NOT_FOUND: () => ({
    message: `Configuration file ${CONFIG_FILENAME} not found.`,
    hint: 'Run "lingo-tracker init" to initialize a project.',
  }),
  CONFIG_PARSE_FAILED: (error) => ({
    message: `Failed to parse configuration file: ${error.facts.reason ?? error.message}`,
  }),
  GLOSSARY_EXTRACTOR_ERROR: (error) =>
    error.facts.mode === 'ai'
      ? {
          message: `The "ai" extractor is not yet implemented. Use ${flagName(GLOSSARY_FLAGS.extractor)} ngram (the default).`,
        }
      : original(error),
  IMPORT_SOURCE_ERROR: (error) => ({
    message: error.facts.stage === 'format' ? error.message : `Import failed: ${error.message}`,
    includeCause: false,
  }),
  INVALID_COLLECTION: (error) =>
    error.facts.problem === undefined || !Object.getOwnPropertyDescriptor(tagProblems, error.facts.problem)
      ? original(error)
      : tagProblems[error.facts.problem](error),
  INVALID_IMPORT_LOCALE: (error) => ({ message: `Import failed: ${error.message}`, includeCause: false }),
  INVALID_PREFERRED_TERMINOLOGY: preferredValidation,
  INVALID_PROJECT_TERMS_EDIT: (error) =>
    error.facts.problem === undefined || !Object.getOwnPropertyDescriptor(projectProblems, error.facts.problem)
      ? original(error)
      : projectProblems[error.facts.problem](error),
  MULTIPLE_BUNDLE_CONSTANT_NAME: () => ({
    message: `Cannot use ${flagName(BUNDLE_FLAGS.tokenConstantName)} with multiple bundles. Please target a single bundle.`,
  }),
  PROTECTED_TERMS_FILE_NOT_SET: (error) => ({
    message: `Collection "${error.facts.collectionName ?? ''}" has no protected terms file. Set one first with ${flagName(PROTECTED_TERMS_FLAGS.file)} <path>.`,
  }),
  BRACED_PLACEHOLDER: bracedPlaceholderWording,
  RESOURCE_ALREADY_EXISTS: (error, commandName) =>
    commandName === ADD_RESOURCE_COMMAND_NAME
      ? {
          message: error.message,
          details: [`Use ${flagName(ADD_RESOURCE_FLAGS.override)} to replace it, or edit-resource to change it.`],
        }
      : original(error),
} satisfies ErrorRules<CliErrorWording, string | undefined>;

/** Typed core errors take precedence over command hooks. Unknown typed codes keep their message. */
export function cliErrorWording(error: unknown, commandName?: string): CliErrorWording | undefined {
  if (!(error instanceof LingoTrackerError)) return undefined;
  return mapTypedError<CliErrorWording, string | undefined>(error, CLI_BY_CODE, commandName) ?? original(error);
}

/** The runner and commands share complete diagnostic rendering, including details, hints and causes. */
export function printCliError(
  error: unknown,
  options: {
    readonly commandName?: string;
    readonly formatError?: () => string | undefined;
    /** Text for a non-Error thrown value; defaults to String(error). */
    readonly fallbackMessage?: string;
  } = {},
): void {
  const wording = cliErrorWording(error, options.commandName);
  const message =
    wording?.message ??
    options.formatError?.() ??
    (error instanceof Error ? error.message : (options.fallbackMessage ?? String(error)));
  const cause: unknown = error instanceof Error ? Reflect.get(error, 'cause') : undefined;
  const details = [...(wording?.details ?? [])];
  if (wording?.includeCause !== false && cause instanceof Error) details.push(cause.message);
  if (details.length > 0) ConsoleFormatter.error(message, details);
  else ConsoleFormatter.error(message);
  if (wording?.hint) CommandOutput.error(wording.hint);
}
