import { resolve } from 'node:path';
import type { LingoTrackerCollection } from '../config/lingo-tracker-collection';
import { patchCollectionEntry } from '../lib/config/collection-entry';
import { guardedConfigWrite } from '../lib/config/config-file-operations';
import { resolveRenameTarget } from '../lib/config/entry-name';
import { type Collection, type OpenedCollection, openCollection } from '../lib/config/open-collection';
import { assertProtectedTerms } from '../lib/config/set-protected-terms';
import { ReadOnlyCollectionError } from '../lib/errors/lingo-tracker-error';
import { resolveMutationSink, type MutationSinkOptions, reindexMutation } from '../lib/resource/resource-mutation';
import { assertValidLocale } from './assert-valid-locale';
import { renameBundleCollectionReferences } from './bundle-collection-references';
import { prepareCollectionProtectedTerms } from './collection-protected-terms';
import { dropLocaleFiles, openLocaleFolders, seedLocaleFiles } from './locale-files';
import { jsonValuesEqual } from './json-values-equal';

export interface CollectionChangeOptions extends MutationSinkOptions {
  protectedTerms?: string[];
}

export interface CollectionChangeResult {
  readonly message: string;
  readonly entriesAdded: number;
  readonly entriesRemoved: number;
  readonly filesUpdated: number;
}

export interface CollectionChange {
  readonly newName?: string;
  readonly patch: Partial<LingoTrackerCollection>;
  readonly targetLocales?: (current: Collection) => string[];
}

/** The shared validation, folder rewrite and single config write for every locale change. */
export async function changeCollection(
  current: OpenedCollection,
  change: CollectionChange,
  options: CollectionChangeOptions = {},
): Promise<CollectionChangeResult> {
  const {
    configWrite,
    collectionName,
    targetName,
    nextConfig,
    next,
    added,
    removed,
    folders,
    writeTerms,
    recordChanged,
  } = planCollectionChange(current, change, options);
  let entriesAdded = 0;
  let entriesRemoved = 0;
  let filesUpdated = 0;
  let localeWriteAttempted = false;
  let configWriteAttempted = false;
  const noteLocaleWrite = (): void => {
    localeWriteAttempted = true;
  };
  try {
    // Additive work first, so a failure leaves removed locales intact.
    for (const locale of added) {
      const result = seedLocaleFiles(folders, locale, noteLocaleWrite);
      entriesAdded += result.entries;
      filesUpdated += result.filesUpdated;
    }
    for (const locale of removed) {
      const result = dropLocaleFiles(folders, locale, noteLocaleWrite);
      entriesRemoved += result.entries;
      filesUpdated += result.filesUpdated;
    }
    configWriteAttempted = true;
    configWrite.write(nextConfig);
  } finally {
    // One reporting step for successful and failed locale/config writes, in original folder order.
    const foldersToReport = [
      ...(localeWriteAttempted ? [next.translationsFolder] : []),
      ...(configWriteAttempted && recordChanged ? [current.translationsFolder, next.translationsFolder] : []),
    ];
    const reported = new Set<string>();
    for (const folder of foldersToReport) {
      const key = resolve(folder);
      if (reported.has(key)) continue;
      reported.add(key);
      resolveMutationSink(current, options)?.(reindexMutation(folder));
    }
  }

  // Config remains written if this final terms write fails; preserve the original error.
  writeTerms?.();

  const message =
    targetName === collectionName
      ? `Collection "${collectionName}" updated successfully`
      : `Collection "${collectionName}" renamed to "${targetName}" and updated successfully`;
  return { message, entriesAdded, entriesRemoved, filesUpdated };
}

/** All preflight refusals, in their observable precedence, before the write phase. */
function planCollectionChange(current: OpenedCollection, change: CollectionChange, options: CollectionChangeOptions) {
  // Refusal precedence:
  // 1. Protected-terms shape.
  // 2. Read-only for locale sugar (before its locale-specific checks).
  // 3. Not-found, rename collision, and bundle-reference refusals.
  // 4. Protected-terms file preparation.
  // 5. Stale snapshot.
  // 6. Read-only when effective locales change.
  // 7. assertValidLocale for added locales.
  // 8. openLocaleFolders (read every affected folder).
  if (options.protectedTerms !== undefined) assertProtectedTerms(options.protectedTerms);
  const { sourceConfig: config, projectRoot: cwd, name: collectionName } = current;
  const configWrite = guardedConfigWrite(current);
  const { newName: newCollectionName, patch, targetLocales } = change;
  // Locale sugar refuses read-only collections before its locale-specific checks.
  if (targetLocales && current.readOnly) throw new ReadOnlyCollectionError(collectionName);
  const effectivePatch = targetLocales ? { ...patch, locales: targetLocales(current) } : patch;
  const renameTarget = resolveRenameTarget(collectionName, newCollectionName);
  const targetName = renameTarget.target;
  const nextConfig = patchCollectionEntry(
    config,
    collectionName,
    effectivePatch,
    renameTarget.isRename ? renameTarget.target : undefined,
  );
  renameBundleCollectionReferences(nextConfig, collectionName, targetName);
  const next = openCollection(nextConfig, targetName, { cwd });
  const { added, removed } = diffLocales(current, next);
  const writeTerms = prepareCollectionProtectedTerms(nextConfig, targetName, options.protectedTerms, cwd);

  // Refuse a stale snapshot before locale files are seeded or purged. `write` checks again.
  configWrite.assertUnchanged();

  // Keep refusal precedence: locale sugar checks read-only above; patches check stale first.
  const localesChanged = added.length > 0 || removed.length > 0;
  if (localesChanged && current.readOnly) throw new ReadOnlyCollectionError(collectionName);
  for (const locale of added) assertValidLocale(locale);
  // Read every folder before the first write.
  const folders = localesChanged ? openLocaleFolders(next) : [];

  const recordChanged =
    targetName !== collectionName ||
    !jsonValuesEqual(config.collections[collectionName], nextConfig.collections[targetName]);
  return {
    configWrite,
    collectionName,
    targetName,
    nextConfig,
    next,
    added,
    removed,
    folders,
    writeTerms,
    recordChanged,
  };
}

/** Which effective locales `next` adds to and removes from `current`. A base locale is never in either list. */
function diffLocales(
  current: Pick<Collection, 'locales' | 'baseLocale'>,
  next: Pick<Collection, 'locales' | 'baseLocale'>,
): { added: string[]; removed: string[] } {
  // A base locale is always present: it is never seeded or purged. The old base locale is protected
  // too, because purging it would destroy the source values.
  const isBase = (locale: string): boolean => locale === current.baseLocale || locale === next.baseLocale;
  return {
    added: next.locales.filter((locale) => !current.locales.includes(locale) && !isBase(locale)),
    removed: current.locales.filter((locale) => !next.locales.includes(locale) && !isBase(locale)),
  };
}
