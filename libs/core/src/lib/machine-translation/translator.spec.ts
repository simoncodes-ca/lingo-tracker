import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TranslationConfig } from '../../config/translation-config';
import { testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import type { Collection } from '../config/open-collection';
import { DEFAULT_PROTECTED_TERMS_FILENAME } from '../config/protected-terms-file';
import { AutoTranslationDisabledError, ProtectedTermsFileError, TranslationError } from '../errors/lingo-tracker-error';
import { InMemoryTranslationProvider } from './in-memory-translation-provider';
import { openTranslator } from './translator';

const AUTO: TranslationConfig = { enabled: true, provider: 'google-translate', apiKeyEnv: 'TRANSLATOR_SPEC_KEY' };

const dir = useTempDir('translator-');

function collection(overrides: Partial<Collection> = {}): Collection {
  return testCollection(dir(), { translationConfig: AUTO, locales: ['en', 'fr', 'de'], ...overrides });
}

/** Translates by swapping English words for French ones, leaving everything else (markers included) intact. */
const toFrench = new InMemoryTranslationProvider(({ text }) =>
  text.replace('Hello', 'Bonjour').replace('Save', 'Enregistrer'),
);

describe('openTranslator', () => {
  const previousKey = process.env[AUTO.apiKeyEnv];

  beforeEach(() => {
    delete process.env[AUTO.apiKeyEnv];
  });

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env[AUTO.apiKeyEnv];
    } else {
      process.env[AUTO.apiKeyEnv] = previousKey;
    }
  });

  it('throws AutoTranslationDisabledError when the collection has no translation config', () => {
    expect(() => openTranslator(collection({ translationConfig: undefined }))).toThrow(AutoTranslationDisabledError);
  });

  it('throws AutoTranslationDisabledError when the translation config is disabled, even with a provider', () => {
    const disabled = collection({ translationConfig: { ...AUTO, enabled: false } });

    expect(() => openTranslator(disabled, { provider: new InMemoryTranslationProvider() })).toThrow(
      AutoTranslationDisabledError,
    );
  });

  it('fails fast with MISSING_API_KEY when the API key env var is unset', () => {
    expect(() => openTranslator(collection())).toThrow(
      expect.objectContaining({ code: 'MISSING_API_KEY', message: expect.stringContaining('TRANSLATOR_SPEC_KEY') }),
    );
    expect(() => openTranslator(collection())).toThrow(TranslationError);
  });

  it('builds the configured provider from the API key when none is injected', async () => {
    process.env[AUTO.apiKeyEnv] = 'secret';

    // Nothing to send: the Google provider is built but never called.
    await expect(openTranslator(collection()).translate([], ['fr'])).resolves.toEqual({ values: [], skipped: [] });
    expect(() => openTranslator(collection({ translationConfig: { ...AUTO, provider: 'nope' } }))).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_PROVIDER' }),
    );
  });

  it('does not need an API key when a provider is injected', async () => {
    const provider = new InMemoryTranslationProvider();

    const outcome = await openTranslator(collection(), { provider }).translate([{ key: 'ok', source: 'OK' }], ['fr']);

    expect(outcome.values).toEqual([{ key: 'ok', locale: 'fr', value: '[fr] OK' }]);
  });
});

describe('Translator.translate', () => {
  it('protects and restores dotted simple arguments for a Transloco collection', async () => {
    const provider = new InMemoryTranslationProvider(({ text }) => text.replace('Hello', 'Bonjour'));
    const outcome = await openTranslator(collection({ runtime: 'transloco' }), { provider }).translate(
      [
        { key: 'greeting', source: 'Hello {user.name}' },
        { key: 'count', source: '{user.name} has {n, plural, other {# items}}' },
      ],
      ['fr'],
    );
    expect(provider.calls).toEqual([
      [{ text: 'Hello <span class="notranslate">__PH0__</span>', sourceLocale: 'en', targetLocale: 'fr' }],
    ]);
    expect(outcome).toEqual({
      values: [{ key: 'greeting', locale: 'fr', value: 'Bonjour {user.name}' }],
      skipped: [{ key: 'count', locale: 'fr', reason: 'complex-icu' }],
    });
  });

  it('makes one provider call per locale, with every sendable entry, and ignores the base locale', async () => {
    const provider = new InMemoryTranslationProvider();
    const translator = openTranslator(collection(), { provider });

    const outcome = await translator.translate(
      [
        { key: 'a', source: 'Save' },
        { key: 'b', source: 'Cancel' },
      ],
      ['en', 'fr', 'de'],
    );

    expect(provider.calls).toEqual([
      [
        { text: 'Save', sourceLocale: 'en', targetLocale: 'fr' },
        { text: 'Cancel', sourceLocale: 'en', targetLocale: 'fr' },
      ],
      [
        { text: 'Save', sourceLocale: 'en', targetLocale: 'de' },
        { text: 'Cancel', sourceLocale: 'en', targetLocale: 'de' },
      ],
    ]);
    expect(outcome).toEqual({
      values: [
        { key: 'a', locale: 'fr', value: '[fr] Save' },
        { key: 'b', locale: 'fr', value: '[fr] Cancel' },
        { key: 'a', locale: 'de', value: '[de] Save' },
        { key: 'b', locale: 'de', value: '[de] Cancel' },
      ],
      skipped: [],
    });
  });

  it('skips complex ICU without sending it, and does not call the provider when nothing is sendable', async () => {
    const provider = new InMemoryTranslationProvider();
    const plural = '{count, plural, one {# item} other {# items}}';

    const outcome = await openTranslator(collection(), { provider }).translate(
      [
        { key: 'items', source: plural },
        { key: 'kind', source: '{gender, select, male {He} other {They}}' },
      ],
      ['fr'],
    );

    expect(provider.calls).toEqual([]);
    expect(outcome).toEqual({
      values: [],
      skipped: [
        { key: 'items', locale: 'fr', reason: 'complex-icu' },
        { key: 'kind', locale: 'fr', reason: 'complex-icu' },
      ],
    });
  });

  it('keeps results in entry order when placeholder and complex ICU entries are interspersed', async () => {
    const outcome = await openTranslator(collection(), { provider: new InMemoryTranslationProvider() }).translate(
      [
        { key: 'a', source: 'One' },
        { key: 'b', source: '{n, plural, other {#}}' },
        { key: 'c', source: 'Hi {name}' },
        { key: 'd', source: '{g, select, other {x}}' },
        { key: 'e', source: 'Five' },
      ],
      ['fr'],
    );

    expect(outcome.values.map(({ key, value }) => [key, value])).toEqual([
      ['a', '[fr] One'],
      ['c', '[fr] Hi {name}'],
      ['e', '[fr] Five'],
    ]);
    expect(outcome.skipped.map(({ key }) => key)).toEqual(['b', 'd']);
  });

  it('sends simple placeholders as notranslate markers and restores them', async () => {
    const provider = new InMemoryTranslationProvider(({ text }) =>
      text.replace('File', 'Fichier').replace('is newer than', 'est plus récent que'),
    );

    const outcome = await openTranslator(collection(), { provider }).translate(
      [{ key: 'f', source: 'File {fileA} is newer than {fileB}' }],
      ['fr'],
    );

    const sent = provider.calls[0]?.[0]?.text ?? '';
    expect(sent).toContain('<span class="notranslate">__PH0__</span>');
    expect(sent).not.toContain('{fileA}');
    expect(outcome.values).toEqual([{ key: 'f', locale: 'fr', value: 'Fichier {fileA} est plus récent que {fileB}' }]);
  });

  it('keeps quoted runs intact when the provider mangles apostrophes', async () => {
    const source = "Showing '{'first'}' to '{'last'}' of '{'totalRecords'}' entries";
    const provider = new InMemoryTranslationProvider(({ text }) =>
      text.replace('Showing', 'Affichage').replace(/'/g, '’'),
    );

    const outcome = await openTranslator(collection(), { provider }).translate([{ key: 'showing', source }], ['fr']);

    expect(provider.calls[0]?.[0]?.text).toBe(
      'Showing <span class="notranslate">__PH0__</span>first<span class="notranslate">__PH1__</span> to ' +
        '<span class="notranslate">__PH2__</span>last<span class="notranslate">__PH3__</span> of ' +
        '<span class="notranslate">__PH4__</span>totalRecords<span class="notranslate">__PH5__</span> entries',
    );
    expect(outcome).toEqual({
      values: [{ key: 'showing', locale: 'fr', value: source.replace('Showing', 'Affichage') }],
      skipped: [],
    });
  });

  it('sends plain text without quoted runs unchanged', async () => {
    const source = "Don't change plain text";
    const provider = new InMemoryTranslationProvider(({ text }) => text.replace(/'/g, '’'));

    const outcome = await openTranslator(collection(), { provider }).translate([{ key: 'plain', source }], ['fr']);

    expect(provider.calls).toEqual([[{ text: source, sourceLocale: 'en', targetLocale: 'fr' }]]);
    expect(outcome).toEqual({
      values: [{ key: 'plain', locale: 'fr', value: 'Don’t change plain text' }],
      skipped: [],
    });
  });

  it('skips a translation that lost a quoted-run marker', async () => {
    const provider = new InMemoryTranslationProvider(({ text }) => text.replace('__PH0__', ''));

    const outcome = await openTranslator(collection(), { provider }).translate(
      [{ key: 'literal', source: "'{'first'}'" }],
      ['fr'],
    );

    expect(outcome).toEqual({
      values: [],
      skipped: [{ key: 'literal', locale: 'fr', reason: 'placeholder-mismatch' }],
    });
  });

  it('skips provider output that restores to a braced placeholder before conversion', async () => {
    const provider = new InMemoryTranslationProvider(({ text }) => `${text.replace('Hi ', 'Salut {{')}}}`);
    const outcome = await openTranslator(collection(), { provider }).translate(
      [{ key: 'greet', source: 'Hi {a}' }],
      ['fr'],
    );
    expect(outcome).toEqual({ values: [], skipped: [{ key: 'greet', locale: 'fr', reason: 'placeholder-mismatch' }] });
    expect(provider.calls).toHaveLength(1);
  });

  it('skips a translation that lost a placeholder marker', async () => {
    const provider = new InMemoryTranslationProvider(() => 'Bonjour');

    const outcome = await openTranslator(collection(), { provider }).translate(
      [{ key: 'greet', source: 'Hello {name}' }],
      ['fr'],
    );

    expect(outcome).toEqual({ values: [], skipped: [{ key: 'greet', locale: 'fr', reason: 'placeholder-mismatch' }] });
  });

  it('skips a translation that duplicated a placeholder marker', async () => {
    const provider = new InMemoryTranslationProvider(({ text }) => `${text} ${text}`);

    const outcome = await openTranslator(collection(), { provider }).translate(
      [{ key: 'greet', source: 'Hello {name}' }],
      ['fr'],
    );

    expect(outcome.skipped).toEqual([{ key: 'greet', locale: 'fr', reason: 'placeholder-mismatch' }]);
  });

  it('maps a value with an added ICU argument to a placeholder skip', async () => {
    const provider = new InMemoryTranslationProvider(({ text }) => `${text} {unexpected}`);
    const outcome = await openTranslator(collection(), { provider }).translate(
      [{ key: 'greet', source: 'Hello {name}' }],
      ['fr'],
    );
    expect(outcome).toEqual({ values: [], skipped: [{ key: 'greet', locale: 'fr', reason: 'placeholder-mismatch' }] });
  });

  it('normalises every value to ICU', async () => {
    const outcome = await openTranslator(collection(), { provider: toFrench }).translate(
      [{ key: 'greet', source: 'Hello {{ name }}' }],
      ['fr'],
    );

    expect(outcome.values).toEqual([{ key: 'greet', locale: 'fr', value: 'Bonjour {name}' }]);
  });

  it('skips a translation that drops a protected term present in the source', async () => {
    const provider = new InMemoryTranslationProvider(({ text }) => text.replace('iPhone', 'téléphone'));
    const outcome = await openTranslator(collection(), { provider, protectedTerms: ['iPhone', 'Acme'] }).translate(
      [
        { key: 'buy', source: 'Buy an iPhone' },
        { key: 'brand', source: 'Made by Acme' },
      ],
      ['fr'],
    );

    expect(outcome.skipped).toEqual([{ key: 'buy', locale: 'fr', reason: 'protected-term', terms: ['iPhone'] }]);
    expect(outcome.values).toEqual([{ key: 'brand', locale: 'fr', value: 'Made by Acme' }]);
  });

  it('preserves the protected-term skip reason when the value also introduces an argument', async () => {
    const provider = new InMemoryTranslationProvider(({ text }) => `${text.replace('iPhone', 'téléphone')} {extra}`);
    const outcome = await openTranslator(collection(), { provider, protectedTerms: ['iPhone'] }).translate(
      [{ key: 'buy', source: 'Buy iPhone {name}' }],
      ['fr'],
    );
    expect(outcome).toEqual({
      values: [],
      skipped: [{ key: 'buy', locale: 'fr', reason: 'protected-term', terms: ['iPhone'] }],
    });
  });

  it('skips a translation that changes the case of a protected term', async () => {
    const provider = new InMemoryTranslationProvider(({ text }) => text.replace('iPhone', 'IPHONE'));

    const outcome = await openTranslator(collection(), { provider, protectedTerms: ['iPhone'] }).translate(
      [{ key: 'buy', source: 'Buy an iPhone' }],
      ['fr'],
    );

    expect(outcome.skipped).toEqual([{ key: 'buy', locale: 'fr', reason: 'protected-term', terms: ['iPhone'] }]);
  });

  it("reads the collection's protected-terms files when no terms are passed", async () => {
    writeFileSync(join(dir(), DEFAULT_PROTECTED_TERMS_FILENAME), JSON.stringify(['iPhone']), 'utf8');
    const provider = new InMemoryTranslationProvider(({ text }) => text.replace('iPhone', 'téléphone'));

    const outcome = await openTranslator(collection(), { provider }).translate(
      [{ key: 'buy', source: 'Buy an iPhone' }],
      ['fr'],
    );

    expect(outcome.skipped).toEqual([{ key: 'buy', locale: 'fr', reason: 'protected-term', terms: ['iPhone'] }]);
  });

  it('reads the terms again on every open, so a file changed on disk is used by the next Translator', async () => {
    const termsPath = join(dir(), DEFAULT_PROTECTED_TERMS_FILENAME);
    const provider = new InMemoryTranslationProvider(({ text }) => text.replace('iPhone', 'téléphone'));
    const entries = [{ key: 'buy', source: 'Buy an iPhone' }];

    writeFileSync(termsPath, JSON.stringify(['iPhone']), 'utf8');
    const first = await openTranslator(collection(), { provider }).translate(entries, ['fr']);
    writeFileSync(termsPath, JSON.stringify([]), 'utf8');
    const second = await openTranslator(collection(), { provider }).translate(entries, ['fr']);

    expect(first.skipped).toEqual([{ key: 'buy', locale: 'fr', reason: 'protected-term', terms: ['iPhone'] }]);
    expect(second.values).toEqual([{ key: 'buy', locale: 'fr', value: 'Buy an téléphone' }]);
  });

  it('reports a named protected-terms file that does not exist in problems, and translates unguarded', async () => {
    const missing = join(dir(), 'typo.json');
    const named = collection({
      termFiles: {
        protectedTerms: { path: missing, explicit: true },
        preferredTerminology: { path: join(dir(), 'rules.json'), explicit: false },
      },
    });

    const translator = openTranslator(named, { provider: new InMemoryTranslationProvider() });

    expect(translator.problems).toEqual([`Protected terms file not found: ${missing}. Treating as an empty list.`]);
    expect(openTranslator(named, { provider: new InMemoryTranslationProvider(), protectedTerms: [] }).problems).toEqual(
      [],
    );
    expect(openTranslator(collection(), { provider: new InMemoryTranslationProvider() }).problems).toEqual([]);
  });

  it('throws ProtectedTermsFileError on open when a protected-terms file is malformed', () => {
    writeFileSync(join(dir(), DEFAULT_PROTECTED_TERMS_FILENAME), '["iPhone",', 'utf8');

    expect(() => openTranslator(collection(), { provider: new InMemoryTranslationProvider() })).toThrow(
      ProtectedTermsFileError,
    );
  });

  it('propagates a provider failure', async () => {
    const failure = new TranslationError('quota exceeded', 'RATE_LIMIT', true);
    const provider = new InMemoryTranslationProvider(() => {
      throw failure;
    });

    await expect(
      openTranslator(collection(), { provider }).translate([{ key: 'ok', source: 'OK' }], ['fr']),
    ).rejects.toBe(failure);
  });

  it('rejects a provider response with the wrong number of results', async () => {
    const provider = new InMemoryTranslationProvider();
    provider.translate = async () => [];

    await expect(
      openTranslator(collection(), { provider }).translate([{ key: 'ok', source: 'OK' }], ['fr']),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
