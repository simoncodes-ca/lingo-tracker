import { DEFAULT_EXPORT_BASE_PROPERTY_NAME } from './export-defaults';
import { NEEDS_WORK_STATUSES, TRANSLATION_STATUSES, type TranslationStatus } from './translation-status';

export type ExportFormat = 'xliff' | 'json';
export type JsonStructure = 'hierarchical' | 'flat';
export type ExportJsonOption =
  | 'structure'
  | 'rich'
  | 'includeBase'
  | 'includeStatus'
  | 'includeComment'
  | 'includeTags'
  | 'basePropertyName';
export interface ExportChoices {
  readonly format?: string;
  readonly rich?: boolean;
  readonly includeBase?: boolean;
  readonly basePropertyName?: string;
}
export type ExportAdvisory = { readonly reason: 'needs-rich' | 'xliff' | 'json-only' | 'needs-base' };

const requirements = Object.freeze({
  structure: 'json',
  rich: 'json',
  includeBase: 'rich-json',
  includeStatus: 'rich-json',
  includeComment: 'rich-json',
  includeTags: 'rich-json',
  basePropertyName: 'json-with-base',
} as const);

function isJson(choices: ExportChoices): boolean {
  return choices.format === 'json';
}

function isRichJson(choices: ExportChoices): boolean {
  return isJson(choices) && Boolean(choices.rich);
}

/** Prompt applicability preserves the base-property question even when rich JSON is off. */
function isApplicable(option: ExportJsonOption, choices: ExportChoices): boolean {
  switch (requirements[option]) {
    case 'json':
      return isJson(choices);
    case 'rich-json':
      return isRichJson(choices);
    case 'json-with-base':
      return isJson(choices) && Boolean(choices.includeBase);
  }
}

/** Data for callers to render; supplied-option detection and presentation belong to the caller. */
function advisory(option: ExportJsonOption, choices: ExportChoices): ExportAdvisory | undefined {
  if (option === 'basePropertyName') {
    if (choices.basePropertyName === '' || choices.basePropertyName === undefined) return undefined;
    if (!choices.includeBase) return { reason: 'needs-base' };
    // The prompt remains applicable without rich JSON, but the property has no effect.
    if (isApplicable(option, choices) && !isRichJson(choices)) return { reason: 'needs-rich' };
  }
  if (isApplicable(option, choices)) return undefined;
  if (choices.format === 'json') return { reason: 'needs-rich' };
  if (choices.format === 'xliff') return { reason: 'xliff' };
  return { reason: 'json-only' };
}

/** Browser-safe export defaults, valid enums, and combination rules shared by all entry points. */
export const exportOptionsPolicy = Object.freeze({
  defaults: Object.freeze({
    statuses: NEEDS_WORK_STATUSES as readonly TranslationStatus[],
    structure: 'hierarchical' as const,
    basePropertyName: DEFAULT_EXPORT_BASE_PROPERTY_NAME,
    rich: false,
    includeBase: false,
    includeStatus: false,
    includeComment: false,
    includeTags: false,
    protectNotes: true,
  }),
  initialFormat: 'xliff' as const,
  // Preserve the established CLI/Tracker selection order, independent of status ranking.
  statusOrder: Object.freeze([
    ...NEEDS_WORK_STATUSES,
    ...TRANSLATION_STATUSES.filter((status) => !NEEDS_WORK_STATUSES.some((needsWork) => needsWork === status)),
  ]),
  isFormat(value: unknown): value is ExportFormat {
    return value === 'xliff' || value === 'json';
  },
  isJsonStructure(value: unknown): value is JsonStructure {
    return value === 'hierarchical' || value === 'flat';
  },
  isJson,
  isRichJson,
  isApplicable,
  advisory,
});

/** Public contract for shared export defaults, validation, and advisory data. */
export type ExportOptionsPolicy = typeof exportOptionsPolicy;
