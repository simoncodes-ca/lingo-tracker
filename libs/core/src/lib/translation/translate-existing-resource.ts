import { existsSync } from 'node:fs';
import type { TranslationConfig } from '../../config/translation-config';
import type { ResourceTreeEntry } from '../resource/load-resource-tree';
import { validateAndResolvePaths } from '../resource/resource-file-paths';
import { readResourceEntries, readTrackerMetadata, writeJsonFile } from '../file-io/json-file-operations';
import { calculateChecksum } from '../../resource/checksum';
import { autoTranslateResource } from './auto-translate-resources';

export interface TranslateExistingResourceOptions {
  readonly key: string;
  readonly translationsFolder: string;
  readonly translationConfig: TranslationConfig;
  readonly allLocales: string[];
  readonly baseLocale: string;
  readonly cwd?: string;
}

export interface TranslateExistingResourceResult {
  readonly translatedCount: number;
  readonly skippedLocales: string[];
  readonly entry: ResourceTreeEntry;
}

/**
 * Translates an existing resource entry for all locales with 'new' or 'stale' status.
 *
 * Resolves the resource key to its file paths, reads the current state, identifies
 * which locales still need translation (status is 'new' or 'stale'), calls the
 * auto-translate provider, updates the resource entries and tracker metadata, and
 * writes both files to disk.
 *
 * Returns early with `translatedCount: 0` when no locales require translation.
 *
 * Throws {@link TranslationError} if the translation provider fails — callers
 * should map this to an appropriate HTTP error (e.g. 502 Bad Gateway).
 *
 * @param options - Resolution and translation parameters for this resource.
 * @returns The updated resource entry along with translation and skip counts.
 */
export async function translateExistingResource(
  options: TranslateExistingResourceOptions,
): Promise<TranslateExistingResourceResult> {
  const { key, translationsFolder, translationConfig, allLocales, baseLocale, cwd = process.cwd() } = options;

  const paths = validateAndResolvePaths({ key, translationsFolder, cwd });

  if (!existsSync(paths.resourceEntriesPath) || !existsSync(paths.trackerMetaPath)) {
    throw new Error(`Resource not found: ${paths.resolvedKey}`);
  }

  const resourceEntries = readResourceEntries(paths.resourceEntriesPath);
  const trackerMeta = readTrackerMetadata(paths.trackerMetaPath);

  if (!resourceEntries[paths.entryKey] || !trackerMeta[paths.entryKey]) {
    throw new Error(`Resource not found: ${paths.resolvedKey}`);
  }

  const resourceEntry = resourceEntries[paths.entryKey];
  const metaEntry = trackerMeta[paths.entryKey];
  const baseValue = resourceEntry.source;

  const targetLocales = allLocales.filter((locale) => {
    if (locale === baseLocale) return false;
    const localeMeta = metaEntry[locale];
    return !localeMeta || localeMeta.status === 'new' || localeMeta.status === 'stale';
  });

  if (targetLocales.length === 0) {
    const translations: Record<string, string> = {};
    for (const [prop, value] of Object.entries(resourceEntry)) {
      if (prop !== 'source' && prop !== 'tags' && prop !== 'comment' && typeof value === 'string') {
        translations[prop] = value;
      }
    }

    return {
      translatedCount: 0,
      skippedLocales: [],
      entry: {
        key: paths.entryKey,
        source: baseValue,
        translations,
        metadata: metaEntry,
        ...(resourceEntry.comment !== undefined && { comment: resourceEntry.comment }),
        ...(resourceEntry.tags !== undefined && resourceEntry.tags.length > 0 && { tags: resourceEntry.tags }),
      },
    };
  }

  const { translations: translatedEntries, skippedLocales } = await autoTranslateResource({
    baseValue,
    baseLocale,
    targetLocales,
    translationConfig,
  });

  const baseChecksum = metaEntry[baseLocale]?.checksum ?? calculateChecksum(baseValue);

  for (const { locale, value } of translatedEntries) {
    resourceEntry[locale] = value;

    const newChecksum = calculateChecksum(value);
    metaEntry[locale] = {
      checksum: newChecksum,
      baseChecksum,
      status: 'translated',
    };
  }

  if (translatedEntries.length > 0) {
    writeJsonFile({ filePath: paths.resourceEntriesPath, data: resourceEntries });
    writeJsonFile({ filePath: paths.trackerMetaPath, data: trackerMeta });
  }

  const finalTranslations: Record<string, string> = {};
  for (const [prop, value] of Object.entries(resourceEntry)) {
    if (prop !== 'source' && prop !== 'tags' && prop !== 'comment' && typeof value === 'string') {
      finalTranslations[prop] = value;
    }
  }

  return {
    translatedCount: translatedEntries.length,
    skippedLocales,
    entry: {
      key: paths.entryKey,
      source: baseValue,
      translations: finalTranslations,
      metadata: metaEntry,
      ...(resourceEntry.comment !== undefined && { comment: resourceEntry.comment }),
      ...(resourceEntry.tags !== undefined && resourceEntry.tags.length > 0 && { tags: resourceEntry.tags }),
    },
  };
}
