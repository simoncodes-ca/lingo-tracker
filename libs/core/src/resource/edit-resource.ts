import { existsSync } from 'node:fs';
import { calculateChecksum } from './checksum';
import { validateAndResolvePaths } from '../lib/resource/resource-file-paths';
import {
  readResourceEntries,
  readTrackerMetadata,
  writeJsonFile,
} from '../lib/file-io/json-file-operations';
import { updateMetadataForBaseValueChange } from '../lib/resource/metadata-operations';

export interface EditResourceOptions {
  key: string;
  targetFolder?: string;
  baseValue?: string;
  comment?: string;
  tags?: string[];
  locales?: Record<string, { value: string }>;
  baseLocale?: string;
  cwd?: string;
}

export interface EditResourceResult {
  resolvedKey: string;
  updated: boolean;
  message?: string;
}

export function editResource(
  translationsFolder: string,
  options: EditResourceOptions,
): EditResourceResult {
  const { cwd = process.cwd(), baseLocale = 'en' } = options;

  const paths = validateAndResolvePaths({
    key: options.key,
    translationsFolder,
    targetFolder: options.targetFolder,
    cwd,
  });

  if (
    !existsSync(paths.resourceEntriesPath) ||
    !existsSync(paths.trackerMetaPath)
  ) {
    throw new Error(`Resource not found: ${paths.resolvedKey}`);
  }

  const resourceEntries = readResourceEntries(paths.resourceEntriesPath);
  const trackerMeta = readTrackerMetadata(paths.trackerMetaPath);

  if (!resourceEntries[paths.entryKey] || !trackerMeta[paths.entryKey]) {
    throw new Error(`Resource not found: ${paths.resolvedKey}`);
  }

  const resourceEntry = resourceEntries[paths.entryKey];
  let metaEntry = trackerMeta[paths.entryKey];
  let hasChanges = false;

  // 1. Update Base Value
  if (
    options.baseValue !== undefined &&
    options.baseValue !== resourceEntry.source
  ) {
    resourceEntry.source = options.baseValue;

    metaEntry = updateMetadataForBaseValueChange({
      metadata: metaEntry,
      newBaseValue: options.baseValue,
      baseLocale,
    });

    trackerMeta[paths.entryKey] = metaEntry;
    hasChanges = true;
  }

  // 2. Update Comment
  if (
    options.comment !== undefined &&
    options.comment !== resourceEntry.comment
  ) {
    resourceEntry.comment = options.comment;
    hasChanges = true;
  }

  // 3. Update Tags
  if (options.tags !== undefined) {
    // Simple array comparison
    const currentTags = resourceEntry.tags || [];
    const newTags = options.tags;
    const isDifferent =
      currentTags.length !== newTags.length ||
      !currentTags.every((tag, index) => tag === newTags[index]);

    if (isDifferent) {
      resourceEntry.tags = newTags;
      hasChanges = true;
    }
  }

  // 4. Update Locales
  if (options.locales) {
    const currentBaseChecksum = metaEntry[baseLocale]?.checksum;

    Object.entries(options.locales).forEach(([locale, { value }]) => {
      if (locale === baseLocale) return; // Base value handled separately

      const currentValue = resourceEntry[locale];
      if (value !== currentValue) {
        resourceEntry[locale] = value;
        const newChecksum = calculateChecksum(value);

        if (!metaEntry[locale]) {
          metaEntry[locale] = {
            checksum: newChecksum,
            baseChecksum: currentBaseChecksum,
            status: 'translated',
          };
        } else {
          metaEntry[locale].checksum = newChecksum;
          metaEntry[locale].baseChecksum = currentBaseChecksum;
          metaEntry[locale].status = 'translated';
        }
        hasChanges = true;
      }
    });
  }

  if (hasChanges) {
    writeJsonFile({
      filePath: paths.resourceEntriesPath,
      data: resourceEntries,
    });
    writeJsonFile({ filePath: paths.trackerMetaPath, data: trackerMeta });
    return { resolvedKey: paths.resolvedKey, updated: true };
  }

  return {
    resolvedKey: paths.resolvedKey,
    updated: false,
    message: 'No changes detected',
  };
}
