import {
  autoFixICUPlaceholders,
  autoFixTranslocoPlaceholders,
  hasICUPlaceholders,
  hasTranslocoPlaceholders,
} from './icu-auto-fixer';

import type { IcuParseOptions } from './icu-message';

type RepairEngine = 'transloco' | 'icu';

export type PlaceholderRepair =
  | { outcome: 'skipped' }
  | { outcome: 'matched'; engine: RepairEngine }
  | {
      outcome: 'fixed';
      engine: RepairEngine;
      value: string;
      description: string;
      originalPlaceholders: string[];
      fixedPlaceholders: string[];
    }
  | { outcome: 'failed'; engine: RepairEngine; error: string };

/** Selects the trusted base and repairs the translation's placeholders. */
export function repairPlaceholders(
  {
    translation,
    storedBase,
    importedBase,
  }: {
    translation: string;
    storedBase?: string;
    importedBase?: string;
  },
  options: IcuParseOptions = {},
): PlaceholderRepair {
  let engine: RepairEngine;
  let base: string;

  // Transloco repair only trusts the stored base. Migration imports may contain
  // unresolved references such as `{{greeting}}` in importedBase, which must not
  // be mistaken for runtime parameters. Transloco takes precedence over ICU.
  if (storedBase && hasTranslocoPlaceholders(storedBase)) {
    engine = 'transloco';
    base = storedBase;
  } else {
    const icuBase = storedBase ?? importedBase;
    if (!icuBase || !hasICUPlaceholders(icuBase)) return { outcome: 'skipped' };
    engine = 'icu';
    base = icuBase;
  }

  const result =
    engine === 'transloco'
      ? autoFixTranslocoPlaceholders(base, translation, options)
      : autoFixICUPlaceholders(base, translation, options);

  if (result.error) return { outcome: 'failed', engine, error: result.error };
  if (!result.wasFixed) return { outcome: 'matched', engine };
  return {
    outcome: 'fixed',
    engine,
    value: result.value,
    description: result.description || '',
    originalPlaceholders: result.originalPlaceholders || [],
    fixedPlaceholders: result.fixedPlaceholders || [],
  };
}
