import { TranslationStatus } from './translation-status';

/**
 * Metadata for a single locale entry.
 */
export interface LocaleMetadata {
  /** MD5 checksum of the value */
  checksum: string;
  /** MD5 checksum of the base locale value at time of translation (non-base only) */
  baseChecksum?: string;
  /** Translation status */
  status?: TranslationStatus;
}
