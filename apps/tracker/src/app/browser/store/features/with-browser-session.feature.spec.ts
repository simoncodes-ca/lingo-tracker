import { TestBed } from '@angular/core/testing';
import { getState, patchState, signalStore, withMethods } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import { NEVER } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionSettings } from '../../../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../browser.store';
import { withCollectionLifecycle, withCollectionState } from '../collection-reset';
import { initialRootState } from '../root-state';
import { withBrowserSessionFeature } from './with-browser-session.feature';

// This feature is deliberately composed after Browser Session, without editing that feature.
const cancelLoads = vi.fn<() => void>();
const ExtendedSession = signalStore(
  withCollectionLifecycle(),
  withCollectionState(initialRootState),
  withMethods((store) => {
    store._collectionLifecycle.register('close', cancelLoads);
    return {};
  }),
  withBrowserSessionFeature(),
  withCollectionState({ extraCache: ['initial'] }),
);

describe('Browser Session reset registration', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [getTranslocoTestingModule()] }));

  it('resets every state key on the real BrowserStore when a collection opens', () => {
    const store = TestBed.inject(BrowserStore);
    vi.spyOn(TestBed.inject(BrowserApiService), 'getCacheStatus').mockReturnValue(NEVER);
    store.openCollection(collectionSettings({ name: 'a' }));
    const initial = getState(store);
    // Clear every field, including future state slices, without depending on the registry.
    patchState(unprotected(store), () => Object.fromEntries(Object.keys(initial).map((key) => [key, undefined])));
    patchState(unprotected(store), { sessionId: 1, folderDraftId: initial.folderDraftId });
    store.openCollection(collectionSettings({ name: 'b' }));
    expect(getState(store)).toEqual({
      ...initial,
      sessionId: 2,
      selectedCollection: 'b',
      folderDraftId: initial.folderDraftId + 1,
      collectionSettings: collectionSettings({ name: 'b' }),
    });
  });

  it('resets a later feature on every open, including an earlier open of the same collection', () => {
    const store = TestBed.runInInjectionContext(() => new ExtendedSession());
    for (const name of ['a', 'b', 'a']) {
      patchState(unprotected(store), { extraCache: ['from the previous session'] });
      store.openCollection(collectionSettings({ name }));
      expect(store.extraCache()).toEqual(['initial']);
    }
    expect(store.sessionId()).toBe(3);
    expect(cancelLoads).toHaveBeenCalledTimes(3);
  });

  it('runs close, reset, settings patch, restore and ready in order, with hooks isolated per instance', () => {
    const events: string[] = [];
    const OrderedSession = signalStore(
      withCollectionLifecycle(),
      withCollectionState(initialRootState),
      withBrowserSessionFeature(),
      withCollectionState({ extraCache: 'initial' }),
      withMethods((store) => {
        // Register in reverse phase order: execution order belongs to the Browser Session.
        for (const phase of ['ready', 'restore', 'reset', 'close'] as const) {
          store._collectionLifecycle.register(phase, () => {
            events.push(`${phase}:${store.sessionId()}:${store.selectedCollection()}:${store.extraCache()}`);
          });
        }
        store._collectionLifecycle.register('reset', () => events.push('second reset'));
        return {};
      }),
    );
    const store = TestBed.runInInjectionContext(() => new OrderedSession());
    TestBed.runInInjectionContext(() => new OrderedSession());
    store.openCollection(collectionSettings({ name: 'old' }));
    events.length = 0;
    patchState(unprotected(store), { extraCache: 'dirty' });
    store.openCollection(collectionSettings({ name: 'new' }));
    expect(events).toEqual([
      'close:1:old:dirty',
      'reset:0:null:initial',
      'second reset',
      'restore:2:new:initial',
      'ready:2:new:initial',
    ]);
  });

  it('runs every registered feature reset and removes all previous collection state', () => {
    const store = TestBed.inject(BrowserStore);
    vi.spyOn(TestBed.inject(BrowserApiService), 'getCacheStatus').mockReturnValue(NEVER);
    store.openCollection(collectionSettings({ name: 'a' }));
    const initial = getState(store);
    // Give every registered slice foreign data, including fields with object-shaped state.
    patchState(unprotected(store), {
      translations: [
        {
          fullKey: 'old',
          folderPath: '',
          entryKey: 'old',
          base: { locale: 'en', value: 'old' },
          targets: [],
          tags: [],
          inheritedTags: [],
        },
      ],
      searchResults: [
        {
          fullKey: 'old',
          folderPath: '',
          entryKey: 'old',
          base: { locale: 'en', value: 'old' },
          targets: [],
          tags: [],
          inheritedTags: [],
          matchType: 'partial-value',
        },
      ],
      currentFolderPath: 'old',
      error: 'old',
      nonCompactSelectedLocales: ['old'],
      listScope: { kind: 'search', query: 'old' },
      loadedFolderPath: 'old',
      listError: 'old',
      showNestedResources: false,
      isListLoading: true,
      shownScope: { listScope: { kind: 'folder', path: 'old' }, currentFolderPath: 'old' },
      selectedLocales: ['old'],
      selectedStatuses: ['stale'],
      sortField: 'status',
      sortDirection: 'desc',
      rootFolders: [{ name: 'old', fullPath: 'old', loaded: false }],
      folderTreeLoaded: true,
      expandedFolders: new Set(['old']),
      preFilterExpandedFolders: new Set(['old']),
      isRootExpanded: false,
      folderTreeFilter: 'old',
      isFolderTreeLoading: true,
      isAddingFolder: true,
      addFolderParentPath: 'old',
      folderDraftId: 42,
      newlyCreatedFolderPath: 'old',
      isDeletingFolder: true,
      deletingFolderPath: 'old',
      movesInFlight: 3,
      cacheStatus: 'indexing',
      cacheError: 'old',
      collectionStats: { totalKeys: 10, localeCount: 2 },
    });
    store.openCollection(collectionSettings({ name: 'b' }));
    expect(getState(store)).toEqual({
      ...initial,
      sessionId: 2,
      selectedCollection: 'b',
      folderDraftId: 43,
      collectionSettings: collectionSettings({ name: 'b' }),
    });
  });
});
