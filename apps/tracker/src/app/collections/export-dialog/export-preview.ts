import type { ExportPlanDto, ExportRequestDto } from '@simoncodes-ca/data-transfer';
import { exportOptionsPolicy } from '@simoncodes-ca/domain';
import { DryRunPreview, type DryRunPreviewOptions } from '../shared/dry-run-preview';
import type { ExportDraft } from './export-draft';

export type ExportPreviewOptions = DryRunPreviewOptions<ExportRequestDto, ExportPlanDto>;

export class ExportPreview extends DryRunPreview<ExportRequestDto, ExportPlanDto> {}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Fixed English sample values below are example data, not UI copy. */
export function entryShape(
  draft: ExportDraft,
  example?: ExportPlanDto['exampleKey'],
): { language: 'xml' | 'json'; lines: string[] } {
  const key = example?.key ?? 'buttons.save';
  const baseValue = example?.baseValue ?? 'Save changes';
  // Neutral on purpose: a real key beside an invented translation would read as a wrong one.
  const target = '…';
  const note = 'Do not translate: LingoTracker';
  if (draft.format === 'xliff') {
    return {
      language: 'xml',
      lines: [
        `<trans-unit id="${xml(key)}">`,
        `  <source>${xml(baseValue)}</source>`,
        `  <target>${xml(target)}</target>`,
        ...(draft.protectedTermNotes ? [`  <note>${xml(note)}</note>`] : []),
        '</trans-unit>',
      ],
    };
  }
  const options = draft.json;
  const entry = {
    value: target,
    ...(options.includeBase
      ? { [options.basePropertyName.trim() || exportOptionsPolicy.defaults.basePropertyName]: baseValue }
      : {}),
    ...(options.includeStatus ? { status: 'stale' } : {}),
    ...(options.includeComment ? { comment: 'Primary action' } : {}),
    ...(options.includeTags ? { tags: ['ui'] } : {}),
    ...(draft.protectedTermNotes ? { doNotTranslate: ['LingoTracker'] } : {}),
  };
  let shape: unknown = options.rich ? entry : target;
  const segments = options.structure === 'flat' ? [key] : key.split('.');
  for (const segment of segments.reverse()) shape = { [segment]: shape };
  return { language: 'json', lines: JSON.stringify(shape, null, 2).split('\n') };
}
