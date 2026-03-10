import { existsSync } from 'node:fs';
import { calculateChecksum } from './checksum';
import { validateAndResolvePaths } from '../lib/resource/resource-file-paths';
import { readResourceEntries, readTrackerMetadata, writeJsonFile } from '../lib/file-io/json-file-operations';
import { updateMetadataForBaseValueChange } from '../lib/resource/metadata-operations';
import type { ResourceTreeEntry } from '../lib/resource/load-resource-tree';
import type { TranslationConfig } from '../config/translation-config';
import { autoTranslateResource } from '../lib/translation/auto-translate-resources';

export interface EditResourceOptions {
  key: string;
  targetFolder?: string;
  baseValue?: string;
  comment?: string;
  tags?: string[];
  locales?: Record<string, { value: string }>;
  baseLocale?: string;
  cwd?: string;
  translationConfig?: TranslationConfig;
  /**
   * All configured locales. Required when using auto-translation after a base
   * value change so the orchestrator knows which target locales to update.
   */
  allLocales?: string[];
}

export interface EditResourceResult {
  resolvedKey: string;
  updated: boolean;
  message?: string;
  entry?: ResourceTreeEntry;
  skippedLocales?: string[];
}

/**
 * Edits an existing resource entry in the translations folder.
 *
 * When `options.translationConfig` is enabled and `options.baseValue` changes,
 * all non-base locales are automatically re-translated. The updated translations
 * are written in a second pass after the initial save, so the base value change
 * is persisted even if auto-translation fails.
 *
 * @param translationsFolder - Root translations folder path
 * @param options - Edit options including the resource key and fields to update
 * @returns Result object indicating what changed
 */
export async function editResource(
  translationsFolder: string,
  options: EditResourceOptions,
): Promise<EditResourceResult> {
  const { cwd = process.cwd(), baseLocale = 'en' } = options;

  const paths = validateAndResolvePaths({
    key: options.key,
    translationsFolder,
    targetFolder: options.targetFolder,
    cwd,
  });

  if (!existsSync(paths.resourceEntriesPath) || !existsSync(paths.trackerMetaPath)) {
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
  let baseValueDidChange = false;

  // 1. Update Base Value
  if (options.baseValue !== undefined && options.baseValue !== resourceEntry.source) {
    resourceEntry.source = options.baseValue;

    metaEntry = updateMetadataForBaseValueChange({
      metadata: metaEntry,
      newBaseValue: options.baseValue,
      baseLocale,
    });

    trackerMeta[paths.entryKey] = metaEntry;
    hasChanges = true;
    baseValueDidChange = true;
  }

  // 2. Update Comment
  if (options.comment !== undefined && options.comment !== resourceEntry.comment) {
    resourceEntry.comment = options.comment;
    hasChanges = true;
  }

  // 3. Update Tags
  if (options.tags !== undefined) {
    const currentTags = resourceEntry.tags || [];
    const newTags = options.tags;
    const isDifferent =
      currentTags.length !== newTags.length || !currentTags.every((tag, index) => tag === newTags[index]);

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

  if (!hasChanges) {
    return {
      resolvedKey: paths.resolvedKey,
      updated: false,
      message: 'No changes detected',
    };
  }

  // Persist the changes before attempting auto-translation. This ensures the
  // base value update is durable even if the translation API call fails.
  writeJsonFile({ filePath: paths.resourceEntriesPath, data: resourceEntries });
  writeJsonFile({ filePath: paths.trackerMetaPath, data: trackerMeta });

  // 5. Auto-translate when base value changed and translation is configured
  let autoTranslateSkippedLocales: string[] | undefined;

  if (baseValueDidChange && options.baseValue !== undefined) {
    const updatedEntry = await applyAutoTranslationsAfterBaseValueChange({
      resourceEntry,
      metaEntry,
      baseValue: options.baseValue,
      baseLocale,
      allLocales: options.allLocales,
      translationConfig: options.translationConfig,
    });

    if (updatedEntry.skippedLocales.length > 0) {
      autoTranslateSkippedLocales = updatedEntry.skippedLocales;
    }

    if (updatedEntry.didTranslate) {
      // Persist translated values
      resourceEntries[paths.entryKey] = resourceEntry;
      trackerMeta[paths.entryKey] = metaEntry;
      writeJsonFile({ filePath: paths.resourceEntriesPath, data: resourceEntries });
      writeJsonFile({ filePath: paths.trackerMetaPath, data: trackerMeta });
    }
  }

  const translations: Record<string, string> = {};
  for (const [prop, value] of Object.entries(resourceEntry)) {
    if (prop !== 'source' && prop !== 'tags' && prop !== 'comment' && typeof value === 'string') {
      translations[prop] = value;
    }
  }

  const entry: ResourceTreeEntry = {
    key: paths.entryKey,
    source: resourceEntry.source,
    translations,
    metadata: metaEntry,
    ...(resourceEntry.comment !== undefined && { comment: resourceEntry.comment }),
    ...(resourceEntry.tags !== undefined && resourceEntry.tags.length > 0 && { tags: resourceEntry.tags }),
  };

  return {
    resolvedKey: paths.resolvedKey,
    updated: true,
    entry,
    ...(autoTranslateSkippedLocales !== undefined && { skippedLocales: autoTranslateSkippedLocales }),
  };
}

interface ApplyAutoTranslationsParams {
  readonly resourceEntry: Record<string, unknown>;
  readonly metaEntry: Record<string, unknown>;
  readonly baseValue: string;
  readonly baseLocale: string;
  readonly allLocales: string[] | undefined;
  readonly translationConfig: TranslationConfig | undefined;
}

interface ApplyAutoTranslationsResult {
  readonly didTranslate: boolean;
  readonly skippedLocales: string[];
}

/**
 * Translates the updated base value to all non-base locales and mutates
 * `resourceEntry` and `metaEntry` in place with the results.
 *
 * Returns `{ didTranslate: false, skippedLocales: [] }` when auto-translation is
 * not configured, disabled, or when no target locales are available.
 */
async function applyAutoTranslationsAfterBaseValueChange(
  params: ApplyAutoTranslationsParams,
): Promise<ApplyAutoTranslationsResult> {
  const { resourceEntry, metaEntry, baseValue, baseLocale, allLocales, translationConfig } = params;

  if (!translationConfig?.enabled || !allLocales || allLocales.length === 0) {
    return { didTranslate: false, skippedLocales: [] };
  }

  const targetLocales = allLocales.filter((locale) => locale !== baseLocale);
  if (targetLocales.length === 0) {
    return { didTranslate: false, skippedLocales: [] };
  }

  const autoTranslateResult = await autoTranslateResource({
    baseValue,
    baseLocale,
    targetLocales,
    translationConfig,
  });

  if (autoTranslateResult.translations.length === 0) {
    return { didTranslate: false, skippedLocales: autoTranslateResult.skippedLocales };
  }

  const newBaseChecksum = calculateChecksum(baseValue);

  for (const { locale, value } of autoTranslateResult.translations) {
    resourceEntry[locale] = value;
    const translationChecksum = calculateChecksum(value);

    const existingMeta = metaEntry[locale] as Record<string, unknown> | undefined;
    (metaEntry as Record<string, unknown>)[locale] = {
      ...existingMeta,
      checksum: translationChecksum,
      baseChecksum: newBaseChecksum,
      status: 'translated',
    };
  }

  return { didTranslate: true, skippedLocales: autoTranslateResult.skippedLocales };
}
