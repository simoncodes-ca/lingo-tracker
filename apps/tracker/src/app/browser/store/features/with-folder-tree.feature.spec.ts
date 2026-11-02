import { TestBed } from '@angular/core/testing';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../browser.store';

const node = (path: string): FolderNodeDto => ({ name: path.split('.').pop() ?? '', fullPath: path, loaded: false });

describe('Folder Tree cache edits', () => {
  let store: InstanceType<typeof BrowserStore>;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [getTranslocoTestingModule()] });
    store = TestBed.inject(BrowserStore);
  });

  it('inserts folders and deletes only the subtree and its expansion', () => {
    store.mirrorWrite({ kind: 'folder-created', folder: node('a'), parentPath: null });
    store.mirrorWrite({ kind: 'folder-created', folder: node('ab'), parentPath: null });
    patchState(unprotected(store), {
      currentFolderPath: 'a.child',
      expandedFolders: new Set(['a', 'a.child', 'ab']),
    });
    store.mirrorWrite({ kind: 'folder-removed', path: 'a' });
    expect(store.currentFolderPath()).toBe('');
    expect(store.rootFolders().map((folder) => folder.fullPath)).toEqual(['ab']);
    expect([...store.expandedFolders()]).toEqual(['ab']);
    patchState(unprotected(store), { currentFolderPath: 'ab' });
    store.mirrorWrite({ kind: 'folder-removed', path: 'a' });
    expect(store.currentFolderPath()).toBe('ab');
    store.mirrorWrite({ kind: 'folder-removed', path: 'ab' });
    expect(store.currentFolderPath()).toBe('');
  });

  it('restores only a detached node and preserves newer tree data and existing copies', () => {
    store.mirrorWrite({ kind: 'folder-created', folder: node('a'), parentPath: null });
    const removed = store.beginMirrorMove({ kind: 'folder', path: 'a' });
    store.mirrorWrite({ kind: 'folder-created', folder: node('newer'), parentPath: null });
    store.rollbackMirrorMove(removed);
    expect(store.rootFolders().map((folder) => folder.fullPath)).toEqual(['a', 'newer']);
    store.rollbackMirrorMove(removed);
    expect(store.rootFolders()).toHaveLength(2);
    store.rollbackMirrorMove(store.beginMirrorMove({ kind: 'folder', path: 'missing' }));
    expect(store.rootFolders()).toHaveLength(2);
  });

  it('does not restore a child into a parent that a newer load leaves unloaded', () => {
    patchState(unprotected(store), {
      rootFolders: [
        {
          ...node('a'),
          loaded: true,
          tree: {
            path: 'a',
            resources: [],
            children: [node('a.child')],
          },
        },
      ],
    });
    const removed = store.beginMirrorMove({ kind: 'folder', path: 'a.child' });
    patchState(unprotected(store), { rootFolders: [node('a')] });
    store.rollbackMirrorMove(removed);
    expect(store.rootFolders()).toEqual([node('a')]);
  });

  it('applies a move against the current tree, rebases expansion and navigates', () => {
    patchState(unprotected(store), { rootFolders: [node('a'), node('b')], expandedFolders: new Set(['a']) });
    const removed = store.beginMirrorMove({ kind: 'folder', path: 'a' });
    patchState(unprotected(store), { selectedCollection: 'app' });
    const load = vi.spyOn(TestBed.inject(BrowserApiService), 'getResourceTree').mockReturnValue(
      of({
        path: 'b',
        resources: [],
        children: [node('b.a')],
      }),
    );
    store.mirrorWrite({ kind: 'folder-moved', rollback: removed, destinationPath: 'b' });
    expect([...store.expandedFolders()]).toEqual(['b.a', 'b']);
    expect(load).toHaveBeenCalledWith('app', 'b', true);
    expect(store.rootFolders()[0]?.tree?.children).toEqual([node('b.a')]);
    expect(store.currentFolderPath()).toBe('b.a');
  });

  it('reloads the root when a moved source was absent from the cache', () => {
    const api = TestBed.inject(BrowserApiService);
    const load = vi
      .spyOn(api, 'getResourceTree')
      .mockReturnValue(of({ path: '', resources: [], children: [node('a')] }));
    patchState(unprotected(store), { selectedCollection: 'app' });
    const rollback = store.beginMirrorMove({ kind: 'folder', path: 'a' });
    store.mirrorWrite({ kind: 'folder-moved', rollback, destinationPath: '' });
    expect(store.currentFolderPath()).toBe('a');
    expect(load).toHaveBeenCalledWith('app', '', false);
    expect(store.rootFolders()).toEqual([node('a')]);
  });
});
