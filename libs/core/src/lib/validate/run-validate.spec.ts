import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import type { Collection } from '../config/open-collection';
import { runValidate } from './run-validate';

function complete(collections: readonly Collection[], options: Parameters<typeof runValidate>[1] = {}) {
  const result = runValidate(collections, options);
  expect(result.status).toBe('complete');
  if (result.status !== 'complete') throw new Error(result.error);
  return result;
}

describe('runValidate', () => {
  const tempDir = useTempDir('validate-run-');
  const collection = (name: string, overrides: Partial<Collection> = {}) => {
    const folder = join(tempDir(), name);
    mkdirSync(folder, { recursive: true });
    return testCollection(folder, { name, ...overrides });
  };
  const withTermFiles = (
    value: Collection,
    paths: { protectedTerms?: string; preferredTerminology?: string },
    explicit = false,
  ): Collection => ({
    ...value,
    termFiles: {
      ...value.termFiles,
      protectedTerms: { path: paths.protectedTerms ?? value.termFiles.protectedTerms.path, explicit },
      preferredTerminology: { path: paths.preferredTerminology ?? value.termFiles.preferredTerminology.path, explicit },
    },
  });

  it('runs runtime validation independently of ICU compilation and honours skipRuntime', () => {
    const main = collection('main', { runtime: 'transloco', locales: ['en', 'fr'] });
    const plural = '{n, plural, one {# item} other {# items}}';
    seedResources(main, {
      count: {
        source: plural,
        translations: { fr: { value: plural, status: 'verified' } },
      },
    });
    const checked = complete([main], { skipIcu: true });
    expect(checked.outcome).toBe('failed');
    expect(checked.validation.icu?.failures.map(({ kind }) => kind)).toEqual([
      'runtime-unrenderable',
      'runtime-unrenderable',
    ]);
    expect(checked.summary).toContain('ICU Failures (2)');
    expect(checked.summary).toContain('Uses ICU plural, which the transloco runtime cannot render');
    const skipped = complete([main], { skipRuntime: true });
    expect(skipped.outcome).toBe('succeeded');
    expect(skipped.validation.icu?.valuesChecked).toBe(2);
    expect(skipped.validation.icu?.failures).toEqual([]);
  });

  it('fails verified translations that drop project protected terms even when placeholders are skipped', () => {
    const first = collection('first', { locales: ['en', 'fr'], targetLocales: ['fr'] });
    const second = collection('second', { locales: ['en', 'fr'], targetLocales: ['fr'] });
    writeFileSync(first.termFiles.protectedTerms.path, '["iPhone"]');
    writeFileSync(second.termFiles.protectedTerms.path, '["Acme"]');
    seedResources(first, {
      phone: {
        source: 'Buy iPhone',
        translations: {
          fr: { value: 'Acheter téléphone', status: 'verified' },
        },
      },
    });
    seedResources(second, {
      phone: {
        source: 'Buy iPhone',
        translations: {
          fr: { value: 'Acheter téléphone', status: 'verified' },
        },
      },
    });
    const result = complete([first, second], {
      skipPlaceholders: true,
      skipIcu: true,
    });
    expect(result.outcome).toBe('failed');
    expect(result.validation.passed).toBe(false);
    expect(result.validation.failures).toEqual([]);
    expect(result.validation.protectedTerms?.failures).toEqual([
      {
        key: 'phone',
        locale: 'fr',
        collection: 'first',
        message: 'Protected term(s) altered: iPhone',
      },
    ]);
    expect(result.summary).toContain('Protected Term Failures (1)');
    expect(result.summary).toContain('Protected term(s) altered: iPhone');
    expect(result.validation.placeholders).toBeUndefined();
  });

  it('can skip protected-term checks while retaining placeholder failures', () => {
    const main = collection('main', { locales: ['en', 'fr'], targetLocales: ['fr'] });
    writeFileSync(main.termFiles.protectedTerms.path, '["iPhone"]');
    seedResources(main, {
      phone: {
        source: 'Buy iPhone {name}',
        translations: { fr: { value: 'Téléphone {nom}', status: 'verified' } },
      },
    });
    const result = complete([main], {
      skipProtectedTerms: true,
      skipIcu: true,
    });
    expect(result.validation.protectedTerms).toBeUndefined();
    expect(result.validation.placeholders?.failures).toHaveLength(1);
    expect(result.outcome).toBe('failed');
    const skipped = complete([main], {
      skipProtectedTerms: true,
      skipPlaceholders: true,
      skipIcu: true,
    });
    expect(skipped.outcome).toBe('succeeded');
    expect(skipped.summary).not.toContain('Protected Term Failures');
  });

  it('reports no collections as an in-band failure', () => {
    expect(runValidate([])).toEqual({
      status: 'failed',
      outcome: 'failed',
      error: 'No collections found in configuration.',
      details: [],
      warnings: [],
    });
  });

  it('reports no target locales with the CLI hint', () => {
    expect(runValidate([collection('main', { locales: ['en'], targetLocales: [] })])).toEqual({
      status: 'failed',
      outcome: 'failed',
      error: 'No target locales found in configuration.',
      details: ["Target locales are each collection's locales except its base locale."],
      warnings: [],
    });
  });

  it('validates each collection in its own target locales and excludes its base locale', () => {
    const first = collection('first');
    const second = collection('second', { baseLocale: 'en-GB', locales: ['en-GB', 'ja'], targetLocales: ['ja'] });
    seedResources(first, { hello: { source: 'Hello', translations: { fr: 'Bonjour', es: 'Hola' } } });
    seedResources(second, { hello: { source: 'Hello', translations: { ja: 'こんにちは' } } });
    const result = complete([first, second], { skipIcu: true });
    expect(result.validation.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: 'first', locale: 'fr' }),
        expect.objectContaining({ collection: 'first', locale: 'es' }),
        expect.objectContaining({ collection: 'second', locale: 'ja' }),
      ]),
    );
    expect(result.validation.totalResourcesValidated).toBe(3);
    expect(result.validation.localesValidated).toBe(3);
  });

  it('skips a known target locale in every collection and lists it in the summary', () => {
    const result = complete([collection('first'), collection('second')], { skipLocales: ['fr'] });
    expect(result.validation.localesValidated).toBe(1);
    expect(result.summary).toContain('Skipped Locales: fr (1)');
    expect(result.warnings).toEqual([]);
  });

  it('warns for unknown skip locales without listing them as skipped', () => {
    const result = complete([collection('main')], { skipLocales: ['xx'] });
    expect(result.warnings).toEqual(["Skipping unknown locale 'xx' — not in configured locales"]);
    expect(result.validation.localesValidated).toBe(2);
    expect(result.summary).not.toContain('Skipped Locales:');
  });

  it('returns unknown-locale warnings before term-file warnings', () => {
    const main = collection('main');
    const protectedTerms = { ...main.termFiles.protectedTerms, explicit: true };
    const withMissingTerms = { ...main, termFiles: { ...main.termFiles, protectedTerms } };
    const result = complete([withMissingTerms], { skipLocales: ['xx'] });

    expect(result.warnings).toEqual([
      "Skipping unknown locale 'xx' — not in configured locales",
      `Protected terms file not found: ${protectedTerms.path}. Treating as an empty list.`,
    ]);
  });

  it('silently ignores a base locale in the skip list', () => {
    const result = complete([collection('main')], { skipLocales: ['en'] });
    expect(result.warnings).toEqual([]);
    expect(result.validation.localesValidated).toBe(2);
    expect(result.summary).not.toContain('Skipped Locales:');
  });

  it('skips a target locale in one collection while still checking another collection base in that locale', () => {
    const first = collection('first');
    const second = collection('second', { baseLocale: 'fr', locales: ['fr', 'de'], targetLocales: ['de'] });
    seedResources(first, {
      items: {
        source: 'Items',
        translations: {
          fr: { value: '{count, plural, ein {one} other {many}}', status: 'verified' },
          es: { value: 'Artículos', status: 'verified' },
        },
      },
    });
    seedResources(second, {
      items: {
        source: '{count, plural, ein {one} other {many}}',
        translations: { de: { value: 'Artikel', status: 'verified' } },
      },
    });

    const result = complete([first, second], { skipLocales: ['fr'] });
    expect(result.warnings).toEqual([]);
    expect(result.validation.successes).toEqual([
      expect.objectContaining({ collection: 'first', locale: 'es' }),
      expect.objectContaining({ collection: 'second', locale: 'de' }),
    ]);
    expect(result.validation.icu?.failures).toEqual([expect.objectContaining({ collection: 'second', locale: 'fr' })]);
    expect(result.summary).toContain('Skipped Locales: fr (1)');
  });

  it('accepts a target locale supplied by a collection override', () => {
    const other = collection('other', { locales: ['en', 'ja'], targetLocales: ['ja'] });
    const result = complete([collection('main'), other], { skipLocales: ['ja'] });
    expect(result.warnings).toEqual([]);
    expect(result.summary).toContain('Skipped Locales: ja (1)');
  });

  it('refuses when every target locale was skipped and retains earlier unknown-locale warnings', () => {
    expect(runValidate([collection('main')], { skipLocales: ['xx', 'fr', 'es'] })).toEqual({
      status: 'failed',
      outcome: 'failed',
      error: 'All target locales were skipped; nothing to validate.',
      details: [],
      warnings: ["Skipping unknown locale 'xx' — not in configured locales"],
    });
  });

  it('uses the one project rule file across collections with different base locales', () => {
    let first = collection('first');
    let second = collection('second', { baseLocale: 'en-GB', locales: ['en-GB', 'fr'], targetLocales: ['fr'] });
    seedResources(first, { title: { source: 'Expenditure', translations: { fr: 'Dépense' } } });
    seedResources(second, { title: { source: 'Expenditure', translations: { fr: 'Dépense' } } });
    const ruleFile = join(tempDir(), 'rules.json');
    writeFileSync(ruleFile, JSON.stringify([{ discouraged: 'Expenditure', preferred: 'Investment' }]));
    first = withTermFiles(first, { preferredTerminology: ruleFile });
    second = withTermFiles(second, { preferredTerminology: ruleFile });
    const result = complete([first, second], { skipIcu: true });
    expect(result.validation.terminology?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ collection: 'first', locale: 'en' }),
        expect.objectContaining({ collection: 'second', locale: 'en-GB' }),
      ]),
    );
    expect(result.validation.terminology?.warnings).toHaveLength(2);
  });

  it('does not fail for terminology findings with verified translations', () => {
    const main = collection('main');
    seedResources(main, {
      title: {
        source: 'Expenditure',
        translations: { fr: { value: 'Dépense', status: 'verified' }, es: { value: 'Gasto', status: 'verified' } },
      },
    });
    writeFileSync(
      main.termFiles.preferredTerminology.path,
      JSON.stringify([{ discouraged: 'Expenditure', preferred: 'Investment' }]),
    );
    const result = complete([main]);
    expect(result.validation.passed).toBe(true);
    expect(result.outcome).toBe('succeeded');
    expect(result.validation.terminology?.warnings).toHaveLength(1);
  });

  it('fails validation when a preferred-terminology file is broken', () => {
    const main = collection('main');
    writeFileSync(main.termFiles.preferredTerminology.path, '{invalid');
    const result = complete([main]);
    expect(result.validation.passed).toBe(false);
    expect(result.outcome).toBe('failed');
    expect(result.validation.terminology?.configError).toContain('not valid JSON');
  });

  it('warns for each missing named term file and omits the terminology check', () => {
    const main = withTermFiles(collection('main'), {}, true);
    const result = complete([main]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('Protected terms file not found');
    expect(result.warnings[1]).toContain('Preferred terminology file not found');
    expect(result.validation.terminology).toBeUndefined();
  });

  it('warns once for a broken protected-terms file shared by collections', () => {
    let first = collection('first');
    let second = collection('second');
    const file = join(tempDir(), 'protected.json');
    writeFileSync(file, '{invalid');
    first = withTermFiles(first, { protectedTerms: file });
    second = withTermFiles(second, { protectedTerms: file });
    const result = complete([first, second]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Protected terms checks skipped:');
    expect(result.validation.passed).toBe(true);
  });

  it('omits terminology when there are no rules', () => {
    expect(complete([collection('main')]).validation.terminology).toBeUndefined();
  });

  it('finds rules in a later collection when the first collection has none', () => {
    const first = collection('first');
    const second = collection('second');
    seedResources(first, { title: { source: 'Expenditure' } });
    seedResources(second, { title: { source: 'Expenditure' } });
    writeFileSync(
      second.termFiles.preferredTerminology.path,
      JSON.stringify([{ discouraged: 'Expenditure', preferred: 'Investment' }]),
    );
    const result = complete([first, second], { skipIcu: true });
    expect(result.validation.terminology?.warnings).toHaveLength(2);
  });

  it('keeps placeholder checks when ICU compilation is skipped', () => {
    const main = collection('main');
    seedResources(main, {
      title: { source: 'Hello {name}', translations: { fr: { value: 'Salut {person}', status: 'verified' } } },
    });
    const result = complete([main], { skipIcu: true });
    expect(result.validation.icu).toBeUndefined();
    expect(result.validation.placeholders?.failures).toHaveLength(1);
    expect(complete([main], { skipPlaceholders: true }).validation.placeholders).toBeUndefined();
  });

  it('honours portable plurals even when ICU compilation is skipped', () => {
    const main = collection('main');
    seedResources(main, { items: { source: '{count, plural, one {one} other {many}}' } });
    const result = complete([main], { skipIcu: true, requirePortablePlurals: true });
    expect(result.validation.icu?.warnings).toHaveLength(1);
    expect(result.validation.icu?.valuesChecked).toBe(0);
  });

  it('compiles base and target values by default without portability warnings', () => {
    const main = collection('main');
    seedResources(main, {
      items: {
        source: '{count, plural, one {one} other {many}}',
        translations: {
          fr: { value: 'un élément', status: 'verified' },
          es: { value: 'un elemento', status: 'verified' },
        },
      },
    });
    const result = complete([main]);
    expect(result.validation.icu?.valuesChecked).toBe(3);
    expect(result.validation.icu?.warnings).toEqual([]);
    expect(result.validation.icu?.failures).toEqual([]);
  });

  it('compiles each collection source under its own base locale', () => {
    const first = collection('first', { locales: ['en', 'fr'], targetLocales: ['fr'] });
    const second = collection('second', { baseLocale: 'de', locales: ['de', 'fr'], targetLocales: ['fr'] });
    const source = '{count, plural, ein {one} other {many}}';
    seedResources(first, { items: { source, translations: { fr: 'un élément' } } });
    seedResources(second, { items: { source, translations: { fr: 'un élément' } } });
    const result = complete([first, second]);
    expect(result.validation.icu?.failures).toEqual([
      expect.objectContaining({ collection: 'first', locale: 'en' }),
      expect.objectContaining({ collection: 'second', locale: 'de' }),
    ]);
  });

  it('enables the portability rule when requested', () => {
    const main = collection('main');
    seedResources(main, { items: { source: '{count, plural, one {one} other {many}}' } });
    const result = complete([main], { requirePortablePlurals: true });
    expect(result.validation.icu?.warnings).toEqual([
      expect.objectContaining({ key: 'items', locale: 'en', collection: 'main' }),
    ]);
    expect(result.validation.icu?.valuesChecked).toBe(1);
  });

  it('reports braced values when ICU compilation is skipped', () => {
    const main = collection('main', { locales: ['en', 'fr'], targetLocales: ['fr'] });
    writeFolderFiles(main.translationsFolder, '', { entries: { hello: { source: 'Hi', fr: '{{{a}}}' } } });
    const result = complete([main], { skipIcu: true });
    expect(result.validation.icu?.failures).toEqual([
      expect.objectContaining({
        key: 'hello',
        locale: 'fr',
        message: expect.stringContaining('inside literal braces'),
      }),
    ]);
    expect(result.outcome).toBe('failed');
    expect(result.summary).toContain('inside literal braces');
  });

  it('omits ICU checking entirely when skipped without portability', () => {
    const main = collection('main');
    seedResources(main, { items: { source: '{count, plural, ein {one} other {many}}' } });
    expect(complete([main], { skipIcu: true }).validation.icu).toBeUndefined();
  });

  it('keeps base-locale ICU compilation when the base is listed in skipLocales', () => {
    const main = collection('main');
    seedResources(main, {
      items: {
        source: '{count, plural, ein {one} other {many}}',
        translations: { fr: 'un élément', es: 'un elemento' },
      },
    });
    const result = complete([main], { skipLocales: ['en'] });
    expect(result.validation.icu?.valuesChecked).toBe(3);
    expect(result.validation.icu?.failures).toEqual([
      expect.objectContaining({ key: 'items', locale: 'en', collection: 'main' }),
    ]);
    expect(result.summary).not.toContain('Skipped Locales:');
  });

  it('does not compile a skipped target locale', () => {
    const main = collection('main');
    seedResources(main, {
      items: {
        source: 'Items',
        translations: {
          fr: { value: 'Éléments', status: 'verified' },
          es: { value: '{count, plural, ein {one} other {many}}', status: 'verified' },
        },
      },
    });
    const result = complete([main], { skipLocales: ['es'] });
    expect(result.validation.icu?.valuesChecked).toBe(2);
    expect(result.validation.icu?.failures).toEqual([]);
    expect(result.summary).toContain('Skipped Locales: es (1)');
  });

  it('lets translated statuses warn only when allowed', () => {
    const main = collection('main');
    seedResources(main, { title: { source: 'Hello', translations: { fr: 'Bonjour', es: 'Hola' } } });
    expect(complete([main]).validation.failures).toHaveLength(2);
    const result = complete([main], { allowTranslated: true });
    expect(result.validation.warnings).toHaveLength(2);
    expect(result.validation.passed).toBe(true);
  });
});
