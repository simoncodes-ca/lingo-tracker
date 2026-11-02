import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import { type CollectionReadCache, loadCollectionResources } from './resource-loader';

describe('loadCollectionResources (real fs)', () => {
  const root = useTempDir('bundle-resource-loader-');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns an empty list when the translations folder does not exist', () => {
    expect(loadCollectionResources(testCollection(join(root(), 'missing')), 'en', undefined, [])).toEqual([]);
  });

  it('reads the base value for the base locale and the translation for other locales, with full keys', () => {
    const collection = testCollection(root());
    seedResources(collection, {
      welcome: { source: 'Welcome' },
      'apps.common.buttons.ok': { source: 'OK', translations: { fr: "D'accord" } },
    });

    expect(loadCollectionResources(collection, 'en', undefined, [])).toEqual([
      { key: 'welcome', value: 'Welcome', tags: [] },
      { key: 'apps.common.buttons.ok', value: 'OK', tags: [] },
    ]);
    expect(loadCollectionResources(collection, 'fr', undefined, [])).toEqual([
      { key: 'apps.common.buttons.ok', value: "D'accord", tags: [] },
    ]);
  });

  it("uses the collection's own base locale", () => {
    const collection = testCollection(root(), { baseLocale: 'fr', locales: ['fr', 'en'] });
    seedResources(collection, { ok: { source: 'Bien', translations: { en: 'OK' } } });

    expect(loadCollectionResources(collection, 'fr', undefined, []).map((resource) => resource.value)).toEqual([
      'Bien',
    ]);
    expect(loadCollectionResources(collection, 'en', undefined, []).map((resource) => resource.value)).toEqual(['OK']);
  });

  it('carries the effective tags: the collection tags united with the entry tags', () => {
    const collection = testCollection(root(), { tags: ['shared'] });
    seedResources(collection, { ok: { source: 'OK', tags: ['ui', 'buttons'] } });

    expect(loadCollectionResources(collection, 'en', undefined, [])).toEqual([
      { key: 'ok', value: 'OK', tags: ['shared', 'ui', 'buttons'] },
    ]);
  });

  it('includes entries without metadata', () => {
    writeFolderFiles(root(), 'common', { entries: { ok: { source: 'OK', fr: 'Bien' } } });

    expect(loadCollectionResources(testCollection(root()), 'fr', undefined, [])).toEqual([
      { key: 'common.ok', value: 'Bien', tags: [] },
    ]);
  });

  it('skips an unreadable folder and reports it to the warnings once per cached run', () => {
    const collection = testCollection(root());
    seedResources(collection, { 'good.ok': { source: 'OK', translations: { fr: 'Bien' } } });
    writeFolderFiles(root(), 'bad', { entries: '{ invalid json }' });
    const cache: CollectionReadCache = new Map();
    const warnings: string[] = [];

    expect(loadCollectionResources(collection, 'en', cache, warnings).map((resource) => resource.key)).toEqual([
      'good.ok',
    ]);
    loadCollectionResources(collection, 'fr', cache, warnings);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Collection 'main': Skipped unreadable folder");
    expect(warnings[0]).toContain('resource_entries.json');
  });

  it('reports an unreadable folder through warnings without logging', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeFolderFiles(root(), 'bad', { entries: '{ invalid json }' });

    const warnings: string[] = [];
    expect(loadCollectionResources(testCollection(root()), 'en', undefined, warnings)).toEqual([]);
    expect(warnings).toEqual([expect.stringContaining("Skipped unreadable folder 'bad'")]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('reads the disk once per collection for a shared cache', () => {
    const collection = testCollection(root());
    seedResources(collection, { ok: { source: 'OK' } });
    const cache: CollectionReadCache = new Map();

    loadCollectionResources(collection, 'en', cache, []);
    seedResources(collection, { later: { source: 'Later' } });

    expect(loadCollectionResources(collection, 'en', cache, []).map((resource) => resource.key)).toEqual(['ok']);
  });
});
