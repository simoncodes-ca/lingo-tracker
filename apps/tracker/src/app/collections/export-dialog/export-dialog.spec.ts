import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { createComponentFactory } from '@ngneat/spectator/vitest';
import type {
  ExportJobDto,
  ExportPlanDto,
  ExportRequestDto,
  LingoTrackerConfigDto,
} from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enResources from '../../../assets/i18n/en.json';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { toApiError } from '../../shared/api-error/api-error';
import { CollectionsStore } from '../store/collections.store';
import { ExportDialog } from './export-dialog';
import type { ExportDialogData } from './export-dialog-data';

const config: LingoTrackerConfigDto = {
  exportFolder: 'handoff',
  importFolder: 'in',
  baseLocale: 'en',
  locales: ['en', 'fr', 'ja'],
  collections: {
    main: { translationsFolder: 'main', readOnly: true },
    other: { translationsFolder: 'other', locales: ['en', 'de'] },
  },
};

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

const job: ExportJobDto = {
  jobId: 'job-1',
  status: 'pending',
  progress: { current: 0, total: 3 },
  request: { format: 'xliff' },
};

const createComponent = createComponentFactory({
  component: ExportDialog,
  imports: [getTranslocoTestingModule({ langs: { en: enResources } })],
  providers: [provideTranslocoMessageformat()],
  detectChanges: false,
});

interface Harness {
  fixture: ComponentFixture<ExportDialog>;
  component: ExportDialog;
  dialogRef: { close: ReturnType<typeof vi.fn>; disableClose: boolean | undefined };
  store: {
    config: ReturnType<typeof signal<LingoTrackerConfigDto | null>>;
    isExporting: ReturnType<typeof signal<boolean>>;
    dryRunExport: ReturnType<typeof vi.fn>;
    startExport: ReturnType<typeof vi.fn>;
  };
  root: HTMLElement;
}

interface Options {
  data?: ExportDialogData;
  plan?: ExportPlanDto;
  config?: LingoTrackerConfigDto | null;
}

function build(options: Options = {}): Harness {
  const dialogRef: Harness['dialogRef'] = { close: vi.fn(), disableClose: false };
  const store: Harness['store'] = {
    config: signal<LingoTrackerConfigDto | null>(options.config === undefined ? config : options.config),
    isExporting: signal(false),
    dryRunExport: vi.fn((_request: ExportRequestDto) => of(options.plan ?? plan())),
    startExport: vi.fn(() => of(job)),
  };
  const spectator = createComponent({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: options.data ?? {} },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: CollectionsStore, useValue: store },
    ],
  });
  spectator.detectChanges();
  const harness: Harness = {
    fixture: spectator.fixture,
    component: spectator.fixture.componentInstance,
    dialogRef,
    store,
    root: spectator.fixture.nativeElement,
  };
  return harness;
}

/** Let the 300ms preview debounce fire and render the result. */
const settle = (harness: Harness): void => {
  vi.advanceTimersByTime(300);
  harness.fixture.detectChanges();
};

const query = <T extends HTMLElement>(harness: Harness, testId: string): T | null =>
  harness.root.querySelector<T>(`[data-testid="${testId}"]`);
const text = (harness: Harness, testId: string): string =>
  query(harness, testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const click = (harness: Harness, testId: string): void => {
  query(harness, testId)?.click();
  harness.fixture.detectChanges();
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ExportDialog', () => {
  it('opens on Format by default', () => {
    const fresh = build();
    expect(query(fresh, 'rail-format')?.getAttribute('aria-current')).toBe('true');
    expect(query(fresh, 'rail-collections')?.getAttribute('aria-current')).toBeNull();
  });

  it('opens on Collections when a collection is preselected', () => {
    const preselected = build({ data: { preselectedCollection: 'main' } });
    expect(query(preselected, 'rail-collections')?.getAttribute('aria-current')).toBe('true');
    expect(query(preselected, 'collection-list')).not.toBeNull();
    expect(preselected.component.model.buildRequest().collections).toEqual(['main']);
  });

  it('shows the JSON rail item only while the format is JSON', () => {
    const harness = build();
    expect(query(harness, 'rail-json')).toBeNull();
    harness.component.model.form.controls.format.setValue('json');
    harness.fixture.detectChanges();
    expect(query(harness, 'rail-json')).not.toBeNull();
    harness.component.activate('json');
    harness.fixture.detectChanges();
    harness.component.model.form.controls.format.setValue('xliff');
    harness.fixture.detectChanges();
    expect(query(harness, 'rail-json')).toBeNull();
    expect(query(harness, 'rail-format')?.getAttribute('aria-current')).toBe('true');
  });

  it('changes the primary copy when files would be overwritten', () => {
    const harness = build();
    expect(text(harness, 'footer-meta')).toBe('Checking…');
    expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    settle(harness);
    expect(text(harness, 'submit')).toBe('Export 3 files');
    expect(text(harness, 'footer-meta')).toContain('3 files · 23 entries');
  });

  it('says Export and overwrite when a planned file already exists', () => {
    const overwriting = build({
      plan: plan({
        overwriteCount: 1,
        files: [{ locale: 'fr', path: 'handoff/fr.xliff', exists: true, entriesCount: 10 }],
      }),
    });
    settle(overwriting);
    expect(text(overwriting, 'submit')).toBe('Export and overwrite 1 file');
    expect(text(overwriting, 'footer-meta')).toContain('1 will be overwritten');
    expect(query(overwriting, 'preview-files')?.textContent).toContain('exists');
  });

  it('offers Include all statuses when nothing matches and fixes the filter', () => {
    const harness = build({ plan: plan({ files: [], entriesTotal: 0, locales: [] }) });
    settle(harness);
    expect(text(harness, 'footer-meta')).toContain('Nothing matches these filters');
    expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    click(harness, 'include-all-statuses');
    expect(harness.component.model.form.controls.statuses.value).toEqual(['new', 'stale', 'translated', 'verified']);
    expect(query(harness, 'include-all-statuses')).toBeNull();
  });

  it('stays open with the server message in the footer when the start request fails', () => {
    const harness = build();
    settle(harness);
    harness.store.startExport.mockReturnValue(
      throwError(() =>
        toApiError(new HttpErrorResponse({ status: 400, error: { statusCode: 400, message: 'Bad export request' } })),
      ),
    );
    harness.component.onSubmit();
    harness.fixture.detectChanges();
    expect(query(harness, 'submit-errors')?.textContent).toContain('Bad export request');
    expect(harness.dialogRef.close).not.toHaveBeenCalled();
    expect(harness.dialogRef.disableClose).toBe(false);
  });

  it('blocks closing while the start request is in flight and closes with the job on success', () => {
    const harness = build();
    settle(harness);
    const pending = new Subject<ExportJobDto>();
    harness.store.startExport.mockReturnValue(pending);
    harness.component.onSubmit();
    expect(harness.dialogRef.disableClose).toBe(true);
    pending.next(job);
    pending.complete();
    expect(harness.dialogRef.close).toHaveBeenCalledWith(job);
    expect(harness.dialogRef.disableClose).toBe(false);
  });

  it('disables submit while an export runs and while the preview is stale', () => {
    const harness = build();
    settle(harness);
    expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(false);
    harness.store.isExporting.set(true);
    harness.fixture.detectChanges();
    expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    harness.store.isExporting.set(false);
    harness.component.model.form.controls.filenamePattern.setValue('{locale}');
    harness.fixture.detectChanges();
    expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    expect(text(harness, 'footer-meta')).toBe('Checking…');
    harness.component.onSubmit();
    expect(harness.store.startExport).not.toHaveBeenCalled();
  });

  it('pre-fills the form from a Retry request and runs the dry run on open', () => {
    const request: ExportRequestDto = {
      format: 'json',
      collections: ['other'],
      statuses: ['verified'],
      outputDirectory: 'tmp/dump',
      json: { structure: 'flat', rich: false },
    };
    const harness = build({ data: { request } });
    settle(harness);
    const form = harness.component.model.form.getRawValue();
    expect(form.format).toBe('json');
    expect(form.allCollections).toBe(false);
    expect(form.collections).toEqual(['other']);
    expect(form.statuses).toEqual(['verified']);
    expect(form.outputDirectory).toBe('tmp/dump');
    expect(form.json.structure).toBe('flat');
    expect(harness.store.dryRunExport).toHaveBeenCalledTimes(1);
    expect(harness.store.dryRunExport.mock.calls[0]?.[0]).toMatchObject({ format: 'json', collections: ['other'] });
    expect(query(harness, 'rail-json')).not.toBeNull();
  });

  it('shows the locked base locale beside the toggleable target locales', () => {
    const harness = build();
    harness.component.model.form.controls.allLocales.setValue(false);
    harness.component.activate('locales');
    harness.fixture.detectChanges();
    expect(text(harness, 'base-locale')).toContain('en');
    const pills = Array.from(harness.root.querySelectorAll<HTMLButtonElement>('.pill--button'));
    expect(pills.map((pill) => pill.textContent?.trim())).toEqual(['fr', 'ja', 'de']);
    pills[0]?.click();
    harness.fixture.detectChanges();
    expect(harness.component.model.form.controls.locales.value).toEqual(['fr']);
    expect(harness.root.querySelector('.pill--button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('reseeds the output folder when the config loads after the dialog opened', () => {
    const harness = build({ config: null });
    expect(harness.component.model.form.controls.outputDirectory.value).toBe('dist/lingo-export');
    harness.store.config.set(config);
    harness.fixture.detectChanges();
    expect(harness.component.model.form.controls.outputDirectory.value).toBe('handoff');
    expect(harness.component.model.availableLocales()).toEqual(['fr', 'ja', 'de']);
  });

  it('keeps the live Summary the only aria-live block in the preview column', () => {
    const harness = build();
    settle(harness);
    const column = query(harness, 'preview-column');
    expect(column?.querySelectorAll('[aria-live]').length).toBe(1);
    expect(column?.querySelector('[aria-live] [data-testid="summary"]')).not.toBeNull();
  });

  it('runs a fresh dry run when the config arrives after the first debounce', () => {
    const harness = build({ config: null });
    settle(harness);
    expect(harness.store.dryRunExport).not.toHaveBeenCalled();
    harness.store.config.set({ ...config, exportFolder: '' });
    harness.fixture.detectChanges();
    settle(harness);
    expect(harness.store.dryRunExport).toHaveBeenCalledTimes(1);
    expect(text(harness, 'submit')).toBe('Export 3 files');
  });

  it('keeps Retry locales when the config loads late', () => {
    const harness = build({ config: null, data: { request: { format: 'xliff', locales: ['fr', 'de'] } } });
    harness.store.config.set(config);
    harness.fixture.detectChanges();
    expect(harness.component.model.form.controls.locales.value).toEqual(['fr', 'de']);
  });

  it('marks the invalid sections from the footer link and jumps to the first one', () => {
    const harness = build();
    harness.component.model.form.controls.allCollections.setValue(false);
    harness.fixture.detectChanges();
    expect(query(harness, 'rail-collections')?.querySelector('.rail-dot')).toBeNull();
    expect(text(harness, 'footer-meta')).toContain('Fix the marked sections');
    click(harness, 'fix-sections');
    expect(query(harness, 'rail-collections')?.querySelector('.rail-dot')).not.toBeNull();
    expect(query(harness, 'rail-collections')?.getAttribute('aria-current')).toBe('true');
    expect(harness.root.textContent).toContain('Choose at least one collection.');
  });

  it('starts only one export when submit is triggered twice', () => {
    const harness = build();
    settle(harness);
    harness.store.startExport.mockReturnValue(new Subject<ExportJobDto>());
    harness.component.onSubmit();
    harness.component.onSubmit();
    expect(harness.store.startExport).toHaveBeenCalledTimes(1);
  });

  it('links the file name pattern error and hint to the input and flags it invalid', () => {
    const harness = build();
    harness.component.activate('output');
    harness.fixture.detectChanges();
    const input = harness.root.querySelector<HTMLInputElement>('#export-pattern');
    expect(input?.getAttribute('aria-invalid')).toBe('false');
    expect(input?.getAttribute('aria-describedby')).toBe('export-pattern-hint');
    harness.component.model.form.controls.filenamePattern.setValue('handoff');
    harness.component.model.revealErrors();
    harness.fixture.detectChanges();
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-describedby')).toBe('export-pattern-error export-pattern-hint');
    expect(harness.root.querySelector('#export-pattern-error')).not.toBeNull();
    expect(harness.root.querySelector('#export-pattern-hint')).not.toBeNull();
  });

  it('links the reserved base property error to its input and keeps it out of Output', () => {
    const harness = build();
    const json = harness.component.model.form.controls.json.controls;
    harness.component.model.form.controls.format.setValue('json');
    json.rich.setValue(true);
    json.includeBase.setValue(true);
    json.basePropertyName.setValue('status');
    harness.component.model.revealErrors();
    harness.fixture.detectChanges();
    expect(harness.component.model.sectionErrors().has('output')).toBe(false);
    expect(harness.component.model.activeSection()).toBe('json');
    const input = harness.root.querySelector<HTMLInputElement>('#export-base-property');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-describedby')).toBe('export-base-property-error');
    expect(harness.root.querySelector('#export-base-property-error')?.textContent).toContain('Reserved');
    json.basePropertyName.setValue('baseValue');
    harness.fixture.detectChanges();
    expect(input?.getAttribute('aria-invalid')).toBe('false');
    expect(input?.getAttribute('aria-describedby')).toBeNull();
  });

  it('shows the preview failure with a retry that re-runs the dry run, not the fix-sections link', () => {
    const harness = build();
    harness.store.dryRunExport.mockReturnValue(throwError(() => new Error('down')));
    settle(harness);
    expect(text(harness, 'footer-meta')).toContain('The preview could not be loaded.');
    expect(query(harness, 'fix-sections')).toBeNull();
    expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    harness.store.dryRunExport.mockReturnValue(of(plan()));
    const calls = harness.store.dryRunExport.mock.calls.length;
    click(harness, 'retry-preview');
    settle(harness);
    expect(harness.store.dryRunExport.mock.calls.length).toBe(calls + 1);
    expect(text(harness, 'submit')).toBe('Export 3 files');
    expect(query(harness, 'retry-preview')).toBeNull();
  });

  it('explains plan errors in the footer, lists them in Notes and keeps submit disabled', () => {
    const harness = build({ plan: plan({ errors: ['Collection x is unreadable'] }) });
    settle(harness);
    expect(text(harness, 'plan-errors')).toBe('Collection x is unreadable');
    expect(query(harness, 'fix-sections')).toBeNull();
    expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    expect(text(harness, 'preview-notes')).toContain('Collection x is unreadable');
  });

  it('lists collections in page order with their folder and a lock for read-only ones', () => {
    const harness = build({
      config: {
        ...config,
        collections: {
          zeta: { translationsFolder: 'libs/zeta' },
          Alpha: { translationsFolder: 'apps/alpha/i18n', readOnly: true },
          beta: { translationsFolder: 'beta' },
        },
      },
    });
    harness.component.model.form.controls.allCollections.setValue(false);
    harness.component.activate('collections');
    harness.fixture.detectChanges();
    const rows = Array.from(harness.root.querySelectorAll('.check-row'));
    expect(rows.map((row) => row.querySelector('mat-checkbox')?.textContent?.trim())).toEqual([
      'Alpha',
      'beta',
      'zeta',
    ]);
    expect(rows[0]?.querySelector('.check-row-path')?.textContent?.replace(/\s+/g, '')).toBe('apps/alpha/i18n');
    expect(rows[0]?.querySelector('.check-row-lock')).not.toBeNull();
    expect(rows[1]?.querySelector('.check-row-lock')).toBeNull();
  });

  it('collapses skipped locales into one placeholder line with the codes in the title', () => {
    const harness = build({
      plan: plan({
        skippedLocales: [
          { locale: 'ar', reason: 'no-matching-entries' },
          { locale: 'is', reason: 'no-matching-entries' },
        ],
      }),
    });
    settle(harness);
    expect(text(harness, 'skipped')).toContain('2 locales skipped · no matching entries');
    expect(query(harness, 'skipped')?.getAttribute('title')).toBe('ar, is');
    expect(harness.root.querySelectorAll('[data-testid="preview-files"] .tree-file--skipped').length).toBe(1);
  });

  it('keeps the Filters sub-line with an empty-style placeholder when no status is selected', () => {
    const harness = build();
    harness.component.model.form.controls.statuses.setValue([]);
    harness.fixture.detectChanges();
    const sub = query(harness, 'rail-filters')?.querySelector('.rail-sub');
    expect(sub?.textContent?.trim()).toBe('No statuses');
    expect(sub?.classList.contains('rail-sub--empty')).toBe(true);
  });

  it('writes status sub-lines in lowercase and marks the active rail item for initial focus', () => {
    const harness = build();
    expect(query(harness, 'rail-filters')?.querySelector('.rail-sub')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'new, stale',
    );
    expect(query(harness, 'rail-format')?.hasAttribute('cdkFocusInitial')).toBe(true);
    expect(query(harness, 'rail-filters')?.hasAttribute('cdkFocusInitial')).toBe(false);
  });

  it('titles the narrow-width disclosure Preview and keeps every block reachable inside it', () => {
    const harness = build();
    settle(harness);
    expect(text(harness, 'preview-toggle')).toContain('Preview');
    click(harness, 'preview-toggle');
    const panel = harness.root.querySelector('#export-preview-panel');
    expect(panel?.querySelector('[data-testid="summary"]')).not.toBeNull();
    expect(panel?.querySelector('[data-testid="entry-shape"]')).not.toBeNull();
  });
});
