import { HttpErrorResponse } from '@angular/common/http';
import type { ComponentFixture } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { provideTranslocoMessageformat } from '@jsverse/transloco-messageformat';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type {
  BundleGenerateJobDto,
  ExportJobDto,
  ExportJobResultDto,
  ExportRequestDto,
  ImportJobDto,
  ImportJobResultDto,
  ImportRequestDto,
  LingoTrackerConfigDto,
} from '@simoncodes-ca/data-transfer';
import { JOB_RETENTION_MS } from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';
import { toApiError } from '../shared/api-error/api-error';
import { NotificationService } from '../shared/notification';
import { CollectionsManager } from './collections-manager';
import { CollectionsApiService } from './services/collections-api.service';
import { CollectionsStore } from './store/collections.store';
import { IMPORT_RUN_STORAGE_KEY } from './store/import-runs';

const config: LingoTrackerConfigDto = {
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  baseLocale: 'en',
  locales: ['en', 'fr-ca'],
  collections: {
    zulu: { translationsFolder: 'sample/zulu', locales: ['en', 'fr-ca'] },
    alpha: {
      translationsFolder: 'sample/alpha',
      locales: ['fr-ca', 'es', 'en', 'de', 'ja', 'ru'],
    },
    Bravo: { translationsFolder: 'vendor/bravo', locales: ['de', 'ja'], baseLocale: 'de', readOnly: true },
  },
  projectName: 'lingo-tracker',
  bundles: {
    tracker: {
      bundleName: '{locale}',
      dist: './apps/tracker/src/assets/i18n',
      collections: [{ name: 'alpha', entriesSelectionRules: 'All' }],
    },
    main: { bundleName: '{locale}', dist: './dist/i18n', collections: 'All' },
  },
};

const api = {
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  createBundle: vi.fn(),
  updateBundle: vi.fn(),
  deleteBundle: vi.fn(),
  generateBundle: vi.fn(),
  getBundleJob: vi.fn(),
  startExport: vi.fn(),
  getExportJob: vi.fn(),
  startImport: vi.fn(),
  getImportJob: vi.fn(),
  importSummaryUrl: vi.fn(),
};

const notifications = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
const dialog = { open: vi.fn() };

/** What `MatDialog.open` answers: a dialog that closes with `result`. */
const closingWith = (result: unknown) => ({ afterClosed: () => of(result) });

const text = (fixture: ComponentFixture<CollectionsManager>): string =>
  (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ') ?? '';

describe('CollectionsManager', () => {
  let fixture: ComponentFixture<CollectionsManager>;
  let component: CollectionsManager;
  let spectator: Spectator<CollectionsManager>;
  let store: InstanceType<typeof CollectionsStore>;

  const createComponent = createComponentFactory({
    component: CollectionsManager,
    imports: [
      getTranslocoTestingModule({
        translocoConfig: { availableLangs: ['en', 'fr'], defaultLang: 'en', reRenderOnLangChange: true },
      }),
    ],
    providers: [
      provideTranslocoMessageformat(),
      CollectionsStore,
      { provide: CollectionsApiService, useValue: api },
      { provide: NotificationService, useValue: notifications },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ],
    // MatDialogModule in the component's imports provides its own MatDialog, so the mock must
    // sit in the component injector to be the one the manager gets.
    componentProviders: [{ provide: MatDialog, useValue: dialog }],
    detectChanges: false,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    // Runs are mirrored to session storage, which jsdom keeps between tests.
    sessionStorage.clear();
    api.getConfig.mockReturnValue(of(config));

    spectator = createComponent();
    fixture = spectator.fixture;
    component = spectator.component;
    store = spectator.inject(CollectionsStore);
    store.loadCollections();
    spectator.detectComponentChanges();
  });

  it('sorts collections by name, ignoring case', () => {
    expect(component.cards().map((c) => c.name)).toEqual(['alpha', 'Bravo', 'zulu']);
  });

  it('lists the base locale first, whether it comes from the collection or the global config', () => {
    const alpha = component.cards().find((c) => c.name === 'alpha');
    const bravo = component.cards().find((c) => c.name === 'Bravo');

    expect(alpha?.baseLocale).toBe('en');
    expect(alpha?.visibleLocales[0]).toBe('en');
    expect(bravo?.baseLocale).toBe('de');
    expect(bravo?.visibleLocales[0]).toBe('de');
  });

  it('caps locale chips at four, overflow chip included, so the chip row never wraps', () => {
    const alpha = component.cards().find((c) => c.name === 'alpha');

    expect(alpha?.visibleLocales).toEqual(['en', 'fr-ca', 'es']);
    expect(alpha?.overflowLocales).toEqual(['de', 'ja', 'ru']);
  });

  it('shows every locale when they all fit', () => {
    const zulu = component.cards().find((c) => c.name === 'zulu');

    expect(zulu?.visibleLocales).toEqual(['en', 'fr-ca']);
    expect(zulu?.overflowLocales).toEqual([]);
  });

  it('marks read-only collections', () => {
    expect(component.cards().find((c) => c.name === 'Bravo')?.readOnly).toBe(true);
    expect(component.cards().find((c) => c.name === 'zulu')?.readOnly).toBe(false);
  });

  it('filters on name and on translations folder', () => {
    component.filter.set('BRAV');
    expect(component.cards().map((c) => c.name)).toEqual(['Bravo']);

    component.filter.set('sample/');
    expect(component.cards().map((c) => c.name)).toEqual(['alpha', 'zulu']);
  });

  it('reports no matches only while a filter excludes everything', () => {
    expect(component.hasNoMatches()).toBe(false);

    component.filter.set('nothing-matches-this');
    expect(component.hasNoMatches()).toBe(true);

    component.clearFilter();
    expect(component.filter()).toBe('');
    expect(component.hasNoMatches()).toBe(false);
  });

  it('hides the filter until the list outgrows a handful of collections', () => {
    expect(component.showFilter()).toBe(false);
  });

  it('passes the collection name to the router as one path segment', () => {
    const router = spectator.inject(Router);
    component.navigateToBrowser('a% b./&#é');

    expect(router.navigate).toHaveBeenCalledWith(['/browser', 'a% b./&#é']);
  });

  it('titles the page with the project name and summarises collections, bundles and base locale', () => {
    const page = text(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent?.trim()).toBe('lingo-tracker');
    expect(page).toContain('.lingo-tracker.json');
    expect(page).toContain('3 collections');
    expect(page).toContain('2 bundles');
    expect(page).toContain('base en');
  });

  it('falls back to the Collections title when the project name is unknown', () => {
    api.getConfig.mockReturnValue(of({ ...config, projectName: undefined }));
    store.loadCollections();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent?.trim()).toBe('Collections');
  });

  it('resolves the collections each bundle consumes and the locale count from the global config', () => {
    const cards = component.bundleCards();

    expect(cards.map((c) => c.entry.name)).toEqual(['main', 'tracker']);
    expect(cards.find((c) => c.entry.name === 'main')?.collectionNames).toEqual(['zulu', 'alpha', 'Bravo']);
    expect(cards.find((c) => c.entry.name === 'tracker')?.collectionNames).toEqual(['alpha']);
    expect(cards[0]?.localeCount).toBe(2);
  });

  it('renders one bundle card per bundle with the column header tools', () => {
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelectorAll('app-bundle-card').length).toBe(2);
    expect(text(fixture)).toContain('Generate all');
    expect(text(fixture)).toContain('Add bundle');
    expect(host.querySelector('.empty-bundles')).toBeNull();
  });

  it('shows the dashed empty card and hides the tools when there are no bundles', () => {
    api.getConfig.mockReturnValue(of({ ...config, bundles: {} }));
    store.loadCollections();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.empty-bundles')).not.toBeNull();
    expect(text(fixture)).toContain('No bundles yet');
    expect(text(fixture)).not.toContain('Generate all');
    expect(text(fixture)).toContain('0 bundles');
  });

  it('wires the hovered bundle to the collections it consumes; "All" links every card', () => {
    expect(component.isCollectionLinked('zulu')).toBe(false);

    component.onBundleHover('tracker', true);
    expect(component.isCollectionLinked('alpha')).toBe(true);
    expect(component.isCollectionLinked('zulu')).toBe(false);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.collection-card.linked').length).toBe(1);
    // The unconsumed collections keep their full presence: the connector line is what
    // states the relation now, not a dim on everything it excludes.
    expect(host.querySelectorAll('.collection-card')).toHaveLength(3);
    expect(host.querySelector('[data-collection="alpha"]')).not.toBeNull();

    component.onBundleHover('main', true);
    expect(component.isCollectionLinked('zulu')).toBe(true);
    expect(component.isCollectionLinked('Bravo')).toBe(true);

    // A stale leave from another card must not clear the current hover.
    component.onBundleHover('tracker', false);
    expect(component.hoveredBundle()).toBe('main');

    component.onBundleHover('main', false);
    expect(component.hoveredBundle()).toBeNull();
    expect(component.isCollectionLinked('zulu')).toBe(false);
  });

  it('draws no connector lines while the columns are stacked in the test layout', () => {
    // jsdom gives every element a zero rect, so the bundles column never clears the
    // collections column and the geometry path must decline rather than draw at 0,0.
    component.onBundleHover('main', true);
    fixture.detectChanges();

    expect(component.bundleLinks()).toEqual([]);
    expect(component.bundlePort()).toBeNull();
  });

  it('measures only the hovered bundle and its linked collection cards on scroll', () => {
    const host = fixture.nativeElement as HTMLElement;
    const split = host.querySelector('.split');
    const alpha = host.querySelector('[data-collection="alpha"]');
    const bravo = host.querySelector('[data-collection="Bravo"]');
    const zulu = host.querySelector('[data-collection="zulu"]');
    const tracker = host.querySelector('[data-bundle="tracker"]');
    const main = host.querySelector('[data-bundle="main"]');
    if (!split || !alpha || !bravo || !zulu || !tracker || !main)
      throw new Error('Expected collection and bundle cards');

    const query = vi.spyOn(split, 'querySelector');
    const queryAll = vi.spyOn(split, 'querySelectorAll');
    const alphaRect = vi.spyOn(alpha, 'getBoundingClientRect');
    const bravoRect = vi.spyOn(bravo, 'getBoundingClientRect');
    const zuluRect = vi.spyOn(zulu, 'getBoundingClientRect');
    const trackerRect = vi.spyOn(tracker, 'getBoundingClientRect');
    const mainRect = vi.spyOn(main, 'getBoundingClientRect');

    component.onBundleHover('tracker', true);
    window.dispatchEvent(new Event('scroll'));

    expect(query.mock.calls.map(([selector]) => selector)).toEqual(['.bundles-col']);
    expect(queryAll.mock.calls.map(([selector]) => selector)).toEqual(['[data-bundle]', '[data-collection]']);
    expect(alphaRect).toHaveBeenCalledTimes(1);
    expect(trackerRect).toHaveBeenCalledTimes(1);
    expect(bravoRect).not.toHaveBeenCalled();
    expect(zuluRect).not.toHaveBeenCalled();
    expect(mainRect).not.toHaveBeenCalled();
  });

  it('disables Generate all while a single bundle generates from its own card', () => {
    const running: BundleGenerateJobDto = {
      jobId: 'job-1',
      bundleName: 'tracker',
      status: 'running',
      progress: { current: 0, total: 2 },
    };
    api.generateBundle.mockReturnValue(of(running));
    api.getBundleJob.mockReturnValue(of(running));

    // A single Generate keeps the plain label — the "n of N" count is batch-scoped.
    component.generateBundle('tracker');
    fixture.detectChanges();
    expect(store.isAnyBundleRunning()).toBe(true);
    expect(component.isGeneratingAll()).toBe(false);
    expect(text(fixture)).toContain('Generate all');

    // …but the button must look as inert as it behaves, or the click is a silent no-op.
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="generate-all"]',
    );
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-disabled')).toBe('true');

    // Ignored while something is already running.
    component.generateAllBundles();
    expect(api.generateBundle).toHaveBeenCalledTimes(1);
  });

  it('counts the Generate all batch as "n of N" while it runs', () => {
    const running = (bundleName: string): BundleGenerateJobDto => ({
      jobId: `job-${bundleName}`,
      bundleName,
      status: 'running',
      progress: { current: 0, total: 6 },
    });
    api.generateBundle.mockImplementation((name: string) => of(running(name)));
    api.getBundleJob.mockImplementation((jobId: string) => of(running(jobId.replace('job-', ''))));

    component.generateAllBundles();
    fixture.detectChanges();

    expect(component.isGeneratingAll()).toBe(true);
    expect(component.generateAllPosition()).toBe(1);
    expect(text(fixture)).toContain('1 of 2…');

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="generate-all"]',
    );
    expect(button?.disabled).toBe(true);
  });

  it('shows store batch progress when one configured bundle was already running', () => {
    const running = (bundleName: string): BundleGenerateJobDto => ({
      jobId: `job-${bundleName}`,
      bundleName,
      status: 'running',
      progress: { current: 0, total: 2 },
    });
    api.generateBundle.mockImplementation((name: string) => of(running(name)));
    api.getBundleJob.mockReturnValue(of(running('tracker')));
    store.generateBundle('tracker');
    store.generateAllBundles();
    fixture.detectChanges();

    expect(component.isGeneratingAll()).toBe(true);
    expect(component.generateAllPosition()).toBe(1);
    expect(text(fixture)).toContain('1 of 1…');
    expect(store.bundleCount()).toBe(2);
  });

  describe('config write outcomes', () => {
    const rejection = (status: number, message: string) =>
      throwError(() => toApiError(new HttpErrorResponse({ status, error: { statusCode: status, message } })));
    const dialogOpened = () => vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());

    // The manager loads its dialogs lazily; the first import of a dialog module is slow
    // enough to outlast a waitFor, so load them once up front.
    beforeAll(async () => {
      await import('./collection-form-dialog/collection-form-dialog');
      await import('./bundle-form-dialog/bundle-form-dialog');
      await import('../shared/components/confirmation-dialog/confirmation-dialog');
    });

    it('toasts Created only for a collection the dialog saved; the manager writes nothing itself', async () => {
      dialog.open.mockReturnValue(closingWith({ name: 'new', config: { translationsFolder: 'i18n' } }));

      component.openCreateDialog();
      await vi.waitFor(() => expect(notifications.success).toHaveBeenCalledWith('Collection created successfully'));

      expect(api.createCollection).not.toHaveBeenCalled();
      expect(notifications.success).toHaveBeenCalledTimes(1);
    });

    it('toasts nothing when the collection dialog closes without a save', async () => {
      dialog.open.mockReturnValue(closingWith(undefined));

      component.openCreateDialog();
      await dialogOpened();

      expect(notifications.success).not.toHaveBeenCalled();
      expect(notifications.error).not.toHaveBeenCalled();
    });

    it('toasts Updated only for a bundle the dialog saved', async () => {
      dialog.open.mockReturnValue(closingWith({ name: 'main', bundle: config.bundles?.['main'] }));

      component.openEditBundleDialog('main');
      await vi.waitFor(() => expect(notifications.success).toHaveBeenCalledWith('Bundle updated successfully'));

      expect(api.updateBundle).not.toHaveBeenCalled();
    });

    it('toasts Deleted once the server has removed the collection', async () => {
      dialog.open.mockReturnValue(closingWith(true));
      api.deleteCollection.mockReturnValue(of({ message: 'ok' }));
      api.getConfig.mockReturnValue(of({ ...config, collections: { alpha: config.collections['alpha'] } }));

      component.openDeleteDialog('zulu');
      await vi.waitFor(() => expect(notifications.success).toHaveBeenCalledWith('Collection deleted successfully'));

      expect(dialog.open.mock.calls.at(-1)?.[1]).toEqual({
        data: {
          title: 'Delete Collection',
          message: 'Are you sure you want to delete zulu?',
          confirmButtonText: 'Delete',
          cancelButtonText: 'Cancel',
          actionType: 'destructive',
        },
        width: '400px',
      });

      expect(api.deleteCollection).toHaveBeenCalledWith('zulu');
      expect(component.cards().map((card) => card.name)).toEqual(['alpha']);
    });

    it('toasts the server message, and no success, when the delete is refused', async () => {
      dialog.open.mockReturnValue(closingWith(true));
      api.deleteCollection.mockReturnValue(rejection(403, 'Collection "Bravo" is read-only.'));

      component.openDeleteDialog('Bravo');
      await vi.waitFor(() => expect(notifications.error).toHaveBeenCalledWith('Collection "Bravo" is read-only.'));

      expect(notifications.success).not.toHaveBeenCalled();
      expect(component.cards()).toHaveLength(3);
    });

    it('toasts the delete-failed fallback for a refused bundle delete without a message', async () => {
      dialog.open.mockReturnValue(closingWith(true));
      api.deleteBundle.mockReturnValue(
        throwError(() => toApiError(new HttpErrorResponse({ status: 500, error: { statusCode: 500 } }))),
      );

      component.openDeleteBundleDialog('main');
      await vi.waitFor(() => expect(notifications.error).toHaveBeenCalledWith('Failed to delete bundle'));

      expect(dialog.open.mock.calls.at(-1)?.[1]).toEqual({
        data: {
          title: 'Delete Bundle',
          message: 'Delete the bundle main? Files it already generated are kept.',
          confirmButtonText: 'Delete',
          cancelButtonText: 'Cancel',
          actionType: 'destructive',
        },
        width: '400px',
      });

      expect(notifications.success).not.toHaveBeenCalled();
    });
  });

  it('leaves Generate all enabled when nothing is running', () => {
    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="generate-all"]',
    );
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-disabled')).toBeNull();
  });

  describe('export', () => {
    const request: ExportRequestDto = { format: 'xliff', collections: ['alpha'] };
    const host = () => fixture.nativeElement as HTMLElement;
    const strip = () => host().querySelector('[data-testid="export-strip"]');
    const exportButton = () => host().querySelector<HTMLButtonElement>('[data-testid="export-button"]');

    beforeEach(() => {
      // A dialog that never closes, unless a test closes it itself.
      dialog.open.mockReturnValue({ afterClosed: () => new Subject() });
    });

    const result: ExportJobResultDto = {
      filesWritten: ['dist/lingo-export/fr.xlf', 'dist/lingo-export/de.xlf'],
      entriesExported: 423,
      localeResults: [
        { locale: 'fr', outcome: 'exported', entriesExported: 400, file: 'dist/lingo-export/fr.xlf' },
        { locale: 'de', outcome: 'exported', entriesExported: 23, file: 'dist/lingo-export/de.xlf' },
        { locale: 'ja', outcome: 'skipped', entriesExported: 0, error: 'Nothing to export' },
        { locale: 'ar', outcome: 'skipped', entriesExported: 0 },
        { locale: 'fr-fr', outcome: 'skipped', entriesExported: 0 },
      ],
      warnings: ['Check the notes'],
      errors: [],
      outcome: 'succeeded',
      outputDirectory: 'dist/lingo-export',
      format: 'xliff',
    };

    /** Starts an export whose job the API reports as `job`. */
    const startWith = (job: Partial<ExportJobDto>): void => {
      const full: ExportJobDto = {
        jobId: 'job-1',
        status: 'running',
        progress: { current: 0, total: 0 },
        request,
        ...job,
      };
      api.startExport.mockReturnValue(of(full));
      api.getExportJob.mockReturnValue(of(full));
      store.startExport(request).subscribe();
      fixture.detectChanges();
    };

    it('shows an outline Export button with the output icon, enabled when idle', () => {
      const button = exportButton();

      expect(button?.classList.contains('btn--outline')).toBe(true);
      expect(button?.textContent).toContain('Export…');
      expect(button?.querySelector('mat-icon')?.textContent).toBe('output');
      expect(button?.disabled).toBe(false);
      expect(strip()).toBeNull();
    });

    it('hides the Export button when there are no collections', () => {
      api.getConfig.mockReturnValue(of({ ...config, collections: {} }));
      store.loadCollections();
      fixture.detectChanges();

      expect(exportButton()).toBeNull();
    });

    it('opens the dialog from the button with the lazily loaded export panel', async () => {
      dialog.open.mockReturnValue({ afterClosed: () => new Subject() });
      exportButton()?.click();

      await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
      const options = dialog.open.mock.calls[0][1];
      expect(options.panelClass).toBe('export-dialog-panel');
      expect(options.data).toEqual({});
    });

    describe('focus return', () => {
      /** Opens through `open`, then closes the dialog after `beforeClose` ran. */
      const openAndClose = async (open: () => void, beforeClose: () => void = () => undefined): Promise<void> => {
        const closed = new Subject<void>();
        dialog.open.mockReturnValue({ afterClosed: () => closed });
        open();
        await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
        beforeClose();
        fixture.detectChanges();
        closed.next();
        closed.complete();
      };

      it('returns to the Export button when the dialog is cancelled', async () => {
        await openAndClose(() => exportButton()?.click());

        expect(document.activeElement).toBe(exportButton());
      });

      it('returns to the strip when the started export disabled the Export button', async () => {
        await openAndClose(
          () => exportButton()?.click(),
          () => startWith({ status: 'running', progress: { current: 0, total: 2 } }),
        );

        expect(exportButton()?.disabled).toBe(true);
        expect(document.activeElement).toBe(strip());
      });

      it('returns to the strip after Retry removed the Retry button', async () => {
        startWith({ status: 'failed', error: 'Disk is full' });
        const retry = Array.from(strip()?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
          button.textContent?.includes('Retry'),
        );
        retry?.focus();

        await openAndClose(
          () => retry?.click(),
          () => startWith({ status: 'running', progress: { current: 0, total: 2 } }),
        );

        expect(retry?.isConnected).toBe(false);
        expect(document.activeElement).toBe(strip());
      });

      it('falls through to the strip when Retry was clicked without taking focus (body is active)', async () => {
        startWith({ status: 'failed', error: 'Disk is full' });
        const retry = Array.from(strip()?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
          button.textContent?.includes('Retry'),
        );
        (document.activeElement as HTMLElement | null)?.blur();
        expect(document.activeElement).toBe(document.body);

        await openAndClose(() => retry?.click());

        expect(document.activeElement).toBe(strip());
      });

      it('falls back to the section heading when neither the trigger nor a strip remains', async () => {
        await openAndClose(
          () => exportButton()?.click(),
          () => exportButton()?.remove(),
        );

        expect(document.activeElement?.id).toBe('collections-heading');
      });

      it('returns to the card menu trigger after the menu item opened the dialog', async () => {
        const trigger = host().querySelector<HTMLButtonElement>('[data-collection="alpha"] button[mat-icon-button]');
        trigger?.click();
        fixture.detectChanges();
        const item = document.querySelector<HTMLButtonElement>('[data-testid="card-export"]');

        await openAndClose(() => item?.click());

        expect(document.activeElement).toBe(trigger);
      });
    });

    it('updates running progress and current-item copy after a language switch', async () => {
      const transloco = spectator.inject(TranslocoService);
      startWith({ status: 'running', progress: { current: 1, total: 2, currentFile: 'dist/de.xlf' } });
      expect(strip()?.textContent).toContain('1 of 2 locales');

      transloco.setTranslation(
        {
          'export.run.exporting': 'Export en cours…',
          'export.run.writing': 'Écriture',
          'export.run.localesProgressX': '{{ current }} sur {{ total }} langues',
        },
        'fr',
      );
      transloco.setActiveLang('fr');
      await fixture.whenStable();
      spectator.detectComponentChanges();

      const content = strip()?.textContent?.replace(/\s+/g, ' ') ?? '';
      expect(content).toContain('Export en cours…');
      expect(content).toContain('Écriture');
      expect(content).toContain('dist/de.xlf');
      expect(content).toContain('1 sur 2 langues');
      expect(content).not.toContain('1 of 2 locales');
    });

    it('re-translates the strip when the language changes', async () => {
      const transloco = spectator.inject(TranslocoService);
      startWith({ status: 'completed', progress: { current: 2, total: 2 }, result });
      expect(strip()?.textContent).toContain('2 files');

      transloco.setActiveLang('fr');
      await fixture.whenStable();
      transloco.setTranslation(
        {
          'export.run.filesX': '{ count, plural, =1 {1 fichier} other {{count} fichiers} }',
          'export.run.entriesX': '{ count, plural, =1 {1 entrée} other {{count} entrées} }',
          'export.run.exported': 'Exporté',
          'export.run.warningsX': '{ count, plural, =1 {1 avertissement} other {{count} avertissements} }',
        },
        'fr',
      );
      await fixture.whenStable();
      spectator.detectComponentChanges();

      const content = strip()?.textContent?.replace(/\s+/g, ' ') ?? '';
      expect(content).toContain('2 fichiers');
      expect(content).toContain('423 entrées');
      expect(content).toContain('1 avertissement');
      expect(content).not.toContain('2 files');
    });

    it('is busy and disabled with "Exporting…" while a job runs', () => {
      startWith({ status: 'running', progress: { current: 1, total: 4, currentFile: 'fr.xlf' } });

      const button = exportButton();
      expect(button?.disabled).toBe(true);
      expect(button?.getAttribute('aria-disabled')).toBe('true');
      expect(button?.classList.contains('btn--busy')).toBe(true);
      expect(button?.textContent).toContain('Exporting…');
    });

    it('renders the running strip with the file and locale progress, without Dismiss', () => {
      startWith({ status: 'running', progress: { current: 1, total: 4, currentFile: 'fr.xlf' } });

      const content = strip()?.textContent?.replace(/\s+/g, ' ') ?? '';
      expect(content).toContain('Exporting…');
      expect(content).toContain('Writing');
      expect(content).toContain('fr.xlf');
      expect(content).toContain('1 of 4 locales');
      expect(strip()?.querySelector('.dismiss')).toBeNull();
    });

    it('renders the completed strip with counts, format, folder and warnings', () => {
      startWith({ status: 'completed', progress: { current: 2, total: 2 }, result });

      const content = strip()?.textContent?.replace(/\s+/g, ' ') ?? '';
      expect(content).toContain('Exported');
      expect(content).toContain('2 files');
      expect(content).toContain('423 entries');
      expect(content).toContain('XLIFF');
      expect(content).toContain('dist/lingo-export');
      expect(content).toContain('1 warning');
      expect(strip()?.querySelector('.fig--mono')).not.toBeNull();
      expect(strip()?.querySelector('.details-toggle')).not.toBeNull();
      expect(strip()?.querySelector('.dismiss')).not.toBeNull();
    });

    it('lists files, skipped locales and warnings in the details panel', () => {
      spectator
        .inject(TranslocoService)
        .setTranslation({ 'export.dialog.preview.skipped': 'no matching entries' }, 'en', { merge: true });
      startWith({ status: 'completed', progress: { current: 2, total: 2 }, result });

      strip()?.querySelector<HTMLButtonElement>('.details-toggle')?.click();
      fixture.detectChanges();

      const details = strip()?.querySelector('.result-details')?.textContent?.replace(/\s+/g, ' ') ?? '';
      expect(details).toContain('Files written');
      expect(details).toContain('dist/lingo-export/fr.xlf');
      expect(details).toContain('400 entries');
      expect(details).toContain('Skipped locales');
      expect(details).toContain('Nothing to export');
      // Locales without a distinct error share one inline run and one reason.
      const runs = strip()?.querySelectorAll('.skipped-run');
      expect(runs?.length).toBe(1);
      expect(runs?.[0]?.textContent?.replace(/\s+/g, ' ').trim()).toBe('ar · fr-fr no matching entries');
      expect(details).toContain('Check the notes');
      expect(strip()?.querySelector('.details-list--warnings li span')?.getAttribute('title')).toBe('Check the notes');
    });

    it('renders the failed strip with the error and Retry, and offers Details only for per-locale errors', () => {
      startWith({ status: 'failed', error: 'Disk is full' });

      const content = strip()?.textContent?.replace(/\s+/g, ' ') ?? '';
      expect(content).toContain('Export failed');
      expect(content).toContain('Disk is full');
      expect(content).toContain('Retry');
      expect(strip()?.querySelector('.details-toggle')).toBeNull();
      expect(strip()?.querySelector('.dismiss')).not.toBeNull();
    });

    it('offers Details on a failed run that has per-locale errors', () => {
      startWith({
        status: 'failed',
        error: 'Export failed',
        result: { ...result, outcome: 'failed', warnings: [], errors: ['fr: cannot write'] },
      });

      strip()?.querySelector<HTMLButtonElement>('.details-toggle')?.click();
      fixture.detectChanges();

      expect(strip()?.querySelector('.details-list--errors li span')?.getAttribute('title')).toBe('fr: cannot write');
    });

    it('dismisses the strip and clears the run', () => {
      startWith({ status: 'completed', progress: { current: 2, total: 2 }, result });

      strip()?.querySelector<HTMLButtonElement>('.dismiss')?.click();
      fixture.detectChanges();

      expect(store.exportRun()).toBeNull();
      expect(strip()).toBeNull();
    });

    it('reopens the dialog with the last request on Retry', async () => {
      startWith({ status: 'failed', error: 'Disk is full' });

      Array.from(strip()?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        .find((button) => button.textContent?.includes('Retry'))
        ?.click();

      await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
      expect(dialog.open.mock.calls[0][1].data).toEqual({ request });
      expect(dialog.open.mock.calls[0][1].panelClass).toBe('export-dialog-panel');
    });

    it('opens the dialog preselected from a card menu, including a read-only collection', async () => {
      const trigger = host().querySelector<HTMLButtonElement>('[data-collection="Bravo"] button[mat-icon-button]');
      trigger?.click();
      fixture.detectChanges();

      const item = document.querySelector<HTMLButtonElement>('[data-testid="card-export"]');
      expect(item?.textContent).toContain('Export…');
      expect(item?.disabled).toBe(false);
      item?.click();

      await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
      expect(dialog.open.mock.calls[0][1].data).toEqual({ preselectedCollection: 'Bravo' });
    });
  });

  describe('import', () => {
    const request: ImportRequestDto = {
      collection: 'alpha',
      files: [
        { path: 'dist/lingo-import/de.xliff', locale: 'de' },
        { path: 'dist/lingo-import/es.xliff', locale: 'es' },
      ],
    };
    const host = () => fixture.nativeElement as HTMLElement;
    const strip = () => host().querySelector<HTMLElement>('[data-testid="import-strip"]');
    const exportStrip = () => host().querySelector('[data-testid="export-strip"]');
    const importButton = () => host().querySelector<HTMLButtonElement>('[data-testid="import-button"]');
    const stripText = () => strip()?.textContent?.replace(/\s+/g, ' ') ?? '';
    const detailsText = () => strip()?.querySelector('.result-details')?.textContent?.replace(/\s+/g, ' ') ?? '';
    const openDetails = () => {
      strip()?.querySelector<HTMLButtonElement>('.details-toggle')?.click();
      fixture.detectChanges();
    };

    const totals = { entries: 700, imported: 683, created: 10, updated: 600, skipped: 0, failed: 0, changed: 4 };
    const file = (path: string, locale: string, extra: object = {}) => ({
      path,
      locale,
      format: 'xliff' as const,
      entries: 300,
      imported: 290,
      created: 0,
      updated: 290,
      skipped: 0,
      failed: 0,
      changed: 2,
      statusTransitions: [],
      warnings: [],
      errors: [],
      outcome: 'imported' as const,
      filesModified: [],
      ...extra,
    });
    const result: ImportJobResultDto = {
      collection: 'alpha',
      strategy: 'translation-service',
      files: [file('dist/lingo-import/de.xliff', 'de'), file('dist/lingo-import/es.xliff', 'es', { imported: 393 })],
      totals,
      statusTransitions: [
        { from: 'new', to: 'translated', count: 490 },
        { to: 'verified', count: 3 },
      ],
      icuAutoFixes: [
        { locale: 'es', key: 'browser.greetingX', originalValue: '{nombre}', fixedValue: '{name}', description: '' },
      ],
      issues: [
        { locale: 'es', key: 'a.skipped', type: 'skipped', reason: 'Not in this collection' },
        { locale: 'es', key: 'b.failed', type: 'failed', reason: 'Protected term altered' },
      ],
      warnings: [],
      errors: [],
      filesModified: ['sample/alpha/ok/resource_entries.json'],
      outcome: 'succeeded',
      truncated: { issues: 7, icuAutoFixes: 0, warnings: 0, errors: 0 },
    };

    beforeEach(() => {
      // The shared testing module carries no import copy, so this block brings its own.
      spectator.inject(TranslocoService).setTranslation(
        {
          'import.button': 'Import…',
          'import.buttonBusy': 'Importing…',
          'import.card.menuItem': 'Import…',
          'import.card.readOnlyTooltip': 'Read-only collection. Nothing can be imported into it.',
          'import.run.importing': 'Importing…',
          'import.run.reading': 'Reading',
          'import.run.filesProgressX': '{{ current }} of {{ total }} files',
          'import.run.imported': 'Imported',
          'import.run.failed': 'Import failed',
          'import.run.entriesX': '{ count, plural, =1 {1 entry} other {{count} entries} }',
          'import.run.filesX': '{ count, plural, =1 {1 file} other {{count} files} }',
          'import.run.filesFailedX': '{ count, plural, =1 {1 file failed} other {{count} files failed} }',
          'import.run.failedX': '{ count, plural, =1 {1 failed} other {{count} failed} }',
          'import.run.skippedX': '{ count, plural, =1 {1 skipped} other {{count} skipped} }',
          'import.run.warningsX': '{ count, plural, =1 {1 warning} other {{count} warnings} }',
          'import.run.importedX': '{ count, plural, =1 {1 imported} other {{count} imported} }',
          'import.run.createdX': '{ count, plural, =1 {1 created} other {{count} created} }',
          'import.run.updatedX': '{ count, plural, =1 {1 updated} other {{count} updated} }',
          'import.run.details': 'Details',
          'import.run.detailsAriaLabel': 'Import details',
          'import.run.dismissAriaLabel': 'Dismiss import result',
          'import.run.filesHeading': 'Files',
          'import.run.statusHeading': 'Status changes',
          'import.run.autoFixesHeading': 'Auto-fixes',
          'import.run.issuesHeading': 'Issues',
          'import.run.warningsHeading': 'Warnings',
          'import.run.errorsHeading': 'Errors',
          'import.run.filesChanged': 'Files changed',
          'import.run.moreInSummaryX': 'and {{ count }} more in the summary',
          'import.run.downloadSummary': 'Download summary (.md)',
        },
        'en',
        { merge: true },
      );
      fixture.detectChanges();
      dialog.open.mockReturnValue({ afterClosed: () => new Subject() });
      api.importSummaryUrl.mockImplementation((jobId: string) => `/api/imports/jobs/${jobId}/summary`);
    });

    /** Starts an import whose job the API reports as `job`. */
    const startWith = (job: Partial<ImportJobDto>): void => {
      const full: ImportJobDto = {
        jobId: 'job-1',
        status: 'running',
        progress: { current: 0, total: 2 },
        request,
        ...job,
      };
      api.startImport.mockReturnValue(of(full));
      api.getImportJob.mockReturnValue(of(full));
      store.startImport(request).subscribe();
      fixture.detectChanges();
    };
    const completed = (override: Partial<ImportJobResultDto> = {}) =>
      startWith({
        status: 'completed',
        progress: { current: 2, total: 2 },
        completedAt: new Date().toISOString(),
        result: { ...result, ...override },
      });

    it('shows an outline Import button with the input glyph after Export, enabled when idle', () => {
      const button = importButton();

      expect(button?.classList.contains('btn--outline')).toBe(true);
      expect(button?.textContent).toContain('Import…');
      expect(button?.querySelector('mat-icon')?.textContent).toBe('input');
      expect(button?.disabled).toBe(false);
      expect(button?.previousElementSibling?.getAttribute('data-testid')).toBe('export-button');
      expect(strip()).toBeNull();
    });

    it('is busy and disabled with "Importing…" while a job runs', () => {
      startWith({ progress: { current: 1, total: 2, currentFile: 'es.xliff' } });

      const button = importButton();
      expect(button?.disabled).toBe(true);
      expect(button?.getAttribute('aria-disabled')).toBe('true');
      expect(button?.classList.contains('btn--busy')).toBe(true);
      expect(button?.textContent).toContain('Importing…');
    });

    it('opens the lazily loaded import panel without a preselection', async () => {
      importButton()?.click();

      await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
      const options = dialog.open.mock.calls[0][1];
      expect(options.panelClass).toBe('import-dialog-panel');
      expect(options.data).toEqual({});
    });

    describe('card menu', () => {
      const openMenu = (name: string) => {
        host().querySelector<HTMLButtonElement>(`[data-collection="${name}"] button[mat-icon-button]`)?.click();
        fixture.detectChanges();
        return document.querySelector<HTMLButtonElement>('[data-testid="card-import"]');
      };

      it('lists Import… between Export… and Delete', () => {
        openMenu('alpha');

        const labels = Array.from(document.querySelectorAll('.mat-mdc-menu-item-text')).map((item) =>
          item.textContent?.trim(),
        );
        expect(labels.indexOf('Import…')).toBe(labels.indexOf('Export…') + 1);
        expect(labels.indexOf('Delete')).toBe(labels.indexOf('Import…') + 1);
      });

      it('preselects the collection', async () => {
        const item = openMenu('alpha');
        expect(item?.disabled).toBe(false);
        item?.click();

        await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
        expect(dialog.open.mock.calls[0][1].data).toEqual({ preselectedCollection: 'alpha' });
        expect(dialog.open.mock.calls[0][1].panelClass).toBe('import-dialog-panel');
      });

      it('is disabled on a read-only collection, wrapped by its tooltip, and opens nothing', () => {
        const item = openMenu('Bravo');
        item?.click();

        expect(item?.disabled).toBe(true);
        expect(item?.hasAttribute('disabled')).toBe(true);
        expect(item?.parentElement?.classList.contains('menu-item-tooltip')).toBe(true);
        expect(dialog.open).not.toHaveBeenCalled();
      });

      it('explains the restriction in the card read-only note', () => {
        spectator
          .inject(TranslocoService)
          .setTranslation(
            { 'collections.card.readOnlyTooltip': "This collection is read-only. Its resources can't be modified." },
            'en',
            { merge: true },
          );
        fixture.detectChanges();
        const note = host().querySelector('[data-collection="Bravo"] .readonly-note');

        expect(note?.textContent).toContain('read-only');
        expect(host().querySelector('[data-collection="alpha"] .readonly-note')).toBeNull();
      });

      it('is enabled on a writable collection', () => {
        expect(openMenu('alpha')?.disabled).toBe(false);
      });

      it('returns focus to the card menu trigger after closing', async () => {
        const trigger = host().querySelector<HTMLButtonElement>('[data-collection="alpha"] button[mat-icon-button]');
        const item = openMenu('alpha');
        const closed = new Subject<void>();
        dialog.open.mockReturnValue({ afterClosed: () => closed });
        item?.click();
        await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
        closed.next();
        closed.complete();

        expect(document.activeElement).toBe(trigger);
      });
    });

    describe('focus return', () => {
      const openAndClose = async (open: () => void, beforeClose: () => void = () => undefined): Promise<void> => {
        const closed = new Subject<void>();
        dialog.open.mockReturnValue({ afterClosed: () => closed });
        open();
        await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
        beforeClose();
        fixture.detectChanges();
        closed.next();
        closed.complete();
      };

      it('returns to the Import button when the dialog is cancelled', async () => {
        await openAndClose(() => importButton()?.click());

        expect(document.activeElement).toBe(importButton());
      });

      it('returns to the import strip when the started import disabled the button', async () => {
        await openAndClose(
          () => importButton()?.click(),
          () => startWith({}),
        );

        expect(importButton()?.disabled).toBe(true);
        expect(document.activeElement).toBe(strip());
      });

      it('returns to the import strip, not the export strip, after Retry', async () => {
        startWith({ status: 'failed', error: 'Folder vanished' });
        const retry = Array.from(strip()?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
          button.textContent?.includes('Retry'),
        );
        retry?.focus();

        await openAndClose(
          () => retry?.click(),
          () => startWith({}),
        );

        expect(document.activeElement).toBe(strip());
      });
    });

    it('renders the running strip with the file and progress, without Dismiss', () => {
      startWith({ progress: { current: 2, total: 3, currentFile: 'es.xliff' } });

      expect(stripText()).toContain('Importing…');
      expect(stripText()).toContain('Reading');
      expect(stripText()).toContain('es.xliff');
      expect(stripText()).toContain('2 of 3 files');
      expect(strip()?.querySelector('.bar')).not.toBeNull();
      expect(strip()?.querySelector('.dismiss')).toBeNull();
      expect(strip()?.querySelector('[role="status"]')).not.toBeNull();
    });

    it.each([
      ['posix', 'dist/lingo-import-playground/fr-ca.xliff'],
      ['windows', 'dist\\lingo-import-playground\\fr-ca.xliff'],
    ])('shows only the file name of a %s path while running, with the full path on the title', (_name, path) => {
      startWith({ progress: { current: 1, total: 3, currentFile: path } });

      expect(stripText()).toContain('Reading fr-ca.xliff');
      expect(stripText()).not.toContain('lingo-import-playground');
      expect(strip()?.getAttribute('title')).toBe(path);
    });

    it('carries no title once the run has finished', () => {
      completed();

      expect(strip()?.hasAttribute('title')).toBe(false);
    });

    it('renders a clean completed strip without skipped, failed or warning clauses', () => {
      completed({ issues: [], truncated: { issues: 0, icuAutoFixes: 0, warnings: 0, errors: 0 } });

      expect(stripText()).toContain('Imported');
      expect(stripText()).toContain('683 entries');
      expect(stripText()).toContain('2 files');
      expect(stripText()).not.toMatch(/\d (skipped|failed|warning)/);
      expect(strip()?.querySelector('.result--ok')).not.toBeNull();
      expect(strip()?.querySelector('.result--warn')).toBeNull();
      expect(strip()?.querySelector('.details-toggle')).not.toBeNull();
    });

    it('renders skipped, failed and warning clauses with the warning tint', () => {
      completed({ totals: { ...totals, skipped: 12, failed: 2 }, warnings: ['Large import file', 'Another'] });

      expect(stripText()).toContain('2 failed');
      expect(stripText()).toContain('12 skipped');
      expect(stripText()).toContain('2 warnings');
      expect(stripText().indexOf('2 failed')).toBeLessThan(stripText().indexOf('12 skipped'));
      expect(stripText().indexOf('12 skipped')).toBeLessThan(stripText().indexOf('2 warnings'));
      expect(strip()?.querySelector('.result--warn')).not.toBeNull();
      expect(strip()?.querySelector('.result--failed')).toBeNull();
    });

    it('uses the warning tint for failed entries alone', () => {
      completed({ totals: { ...totals, failed: 1 } });

      expect(strip()?.querySelector('.result--warn')).not.toBeNull();
      expect(stripText()).not.toMatch(/\d warning/);
    });

    it('renders the failed strip as an alert with the message and Retry, using the failed tint', () => {
      startWith({ status: 'failed', error: 'Folder vanished' });

      expect(stripText()).toContain('Import failed');
      expect(stripText()).toContain('Folder vanished');
      expect(stripText()).toContain('Retry');
      expect(strip()?.querySelector('.result--failed')).not.toBeNull();
      expect(strip()?.querySelector('[role="alert"]')).not.toBeNull();
      expect(strip()?.querySelector('.details-toggle')).toBeNull();
    });

    it('reopens the dialog with the echoed request on Retry', async () => {
      startWith({ status: 'failed', error: 'Folder vanished' });

      Array.from(strip()?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        .find((button) => button.textContent?.includes('Retry'))
        ?.click();

      await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(1));
      expect(dialog.open.mock.calls[0][1].data).toEqual({ request });
      expect(dialog.open.mock.calls[0][1].panelClass).toBe('import-dialog-panel');
    });

    describe('failed files', () => {
      const failedFile = file('dist/lingo-import/ja.xliff', 'ja', {
        outcome: 'failed',
        imported: 0,
        updated: 0,
        sourceProblem: 'Not a valid XLIFF file',
      });

      it('tints a completed job whose outcome failed on a file error, with a failed-files clause', () => {
        completed({ outcome: 'failed', files: [result.files[0], failedFile], issues: [] });

        expect(stripText()).toContain('Imported');
        expect(stripText()).toContain('1 file failed');
        expect(strip()?.querySelector('.result--warn')).not.toBeNull();
        expect(strip()?.querySelector('.result--failed')).toBeNull();
      });

      it('tints on a failed outcome even with no per-file detail', () => {
        completed({ outcome: 'failed', issues: [] });

        expect(strip()?.querySelector('.result--warn')).not.toBeNull();
        expect(stripText()).not.toContain('file failed');
      });

      it('keeps a clean outcome green', () => {
        completed({ issues: [] });

        expect(strip()?.querySelector('.result--ok:not(.result--warn)')).not.toBeNull();
      });
    });

    it('tints a completed run that has errors but no failed entries, files or warnings', () => {
      sessionStorage.setItem(
        IMPORT_RUN_STORAGE_KEY,
        JSON.stringify({
          jobId: 'job-1',
          status: 'completed',
          request,
          result: { totals: { imported: 0 }, files: [], errors: ['Write failed'] },
          finishedAt: new Date().toISOString(),
        }),
      );
      store.restoreImportRun();
      fixture.detectChanges();

      expect(strip()?.querySelector('.result--warn')).not.toBeNull();
      expect(strip()?.querySelector('.result--failed')).toBeNull();
    });

    it('tints on truncated errors alone', () => {
      completed({ issues: [], truncated: { issues: 0, icuAutoFixes: 0, warnings: 0, errors: 3 } });

      expect(strip()?.querySelector('.result--warn')).not.toBeNull();
    });

    describe('partial results', () => {
      it('renders a restored completed run that carries only totals and files', () => {
        const partial = { totals, files: [{ path: 'dist/lingo-import/de.xliff', locale: 'de' }] };
        sessionStorage.setItem(
          IMPORT_RUN_STORAGE_KEY,
          JSON.stringify({
            jobId: 'job-1',
            status: 'completed',
            request,
            result: partial,
            finishedAt: new Date().toISOString(),
          }),
        );
        store.restoreImportRun();
        fixture.detectChanges();

        expect(() => {
          strip()?.querySelector<HTMLButtonElement>('.details-toggle')?.click();
          fixture.detectChanges();
        }).not.toThrow();
        const text = stripText();
        expect(text).toContain('683 entries');
        expect(text).toContain('1 file');
        expect(text).toContain('dist/lingo-import/de.xliff');
        expect(text).not.toContain('NaN');
        expect(strip()?.querySelector('.result--ok:not(.result--warn)')).not.toBeNull();
      });
    });

    describe('capped messages', () => {
      it('counts truncated warnings in the headline and notes them in Details', () => {
        completed({
          warnings: ['one', 'two'],
          errors: ['bad'],
          truncated: { issues: 0, icuAutoFixes: 0, warnings: 8, errors: 4 },
        });

        expect(stripText()).toContain('10 warnings');
        openDetails();
        const notes = Array.from(strip()?.querySelectorAll('.more-note') ?? []).map((note) => note.textContent?.trim());
        expect(notes).toEqual(['and 8 more in the summary', 'and 4 more in the summary']);
      });
    });

    describe('details', () => {
      it('lists files, status changes, auto-fixes, issues and files changed', () => {
        completed();
        openDetails();

        const details = detailsText();
        expect(details).toContain('Files');
        expect(details).toContain('dist/lingo-import/de.xliff');
        expect(details).toContain('290 imported');
        expect(details).toContain('393 imported');
        expect(strip()?.querySelector('.locale-pill')?.textContent).toBe('de');
        expect(details).toContain('Status changes');
        expect(details).toContain('New→Translated490');
        expect(details).toContain('—→Verified3');
        expect(details).toContain('Auto-fixes');
        expect(details).toContain('browser.greetingX');
        expect(strip()?.querySelector('.clamp')?.getAttribute('title')).toBe('{nombre} → {name}');
        expect(details).toContain('Files changed');
        expect(details).toContain('sample/alpha/ok/resource_entries.json');
      });

      it('drops status changes that did not change the status', () => {
        completed({
          statusTransitions: [
            { from: 'translated', to: 'translated', count: 5 },
            { from: 'new', to: 'translated', count: 2 },
            { to: 'verified', count: 1 },
          ],
        });
        openDetails();

        const rows = Array.from(strip()?.querySelectorAll('.details-list--status li') ?? []).map((row) =>
          row.textContent?.replace(/\s+/g, ''),
        );
        expect(rows).toEqual(['New→Translated2', '—→Verified1']);
      });

      it('hides Status changes when every transition is a no-op', () => {
        completed({ statusTransitions: [{ from: 'translated', to: 'translated', count: 5 }] });
        openDetails();

        expect(detailsText()).not.toContain('Status changes');
      });

      it('caps Files changed at ten with a note for the rest', () => {
        const paths = Array.from({ length: 22 }, (_, index) => `sample/alpha/k${index}/resource_entries.json`);
        completed({ filesModified: paths });
        openDetails();

        const section = Array.from(strip()?.querySelectorAll('section') ?? []).find((item) =>
          item.textContent?.includes('Files changed'),
        );
        expect(section?.querySelectorAll('li').length).toBe(10);
        expect(section?.querySelector('.more-note')?.textContent?.trim()).toBe('and 12 more in the summary');
      });

      it('shows no note when Files changed fits', () => {
        completed({ filesModified: ['a.json', 'b.json'] });
        openDetails();

        const section = Array.from(strip()?.querySelectorAll('section') ?? []).find((item) =>
          item.textContent?.includes('Files changed'),
        );
        expect(section?.querySelector('.more-note')).toBeNull();
      });

      it('lists failed issues before skipped ones and notes the truncation', () => {
        completed();
        openDetails();

        const keys = Array.from(strip()?.querySelectorAll('.details-list--issues .mono') ?? []).map(
          (item) => item.textContent,
        );
        expect(keys).toEqual(['b.failed', 'a.skipped']);
        expect(detailsText()).toContain('and 7 more in the summary');
      });

      it('lists warnings and errors with the full text on the title', () => {
        completed({ warnings: ['Check the notes'], errors: ['es: cannot read'] });
        openDetails();

        expect(strip()?.querySelector('.details-list--warnings li span')?.getAttribute('title')).toBe(
          'Check the notes',
        );
        expect(strip()?.querySelector('.details-list--errors li span')?.getAttribute('title')).toBe('es: cannot read');
      });

      it('offers Details on a failed job that has errors', () => {
        startWith({ status: 'failed', error: 'Import failed', result: { ...result, errors: ['es: cannot read'] } });
        openDetails();

        expect(strip()?.querySelector('.details-list--errors')).not.toBeNull();
      });
    });

    describe('summary link', () => {
      it('downloads the summary of a fresh completed job', () => {
        completed();
        openDetails();

        const link = strip()?.querySelector<HTMLAnchorElement>('a.summary-link');
        expect(link?.getAttribute('href')).toBe('/api/imports/jobs/job-1/summary');
        expect(link?.hasAttribute('download')).toBe(true);
        expect(link?.textContent).toContain('Download summary (.md)');
      });

      describe('expiry', () => {
        afterEach(() => vi.useRealTimers());

        it('disappears at the retention deadline without the run changing', () => {
          vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
          completed();
          openDetails();
          expect(strip()?.querySelector('a.summary-link')).not.toBeNull();

          vi.advanceTimersByTime(JOB_RETENTION_MS - 1000);
          fixture.detectChanges();
          expect(strip()?.querySelector('a.summary-link')).not.toBeNull();

          vi.advanceTimersByTime(2000);
          fixture.detectChanges();
          expect(strip()?.querySelector('a.summary-link')).toBeNull();
          expect(strip()?.querySelector('.result-details')).not.toBeNull();
        });

        it('is already hidden for a restored run older than the retention window', () => {
          const finishedAt = new Date(Date.now() - JOB_RETENTION_MS - 5000).toISOString();
          sessionStorage.setItem(
            IMPORT_RUN_STORAGE_KEY,
            JSON.stringify({ jobId: 'job-1', status: 'completed', request, result, finishedAt }),
          );
          store.restoreImportRun();
          fixture.detectChanges();
          openDetails();

          expect(strip()?.querySelector('.result-details')).not.toBeNull();
          expect(strip()?.querySelector('a.summary-link')).toBeNull();
        });
      });
    });

    it('restores a persisted import run on init', () => {
      completed();
      const second = createComponent();
      second.detectChanges();

      expect(second.query('[data-testid="import-strip"]')?.textContent).toContain('Imported');
    });

    describe('independent strips', () => {
      const exportRequest: ExportRequestDto = { format: 'xliff', collections: ['alpha'] };
      const startExport = (): void => {
        const job = {
          jobId: 'export-1',
          status: 'running',
          progress: { current: 0, total: 2 },
          request: exportRequest,
        } as const;
        api.startExport.mockReturnValue(of(job));
        api.getExportJob.mockReturnValue(of(job));
        store.startExport(exportRequest).subscribe();
        fixture.detectChanges();
      };

      it('shows both strips, the import one beneath the export one', () => {
        startExport();
        startWith({});

        expect(exportStrip()).not.toBeNull();
        expect(strip()).not.toBeNull();
        expect(exportStrip()?.compareDocumentPosition(strip() as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      });

      it('dismisses the import strip without touching the export strip', () => {
        startExport();
        completed();

        strip()?.querySelector<HTMLButtonElement>('.dismiss')?.click();
        fixture.detectChanges();

        expect(store.importRun()).toBeNull();
        expect(strip()).toBeNull();
        expect(store.exportRun()).not.toBeNull();
        expect(exportStrip()).not.toBeNull();
      });

      it('dismisses the export strip without touching the import strip', () => {
        completed();
        const done = {
          jobId: 'export-1',
          status: 'failed',
          progress: { current: 0, total: 2 },
          request: exportRequest,
          error: 'Disk is full',
        } as const;
        api.startExport.mockReturnValue(of(done));
        api.getExportJob.mockReturnValue(of(done));
        store.startExport(exportRequest).subscribe();
        fixture.detectChanges();

        exportStrip()?.querySelector<HTMLButtonElement>('.dismiss')?.click();
        fixture.detectChanges();

        expect(store.exportRun()).toBeNull();
        expect(store.importRun()).not.toBeNull();
        expect(strip()).not.toBeNull();
      });
    });
  });
});
