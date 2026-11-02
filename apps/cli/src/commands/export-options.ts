import { DEFAULT_CONFIG, type ExportFormat, type LingoTrackerConfig } from '@simoncodes-ca/core';
import type prompts from 'prompts';
import { flagAdvisories } from '../runner/flag-record';
import { type ExplicitEmptyList, type Selection, selectionNames, selectionPrompt } from '../utils';
import { EXPORT_FLAGS, type ExportAnswers, type ExportPromptContext, resolveExportFlags } from './export-cmd-flags';
import { flagQuestions } from '../runner/flag-record';

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

/** The runner has already decoded and validated every selection. */
export function exportSelection(selections: Partial<Record<keyof ExportCommandOptions, Selection>>): Selection {
  return selections.collection ?? { kind: 'all' };
}

export function resolveExportOptions(
  values: ExportAnswers,
  selections: Partial<Record<keyof ExportCommandOptions, Selection>>,
) {
  values = {
    ...values,
    locale: selectionNames(selections.locale),
    status: selections.status?.kind === 'some' ? selections.status.names : values.status,
  };
  const options = resolveExportFlags(values);
  const advisories = flagAdvisories<ExportCommandOptions>(EXPORT_FLAGS, values);
  return { options, advisories };
}
function promptContext(context: ExportOptionsContext): ExportPromptContext {
  return {
    ...context,
    outputInitial: context.config.exportFolder || DEFAULT_CONFIG.exportFolder,
    selectionPrompt,
  };
}
export function exportQuestions(options: ExportCommandOptions, context: ExportOptionsContext): prompts.PromptObject[] {
  return flagQuestions<ExportCommandOptions, ExportPromptContext>(EXPORT_FLAGS, options, promptContext(context));
}
