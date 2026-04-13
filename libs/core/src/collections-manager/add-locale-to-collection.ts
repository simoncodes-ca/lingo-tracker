import * as path from 'node:path';
import * as fs from 'node:fs';
import { validateLocale } from '@simoncodes-ca/domain';
import { updateConfig } from '../lib/config/config-file-operations';
import { walkFolders } from '../lib/normalize/iterative-folder-walker';
import { readResourceEntries, readTrackerMetadata, writeJsonFile } from '../lib/file-io/json-file-operations';
import { calculateChecksum } from '../resource/checksum';
import { ErrorMessages } from '../lib/errors/error-messages';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../constants';

export interface AddLocaleToCollectionOptions {
  readonly cwd?: string;
}

export interface AddLocaleToCollectionResult {
  readonly message: string;
  readonly entriesBackfilled: number;
  readonly filesUpdated: number;
}

export async function addLocaleToCollection(
  collectionName: string,
  locale: string,
  options: AddLocaleToCollectionOptions = {},
): Promise<AddLocaleToCollectionResult> {
  const cwd = options.cwd ?? process.cwd();

  validateLocale(locale);

  const updatedConfig = updateConfig((config) => {
    if (!config.collections?.[collectionName]) {
      throw new Error(ErrorMessages.collectionNotFound(collectionName));
    }

    const collection = config.collections[collectionName];
    const baseLocale = collection.baseLocale ?? config.baseLocale;

    if (locale === baseLocale) {
      throw new Error(ErrorMessages.cannotModifyBaseLocale(locale));
    }

    const effectiveLocales = collection.locales ?? config.locales ?? [];

    if (effectiveLocales.includes(locale)) {
      throw new Error(ErrorMessages.localeAlreadyExists(locale, collectionName));
    }

    const newLocales = [...effectiveLocales, locale];

    return {
      ...config,
      collections: {
        ...config.collections,
        [collectionName]: {
          ...collection,
          locales: newLocales,
        },
      },
    };
  }, cwd);

  const collection = updatedConfig.collections[collectionName];
  const translationsFolderPath = path.resolve(cwd, collection.translationsFolder);

  let entriesBackfilled = 0;
  let filesUpdated = 0;

  for (const visit of walkFolders(translationsFolderPath)) {
    const resourceEntriesPath = path.join(visit.absolutePath, RESOURCE_ENTRIES_FILENAME);
    const trackerMetaPath = path.join(visit.absolutePath, TRACKER_META_FILENAME);

    if (!fs.existsSync(resourceEntriesPath)) continue;

    const resourceEntries = readResourceEntries(resourceEntriesPath);

    const trackerMetadata = readTrackerMetadata(trackerMetaPath, {});

    let folderModified = false;

    for (const entryKey of Object.keys(resourceEntries)) {
      const entry = resourceEntries[entryKey];

      if (typeof entry !== 'object' || entry === null || typeof entry.source !== 'string') {
        continue;
      }

      if (typeof entry[locale] === 'string') {
        continue;
      }

      // Seed the new locale with the base (source) value and status 'new' —
      // this matches the convention used by normalizeEntry/ensureLocaleEntryExists,
      // which also seeds missing locales with baseValue and marks them 'new'.
      const baseValue = entry.source;
      const checksum = calculateChecksum(baseValue);

      entry[locale] = baseValue;

      if (!trackerMetadata[entryKey]) {
        trackerMetadata[entryKey] = {};
      }
      trackerMetadata[entryKey][locale] = {
        checksum,
        baseChecksum: checksum,
        status: 'new',
      };

      entriesBackfilled++;
      folderModified = true;
    }

    if (folderModified) {
      writeJsonFile({ filePath: resourceEntriesPath, data: resourceEntries });
      writeJsonFile({ filePath: trackerMetaPath, data: trackerMetadata });
      filesUpdated++;
    }
  }

  return {
    message: `Locale "${locale}" added to collection "${collectionName}" successfully`,
    entriesBackfilled,
    filesUpdated,
  };
}
