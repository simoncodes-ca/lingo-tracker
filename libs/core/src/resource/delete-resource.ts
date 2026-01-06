import { existsSync, unlinkSync } from 'node:fs';
import { resolveResourcePaths } from '../lib/resource/resource-file-paths';
import { readResourceEntries, readTrackerMetadata, writeJsonFile } from '../lib/file-io/json-file-operations';
import { validateKey } from './resource-key';
import { TrackerMetadata } from './tracker-metadata';

export interface DeleteResourceParams {
  keys: string[];
}

export interface DeleteResourceResult {
  entriesDeleted: number;
  errors?: Array<{
    key: string;
    error: string;
  }>;
}

export function deleteResource(
  translationsFolder: string,
  params: DeleteResourceParams
): DeleteResourceResult {
  let entriesDeleted = 0;
  const errors: Array<{ key: string; error: string }> = [];

  for (const key of params.keys) {
    try {
      const deletionSucceeded = deleteSingleResource(translationsFolder, key);
      if (deletionSucceeded) {
        entriesDeleted++;
      }
    } catch (caughtError) {
      errors.push({
        key,
        error: (caughtError as { message?: string })?.message || 'Unknown error occurred',
      });
    }
  }

  return {
    entriesDeleted,
    errors: errors.length > 0 ? errors : undefined,
  };
}

function deleteSingleResource(
  translationsFolder: string,
  key: string
): boolean {
  validateKey(key);

  const paths = resolveResourcePaths({
    key,
    translationsFolder,
  });

  if (!existsSync(paths.folderPath)) {
    throw new Error(`Folder not found: ${paths.folderPath}`);
  }

  if (!existsSync(paths.resourceEntriesPath)) {
    throw new Error(`Resource file not found: ${paths.resourceEntriesPath}`);
  }

  const resourceEntries = readResourceEntries(paths.resourceEntriesPath);

  if (!(paths.entryKey in resourceEntries)) {
    throw new Error(`Resource entry not found: ${key}`);
  }

  delete resourceEntries[paths.entryKey];

  // Load and update metadata
  let trackerMeta: TrackerMetadata = {};
  if (existsSync(paths.trackerMetaPath)) {
    trackerMeta = readTrackerMetadata(paths.trackerMetaPath);
    delete trackerMeta[paths.entryKey];
  }

  const isEmpty = Object.keys(resourceEntries).length === 0;

  if (isEmpty) {
    unlinkSync(paths.resourceEntriesPath);
    if (existsSync(paths.trackerMetaPath)) {
      unlinkSync(paths.trackerMetaPath);
    }
  } else {
    writeJsonFile({ filePath: paths.resourceEntriesPath, data: resourceEntries });
    writeJsonFile({ filePath: paths.trackerMetaPath, data: trackerMeta });
  }

  return true;
}