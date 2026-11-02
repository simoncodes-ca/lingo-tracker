import { checkStoredValue, describeStoredValueFinding, icuParseOptionsFor } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { ReadOnlyCollectionError } from '../errors/lingo-tracker-error';
import type { CollectionFolderProblem } from '../resource/collection-folders';
import { fullKeyOf, sweepCollection } from '../resource/collection-sweep';
import { pruneEmptyFolders } from '../resource/folder-pruning';
import { type ResourceFolder, translationLocales } from '../resource/resource-folder';

export interface NormalizeOptions {
  /** Report what would change without writing anything. */
  readonly dryRun?: boolean;
}

export interface NormalizeFinding {
  readonly key: string;
  readonly locale: string;
  readonly kind: 'collapsed-case-body' | 'braced-placeholder';
  readonly detail: string;
}

export interface NormalizeResult {
  readonly findings: readonly NormalizeFinding[];
  readonly entriesProcessed: number;
  readonly localesAdded: number;
  readonly valuesConverted: number;
  readonly tagsNormalized: number;
  readonly filesCreated: number;
  readonly filesUpdated: number;
  readonly foldersRemoved: number;
  readonly dryRun: boolean;
  /** Folders that could not be read or pruned; they were kept. */
  readonly problems: CollectionFolderProblem[];
}

type Counters = {
  -readonly [K in Exclude<keyof NormalizeResult, 'dryRun' | 'foldersRemoved' | 'problems' | 'findings'>]: number;
};

/**
 * Normalizes every folder of a writable collection's Collection Sweep (hidden folders are not
 * part of the collection and are left alone):
 * - makes `resource_entries.json` and `tracker_meta.json` exist wherever there are entries,
 * - converts Transloco `{{ x }}` syntax to ICU and normalizes tags through `ResourceFolder.normalizeEntry`,
 * - recomputes checksums, re-applies the Staleness rule and seeds the collection's missing
 *   target locales, through `ResourceFolder.normalizeEntry`,
 * - removes empty folders afterwards.
 *
 * Non-destructive: existing values, comments and tags are kept. A folder that cannot be read is
 * skipped and returned in `problems`; the caller reports it.
 *
 * @throws {ReadOnlyCollectionError} The collection is read-only.
 */
export async function normalize(collection: Collection, options: NormalizeOptions = {}): Promise<NormalizeResult> {
  if (collection.readOnly) {
    throw new ReadOnlyCollectionError(collection.name);
  }
  const dryRun = options.dryRun ?? false;
  const counters: Counters = {
    entriesProcessed: 0,
    localesAdded: 0,
    valuesConverted: 0,
    tagsNormalized: 0,
    filesCreated: 0,
    filesUpdated: 0,
  };

  const problems: CollectionFolderProblem[] = [];
  const findings: NormalizeFinding[] = [];

  // Normalize JSON saves were silent at HEAD; only successful pruning reports mutations.
  for (const { folder, folderPath, problem } of sweepCollection(collection, { unreported: true })) {
    if (problem) {
      problems.push(problem);
    } else {
      normalizeFolder(folder, folderPath, collection, dryRun, counters, findings);
    }
  }

  const pruning = pruneEmptyFolders(collection, { dryRun });
  for (const problem of pruning.problems) {
    if (!problems.some((existing) => existing.absolutePath === problem.absolutePath)) problems.push(problem);
  }
  const foldersRemoved = pruning.removed.length;
  return { ...counters, foldersRemoved, dryRun, problems, findings };
}

function normalizeFolder(
  folder: ResourceFolder,
  folderPath: string,
  collection: Collection,
  dryRun: boolean,
  counters: Counters,
  findings: NormalizeFinding[],
): void {
  if (folder.isEmpty()) {
    return;
  }

  let folderChanged = false;
  for (const key of folder.keys()) {
    const entry = folder.get(key)?.entry;
    if (entry) {
      for (const prop of ['source', ...translationLocales(entry)]) {
        const value = entry[prop];
        if (typeof value !== 'string') continue;
        const address = { key: fullKeyOf(folderPath, key), locale: prop === 'source' ? collection.baseLocale : prop };
        for (const found of checkStoredValue(value, {
          rules: ['collapsed-case-body', 'braced-placeholder'],
          ...icuParseOptionsFor(collection.runtime),
        })) {
          if (found.kind === 'collapsed-case-body' || found.kind === 'braced-placeholder') {
            findings.push({ ...address, kind: found.kind, detail: describeStoredValueFinding(found) });
          }
        }
      }
    }
    const report = folder.normalizeEntry(key, collection.targetLocales);

    counters.entriesProcessed++;
    counters.localesAdded += report.localesAdded;
    counters.valuesConverted += report.valuesConverted;
    counters.tagsNormalized += report.tagsNormalized;
    if (report.changed) folderChanged = true;
  }

  // Normalize guarantees both files exist, so a missing file is written even without changes.
  if (!folderChanged && !folder.hasMissingFiles()) {
    return;
  }

  const { written, created } = folder.save({ dryRun });
  counters.filesCreated += created.length;
  counters.filesUpdated += written.length - created.length;
}
