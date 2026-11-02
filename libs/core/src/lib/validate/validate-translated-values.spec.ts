import { describe, expect, it } from 'vitest';
import type { CollectionSetResource } from '../collection-set/collection-set';
import { validateTranslatedValues } from './validate-translated-values';

const resource = (overrides: Partial<CollectionSetResource> = {}): CollectionSetResource => ({
  key: 'folderAriaLabelX',
  fullKey: 'browser.folderNode.folderAriaLabelX',
  source: 'Folder {name}',
  translations: {},
  status: {},
  collection: 'trackerResources',
  effectiveTags: [],
  targetLocales: [],
  ...overrides,
});

describe('validateTranslatedValues', () => {
  it('maps both value violations without stopping at the first', () => {
    const result = validateTranslatedValues(
      [
        resource({
          source: 'iPhone {name}',
          translations: { fr: 'Téléphone {nom}' },
        }),
      ],
      ['fr'],
      'en',
      {
        protectedTerms: ['iPhone'],
        checkArguments: true,
        checkProtectedTerms: true,
      },
    );
    expect(result.failures[0]).toMatchObject({
      missing: ['name'],
      unexpected: ['nom'],
    });
    expect(result.protectedTermFailures).toEqual([
      {
        key: 'browser.folderNode.folderAriaLabelX',
        locale: 'fr',
        collection: 'trackerResources',
        message: 'Protected term(s) altered: iPhone',
      },
    ]);
  });

  it('passes when every translation interpolates the same argument', () => {
    const result = validateTranslatedValues(
      [
        resource({
          translations: { de: 'Ordner {name}', es: 'Carpeta {name}' },
        }),
      ],
      ['de', 'es'],
      'en',
      { protectedTerms: [], checkArguments: true, checkProtectedTerms: true },
    );

    expect(result.failures).toEqual([]);
    expect(result.valuesChecked).toBe(2);
  });

  it('reports a translated argument name', () => {
    const result = validateTranslatedValues([resource({ translations: { es: 'Carpeta {nombre}' } })], ['es'], 'en', {
      protectedTerms: [],
      checkArguments: true,
      checkProtectedTerms: true,
    });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      key: 'browser.folderNode.folderAriaLabelX',
      locale: 'es',
      collection: 'trackerResources',
      missing: ['name'],
      unexpected: ['nombre'],
    });
  });

  it('describes a one-for-one swap as a rename', () => {
    const result = validateTranslatedValues([resource({ translations: { es: 'Carpeta {nombre}' } })], ['es'], 'en', {
      protectedTerms: [],
      checkArguments: true,
      checkProtectedTerms: true,
    });

    expect(result.failures[0]?.message).toBe(
      "Placeholder '{name}' was renamed to '{nombre}'; it renders as empty text",
    );
  });

  it('catches a case-only rename', () => {
    // The one that survives human review: German noun capitalisation is also a rename.
    const result = validateTranslatedValues([resource({ translations: { de: 'Ordner {Name}' } })], ['de'], 'en', {
      protectedTerms: [],
      checkArguments: true,
      checkProtectedTerms: true,
    });

    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.missing).toEqual(['name']);
    expect(result.failures[0]?.unexpected).toEqual(['Name']);
  });

  it('accepts Transloco syntax in a stored value', () => {
    const result = validateTranslatedValues([resource({ translations: { de: 'Ordner {{ name }}' } })], ['de'], 'en', {
      protectedTerms: [],
      checkArguments: true,
      checkProtectedTerms: true,
    });

    expect(result.failures).toEqual([]);
  });

  it('reports every offending locale rather than stopping at the first', () => {
    const result = validateTranslatedValues(
      [
        resource({
          translations: {
            de: 'Ordner {Name}',
            es: 'Carpeta {nombre}',
            fr: 'Dossier {nom}',
            ja: 'フォルダ {name}',
          },
        }),
      ],
      ['de', 'es', 'fr', 'ja'],
      'en',
      { protectedTerms: [], checkArguments: true, checkProtectedTerms: true },
    );

    expect(result.failures.map((f) => f.locale)).toEqual(['de', 'es', 'fr']);
    expect(result.valuesChecked).toBe(4);
  });

  it('skips a locale with no stored translation', () => {
    // An absent translation is the status gate's failure to report, not this one's.
    const result = validateTranslatedValues([resource({ translations: {} })], ['de'], 'en', {
      protectedTerms: [],
      checkArguments: true,
      checkProtectedTerms: true,
    });

    expect(result.failures).toEqual([]);
    expect(result.valuesChecked).toBe(0);
  });

  it('never compares the base locale against itself', () => {
    const result = validateTranslatedValues([resource({ translations: { en: 'Folder {name}' } })], ['en', 'de'], 'en', {
      protectedTerms: [],
      checkArguments: true,
      checkProtectedTerms: true,
    });

    expect(result.valuesChecked).toBe(0);
  });

  it('prefers an explicit base-locale translation over source', () => {
    const result = validateTranslatedValues(
      [
        resource({
          source: 'Folder {old}',
          translations: { en: 'Folder {name}', de: 'Ordner {name}' },
        }),
      ],
      ['de'],
      'en',
      { protectedTerms: [], checkArguments: true, checkProtectedTerms: true },
    );

    expect(result.failures).toEqual([]);
  });

  it('reports a dropped placeholder', () => {
    const result = validateTranslatedValues([resource({ translations: { de: 'Ordner' } })], ['de'], 'en', {
      protectedTerms: [],
      checkArguments: true,
      checkProtectedTerms: true,
    });

    expect(result.failures[0]).toMatchObject({
      missing: ['name'],
      unexpected: [],
    });
    expect(result.failures[0]?.message).toBe("Placeholders disagree with the base value: missing '{name}'");
  });

  it('reports an added placeholder', () => {
    const result = validateTranslatedValues(
      [resource({ source: 'Folder', translations: { de: 'Ordner {name}' } })],
      ['de'],
      'en',
      { protectedTerms: [], checkArguments: true, checkProtectedTerms: true },
    );

    expect(result.failures[0]).toMatchObject({
      missing: [],
      unexpected: ['name'],
    });
    expect(result.failures[0]?.message).toBe("Placeholders disagree with the base value: unexpected '{name}'");
  });

  it('tolerates a locale using its own plural categories', () => {
    const result = validateTranslatedValues(
      [
        resource({
          source: '{count, plural, =1 {1 file} other {# files}}',
          translations: {
            ru: '{count, plural, one {# файл} few {# файла} other {# файлов}}',
          },
        }),
      ],
      ['ru'],
      'en',
      { protectedTerms: [], checkArguments: true, checkProtectedTerms: true },
    );

    expect(result.failures).toEqual([]);
  });

  it('checks arguments used only inside a plural branch', () => {
    const result = validateTranslatedValues(
      [
        resource({
          source: '{count, plural, other {# files in {dir}}}',
          translations: {
            de: '{count, plural, other {# Dateien in {Ordner}}}',
          },
        }),
      ],
      ['de'],
      'en',
      { protectedTerms: [], checkArguments: true, checkProtectedTerms: true },
    );

    expect(result.failures[0]).toMatchObject({
      missing: ['dir'],
      unexpected: ['Ordner'],
    });
  });

  it('passes a value with no placeholders at all', () => {
    const result = validateTranslatedValues(
      [resource({ source: 'Save', translations: { de: 'Speichern' } })],
      ['de'],
      'en',
      { protectedTerms: [], checkArguments: true, checkProtectedTerms: true },
    );

    expect(result.failures).toEqual([]);
    expect(result.valuesChecked).toBe(1);
  });

  it('leaves an unparseable translation to the ICU pass', () => {
    const result = validateTranslatedValues([resource({ translations: { de: 'Ordner {unbalanced' } })], ['de'], 'en', {
      protectedTerms: [],
      checkArguments: true,
      checkProtectedTerms: true,
    });

    expect(result.failures).toEqual([]);
  });
});
