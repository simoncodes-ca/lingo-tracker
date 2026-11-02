import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PreferredTermRule } from '@simoncodes-ca/domain';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import { CollectionBaseLocaleMismatchError } from '../errors/lingo-tracker-error';
import { runValidate } from '../validate/run-validate';
import {
  type CollectionSetOptions,
  collectionResourceStatus,
  collectionSetTargetLocales,
  readCollectionSet,
} from './collection-set';

describe('Collection Set', () => {
  const root = useTempDir('collection-set-');

  describe('readCollectionSet (real fs)', () => {
    it('flattens each entry with its collection, translations, status and tags', () => {
      const collection = testCollection(root(), { name: 'Core', tags: ['shared'] });
      seedResources(collection, {
        'button.ok': {
          source: 'OK',
          comment: 'Confirm',
          tags: ['ui'],
          translations: { es: { value: 'Vale', status: 'translated' } },
        },
      });

      const { resources, readProblems } = readCollectionSet([collection], { scope: 'glossary' }).read();

      expect(readProblems).toEqual([]);
      expect(resources).toEqual([
        {
          key: 'ok',
          fullKey: 'button.ok',
          source: 'OK',
          translations: { es: 'Vale' },
          tags: ['ui'],
          effectiveTags: ['shared', 'ui'],
          comment: 'Confirm',
          status: { es: 'translated' },
          collection: 'Core',
          targetLocales: ['fr', 'es'],
        },
      ]);
    });

    it('includes an entry without metadata, with no status', () => {
      writeFolderFiles(root(), '', { entries: { key: { source: 'val' } }, meta: {} });

      const { resources } = readCollectionSet([testCollection(root())], { scope: 'glossary' }).read();

      expect(resources).toHaveLength(1);
      expect(resources[0]?.status).toEqual({});
      const resource = resources[0];
      if (resource) expect(collectionResourceStatus(resource, 'fr')).toBe('new');
    });

    it('returns unreadable folders as problems', () => {
      writeFolderFiles(root(), 'bad', { entries: '{ nope' });

      const { resources, readProblems } = readCollectionSet([testCollection(root(), { name: 'main' })], {
        scope: 'glossary',
      }).read();

      expect(resources).toEqual([]);
      expect(readProblems).toEqual([
        expect.objectContaining({ collection: 'main', folderPath: 'bad', message: expect.any(String) }),
      ]);
    });

    it('reads nothing from a missing translations folder', () => {
      const missing = join(root(), 'missing');

      expect(readCollectionSet([testCollection(missing)], { scope: 'glossary' }).read()).toEqual({
        baseLocale: 'en',
        targetLocales: ['fr', 'es'],
        resources: [],
        readProblems: [],
      });
      expect(existsSync(missing)).toBe(false);
    });
  });

  it('requires one base locale when resources will be combined', () => {
    const english = testCollection(join(root(), 'english'), { name: 'english' });
    const french = testCollection(join(root(), 'french'), { name: 'french', baseLocale: 'fr' });

    let error: unknown;
    try {
      readCollectionSet([english, french], { scope: 'glossary' }).read();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CollectionBaseLocaleMismatchError);
    expect(error).toMatchObject({
      kind: 'invalid',
      code: 'COLLECTION_BASE_LOCALE_MISMATCH',
      collections: [
        { name: 'english', baseLocale: 'en' },
        { name: 'french', baseLocale: 'fr' },
      ],
    });
  });

  it('scopes the ordered target union and preserves each resource collection targets', () => {
    const first = testCollection(join(root(), 'first'), { name: 'first', locales: ['en', 'fr', 'es'] });
    const second = testCollection(join(root(), 'second'), { name: 'second', locales: ['en', 'de', 'fr'] });
    seedResources(first, { one: { source: 'One', translations: { fr: 'Un' } } });
    seedResources(second, { two: { source: 'Two', translations: { de: 'Zwei' } } });

    const set = {
      ...readCollectionSet([first, second], { scope: 'glossary' }).read(),
      targetLocales: collectionSetTargetLocales([first, second], ['de', 'fr']),
    };

    expect(set.targetLocales).toEqual(['fr', 'de']);
    expect(set.resources.map(({ fullKey, targetLocales }) => ({ fullKey, targetLocales }))).toEqual([
      { fullKey: 'one', targetLocales: ['fr', 'es'] },
      { fullKey: 'two', targetLocales: ['de', 'fr'] },
    ]);
  });

  it('allows per-collection validation with different base locales', () => {
    const english = testCollection(join(root(), 'english'), { name: 'english' });
    const french = testCollection(join(root(), 'french'), { name: 'french', baseLocale: 'fr' });
    const set = readCollectionSet([english, french], { scope: 'validation' }).read();
    expect(set.baseLocale).toBe('en');
    expect(set.targetLocales).toEqual(['fr', 'es']);
  });
});

describe('named Collection Set scopes', () => {
  const root = useTempDir('collection-set-scopes-');

  function fixture() {
    const first = testCollection(join(root(), 'first'), { name: 'first', locales: ['en', 'fr', 'es'] });
    const second = testCollection(join(root(), 'second'), { name: 'second', locales: ['en', 'fr'] });
    seedResources(first, {
      shared: { source: 'First', translations: { fr: 'Premier', es: 'Primero', de: 'Erste' } },
      only: { source: 'Only' },
    });
    seedResources(second, { shared: { source: 'Second', translations: { fr: 'Deuxième' } } });
    return [first, second];
  }

  it('export resolves shared keys per eligible target before filtering and keeps first-key order', () => {
    const set = readCollectionSet(fixture(), { scope: 'export', locales: ['es', 'fr', 'en', 'unknown'] }).read();
    expect(set.targetLocales).toEqual(['fr', 'es']);
    expect(set.resources.map(({ fullKey, source, targetLocales }) => [fullKey, source, targetLocales])).toEqual([
      ['shared', 'Second', ['fr']],
      ['only', 'Only', ['fr']],
      ['shared', 'First', ['es']],
      ['only', 'Only', ['es']],
    ]);
  });

  it('validation retains both occurrences of a key and scopes skipped locales per collection', () => {
    const collections = fixture();
    const options = { skippedLocales: ['en', 'unknown', 'es', 'unknown'] };
    const scope = readCollectionSet(collections, { scope: 'validation', ...options });
    expect(scope.targetLocales).toEqual(['fr', 'es']);
    expect(scope.skippedLocales).toEqual(['es']);
    expect(scope.warnings).toEqual([
      "Skipping unknown locale 'unknown' — not in configured locales",
      "Skipping unknown locale 'unknown' — not in configured locales",
    ]);
    const set = scope.read();
    expect(set.resources.map(({ source, targetLocales }) => [source, targetLocales])).toEqual([
      ['First', ['fr']],
      ['Only', ['fr']],
      ['Second', ['fr']],
    ]);
  });

  it('glossary retains candidates and explicit unconfigured locales, preserving the suspected duplicate-locale quirk', () => {
    const collections = fixture();
    const set = readCollectionSet(collections, {
      scope: 'glossary',
      locales: ['de', 'en', 'unknown', 'fr', 'de'],
    }).read();
    // Preserved suspected quirk: explicit glossary locale order and duplicates survive base exclusion.
    expect(set.targetLocales).toEqual(['de', 'unknown', 'fr', 'de']);
    expect(set.resources.map(({ source, targetLocales }) => [source, targetLocales])).toEqual([
      ['First', ['de', 'unknown', 'fr', 'de']],
      ['Only', ['de', 'unknown', 'fr', 'de']],
      ['Second', ['de', 'unknown', 'fr', 'de']],
    ]);
    const defaults = readCollectionSet(collections, { scope: 'glossary' }).read();
    expect(defaults.resources.map(({ targetLocales }) => targetLocales)).toEqual([['fr', 'es'], ['fr', 'es'], ['fr']]);
  });

  it('validation selects the first nonempty terminology rules without merging later rules', () => {
    // Rule selection now belongs to validation; pin it through the run rather than the scope.
    const selectRules = (terms: readonly { preferredTerminology: readonly PreferredTermRule[] }[]) => {
      const collections = terms.map((term, index) => {
        const collection = testCollection(join(root(), `terms-${index}`), { name: `terms-${index}` });
        mkdirSync(collection.translationsFolder, { recursive: true });
        writeFileSync(collection.termFiles.preferredTerminology.path, JSON.stringify(term.preferredTerminology));
        if (index === 0) seedResources(collection, { source: { source: 'First Second' } });
        return collection;
      });
      const result = runValidate(collections, { skipIcu: true });
      return result.status === 'complete'
        ? (result.validation.terminology?.warnings ?? []).map(({ discouraged, preferred }) => ({
            discouraged,
            preferred,
          }))
        : [];
    };
    const firstRules = [{ discouraged: 'First', preferred: 'One' }];
    const laterRules = [{ discouraged: 'Second', preferred: 'Two' }];
    expect(
      selectRules([
        { preferredTerminology: [] },
        { preferredTerminology: firstRules },
        { preferredTerminology: laterRules },
      ]),
    ).toEqual(firstRules);
    expect(selectRules([])).toEqual([]);
  });

  it('export requires matching bases with targets but skips reads and agreement without targets', () => {
    const collections = fixture();
    const mixed = collections.map((collection, index) =>
      index === 0 ? collection : { ...collection, baseLocale: 'de' },
    );
    expect(() => readCollectionSet(mixed, { scope: 'export' }).read()).toThrow(CollectionBaseLocaleMismatchError);
    writeFolderFiles(collections[0]?.translationsFolder ?? root(), 'broken', { entries: '{ nope' });
    const set = readCollectionSet(mixed, { scope: 'export', locales: [] }).read();
    expect(set.resources).toEqual([]);
    expect(set.readProblems).toEqual([]);
  });

  it('glossary requires matching bases even without targets and still reads an empty target scope', () => {
    const collections = fixture();
    const mixed = collections.map((collection, index) =>
      index === 0 ? collection : { ...collection, baseLocale: 'de' },
    );
    expect(() => readCollectionSet(mixed, { scope: 'glossary', locales: [] }).read()).toThrow(
      CollectionBaseLocaleMismatchError,
    );
    writeFolderFiles(collections[0]?.translationsFolder ?? root(), 'broken', { entries: '{ nope' });
    const set = readCollectionSet(collections, { scope: 'glossary', locales: [] }).read();
    expect(set.resources).toHaveLength(3);
    expect(set.readProblems).toHaveLength(1);
  });

  it('validation uses independent bases even when one base is another collection target', () => {
    const english = testCollection(join(root(), 'english'), { name: 'english', locales: ['en', 'fr'] });
    const french = testCollection(join(root(), 'french'), { name: 'french', baseLocale: 'fr', locales: ['fr', 'en'] });
    seedResources(english, { shared: { source: 'Hello' } });
    seedResources(french, { shared: { source: 'Bonjour' } });
    const scope = readCollectionSet([english, french], { scope: 'validation', skippedLocales: ['en'] });
    expect(scope.skippedLocales).toEqual(['en']);
    expect(scope.warnings).toEqual([]);
    const set = scope.read();
    expect(set.resources.map(({ source, targetLocales }) => [source, targetLocales])).toEqual([
      ['Hello', ['fr']],
      ['Bonjour', []],
    ]);
  });
});

describe('resolved Collection Set interface', () => {
  const root = useTempDir('collection-set-resolved-');

  it('reports validation preflight outcomes without reading and keeps locale lists for empty collections', () => {
    const collection = testCollection(root());
    writeFolderFiles(root(), 'broken', { entries: '{ nope' });
    expect(readCollectionSet([], { scope: 'validation' }).outcome).toBe('no-collections');
    expect(
      readCollectionSet([testCollection(root(), { locales: ['en'] })], {
        scope: 'validation',
        skippedLocales: ['unknown'],
      }),
    ).toMatchObject({ outcome: 'no-targets', warnings: [] });
    const skipped = readCollectionSet([collection], {
      scope: 'validation',
      skippedLocales: ['unknown', 'fr', 'es'],
    });
    expect(skipped.outcome).toBe('all-skipped');
    expect(skipped.warnings).toEqual(["Skipping unknown locale 'unknown' — not in configured locales"]);
    expect(skipped.localesByCollection.get(collection)).toEqual([]);
    // Direct resource validation still reads empty scopes to report unreadable folders.
    expect(skipped.read().readProblems).toHaveLength(1);
  });

  it('defers and reuses the read and shares the resolved locale list with each validation resource', () => {
    const collection = testCollection(root());
    const scope = readCollectionSet([collection], { scope: 'validation', skippedLocales: ['fr'] });
    seedResources(collection, { hello: { source: 'Hello' } });
    const set = scope.read();
    expect(set.resources).toHaveLength(1);
    expect(set.resources[0]?.targetLocales).toBe(scope.localesByCollection.get(collection));
    seedResources(collection, { later: { source: 'Later' } });
    expect(scope.read()).toBe(set);
    expect(scope.read().resources).toHaveLength(1);
  });

  it('accepts and exposes only the options and operations meaningful to each scope', () => {
    expectTypeOf<{ scope: 'validation'; locales: string[] }>().not.toExtend<CollectionSetOptions>();
    expectTypeOf<{ scope: 'export'; skippedLocales: string[] }>().not.toExtend<CollectionSetOptions>();
    expectTypeOf<{ scope: 'glossary'; skippedLocales: string[] }>().not.toExtend<CollectionSetOptions>();
    const selection = readCollectionSet([], { scope: 'export' });
    expectTypeOf(selection).not.toHaveProperty('terminologyRules');
    expectTypeOf(selection).not.toHaveProperty('skippedLocales');
    const validation = readCollectionSet([], { scope: 'validation' });
    expectTypeOf(validation).not.toHaveProperty('terminologyRules');
  });
});
