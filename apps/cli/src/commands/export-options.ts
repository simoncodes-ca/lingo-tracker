import { DEFAULT_CONFIG, type ExportFormat, type ExportRunOptions, type LingoTrackerConfig } from '@simoncodes-ca/core';
import { TRANSLATION_STATUSES } from '@simoncodes-ca/domain';
import type prompts from 'prompts';
import { mergeRunOptions } from './run-option-defaults';
import {
  type ExplicitEmptyList,
  parseCommaSeparatedList,
  parseListSelection,
  selectionNames,
  selectionPrompt,
  type Selection,
} from '../utils';
import { EXPORT_DEFAULTS } from './run-option-defaults';

export interface ExportCommandOptions {
  format?: ExportFormat;
  collection?: string[];
  locale?: string[];
  status?: string[] | ExplicitEmptyList;
  tags?: string[];
  output?: string;
  structure?: 'flat' | 'hierarchical';
  rich?: boolean;
  includeBase?: boolean;
  includeStatus?: boolean;
  includeComment?: boolean;
  includeTags?: boolean;
  basePropertyName?: string;
  filename?: string;
  dryRun?: boolean;
  verbose?: boolean;
  /** Whether to emit do-not-translate instructions (default true, negation of --no-protect-notes). */
  protectNotes?: boolean;
}

export interface ExportOptionsContext {
  readonly config: Partial<Pick<LingoTrackerConfig, 'exportFolder' | 'collections'>>;
  readonly targetLocales: string[];
}

type ExportAnswers = ExportCommandOptions & {
  readonly collections?: unknown;
  readonly locales?: unknown;
  readonly statusFilter?: unknown;
};
const json = (options: ExportCommandOptions) => options.format === 'json';
const richJson = (options: ExportCommandOptions) => json(options) && Boolean(options.rich);
const toggle = (message: string): Partial<prompts.PromptObject> => ({ message, active: 'Yes', inactive: 'No' });
interface JsonOptionRule {
  readonly name:
    | 'structure'
    | 'rich'
    | 'includeBase'
    | 'includeStatus'
    | 'includeComment'
    | 'includeTags'
    | 'basePropertyName';
  readonly visible: (options: ExportCommandOptions) => boolean;
  readonly type: 'select' | 'toggle' | 'text';
  readonly defaultValue: string | boolean | undefined;
  readonly initial?: string | number | boolean;
  readonly prompt: Partial<prompts.PromptObject>;
}
const jsonOptions: readonly JsonOptionRule[] = [
  {
    name: 'structure',
    defaultValue: EXPORT_DEFAULTS.structure,
    visible: json,
    type: 'select',
    initial: EXPORT_DEFAULTS.structure === 'hierarchical' ? 0 : 1,
    prompt: {
      message: 'JSON structure type',
      choices: [
        { title: 'Hierarchical (nested objects)', value: 'hierarchical' },
        { title: 'Flat (dot-delimited keys)', value: 'flat' },
      ],
    },
  },
  {
    name: 'rich',
    visible: json,
    type: 'toggle',
    defaultValue: EXPORT_DEFAULTS.rich,
    prompt: toggle('Use rich JSON objects (include metadata)?'),
  },
  {
    name: 'includeBase',
    visible: richJson,
    type: 'toggle',
    defaultValue: EXPORT_DEFAULTS.includeBase,
    prompt: toggle('Include base locale value in rich objects?'),
  },
  {
    name: 'includeStatus',
    visible: richJson,
    type: 'toggle',
    defaultValue: EXPORT_DEFAULTS.includeStatus,
    prompt: toggle('Include translation status in rich objects?'),
  },
  {
    name: 'includeComment',
    visible: richJson,
    type: 'toggle',
    defaultValue: EXPORT_DEFAULTS.includeComment,
    prompt: toggle('Include comments?'),
  },
  {
    name: 'includeTags',
    visible: richJson,
    type: 'toggle',
    defaultValue: EXPORT_DEFAULTS.includeTags,
    prompt: toggle('Include tags array in rich objects?'),
  },
  // Preserve the existing includeBase-only condition, including when rich is false.
  {
    name: 'basePropertyName',
    defaultValue: undefined,
    visible: (options: ExportCommandOptions) => json(options) && Boolean(options.includeBase),
    type: 'text',
    initial: EXPORT_DEFAULTS.basePropertyName,
    prompt: { message: 'Property name for base locale value' },
  },
];

/** Checks prompt selections before the runner looks up requested collection names. */
export function exportSelection(answers: ExportAnswers): Selection {
  for (const [name, label] of [
    ['collections', 'collection'],
    ['locales', 'target locale'],
    ['statusFilter', 'translation status'],
  ] as const) {
    if (stringList(answers[name])?.length === 0) throw new Error(`Select at least one ${label}.`);
  }
  return parseListSelection(answers.collection, stringList(answers.collections)) ?? { kind: 'all' };
}

/** Pure flag/answer/default resolution. The runner has already checked the Selection. */
export function resolveExportOptions(values: ExportAnswers) {
  // basePropertyName is a prompt initial, not a non-interactive default.
  const resolved = jsonOptions.reduce<ExportCommandOptions>(
    (options, rule) => ({ ...options, [rule.name]: values[rule.name] ?? rule.defaultValue }),
    {},
  );
  // This flag-shape rule precedes core validation and the base-property advisory.
  const status = values.status;
  if (status !== undefined && !Array.isArray(status)) {
    throw new Error(`Invalid --status "${status.input}". Valid statuses: ${TRANSLATION_STATUSES.join(', ')}`);
  }
  const statuses =
    (Array.isArray(status) ? status : undefined) ??
    stringList(values.statusFilter) ??
    parseCommaSeparatedList(EXPORT_DEFAULTS.status) ??
    [];
  if (statuses.length === 0) {
    throw new Error(`Invalid --status "". Valid statuses: ${TRANSLATION_STATUSES.join(', ')}`);
  }
  const options: Omit<ExportRunOptions, 'format'> & { format?: ExportCommandOptions['format'] } = {
    format: values.format,
    outputDirectory: values.output || undefined,
    locales: selectionNames(parseListSelection(values.locale, stringList(values.locales))),
    status: statuses,
    tags: values.tags?.length ? values.tags : undefined,
    filenamePattern: values.filename || undefined,
    dryRun: values.dryRun,
    verbose: values.verbose,
    jsonStructure: resolved.structure,
    richJson: resolved.rich,
    includeBase: resolved.includeBase,
    includeStatus: resolved.includeStatus,
    includeComment: resolved.includeComment,
    includeTags: resolved.includeTags,
    basePropertyName: values.basePropertyName || undefined,
    augmentProtectedTerms: values.protectNotes !== false,
  };
  const advisories =
    options.basePropertyName && !options.includeBase
      ? ['--base-property-name has no effect without --include-base']
      : [];
  return { options, advisories };
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

/** The questions for every option the flags left out. */
export function exportQuestions(
  options: ExportCommandOptions,
  { config, targetLocales }: ExportOptionsContext,
): prompts.PromptObject[] {
  const collectionNames = Object.keys(config.collections || {});
  const selectedStatuses = parseCommaSeparatedList(EXPORT_DEFAULTS.status) ?? [];

  const commonQuestions: { flag: keyof ExportCommandOptions; question: prompts.PromptObject }[] = [
    {
      flag: 'format',
      question: {
        type: 'select',
        name: 'format',
        message: 'Select export format',
        choices: [
          { title: 'XLIFF 1.2 (for translation tools)', value: 'xliff' },
          { title: 'JSON (for runtime bundles)', value: 'json' },
        ],
        initial: 0,
      },
    },
    {
      flag: 'collection',
      question: selectionPrompt({
        name: 'collections',
        message: 'Select collections to export',
        choices: collectionNames,
        allTitle: 'All Collections',
        mode: 'multiple',
      }),
    },
    {
      flag: 'locale',
      question: selectionPrompt({
        name: 'locales',
        message: 'Select target locales to export',
        choices: targetLocales,
        allTitle: 'All Target Locales',
        mode: 'multiple',
      }),
    },
    {
      flag: 'status',
      question: {
        type: 'multiselect',
        name: 'statusFilter',
        message: 'Filter by translation status',
        choices: [
          {
            title: 'New (not yet translated)',
            value: 'new',
            selected: selectedStatuses.includes('new'),
          },
          {
            title: 'Stale (source changed)',
            value: 'stale',
            selected: selectedStatuses.includes('stale'),
          },
          {
            title: 'Translated (has translation)',
            value: 'translated',
            selected: selectedStatuses.includes('translated'),
          },
          {
            title: 'Verified (reviewed)',
            value: 'verified',
            selected: selectedStatuses.includes('verified'),
          },
        ],
        min: 1,
        hint: 'Space to select. Return to submit',
        instructions: false,
      },
    },
    {
      flag: 'tags',
      question: {
        type: 'text',
        name: 'tags',
        message: 'Filter by tags (comma-separated, optional)',
        initial: '',
      },
    },
    {
      flag: 'output',
      question: {
        type: 'text',
        name: 'output',
        message: 'Output directory',
        initial: config.exportFolder || DEFAULT_CONFIG.exportFolder,
      },
    },
  ];
  const questions = commonQuestions.filter(({ flag }) => !options[flag]).map(({ question }) => question);

  // One dependency table drives visibility and default resolution. XLIFF flags
  // omit these descriptors altogether, as the original prompt schema did.
  if (!options.format || options.format === 'json') {
    for (const rule of jsonOptions) {
      if (options[rule.name] !== undefined) continue;
      questions.push({
        ...rule.prompt,
        name: rule.name,
        type: (_prev: unknown, answers: ExportAnswers) =>
          rule.visible(mergeRunOptions(options, answers)) ? rule.type : null,
        initial: rule.initial ?? rule.defaultValue,
      });
    }
  }

  // Custom filename pattern
  if (!options.filename) {
    questions.push({
      type: 'text',
      name: 'filename',
      message: 'Custom filename pattern (optional, e.g., "translations-{locale}")',
      initial: '',
    });
  }

  return questions;
}
