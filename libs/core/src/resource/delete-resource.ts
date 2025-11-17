import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ResourceEntries } from './resource-entry';
import { TrackerMetadata } from './tracker-metadata';
import {
  validateKey,
  resolveResourceKey,
  splitResolvedKey,
} from './resource-key';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../constants';

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
    } catch (error) {
      errors.push({
        key,
        error: (error as { message?: string })?.message || 'Unknown error occurred',
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

  const resolvedKey = resolveResourceKey(key, undefined);
  const { folderPath, entryKey } = splitResolvedKey(resolvedKey);

  const fullFolderPath = folderPath.length
    ? join(translationsFolder, ...folderPath)
    : translationsFolder;

  if (!existsSync(fullFolderPath)) {
    throw new Error(`Folder not found: ${fullFolderPath}`);
  }

  const entryResourcePath = resolve(fullFolderPath, RESOURCE_ENTRIES_FILENAME);
  const entryMetaPath = resolve(fullFolderPath, TRACKER_META_FILENAME);

  if (!existsSync(entryResourcePath)) {
    throw new Error(`Resource file not found: ${entryResourcePath}`);
  }

  const resourceEntries: ResourceEntries = loadJsonFile(entryResourcePath);

  if (!(entryKey in resourceEntries)) {
    throw new Error(`Resource entry not found: ${key}`);
  }

  delete resourceEntries[entryKey];

  let trackerMeta: TrackerMetadata = {};
  if (existsSync(entryMetaPath)) {
    trackerMeta = loadJsonFile(entryMetaPath);
    delete trackerMeta[entryKey];
  }

  const isEmpty = Object.keys(resourceEntries).length === 0;

  if (isEmpty) {
    unlinkSync(entryResourcePath);
    if (existsSync(entryMetaPath)) {
      unlinkSync(entryMetaPath);
    }
  } else {
    writeFileSync(entryResourcePath, JSON.stringify(resourceEntries, null, 2));
    writeFileSync(entryMetaPath, JSON.stringify(trackerMeta, null, 2));
  }

  return true;
}

function loadJsonFile<T>(filePath: string): T {
  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (_error) {
    throw new Error(`Failed to read or parse file: ${filePath}`);
  }
}