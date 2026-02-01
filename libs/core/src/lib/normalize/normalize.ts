import * as fs from 'fs';
import * as path from 'path';
import { normalizeEntry } from './normalize-entry';
import { cleanupEmptyFolders } from './cleanup-empty-folders';
import { ResourceEntries } from '../../resource/resource-entry';
import { TrackerMetadata } from '../../resource/tracker-metadata';

export interface NormalizeParams {
  readonly translationsFolder: string;
  readonly baseLocale: string;
  readonly locales: string[];
  readonly dryRun?: boolean;
}

export interface NormalizeResult {
  readonly entriesProcessed: number;
  readonly localesAdded: number;
  readonly filesCreated: number;
  readonly filesUpdated: number;
  readonly foldersRemoved: number;
  readonly dryRun: boolean;
}

interface NormalizationCounters {
  entriesProcessed: number;
  localesAdded: number;
  filesCreated: number;
  filesUpdated: number;
}

interface ResourceFiles {
  readonly resourceEntries: ResourceEntries;
  readonly trackerMetadata: TrackerMetadata;
  readonly resourceEntriesExisted: boolean;
  readonly trackerMetaExisted: boolean;
}

interface NormalizedFolderData {
  readonly resourceEntries: ResourceEntries;
  readonly trackerMetadata: TrackerMetadata;
  readonly folderHadChanges: boolean;
  readonly entriesProcessedCount: number;
  readonly localesAddedCount: number;
}

interface PersistResourcesParams {
  readonly folderPath: string;
  readonly resourceEntries: ResourceEntries;
  readonly trackerMetadata: TrackerMetadata;
  readonly resourceEntriesExisted: boolean;
  readonly trackerMetaExisted: boolean;
  readonly folderHadChanges: boolean;
  readonly dryRun: boolean;
}

interface PersistResourcesResult {
  readonly filesCreated: number;
  readonly filesUpdated: number;
}

function loadResourceFiles(folderPath: string): ResourceFiles | null {
  const resourceEntriesPath = path.join(folderPath, 'resource_entries.json');
  const trackerMetaPath = path.join(folderPath, 'tracker_meta.json');

  let resourceEntries: ResourceEntries = {};
  let trackerMetadata: TrackerMetadata = {};
  let resourceEntriesExisted = false;
  let trackerMetaExisted = false;

  if (fs.existsSync(resourceEntriesPath)) {
    try {
      const content = fs.readFileSync(resourceEntriesPath, 'utf8');
      resourceEntries = JSON.parse(content);
      resourceEntriesExisted = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('\n⚠️  Skipping folder due to invalid JSON:', folderPath);
      console.error('    Error in file: resource_entries.json');
      console.error('    Parse error:', errorMessage);
      console.error('    Please fix the JSON syntax manually.\n');
      return null;
    }
  }

  if (fs.existsSync(trackerMetaPath)) {
    try {
      const content = fs.readFileSync(trackerMetaPath, 'utf8');
      trackerMetadata = JSON.parse(content);
      trackerMetaExisted = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('\n⚠️  Skipping folder due to invalid JSON:', folderPath);
      console.error('    Error in file: tracker_meta.json');
      console.error('    Parse error:', errorMessage);
      console.error('    Please fix the JSON syntax manually.\n');
      return null;
    }
  }

  return {
    resourceEntries,
    trackerMetadata,
    resourceEntriesExisted,
    trackerMetaExisted,
  };
}

interface NormalizeAllEntriesParams {
  readonly resourceEntries: ResourceEntries;
  readonly trackerMetadata: TrackerMetadata;
  readonly baseLocale: string;
  readonly locales: string[];
}

function normalizeAllEntriesInFolder(
  params: NormalizeAllEntriesParams,
): NormalizedFolderData {
  const { resourceEntries, trackerMetadata, baseLocale, locales } = params;

  const entryKeys = Object.keys(resourceEntries);
  if (entryKeys.length === 0) {
    return {
      resourceEntries,
      trackerMetadata,
      folderHadChanges: false,
      entriesProcessedCount: 0,
      localesAddedCount: 0,
    };
  }

  let folderHadChanges = false;
  let entriesProcessedCount = 0;
  let localesAddedCount = 0;

  const updatedResourceEntries = { ...resourceEntries };
  const updatedTrackerMetadata = { ...trackerMetadata };

  for (const entryKey of entryKeys) {
    const resourceEntry = resourceEntries[entryKey];
    const entryMetadata = trackerMetadata[entryKey] || {};

    const result = normalizeEntry({
      entryKey,
      resourceEntry,
      metadata: entryMetadata,
      baseLocale,
      locales,
    });

    updatedResourceEntries[entryKey] = result.resourceEntry;
    updatedTrackerMetadata[entryKey] = result.metadata;

    entriesProcessedCount++;
    localesAddedCount += result.changes.localesAdded;

    if (
      result.changes.localesAdded > 0 ||
      result.changes.checksumsUpdated > 0 ||
      result.changes.statusesChanged > 0
    ) {
      folderHadChanges = true;
    }
  }

  return {
    resourceEntries: updatedResourceEntries,
    trackerMetadata: updatedTrackerMetadata,
    folderHadChanges,
    entriesProcessedCount,
    localesAddedCount,
  };
}

function writeResourceFile(
  filePath: string,
  content: ResourceEntries | TrackerMetadata,
): void {
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
}

function persistFolderResources(
  params: PersistResourcesParams,
): PersistResourcesResult {
  const {
    folderPath,
    resourceEntries,
    trackerMetadata,
    resourceEntriesExisted,
    trackerMetaExisted,
    folderHadChanges,
    dryRun,
  } = params;

  const resourceEntriesPath = path.join(folderPath, 'resource_entries.json');
  const trackerMetaPath = path.join(folderPath, 'tracker_meta.json');

  let filesCreated = 0;
  let filesUpdated = 0;

  if (!dryRun) {
    if (!resourceEntriesExisted) {
      writeResourceFile(resourceEntriesPath, resourceEntries);
      filesCreated++;
    } else if (folderHadChanges) {
      writeResourceFile(resourceEntriesPath, resourceEntries);
      filesUpdated++;
    }

    if (!trackerMetaExisted) {
      writeResourceFile(trackerMetaPath, trackerMetadata);
      filesCreated++;
    } else if (folderHadChanges) {
      writeResourceFile(trackerMetaPath, trackerMetadata);
      filesUpdated++;
    }
  } else {
    if (!resourceEntriesExisted) {
      filesCreated++;
    } else if (folderHadChanges) {
      filesUpdated++;
    }

    if (!trackerMetaExisted) {
      filesCreated++;
    } else if (folderHadChanges) {
      filesUpdated++;
    }
  }

  return { filesCreated, filesUpdated };
}

interface NormalizeFolderParams {
  readonly folderPath: string;
  readonly baseLocale: string;
  readonly locales: string[];
  readonly dryRun: boolean;
  readonly counters: NormalizationCounters;
}

async function normalizeFolderResources(
  params: NormalizeFolderParams,
): Promise<void> {
  const { folderPath, baseLocale, locales, dryRun, counters } = params;

  const resourceFiles = loadResourceFiles(folderPath);

  // Skip this folder if there was a JSON parsing error
  if (resourceFiles === null) {
    return;
  }

  const normalizedData = normalizeAllEntriesInFolder({
    resourceEntries: resourceFiles.resourceEntries,
    trackerMetadata: resourceFiles.trackerMetadata,
    baseLocale,
    locales,
  });

  if (normalizedData.entriesProcessedCount === 0) {
    return;
  }

  counters.entriesProcessed += normalizedData.entriesProcessedCount;
  counters.localesAdded += normalizedData.localesAddedCount;

  const persistResult = persistFolderResources({
    folderPath,
    resourceEntries: normalizedData.resourceEntries,
    trackerMetadata: normalizedData.trackerMetadata,
    resourceEntriesExisted: resourceFiles.resourceEntriesExisted,
    trackerMetaExisted: resourceFiles.trackerMetaExisted,
    folderHadChanges: normalizedData.folderHadChanges,
    dryRun,
  });

  counters.filesCreated += persistResult.filesCreated;
  counters.filesUpdated += persistResult.filesUpdated;
}

interface TraverseFolderParams {
  readonly folderPath: string;
  readonly baseLocale: string;
  readonly locales: string[];
  readonly dryRun: boolean;
  readonly counters: NormalizationCounters;
}

async function traverseAndNormalizeFolder(
  params: TraverseFolderParams,
): Promise<void> {
  const { folderPath, baseLocale, locales, dryRun, counters } = params;

  const entries = fs.readdirSync(folderPath);

  for (const entry of entries) {
    const entryPath = path.join(folderPath, entry);
    const stats = fs.statSync(entryPath);

    if (stats.isDirectory()) {
      await traverseAndNormalizeFolder({
        folderPath: entryPath,
        baseLocale,
        locales,
        dryRun,
        counters,
      });
    }
  }

  await normalizeFolderResources({
    folderPath,
    baseLocale,
    locales,
    dryRun,
    counters,
  });
}

/**
 * Normalizes all translation resources in a translations folder by:
 * - Ensuring resource_entries.json and tracker_meta.json exist at every level
 * - Recomputing checksums for all entries
 * - Adding missing locale entries
 * - Updating translation statuses based on base value changes
 * - Removing empty folders after normalization
 *
 * This operation is non-destructive: it preserves existing values, comments, and tags.
 *
 * @param params - Normalization parameters including folder path and locale configuration
 * @returns Summary of normalization results with counts of changes made
 */
export async function normalize(
  params: NormalizeParams,
): Promise<NormalizeResult> {
  const { translationsFolder, baseLocale, locales, dryRun = false } = params;

  const counters: NormalizationCounters = {
    entriesProcessed: 0,
    localesAdded: 0,
    filesCreated: 0,
    filesUpdated: 0,
  };

  if (!fs.existsSync(translationsFolder)) {
    return {
      entriesProcessed: 0,
      localesAdded: 0,
      filesCreated: 0,
      filesUpdated: 0,
      foldersRemoved: 0,
      dryRun,
    };
  }

  await traverseAndNormalizeFolder({
    folderPath: translationsFolder,
    baseLocale,
    locales,
    dryRun,
    counters,
  });

  const cleanupResult = cleanupEmptyFolders(translationsFolder, dryRun);

  return {
    entriesProcessed: counters.entriesProcessed,
    localesAdded: counters.localesAdded,
    filesCreated: counters.filesCreated,
    filesUpdated: counters.filesUpdated,
    foldersRemoved: cleanupResult.foldersRemoved,
    dryRun,
  };
}
