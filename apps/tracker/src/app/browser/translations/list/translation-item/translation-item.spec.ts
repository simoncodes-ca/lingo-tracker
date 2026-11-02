import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type { ResourceSummaryDto, TranslationStatus } from '@simoncodes-ca/data-transfer';
import { buildResourceSummary } from '@simoncodes-ca/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { collectionSettings } from '../../../../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../../../../testing/transloco-testing.module';
import { BrowserStore } from '../../../store/browser.store';
import { TranslationListStore } from '../store/translation-list.store';
import { TranslationItemHeader } from './item-header';
import { TranslationItem } from './translation-item';

const createItem = createComponentFactory({
  component: TranslationItem,
  imports: [getTranslocoTestingModule()],
  providers: [
    provideHttpClient(),
    provideHttpClientTesting(),
    { provide: MatDialog, useValue: { open: vi.fn() } },
    TranslationListStore,
  ],
  detectChanges: false,
});

function renderTranslationItem(): {
  fixture: ComponentFixture<TranslationItem>;
  component: TranslationItem;
  store: InstanceType<typeof BrowserStore>;
  spectator: Spectator<TranslationItem>;
} {
  // View preferences persist per collection, so a compact locale picked by one
  // test would otherwise be restored by the next.
  localStorage.clear();

  const spectator = createItem();
  return {
    fixture: spectator.fixture,
    component: spectator.component,
    store: spectator.inject(BrowserStore),
    spectator,
  };
}

/**
 * A Resource Summary with base locale `en`. The collection's target locales are the keys
 * of `targets`, in order; each is `[value, status]` (either may be absent).
 */
function summary(
  fullKey: string,
  base: string,
  targets: Record<string, readonly [string | undefined, TranslationStatus | undefined]> = {},
): ResourceSummaryDto {
  const translations: Record<string, string> = {};
  const metadata: Record<string, { checksum: string; status?: TranslationStatus }> = { en: { checksum: 'base' } };
  for (const [locale, [value, status]] of Object.entries(targets)) {
    if (value !== undefined) translations[locale] = value;
    if (status !== undefined) metadata[locale] = { checksum: locale, status };
  }
  return buildResourceSummary(
    fullKey,
    { source: base, translations, metadata },
    { baseLocale: 'en', targetLocales: Object.keys(targets), tags: [] },
  );
}

const mockTranslation = summary('common.buttons.save', 'Save', {
  es: ['Guardar', 'translated'],
  fr: ['Enregistrer', 'verified'],
});

describe('TranslationItem', () => {
  let component: TranslationItem;
  let fixture: ComponentFixture<TranslationItem>;
  let store: InstanceType<typeof BrowserStore>;

  beforeEach(() => {
    ({ fixture, component, store } = renderTranslationItem());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept translation input', () => {
    store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es'], baseLocale: 'en' }));
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.detectChanges();

    expect(component.translation()).toEqual(mockTranslation);
  });

  it('should render placeholder for empty selected locale value', () => {
    const t = summary('k-empty', 'en', { es: ['', 'new'] });

    store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es'], baseLocale: 'en' }));
    store.setDensityMode('compact');
    store.setSelectedLocales(['es']);
    fixture.componentRef.setInput('translation', t);
    fixture.detectChanges();

    expect(component.compactDisplay().value).toBe('');
    const html = fixture.nativeElement.innerHTML as string;
    expect(html).toContain('No translation');
  });

  describe('compact row composition', () => {
    it('shows the base value alone by default', () => {
      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es'], baseLocale: 'en' }));
      store.setDensityMode('compact');
      fixture.componentRef.setInput('translation', mockTranslation);
      fixture.detectChanges();

      const display = component.compactDisplay();
      expect(display.locale).toBe('en');
      expect(display.isBase).toBe(true);
      expect(display.value).toBe('Save');
      // Source text carries no status and no marker
      expect(display.status).toBeUndefined();
      expect(component.hasCompactAnnotation()).toBe(false);

      const html = fixture.nativeElement.innerHTML as string;
      expect(html).toContain('Save');
      expect(html).not.toContain('Guardar');
    });

    it('replaces the base value with the selected locale value, not beside it', () => {
      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es'], baseLocale: 'en' }));
      store.setDensityMode('compact');
      store.setSelectedLocales(['es']);
      fixture.componentRef.setInput('translation', mockTranslation);
      fixture.detectChanges();

      expect(component.compactDisplay().locale).toBe('es');
      expect(component.compactDisplay().value).toBe('Guardar');

      const html = fixture.nativeElement.innerHTML as string;
      expect(html).toContain('Guardar');
      expect(html).not.toContain('>Save<');
    });

    it('hides the status chip for translated and verified rows', () => {
      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es', 'fr'], baseLocale: 'en' }));
      store.setDensityMode('compact');
      store.setSelectedLocales(['es']);
      fixture.componentRef.setInput('translation', mockTranslation);
      fixture.detectChanges();

      expect(component.compactDisplay().status).toBe('translated');
      expect(component.compactDisplay().needsAttention).toBe(false);
      expect(fixture.nativeElement.querySelector('.compact-annotation .status-chip')).toBeNull();

      store.setSelectedLocales(['fr']);
      fixture.detectChanges();
      expect(component.compactDisplay().status).toBe('verified');
      expect(fixture.nativeElement.querySelector('.compact-annotation .status-chip')).toBeNull();
    });

    it('shows the status chip only for new and stale rows', () => {
      const needsWork = summary('common.buttons.save', 'Save', { es: ['Guardar viejo', 'stale'], fr: ['', 'new'] });

      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es', 'fr'], baseLocale: 'en' }));
      store.setDensityMode('compact');
      store.setSelectedLocales(['es']);
      fixture.componentRef.setInput('translation', needsWork);
      fixture.detectChanges();

      expect(component.compactDisplay().needsAttention).toBe(true);
      expect(fixture.nativeElement.querySelector('.compact-annotation .status-chip.status-stale')).not.toBeNull();

      store.setSelectedLocales(['fr']);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.compact-annotation .status-chip.status-new')).not.toBeNull();
    });

    it('falls back to the first locale when the collection carries no base locale', () => {
      // A vendored collection can ship translations with no base locale at all.
      const noBase = summary('agGrid.addToLabels', '', {
        ar: ['إضافة', 'translated'],
        de: ['Hinzufügen', 'translated'],
      });

      store.openCollection(collectionSettings({ name: 'ds', locales: ['ar', 'de'], baseLocale: 'en' }));
      store.setDensityMode('compact');
      fixture.componentRef.setInput('translation', noBase);
      fixture.detectChanges();

      expect(component.compactDisplay().locale).toBe('ar');
      expect(component.compactDisplay().value).toBe('إضافة');
    });

    it('marks a translation that is the source text verbatim', () => {
      const untouched = summary('common.buttons.add', 'Add', { 'fr-ca': ['Add', 'translated'] });

      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'fr-ca'], baseLocale: 'en' }));
      store.setDensityMode('compact');
      store.setSelectedLocales(['fr-ca']);
      fixture.componentRef.setInput('translation', untouched);
      fixture.detectChanges();

      // Status says `translated`; a checksum cannot see that nobody touched it.
      expect(component.compactDisplay().status).toBe('translated');
      expect(component.compactDisplay().isSameAsBase).toBe(true);
      expect(component.hasCompactAnnotation()).toBe(true);
      expect(fixture.nativeElement.querySelector('.compact-annotation .same-as-source')).not.toBeNull();
    });

    it('shows one marker at most: the status chip wins over same-as-source', () => {
      const untouchedNew = summary('common.buttons.add', 'Add', { 'fr-ca': ['Add', 'new'] });

      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'fr-ca'], baseLocale: 'en' }));
      store.setDensityMode('compact');
      store.setSelectedLocales(['fr-ca']);
      fixture.componentRef.setInput('translation', untouchedNew);
      fixture.detectChanges();

      expect(component.compactDisplay().needsAttention).toBe(true);
      expect(component.compactDisplay().isSameAsBase).toBe(false);
      expect(fixture.nativeElement.querySelector('.compact-annotation .status-chip.status-new')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.compact-annotation .same-as-source')).toBeNull();
    });
  });

  it('should use filteredLocales from store (replaces locales input)', () => {
    store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es', 'fr'], baseLocale: 'en' }));
    store.setDensityMode('full');
    store.clearAllLocales();
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.detectChanges();

    expect(store.filteredLocales()).toEqual(['en', 'es', 'fr']);
  });

  it('should use baseLocale from store (replaces baseLocale input)', () => {
    store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'de'], baseLocale: 'de' }));
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.detectChanges();

    expect(store.baseLocale()).toBe('de');
  });
});

describe('TranslationItem - Compact helpers', () => {
  let component: TranslationItem;
  let fixture: ComponentFixture<TranslationItem>;
  let store: InstanceType<typeof BrowserStore>;

  beforeEach(() => {
    ({ fixture, component, store } = renderTranslationItem());
  });

  it('should follow the single compact selection', () => {
    store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es'], baseLocale: 'en' }));
    store.setDensityMode('compact');
    fixture.componentRef.setInput('translation', mockTranslation);
    fixture.detectChanges();

    // The store's compact locale (the base locale until one is picked) is what the row view gets.
    expect(store.compactDisplayLocale()).toBe('en');
    expect(component.compactDisplay()).toMatchObject({ locale: 'en', isBase: true, value: 'Save' });

    store.setSelectedLocales(['es']);
    fixture.detectChanges();
    expect(store.compactDisplayLocale()).toBe('es');
    expect(component.compactDisplay()).toMatchObject({ locale: 'es', isBase: false, value: 'Guardar' });

    store.setSelectedLocales(['en']);
    fixture.detectChanges();
    expect(component.compactDisplay().value).toBe('Save');
  });

  it('statusBreakdown should return human readable counts in priority order', () => {
    const t = summary('k3', 'a', { es: ['b', 'stale'], fr: ['c', 'verified'], de: ['d', 'new'] });

    store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es', 'fr', 'de'], baseLocale: 'en' }));
    store.setDensityMode('full');
    store.clearAllLocales();
    fixture.componentRef.setInput('translation', t);
    fixture.detectChanges();

    // The test harness has no translations loaded, so each part comes back as its
    // resource key. Assert the contract — worst status first, zero counts omitted —
    // rather than the English wording, which lives in the resource file.
    const breakdown = component.statusBreakdown();

    expect(breakdown).toContain(TRACKER_TOKENS.BROWSER.STATUS.STALECOUNTX);
    expect(breakdown).toContain(TRACKER_TOKENS.BROWSER.STATUS.VERIFIEDCOUNTX);
    expect(breakdown).not.toContain(TRACKER_TOKENS.BROWSER.STATUS.TRANSLATEDCOUNTX);
    expect(breakdown.indexOf(TRACKER_TOKENS.BROWSER.STATUS.STALECOUNTX)).toBeLessThan(
      breakdown.indexOf(TRACKER_TOKENS.BROWSER.STATUS.NEWCOUNTX),
    );
  });
});

// Tests for full density mode expansion logic
describe('TranslationItem - Full density expansion', () => {
  let component: TranslationItem;
  let fixture: ComponentFixture<TranslationItem>;
  let spectator: Spectator<TranslationItem>;
  let store: InstanceType<typeof BrowserStore>;

  beforeEach(() => {
    ({ fixture, component, store, spectator } = renderTranslationItem());

    store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es', 'fr'], baseLocale: 'en' }));
    store.setDensityMode('full');
    store.clearAllLocales();
  });

  it('needsExpansion should be false for short values', () => {
    const t = summary('k-short', 'short', { es: ['corto', undefined], fr: ['court', undefined] });

    fixture.componentRef.setInput('translation', t);
    fixture.detectChanges();

    expect(component.needsExpansion()).toBe(false);
  });

  it('needsExpansion should be true when locale rows are withheld by the collapsed state', () => {
    store.openCollection(
      collectionSettings({
        name: 'test',
        locales: ['en', 'es', 'fr', 'de', 'ja', 'ru'],
        baseLocale: 'en',
      }),
    );
    store.clearAllLocales();

    const t = summary('k-many-locales', 'short', {
      es: ['corto', undefined],
      fr: ['court', undefined],
      de: ['kurz', undefined],
      ja: ['短い', undefined],
      ru: ['коротко', undefined],
    });

    fixture.componentRef.setInput('translation', t);
    fixture.detectChanges();

    // 5 non-base locales, 4 rows visible while collapsed
    expect(component.hiddenLocaleCount()).toBe(1);
    expect(component.visibleLocaleTranslations().length).toBe(4);
    expect(component.needsExpansion()).toBe(true);

    component.toggleExpansion();
    fixture.detectChanges();

    expect(component.hiddenLocaleCount()).toBe(0);
    expect(component.visibleLocaleTranslations().length).toBe(5);
    expect(component.needsExpansion()).toBe(true);
  });

  it('needsExpansion should be true when any locale value long', () => {
    const long = 'b'.repeat(205);
    const t = summary('k-long-locale', 'en', { es: [long, undefined], fr: ['fr', undefined] });

    fixture.componentRef.setInput('translation', t);
    fixture.detectChanges();

    expect(component.needsExpansion()).toBe(true);
  });

  it('isExpanded should toggle when toggleExpansion called', () => {
    fixture.componentRef.setInput('translation', summary('k', 'en'));
    fixture.detectChanges();

    expect(component.isExpanded()).toBe(false);
    component.toggleExpansion();
    expect(component.isExpanded()).toBe(true);
    component.toggleExpansion();
    expect(component.isExpanded()).toBe(false);
  });

  describe('full-density source row', () => {
    it('should expose the base locale as the source row', () => {
      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es'], baseLocale: 'en' }));
      store.setDensityMode('full');
      fixture.componentRef.setInput('translation', mockTranslation);
      fixture.detectChanges();

      expect(component.baseRow()).toEqual({ locale: 'en', value: 'Save' });
    });

    it('should render the source in the same grid as the translations', () => {
      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es', 'fr'], baseLocale: 'en' }));
      store.setDensityMode('full');
      fixture.componentRef.setInput('translation', mockTranslation);
      fixture.detectChanges();

      const grid = fixture.nativeElement.querySelector('.locale-translations');
      expect(grid).toBeDefined();

      const baseValue = grid?.querySelector('.locale-value--base');
      expect(baseValue).toBeDefined();
      expect(baseValue?.textContent?.trim()).toBe('Save');

      // The source must be the grid's first line, so the reader meets it before
      // the translations it is the reference for.
      expect(grid?.firstElementChild?.classList.contains('locale-line--base')).toBe(true);
    });

    it('should omit the source row when the collection has no base value', () => {
      const t = summary('k-no-base', '', { es: ['Guardar', 'translated'] });

      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es'], baseLocale: 'en' }));
      store.setDensityMode('full');
      fixture.componentRef.setInput('translation', t);
      fixture.detectChanges();

      expect(component.baseRow()).toBeUndefined();
      expect(fixture.nativeElement.querySelector('.locale-value--base')).toBeNull();
    });
  });

  describe('double-click to edit', () => {
    beforeEach(() => {
      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es', 'fr'], baseLocale: 'en' }));
      fixture.componentRef.setInput('translation', mockTranslation);
    });

    function dblclick(el: Element | null): void {
      expect(el).not.toBeNull();
      el?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }

    it('leaves a double-click on the compact value to the browser text selection', () => {
      store.setDensityMode('compact');
      fixture.detectChanges();
      const editSpy = vi
        .spyOn(spectator.inject(TranslationListStore, true), 'editTranslation')
        .mockImplementation(() => undefined);

      dblclick(fixture.nativeElement.querySelector('.compact-value'));

      expect(editSpy).not.toHaveBeenCalled();
    });

    it('leaves a double-click on a full-density value to the browser text selection', () => {
      store.setDensityMode('full');
      fixture.detectChanges();
      const editSpy = vi
        .spyOn(spectator.inject(TranslationListStore, true), 'editTranslation')
        .mockImplementation(() => undefined);

      dblclick(fixture.nativeElement.querySelector('.locale-value--base'));
      dblclick(fixture.nativeElement.querySelector('.locale-line:not(.locale-line--base) .locale-value'));

      expect(editSpy).not.toHaveBeenCalled();
    });

    it('opens the editor on a double-click of the header', () => {
      store.setDensityMode('full');
      fixture.detectChanges();
      const editSpy = vi
        .spyOn(spectator.inject(TranslationListStore, true), 'editTranslation')
        .mockImplementation(() => undefined);

      dblclick(fixture.nativeElement.querySelector('.item-header'));

      expect(editSpy).toHaveBeenCalledOnce();
    });
  });

  describe('read-only collections', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('translation', mockTranslation);
    });

    it('should pass the entry to the Delete action when the collection is read-only', () => {
      store.openCollection(
        collectionSettings({
          name: 'vendored',
          locales: ['en', 'es'],
          baseLocale: 'en',
          readOnly: true,
        }),
      );
      fixture.detectChanges();

      const listStore = spectator.inject(TranslationListStore, true);
      const deleteSpy = vi.spyOn(listStore, 'deleteTranslation');

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Delete' }));

      expect(deleteSpy).toHaveBeenCalledWith(mockTranslation);
    });

    it('should run the Delete shortcut when the collection is writable', () => {
      store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es'], baseLocale: 'en' }));
      fixture.detectChanges();

      const listStore = spectator.inject(TranslationListStore, true);
      const deleteSpy = vi.spyOn(listStore, 'deleteTranslation').mockImplementation(() => undefined);

      component.onKeyDown(new KeyboardEvent('keydown', { key: 'Delete' }));

      expect(deleteSpy).toHaveBeenCalledWith(mockTranslation);
    });

    it('should show a lock in place of the drag handle when the collection is read-only', () => {
      store.openCollection(
        collectionSettings({
          name: 'vendored',
          locales: ['en', 'es'],
          baseLocale: 'en',
          readOnly: true,
        }),
      );
      fixture.detectChanges();

      const handle = fixture.nativeElement.querySelector('.translation-drag-handle');
      expect(handle).toBeDefined();
      expect(handle?.textContent?.trim()).toBe('lock');
      expect(handle?.classList.contains('translation-drag-handle--locked')).toBe(true);
    });
  });
});

/**
 * Compact rows are almost entirely the key chip and the selectable value, so the
 * chip is the only chrome left to carry the row's gestures: single click copies,
 * double click edits, and the two must not run into each other.
 */
describe('TranslationItem - compact key chip', () => {
  let fixture: ComponentFixture<TranslationItem>;
  let spectator: Spectator<TranslationItem>;
  let store: InstanceType<typeof BrowserStore>;

  const longKey = summary('browser.translationEditor.context.allUpToDate', 'Everything is up to date');

  beforeEach(() => {
    ({ fixture, store, spectator } = renderTranslationItem());
    store.openCollection(collectionSettings({ name: 'test', locales: ['en', 'es'], baseLocale: 'en' }));
    store.setDensityMode('compact');
  });

  function render(translation: ResourceSummaryDto = mockTranslation): void {
    fixture.componentRef.setInput('translation', translation);
    fixture.detectChanges();
  }

  function chip(): HTMLElement {
    const el = fixture.nativeElement.querySelector('.key-chip');
    expect(el).not.toBeNull();
    return el as HTMLElement;
  }

  /** A real click carries a detail count; the browser raises it per click in a sequence. */
  function click(el: Element, detail = 1): void {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
  }

  it('copies the key on a single click', () => {
    render();
    const copySpy = vi
      .spyOn(spectator.inject(TranslationListStore, true), 'copyKey')
      .mockImplementation(() => undefined);

    click(chip(), 1);

    expect(copySpy).toHaveBeenCalledOnce();
    expect(copySpy).toHaveBeenCalledWith(mockTranslation);
  });

  it('copies the key on Enter, which fires a click with no detail count', () => {
    render();
    const copySpy = vi
      .spyOn(spectator.inject(TranslationListStore, true), 'copyKey')
      .mockImplementation(() => undefined);

    click(chip(), 0);

    expect(copySpy).toHaveBeenCalledOnce();
  });

  it('passes the entry from the header to the Delete action', () => {
    render();
    const listStore = spectator.inject(TranslationListStore, true);
    const deleteSpy = vi.spyOn(listStore, 'deleteTranslation').mockResolvedValue(undefined);
    const header = fixture.debugElement.query(By.directive(TranslationItemHeader))?.componentInstance as
      | TranslationItemHeader
      | undefined;

    header?.onDelete();

    expect(header).toBeDefined();
    expect(deleteSpy).toHaveBeenCalledWith(mockTranslation);
  });

  it('passes the entry from the header to the Translate action', () => {
    render();
    const listStore = spectator.inject(TranslationListStore, true);
    const translateSpy = vi.spyOn(listStore, 'translateResource').mockImplementation(() => undefined);
    const header = fixture.debugElement.query(By.directive(TranslationItemHeader))?.componentInstance as
      | TranslationItemHeader
      | undefined;

    header?.onTranslate();

    expect(header).toBeDefined();
    expect(translateSpy).toHaveBeenCalledWith(mockTranslation);
  });

  it('opens the editor on a double-click of the key chip, copying only once', () => {
    render();
    const listStore = spectator.inject(TranslationListStore, true);
    const copySpy = vi.spyOn(listStore, 'copyKey').mockImplementation(() => undefined);
    const editSpy = vi.spyOn(listStore, 'editTranslation').mockImplementation(() => undefined);

    // The browser's real sequence: click, click, dblclick.
    const target = chip();
    click(target, 1);
    click(target, 2);
    target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(editSpy).toHaveBeenCalledOnce();
    expect(copySpy).toHaveBeenCalledOnce();
  });

  it('does not open the editor on a double-click of the value', () => {
    render();
    const editSpy = vi
      .spyOn(spectator.inject(TranslationListStore, true), 'editTranslation')
      .mockImplementation(() => undefined);

    fixture.nativeElement.querySelector('.compact-value')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(editSpy).not.toHaveBeenCalled();
  });

  it('offers Edit as a visible button in the compact rail', () => {
    render();
    const editSpy = vi
      .spyOn(spectator.inject(TranslationListStore, true), 'editTranslation')
      .mockImplementation(() => undefined);

    const button = fixture.nativeElement.querySelector('.edit-action');
    expect(button).not.toBeNull();
    expect(button?.querySelector('mat-icon')?.textContent?.trim()).toBe('edit');

    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

    expect(editSpy).toHaveBeenCalledOnce();
  });

  it('shows the read-only collection a view control instead of an edit control', () => {
    store.openCollection(
      collectionSettings({
        name: 'vendored',
        locales: ['en', 'es'],
        baseLocale: 'en',
        readOnly: true,
      }),
    );
    store.setDensityMode('compact');
    render();

    const button = fixture.nativeElement.querySelector('.edit-action');
    expect(button?.querySelector('mat-icon')?.textContent?.trim()).toBe('visibility');
  });

  /** Opens the ⋮ menu and returns the labels of its items from the CDK overlay. */
  function openOverflowMenu(): string[] {
    const trigger = fixture.nativeElement.querySelector(
      '.header-actions button[aria-haspopup="menu"], .header-actions button[aria-haspopup]',
    ) as HTMLElement | null;
    expect(trigger).not.toBeNull();
    trigger?.click();
    fixture.detectChanges();

    return Array.from(document.querySelectorAll('.mat-mdc-menu-item'), (item) => item.textContent?.trim() ?? '');
  }

  it('drops Edit from the compact overflow menu now that the rail shows it', () => {
    render();

    expect(openOverflowMenu().some((label) => label.includes('Edit'))).toBe(false);
  });

  it('keeps Edit in the full-density overflow menu, which has no rail button', () => {
    store.setDensityMode('full');
    render();

    expect(fixture.nativeElement.querySelector('.edit-action')).toBeNull();
    expect(openOverflowMenu().some((label) => label.includes('Edit'))).toBe(true);
  });

  describe('middle truncation', () => {
    it('splits a long key so the leaf segment survives intact', () => {
      render(longKey);

      const head = fixture.nativeElement.querySelector('.key-text__head');
      const tail = fixture.nativeElement.querySelector('.key-text__tail');
      expect(head).not.toBeNull();
      expect(tail).not.toBeNull();

      // The tail is the part CSS must never clip.
      expect(tail?.textContent).toBe('.allUpToDate');
      expect(head?.textContent).toBe('browser.translationEditor.context');
      // Nothing is elided in the string itself — the column width decides.
      expect(`${head?.textContent}${tail?.textContent}`).toBe(longKey.fullKey);
    });

    it('leaves a short key whole, with no ellipsis of its own', () => {
      render();

      const head = fixture.nativeElement.querySelector('.key-text__head');
      const tail = fixture.nativeElement.querySelector('.key-text__tail');
      expect(`${head?.textContent}${tail?.textContent}`).toBe('common.buttons.save');
      expect(fixture.nativeElement.querySelector('.key-text')?.textContent).not.toContain('…');
      expect(fixture.nativeElement.querySelector('.key-text')?.textContent).not.toContain('...');
    });

    it('renders a key with no separator as a head alone', () => {
      render(summary('standalone', 'Alone'));

      expect(fixture.nativeElement.querySelector('.key-text__head')?.textContent).toBe('standalone');
      expect(fixture.nativeElement.querySelector('.key-text__tail')).toBeNull();
    });

    it('highlights a search match that straddles the head/tail boundary', () => {
      store.showQuery('context.allUp');
      render(longKey);

      const head = fixture.nativeElement.querySelector('.key-text__head');
      const tail = fixture.nativeElement.querySelector('.key-text__tail');
      expect(head?.querySelector('mark.search-highlight')?.textContent).toBe('context');
      expect(tail?.querySelector('mark.search-highlight')?.textContent).toBe('.allUp');
    });
  });
});
