import { calculateChecksum } from '../../resource/checksum';
import { ResourceEntry } from '../../resource/resource-entry';
import { ResourceEntryMetadata } from '../../resource/resource-entry-metadata';
import { TranslationStatus } from '../../resource/translation-status';
import { LocaleMetadata } from '../../resource/locale-metadata';

export interface NormalizeEntryParams {
  readonly entryKey: string;
  readonly resourceEntry: ResourceEntry;
  readonly metadata: ResourceEntryMetadata;
  readonly baseLocale: string;
  readonly locales: string[];
}

export interface NormalizeEntryResult {
  readonly resourceEntry: ResourceEntry;
  readonly metadata: ResourceEntryMetadata;
  readonly changes: {
    readonly localesAdded: number;
    readonly checksumsUpdated: number;
    readonly statusesChanged: number;
  };
}

interface UpdateBaseLocaleMetadataParams {
  readonly currentBaseChecksum: string;
  readonly previousBaseMetadata: LocaleMetadata | undefined;
  readonly normalizedMetadata: ResourceEntryMetadata;
  readonly baseLocale: string;
}

interface DetermineTranslationStatusParams {
  readonly hadLocaleEntry: boolean;
  readonly baseValueChanged: boolean;
  readonly currentLocaleValue: string;
  readonly baseValue: string;
  readonly previousStatus: TranslationStatus | undefined;
}

interface ProcessLocaleParams {
  readonly locale: string;
  readonly baseValue: string;
  readonly currentBaseChecksum: string;
  readonly baseValueChanged: boolean;
  readonly previousLocaleMetadata: LocaleMetadata | undefined;
  readonly normalizedEntry: ResourceEntry;
}

interface ProcessLocaleResult {
  readonly localeMetadata: LocaleMetadata;
  readonly wasLocaleAdded: boolean;
  readonly wasChecksumUpdated: boolean;
  readonly wasStatusChanged: boolean;
}

interface CreateLocaleMetadataParams {
  readonly currentLocaleChecksum: string;
  readonly currentBaseChecksum: string;
  readonly translationStatus: TranslationStatus;
}

interface TrackLocaleChangesParams {
  readonly previousLocaleMetadata: LocaleMetadata | undefined;
  readonly currentLocaleChecksum: string;
  readonly newStatus: TranslationStatus;
}

function updateBaseLocaleMetadata(params: UpdateBaseLocaleMetadataParams): number {
  const { currentBaseChecksum, previousBaseMetadata, normalizedMetadata, baseLocale } = params;

  normalizedMetadata[baseLocale] = {
    checksum: currentBaseChecksum,
  };

  const wasChecksumUpdated = !previousBaseMetadata || previousBaseMetadata.checksum !== currentBaseChecksum;
  return wasChecksumUpdated ? 1 : 0;
}

function determineTranslationStatus(params: DetermineTranslationStatusParams): TranslationStatus {
  const { hadLocaleEntry, baseValueChanged, currentLocaleValue, baseValue, previousStatus } = params;

  if (!hadLocaleEntry) {
    return 'new';
  }

  if (baseValueChanged) {
    return currentLocaleValue === baseValue ? 'new' : 'stale';
  }

  return previousStatus || 'translated';
}

function createLocaleMetadata(params: CreateLocaleMetadataParams): LocaleMetadata {
  const { currentLocaleChecksum, currentBaseChecksum, translationStatus } = params;

  return {
    checksum: currentLocaleChecksum,
    baseChecksum: currentBaseChecksum,
    status: translationStatus,
  };
}

function trackLocaleChanges(params: TrackLocaleChangesParams) {
  const { previousLocaleMetadata, currentLocaleChecksum, newStatus } = params;

  return {
    wasStatusChanged: previousLocaleMetadata?.status !== newStatus,
    wasChecksumUpdated: previousLocaleMetadata?.checksum !== currentLocaleChecksum,
  };
}

function ensureLocaleEntryExists(normalizedEntry: ResourceEntry, locale: string, baseValue: string): boolean {
  const localeValueInEntry = normalizedEntry[locale];
  const hadLocaleEntry = typeof localeValueInEntry === 'string';

  if (!hadLocaleEntry) {
    normalizedEntry[locale] = baseValue;
  }

  return hadLocaleEntry;
}

interface ProcessAllLocalesParams {
  readonly locales: string[];
  readonly baseLocale: string;
  readonly baseValue: string;
  readonly currentBaseChecksum: string;
  readonly baseValueChanged: boolean;
  readonly metadata: ResourceEntryMetadata;
  readonly normalizedEntry: ResourceEntry;
  readonly normalizedMetadata: ResourceEntryMetadata;
}

interface ProcessAllLocalesResult {
  readonly localesAdded: number;
  readonly checksumsUpdated: number;
  readonly statusesChanged: number;
}

function processLocale(params: ProcessLocaleParams): ProcessLocaleResult {
  const { locale, baseValue, currentBaseChecksum, baseValueChanged, previousLocaleMetadata, normalizedEntry } = params;

  const hadLocaleEntry = ensureLocaleEntryExists(normalizedEntry, locale, baseValue);
  const currentLocaleValue = normalizedEntry[locale] as string;
  const currentLocaleChecksum = calculateChecksum(currentLocaleValue);

  const translationStatus = determineTranslationStatus({
    hadLocaleEntry,
    baseValueChanged,
    currentLocaleValue,
    baseValue,
    previousStatus: previousLocaleMetadata?.status,
  });

  const localeMetadata = createLocaleMetadata({ currentLocaleChecksum, currentBaseChecksum, translationStatus });
  const changes = trackLocaleChanges({ previousLocaleMetadata, currentLocaleChecksum, newStatus: translationStatus });

  return {
    localeMetadata,
    wasLocaleAdded: !hadLocaleEntry,
    wasChecksumUpdated: changes.wasChecksumUpdated,
    wasStatusChanged: changes.wasStatusChanged,
  };
}

function processAllLocales(params: ProcessAllLocalesParams): ProcessAllLocalesResult {
  const { locales, baseLocale, baseValue, currentBaseChecksum, baseValueChanged, metadata, normalizedEntry, normalizedMetadata } = params;

  let localesAdded = 0;
  let checksumsUpdated = 0;
  let statusesChanged = 0;

  for (const locale of locales) {
    if (locale === baseLocale) {
      continue;
    }

    const result = processLocale({
      locale,
      baseValue,
      currentBaseChecksum,
      baseValueChanged,
      previousLocaleMetadata: metadata[locale],
      normalizedEntry,
    });

    normalizedMetadata[locale] = result.localeMetadata;

    if (result.wasLocaleAdded) localesAdded++;
    if (result.wasChecksumUpdated) checksumsUpdated++;
    if (result.wasStatusChanged) statusesChanged++;
  }

  return { localesAdded, checksumsUpdated, statusesChanged };
}

/**
 * Normalizes a single resource entry by recomputing checksums, adding missing
 * locale entries, and updating translation statuses.
 *
 * Normalization rules:
 * - Base locale checksum is always recomputed
 * - Missing locale entries are added with base value and status 'new'
 * - Locale checksums and baseChecksums are recomputed
 * - Status is set to 'stale' if base value changed (unless locale equals new base)
 * - Existing statuses are preserved when base hasn't changed
 * - Comments and tags are preserved
 *
 * @param params - Normalization parameters including entry data and configuration
 * @returns Normalized entry and metadata with change summary
 */
export function normalizeEntry(params: NormalizeEntryParams): NormalizeEntryResult {
  const { resourceEntry, metadata, baseLocale, locales } = params;

  const normalizedEntry: ResourceEntry = { ...resourceEntry };
  const normalizedMetadata: ResourceEntryMetadata = { ...metadata };

  const baseValue = resourceEntry.source;
  const currentBaseChecksum = calculateChecksum(baseValue);
  const previousBaseChecksum = metadata[baseLocale]?.checksum;
  const baseValueChanged = !!previousBaseChecksum && previousBaseChecksum !== currentBaseChecksum;

  const baseChecksumsUpdated = updateBaseLocaleMetadata({
    currentBaseChecksum,
    previousBaseMetadata: metadata[baseLocale],
    normalizedMetadata,
    baseLocale,
  });

  const localeChanges = processAllLocales({
    locales,
    baseLocale,
    baseValue,
    currentBaseChecksum,
    baseValueChanged,
    metadata,
    normalizedEntry,
    normalizedMetadata,
  });

  return {
    resourceEntry: normalizedEntry,
    metadata: normalizedMetadata,
    changes: {
      localesAdded: localeChanges.localesAdded,
      checksumsUpdated: baseChecksumsUpdated + localeChanges.checksumsUpdated,
      statusesChanged: localeChanges.statusesChanged,
    },
  };
}
