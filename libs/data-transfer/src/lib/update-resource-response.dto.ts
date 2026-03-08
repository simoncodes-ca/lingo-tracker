import type { ResourceSummaryDto } from './resource-tree.dto';

export interface UpdateResourceResponseDto {
  resolvedKey: string;
  updated: boolean;
  message?: string;
  resource?: ResourceSummaryDto;
  /**
   * Locales that were skipped during auto-translation because the base value
   * uses ICU message format, which is not supported by the auto-translator.
   */
  skippedLocales?: string[];
}
