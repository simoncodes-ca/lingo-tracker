import type { ExportPlanDto } from '@simoncodes-ca/data-transfer';
import { describe, expect, it } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import {
  exportFooter,
  type ExportFooterInput,
  exportPlanPresentation,
  exportFixSection,
} from './export-dialog-decisions';

const plan = (overrides: Partial<ExportPlanDto> = {}): ExportPlanDto => ({
  format: 'xliff',
  outputDirectory: 'handoff',
  collections: ['main', 'other'],
  locales: ['fr', 'ja', 'de'],
  files: [
    { locale: 'fr', path: 'handoff/fr.xliff', exists: false, entriesCount: 10 },
    { locale: 'de', path: 'handoff/de.xliff', exists: false, entriesCount: 5 },
    { locale: 'ja', path: 'handoff/ja.xliff', exists: false, entriesCount: 8 },
  ],
  skippedLocales: [],
  entriesTotal: 23,
  overwriteCount: 0,
  warnings: [],
  errors: [],
  hierarchicalConflicts: [],
  ...overrides,
});

const input = (overrides: Partial<ExportFooterInput> = {}): ExportFooterInput => ({
  valid: true,
  stale: false,
  status: 'ready',
  saving: false,
  running: false,
  plan: plan(),
  noTargetLocales: false,
  ...overrides,
});

describe('export dialog decisions', () => {
  it.each<[string, Partial<ExportFooterInput>, string]>([
    ['no locales precedes invalid and loading', { noTargetLocales: true, valid: false, stale: true }, 'noLocales'],
    ['invalid precedes loading', { valid: false, stale: true }, 'invalid'],
    ['stale preview with missing plan', { stale: true, plan: undefined }, 'checking'],
    ['stale precedes failed preview', { stale: true, status: 'error' }, 'checking'],
    ['loading precedes output errors', { status: 'loading', plan: plan({ outputProblem: 'bad' }) }, 'checking'],
    ['waiting', { status: 'waiting' }, 'checking'],
    [
      'preview failure precedes output errors',
      { status: 'error', plan: plan({ outputProblem: 'bad' }) },
      'previewFailed',
    ],
    ['absent plan', { plan: undefined }, 'checking'],
    ['output problem precedes plan errors', { plan: plan({ outputProblem: 'bad', errors: ['bad'] }) }, 'invalid'],
    ['plan errors precede empty files', { plan: plan({ errors: ['bad'], files: [] }) }, 'planErrors'],
    ['no files', { plan: plan({ files: [] }) }, 'nothing'],
    ['no entries', { plan: plan({ entriesTotal: 0 }) }, 'nothing'],
    ['ready', {}, 'ready'],
  ])('%s', (_name, overrides, state) => {
    expect(exportFooter(input(overrides)).footerState).toBe(state);
  });

  it.each<[Partial<ExportFooterInput>, boolean]>([
    [{}, true],
    [{ saving: true }, false],
    [{ running: true }, false],
    [{ stale: true }, false],
  ])('submit gating %j', (overrides, expected) => {
    expect(exportFooter(input(overrides)).canSubmit).toBe(expected);
  });

  it.each([0, 2])('button names file or overwrite count (%i)', (overwriteCount) => {
    expect(exportFooter(input({ plan: plan({ overwriteCount }) })).primary).toEqual({
      token: overwriteCount
        ? TRACKER_TOKENS.EXPORT.DIALOG.FOOTER.EXPORTOVERWRITEX
        : TRACKER_TOKENS.EXPORT.DIALOG.FOOTER.EXPORTX,
      count: overwriteCount || 3,
    });
  });

  it.each([undefined, plan(), plan({ outputProblem: 'bad' })])(
    'rail combines field and output errors (%j)',
    (preview) => {
      const fields = new Set(['filters']);
      expect([...exportPlanPresentation(preview, fields).railErrors]).toEqual(
        preview?.outputProblem ? ['filters', 'output'] : ['filters'],
      );
      expect([...fields]).toEqual(['filters']);
    },
  );

  it.each<[boolean, boolean, string | undefined]>([
    [true, true, undefined],
    [true, false, undefined],
    [false, true, 'output'],
    [false, false, undefined],
  ])('fix jump: invalid=%s outputProblem=%s', (invalid, outputProblem, expected) => {
    expect(exportFixSection(invalid, outputProblem)).toBe(expected);
  });
});
