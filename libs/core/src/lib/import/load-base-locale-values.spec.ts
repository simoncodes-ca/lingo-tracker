import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import * as resourceFolder from '../resource/resource-folder';
import { importResources } from './import-resources';
import { loadBaseLocaleValues } from './load-base-locale-values';

describe('loadBaseLocaleValues before import validation', () => {
  const root = useTempDir('import-base-values-');
  const collection = () => testCollection(root());
  const invalidKeys = ['', '   ', 'bad@key', '.apps', 'apps.', 'apps..ok'];

  it('loads valid siblings without validating or changing the import input', () => {
    seedResources(collection(), { 'apps.ok': { source: 'Hello {name}' } });
    const resources = [
      ...invalidKeys.map((key) => ({ key, value: 'Bad' })),
      { key: 'apps.ok', value: 'Bonjour {nom}' },
    ];
    const original = structuredClone(resources);
    const opened = vi.spyOn(resourceFolder, 'openReadonlyResourceFolder');
    try {
      // Path arithmetic retains HEAD's lookup behaviour; import rejects syntax later.
      expect(loadBaseLocaleValues(resources, collection())).toEqual(
        new Map([
          ['apps..ok', 'Hello {name}'],
          ['apps.ok', 'Hello {name}'],
        ]),
      );
      expect(opened).toHaveBeenCalledWith(join(root(), 'apps'), collection());
      expect(resources).toEqual(original);
    } finally {
      opened.mockRestore();
    }
  });

  it('looks up malformed stored keys without an extra key check', () => {
    writeFolderFiles(root(), '', { entries: { 'bad@key': { source: 'Stored value' } } });
    expect(loadBaseLocaleValues([{ key: 'bad@key', value: 'Imported' }], collection())).toEqual(
      new Map([['bad@key', 'Stored value']]),
    );
  });

  it('continues to ignore unreadable base files', () => {
    writeFolderFiles(root(), 'broken', { entries: '{ invalid json' });
    seedResources(collection(), { 'apps.ok': { source: 'OK' } });
    expect(
      loadBaseLocaleValues(
        [
          { key: 'broken.ok', value: 'Bad' },
          { key: 'apps.ok', value: 'Bonjour' },
        ],
        collection(),
      ),
    ).toEqual(new Map([['apps.ok', 'OK']]));
  });

  it('keeps every invalid-key diagnostic and valid sibling in live and dry imports', () => {
    seedResources(collection(), { 'apps.ok': { source: 'Hello {name}' } });
    for (const dryRun of [true, false]) {
      const result = importResources(
        collection(),
        [...invalidKeys.map((key) => ({ key, value: 'Bad' })), { key: 'apps.ok', value: 'Bonjour {nom}' }],
        { locale: 'fr', dryRun },
      );
      expect(result.resourcesFailed).toBe(invalidKeys.length);
      expect(result.resourcesUpdated).toBe(1);
      expect(result.errors).toHaveLength(invalidKeys.length);
      // The empty key is the parent of .apps; import reports conflicts before key format.
      expect(result.errors).toContain('Hierarchical conflict: "" (has value and child keys)');
      expect(result.errors).toContain(
        'Invalid key format: "bad@key" (Error: Import validation: Invalid key segment "bad@key". Segments must match pattern [A-Za-z0-9_-]+)',
      );
      expect(result.changes.filter(({ type }) => type === 'failed').map(({ key }) => key)).toEqual(invalidKeys);
      const stored = resourceFolder.openUnreportedResourceFolder(join(root(), 'apps'), collection()).get('ok');
      expect(stored?.entry['fr']).toBe(dryRun ? undefined : 'Bonjour {name}');
    }
  });
});
