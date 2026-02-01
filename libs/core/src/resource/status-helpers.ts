import type { TranslationStatus } from './translation-status';
import type { LocaleMetadata } from './locale-metadata';

/**
 * Gets the initial status for a newly created resource entry.
 * New entries are marked as "new".
 * @returns The initial status
 */
export function getInitialStatus(): TranslationStatus {
  return 'new';
}

/**
 * Determines the status when a translation value is added/updated.
 * Translated entries are marked as "translated".
 * @returns The translated status
 */
export function getTranslatedStatus(): TranslationStatus {
  return 'translated';
}

/**
 * Determines if a resource should be marked as stale.
 * A translation becomes stale when the base locale value changes but the translation has not been updated.
 * This happens when baseChecksum changes but the translation was previously translated.
 * @param currentMetadata - The current locale metadata
 * @param newBaseChecksum - The new checksum of the base locale value
 * @returns true if the entry should be marked stale
 */
export function shouldMarkStale(currentMetadata: LocaleMetadata, newBaseChecksum: string): boolean {
  // Only mark stale if:
  // 1. There's a previous baseChecksum (meaning this was a translated entry)
  // 2. The new base checksum differs from the stored one
  return currentMetadata.baseChecksum !== undefined && currentMetadata.baseChecksum !== newBaseChecksum;
}

/**
 * Creates metadata for a base locale entry.
 * Base entries only have a checksum, no status (implicitly "source").
 * @param checksum - The MD5 checksum of the base value
 * @returns Metadata object for the base locale
 */
export function createBaseLocaleMetadata(checksum: string): LocaleMetadata {
  return {
    checksum,
  };
}

/**
 * Creates metadata for a new translated entry.
 * New translations are marked as "new" until confirmed/imported.
 * @param checksum - The MD5 checksum of the translated value
 * @param baseChecksum - The MD5 checksum of the base value at time of translation
 * @returns Metadata object for the translated locale
 */
export function createTranslatedMetadata(checksum: string, baseChecksum: string): LocaleMetadata {
  return {
    checksum,
    baseChecksum,
    status: 'translated',
  };
}

/**
 * Updates metadata when base locale value changes.
 * Marks all non-base entries as stale if their baseChecksum differs from the new base.
 * @param metadata - The existing locale metadata
 * @param newBaseChecksum - The new checksum of the base locale value
 * @returns Updated metadata (may mark as stale)
 */
export function updateMetadataForBaseChange(metadata: LocaleMetadata, newBaseChecksum: string): LocaleMetadata {
  if (shouldMarkStale(metadata, newBaseChecksum)) {
    return {
      ...metadata,
      baseChecksum: newBaseChecksum,
      status: 'stale',
    };
  }
  return metadata;
}
