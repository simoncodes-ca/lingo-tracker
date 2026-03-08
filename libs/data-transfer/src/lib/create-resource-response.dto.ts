/**
 * DTO for the response when creating a resource entry.
 */
export interface CreateResourceResponseDto {
  /** Number of entries that were created (1 if new, 0 if updated) */
  entriesCreated: number;
  /** Whether the resource entry was newly created (true) or updated (false) */
  created: boolean;
  /**
   * Locales that were skipped during auto-translation because the base value
   * uses ICU message format, which is not supported by the auto-translator.
   */
  skippedLocales?: string[];
}
