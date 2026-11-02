import type { TranslationStatus } from './translation-status';

export interface LocaleUpdateDto {
  value: string;
  status?: TranslationStatus;
}

export interface UpdateResourceDto {
  /** The entry's full, existing key. */
  key: string;
  /**
   * Destination folder (dot-delimited; `''` for the collection root). The entry keeps its
   * entry key (the last key segment) and moves there. Omit to leave it where it is.
   */
  moveTo?: string;
  baseValue?: string;
  comment?: string;
  tags?: string[];
  locales?: Record<string, LocaleUpdateDto>;
}
