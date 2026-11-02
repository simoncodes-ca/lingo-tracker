import { detectImportFormat, type ImportFormat } from '@simoncodes-ca/core';
import type { ImportStrategy } from '@simoncodes-ca/domain';
import type prompts from 'prompts';
import { IMPORT_FLAGS, type ImportPromptContext, resolveImportFlags, resolveStrategy } from './import-cmd-flags';
import { flagQuestions } from '../runner/flag-record';

export interface ImportCommandOptions {
  format?: ImportFormat;
  source?: string;
  locale?: string;
  collection?: string;
  strategy?: ImportStrategy;
  updateComments?: boolean;
  updateTags?: boolean;
  preserveStatus?: boolean;
  createMissing?: boolean;
  validateBase?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface ImportOptionsContext {
  readonly configuredLocales: readonly string[];
  readonly baseLocale: string;
  /** The command supplies file existence; resolution itself does no I/O. */
  readonly sourceExists: (source: string) => boolean;
}

/** Detection is pure; failure means an explicit format question is needed. */
function sourceFormat(source: string): ImportFormat | undefined {
  try {
    return detectImportFormat(source);
  } catch {
    return undefined;
  }
}

export function resolveImportOptions(values: ImportCommandOptions) {
  return resolveImportFlags(values);
}
export function importQuestions(options: ImportCommandOptions, context: ImportOptionsContext): prompts.PromptObject[] {
  resolveStrategy(options.strategy);
  return flagQuestions<ImportCommandOptions, ImportPromptContext>(IMPORT_FLAGS, options, {
    ...context,
    sourceFormat,
  });
}
