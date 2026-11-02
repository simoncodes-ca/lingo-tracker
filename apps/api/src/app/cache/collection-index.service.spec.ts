import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Logger } from '@nestjs/common';
import {
  addLocaleToCollection,
  addResource,
  addResources,
  type Collection,
  executeMove,
  type FolderChild,
  type LingoTrackerConfig,
  loadConfig,
  openCollection,
  openProjectCollection,
  openResourceFolder,
  ResourceTreeIndex,
  type ResourceTreeNode,
} from '@simoncodes-ca/core';
import { CollectionIndex, type TreeRead } from './collection-index.service';

describe('CollectionIndex', () => {
  let root: string;
  let index: CollectionIndex;

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
    const folder = openResourceFolder(
      path.join(root, collectionName, ...segments.slice(0, -1)),
      collection(collectionName),
    );
    folder.setBase(segments[segments.length - 1], value);
    folder.save();
  }

  /** Reads the tree; indexes first when needed (indexing runs within the triggering read). */
  function readyTree(target: Collection = collection(), treePath = ''): ResourceTreeNode | null {
    let read: TreeRead = index.tree(target, treePath);
    if (read.status !== 'ready') read = index.tree(target, treePath);
    if (read.status !== 'ready') throw new Error(`index is ${read.status}`);
    return read.tree;
  }

  /** Children and resources sorted, so an index tree compares equal to a fresh load of the disk. */
  function normalized(node: ResourceTreeNode | null): unknown {
    if (!node) return node;
    return {
      folderPathSegments: node.folderPathSegments,
      resources: [...node.resources].sort((a, b) => a.key.localeCompare(b.key)),
      children: [...node.children]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((child: FolderChild) => ({ ...child, tree: normalized(child.tree ?? null) })),
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

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingo-index-'));
    // Tests that are not about the throttle need every read to check the disk.
    process.env.LINGO_TRACKER_REVALIDATE_INTERVAL_MS = '0';
    index = new CollectionIndex();
    writeEntry('main', 'common.ok', 'OK');
    writeEntry('main', 'common.cancel', 'Cancel');
    writeEntry('main', 'apps.title', 'Title');
  });

  afterEach(() => {
    delete process.env.LINGO_TRACKER_REVALIDATE_INTERVAL_MS;
    delete process.env.LINGO_TRACKER_MAX_CACHED_COLLECTIONS;
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  describe('reading', () => {
    it('logs disk-search and tree-load problems through Nest with the shared wording', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        const target = collection();
        fs.mkdirSync(path.join(target.translationsFolder, 'broken'));
        fs.writeFileSync(path.join(target.translationsFolder, 'broken', 'resource_entries.json'), '{ bad JSON');
        const result = index.searchPage(target, { kind: 'search', query: 'OK', mode: 'text', limit: 10 });
        expect(result.results).toHaveLength(1);
        expect(warn).toHaveBeenCalledTimes(1);
        const diagnostic = warn.mock.calls[0]?.[0];
        expect(diagnostic).toEqual(expect.stringContaining("Collection 'main': Skipped unreadable folder 'broken': "));
        expect(diagnostic).toEqual(expect.stringContaining('resource_entries.json'));
        const warnings: string[] = [];
        new ResourceTreeIndex(target).searchPage({ kind: 'search', query: 'OK', mode: 'text', limit: 10 }, (warning) =>
          warnings.push(warning),
        );
        expect(warnings).toEqual([diagnostic]);

        warn.mockClear();
        expect(readyTree(target)).toBeDefined();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith(diagnostic);
      } finally {
        warn.mockRestore();
      }
    });

    it('starts indexing on the first read and serves the tree after that', () => {
      expect(index.tree(collection())).toEqual({ status: 'not-started' });

      expectIndexMatchesDisk();
    });

    it('reports status for the cache-status endpoint', () => {
      expect(index.status(collection())).toEqual({ status: 'not-started', collectionName: 'main' });

      const ready = index.status(collection());
      expect(ready).toEqual({
        status: 'ready',
        collectionName: 'main',
        indexedAt: expect.any(String),
        stats: { totalKeys: 3, localeCount: 2 },
      });
    });

    it('reports an indexing failure and retries it on the next tree read', () => {
      // A file where the translations folder should be cannot be read as a folder.
      fs.writeFileSync(path.join(root, 'broken'), 'not a folder');
      const broken = openCollection(config('broken'), 'broken', { cwd: root });

      expect(index.tree(broken)).toEqual({ status: 'not-started' });
      expect(index.status(broken)).toEqual(expect.objectContaining({ status: 'error', error: expect.any(String) }));

      fs.rmSync(path.join(root, 'broken'));
      writeEntry('broken', 'fixed', 'Fixed');

      expect(index.tree(broken)).toEqual({ status: 'error' });
      expect(keysOf(readyTree(broken))).toEqual(['fixed']);
    });
  });

  describe('applying core mutations', () => {
    beforeEach(() => {
      readyTree();
    });

    it('moves a resource to another collection and updates both', async () => {
      writeEntry('other', 'existing', 'Existing');
      const other = openCollection(config('other'), 'other', { cwd: root });
      readyTree(other);

      await executeMove(
        {
          ...{ ...collection(), sourceConfig: config('other'), projectRoot: root },
          onMutation: index.sink ?? { ...collection(), sourceConfig: config('other'), projectRoot: root }.onMutation,
        },
        { source: 'common.ok', destination: 'imported.ok', toCollection: 'other' },
      );

      expect(keysOf(readyTree(collection(), 'common'))).toEqual(['cancel']);
      expect(keysOf(readyTree(other, 'imported'))).toEqual(['ok']);
      expectIndexMatchesDisk();
      expectIndexMatchesDisk(other);
    });

    it('updates both collection indexes through the project sink without an explicit move callback', () => {
      writeEntry('other', 'existing', 'Existing');
      // Keep revalidation from repairing a missed mutation before these assertions.
      process.env.LINGO_TRACKER_REVALIDATE_INTERVAL_MS = '60000';
      index = new CollectionIndex();
      const project = { sourceConfig: config('main', 'other'), projectRoot: root, onMutation: index.sink };
      const source = openProjectCollection(project, 'main', { writable: true });
      const destination = openProjectCollection(project, 'other', { writable: true });
      readyTree(source);
      readyTree(destination);

      expect(
        executeMove(source, {
          source: 'common.ok',
          destination: 'imported.ok',
          toCollection: 'other',
        }).movedCount,
      ).toBe(1);

      expect(keysOf(readyTree(source, 'common'))).toEqual(['cancel']);
      expect(keysOf(readyTree(destination, 'imported'))).toEqual(['ok']);
      expectIndexMatchesDisk(source);
      expectIndexMatchesDisk(destination);
    });

    it('re-indexes a collection whose locales changed', async () => {
      const configPath = path.join(root, '.lingo-tracker.json');
      fs.writeFileSync(configPath, JSON.stringify(config('main')));

      await addLocaleToCollection(
        {
          ...openCollection(loadConfig({ cwd: root }), 'main', { cwd: root }),
          onMutation: index.sink ?? openCollection(loadConfig({ cwd: root }), 'main', { cwd: root }).onMutation,
        },
        'de',
      );

      expect(index.tree(collection())).toEqual({ status: 'not-started' });
      expect(readyTree(collection(), 'common')?.resources.every((r) => r.translations.de !== undefined)).toBe(true);
    });

    it('rebuilds after each translation-style save, even when a read occurs between saves', async () => {
      const target = collection();
      const reindex = { kind: 'reindex' as const, translationsFolder: target.translationsFolder };

      writeEntry('main', 'common.first', 'First');
      index.sink(reindex);
      expect(keysOf(readyTree(target, 'common'))).toEqual(['cancel', 'first', 'ok']);

      writeEntry('main', 'common.second', 'Second');
      await addResource(
        { ...target, onMutation: index.sink ?? target.onMutation },
        { key: 'common.user', baseValue: 'User' },
        {},
      );
      expect(keysOf(readyTree(target, 'common'))).toEqual(['cancel', 'first', 'ok', 'user']);

      index.sink(reindex);
      expect(index.tree(target)).toEqual({ status: 'not-started' });
      expect(keysOf(readyTree(target, 'common'))).toEqual(['cancel', 'first', 'ok', 'second', 'user']);
      expectIndexMatchesDisk(target);
    });

    it('re-indexes when a mutation does not match the indexed tree', () => {
      index.apply([{ kind: 'remove', translationsFolder: collection().translationsFolder, key: 'common.unknown' }]);

      expect(index.tree(collection())).toEqual({ status: 'not-started' });
      expectIndexMatchesDisk();
    });

    it('ignores mutations for collections that are not indexed', async () => {
      await addResource(
        { ...collection('elsewhere'), onMutation: index.sink ?? collection('elsewhere').onMutation },
        { key: 'ok', baseValue: 'OK' },
        {},
      );

      expect(index.tree(collection()).status).toBe('ready');
    });

    it('follows a write that fails part-way', async () => {
      fs.writeFileSync(path.join(root, 'main', 'blocked'), 'file');
      await expect(
        addResources(
          { ...collection(), onMutation: index.sink ?? collection().onMutation },
          [
            { key: 'created.ok', baseValue: 'OK' },
            { key: 'blocked.later', baseValue: 'Later' },
          ],
          {},
        ),
      ).rejects.toThrow();
      expect(keysOf(readyTree(collection(), 'created'))).toEqual(['ok']);
    });

    it('a failing apply never reaches the write', () => {
      jest.spyOn(index, 'apply').mockImplementation(() => {
        throw new Error('index failed');
      });
      expect(() => index.sink({ kind: 'reindex', translationsFolder: collection().translationsFolder })).not.toThrow();
      expect(Logger.prototype.error).toHaveBeenCalledWith('Could not apply a mutation: index failed');
    });
  });

  describe('revalidation against the disk', () => {
    beforeEach(() => {
      readyTree();
    });

    it('keeps the index when nothing changed on disk', () => {
      expect(index.tree(collection()).status).toBe('ready');
    });

    it('drops the index when a resource file changed outside the process', () => {
      writeEntry('main', 'common.later', 'Later');

      expect(index.tree(collection())).toEqual({ status: 'not-started' });
      expect(keysOf(readyTree(collection(), 'common'))).toEqual(['cancel', 'later', 'ok']);
    });

    it('drops the index when a resource folder is removed outside the process', () => {
      fs.rmSync(path.join(root, 'main', 'common'), { recursive: true, force: true });

      expect(index.tree(collection())).toEqual({ status: 'not-started' });
      expect(readyTree(collection(), 'common')).toBeNull();
    });

    it('does not read its own write as an outside change', async () => {
      await addResource(
        { ...collection(), onMutation: index.sink ?? collection().onMutation },
        { key: 'common.yes', baseValue: 'Yes' },
        {},
      );

      expect(index.tree(collection()).status).toBe('ready');
    });

    it('detects an outside change made after its own write settled', async () => {
      await addResource(
        { ...collection(), onMutation: index.sink ?? collection().onMutation },
        { key: 'common.yes', baseValue: 'Yes' },
        {},
      );
      // Let the deferred fingerprint refresh run.
      await new Promise((resolve) => setTimeout(resolve, 5));

      writeEntry('main', 'common.later', 'Later');

      expect(index.tree(collection())).toEqual({ status: 'not-started' });
    });

    it('checks the disk at most once per revalidation interval', () => {
      process.env.LINGO_TRACKER_REVALIDATE_INTERVAL_MS = '60000';
      const throttled = new CollectionIndex();
      readyTreeOf(throttled);

      writeEntry('main', 'common.later', 'Later');

      // Indexing takes a fingerprint, so the change falls inside the interval that follows.
      expect(throttled.tree(collection()).status).toBe('ready');
    });

    function readyTreeOf(target: CollectionIndex): void {
      target.tree(collection());
      expect(target.tree(collection()).status).toBe('ready');
    }
  });

  describe('memory cap', () => {
    it('evicts the least recently used collection once the cap is reached', () => {
      process.env.LINGO_TRACKER_MAX_CACHED_COLLECTIONS = '2';
      const capped = new CollectionIndex();
      const [first, second, third] = ['first', 'second', 'third'].map((name) => {
        writeEntry(name, 'ok', 'OK');
        return openCollection(config(name), name, { cwd: root });
      });

      capped.tree(first);
      capped.tree(second);
      // Reading first makes second the least recently used entry.
      expect(capped.tree(first).status).toBe('ready');

      capped.tree(third);

      expect(capped.tree(first).status).toBe('ready');
      expect(capped.tree(third).status).toBe('ready');
      expect(capped.tree(second)).toEqual({ status: 'not-started' });
    });
  });
});
