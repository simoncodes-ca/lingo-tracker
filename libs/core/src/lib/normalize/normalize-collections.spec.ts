import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import * as normalizeModule from './normalize';
import { normalizeCollections } from './normalize-collections';

describe('normalizeCollections', () => {
  const root = useTempDir('normalize-runs-');
  it('carries collection findings separately from numeric totals', async () => {
    writeFolderFiles(root(), 'common', { entries: { ok: { source: '{p, plural, offset:2other{x}}' } } });
    const collection = testCollection(root(), { name: 'Main' });
    const result = await normalizeCollections([collection]);
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;
    expect(result).not.toHaveProperty('findings');
    expect(result.collections[0]?.findings[0]).toMatchObject({
      key: 'common.ok',
      locale: 'en',
      kind: 'collapsed-case-body',
    });
    expect(Object.values(result.totals).every((value) => typeof value === 'number')).toBe(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it('settles a named read-only collection as a failed run, including in a dry run', async () => {
    const normalize = vi.spyOn(normalizeModule, 'normalize');
    for (const dryRun of [false, true]) {
      const result = await normalizeCollections([testCollection(root(), { name: 'Lib', readOnly: true })], { dryRun });
      expect(result).toEqual({
        status: 'failed',
        outcome: 'failed',
        warnings: [],
        error: 'Collection "Lib" is read-only. Its resources cannot be modified.',
        details: [],
      });
      expect(normalize).not.toHaveBeenCalled();
    }
  });

  it('refuses a later read-only collection in a named selection before processing any', async () => {
    const events: string[] = [];
    const result = await normalizeCollections(
      [
        testCollection(join(root(), 'first'), { name: 'First' }),
        testCollection(join(root(), 'second'), { name: 'Second', readOnly: true }),
      ],
      { onEvent: (event) => events.push(event.kind) },
    );
    expect(result.status).toBe('failed');
    expect(result.outcome).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.error).toBe('Collection "Second" is read-only. Its resources cannot be modified.');
    expect(result).not.toHaveProperty('collections');
    expect(result).not.toHaveProperty('totals');
    expect(events).toEqual([]);
  });

  it('skips read-only collections in all mode and totals writable results', async () => {
    const first = testCollection(join(root(), 'first'), { name: 'First' });
    const second = testCollection(join(root(), 'second'), { name: 'Second' });
    seedResources(first, { hello: { source: 'Hello' } });
    seedResources(second, { bye: { source: 'Bye' } });
    const result = await normalizeCollections(
      [first, testCollection(root(), { name: 'Lib', readOnly: true }), second],
      { all: true, dryRun: true },
    );
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;
    expect(result.collections.map(({ collectionName }) => collectionName)).toEqual(['First', 'Second']);
    expect(result.totals).toEqual({
      collectionsProcessed: 2,
      entriesProcessed: 2,
      localesAdded: 4,
      valuesConverted: 0,
      tagsNormalized: 0,
      filesCreated: 0,
      filesUpdated: 4,
      foldersRemoved: 0,
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(['Skipping read-only collection: Lib']);
    expect(result.outcome).toBe('succeeded');
  });

  it('continues after a collection fails and reports events in order', async () => {
    const blocked = join(root(), 'blocked');
    vi.spyOn(normalizeModule, 'normalize').mockRejectedValueOnce(new Error('disk full'));
    const next = testCollection(join(root(), 'next'), { name: 'Next' });
    seedResources(next, { hello: { source: 'Hello' } });
    const events: string[] = [];

    const result = await normalizeCollections([testCollection(blocked, { name: 'Broken' }), next], {
      all: true,
      onEvent: (event) =>
        events.push(`${event.kind}:${event.kind === 'result' ? event.result.collectionName : event.name}`),
    });

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;
    expect(result.errors).toHaveLength(1);
    expect(result.outcome).toBe('failed');
    expect(result.errors).toEqual(['Failed to normalize collection "Broken": disk full']);
    expect(result.collections.map(({ collectionName }) => collectionName)).toEqual(['Next']);
    expect(events).toEqual(['start:Broken', 'error:Broken', 'start:Next', 'result:Next']);
  });

  it('words non-Error failures in both diagnostics and events', async () => {
    vi.spyOn(normalizeModule, 'normalize').mockRejectedValueOnce('disk unavailable');
    const events: unknown[] = [];
    const result = await normalizeCollections([testCollection(root(), { name: 'Main' })], {
      onEvent: (event) => events.push(event),
    });
    expect(result.status).toBe('complete');
    if (result.status !== 'complete') return;
    const message = 'Failed to normalize collection "Main": disk unavailable';
    expect(result.errors).toEqual([message]);
    expect(result.outcome).toBe('failed');
    expect(events).toEqual([
      { kind: 'start', name: 'Main' },
      { kind: 'error', name: 'Main', error: message },
    ]);
  });

  it('propagates a result event callback error', async () => {
    const collection = testCollection(root(), { name: 'Main' });
    await expect(
      normalizeCollections([collection], {
        onEvent: (event) => {
          if (event.kind === 'result') throw new Error('printer failed');
        },
      }),
    ).rejects.toThrow('printer failed');
  });

  it('fails when every collection fails, including in a dry run', async () => {
    vi.spyOn(normalizeModule, 'normalize').mockRejectedValue(new Error('disk full'));
    for (const dryRun of [false, true]) {
      const result = await normalizeCollections([testCollection(root())], { dryRun });
      expect(result.status).toBe('complete');
      if (result.status !== 'complete') return;
      expect(result.outcome).toBe('failed');
      expect(result.errors).toHaveLength(1);
      expect(result.collections).toEqual([]);
      expect(result.totals.collectionsProcessed).toBe(0);
    }
  });

  it('succeeds with only read-only skips or folder problems', async () => {
    const skipped = await normalizeCollections([testCollection(root(), { readOnly: true })], { all: true });
    expect(skipped.status).toBe('complete');
    if (skipped.status !== 'complete') return;
    expect(skipped.outcome).toBe('succeeded');
    expect(skipped.collections).toEqual([]);
    expect(skipped.errors).toEqual([]);

    writeFolderFiles(root(), 'broken', { entries: '{ invalid json' });
    const warned = await normalizeCollections([testCollection(root())]);
    expect(warned.status).toBe('complete');
    if (warned.status !== 'complete') return;
    expect(warned.collections[0]?.problems).toHaveLength(1);
    expect(warned.warnings).toEqual([
      `Collection 'main': Skipped unreadable folder 'broken': ${warned.collections[0]?.problems[0]?.message}`,
    ]);
    expect(warned.errors).toEqual([]);
    expect(warned.outcome).toBe('succeeded');
  });
});
