import { ResourceEntryMetadata } from '../../resource/resource-entry-metadata';
import { TranslationStatus } from '../../resource/translation-status';
import { calculateChecksum } from '../../resource/checksum';
import { createBaseLocaleMetadata } from '../../resource/status-helpers';

export interface CreateResourceMetadataParams {
  /** The entry key for this resource */
  readonly entryKey: string;
  /** Base locale value */
  readonly baseValue: string;
  /** Base locale code */
  readonly baseLocale: string;
  /** Translations with locale, value, and status */
  readonly translations?: ReadonlyArray<{
    readonly locale: string;
    readonly value: string;
    readonly status: TranslationStatus;
  }>;
}

export interface UpdateBaseValueParams {
  /** Existing metadata for this entry */
  readonly metadata: ResourceEntryMetadata;
  /** New base value */
  readonly newBaseValue: string;
  /** Base locale code */
  readonly baseLocale: string;
}

/**
 * Creates complete metadata for a new resource entry.
 *
 * Handles:
 * - Creating base locale metadata with checksum
 * - Creating translation metadata with proper status
 * - Detecting when translation matches base (status = 'new')
 *
 * @param params - Metadata creation parameters
 * @returns Complete metadata object ready to be written
 */
export function createResourceMetadata(
  params: CreateResourceMetadataParams,
): ResourceEntryMetadata {
  const { baseValue, baseLocale, translations = [] } = params;

  const metadata: ResourceEntryMetadata = {};
  const baseChecksum = calculateChecksum(baseValue);

  metadata[baseLocale] = createBaseLocaleMetadata(baseChecksum);

  // Create translation metadata
  for (const { locale, value, status } of translations) {
    if (locale === baseLocale) {
      continue; // Skip base locale - already handled
    }

    const checksum = calculateChecksum(value);

    // If translation matches base value, mark as 'new' regardless of provided status
    const finalStatus = checksum === baseChecksum ? 'new' : status;

    metadata[locale] = {
      checksum,
      baseChecksum,
      status: finalStatus,
    };
  }

  return metadata;
}

/**
 * Updates metadata when the base value changes.
 *
 * Handles:
 * - Updating base locale checksum
 * - Updating baseChecksum for all translations
 * - Marking translations as 'stale'
 *
 * @param params - Update parameters
 * @returns Updated metadata object
 */
export function updateMetadataForBaseValueChange(
  params: UpdateBaseValueParams,
): ResourceEntryMetadata {
  const { metadata, newBaseValue, baseLocale } = params;

  const newBaseChecksum = calculateChecksum(newBaseValue);
  const updatedMetadata = { ...metadata };

  updatedMetadata[baseLocale] = {
    ...updatedMetadata[baseLocale],
    checksum: newBaseChecksum,
  };

  // Update all translations to reference new base and mark as stale
  for (const locale of Object.keys(updatedMetadata)) {
    if (locale !== baseLocale) {
      updatedMetadata[locale] = {
        ...updatedMetadata[locale],
        baseChecksum: newBaseChecksum,
        status: 'stale',
      };
    }
  }

  return updatedMetadata;
}
