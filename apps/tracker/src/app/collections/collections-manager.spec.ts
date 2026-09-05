import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { CollectionsManager } from './collections-manager';
import { CollectionsStore } from './store/collections.store';
import { CollectionsApiService } from './services/collections-api.service';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';

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
};

const api = {
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
};

describe('CollectionsManager', () => {
  let fixture: ComponentFixture<CollectionsManager>;
  let component: CollectionsManager;
  let store: InstanceType<typeof CollectionsStore>;

  beforeEach(async () => {
    vi.resetAllMocks();
    api.getConfig.mockReturnValue(of(config));

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CollectionsManager, NoopAnimationsModule, getTranslocoTestingModule()],
      providers: [
        CollectionsStore,
        { provide: CollectionsApiService, useValue: api },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectionsManager);
    component = fixture.componentInstance;
    store = TestBed.inject(CollectionsStore);
    store.loadCollections();
    fixture.detectChanges();
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

  it('navigates to the browser with the collection name encoded', () => {
    const router = TestBed.inject(Router);
    component.navigateToBrowser('a b');

    expect(router.navigate).toHaveBeenCalledWith(['/browser', 'a%20b']);
  });
});
