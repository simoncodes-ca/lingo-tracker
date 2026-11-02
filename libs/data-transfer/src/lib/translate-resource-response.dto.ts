import type { ResourceSummaryDto } from './resource-tree.dto';

/**
 * Response from the auto-translate endpoint.
 * Contains the updated resource and information about skipped locales.
 */
export interface TranslateResourceResponseDto {
  /** The updated resource with translated locale values applied */
  resource: ResourceSummaryDto;

  /** Number of locales that were successfully translated */
  translatedCount: number;

  /**
   * Locales that were skipped during auto-translation because the base value
   * uses ICU message format, which is not supported by the auto-translator.
   */
  skippedLocales: string[];

  /**
   * Problems that did not stop the translation, e.g. a protected-terms file the config names
   * that does not exist (nothing was guarded). Present only when there is something to report.
   */
  warnings?: string[];
}
