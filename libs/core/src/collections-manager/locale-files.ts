import { CoreOperationError } from '../lib/errors/lingo-tracker-error';
import { describeFolderProblem } from '../lib/resource/collection-folders';
import { type CollectionSweepTarget, sweepCollection } from '../lib/resource/collection-sweep';
import type { ResourceFolder } from '../lib/resource/resource-folder';

export interface LocaleFilesResult {
  /** Entries the locale was added to or dropped from. */
  readonly entries: number;
  /** Folders whose files were rewritten. */
  readonly filesUpdated: number;
}

/**
 * Opens every folder of the collection's Collection Sweep, before anything is written, so a locale
 * change can refuse a collection it cannot fully update and leave the config and the files as they are.
 * @throws Error A folder cannot be read (not valid JSON, or not listable); names the folder or file.
 */
export function openLocaleFolders(collection: CollectionSweepTarget): ResourceFolder[] {
  const folders: ResourceFolder[] = [];
  // Locale JSON saves were silent at HEAD; the lifecycle operation reports its reindex.
  for (const { folder, problem } of sweepCollection(collection, { unreported: true })) {
    if (problem) {
      throw new CoreOperationError(describeFolderProblem(problem));
    }
    folders.push(folder);
  }
  return folders;
}

/**
 * Seeds `locale` in the folders (from {@link openLocaleFolders}) through `ResourceFolder.seedLocale`
 * (the one seeding rule, which normalize shares). Touches only the translation files, never the config.
 */
export function seedLocaleFiles(
  folders: readonly ResourceFolder[],
  locale: string,
  onSave?: () => void,
): LocaleFilesResult {
  return rewriteFolders(folders, (folder) => folder.seedLocale(locale), onSave);
}

/** Drops `locale` from the folders (from {@link openLocaleFolders}). Touches only the translation files. */
export function dropLocaleFiles(
  folders: readonly ResourceFolder[],
  locale: string,
  onSave?: () => void,
): LocaleFilesResult {
  return rewriteFolders(folders, (folder) => folder.dropLocale(locale), onSave);
}

/** Applies `change` to every folder and saves the ones it changed. */
function rewriteFolders(
  folders: readonly ResourceFolder[],
  change: (folder: ResourceFolder) => number,
  onSave?: () => void,
): LocaleFilesResult {
  let entries = 0;
  let filesUpdated = 0;

  for (const folder of folders) {
    const changed = change(folder);
    if (changed > 0) {
      try {
        folder.save();
      } finally {
        onSave?.();
      }
      entries += changed;
      filesUpdated++;
    }
  }

  return { entries, filesUpdated };
}
