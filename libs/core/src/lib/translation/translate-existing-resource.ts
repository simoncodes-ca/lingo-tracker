import type { Collection } from '../config/open-collection';
import { ResourceNotFoundError } from '../errors/lingo-tracker-error';
import { assertAutoTranslationEnabled } from '../machine-translation/translator';
import { resolveResourcePaths } from '../resource/resource-file-paths';
import { openResourceFolder } from '../resource/resource-folder';
import type { ResourceTreeEntry } from '../resource/resource-tree-types';
import { executeTranslationRun, selectTranslationRow, type TranslationRunOptions } from './translation-run';

export type TranslateExistingResourceOptions = Omit<TranslationRunOptions, 'delay'>;

export interface TranslateExistingResourceResult {
  readonly translatedCount: number;
  /** Locales the Translator skipped, or whose value changed on disk during the provider call. */
  readonly skippedLocales: string[];
  readonly entry: ResourceTreeEntry;
  /** Problems that did not stop the Translator (a named protected-terms file that does not exist). */
  readonly warnings: string[];
}

/**
 * Auto-translates an existing resource entry of a collection through the Translator, for every
 * target locale that needs translation by the Staleness rule (no metadata, or status `new` or
 * `stale`). Translated values are stored ICU-normalised with status `translated`; skipped locales
 * are left as they are.
 *
 * Returns early with `translatedCount: 0` when no locales require translation, without opening the
 * Translator (so without needing an API key).
 *
 * @param key - The entry's full key.
 * @param options - `provider` / `protectedTerms`: used instead of the collection's (see {@link openTranslator}).
 * @throws {AutoTranslationDisabledError} The collection has no enabled translation config.
 * @throws {InvalidResourceKeyError} The key is malformed.
 * @throws {ResourceNotFoundError} No entry exists at the key.
 * @throws {TranslationError} Some locale needs work and the API key is not set, or the provider failed.
 * @throws {ProtectedTermsFileError} Some locale needs work and a protected-terms file is malformed.
 */
export async function translateExistingResource(
  collection: Collection,
  key: string,
  options: TranslateExistingResourceOptions = {},
): Promise<TranslateExistingResourceResult> {
  const config = assertAutoTranslationEnabled(collection);
  const { resolvedKey, entryKey, folderPath } = resolveResourcePaths({
    key,
    translationsFolder: collection.translationsFolder,
  });
  const folder = openResourceFolder(folderPath, collection);
  const entry = folder.treeEntry(entryKey, { requireMetadata: true });
  if (!entry) throw new ResourceNotFoundError(resolvedKey);
  const { row, locales } = selectTranslationRow(resolvedKey, entry, collection.targetLocales);
  if (locales.length === 0) return { translatedCount: 0, skippedLocales: [], entry, warnings: [] };
  const { tally, warnings } = await executeTranslationRun({
    ...options,
    collection,
    translationConfig: config,
    rows: [row],
    locales,
    failurePolicy: 'throw-first',
  });
  const outcomes = tally.outcomes;
  const freshEntry = outcomes.find((outcome) => outcome.status !== 'failed')?.entry;
  if (!freshEntry) throw new ResourceNotFoundError(resolvedKey);
  return {
    translatedCount: outcomes.filter((outcome) => outcome.status === 'written').length,
    skippedLocales: outcomes.filter((outcome) => outcome.status === 'skipped').map(({ locale }) => locale),
    entry: freshEntry,
    warnings,
  };
}
