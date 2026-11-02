import { describe, expect, it, vi } from 'vitest';
import { openCollection } from '../config/open-collection';
import { ResourceTreeIndex } from './resource-tree-index';
import type { ResourceTreeEntry, ResourceTreeNode } from './resource-tree-types';
import type { TreeFingerprint } from './tree-fingerprint';
import * as treeFingerprint from './tree-fingerprint';

const collection = openCollection(
  {
    exportFolder: 'export',
    importFolder: 'import',
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: { main: { translationsFolder: 'main' } },
  },
  'main',
);
const translationsFolder = collection.translationsFolder;
const entry = (key: string, source = key): ResourceTreeEntry => ({
  key,
  source,
  translations: {},
  metadata: {},
});
const emptyTree = (): ResourceTreeNode => ({
  folderPathSegments: [],
  resources: [],
  children: [],
});
const fingerprint: TreeFingerprint = {
  fileCount: 2,
  folderCount: 1,
  totalSize: 50,
  maxMtimeMs: 100,
};

describe('ResourceTreeIndex without disk', () => {
  it('upserts into new folders, sorts siblings and resources, and replaces entries in place', () => {
    const index = new ResourceTreeIndex(collection, emptyTree());
    expect(
      index.apply({
        kind: 'upsert',
        translationsFolder,
        key: 'z.b',
        entry: entry('b'),
      }),
    ).toEqual({ kind: 'patched' });
    index.apply({
      kind: 'upsert',
      translationsFolder,
      key: 'z.a',
      entry: entry('a'),
    });
    index.apply({
      kind: 'upsert',
      translationsFolder,
      key: 'a.deep.c',
      entry: entry('c'),
    });
    index.apply({
      kind: 'upsert',
      translationsFolder,
      key: 'z.b',
      entry: entry('b', 'Updated'),
    });
    expect(index.subtree()?.children.map((child) => child.name)).toEqual(['a', 'z']);
    expect(index.subtree('z')?.resources).toEqual([entry('a'), entry('b', 'Updated')]);
    expect(index.subtree('a.deep')?.folderPathSegments).toEqual(['a', 'deep']);
    expect(index.totalKeys).toBe(3);
  });

  it('removes a resource while retaining its folder and other entries', () => {
    const index = new ResourceTreeIndex(collection, emptyTree());
    index.apply({
      kind: 'upsert',
      translationsFolder,
      key: 'a',
      entry: entry('a'),
    });
    index.apply({
      kind: 'upsert',
      translationsFolder,
      key: 'b',
      entry: entry('b'),
    });
    expect(index.apply({ kind: 'remove', translationsFolder, key: 'a' })).toEqual({ kind: 'patched' });
    expect(index.subtree()?.resources).toEqual([entry('b')]);
  });

  it('adds nested empty folders idempotently and removes a whole subtree', () => {
    const index = new ResourceTreeIndex(collection, emptyTree());
    expect(index.apply({ kind: 'add-folder', translationsFolder, path: 'a.b' })).toEqual({ kind: 'patched' });
    index.apply({ kind: 'add-folder', translationsFolder, path: 'a.b' });
    index.apply({
      kind: 'upsert',
      translationsFolder,
      key: 'a.b.c',
      entry: entry('c'),
    });
    expect(index.subtree('a')?.children).toHaveLength(1);
    expect(index.apply({ kind: 'remove-folder', translationsFolder, path: 'a' })).toEqual({ kind: 'patched' });
    expect(index.subtree('a.b')).toBeNull();
    expect(index.totalKeys).toBe(0);
  });

  it('requests reload for reindex even before loading, and invalidates a loaded tree', () => {
    for (const tree of [null, emptyTree()]) {
      const index = new ResourceTreeIndex(collection, tree);
      expect(index.apply({ kind: 'reindex', translationsFolder })).toEqual({
        kind: 'reload',
        reason: 'a write asked for a re-index',
      });
      expect(index.loaded).toBe(false);
      expect(index.subtree()).toBeNull();
    }
  });

  it('requests reload on missing resources, missing parent folders, and missing child folders', () => {
    const changes = [
      { kind: 'remove' as const, translationsFolder, key: 'missing' },
      { kind: 'remove' as const, translationsFolder, key: 'missing.key' },
      { kind: 'remove-folder' as const, translationsFolder, path: 'missing' },
      {
        kind: 'remove-folder' as const,
        translationsFolder,
        path: 'missing.child',
      },
    ];
    for (const change of changes) {
      const index = new ResourceTreeIndex(collection, emptyTree());
      expect(index.apply(change).kind).toBe('reload');
      expect(index.loaded).toBe(false);
    }
  });

  it('ignores unrelated mutations including reindex and ignores patches before loading', () => {
    const tree = emptyTree();
    const index = new ResourceTreeIndex(collection, tree);
    expect(
      index.apply({
        kind: 'reindex',
        translationsFolder: `${translationsFolder}-other`,
      }),
    ).toEqual({ kind: 'ignored' });
    expect(index.subtree()).toBe(tree);
    expect(
      new ResourceTreeIndex(collection).apply({
        kind: 'add-folder',
        translationsFolder,
        path: 'a',
      }),
    ).toEqual({ kind: 'ignored' });
  });

  it('compares every fingerprint field and treats a missing snapshot as stale', () => {
    const scan = vi.spyOn(treeFingerprint, 'computeTreeFingerprint').mockReturnValue({ ...fingerprint });
    try {
      const index = new ResourceTreeIndex(collection, emptyTree(), fingerprint);
      expect(index.isStale()).toBe(false);
      for (const field of ['fileCount', 'folderCount', 'totalSize', 'maxMtimeMs'] as const) {
        scan.mockReturnValue({ ...fingerprint, [field]: fingerprint[field] + 1 });
        expect(index.isStale()).toBe(true);
      }
      index.refreshFingerprint();
      expect(index.isStale()).toBe(false);
      const withoutBaseline = new ResourceTreeIndex(collection);
      expect(withoutBaseline.isStale()).toBe(true);
      withoutBaseline.refreshFingerprint();
      expect(withoutBaseline.isStale()).toBe(false);
    } finally {
      scan.mockRestore();
    }
  });

  it('extracts root and nested subtrees and returns null for missing or unloaded paths', () => {
    const tree = emptyTree();
    const index = new ResourceTreeIndex(collection, tree);
    index.apply({ kind: 'add-folder', translationsFolder, path: 'a.b' });
    expect(index.subtree('')).toBe(tree);
    expect(index.subtree(' . ')).toBeNull();
    expect(index.subtree('.a..b.')?.folderPathSegments).toEqual(['a', 'b']);
    expect(index.subtree('a.missing')).toBeNull();
    tree.children.push({
      name: 'unloaded',
      fullPathSegments: ['unloaded'],
      loaded: false,
    });
    expect(index.subtree('unloaded')).toBeNull();
  });

  it('searches nested full keys, ranks before paging, and reports true totals in both modes', () => {
    const index = new ResourceTreeIndex(collection, emptyTree());
    index.apply({
      kind: 'upsert',
      translationsFolder,
      key: 'z.save',
      entry: entry('save', 'Save draft'),
    });
    index.apply({
      kind: 'upsert',
      translationsFolder,
      key: 'save',
      entry: entry('save', 'Save'),
    });
    for (const mode of ['text', 'similar-value'] as const) {
      const page = index.searchPage({
        kind: 'search',
        query: 'save',
        mode,
        limit: 1,
      });
      expect(page.results.map((result) => result.key)).toEqual(['save']);
      expect(page).toMatchObject({ totalFound: 2, limit: 1, limited: true });
      expect(index.searchPage({ kind: 'search', query: 'save', mode, limit: 10 })).toMatchObject({
        totalFound: 2,
        limited: false,
      });
    }
  });
});
