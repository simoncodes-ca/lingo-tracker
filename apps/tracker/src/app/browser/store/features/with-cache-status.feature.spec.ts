import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { CacheStatusDto } from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionSettings } from '../../../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { ApiError } from '../../../shared/api-error/api-error';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../browser.store';
import { withCollectionLifecycle } from '../collection-reset';
import { withCacheStatusFeature } from './with-cache-status.feature';

const CacheStore = signalStore(
  withCollectionLifecycle(),
  withState<{ selectedCollection: string | null; folderTreeLoaded: boolean }>({
    selectedCollection: 'c',
    folderTreeLoaded: false,
  }),
  withProps(() => ({ listLoaded: signal(false) })),
  withMethods(() => ({ loadRootFolders: vi.fn<() => void>(), reloadList: vi.fn<() => void>() })),
  withCacheStatusFeature(),
);

describe('withCacheStatusFeature', () => {
  const getCacheStatus = vi.fn<(collection: string) => ReturnType<BrowserApiService['getCacheStatus']>>();
  let store: InstanceType<typeof CacheStore>;
  beforeEach(() => {
    vi.useFakeTimers();
    getCacheStatus.mockReset();
    TestBed.configureTestingModule({
      imports: [getTranslocoTestingModule()],
      providers: [{ provide: BrowserApiService, useValue: { getCacheStatus } }],
    });
    store = TestBed.runInInjectionContext(() => new CacheStore());
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('requests cache status synchronously when a collection opens', () => {
    getCacheStatus.mockReturnValue(new Subject<CacheStatusDto>());
    const browser = TestBed.inject(BrowserStore);
    browser.openCollection(collectionSettings({ name: 'c' }));
    expect(getCacheStatus).toHaveBeenCalledWith('c');
    expect(browser.cacheStatus()).toBe('not-started');
    expect(browser.isCacheIndexing()).toBe(true);
  });

  it('shows not-started synchronously, patches each status, and loads on ready', () => {
    const firstStatus = new Subject<CacheStatusDto>();
    getCacheStatus
      .mockReturnValueOnce(firstStatus)
      .mockReturnValueOnce(of({ status: 'ready', stats: { totalKeys: 12, localeCount: 2 } }));
    store.checkCacheStatus();
    expect(store.cacheStatus()).toBe('not-started');
    expect(store.isCacheIndexing()).toBe(true);
    expect(store.hasCollectionStats()).toBe(false);
    firstStatus.next({ status: 'indexing' });
    firstStatus.complete();
    expect(store.cacheStatus()).toBe('indexing');
    expect(store.reloadList).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(store.isCacheReady()).toBe(true);
    expect(store.isCacheIndexing()).toBe(false);
    expect(store.collectionTotalKeys()).toBe(12);
    expect(store.collectionLocaleCount()).toBe(2);
    expect(store.reloadList).toHaveBeenCalledOnce();
    expect(store.loadRootFolders).toHaveBeenCalledOnce();
  });

  it('does not reload content that already loaded in the session', () => {
    patchState(unprotected(store), { folderTreeLoaded: true });
    store.listLoaded.set(true);
    getCacheStatus.mockReturnValue(of({ status: 'ready' }));
    store.checkCacheStatus();
    expect(store.reloadList).not.toHaveBeenCalled();
    expect(store.loadRootFolders).not.toHaveBeenCalled();
  });

  it('shows the index server error and Retry starts another wait', () => {
    getCacheStatus
      .mockReturnValueOnce(of({ status: 'error', error: 'Index failed' }))
      .mockReturnValueOnce(new Subject<CacheStatusDto>());
    store.checkCacheStatus();
    expect(store.cacheStatus()).toBe('error');
    expect(store.cacheError()).toBe('Index failed');
    expect(store.collectionStats()).toBeNull();
    store.checkCacheStatus();
    expect(store.cacheStatus()).toBe('not-started');
    expect(store.cacheError()).toBeNull();
    getCacheStatus.mockReturnValue(of({ status: 'ready' }));
    vi.advanceTimersByTime(2000);
    expect(store.isCacheReady()).toBe(true);
  });

  it('leaves a missing index error message to the overlay default', () => {
    getCacheStatus.mockReturnValue(of({ status: 'error' }));
    store.checkCacheStatus();
    expect(store.cacheStatus()).toBe('error');
    expect(store.cacheError()).toBeNull();
  });

  it('keeps stats and the server message from the final index error status', () => {
    const stats = { totalKeys: 12, localeCount: 2 };
    getCacheStatus.mockReturnValue(of({ status: 'error', error: 'Index failed', stats }));
    store.checkCacheStatus();
    expect(store.cacheStatus()).toBe('error');
    expect(store.cacheError()).toBe('Index failed');
    expect(store.collectionStats()).toEqual(stats);
    vi.advanceTimersByTime(10000);
    expect(getCacheStatus).toHaveBeenCalledOnce();
    expect(store.reloadList).not.toHaveBeenCalled();
    expect(store.loadRootFolders).not.toHaveBeenCalled();
  });

  it('keeps stats with cacheError null when the final index error message is empty', () => {
    const stats = { totalKeys: 12, localeCount: 2 };
    getCacheStatus.mockReturnValue(of({ status: 'error', error: '', stats }));
    store.checkCacheStatus();
    expect(store.cacheStatus()).toBe('error');
    expect(store.cacheError()).toBeNull();
    expect(store.collectionStats()).toEqual(stats);
    vi.advanceTimersByTime(10000);
    expect(getCacheStatus).toHaveBeenCalledOnce();
  });

  it('shows an HTTP error message', () => {
    getCacheStatus.mockReturnValue(
      throwError(() => new ApiError({ kind: 'other', status: 500, serverMessage: 'Unavailable' })),
    );
    store.checkCacheStatus();
    expect(store.cacheStatus()).toBe('error');
    expect(store.cacheError()).toBe('Unavailable');
  });

  it('cancels the previous wait when the collection changes', () => {
    const previous = new Subject<CacheStatusDto>();
    const next = new Subject<CacheStatusDto>();
    getCacheStatus.mockReturnValueOnce(previous).mockReturnValueOnce(next);
    store.checkCacheStatus();
    patchState(unprotected(store), { selectedCollection: 'next' });
    store.checkCacheStatus();
    previous.next({ status: 'error', error: 'Old session' });
    expect(store.cacheStatus()).toBe('not-started');
    expect(getCacheStatus).toHaveBeenLastCalledWith('next');
    next.next({ status: 'ready' });
    expect(store.isCacheReady()).toBe(true);
    expect(store.cacheError()).toBeNull();
  });
});
