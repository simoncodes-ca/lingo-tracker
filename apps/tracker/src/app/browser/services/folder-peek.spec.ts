import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { ResourceTreeDto } from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { toApiError } from '../../shared/api-error/api-error';
import { BrowserStore } from '../store/browser.store';
import { BrowserApiService } from './browser-api.service';
import { FolderPeek } from './folder-peek';

describe('FolderPeek', () => {
  const apiError = () => toApiError(new HttpErrorResponse({ status: 500, error: { message: 'failed' } }));
  let peeks: FolderPeek;
  let store: InstanceType<typeof BrowserStore>;
  const tree: ResourceTreeDto = { path: 'common', resources: [], children: [] };
  const getResourceTree = vi.fn();

  beforeEach(() => {
    getResourceTree.mockReset();
    TestBed.configureTestingModule({
      imports: [getTranslocoTestingModule()],
      providers: [{ provide: BrowserApiService, useValue: { getResourceTree } }],
    });
    peeks = TestBed.inject(FolderPeek);
    store = TestBed.inject(BrowserStore);
  });

  it('shares an in-flight folder peek and caches its entries for one scope', () => {
    const pending = new Subject<ResourceTreeDto>();
    getResourceTree.mockReturnValue(pending);
    const scope = peeks.openFolderPeek();
    const first = vi.fn();
    const second = vi.fn();
    scope.peekFolder('main', 'common').subscribe(first);
    scope.peekFolder('main', 'common').subscribe(second);

    expect(getResourceTree).toHaveBeenCalledTimes(1);
    expect(scope.loadingFolders().has('common')).toBe(true);
    pending.next({ ...tree, resources: [entry('common.ok')] });
    pending.complete();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(scope.folderEntries().get('common')).toEqual(['ok']);
    expect(scope.loadingFolders().has('common')).toBe(false);
    scope.peekFolder('main', 'common').subscribe();
    expect(getResourceTree).toHaveBeenCalledTimes(1);
  });

  it('drops a previous session response and starts a fresh peek', () => {
    const old = new Subject<ResourceTreeDto>();
    getResourceTree.mockReturnValueOnce(old).mockReturnValueOnce(of(tree));
    const scope = peeks.openFolderPeek();
    const received = vi.fn();
    scope.peekFolder('main', 'common').subscribe(received);
    patchState(unprotected(store), { sessionId: store.sessionId() + 1 });
    old.next(tree);
    old.complete();

    expect(received).not.toHaveBeenCalled();
    expect(scope.folderEntries().has('common')).toBe(false);
    peeks.openFolderPeek().peekFolder('main', 'common').subscribe(received);
    expect(getResourceTree).toHaveBeenCalledTimes(2);
    expect(received).toHaveBeenCalledTimes(1);
  });

  it('keeps folder peeks scoped to their collection', () => {
    getResourceTree.mockReturnValue(of(tree));
    const scope = peeks.openFolderPeek();
    scope.peekFolder('first', 'common').subscribe();
    scope.peekFolder('second', 'common').subscribe();
    expect(getResourceTree).toHaveBeenCalledTimes(2);
    expect(getResourceTree).toHaveBeenNthCalledWith(1, 'first', 'common', false);
    expect(getResourceTree).toHaveBeenNthCalledWith(2, 'second', 'common', false);
  });

  it('does not cache a failed folder peek', () => {
    getResourceTree.mockReturnValueOnce(throwError(apiError)).mockReturnValueOnce(of(tree));
    const scope = peeks.openFolderPeek();
    scope.peekFolder('main', 'common').subscribe({ error: () => undefined });
    scope.peekFolder('main', 'common').subscribe();
    expect(getResourceTree).toHaveBeenCalledTimes(2);
    expect(scope.folderEntries().has('common')).toBe(true);
  });

  it('refetches after a write opens a new dialog scope', () => {
    getResourceTree
      .mockReturnValueOnce(of(tree))
      .mockReturnValueOnce(of({ ...tree, resources: [entry('common.new')] }));
    const oldDialog = peeks.openFolderPeek();
    oldDialog.peekFolder('main', 'common').subscribe();
    const newDialog = peeks.openFolderPeek();
    newDialog.peekFolder('main', 'common').subscribe();

    expect(getResourceTree).toHaveBeenCalledTimes(2);
    expect(oldDialog.folderEntries().get('common')).toEqual([]);
    expect(newDialog.folderEntries().get('common')).toEqual(['new']);
  });

  it('deduplicates an in-flight read across two scopes without retaining its result', () => {
    const pending = new Subject<ResourceTreeDto>();
    getResourceTree.mockReturnValueOnce(pending).mockReturnValueOnce(of(tree));
    peeks.openFolderPeek().peekFolder('main', 'common').subscribe();
    peeks.openFolderPeek().peekFolder('main', 'common').subscribe();
    expect(getResourceTree).toHaveBeenCalledTimes(1);
    pending.next(tree);
    pending.complete();
    peeks.openFolderPeek().peekFolder('main', 'common').subscribe();
    expect(getResourceTree).toHaveBeenCalledTimes(2);
  });

  function entry(fullKey: string): ResourceTreeDto['resources'][number] {
    return {
      fullKey,
      folderPath: 'common',
      entryKey: fullKey.split('.').at(-1) ?? fullKey,
      base: { locale: 'en', value: 'Value' },
      targets: [],
      tags: [],
      inheritedTags: [],
    };
  }
});
