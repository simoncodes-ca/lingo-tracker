import { existsSync, readFileSync } from 'node:fs';
import type { ResourceEntry } from './resource-entry';
import type { TranslationStatus } from '@simoncodes-ca/domain';
import { validateAndResolvePaths } from '../lib/resource/resource-file-paths';
import { ensureDirectoryExists } from '../lib/file-io/directory-operations';
import { readResourceEntries, readTrackerMetadata, writeJsonFile } from '../lib/file-io/json-file-operations';
import { createResourceMetadata } from '../lib/resource/metadata-operations';
import type { TranslationConfig } from '../config/translation-config';
import { autoTranslateResource } from '../lib/translation/auto-translate-resources';
import { translocoToICU } from '@simoncodes-ca/domain';

export interface AddResourceOptions {
  cwd?: string;
  translationConfig?: TranslationConfig;
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
  /**
   * All configured locales. Required when using auto-translation so the
   * orchestrator knows which target locales to translate into.
   */
  allLocales?: string[];
}

/**
 * Adds or updates a resource entry in the translations folder.
 * Creates nested folders and files as needed at each level.
 *
 * When `options.translationConfig` is provided and enabled, and no explicit
 * translations are supplied, the base value is automatically translated to all
 * non-base locales using the configured provider.
 *
 * @param translationsFolder - Root translations folder path
 * @param params - Resource creation parameters
 * @param options - Additional options (e.g., cwd, translationConfig)
 * @returns Object with the resolved key, status, actual translations written to disk,
 *          and any locales skipped due to ICU format (only present when auto-translation ran)
 */
export async function addResource(
  translationsFolder: string,
  params: AddResourceParams,
  options: AddResourceOptions = {},
): Promise<{
  resolvedKey: string;
  created: boolean;
  translations: Array<{ locale: string; value: string; status: TranslationStatus }>;
  skippedLocales?: string[];
}> {
  const { cwd = process.cwd(), translationConfig } = options;
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
    errorContext: 'Creating resource folder',
  });

  // Check if entry already exists
  const isNewEntry = !existsSync(paths.resourceEntriesPath) || !hasEntryKey(paths.resourceEntriesPath, paths.entryKey);

  // Load or create resource entries
  const resourceEntries = readResourceEntries(paths.resourceEntriesPath, {});

  // Build resource entry — normalize values to ICU format before storing
  const normalizedBaseValue = translocoToICU(params.baseValue);
  const resourceEntry: ResourceEntry = {
    source: normalizedBaseValue,
  };

  if (params.comment) {
    resourceEntry.comment = params.comment;
  }

  if (params.tags && params.tags.length > 0) {
    resourceEntry.tags = params.tags;
  }

  // Resolve translations: prefer explicit translations, fall back to auto-translation, then nothing.
  // Pass the ICU-normalized base value so the translation provider receives the stored form,
  // not the raw Transloco-style input from the caller.
  const resolveResult = await resolveTranslations({
    params,
    normalizedBaseValue,
    baseLocale,
    translationConfig,
  });

  const resolvedTranslations = resolveResult?.translations ?? null;

  // Add translations (skip base locale - it's in 'source') — normalize values to ICU format
  if (resolvedTranslations) {
    resolvedTranslations.forEach(({ locale, value }) => {
      // Skip base locale - its value comes from 'source' property
      if (locale !== baseLocale) {
        resourceEntry[locale] = translocoToICU(value);
      }
    });
  }

  resourceEntries[paths.entryKey] = resourceEntry;

  // Create metadata — use the already-normalized base value for checksum consistency
  const trackerMeta = readTrackerMetadata(paths.trackerMetaPath, {});

  const normalizedTranslations = resolvedTranslations?.map(({ locale, value, status }) => ({
    locale,
    value: translocoToICU(value),
    status,
  }));

  trackerMeta[paths.entryKey] = createResourceMetadata({
    entryKey: paths.entryKey,
    baseValue: normalizedBaseValue,
    baseLocale,
    translations: normalizedTranslations ?? undefined,
  });

  // Write files back
  writeJsonFile({ filePath: paths.resourceEntriesPath, data: resourceEntries });
  writeJsonFile({ filePath: paths.trackerMetaPath, data: trackerMeta });

  return {
    resolvedKey: paths.resolvedKey,
    created: isNewEntry,
    translations: normalizedTranslations ?? [],
    ...(resolveResult?.skippedLocales !== undefined && { skippedLocales: resolveResult.skippedLocales }),
  };
}

interface ResolveTranslationsParams {
  readonly params: AddResourceParams;
  /** ICU-normalized form of the base value — this is what gets stored and what the translation provider should receive. */
  readonly normalizedBaseValue: string;
  readonly baseLocale: string;
  readonly translationConfig: TranslationConfig | undefined;
}

interface ResolveTranslationsResult {
  readonly translations: Array<{ locale: string; value: string; status: TranslationStatus }>;
  readonly skippedLocales: string[];
}

/**
 * Determines which translations to use for the resource entry.
 *
 * Priority:
 * 1. Explicit `params.translations` — used as-is when provided (no `skippedLocales`).
 * 2. Auto-translation — triggered when `translationConfig` is enabled and
 *    `params.allLocales` is set (caller must supply target locale list).
 * 3. No translations — returns `undefined` so the entry is stored without them.
 */
async function resolveTranslations(
  resolveParams: ResolveTranslationsParams,
): Promise<ResolveTranslationsResult | undefined> {
  const { params, normalizedBaseValue, baseLocale, translationConfig } = resolveParams;

  if (params.translations && params.translations.length > 0) {
    return { translations: params.translations, skippedLocales: [] };
  }

  const shouldAutoTranslate = translationConfig?.enabled && params.allLocales && params.allLocales.length > 0;
  if (!shouldAutoTranslate || !translationConfig || !params.allLocales) {
    return undefined;
  }

  const targetLocales = params.allLocales.filter((locale) => locale !== baseLocale);
  if (targetLocales.length === 0) {
    return undefined;
  }

  const autoTranslateResult = await autoTranslateResource({
    baseValue: normalizedBaseValue,
    baseLocale,
    targetLocales,
    translationConfig,
  });

  return {
    translations: autoTranslateResult.translations.map(({ locale, value, status }) => ({ locale, value, status })),
    skippedLocales: autoTranslateResult.skippedLocales,
  };
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
