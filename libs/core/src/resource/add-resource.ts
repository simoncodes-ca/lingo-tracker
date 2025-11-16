import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ResourceEntry, ResourceEntries } from './resource-entry';
import { TrackerMetadata } from './tracker-metadata';
import { ResourceEntryMetadata } from './resource-entry-metadata';
import {
  validateKey,
  validateTargetFolder,
  resolveResourceKey,
  splitResolvedKey,
} from './resource-key';
import { calculateChecksum } from './checksum';
import { createBaseLocaleMetadata } from './status-helpers';
import { TranslationStatus } from './translation-status';
import { LocaleMetadata } from './locale-metadata';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../constants';

export interface AddResourceOptions {
  cwd?: string;
}

export interface AddResourceParams {
  /** Dot-delimited key, e.g., "apps.common.buttons.ok" */
  key: string;
  /** Base locale value (the source text) */
  baseValue: string;
  /** Optional context for translators */
  comment?: string;
  /** Optional tags (will be stored as array) */
  tags?: string[];
  /** Optional target folder to override part of the path */
  targetFolder?: string;
  /** Base locale (defaults to "en") */
  baseLocale?: string;
  /** Localized translations with locale, value, and status */
  translations?: Array<{
    locale: string;
    value: string;
    status: TranslationStatus;
  }>;
}

/**
 * Adds or updates a resource entry in the translations folder.
 * Creates nested folders and files as needed at each level.
 * @param translationsFolder - Root translations folder path
 * @param params - Resource creation parameters
 * @param options - Additional options (e.g., cwd)
 * @returns Object with the resolved key and status
 */
export function addResource(
  translationsFolder: string,
  params: AddResourceParams,
  options: AddResourceOptions = {}
): { resolvedKey: string; created: boolean } {
  const { cwd = process.cwd() } = options;
  const baseLocale = params.baseLocale || 'en';

  validateKey(params.key);
  if (params.targetFolder) {
    validateTargetFolder(params.targetFolder);
  }

  const resolvedKey = resolveResourceKey(params.key, params.targetFolder);
  const { folderPath, entryKey } = splitResolvedKey(resolvedKey);

  const fullFolderPath = folderPath.length
    ? join(translationsFolder, ...folderPath)
    : translationsFolder;

  ensureFoldersExist(cwd, fullFolderPath);

  const entryResourcePath = resolve(cwd, fullFolderPath, RESOURCE_ENTRIES_FILENAME);
  const entryMetaPath = resolve(cwd, fullFolderPath, TRACKER_META_FILENAME);
  const isNewEntry = !existsSync(entryResourcePath) || !hasEntryKey(entryResourcePath, entryKey);

  const resourceEntries: ResourceEntries = loadOrCreateFile(entryResourcePath, {});

  const resourceEntry: ResourceEntry = {
    source: params.baseValue,
  };

  if (params.comment) {
    resourceEntry.comment = params.comment;
  }

  if (params.tags && params.tags.length > 0) {
    resourceEntry.tags = params.tags;
  }

  // Add translations (skip base locale - it's in 'source')
  if (params.translations) {
    params.translations.forEach(({ locale, value }) => {
      // Skip base locale - its value comes from 'source' property
      if (locale !== baseLocale) {
        resourceEntry[locale] = value;
      }
    });
  }

  resourceEntries[entryKey] = resourceEntry;

  const trackerMeta: TrackerMetadata = loadOrCreateFile(entryMetaPath, {});
  const baseChecksum = calculateChecksum(params.baseValue);

  if (!trackerMeta[entryKey]) {
    trackerMeta[entryKey] = {} as ResourceEntryMetadata;
  }

  trackerMeta[entryKey][baseLocale] = createBaseLocaleMetadata(baseChecksum);

  if (params.translations) {
    params.translations.forEach(({ locale, value, status }) => {
      const checksum = calculateChecksum(value);
      // If checksum matches baseChecksum, set status to 'new' regardless of provided status
      const finalStatus = checksum === baseChecksum ? 'new' : status;
      
      const metadata: LocaleMetadata = {
        checksum,
        baseChecksum,
        status: finalStatus,
      };
      
      trackerMeta[entryKey][locale] = metadata;
    });
  }

  // Write files back
  writeFileSync(entryResourcePath, JSON.stringify(resourceEntries, null, 2));
  writeFileSync(entryMetaPath, JSON.stringify(trackerMeta, null, 2));

  return { resolvedKey, created: isNewEntry };
}


/**
 * Ensures that all folders in the path exist, creating them if necessary.
 */
function ensureFoldersExist(cwd: string, folderPath: string): void {
  const fullPath = resolve(cwd, folderPath);
  if (!existsSync(fullPath)) {
    mkdirSync(fullPath, { recursive: true });
  }
}

/**
 * Loads a JSON file, or returns a default value if it doesn't exist.
 */
function loadOrCreateFile<T>(filePath: string, defaultValue: T): T {
  if (!existsSync(filePath)) {
    return defaultValue;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`Failed to read or parse file: ${filePath}`);
  }
}

/**
 * Checks if a resource entry already exists in a file.
 */
function hasEntryKey(filePath: string, entryKey: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as Record<string, unknown>;
    return entryKey in data;
  } catch {
    return false;
  }
}
