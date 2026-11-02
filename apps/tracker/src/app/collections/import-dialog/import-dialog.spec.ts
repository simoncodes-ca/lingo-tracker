import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { createComponentFactory } from '@ngneat/spectator/vitest';
import type {
  ImportJobDto,
  ImportPlanDto,
  ImportPlanFileDto,
  ImportRequestDto,
  ImportSourceFileDto,
  ImportSourceListingDto,
  LingoTrackerConfigDto,
} from '@simoncodes-ca/data-transfer';
import { NEVER, type Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enResources from '../../../assets/i18n/en.json';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { toApiError } from '../../shared/api-error/api-error';
import { CollectionsStore } from '../store/collections.store';
import { ImportDialog } from './import-dialog';
import type { ImportDialogData } from './import-dialog-data';

const config: LingoTrackerConfigDto = {
  exportFolder: 'out',
  importFolder: 'in',
  baseLocale: 'en',
  locales: ['en', 'es', 'fr'],
  collections: {
    main: { translationsFolder: 'main' },
    locked: { translationsFolder: 'locked', readOnly: true },
  },
};

const file = (name: string, overrides: Partial<ImportSourceFileDto> = {}): ImportSourceFileDto => ({
  path: `in/${name}`,
  name,
  format: name.endsWith('.json') ? 'json' : 'xliff',
  sizeBytes: 67 * 1024,
  modifiedAt: '2026-10-19T16:45:00.000Z',
  ...overrides,
});

const ES = file('es.xliff', { locale: 'es', localeSource: 'xliff-target-language' });
const FR = file('fr.xliff', { locale: 'fr', localeSource: 'file-name' });
const FILES: readonly ImportSourceFileDto[] = [
  ES,
  FR,
  file('en.json', { locale: 'en', localeSource: 'file-name', localeProblem: 'base-locale' }),
  file('notes.json'),
];

const listing = (
  files: readonly ImportSourceFileDto[] = FILES,
  overrides: Partial<ImportSourceListingDto> = {},
): ImportSourceListingDto => ({
  collection: 'main',
  folder: 'in',
  defaultFolder: 'in',
  exists: true,
  files,
  ...overrides,
});

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

const job: ImportJobDto = {
  jobId: 'job-1',
  status: 'pending',
  progress: { current: 0, total: 2 },
  request: { collection: 'main', files: [] },
};

const createComponent = createComponentFactory({
  component: ImportDialog,
  imports: [getTranslocoTestingModule({ langs: { en: enResources } })],
  providers: [provideTranslocoMessageformat()],
  detectChanges: false,
});

interface Harness {
  fixture: ComponentFixture<ImportDialog>;
  component: ImportDialog;
  dialogRef: { close: ReturnType<typeof vi.fn>; disableClose: boolean | undefined };
  store: {
    config: ReturnType<typeof signal<LingoTrackerConfigDto | null>>;
    isImporting: ReturnType<typeof signal<boolean>>;
    listImportSources: ReturnType<typeof vi.fn>;
    dryRunImport: ReturnType<typeof vi.fn>;
    startImport: ReturnType<typeof vi.fn>;
    uploadImportSources: ReturnType<typeof vi.fn>;
  };
  root: HTMLElement;
}

interface Options {
  data?: ImportDialogData;
  plan?: ImportPlanDto;
  listing?: ImportSourceListingDto;
  uploaded?: ImportSourceListingDto;
  listSources?: (collection: string, folder?: string) => Observable<ImportSourceListingDto>;
}

function build(options: Options = {}): Harness {
  const dialogRef: Harness['dialogRef'] = { close: vi.fn(), disableClose: false };
  const store: Harness['store'] = {
    config: signal<LingoTrackerConfigDto | null>(config),
    isImporting: signal(false),
    listImportSources: vi.fn(options.listSources ?? (() => of(options.listing ?? listing()))),
    dryRunImport: vi.fn((_request: ImportRequestDto) => of(options.plan ?? plan())),
    startImport: vi.fn(() => of(job)),
    uploadImportSources: vi.fn(() => of(options.uploaded ?? listing())),
  };
  const spectator = createComponent({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: options.data ?? {} },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: CollectionsStore, useValue: store },
    ],
  });
  spectator.detectChanges();
  return {
    fixture: spectator.fixture,
    component: spectator.fixture.componentInstance,
    dialogRef,
    store,
    root: spectator.fixture.nativeElement,
  };
}

/** Let the listing resolve and the 300ms preview debounce fire, then render. */
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
const check = (harness: Harness, name: string): void => {
  harness.component.toggleFile(`in/${name}`, true);
  harness.fixture.detectChanges();
};
const checkboxOf = (harness: Harness, name: string): HTMLInputElement | null | undefined =>
  query(harness, `file-check-${name}`)?.querySelector('input');

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ImportDialog', () => {
  describe('rail', () => {
    it('opens on Source with the collection and the checked file count', () => {
      const harness = build();
      settle(harness);
      expect(query(harness, 'rail-source')?.getAttribute('aria-current')).toBe('true');
      expect(text(harness, 'rail-source')).toContain('main');
      expect(text(harness, 'rail-source')).toContain('No files');
      check(harness, 'es.xliff');
      expect(text(harness, 'rail-source')).toContain('1 file');
    });

    it('navigates between Source, Strategy and Options', () => {
      const harness = build();
      settle(harness);
      click(harness, 'rail-strategy');
      expect(query(harness, 'rail-strategy')?.getAttribute('aria-current')).toBe('true');
      expect(query(harness, 'rail-source')?.getAttribute('aria-current')).toBeNull();
      expect(query(harness, 'strategy-update')).not.toBeNull();
      click(harness, 'rail-options');
      expect(query(harness, 'rail-options')?.getAttribute('aria-current')).toBe('true');
      expect(query(harness, 'create-missing-off')).not.toBeNull();
    });

    it('shows Defaults on Options until something changes, then the changed count', () => {
      const harness = build();
      settle(harness);
      expect(text(harness, 'rail-options')).toContain('Defaults');
      harness.component.setOption('preserveStatus', true);
      harness.fixture.detectChanges();
      expect(text(harness, 'rail-options')).toContain('1 changed');
    });

    it('moves focus to the clicked rail item, so only one item looks selected', () => {
      const harness = build();
      settle(harness);
      document.body.appendChild(harness.root);
      query<HTMLButtonElement>(harness, 'rail-source')?.focus();
      // A click that the browser did not turn into focus (Safari) still leaves focus on the item.
      query<HTMLButtonElement>(harness, 'rail-strategy')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(document.activeElement).toBe(query(harness, 'rail-strategy'));
      harness.root.remove();
    });

    it('marks Source with an error dot after a failed attempt to continue', () => {
      const harness = build();
      settle(harness);
      check(harness, 'notes.json');
      click(harness, 'rail-options');
      click(harness, 'fix-sections');
      expect(query(harness, 'rail-source')?.querySelector('.rail-dot')).not.toBeNull();
      expect(query(harness, 'rail-source')?.getAttribute('aria-current')).toBe('true');
    });
  });

  describe('collection and folder', () => {
    it('lists collections as radios and locks read-only ones', () => {
      const harness = build();
      settle(harness);
      expect(query<HTMLInputElement>(harness, 'collection-main')?.checked).toBe(true);
      expect(query<HTMLInputElement>(harness, 'collection-locked')?.disabled).toBe(true);
      expect(harness.root.querySelector('.check-row-lock')).not.toBeNull();
    });

    it('offers Reset to default only for a custom folder and resolves the shown path', () => {
      const harness = build();
      settle(harness);
      expect(query(harness, 'reset-folder')).toBeNull();
      expect(text(harness, 'folder-resolved')).toBe('Showing in');
      harness.component.model.form.controls.folder.setValue('elsewhere');
      harness.fixture.detectChanges();
      click(harness, 'reset-folder');
      expect(harness.component.model.draft().folder).toBe('in');
      expect(query(harness, 'reset-folder')).toBeNull();
    });

    it('dims and locks the folder and files for a read-only collection', () => {
      const harness = build({ data: { preselectedCollection: 'locked' } });
      settle(harness);
      expect(text(harness, 'read-only-hint')).toContain(
        'This collection is read-only. Choose another collection to import.',
      );
      const group = query(harness, 'source-group');
      expect(group?.classList.contains('locked-group--on')).toBe(true);
      expect(group?.hasAttribute('inert')).toBe(true);
    });
  });

  describe('file listing states', () => {
    it('shows a skeleton while looking', () => {
      const harness = build({ listSources: () => NEVER });
      settle(harness);
      expect(text(harness, 'listing-loading')).toContain('Looking in in…');
      expect(query(harness, 'file-list')).toBeNull();
    });

    it('explains a missing folder', () => {
      const harness = build({ listing: listing([], { exists: false }) });
      settle(harness);
      expect(text(harness, 'folder-missing')).toContain('No folder at in.');
      expect(text(harness, 'folder-missing')).toContain('Export to it first');
    });

    it('explains an empty folder', () => {
      const harness = build({ listing: listing([]) });
      settle(harness);
      expect(text(harness, 'folder-empty')).toContain('No XLIFF or JSON files in in.');
    });

    it('reports a failed listing and tries again', () => {
      const listSources = vi
        .fn()
        .mockReturnValueOnce(throwError(() => new Error('down')))
        .mockReturnValue(of(listing()));
      const harness = build({ listSources });
      settle(harness);
      expect(query(harness, 'listing-error')?.getAttribute('role')).toBe('alert');
      expect(text(harness, 'listing-error')).toContain('The folder could not be read.');
      expect(text(harness, 'footer-meta')).toContain('Fix the marked sections');
      click(harness, 'retry-listing');
      settle(harness);
      expect(query(harness, 'file-list')).not.toBeNull();
    });

    it('renders a row per file with format, size and an inferred locale', () => {
      const harness = build();
      settle(harness);
      expect(text(harness, 'file-row-es.xliff')).toContain('XLIFF');
      expect(text(harness, 'file-row-es.xliff')).toContain('67 KB');
      expect(query<HTMLSelectElement>(harness, 'locale-es.xliff')?.value).toBe('es');
      expect(query<HTMLSelectElement>(harness, 'locale-notes.json')?.value).toBe('');
      expect(query(harness, 'locale-notes.json')?.classList.contains('loc--empty')).toBe(true);
      expect(query(harness, 'locale-es.xliff')?.getAttribute('aria-label')).toBe('Locale for es.xliff');
    });

    it('shows provenance only for a locale taken from the target-language', () => {
      const harness = build({
        listing: listing([file('batch.xliff', { locale: 'es', localeSource: 'xliff-target-language' }), ES, FR]),
      });
      settle(harness);
      expect(text(harness, 'file-row-batch.xliff')).toContain("From the file's target-language");
      expect(text(harness, 'file-row-es.xliff')).not.toContain('target-language');
      expect(text(harness, 'file-row-fr.xliff')).not.toContain('target-language');
    });

    it('blocks the base-locale row with its hint until the strategy is migration', () => {
      const harness = build();
      settle(harness);
      expect(text(harness, 'file-row-en.json')).toContain('Base locale. Only the migration strategy can write it.');
      expect(checkboxOf(harness, 'en.json')?.disabled).toBe(true);
      click(harness, 'rail-strategy');
      click(harness, 'strategy-migration');
      click(harness, 'rail-source');
      expect(query(harness, 'base-locale-hint')).toBeNull();
      expect(checkboxOf(harness, 'en.json')?.disabled).toBe(false);
    });

    it('hints when two checked files write the same locale', () => {
      const harness = build();
      settle(harness);
      check(harness, 'es.xliff');
      check(harness, 'notes.json');
      harness.component.model.setLocale('in/notes.json', 'es');
      harness.fixture.detectChanges();
      expect(text(harness, 'file-row-notes.json')).toContain('Two files write es; they are applied in this order.');
    });

    it('selects all and clears', () => {
      const harness = build();
      settle(harness);
      click(harness, 'toggle-all-files');
      expect(harness.component.model.checkedCount()).toBe(3);
      expect(text(harness, 'toggle-all-files')).toBe('Clear');
      click(harness, 'toggle-all-files');
      expect(harness.component.model.checkedCount()).toBe(0);
      expect(text(harness, 'toggle-all-files')).toBe('Select all');
    });

    it('marks a checked file without a locale once errors are revealed', () => {
      const harness = build();
      settle(harness);
      check(harness, 'notes.json');
      expect(text(harness, 'files-error')).toBe('Choose a locale for every checked file.');
      expect(query(harness, 'locale-notes.json')?.getAttribute('aria-invalid')).toBe('true');
    });

    it('says when checked files vanished after a relist', () => {
      const listSources = vi
        .fn()
        .mockReturnValueOnce(of(listing()))
        .mockReturnValue(of(listing([FR])));
      const harness = build({ listSources });
      settle(harness);
      check(harness, 'es.xliff');
      harness.component.retryListing();
      settle(harness);
      expect(text(harness, 'dropped-hint')).toBe('1 selected file is no longer in this folder and was unchecked.');
    });
  });

  describe('strategy and options', () => {
    it('picks a strategy with radio cards and changes the note', () => {
      const harness = build();
      settle(harness);
      click(harness, 'rail-strategy');
      expect(query<HTMLInputElement>(harness, 'strategy-translation-service')?.checked).toBe(true);
      expect(text(harness, 'strategy-note')).toContain('Protected terms are checked');
      click(harness, 'strategy-migration');
      expect(harness.component.model.draft().strategy).toBe('migration');
      expect(text(harness, 'strategy-note')).toContain('Writes the base locale');
      expect(text(harness, 'rail-strategy')).toContain('Migration');
    });

    it('shows the migration switches only under migration, defaulting on', () => {
      const harness = build();
      settle(harness);
      click(harness, 'rail-options');
      expect(text(harness, 'create-missing-off')).toContain(
        'Unknown keys are skipped with the Translation service strategy.',
      );
      expect(query(harness, 'option-createMissing')).toBeNull();
      harness.component.model.setStrategy('migration');
      harness.fixture.detectChanges();
      expect(query(harness, 'option-createMissing')).not.toBeNull();
      expect(query(harness, 'option-updateTags')?.classList.contains('mat-mdc-slide-toggle-checked')).toBe(true);
    });

    it('opens Advanced by default when no primary option rows are shown, and shows a changed summary', () => {
      const harness = build();
      settle(harness);
      click(harness, 'rail-options');
      expect(query(harness, 'advanced-toggle')?.getAttribute('aria-expanded')).toBe('true');
      expect(query(harness, 'option-validateBase')).not.toBeNull();
      expect(text(harness, 'advanced-toggle')).toContain('Defaults');
      harness.component.setOption('validateBase', false);
      harness.fixture.detectChanges();
      expect(text(harness, 'advanced-toggle')).toContain('1 changed');
    });

    it('keeps Advanced closed under migration, follows a manual toggle, and does not persist the state', () => {
      const harness = build();
      settle(harness);
      harness.component.model.setStrategy('migration');
      click(harness, 'rail-options');
      expect(query(harness, 'advanced-toggle')?.getAttribute('aria-expanded')).toBe('false');
      expect(query(harness, 'option-validateBase')).toBeNull();
      click(harness, 'advanced-toggle');
      expect(query(harness, 'option-validateBase')).not.toBeNull();
      click(harness, 'advanced-toggle');
      expect(query(harness, 'option-validateBase')).toBeNull();
      expect(localStorage.getItem('lingo-tracker.importDraft') ?? '').not.toContain('advanced');
    });
  });

  describe('preview and footer', () => {
    const ready = (overrides: Options = {}): Harness => {
      const harness = build(overrides);
      settle(harness);
      check(harness, 'es.xliff');
      check(harness, 'fr.xliff');
      settle(harness);
      return harness;
    };

    it('asks for a file first', () => {
      const harness = build();
      settle(harness);
      expect(text(harness, 'footer-meta')).toContain('Check at least one file');
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
      expect(text(harness, 'preview-empty')).toBe('Check at least one file to see what would change.');
    });

    it('is ready with the file and entry counts, and a primary that names them', () => {
      const harness = ready();
      expect(text(harness, 'footer-meta')).toContain('2 files · 18 entries');
      expect(text(harness, 'submit')).toBe('Import 18 entries');
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(false);
      expect(query(harness, 'footer-meta')?.querySelector('mat-icon')?.textContent).toBe('check_circle');
    });

    it('adds how many will fail in the warning tint', () => {
      const harness = ready({ plan: plan({ totals: { ...plan().totals, failed: 2 } }) });
      expect(text(harness, 'footer-meta')).toContain('2 files · 18 entries · 2 will fail');
      expect(query(harness, 'footer-meta')?.querySelector('.warn')).not.toBeNull();
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(false);
      expect(text(harness, 'will-fail-live')).toBe('2 will fail');
    });

    it('is checking while a new preview loads, keeping the previous count on the button', () => {
      const harness = ready();
      harness.component.model.setStrategy('verification');
      harness.fixture.detectChanges();
      expect(text(harness, 'footer-meta')).toContain('Checking…');
      expect(text(harness, 'submit')).toBe('Import 18 entries');
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(false);
      expect(query(harness, 'preview-column')?.classList.contains('preview--stale')).toBe(true);
    });

    it('says nothing to import when no file would be written', () => {
      const harness = ready({
        plan: plan({
          totals: { entries: 20, imported: 0, created: 0, updated: 0, skipped: 20, failed: 0, changed: 0 },
        }),
      });
      expect(text(harness, 'footer-meta')).toContain('Nothing to import in these files');
      expect(text(harness, 'submit')).toBe('Import');
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    });

    it('stays ready when entries are unchanged in value but resource files would be written', () => {
      const harness = ready({
        plan: plan({ totals: { entries: 20, imported: 0, created: 0, updated: 0, skipped: 0, failed: 0, changed: 2 } }),
      });
      expect(text(harness, 'footer-meta')).not.toContain('Nothing to import');
    });

    it('says no file could be read when every file has a source problem', () => {
      const harness = ready({
        plan: plan({
          files: [
            planFile('es.xliff', 'es', { sourceProblem: 'Not well-formed XML' }),
            planFile('fr.xliff', 'fr', { sourceProblem: 'Empty file' }),
          ],
          totals: { entries: 0, imported: 0, created: 0, updated: 0, skipped: 0, failed: 0, changed: 0 },
        }),
      });
      expect(text(harness, 'footer-meta')).toContain('No file could be read');
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
      expect(text(harness, 'plan-file-es.xliff')).toContain('Not well-formed XML');
    });

    it('lists the file that cannot be read but stays ready while another is sound', () => {
      const harness = ready({
        plan: plan({
          files: [planFile('es.xliff', 'es', { sourceProblem: 'Not well-formed XML' }), planFile('fr.xliff', 'fr')],
        }),
      });
      expect(text(harness, 'footer-meta')).toContain('2 files');
      expect(query(harness, 'source-problem')?.textContent).toContain('Not well-formed XML');
    });

    it('says the collection is read-only', () => {
      const harness = build({ data: { preselectedCollection: 'locked' } });
      settle(harness);
      expect(text(harness, 'footer-meta')).toContain('This collection is read-only');
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    });

    it('asks to fix the marked sections when a checked file has no locale', () => {
      const harness = build();
      settle(harness);
      check(harness, 'notes.json');
      expect(text(harness, 'footer-meta')).toContain('Fix the marked sections');
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    });

    it('offers Import anyway when the preview fails, and hides the previous plan', () => {
      const harness = ready();
      harness.store.dryRunImport.mockReturnValue(
        throwError(() =>
          toApiError(new HttpErrorResponse({ status: 500, error: { statusCode: 500, message: 'boom' } })),
        ),
      );
      harness.component.model.setStrategy('update');
      settle(harness);
      expect(text(harness, 'footer-meta')).toContain('The preview could not be loaded');
      expect(text(harness, 'submit')).toBe('Import anyway');
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(false);
      expect(query(harness, 'preview-error')).not.toBeNull();
      expect(query(harness, 'summary')).toBeNull();
      expect(query(harness, 'preview-files')).toBeNull();
      harness.store.dryRunImport.mockReturnValue(of(plan()));
      click(harness, 'retry-preview');
      settle(harness);
      expect(text(harness, 'footer-meta')).toContain('2 files');
    });

    it('drops no-op status changes and keeps rows without a source status', () => {
      const harness = ready({
        plan: plan({
          statusTransitions: [
            { from: 'translated', to: 'translated', count: 2196 },
            { from: 'new', to: 'new', count: 856 },
            { from: 'new', to: 'translated', count: 12 },
            { to: 'translated', count: 3 },
          ],
        }),
      });
      const rows = Array.from(harness.root.querySelectorAll('[data-testid="status-changes"] li')).map((row) =>
        row.textContent?.replace(/\s+/g, ''),
      );
      expect(rows).toEqual(['new→translated12', '—→translated3']);
    });

    it('says None when every status change is a no-op', () => {
      const harness = ready({
        plan: plan({ statusTransitions: [{ from: 'translated', to: 'translated', count: 5 }] }),
      });
      expect(query(harness, 'status-changes')).toBeNull();
      expect(harness.root.textContent).toContain('None');
    });

    it('renders files, summary, status changes, auto-fixes, issues and notes', () => {
      const issues = Array.from({ length: 7 }, (_, index) => ({
        locale: 'es',
        key: `k.${index}`,
        type: 'failed' as const,
        reason: `reason ${index}`,
      }));
      const harness = ready({
        plan: plan({
          issues,
          totals: { ...plan().totals, failed: 7 },
          icuAutoFixes: [
            { locale: 'es', key: 'a.b', originalValue: '{nombre}', fixedValue: '{name}', description: 'x' },
          ],
          warnings: ['Duplicate key a'],
          largeFiles: ['in/es.xliff'],
        }),
      });
      expect(text(harness, 'plan-file-es.xliff')).toContain('10 entries');
      expect(text(harness, 'summary')).toContain('Will import18');
      expect(text(harness, 'summary')).toContain('Will fail7');
      expect(text(harness, 'status-changes')).toContain('new→translated12');
      expect(text(harness, 'auto-fixes')).toContain('{nombre} → {name}');
      expect(harness.root.querySelectorAll('[data-testid="issues"] li')).toHaveLength(5);
      expect(harness.root.textContent).toContain('and 2 more');
      expect(text(harness, 'preview-notes')).toContain('Duplicate key a');
      expect(text(harness, 'preview-notes')).toContain('Large import file: 0.1 MB.');
    });

    it('sizes the large-file note from the listing', () => {
      const harness = ready({
        listing: listing([file('es.xliff', { locale: 'es', sizeBytes: 6.1 * 1024 * 1024 }), FR]),
        plan: plan({ largeFiles: ['in/es.xliff'] }),
      });
      expect(text(harness, 'preview-notes')).toContain('Large import file: 6.1 MB.');
    });

    it('reveals the same blocks in the narrow disclosure', () => {
      const harness = ready();
      click(harness, 'preview-toggle');
      expect(query(harness, 'preview-toggle')?.getAttribute('aria-expanded')).toBe('true');
      expect(harness.root.querySelectorAll('[data-testid="summary"]')).toHaveLength(2);
    });
  });

  describe('submit', () => {
    const ready = (): Harness => {
      const harness = build();
      settle(harness);
      check(harness, 'es.xliff');
      settle(harness);
      return harness;
    };

    it('starts the request and closes with the job', () => {
      const harness = ready();
      click(harness, 'submit');
      expect(harness.store.startImport).toHaveBeenCalledWith({
        collection: 'main',
        files: [{ path: 'in/es.xliff', locale: 'es' }],
        strategy: 'translation-service',
      });
      expect(harness.dialogRef.close).toHaveBeenCalledWith(job);
    });

    it('stays open with the server message above the footer when the start fails', () => {
      const harness = ready();
      harness.store.startImport.mockReturnValue(
        throwError(() =>
          toApiError(new HttpErrorResponse({ status: 400, error: { statusCode: 400, message: 'Bad import request' } })),
        ),
      );
      click(harness, 'submit');
      expect(harness.dialogRef.close).not.toHaveBeenCalled();
      expect(query(harness, 'submit-errors')?.getAttribute('role')).toBe('alert');
      expect(text(harness, 'submit-errors')).toBe('Bad import request');
      expect(harness.dialogRef.disableClose).toBe(false);
    });

    it('blocks Esc and backdrop close while the start request is in flight', () => {
      const harness = ready();
      harness.store.startImport.mockReturnValue(NEVER);
      click(harness, 'submit');
      expect(harness.dialogRef.disableClose).toBe(true);
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    });

    it('does not start while another import is running', () => {
      const harness = ready();
      harness.store.isImporting.set(true);
      harness.fixture.detectChanges();
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    });
  });

  describe('accessibility wiring', () => {
    it('names each file checkbox by its file name through the native input', () => {
      const harness = build();
      settle(harness);
      const input = checkboxOf(harness, 'es.xliff');
      const labelId = input?.getAttribute('aria-labelledby') ?? '';
      expect(labelId).not.toBe('');
      expect(harness.root.querySelector(`#${labelId}`)?.textContent?.trim()).toBe('es.xliff');
    });
  });

  describe('Retry edge cases', () => {
    it('keeps retry files from a custom folder checked through the first listing', () => {
      const drop = [
        file('a.xliff', { path: 'drop/a.xliff', locale: 'es' }),
        file('b.xliff', { path: 'drop/b.xliff', locale: 'fr' }),
      ];
      const harness = build({
        data: {
          request: {
            collection: 'main',
            files: [
              { path: 'drop/a.xliff', locale: 'fr' },
              { path: 'drop/b.xliff', locale: 'es' },
            ],
          },
        },
        listSources: (_collection, folder) => of(folder === 'drop' ? listing(drop, { folder: 'drop' }) : listing()),
      });
      settle(harness);
      expect(harness.store.listImportSources).toHaveBeenLastCalledWith('main', 'drop');
      expect(checkboxOf(harness, 'a.xliff')?.checked).toBe(true);
      expect(query<HTMLSelectElement>(harness, 'locale-a.xliff')?.value).toBe('fr');
      expect(query<HTMLSelectElement>(harness, 'locale-b.xliff')?.value).toBe('es');
    });

    it('asks for a new locale when the retried one is no longer configured', () => {
      const harness = build({
        data: { request: { collection: 'main', files: [{ path: 'in/fr.xliff', locale: 'de' }] } },
      });
      settle(harness);
      expect(query<HTMLSelectElement>(harness, 'locale-fr.xliff')?.value).toBe('');
      expect(query(harness, 'locale-fr.xliff')?.classList.contains('loc--empty')).toBe(true);
      expect(query(harness, 'locale-fr.xliff')?.getAttribute('aria-invalid')).toBe('true');
      expect(query(harness, 'rail-source')?.querySelector('.rail-dot')).not.toBeNull();
      expect(text(harness, 'files-error')).toBe('Choose a locale for every checked file.');
      expect(text(harness, 'footer-meta')).toContain('Fix the marked sections');
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
    });
  });

  describe('Retry prefill', () => {
    it('opens with the failed request: collection, folder, strategy, options and checked files', () => {
      const request: ImportRequestDto = {
        collection: 'main',
        files: [
          { path: 'in/fr.xliff', locale: 'es' },
          { path: 'in/notes.json', locale: 'fr' },
        ],
        strategy: 'migration',
        updateTags: false,
      };
      const harness = build({ data: { request } });
      settle(harness);
      expect(harness.component.model.draft()).toMatchObject({
        collection: 'main',
        folder: 'in',
        strategy: 'migration',
      });
      expect(checkboxOf(harness, 'fr.xliff')?.checked).toBe(true);
      expect(query<HTMLSelectElement>(harness, 'locale-fr.xliff')?.value).toBe('es');
      expect(checkboxOf(harness, 'es.xliff')?.checked).toBe(false);
      settle(harness);
      expect(harness.store.dryRunImport).toHaveBeenCalledWith(request);
      expect(text(harness, 'rail-source')).toContain('2 files');
    });
  });
  describe('upload', () => {
    const vendor = file('vendor.xliff', { locale: 'es', localeSource: 'xliff-target-language' });
    const withVendor = listing([...FILES, vendor]);
    const pick = (harness: Harness, files: File[]): void => {
      const input = query<HTMLInputElement>(harness, 'upload-input');
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      input?.dispatchEvent(new Event('change'));
      harness.fixture.detectChanges();
    };
    const dropEvent = (type: string, files: File[] = []): DragEvent => {
      const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
      Object.defineProperty(event, 'dataTransfer', { value: { files, types: ['Files'] } });
      return event;
    };

    it('opens the hidden file input from a real button', () => {
      const harness = build();
      settle(harness);
      const input = query<HTMLInputElement>(harness, 'upload-input');
      const click = vi.spyOn(input as HTMLInputElement, 'click');
      expect(input?.getAttribute('accept')).toBe('.xliff,.xlf,.json');
      expect(input?.multiple).toBe(true);
      expect(query(harness, 'upload-files')?.tagName).toBe('BUTTON');
      query(harness, 'upload-files')?.click();
      expect(click).toHaveBeenCalled();
    });

    it('uploads picked files, checks them and says so in the notice and live region', () => {
      const harness = build({ uploaded: withVendor });
      settle(harness);
      pick(harness, [new File(['{}'], 'vendor.xliff')]);
      expect(harness.store.uploadImportSources).toHaveBeenCalledWith('main', [expect.any(File)], {
        folder: 'in',
        overwrite: false,
      });
      expect(checkboxOf(harness, 'vendor.xliff')?.checked).toBe(true);
      expect(text(harness, 'upload-notice')).toBe('1 file uploaded and checked.');
      expect(text(harness, 'upload-live')).toBe('1 file uploaded and checked.');
    });

    it('says how many uploaded files appear when some do not', () => {
      const harness = build({ uploaded: withVendor });
      settle(harness);
      pick(harness, [new File(['{}'], 'vendor.xliff'), new File(['{}'], 'ghost.json')]);
      expect(text(harness, 'upload-notice')).toBe('1 of 2 uploaded files appear in the list.');
    });

    it('shows an uploading status line while the request runs', () => {
      const harness = build();
      harness.store.uploadImportSources.mockReturnValue(NEVER);
      settle(harness);
      pick(harness, [new File(['{}'], 'a.json'), new File(['{}'], 'b.json')]);
      // One announcement only: the sr-only live region. The visible line is plain text.
      expect(query(harness, 'upload-status')?.hasAttribute('role')).toBe(false);
      expect(query(harness, 'upload-status')?.closest('[aria-live]')).toBeNull();
      expect(text(harness, 'upload-status')).toContain('Uploading 2 files…');
      expect(text(harness, 'upload-live')).toBe('Uploading 2 files…');
      expect(query<HTMLButtonElement>(harness, 'upload-files')?.disabled).toBe(true);
    });

    it('keeps Import unavailable while an upload runs and shows the checking footer', () => {
      const harness = build();
      settle(harness);
      check(harness, 'es.xliff');
      settle(harness);
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(false);
      harness.store.uploadImportSources.mockReturnValue(NEVER);
      pick(harness, [new File(['{}'], 'vendor.xliff')]);
      expect(query<HTMLButtonElement>(harness, 'submit')?.disabled).toBe(true);
      expect(text(harness, 'footer-meta')).toContain('Checking…');
    });

    it('disables Upload and the drop zone while the import is being started', () => {
      const harness = build({ uploaded: withVendor });
      settle(harness);
      check(harness, 'es.xliff');
      settle(harness);
      harness.store.startImport.mockReturnValue(NEVER);
      click(harness, 'submit');
      expect(query<HTMLButtonElement>(harness, 'upload-files')?.disabled).toBe(true);
      query(harness, 'drop-zone')?.dispatchEvent(dropEvent('drop', [new File(['{}'], 'vendor.xliff')]));
      expect(harness.store.uploadImportSources).not.toHaveBeenCalled();
    });

    it('says honestly when the uploaded file could not be checked', () => {
      const harness = build();
      settle(harness);
      pick(harness, [new File(['{}'], 'en.json')]);
      expect(text(harness, 'upload-notice')).toContain('1 file uploaded, not checked.');
      expect(text(harness, 'upload-notice')).toContain('migration strategy');
      expect(text(harness, 'upload-notice')).not.toContain('uploaded and checked');
      expect(text(harness, 'upload-live')).toBe(text(harness, 'upload-notice'));
      expect(harness.component.model.checkedCount()).toBe(0);
    });

    it('keeps the drag highlight while the pointer moves between child elements', () => {
      const harness = build();
      settle(harness);
      const zone = query(harness, 'drop-zone') as HTMLElement;
      const child = zone.querySelector('.file-row') as HTMLElement;
      zone.dispatchEvent(dropEvent('dragenter'));
      child.dispatchEvent(dropEvent('dragenter'));
      zone.dispatchEvent(dropEvent('dragleave'));
      harness.fixture.detectChanges();
      expect(zone.classList.contains('drop-zone--over')).toBe(true);
      child.dispatchEvent(dropEvent('dragleave'));
      harness.fixture.detectChanges();
      expect(zone.classList.contains('drop-zone--over')).toBe(false);
    });

    it('ends the drag highlight on a document-level dragend or drop, a relist and a pane change', () => {
      const harness = build();
      settle(harness);
      const zone = query(harness, 'drop-zone') as HTMLElement;
      const over = () => zone.classList.contains('drop-zone--over');
      const hover = () => {
        zone.dispatchEvent(dropEvent('dragenter'));
        harness.fixture.detectChanges();
        expect(over()).toBe(true);
      };
      hover();
      document.dispatchEvent(new Event('dragend'));
      harness.fixture.detectChanges();
      expect(over()).toBe(false);
      hover();
      document.body.dispatchEvent(new Event('drop', { bubbles: true }));
      harness.fixture.detectChanges();
      expect(over()).toBe(false);
      // The hovered row is replaced by a relist: its dragleave never arrives.
      hover();
      harness.component.retryListing();
      settle(harness);
      expect(query(harness, 'drop-zone')?.classList.contains('drop-zone--over')).toBe(false);
      // The counter is back to zero: one enter then one leave ends the highlight.
      const fresh = query(harness, 'drop-zone') as HTMLElement;
      fresh.dispatchEvent(dropEvent('dragenter'));
      fresh.dispatchEvent(dropEvent('dragleave'));
      harness.fixture.detectChanges();
      expect(fresh.classList.contains('drop-zone--over')).toBe(false);
    });

    it('stops listening at the document once the dialog is destroyed', () => {
      const harness = build();
      settle(harness);
      const remove = vi.spyOn(document, 'removeEventListener');
      harness.fixture.destroy();
      expect(remove).toHaveBeenCalledWith('dragend', expect.any(Function));
      expect(remove).toHaveBeenCalledWith('drop', expect.any(Function));
    });

    it('shows pre-check errors as an alert without a request', () => {
      const harness = build();
      settle(harness);
      pick(harness, [new File(['x'], 'notes.txt')]);
      expect(query(harness, 'upload-errors')?.getAttribute('role')).toBe('alert');
      expect(text(harness, 'upload-errors')).toBe('notes.txt is not an XLIFF or JSON file.');
      expect(harness.store.uploadImportSources).not.toHaveBeenCalled();
    });

    it('shows server errors', () => {
      const harness = build();
      harness.store.uploadImportSources.mockReturnValue(
        throwError(() =>
          toApiError(
            new HttpErrorResponse({
              status: 400,
              error: { statusCode: 400, message: 'Invalid upload', errors: ['"x.json" is empty.'] },
            }),
          ),
        ),
      );
      settle(harness);
      pick(harness, [new File(['x'], 'x.json')]);
      expect(text(harness, 'upload-errors')).toBe('"x.json" is empty.');
    });

    it('prompts on a clash and replaces or keeps', () => {
      const harness = build({ uploaded: withVendor });
      harness.store.uploadImportSources.mockReturnValueOnce(
        throwError(() =>
          toApiError(
            new HttpErrorResponse({
              status: 409,
              error: { statusCode: 409, message: 'Files already exist', errors: ['es.xliff', 'fr.xliff'] },
            }),
          ),
        ),
      );
      settle(harness);
      pick(harness, [new File(['x'], 'es.xliff'), new File(['x'], 'fr.xliff')]);
      expect(query(harness, 'upload-clash')?.getAttribute('role')).toBe('alert');
      expect(text(harness, 'upload-clash')).toContain('Already in this folder: es.xliff, fr.xliff.');
      click(harness, 'upload-replace');
      expect(harness.store.uploadImportSources).toHaveBeenLastCalledWith('main', expect.any(Array), {
        folder: 'in',
        overwrite: true,
      });
      expect(query(harness, 'upload-clash')).toBeNull();
    });

    it('drops the clash prompt on Keep existing', () => {
      const harness = build();
      harness.store.uploadImportSources.mockReturnValue(
        throwError(() =>
          toApiError(new HttpErrorResponse({ status: 409, error: { statusCode: 409, errors: ['es.xliff'] } })),
        ),
      );
      settle(harness);
      pick(harness, [new File(['x'], 'es.xliff')]);
      click(harness, 'upload-keep');
      expect(query(harness, 'upload-clash')).toBeNull();
    });

    it('uploads dropped files and highlights the zone while dragging', () => {
      const harness = build({ uploaded: withVendor });
      settle(harness);
      const zone = query(harness, 'drop-zone');
      zone?.dispatchEvent(dropEvent('dragover'));
      harness.fixture.detectChanges();
      expect(zone?.classList.contains('drop-zone--over')).toBe(true);
      zone?.dispatchEvent(new Event('dragleave'));
      harness.fixture.detectChanges();
      expect(zone?.classList.contains('drop-zone--over')).toBe(false);
      const drop = dropEvent('drop', [new File(['{}'], 'vendor.xliff')]);
      zone?.dispatchEvent(drop);
      harness.fixture.detectChanges();
      expect(drop.defaultPrevented).toBe(true);
      expect(harness.store.uploadImportSources).toHaveBeenCalledTimes(1);
      expect(checkboxOf(harness, 'vendor.xliff')?.checked).toBe(true);
    });

    it('invites a drop in the empty and missing states', () => {
      const empty = build({ listing: listing([]) });
      settle(empty);
      expect(text(empty, 'drop-here-empty')).toBe('Drop XLIFF or JSON files here to add them to this folder.');
    });

    it('invites a drop when the folder does not exist yet', () => {
      const missing = build({ listing: listing([], { exists: false }) });
      settle(missing);
      expect(text(missing, 'drop-here-missing')).toContain('Drop XLIFF or JSON files here');
    });

    it('is out of reach for a read-only collection', () => {
      const harness = build({ data: { preselectedCollection: 'locked' } });
      settle(harness);
      expect(query(harness, 'source-group')?.hasAttribute('inert')).toBe(true);
      expect(query<HTMLButtonElement>(harness, 'upload-files')?.disabled).toBe(true);
      query(harness, 'drop-zone')?.dispatchEvent(dropEvent('drop', [new File(['{}'], 'a.json')]));
      expect(harness.store.uploadImportSources).not.toHaveBeenCalled();
    });

    it('disables Upload with a hint when the folder is outside the import folder', () => {
      const harness = build();
      settle(harness);
      expect(query(harness, 'upload-not-allowed')).toBeNull();
      harness.component.model.form.controls.folder.setValue('elsewhere');
      harness.fixture.detectChanges();
      expect(query<HTMLButtonElement>(harness, 'upload-files')?.disabled).toBe(true);
      expect(text(harness, 'upload-not-allowed')).toContain('import folder or one of its subfolders');
      const drop = dropEvent('drop', [new File(['{}'], 'a.json')]);
      query(harness, 'drop-zone')?.dispatchEvent(drop);
      expect(drop.defaultPrevented).toBe(true);
      expect(harness.store.uploadImportSources).not.toHaveBeenCalled();
    });
  });
});
