import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addResource,
  type Collection,
  createFolder,
  deleteFolder,
  deleteResource,
  editResource,
  executeMove,
  type FolderChild,
  type LingoTrackerConfig,
  openCollection,
  type ResourceTreeNode,
} from '../../index';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from './resource-folder';
import type { MutationSink } from './resource-mutation';
import { ResourceTreeIndex } from './resource-tree-index';

describe('ResourceTreeIndex stored mutation patches (moved from the API)', () => {
  let root: string;
  let index: ResourceTreeIndex;
  let sink: MutationSink;

  function config(...names: string[]): LingoTrackerConfig {
    return {
      exportFolder: 'export',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr'],
      collections: Object.fromEntries(names.map((name) => [name, { translationsFolder: path.join(root, name) }])),
    };
  }

  function collection(name = 'main') {
    return openCollection(config(name), name, { cwd: root });
  }

  /** Writes one entry (with metadata) the way core stores it. */
  function writeEntry(collectionName: string, key: string, value: string): void {
    const segments = key.split('.');
    const folder = openUnreportedResourceFolder(path.join(root, collectionName, ...segments.slice(0, -1)), {
      runtime: 'transloco-messageformat',
      baseLocale: 'en',
    });
    folder.setBase(segments[segments.length - 1], value);
    folder.save();
  }

  /** Reads the loaded fixture tree at the requested path. */
  function readyTree(target: Collection = collection(), treePath = ''): ResourceTreeNode | null {
    expect(target.translationsFolder).toBe(index.collection.translationsFolder);
    return index.subtree(treePath);
  }

  /** Children and resources sorted, so an index tree compares equal to a fresh load of the disk. */
  function normalized(node: ResourceTreeNode | null): unknown {
    if (!node) return node;
    return {
      folderPathSegments: node.folderPathSegments,
      resources: [...node.resources].sort((a, b) => a.key.localeCompare(b.key)),
      children: [...node.children]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child: FolderChild) => ({
          ...child,
          tree: normalized(child.tree ?? null),
        })),
    };
  }

  function expectIndexMatchesDisk(target: Collection = collection()): void {
    const diskIndex = new ResourceTreeIndex(target);
    diskIndex.load();
    const fromDisk = diskIndex.subtree();
    expect(normalized(readyTree(target))).toEqual(normalized(fromDisk));
  }

  function keysOf(node: ResourceTreeNode | null): string[] {
    return (node?.resources.map((resource) => resource.key) ?? []).sort();
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingo-tree-index-'));
    writeEntry('main', 'common.ok', 'OK');
    writeEntry('main', 'common.cancel', 'Cancel');
    writeEntry('main', 'apps.title', 'Title');
    index = new ResourceTreeIndex(collection());
    index.load();
    sink = (mutation) => {
      const result = index.apply(mutation);
      if (result.kind === 'reload') throw new Error(result.reason);
    };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns the subtree at a path, and null for a path that does not exist', () => {
    expect(keysOf(readyTree(collection(), 'common'))).toEqual(['cancel', 'ok']);
    expect(readyTree(collection(), 'missing.path')).toBeNull();
  });

  it('adds a resource, creating its folders', async () => {
    await addResource(
      { ...collection(), onMutation: sink ?? collection().onMutation },
      {
        key: 'apps.dialogs.confirm.yes',
        baseValue: 'Yes',
      },
      {},
    );

    expect(keysOf(readyTree(collection(), 'apps.dialogs.confirm'))).toEqual(['yes']);
    expectIndexMatchesDisk();
  });

  it('replaces an edited resource in place', async () => {
    await editResource(
      { ...collection(), onMutation: sink ?? collection().onMutation },
      'common.ok',
      { baseValue: 'Okay' },
      {},
    );

    expect(readyTree(collection(), 'common')?.resources.find((r) => r.key === 'ok')?.source).toBe('Okay');
    expectIndexMatchesDisk();
  });

  it('removes deleted resources', () => {
    deleteResource(
      { ...collection(), onMutation: sink ?? collection().onMutation },
      { keys: ['common.ok', 'apps.title'] },
    );

    expect(keysOf(readyTree(collection(), 'common'))).toEqual(['cancel']);
    expectIndexMatchesDisk();
  });

  it('moves resources by pattern', async () => {
    await executeMove(
      { ...collection(), onMutation: sink ?? collection().onMutation },
      { source: 'common.*', destination: 'shared' },
    );

    expect(keysOf(readyTree(collection(), 'shared'))).toEqual(['cancel', 'ok']);
    expect(keysOf(readyTree(collection(), 'common'))).toEqual([]);
    expectIndexMatchesDisk();
  });

  it('creates, moves and deletes folders', async () => {
    createFolder(
      { ...collection(), onMutation: sink ?? collection().onMutation },
      { folderName: 'empty', parentPath: 'apps' },
    );
    expect(readyTree(collection(), 'apps.empty')).not.toBeNull();

    await executeMove(
      { ...collection(), onMutation: sink ?? collection().onMutation },
      { kind: 'folder', source: 'common', destination: 'apps' },
    );

    expect(keysOf(readyTree(collection(), 'apps.common'))).toEqual(['cancel', 'ok']);
    expect(readyTree(collection(), 'common')).toBeNull();

    deleteFolder({ ...collection(), onMutation: sink ?? collection().onMutation }, { folderPath: 'apps.empty' });
    expect(readyTree(collection(), 'apps.empty')).toBeNull();

    expectIndexMatchesDisk();
  });

  it('loads a fingerprint, detects external changes, and adopts an own-write refresh', () => {
    expect(index.loaded).toBe(true);
    expect(index.isStale()).toBe(false);
    writeEntry('main', 'common.external', 'External');
    expect(index.isStale()).toBe(true);
    index.refreshFingerprint();
    expect(index.isStale()).toBe(false);
  });

  it('searches disk before loading without indexing and returns the same page after loading', () => {
    const diskIndex = new ResourceTreeIndex(collection());
    const request = { kind: 'search' as const, query: 'common', mode: 'text' as const, limit: 1 };
    const diskPage = diskIndex.searchPage(request);
    expect(diskIndex.loaded).toBe(false);
    expect(diskPage).toMatchObject({ totalFound: 2, limit: 1, limited: true });
    diskIndex.load();
    expect(diskIndex.searchPage(request)).toEqual(diskPage);
  });

  it('reloads after repeated reindex mutations with reads between saves', () => {
    for (const key of ['first', 'second']) {
      writeEntry('main', `common.${key}`, key);
      expect(index.apply({ kind: 'reindex', translationsFolder: collection().translationsFolder }).kind).toBe('reload');
      expect(index.loaded).toBe(false);
      index.load();
      expect(keysOf(index.subtree('common'))).toContain(key);
      expectIndexMatchesDisk();
    }
  });
});
