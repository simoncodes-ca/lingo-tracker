import { existsSync, readFileSync } from 'node:fs';
import { ResourceEntry } from './resource-entry';
import { TranslationStatus } from './translation-status';
import { validateAndResolvePaths } from '../lib/resource/resource-file-paths';
import { ensureDirectoryExists } from '../lib/file-io/directory-operations';
import { readResourceEntries, readTrackerMetadata, writeJsonFile } from '../lib/file-io/json-file-operations';
import { createResourceMetadata } from '../lib/resource/metadata-operations';

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

  // Validate and resolve paths
  const paths = validateAndResolvePaths({
    key: params.key,
    translationsFolder,
    targetFolder: params.targetFolder,
    cwd,
  });

  // Ensure directory exists
  ensureDirectoryExists({
    directoryPath: paths.folderPath,
    errorContext: 'Creating resource folder'
  });

  // Check if entry already exists
  const isNewEntry = !existsSync(paths.resourceEntriesPath) ||
    !hasEntryKey(paths.resourceEntriesPath, paths.entryKey);

  // Load or create resource entries
  const resourceEntries = readResourceEntries(paths.resourceEntriesPath, {});

  // Build resource entry
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

  resourceEntries[paths.entryKey] = resourceEntry;

  // Create metadata
  const trackerMeta = readTrackerMetadata(paths.trackerMetaPath, {});

  trackerMeta[paths.entryKey] = createResourceMetadata({
    entryKey: paths.entryKey,
    baseValue: params.baseValue,
    baseLocale,
    translations: params.translations,
  });

  // Write files back
  writeJsonFile({ filePath: paths.resourceEntriesPath, data: resourceEntries });
  writeJsonFile({ filePath: paths.trackerMetaPath, data: trackerMeta });

  return { resolvedKey: paths.resolvedKey, created: isNewEntry };
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
