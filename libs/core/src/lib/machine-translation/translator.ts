import type { KnownProviderErrorCode } from '../errors/error-codes';
/**
 * Translator — the one way core machine-translates text for a collection.
 *
 * Opened from a resolved Collection, it owns everything the callers used to repeat:
 *
 * - **Setup**: the collection's translation config must be enabled, and the provider is built
 *   from it (`createTranslationProvider`, API key read from `process.env[apiKeyEnv]`) unless one
 *   is injected.
 * - **ICU skip**: complex ICU (plural, select, number, date, time) is never sent to the provider.
 * - **Placeholder guard**: simple placeholders (`{name}`, `{{ name }}`) and quoted runs are sent as notranslate
 *   markers and restored afterwards; a translation that loses or duplicates a marker is skipped.
 * - **Protected-term guard**: a translation that drops a protected term present in the source
 *   (the collection's Project Terms, read once when the Translator is opened) is skipped, as
 *   import would reject it. A protected-terms file the config names but that does not exist
 *   guards nothing; the Translator reports it in `problems` for the caller to pass on.
 * - **Normalisation**: every returned value is ICU (`translocoToICU`).
 *
 * Callers decide which entries and locales need work (the Staleness rule) and what to store.
 *
 * @module translator
 */

import {
  type AppRuntime,
  admitValue,
  classifyICUContent,
  icuParseOptionsFor,
  icuQuotedRuns,
} from '@simoncodes-ca/domain';
import type { TranslationConfig } from '../../config/translation-config';
import type { Collection } from '../config/open-collection';
import { readProjectTerms } from '../config/project-terms';
import { AutoTranslationDisabledError, TranslationError } from '../errors/lingo-tracker-error';
import { type ExtractedPlaceholder, protectPlaceholders, restorePlaceholders } from './placeholder-protector';
import type { TranslationProvider } from './translation-provider';
import { createTranslationProvider } from './translation-provider-factory';

/** One text to translate. `key` is the caller's identifier (for example the full resource key). */
export interface TranslatorEntry {
  readonly key: string;
  /** The base value (ICU or Transloco syntax). */
  readonly source: string;
}

/** A translation that passed every guard, normalised to ICU. */
export interface TranslatedValue {
  readonly key: string;
  readonly locale: string;
  readonly value: string;
}

/**
 * Why an entry was not translated for a locale:
 * - `complex-icu` — plural, select, or another complex ICU construct; never sent to the provider.
 * - `placeholder-mismatch` — the provider lost or duplicated a marker, or the value has different argument names.
 * - `protected-term` — the translation dropped a protected term present in the source.
 */
export type TranslationSkipReason = 'complex-icu' | 'placeholder-mismatch' | 'protected-term';

export interface SkippedTranslation {
  readonly key: string;
  readonly locale: string;
  readonly reason: TranslationSkipReason;
  /** The protected terms the translation dropped (reason `protected-term` only). */
  readonly terms?: readonly string[];
}

export interface TranslationOutcome {
  readonly values: TranslatedValue[];
  readonly skipped: SkippedTranslation[];
}

export interface Translator {
  /**
   * Protected-terms problems that did not stop the Translator (a file the config names that does
   * not exist, read as an empty list), as printable lines. Empty when `protectedTerms` was passed.
   */
  readonly problems: readonly string[];
  /**
   * Translates every entry into every locale: one provider call per locale (the provider chunks
   * internally), locales in parallel. The base locale is ignored. Results are ordered by locale,
   * then by entry.
   *
   * @throws {TranslationError} The provider failed.
   */
  translate(entries: readonly TranslatorEntry[], locales: readonly string[]): Promise<TranslationOutcome>;
}

export interface OpenTranslatorOptions {
  /** The provider to use instead of the one the collection's translation config names. */
  readonly provider?: TranslationProvider;
  /** The protected terms to guard instead of the collection's Project Terms. */
  readonly protectedTerms?: readonly string[];
}

/**
 * The precondition of every auto-translate operation: the collection's translation config,
 * which must be enabled. Callers check it up front (before prompting, before deciding there
 * is nothing to do), so a disabled collection is always refused the same way.
 *
 * @throws {AutoTranslationDisabledError} The collection has no enabled translation config.
 */
export function assertAutoTranslationEnabled(collection: Collection): TranslationConfig {
  const config = collection.translationConfig;
  if (!config?.enabled) {
    throw new AutoTranslationDisabledError(collection.name);
  }
  return config;
}

/**
 * Opens the Translator for a collection.
 *
 * @throws {AutoTranslationDisabledError} The collection has no enabled translation config.
 * @throws {TranslationError} No provider was injected and the API key env var is unset
 *   (`MISSING_API_KEY`) or the provider name is unknown (`UNKNOWN_PROVIDER`).
 * @throws {ProtectedTermsFileError} No terms were passed and a terms file is not a JSON array of strings.
 */
export function openTranslator(collection: Collection, options: OpenTranslatorOptions = {}): Translator {
  return openPreparedTranslator(collection, assertAutoTranslationEnabled(collection), options);
}

/** Open after the run has checked translation availability. */
export function openPreparedTranslator(
  collection: Collection,
  config: TranslationConfig,
  options: OpenTranslatorOptions = {},
): Translator {
  const provider = options.provider ?? createTranslationProvider(config.provider, readApiKey(config.apiKeyEnv));
  const terms = options.protectedTerms === undefined ? readProjectTerms(collection).forGuard() : undefined;
  const protectedTerms = options.protectedTerms ?? terms?.protectedTerms ?? [];
  const { baseLocale } = collection;

  return {
    problems: terms?.warnings ?? [],
    async translate(entries, locales) {
      const prepared = entries.map((entry) => prepare(entry, collection.runtime));
      const targets = [...new Set(locales)].filter((locale) => locale !== baseLocale);
      const perLocale = await Promise.all(
        targets.map((locale) =>
          translateForLocale(provider, prepared, baseLocale, locale, protectedTerms, collection.runtime),
        ),
      );
      return {
        values: perLocale.flatMap(({ values }) => values),
        skipped: perLocale.flatMap(({ skipped }) => skipped),
      };
    },
  };
}

function readApiKey(apiKeyEnv: string): string {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new TranslationError(
      `Translation API key not found. Set the ${apiKeyEnv} environment variable.`,
      'MISSING_API_KEY' satisfies KnownProviderErrorCode,
      false,
    );
  }
  return apiKey;
}

/** An entry classified once for all locales: skipped, or the text to send and the markers to restore. */
type PreparedEntry =
  | { readonly entry: TranslatorEntry; readonly kind: 'complex-icu' }
  | {
      readonly entry: TranslatorEntry;
      readonly kind: 'sendable';
      readonly text: string;
      readonly placeholders: ReadonlyArray<ExtractedPlaceholder>;
    };

function prepare(entry: TranslatorEntry, runtime: AppRuntime): PreparedEntry {
  const classification = classifyICUContent(entry.source, icuParseOptionsFor(runtime));
  if (classification === 'complex-icu') {
    return { entry, kind: 'complex-icu' };
  }
  if (classification === 'plain' && icuQuotedRuns(entry.source).length === 0) {
    return { entry, kind: 'sendable', text: entry.source, placeholders: [] };
  }
  const { protectedText, placeholders } = protectPlaceholders(entry.source);
  return { entry, kind: 'sendable', text: protectedText, placeholders };
}

async function translateForLocale(
  provider: TranslationProvider,
  prepared: readonly PreparedEntry[],
  sourceLocale: string,
  targetLocale: string,
  protectedTerms: readonly string[],
  runtime: AppRuntime,
): Promise<TranslationOutcome> {
  const sendable = prepared.filter((item) => item.kind === 'sendable');
  const results =
    sendable.length > 0
      ? await provider.translate(sendable.map(({ text }) => ({ text, sourceLocale, targetLocale })))
      : [];
  if (results.length !== sendable.length) {
    throw new TranslationError(
      `Translation provider returned ${results.length} results for ${sendable.length} texts.`,
      'INVALID_RESPONSE' satisfies KnownProviderErrorCode,
      false,
    );
  }

  const values: TranslatedValue[] = [];
  const skipped: SkippedTranslation[] = [];
  let next = 0;
  for (const item of prepared) {
    const { key, source } = item.entry;
    if (item.kind === 'complex-icu') {
      skipped.push({ key, locale: targetLocale, reason: 'complex-icu' });
      continue;
    }

    const candidate = results[next++].translatedText;
    const restored = restorePlaceholders(candidate, item.placeholders);
    if (!restored.success) {
      skipped.push({ key, locale: targetLocale, reason: 'placeholder-mismatch' });
      continue;
    }
    const admission = admitValue(
      source,
      restored.value,
      {
        name: 'machine-translation',
        protectedTerms,
      },
      icuParseOptionsFor(runtime),
    );
    if (admission.admitted === false) {
      skipped.push(
        admission.reason.kind === 'protected-term-dropped'
          ? { key, locale: targetLocale, reason: 'protected-term', terms: admission.reason.terms }
          : { key, locale: targetLocale, reason: 'placeholder-mismatch' },
      );
      continue;
    }

    values.push({ key, locale: targetLocale, value: admission.value });
  }
  return { values, skipped };
}
