import type { ResourceSummaryDto } from './resource-tree.dto';
import type { TerminologyFindingsDto } from './terminology-findings.dto';

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
  /**
   * Advisory: discouraged terms in the new base value and any rule-file problem. Present only
   * when the update supplied a base value and there is something to report.
   */
  terminology?: TerminologyFindingsDto;
}
