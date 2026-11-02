import type { ImportPlanDto, ImportPlanFileDto, ImportSourceListingDto } from '@simoncodes-ca/data-transfer';
import { describe, expect, it } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import {
  importFooter,
  type ImportFooterInput,
  importPlanPresentation,
  importFilesError,
} from './import-dialog-decisions';

const planFile = (name: string, locale: string, overrides: Partial<ImportPlanFileDto> = {}): ImportPlanFileDto => ({
  path: `in/${name}`,
  locale,
  format: 'xliff',
  entries: 10,
  imported: 9,
  created: 0,
  updated: 9,
  skipped: 1,
  failed: 0,
  changed: 2,
  statusTransitions: [],
  warnings: [],
  errors: [],
  ...overrides,
});

const plan = (overrides: Partial<ImportPlanDto> = {}): ImportPlanDto => ({
  collection: 'main',
  strategy: 'translation-service',
  files: [planFile('es.xliff', 'es'), planFile('fr.xliff', 'fr')],
  totals: { entries: 20, imported: 18, created: 0, updated: 18, skipped: 2, failed: 0, changed: 4 },
  statusTransitions: [{ from: 'new', to: 'translated', count: 12 }],
  icuAutoFixes: [],
  issues: [],
  warnings: [],
  errors: [],
  largeFiles: [],
  truncated: { issues: 0, icuAutoFixes: 0, warnings: 0, errors: 0 },
  ...overrides,
});

const input = (overrides: Partial<ImportFooterInput> = {}): ImportFooterInput => ({
  valid: true,
  stale: false,
  status: 'ready',
  saving: false,
  running: false,
  plan: plan(),
  readOnly: false,
  settings: true,
  uploadStatus: 'idle',
  listingStatus: 'ready',
  checkedCount: 2,
  everyFileUnreadable: false,
  ...overrides,
});

describe('import dialog decisions', () => {
  it.each<[string, Partial<ImportFooterInput>, string]>([
    ['read only precedes missing settings', { readOnly: true, settings: false }, 'readOnly'],
    ['missing settings precedes upload', { settings: false, uploadStatus: 'uploading' }, 'invalid'],
    [
      'upload precedes empty files and invalid',
      { uploadStatus: 'uploading', checkedCount: 0, valid: false },
      'checking',
    ],
    ['no files precedes invalid', { checkedCount: 0, valid: false }, 'noFiles'],
    ['listing failure precedes no files', { listingStatus: 'error', checkedCount: 0 }, 'invalid'],
    ['invalid precedes loading', { valid: false, status: 'loading' }, 'invalid'],
    ['listing loading precedes preview failure', { listingStatus: 'loading', status: 'error' }, 'checking'],
    ['stale precedes preview failure', { stale: true, status: 'error' }, 'checking'],
    ['loading', { status: 'loading' }, 'checking'],
    ['waiting', { status: 'waiting' }, 'checking'],
    ['preview failure precedes unreadable files', { status: 'error', everyFileUnreadable: true }, 'previewFailed'],
    ['missing plan', { plan: undefined }, 'checking'],
    [
      'all unreadable precedes empty totals',
      { everyFileUnreadable: true, plan: plan({ totals: { ...plan().totals, imported: 0, changed: 0 } }) },
      'planErrors',
    ],
    ['empty totals', { plan: plan({ totals: { ...plan().totals, imported: 0, changed: 0 } }) }, 'nothing'],
    [
      'changed resource files without imported entries',
      { plan: plan({ totals: { ...plan().totals, imported: 0 } }) },
      'ready',
    ],
    ['imported entries without changed files', { plan: plan({ totals: { ...plan().totals, changed: 0 } }) }, 'ready'],
    ['ready', {}, 'ready'],
  ])('%s', (_name, overrides, state) => {
    expect(importFooter(input(overrides)).footerState).toBe(state);
  });

  it.each<[Partial<ImportFooterInput>, boolean, string, number]>([
    [{}, true, TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORTX, 18],
    [{ stale: true }, true, TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORTX, 18],
    [{ status: 'error', plan: undefined }, true, TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORTANYWAY, 0],
    [{ listingStatus: 'loading' }, false, TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORTX, 18],
    [{ uploadStatus: 'uploading' }, false, TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORTX, 18],
    [{ saving: true }, false, TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORTX, 18],
    [{ running: true }, false, TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORTX, 18],
    [{ checkedCount: 0 }, false, TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORT, 0],
    [{ plan: undefined }, true, TRACKER_TOKENS.IMPORT.DIALOG.FOOTER.IMPORT, 0],
  ])('submit and primary %j', (overrides, canSubmit, token, count) => {
    expect(importFooter(input(overrides))).toMatchObject({ canSubmit, primary: { token, count } });
  });

  it.each([undefined, plan()])('empty diagnostics and no-op transitions (%j)', (preview) => {
    const result = importPlanPresentation(preview, undefined);
    expect(result.notes).toEqual([]);
    expect(result.shownIssues).toEqual([]);
    expect(result.moreIssues).toBe(0);
    expect(result.autoFixCount).toBe(0);
    expect(result.everyFileUnreadable).toBe(false);
  });

  it.each([0, 3, 7])('caps rows and includes server-truncated diagnostics (%i)', (length) => {
    const issues: ImportPlanDto['issues'] = Array.from({ length }, (_, i) => ({
      locale: 'es',
      key: `k${i}`,
      type: 'failed',
      reason: 'bad',
    }));
    const icuAutoFixes: ImportPlanDto['icuAutoFixes'] = issues.map(({ locale, key }) => ({
      locale,
      key,
      originalValue: 'a',
      fixedValue: 'b',
      description: 'fixed',
    }));
    const result = importPlanPresentation(
      plan({ issues, icuAutoFixes, truncated: { issues: 2, icuAutoFixes: 3, warnings: 0, errors: 0 } }),
      undefined,
    );
    expect(result.shownIssues).toEqual(issues.slice(0, 5));
    expect(result.moreIssues).toBe(length + 2 - Math.min(length, 5));
    expect(result.shownAutoFixes).toEqual(icuAutoFixes.slice(0, 5));
    expect(result.autoFixCount).toBe(length + 3);
    expect(result.moreAutoFixes).toBe(length + 3 - Math.min(length, 5));
  });

  it('presents files, locales, changed statuses, failures and ordered notes', () => {
    const listing: ImportSourceListingDto = {
      collection: 'main',
      folder: 'in',
      defaultFolder: 'in',
      exists: true,
      files: [{ path: 'in/es.xliff', name: 'es.xliff', format: 'xliff', sizeBytes: 6 * 1024 * 1024, modifiedAt: '' }],
    };
    const result = importPlanPresentation(
      plan({
        errors: ['error'],
        warnings: ['warning'],
        largeFiles: ['in/es.xliff', 'gone'],
        statusTransitions: [
          { from: 'translated', to: 'translated', count: 1 },
          { to: 'new', count: 2 },
        ],
        totals: { ...plan().totals, failed: 2 },
      }),
      listing,
    );
    expect(result.notes.map((note) => note.text ?? note.params?.size)).toEqual(['error', 'warning', '6.0', '0.0']);
    expect(result.planFiles[0]).toMatchObject({ name: 'es.xliff', parts: ['es.', 'xliff'] });
    expect(result.localeCount).toBe(2);
    expect(result.statusChanges).toEqual([{ to: 'new', count: 2 }]);
    expect(result.willFail).toBe(2);
  });

  it.each([
    { files: [] },
    { files: [planFile('es.xliff', 'es', { sourceProblem: 'bad' })] },
    { files: [planFile('es.xliff', 'es', { sourceProblem: 'bad' }), planFile('fr.xliff', 'fr')] },
  ])('requires every nonempty file to be unreadable (%j)', ({ files }) => {
    expect(importPlanPresentation(plan({ files }), undefined).everyFileUnreadable).toBe(files.length === 1);
  });

  it.each(['filesRequired', 'duplicatePath', 'localeRequired', 'baseLocaleNeedsMigration'] as const)(
    'file problem mapping %s',
    (problem) => {
      const expected = {
        filesRequired: TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.FILESREQUIRED,
        duplicatePath: TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.FILESREQUIRED,
        localeRequired: TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.LOCALEREQUIRED,
        baseLocaleNeedsMigration: TRACKER_TOKENS.IMPORT.DIALOG.VALIDATION.BASELOCALENEEDSMIGRATION,
      };
      expect(importFilesError({ problem, invalid: true, touched: true, attempted: false, obsoleteLocale: false })).toBe(
        expected[problem],
      );
    },
  );

  it.each<[boolean, boolean, boolean, boolean, boolean]>([
    [true, false, false, false, false],
    [true, true, false, false, true],
    [true, false, true, false, true],
    [true, false, false, true, true],
    [false, true, true, true, false],
  ])(
    'file error reveal invalid=%s touched=%s attempted=%s obsolete=%s',
    (invalid, touched, attempted, obsoleteLocale, revealed) => {
      expect(
        importFilesError({ problem: 'localeRequired', invalid, touched, attempted, obsoleteLocale }) !== undefined,
      ).toBe(revealed);
      expect(importFilesError({ problem: undefined, invalid, touched, attempted, obsoleteLocale })).toBeUndefined();
    },
  );
});
