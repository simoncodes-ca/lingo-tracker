import {
  isUntranslatedCopy,
  needsTranslation,
  normalizeTags,
  type TranslationStatus,
  translocoToICU,
  validateTargetFolder,
} from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { readProjectTerms, type TerminologyFindings } from '../config/project-terms';
import {
  CoreOperationError,
  InvalidResourceKeyError,
  ResourceAlreadyExistsError,
  ResourceNotFoundError,
} from '../errors/lingo-tracker-error';
import { snapshotTranslation, writeBackTranslations } from '../translation/translation-write-back';
import type { OpenTranslatorOptions } from '../translation/translator';
import type { ResourceTreeEntry } from './load-resource-tree';
import { assertCollectionLocales, seedLocales, withTranslatorProblems } from './locale-seeding';
import { planMove } from './move-plan';
import { relocateEntries } from './relocate-entries';
import { openResourceEntry } from './resource-entry';
import { resolveMutationSink, type MutationSink, type MutationSinkOptions, upsertMutation } from './resource-mutation';
import { assertTranslationStatus } from './translation-status-input';

/** What to change on an entry. `undefined` leaves a field alone. */
export interface EditResourceChanges {
  /** New base value. When it changes, the Staleness rule and Locale seeding run (see {@link editResource}). */
  readonly baseValue?: string;
  readonly comment?: string;
  /** Replaces the tags; an empty list removes them. */
  readonly tags?: readonly string[];
  /** Translations by locale. An omitted status is inferred when the value changes. A base-locale value is ignored. */
  readonly translations?: Readonly<Record<string, { readonly value: string; readonly status?: TranslationStatus }>>;
  /**
   * Destination folder (dot-delimited; `''` for the collection root). The entry keeps its
   * entry key (the last key segment) and moves there, with its values, metadata and edits.
   */
  readonly moveTo?: string;
}

export interface EditResourceOptions extends OpenTranslatorOptions, MutationSinkOptions {}

export interface EditResourceResult {
  /** The entry's key after the edit: the destination key when it moved. */
  readonly resolvedKey: string;
  readonly updated: boolean;
  readonly message?: string;
  readonly entry?: ResourceTreeEntry;
  /**
   * Locales the Translator skipped (see {@link seedLocales}), or whose value changed on disk
   * during the provider call. Present only when auto-translation ran.
   */
  readonly skippedLocales?: string[];
  /**
   * Advisory: discouraged terms in the base value, any rule-file problem that limited the check,
   * and, when auto-translation ran, a named protected-terms file that does not exist. Present
   * only when the edit supplied a base value and updated the entry; editing a comment or a
   * translation does not re-raise advice about untouched wording.
   */
  readonly terminology?: TerminologyFindings;
}

/**
 * Edits an existing resource entry of a collection.
 *
 * When the base value changes, the Staleness rule updates every translation's status, then
 * Locale seeding ({@link seedLocales}) fills the locales that need work and were not supplied
 * in `changes.translations`: auto-translated when the collection has it enabled, else a copy
 * of the new base value as `new` for a locale that has no value or held an untranslated copy
 * of the old base value. A real translation is kept (and is `stale`).
 *
 * The edit is saved before auto-translation runs, so it is kept even if the provider fails.
 * With `moveTo`, the edited entry then moves to the destination folder: the destination is
 * written before the source entry is removed. `moveTo` is validated, and the destination
 * checked for a collision, before anything is written. The destination is read again just
 * before the move (auto-translation may have taken a while), and a collision found then
 * throws `ResourceAlreadyExistsError` with the edit already saved in the source folder.
 *
 * @param key - The entry's full, existing key.
 * @param options - `provider` / `protectedTerms`: used instead of the collection's (see `openTranslator`).
 * @throws {InvalidResourceKeyError} `key` or `moveTo` is malformed.
 * @throws {ResourceNotFoundError} No entry exists at `key`.
 * @throws {ResourceAlreadyExistsError} The destination folder already has an entry with this entry key
 *   (checked before the edit, and again, on fresh disk state, just before the move).
 * @throws {LocaleNotFoundError} A translation names a locale the collection does not have.
 * @throws {TranslationError} The translation provider failed (the edit itself is saved).
 * @throws {ProtectedTermsFileError} Auto-translation runs and a protected-terms file is malformed.
 */
export async function editResource(
  collection: Collection,
  key: string,
  changes: EditResourceChanges,
  options: EditResourceOptions = {},
): Promise<EditResourceResult> {
  const { baseLocale, translationsFolder } = collection;
  const resource = openResourceEntry(collection, key);
  const { folder } = resource;
  const current = resource.get();
  if (!current?.meta) {
    throw new ResourceNotFoundError(resource.resolvedKey);
  }

  const requestedTranslations = Object.entries(changes.translations ?? {});
  for (const [, translation] of requestedTranslations) {
    if (translation.status !== undefined) assertTranslationStatus(translation.status);
  }
  const translations = requestedTranslations.filter(([locale]) => locale !== baseLocale);
  assertCollectionLocales(
    collection,
    translations.map(([locale]) => locale),
  );

  const destination =
    changes.moveTo === undefined ? undefined : resolveDestination(collection, resource, changes.moveTo);

  const entryKey = resource.entryKey;
  // Live view of the stored entry: it reflects every change made through `folder`.
  const { entry } = current;
  const previousBase = entry.source;
  let hasChanges = false;

  // setBase applies the Staleness rule to every translation.
  const baseValue = changes.baseValue === undefined ? undefined : translocoToICU(changes.baseValue);
  const baseChanged = baseValue !== undefined && baseValue !== previousBase;
  if (baseChanged) {
    folder.setBase(entryKey, baseValue);
    hasChanges = true;
  }

  if (changes.comment !== undefined && folder.setDetails(entryKey, { comment: changes.comment })) {
    hasChanges = true;
  }
  if (changes.tags !== undefined && folder.setDetails(entryKey, { tags: normalizeTags([...changes.tags]) })) {
    hasChanges = true;
  }

  for (const [locale, { value, status }] of translations) {
    if (translocoToICU(value) !== entry[locale]) {
      folder.setTranslation(entryKey, locale, value, status);
      hasChanges = true;
    } else {
      const localeMeta = folder.get(entryKey)?.meta?.[locale];
      if (status !== undefined && localeMeta && localeMeta.status !== status) {
        folder.setStatus(entryKey, locale, status);
        hasChanges = true;
      }
    }
  }

  if (!hasChanges && !destination) {
    return { resolvedKey: resource.resolvedKey, updated: false, message: 'No changes detected' };
  }

  // Two-phase write: the edit is saved before auto-translation, so it is kept if the provider fails.
  if (hasChanges) {
    resource.save(resolveMutationSink(collection, options));
  }

  let updatedFolder = folder;
  let skippedLocales: string[] | undefined;
  let translatorProblems: readonly string[] | undefined;
  if (baseChanged) {
    const snapshots = new Map(
      collection.targetLocales.map((locale) => [
        locale,
        snapshotTranslation(entry.source, folder.get(entryKey)?.meta?.[locale]),
      ]),
    );
    const seeding = await seedLocales(
      collection,
      {
        baseValue,
        supplied: translations.map(([locale]) => locale),
        needsWork: (locale) => needsTranslation(folder.get(entryKey)?.meta?.[locale]),
        // A real translation is kept; no value, or an untranslated copy of the old base, is not.
        keepsValue: (locale) => {
          const value = entry[locale];
          return typeof value === 'string' && !isUntranslatedCopy(value, previousBase);
        },
      },
      options,
    );
    const pending = seeding.translations.flatMap((translation) => {
      const snapshot = snapshots.get(translation.locale);
      return snapshot ? [{ entryKey, ...translation, snapshot }] : [];
    });
    const writeBack = writeBackTranslations(collection, folder.folderPath, pending, {
      onMutation: resolveMutationSink(collection, options),
      saved: (folder) => [upsertMutation(translationsFolder, resource.resolvedKey, folder.treeEntry(entryKey))],
    });
    updatedFolder = writeBack.folder;
    if (!updatedFolder.has(entryKey)) {
      throw new ResourceNotFoundError(resource.resolvedKey);
    }
    if (seeding.skippedLocales !== undefined) {
      const skipped = [...new Set([...seeding.skippedLocales, ...writeBack.skipped.map(({ locale }) => locale)])];
      if (skipped.length > 0) skippedLocales = skipped;
    }
    translatorProblems = seeding.problems;
  }

  const moved = destination
    ? moveEntry(collection, resource.resolvedKey, destination, resolveMutationSink(collection, options))
    : undefined;
  const resolvedKey = moved?.resolvedKey ?? resource.resolvedKey;
  const updatedEntry = moved?.entry ?? updatedFolder.treeEntry(entryKey);
  if (!updatedEntry) {
    throw new ResourceNotFoundError(resolvedKey);
  }

  return {
    resolvedKey,
    updated: true,
    entry: updatedEntry,
    ...(skippedLocales !== undefined && { skippedLocales }),
    ...(baseValue !== undefined && {
      terminology: withTranslatorProblems(
        readProjectTerms(collection).checkBaseValue(resolvedKey, baseValue),
        translatorProblems,
      ),
    }),
  };
}

/**
 * The key `moveTo` sends the entry to; `undefined` when it is the entry's own folder.
 * @throws {InvalidResourceKeyError} `moveTo` is malformed.
 * @throws {ResourceAlreadyExistsError} The destination already has this entry key.
 */
function resolveDestination(
  collection: Collection,
  source: { readonly resolvedKey: string; readonly entryKey: string },
  moveTo: string,
): string | undefined {
  try {
    if (moveTo) validateTargetFolder(moveTo);
  } catch (error) {
    throw new InvalidResourceKeyError(source.entryKey, error instanceof Error ? error.message : String(error));
  }
  const [relocation] = planMove({
    source: collection,
    destination: collection,
    selection: { kind: 'entry', key: source.resolvedKey },
    destinationPath: moveTo,
  }).relocations;
  if (!relocation || relocation.to === source.resolvedKey) {
    return undefined;
  }

  if (openResourceEntry(collection, relocation.to).exists()) {
    throw new ResourceAlreadyExistsError(relocation.to);
  }
  return relocation.to;
}

/**
 * Moves the entry, as saved, to the destination through the Entry Relocation (`relocateEntries`),
 * which reads both folders from disk again, so writes made to the destination meanwhile are kept
 * and a new collision is caught. The destination is written before the source entry is removed.
 * A failed write throws after the relocation reports a `reindex`.
 * @throws {ResourceAlreadyExistsError} The destination has the entry key now.
 */
function moveEntry(
  collection: Collection,
  sourceKey: string,
  destinationKey: string,
  onMutation?: MutationSink,
): { resolvedKey: string; entry: ResourceTreeEntry } {
  const plan = planMove({
    source: collection,
    destination: collection,
    selection: { kind: 'key', key: sourceKey },
    destinationPath: destinationKey,
  });
  const relocation = relocateEntries(plan, { onMutation });
  if (relocation.collisions.length > 0) {
    throw new ResourceAlreadyExistsError(destinationKey);
  }
  const [moved] = relocation.moved;
  if (!moved) {
    throw new CoreOperationError(relocation.errors.join('; ') || `Resource ${sourceKey} was not moved`);
  }
  return { resolvedKey: moved.to, entry: moved.entry };
}
