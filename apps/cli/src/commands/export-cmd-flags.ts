import type { ExportRunOptions } from '@simoncodes-ca/core';
import {
  type ExportJsonOption,
  exportOptionsPolicy,
  TRANSLATION_STATUSES,
  type TranslationStatus,
} from '@simoncodes-ca/domain';
import type prompts from 'prompts';
import { flagName, type ResolvingFlagRecords, resolveFlag } from '../runner/flag-record';
import type { selectionPrompt } from '../utils/prompt-utils';
import type { ExportCommandOptions, ExportOptionsContext } from './export-options';

export type ExportAnswers = ExportCommandOptions & {
  readonly collections?: unknown;
  readonly locales?: unknown;
  readonly statusFilter?: unknown;
};
export interface ExportPromptContext extends ExportOptionsContext {
  readonly outputInitial: string;
  readonly selectionPrompt: typeof selectionPrompt;
}
export type ResolvedExportOptions = Required<
  Omit<ExportRunOptions, 'format' | 'cwd' | 'exportFolder' | 'onStart' | 'onProgress'>
> &
  Pick<ExportRunOptions, 'cwd' | 'exportFolder' | 'onStart' | 'onProgress'> & {
    format: ExportCommandOptions['format'];
  };
type ExportOptionResults = {
  [Key in keyof Required<ExportCommandOptions>]: Pick<
    ResolvedExportOptions,
    Key extends 'output'
      ? 'outputDirectory'
      : Key extends 'locale'
        ? 'locales'
        : Key extends 'filename'
          ? 'filenamePattern'
          : Key extends 'structure'
            ? 'jsonStructure'
            : Key extends 'rich'
              ? 'richJson'
              : Key extends 'protectNotes'
                ? 'augmentProtectedTerms'
                : Extract<Key, keyof ResolvedExportOptions>
  >;
};

const FORMAT_CHOICES = [
  { title: 'XLIFF 1.2 (for translation tools)', value: 'xliff' },
  { title: 'JSON (for runtime bundles)', value: 'json' },
];
const STRUCTURE_CHOICES = [
  { title: 'Hierarchical (nested objects)', value: 'hierarchical' },
  { title: 'Flat (dot-delimited keys)', value: 'flat' },
];

const optionAdvice = (option: ExportJsonOption, flag: string) => (values: ExportCommandOptions) => {
  const advice = exportOptionsPolicy.advisory(option, values);
  if (!advice) return undefined;
  const messages = {
    'needs-rich': `${flag} has no effect without --rich.`,
    xliff: `${flag} has no effect with --format xliff.`,
    'json-only': `${flag} applies only to JSON exports.`,
    'needs-base': `${flag} has no effect without --include-base.`,
  };
  return messages[advice.reason];
};
const toggle = (message: string): Partial<prompts.PromptObject> => ({ message, active: 'Yes', inactive: 'No' });
const STATUS_TITLES: Record<TranslationStatus, string> = {
  new: 'New (not yet translated)',
  stale: 'Stale (source changed)',
  translated: 'Translated (has translation)',
  verified: 'Verified (reviewed)',
};
// Keep the status fallback help-only; resolution and prompt selection use exportOptionsPolicy.defaults.statuses directly.
function resolveStatuses(values: ExportAnswers): string[] {
  const status = values.status;
  if (status !== undefined && Array.isArray(status) === false) {
    throw new Error(
      `Invalid ${flagName(EXPORT_FLAGS.status)} "${status.input}". Valid statuses: ${TRANSLATION_STATUSES.join(', ')}`,
    );
  }
  const statuses = (Array.isArray(status) ? status : undefined) ?? [...exportOptionsPolicy.defaults.statuses];
  if (statuses.length === 0)
    throw new Error(`Invalid ${flagName(EXPORT_FLAGS.status)} "". Valid statuses: ${TRANSLATION_STATUSES.join(', ')}`);
  return statuses;
}

export const EXPORT_FLAGS: ResolvingFlagRecords<
  ExportCommandOptions,
  ExportPromptContext,
  ExportOptionResults,
  ExportAnswers
> = {
  format: {
    flags: '-f, --format <format>',
    description: 'Export format (xliff | json)',
    prompt: (options) => {
      return options.format
        ? []
        : [
            {
              type: 'select',
              name: 'format',
              message: 'Select export format',
              choices: FORMAT_CHOICES,
              initial: FORMAT_CHOICES.findIndex((choice) => choice.value === exportOptionsPolicy.initialFormat),
            },
          ];
    },
    resolve: (values) => ({ format: values.format }),
  },
  collection: {
    selection: {
      prompt: 'collections',
      defaultAll: true,
      emptyPromptError: 'Select at least one collection.',
    },
    flags: '-c, --collection <names>',
    description: 'Specific collection(s) to export (comma-separated)',
    list: 'optional',
    prompt: (options, context) => {
      return options.collection
        ? []
        : [
            context.selectionPrompt({
              name: 'collections',
              message: 'Select collections to export',
              choices: Object.keys(context.config.collections || {}),
              allTitle: 'All Collections',
              mode: 'multiple',
            }),
          ];
    },
    resolve: () => ({}),
  },
  locale: {
    selection: {
      prompt: 'locales',
      defaultAll: true,
      emptyPromptError: 'Select at least one target locale.',
    },
    flags: '-l, --locale <locales>',
    description: 'Target locale(s) to export (comma-separated)',
    list: 'optional',
    prompt: (options, context) => {
      return options.locale
        ? []
        : [
            context.selectionPrompt({
              name: 'locales',
              message: 'Select target locales to export',
              choices: context.targetLocales,
              allTitle: 'All Target Locales',
              mode: 'multiple',
            }),
          ];
    },
    resolve: (values) => ({ locales: values.locale }),
  },
  status: {
    selection: {
      prompt: 'statusFilter',
      emptyPromptError: 'Select at least one translation status.',
    },
    flags: '-s, --status <statuses>',
    description: 'Filter by translation status (comma-separated)',
    list: 'preserve',
    helpDefault: exportOptionsPolicy.defaults.statuses.join(','),
    prompt: (options) => {
      return options.status
        ? []
        : [
            {
              type: 'multiselect',
              name: 'statusFilter',
              message: 'Filter by translation status',
              choices: TRANSLATION_STATUSES.map((status) => ({
                title: STATUS_TITLES[status],
                value: status,
                selected: exportOptionsPolicy.defaults.statuses.includes(status),
              })).sort(
                (left, right) =>
                  exportOptionsPolicy.statusOrder.indexOf(left.value) -
                  exportOptionsPolicy.statusOrder.indexOf(right.value),
              ),
              min: 1,
              hint: 'Space to select. Return to submit',
              instructions: false,
            },
          ];
    },
    resolve: (values) => ({ status: resolveStatuses(values) }),
  },
  tags: {
    flags: '-t, --tags <tags>',
    description: 'Filter by tags (comma-separated)',
    list: 'optional',
    prompt: (options) => {
      return options.tags
        ? []
        : [
            {
              type: 'text',
              name: 'tags',
              message: 'Filter by tags (comma-separated, optional)',
              initial: '',
            },
          ];
    },
    resolve: (values) => ({ tags: values.tags?.length ? values.tags : undefined }),
  },
  output: {
    flags: '-o, --output <path>',
    description: 'Output directory path',
    prompt: (options, context) => {
      return options.output
        ? []
        : [
            {
              type: 'text',
              name: 'output',
              message: 'Output directory',
              initial: context.outputInitial,
            },
          ];
    },
    resolve: (values) => ({ outputDirectory: values.output || undefined }),
  },
  structure: {
    flags: '--structure <type>',
    description: 'JSON structure (flat | hierarchical)',
    helpDefault: exportOptionsPolicy.defaults.structure,
    appliesWhen: exportOptionsPolicy.isJson,
    inapplicableMessage: optionAdvice('structure', '--structure'),
    prompt: () => [
      {
        message: 'JSON structure type',
        choices: STRUCTURE_CHOICES,
        name: 'structure',
        type: 'select',
        initial: STRUCTURE_CHOICES.findIndex((choice) => choice.value === exportOptionsPolicy.defaults.structure),
      },
    ],
    resolve: (values) => ({
      jsonStructure: values.structure ?? exportOptionsPolicy.defaults.structure,
    }),
  },
  rich: {
    flags: '--rich',
    description: 'Include metadata in JSON objects',
    helpDefault: exportOptionsPolicy.defaults.rich,
    appliesWhen: exportOptionsPolicy.isJson,
    inapplicableMessage: optionAdvice('rich', '--rich'),
    prompt: (_options, _context, defaultValue) => [
      {
        ...toggle('Use rich JSON objects (include metadata)?'),
        name: 'rich',
        type: 'toggle',
        initial: defaultValue,
      },
    ],
    resolve: (values, defaultValue) => ({ richJson: values.rich ?? Boolean(defaultValue) }),
  },
  includeBase: {
    flags: '--include-base',
    description: 'Include base locale value (JSON only)',
    helpDefault: exportOptionsPolicy.defaults.includeBase,
    appliesWhen: exportOptionsPolicy.isRichJson,
    inapplicableMessage: optionAdvice('includeBase', '--include-base'),
    prompt: (_options, _context, defaultValue) => [
      {
        ...toggle('Include base locale value in rich objects?'),
        name: 'includeBase',
        type: 'toggle',
        initial: defaultValue,
      },
    ],
    resolve: (values, defaultValue) => ({ includeBase: values.includeBase ?? Boolean(defaultValue) }),
  },
  includeStatus: {
    flags: '--include-status',
    description: 'Include translation status (JSON only)',
    helpDefault: exportOptionsPolicy.defaults.includeStatus,
    appliesWhen: exportOptionsPolicy.isRichJson,
    inapplicableMessage: optionAdvice('includeStatus', '--include-status'),
    prompt: (_options, _context, defaultValue) => [
      {
        ...toggle('Include translation status in rich objects?'),
        name: 'includeStatus',
        type: 'toggle',
        initial: defaultValue,
      },
    ],
    resolve: (values, defaultValue) => ({ includeStatus: values.includeStatus ?? Boolean(defaultValue) }),
  },
  includeComment: {
    flags: '--include-comment',
    description: 'Include comment (JSON only)',
    helpDefault: exportOptionsPolicy.defaults.includeComment,
    appliesWhen: exportOptionsPolicy.isRichJson,
    inapplicableMessage: optionAdvice('includeComment', '--include-comment'),
    prompt: (_options, _context, defaultValue) => [
      {
        ...toggle('Include comments?'),
        name: 'includeComment',
        type: 'toggle',
        initial: defaultValue,
      },
    ],
    resolve: (values, defaultValue) => ({ includeComment: values.includeComment ?? Boolean(defaultValue) }),
  },
  includeTags: {
    flags: '--include-tags',
    description: 'Include tags array (JSON only)',
    helpDefault: exportOptionsPolicy.defaults.includeTags,
    appliesWhen: exportOptionsPolicy.isRichJson,
    inapplicableMessage: optionAdvice('includeTags', '--include-tags'),
    prompt: (_options, _context, defaultValue) => [
      {
        ...toggle('Include tags array in rich objects?'),
        name: 'includeTags',
        type: 'toggle',
        initial: defaultValue,
      },
    ],
    resolve: (values, defaultValue) => ({ includeTags: values.includeTags ?? Boolean(defaultValue) }),
  },
  protectNotes: {
    flags: '--no-protect-notes',
    description: 'Do not emit do-not-translate instructions for protected terms',
    runtimeDefault: exportOptionsPolicy.defaults.protectNotes,
    resolve: (values, defaultValue) => ({ augmentProtectedTerms: (values.protectNotes ?? defaultValue) !== false }),
  },
  // Preserve the includeBase-only condition, including when rich is false.
  basePropertyName: {
    flags: '--base-property-name <name>',
    description: `Property name for base locale value in JSON output (default: ${exportOptionsPolicy.defaults.basePropertyName})`,
    appliesWhen: (options) => exportOptionsPolicy.isApplicable('basePropertyName', options),
    inapplicableMessage: optionAdvice('basePropertyName', '--base-property-name'),
    prompt: () => [
      {
        message: 'Property name for base locale value',
        name: 'basePropertyName',
        type: 'text',
        initial: exportOptionsPolicy.defaults.basePropertyName,
      },
    ],
    resolve: (values) => ({ basePropertyName: values.basePropertyName || undefined }),
  },
  filename: {
    flags: '--filename <pattern>',
    description: 'Custom filename pattern',
    prompt: (options) =>
      options.filename
        ? []
        : [
            {
              type: 'text',
              name: 'filename',
              message: 'Custom filename pattern (optional, e.g., "translations-{locale}")',
              initial: '',
            },
          ],
    resolve: (values) => ({ filenamePattern: values.filename || undefined }),
  },
  dryRun: {
    flags: '--dry-run',
    description: 'Show what would be exported without writing files',
    defaultValue: false,
    resolve: (values) => ({ dryRun: values.dryRun }),
  },
  verbose: {
    flags: '--verbose',
    description: 'Show detailed export progress',
    defaultValue: false,
    resolve: (values) => ({ verbose: values.verbose }),
  },
};

/** Every resolved field must be present, including fields whose value is undefined. */
export function resolveExportFlags(values: ExportAnswers): ResolvedExportOptions {
  return {
    ...resolveFlag(EXPORT_FLAGS.format, values),
    ...resolveFlag(EXPORT_FLAGS.output, values),
    ...resolveFlag(EXPORT_FLAGS.locale, values),
    ...resolveFlag(EXPORT_FLAGS.status, values),
    ...resolveFlag(EXPORT_FLAGS.tags, values),
    ...resolveFlag(EXPORT_FLAGS.filename, values),
    ...resolveFlag(EXPORT_FLAGS.dryRun, values),
    ...resolveFlag(EXPORT_FLAGS.verbose, values),
    ...resolveFlag(EXPORT_FLAGS.structure, values),
    ...resolveFlag(EXPORT_FLAGS.rich, values),
    ...resolveFlag(EXPORT_FLAGS.includeBase, values),
    ...resolveFlag(EXPORT_FLAGS.includeStatus, values),
    ...resolveFlag(EXPORT_FLAGS.includeComment, values),
    ...resolveFlag(EXPORT_FLAGS.includeTags, values),
    ...resolveFlag(EXPORT_FLAGS.basePropertyName, values),
    ...resolveFlag(EXPORT_FLAGS.protectNotes, values),
  };
}

export const EXPORT_REGISTRATION = {
  name: 'export',
  description: 'Export translation resources to XLIFF or JSON',
  flags: EXPORT_FLAGS,
};
