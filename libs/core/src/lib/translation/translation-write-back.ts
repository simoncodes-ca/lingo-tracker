import { type LocaleMetadata, needsTranslation, type TranslationStatus } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { calculateChecksum } from '../resource/checksum';
import { openResourceFolder, type ResourceFolder, type ResourceFolderEntry } from '../resource/resource-folder';

/** The entry as read before the provider call; what a write is compared against. */
export interface TranslationSnapshot {
  readonly baseChecksum: string;
  readonly targetChecksum: string | undefined;
  readonly targetStatus: LocaleMetadata['status'] | undefined;
}

/** Take before awaiting translation. `source` is the stored (ICU) base value. */
export function snapshotTranslation(source: string, localeMeta: LocaleMetadata | undefined): TranslationSnapshot {
  return {
    baseChecksum: calculateChecksum(source),
    targetChecksum: localeMeta?.checksum,
    targetStatus: localeMeta?.status,
  };
}

export interface PendingTranslation {
  readonly entryKey: string;
  readonly locale: string;
  readonly value: string;
  /** Default 'translated'. editResource passes 'new' for seeded copies. */
  readonly status?: TranslationStatus;
  readonly snapshot: TranslationSnapshot;
}

export interface TranslationWriteBack {
  /** The folder reopened from disk; callers read the fresh entry from it. */
  readonly folder: ResourceFolder;
  readonly written: PendingTranslation[];
  readonly skipped: PendingTranslation[];
}

function isStale(current: ResourceFolderEntry | undefined, locale: string, snapshot: TranslationSnapshot): boolean {
  const currentTarget = current?.meta?.[locale];
  return (
    !current ||
    calculateChecksum(current.entry.source) !== snapshot.baseChecksum ||
    currentTarget?.checksum !== snapshot.targetChecksum ||
    currentTarget?.status !== snapshot.targetStatus ||
    !needsTranslation(currentTarget)
  );
}

/**
 * Reopens the folder, writes pending values whose entries still match their snapshots and need
 * translation, and saves once through Resource Folder, only when something was written.
 * The collection carries the required sink; Resource Folder reports each written key once.
 * Missing entries, changed base checksums, and changed target checksums or statuses are skipped.
 * A synchronous TOCTOU gap remains between reopening and saving; there is no await inside.
 * This does not lock the files or make the two-file save atomic.
 * @throws Whatever openResourceFolder/save throw (invalid JSON, fs failure). A failed save has
 * already sent reindex through Resource Folder.
 */
export function writeBackTranslations(
  collection: Pick<Collection, 'baseLocale' | 'translationsFolder' | 'onMutation' | 'runtime'>,
  folderPath: string,
  pending: readonly PendingTranslation[],
): TranslationWriteBack {
  const written: PendingTranslation[] = [];
  const folder = openResourceFolder(folderPath, collection);
  const skipped: PendingTranslation[] = [];
  for (const translation of pending) {
    const { entryKey, locale, value, status, snapshot } = translation;
    if (isStale(folder.get(entryKey), locale, snapshot)) {
      skipped.push(translation);
      continue;
    }
    folder.setTranslation(entryKey, locale, value, status ?? 'translated');
    written.push(translation);
  }
  if (written.length > 0) {
    folder.save();
  }
  return { folder, written, skipped };
}
