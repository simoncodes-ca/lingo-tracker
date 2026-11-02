import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPreferredTermFindings } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import type { TranslationConfig } from '../../config/translation-config';
import { type Collection, openCollection } from '../config/open-collection';
import { DEFAULT_PROTECTED_TERMS_FILENAME } from '../config/protected-terms-file';
import {
  BracedPlaceholderError,
  InvalidBaseValueError,
  InvalidResourceKeyError,
  InvalidTranslationStatusError,
  LocaleNotFoundError,
  ResourceAlreadyExistsError,
  TranslationError,
} from '../errors/lingo-tracker-error';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
import { calculateChecksum as md5 } from './checksum';
import { addResource } from './resource-entry';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from './resource-folder';
import type { ResourceMutation } from './resource-mutation';

const collected: ResourceMutation[] = [];
const onMutation = (mutation: ResourceMutation): void => {
  collected.push(mutation);
};
beforeEach(() => {
  collected.length = 0;
});

// Wrapped, not replaced: the specs below check which value the terminology check is given.
vi.mock('@simoncodes-ca/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/domain')>();
  return { ...actual, findPreferredTermFindings: vi.fn(actual.findPreferredTermFindings) };
});

const AUTO: TranslationConfig = { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' };

describe('addResource (real fs)', () => {
  let root: string;

  function collection(options: { translation?: TranslationConfig; locales?: string[]; baseLocale?: string } = {}) {
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: options.baseLocale ?? 'en',
      locales: options.locales ?? ['en', 'fr', 'de'],
      collections: { main: { translationsFolder: join(root, 'translations') } },
      ...(options.translation && { translation: options.translation }),
    };
    return openCollection(config, 'main', { cwd: root });
  }

  function read(file: 'resource_entries.json' | 'tracker_meta.json', ...segments: string[]) {
    return JSON.parse(readFileSync(join(root, 'translations', ...segments, file), 'utf8'));
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'add-resource-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects empty and whitespace-only base values before creating folders or translating', async () => {
    const provider = new InMemoryTranslationProvider();
    for (const baseValue of ['', '   ', '\t\n']) {
      await expect(
        addResource(
          {
            ...collection({ translation: AUTO }),
            onMutation: onMutation ?? collection({ translation: AUTO }).onMutation,
          },
          { key: 'common.ok', baseValue },
          { provider },
        ),
      ).rejects.toThrow(InvalidBaseValueError);
      expect(existsSync(join(root, 'translations'))).toBe(false);
    }
    await addResource(collection(), { key: 'common.ok', baseValue: 'Existing' });
    const paths = ['resource_entries.json', 'tracker_meta.json'].map((file) =>
      join(root, 'translations', 'common', file),
    );
    const before = paths.map((path) => readFileSync(path));
    for (const baseValue of ['', '   ']) {
      await expect(
        addResource(
          {
            ...collection({ translation: AUTO }),
            onMutation: onMutation ?? collection({ translation: AUTO }).onMutation,
          },
          { key: 'common.ok', baseValue },
          { provider, onExisting: 'replace' },
        ),
      ).rejects.toThrow('Base value must not be empty.');
      expect(paths.map((path) => readFileSync(path))).toEqual(before);
    }
    expect(provider.calls).toEqual([]);
    expect(collected).toEqual([]);
  });

  describe('locale seeding', () => {
    it.each([{ baseValue: '{{{a}}}' }, { baseValue: 'OK', translations: [{ locale: 'fr', value: '{{{a}}}' }] }])(
      'rejects braced supplied values before writing: %j',
      async (changes) => {
        await expect(
          addResource(
            { ...collection(), onMutation: onMutation ?? collection().onMutation },
            { key: 'common.ok', ...changes },
            {},
          ),
        ).rejects.toThrow(BracedPlaceholderError);
        expect(existsSync(join(root, 'translations'))).toBe(false);
        expect(collected).toEqual([]);
        await addResource(collection(), { key: 'common.ok', baseValue: 'Existing' });
        const paths = ['resource_entries.json', 'tracker_meta.json'].map((file) =>
          join(root, 'translations', 'common', file),
        );
        const before = paths.map((path) => readFileSync(path));
        await expect(
          addResource(
            { ...collection(), onMutation: onMutation ?? collection().onMutation },
            { key: 'common.ok', ...changes },
            { onExisting: 'replace' },
          ),
        ).rejects.toThrow(BracedPlaceholderError);
        expect(paths.map((path) => readFileSync(path))).toEqual(before);
        expect(collected).toEqual([]);
      },
    );

    it.each([
      ['{n, plural, other {{{a}}}}', '{n, plural, other {{a}}}'],
      ['{ {{a}} }', '{ {a} }'],
      ["'{'{{a}}'}'", "'{'{a}'}'"],
    ])('accepts stable brace shapes: %s', async (baseValue, storedValue) => {
      await addResource(collection(), { key: 'common.ok', baseValue });
      expect(read('resource_entries.json', 'common')).toEqual({
        ok: { source: storedValue, fr: storedValue, de: storedValue },
      });
      expect(read('tracker_meta.json', 'common')).toEqual({
        ok: {
          en: { checksum: md5(storedValue) },
          fr: { checksum: md5(storedValue), baseChecksum: md5(storedValue), status: 'new' },
          de: { checksum: md5(storedValue), baseChecksum: md5(storedValue), status: 'new' },
        },
      });
    });
    it('ignores a braced supplied translation for the base locale', async () => {
      await addResource(collection(), {
        key: 'common.ok',
        baseValue: 'Hi',
        translations: [{ locale: 'en', value: '{{{ignored}}}' }],
      });
      expect(read('resource_entries.json', 'common')).toEqual({ ok: { source: 'Hi', fr: 'Hi', de: 'Hi' } });
      expect(read('tracker_meta.json', 'common')).toEqual({
        ok: {
          en: { checksum: md5('Hi') },
          fr: { checksum: md5('Hi'), baseChecksum: md5('Hi'), status: 'new' },
          de: { checksum: md5('Hi'), baseChecksum: md5('Hi'), status: 'new' },
        },
      });
    });

    it('copies the base value as `new` into every target locale when auto-translation is off', async () => {
      const provider = new InMemoryTranslationProvider();

      const result = await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { key: 'common.ok', baseValue: 'OK' },
        { provider },
      );

      expect(read('resource_entries.json', 'common')).toEqual({ ok: { source: 'OK', fr: 'OK', de: 'OK' } });
      expect(read('tracker_meta.json', 'common').ok).toEqual({
        en: { checksum: md5('OK') },
        fr: { checksum: md5('OK'), baseChecksum: md5('OK'), status: 'new' },
        de: { checksum: md5('OK'), baseChecksum: md5('OK'), status: 'new' },
      });
      expect(result.translations.map(({ locale, status }) => [locale, status])).toEqual([
        ['fr', 'new'],
        ['de', 'new'],
      ]);
      expect(result.skippedLocales).toBeUndefined();
      expect(provider.calls).toEqual([]);
    });

    it('keeps supplied translations and seeds only the missing locales', async () => {
      await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        {
          key: 'common.save',
          baseValue: 'Save',
          translations: [{ locale: 'fr', value: 'Enregistrer', status: 'translated' }],
        },
        {},
      );

      expect(read('resource_entries.json', 'common').save).toEqual({ source: 'Save', fr: 'Enregistrer', de: 'Save' });
      const meta = read('tracker_meta.json', 'common').save;
      expect(meta.fr.status).toBe('translated');
      expect(meta.de.status).toBe('new');
    });

    it('auto-translates the missing locales when the collection enables it', async () => {
      const provider = new InMemoryTranslationProvider(() => 'Speichern');

      const result = await addResource(
        {
          ...collection({ translation: AUTO }),
          onMutation: onMutation ?? collection({ translation: AUTO }).onMutation,
        },
        {
          key: 'common.save',
          baseValue: 'Save',
          translations: [{ locale: 'fr', value: 'Enregistrer', status: 'verified' }],
        },
        { provider },
      );

      expect(provider.calls).toEqual([[{ text: 'Save', sourceLocale: 'en', targetLocale: 'de' }]]);
      expect(read('resource_entries.json', 'common').save).toEqual({
        source: 'Save',
        fr: 'Enregistrer',
        de: 'Speichern',
      });
      const meta = read('tracker_meta.json', 'common').save;
      expect(meta.fr.status).toBe('verified');
      expect(meta.de.status).toBe('translated');
      expect(result.skippedLocales).toEqual([]);
    });

    it('stores auto-translations normalised to ICU', async () => {
      const provider = new InMemoryTranslationProvider(({ text }) => text.replace('Hello', 'Hallo'));

      await addResource(
        {
          ...collection({ translation: AUTO }),
          onMutation: onMutation ?? collection({ translation: AUTO }).onMutation,
        },
        { key: 'greet', baseValue: 'Hello {{ name }}' },
        { provider },
      );

      expect(read('resource_entries.json').greet).toEqual({
        source: 'Hello {name}',
        fr: 'Hallo {name}',
        de: 'Hallo {name}',
      });
    });

    it('copies the base value as `new` into every locale when the base value is complex ICU, and reports them', async () => {
      const provider = new InMemoryTranslationProvider();

      const result = await addResource(
        {
          ...collection({ translation: AUTO }),
          onMutation: onMutation ?? collection({ translation: AUTO }).onMutation,
        },
        { key: 'items', baseValue: '{count, plural, other {# items}}' },
        { provider },
      );

      const entry = read('resource_entries.json').items;
      expect(entry.fr).toBe('{count, plural, other {# items}}');
      expect(entry.de).toBe('{count, plural, other {# items}}');
      expect(read('tracker_meta.json').items.de.status).toBe('new');
      expect(result.skippedLocales).toEqual(['fr', 'de']);
      expect(provider.calls).toEqual([]);
    });

    it('copies the base value as `new` into a locale whose translation dropped a protected term', async () => {
      // The global terms file beside the config (root is the config directory).
      writeFileSync(join(root, DEFAULT_PROTECTED_TERMS_FILENAME), JSON.stringify(['iPhone']), 'utf8');
      const provider = new InMemoryTranslationProvider(({ targetLocale }) =>
        targetLocale === 'fr' ? 'Acheter un téléphone' : 'iPhone kaufen',
      );

      const result = await addResource(
        {
          ...collection({ translation: AUTO }),
          onMutation: onMutation ?? collection({ translation: AUTO }).onMutation,
        },
        { key: 'buy', baseValue: 'Buy an iPhone' },
        { provider },
      );

      expect(read('resource_entries.json').buy).toEqual({
        source: 'Buy an iPhone',
        fr: 'Buy an iPhone',
        de: 'iPhone kaufen',
      });
      expect(read('tracker_meta.json').buy.fr.status).toBe('new');
      expect(read('tracker_meta.json').buy.de.status).toBe('translated');
      expect(result.skippedLocales).toEqual(['fr']);
    });

    it('does not call the provider when every target locale was supplied', async () => {
      const provider = new InMemoryTranslationProvider();

      await addResource(
        {
          ...collection({ translation: AUTO }),
          onMutation: onMutation ?? collection({ translation: AUTO }).onMutation,
        },
        {
          key: 'ok',
          baseValue: 'OK',
          translations: [
            { locale: 'fr', value: "D'accord", status: 'translated' },
            { locale: 'de', value: 'Okay', status: 'translated' },
          ],
        },
        { provider },
      );

      expect(provider.calls).toEqual([]);
    });

    it('does not auto-translate when the collection translation config is disabled', async () => {
      const provider = new InMemoryTranslationProvider();

      await addResource(
        {
          ...collection({ translation: { ...AUTO, enabled: false } }),
          onMutation: onMutation ?? collection({ translation: { ...AUTO, enabled: false } }).onMutation,
        },
        { key: 'ok', baseValue: 'OK' },
        { provider },
      );

      expect(provider.calls).toEqual([]);
      expect(read('tracker_meta.json').ok.fr.status).toBe('new');
    });

    it('writes nothing when the provider fails', async () => {
      const provider = new InMemoryTranslationProvider(() => {
        throw new TranslationError('quota', 'RATE_LIMIT', true);
      });

      await expect(
        addResource(
          {
            ...collection({ translation: AUTO }),
            onMutation: onMutation ?? collection({ translation: AUTO }).onMutation,
          },
          { key: 'common.ok', baseValue: 'OK' },
          { provider },
        ),
      ).rejects.toThrow(TranslationError);
      expect(existsSync(join(root, 'translations', 'common', 'resource_entries.json'))).toBe(false);
    });

    it('writes nothing when the API key is not set', async () => {
      await expect(
        addResource(
          {
            ...collection({ translation: { ...AUTO, apiKeyEnv: 'ADD_RESOURCE_SPEC_UNSET_KEY' } }),
            onMutation:
              onMutation ??
              collection({ translation: { ...AUTO, apiKeyEnv: 'ADD_RESOURCE_SPEC_UNSET_KEY' } }).onMutation,
          },
          {
            key: 'common.ok',
            baseValue: 'OK',
          },
          {},
        ),
      ).rejects.toMatchObject({ code: 'MISSING_API_KEY' });
      expect(existsSync(join(root, 'translations', 'common', 'resource_entries.json'))).toBe(false);
    });

    it('keeps an explicitly verified untranslated copy', async () => {
      await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        {
          key: 'ok',
          baseValue: 'OK',
          translations: [{ locale: 'fr', value: 'OK', status: 'verified' }],
        },
        {},
      );

      expect(read('tracker_meta.json').ok.fr.status).toBe('verified');
    });

    it.each([
      ['OK', 'new'],
      ['Oui', 'translated'],
    ] as const)('infers %s as %s when a supplied translation has no status', async (value, status) => {
      const result = await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        {
          key: 'ok',
          baseValue: 'OK',
          translations: [{ locale: 'fr', value }],
        },
        {},
      );

      expect(read('tracker_meta.json').ok.fr.status).toBe(status);
      expect(result.translations[0]?.status).toBe(status);
    });

    it('keeps an explicit translated status on an identical copy', async () => {
      await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        {
          key: 'ok',
          baseValue: 'OK',
          translations: [{ locale: 'fr', value: 'OK', status: 'translated' }],
        },
        {},
      );

      expect(read('tracker_meta.json').ok.fr.status).toBe('translated');
    });

    it('rejects an unknown base-locale translation status before writing', async () => {
      await expect(
        addResource(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          { key: 'ok', baseValue: 'OK', translations: [{ locale: 'en', value: 'x', status: 'bogus' as never }] },
          {},
        ),
      ).rejects.toThrow(InvalidTranslationStatusError);
      expect(existsSync(join(root, 'translations'))).toBe(false);
      expect(collected).toEqual([]);
    });

    it('rejects an unknown translation status before writing', async () => {
      await expect(
        addResource(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          {
            key: 'ok',
            baseValue: 'OK',
            translations: [{ locale: 'fr', value: 'Oui', status: 'verifed' as never }],
          },
          {},
        ),
      ).rejects.toThrow(InvalidTranslationStatusError);
      expect(existsSync(join(root, 'translations', 'resource_entries.json'))).toBe(false);
    });

    it('takes base and target locales from the collection only', async () => {
      await addResource(
        {
          ...collection({ baseLocale: 'fr', locales: ['fr', 'en'] }),
          onMutation: onMutation ?? collection({ baseLocale: 'fr', locales: ['fr', 'en'] }).onMutation,
        },
        {
          key: 'ok',
          baseValue: "D'accord",
          translations: [{ locale: 'fr', value: 'ignored: base locale', status: 'translated' }],
        },
        {},
      );

      expect(read('resource_entries.json').ok).toEqual({ source: "D'accord", en: "D'accord" });
      expect(Object.keys(read('tracker_meta.json').ok)).toEqual(['fr', 'en']);
    });

    it('rejects a translation for a locale the collection does not have', async () => {
      await expect(
        addResource(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          {
            key: 'ok',
            baseValue: 'OK',
            translations: [{ locale: 'ja', value: 'OK', status: 'translated' }],
          },
          {},
        ),
      ).rejects.toThrow(LocaleNotFoundError);
      expect(existsSync(join(root, 'translations'))).toBe(false);
    });
  });

  describe('entry', () => {
    it('stores comment and normalized tags', async () => {
      await addResource(
        { ...collection({ locales: ['en'] }), onMutation: onMutation ?? collection({ locales: ['en'] }).onMutation },
        {
          key: 'ok',
          baseValue: 'OK',
          comment: 'Button',
          tags: ['UI', 'ui', ' forms '],
        },
        {},
      );

      expect(read('resource_entries.json').ok).toEqual({ source: 'OK', comment: 'Button', tags: ['ui', 'forms'] });
    });

    it('places the key under targetFolder', async () => {
      const result = await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        {
          key: 'buttons.ok',
          baseValue: 'OK',
          targetFolder: 'apps.common',
        },
        {},
      );

      expect(result.resolvedKey).toBe('apps.common.buttons.ok');
      expect(read('resource_entries.json', 'apps', 'common', 'buttons').ok.source).toBe('OK');
    });

    it('normalizes Transloco placeholders to ICU in base and translations', async () => {
      await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        {
          key: 'hello',
          baseValue: 'Hello {{ name }}',
          translations: [{ locale: 'fr', value: 'Bonjour {{name}}', status: 'translated' }],
        },
        {},
      );

      expect(read('resource_entries.json').hello).toEqual({
        source: 'Hello {name}',
        fr: 'Bonjour {name}',
        de: 'Hello {name}',
      });
    });

    it('replaces an existing entry, keeps its position, and reports created: false', async () => {
      const target = collection();
      await addResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        { key: 'a', baseValue: 'A', comment: 'old' },
        {},
      );
      await addResource({ ...target, onMutation: onMutation ?? target.onMutation }, { key: 'b', baseValue: 'B' }, {});

      const result = await addResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        { key: 'a', baseValue: 'A2' },
        { onExisting: 'replace' },
      );

      expect(result.created).toBe(false);
      expect(Object.keys(read('resource_entries.json'))).toEqual(['a', 'b']);
      expect(read('resource_entries.json').a).toEqual({ source: 'A2', fr: 'A2', de: 'A2' });
    });

    it('fails by default on an existing key and leaves both files byte-identical', async () => {
      const target = collection();
      await addResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        { key: 'common.ok', baseValue: 'Old' },
        {},
      );
      const entriesPath = join(root, 'translations', 'common', 'resource_entries.json');
      const metaPath = join(root, 'translations', 'common', 'tracker_meta.json');
      const entriesBefore = readFileSync(entriesPath);
      const metaBefore = readFileSync(metaPath);

      await expect(
        addResource(
          { ...target, onMutation: onMutation ?? target.onMutation },
          { key: 'common.ok', baseValue: 'New' },
          {},
        ),
      ).rejects.toThrow(ResourceAlreadyExistsError);

      expect(readFileSync(entriesPath)).toEqual(entriesBefore);
      expect(readFileSync(metaPath)).toEqual(metaBefore);
    });

    it('does not call the translation provider when the key exists and the policy is fail', async () => {
      const target = collection({ translation: AUTO });
      await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { key: 'common.ok', baseValue: 'Old' },
        {},
      );
      const provider = new InMemoryTranslationProvider();

      await expect(
        addResource(
          { ...target, onMutation: onMutation ?? target.onMutation },
          { key: 'common.ok', baseValue: 'New' },
          { provider, onExisting: 'fail' },
        ),
      ).rejects.toThrow(ResourceAlreadyExistsError);
      expect(provider.calls).toEqual([]);
    });

    it('refuses a key created during translation without changing the late entry or another folder', async () => {
      const target = collection({ translation: AUTO });
      await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { key: 'stable.keep', baseValue: 'Keep' },
        {},
      );
      const stableEntriesPath = join(root, 'translations', 'stable', 'resource_entries.json');
      const stableMetaPath = join(root, 'translations', 'stable', 'tracker_meta.json');
      const stableEntriesBefore = readFileSync(stableEntriesPath);
      const stableMetaBefore = readFileSync(stableMetaPath);
      const entriesPath = join(root, 'translations', 'common', 'resource_entries.json');
      const metaPath = join(root, 'translations', 'common', 'tracker_meta.json');
      let entriesAfterProvider: Buffer | undefined;
      let metaAfterProvider: Buffer | undefined;
      const provider = new InMemoryTranslationProvider(() => {
        const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
          runtime: 'transloco-messageformat',
          baseLocale: 'en',
        });
        folder.setEntry('ok', { source: 'Concurrent' }, {});
        folder.setBase('ok', 'Concurrent');
        folder.save();
        entriesAfterProvider = readFileSync(entriesPath);
        metaAfterProvider = readFileSync(metaPath);
        return 'Translated';
      });

      await expect(
        addResource(
          { ...target, onMutation: onMutation ?? target.onMutation },
          { key: 'common.ok', baseValue: 'Requested' },
          { provider, onExisting: 'fail' },
        ),
      ).rejects.toMatchObject({ key: 'common.ok' });

      expect(provider.calls.length).toBeGreaterThan(0);
      expect(readFileSync(entriesPath)).toEqual(entriesAfterProvider);
      expect(readFileSync(metaPath)).toEqual(metaAfterProvider);
      expect(readFileSync(stableEntriesPath)).toEqual(stableEntriesBefore);
      expect(readFileSync(stableMetaPath)).toEqual(stableMetaBefore);
      expect(read('resource_entries.json', 'common').ok.source).toBe('Concurrent');
    });

    it('reports created false when replace finds a key created during translation', async () => {
      const target = collection({ translation: AUTO });
      const provider = new InMemoryTranslationProvider(() => {
        const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
          runtime: 'transloco-messageformat',
          baseLocale: 'en',
        });
        folder.setEntry('ok', { source: 'Concurrent' }, {});
        folder.setBase('ok', 'Concurrent');
        folder.save();
        return 'Translated';
      });

      const result = await addResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        { key: 'common.ok', baseValue: 'Requested' },
        { provider, onExisting: 'replace' },
      );

      expect(result.created).toBe(false);
      expect(read('resource_entries.json', 'common').ok.source).toBe('Requested');
    });

    it('resolves targetFolder before checking whether the key exists', async () => {
      const target = collection();
      await addResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        { key: 'apps.common.ok', baseValue: 'Old' },
        {},
      );

      await expect(
        addResource(
          { ...target, onMutation: onMutation ?? target.onMutation },
          { key: 'ok', targetFolder: 'apps.common', baseValue: 'New' },
          {},
        ),
      ).rejects.toMatchObject({ key: 'apps.common.ok' });
      expect(read('resource_entries.json', 'apps', 'common').ok.source).toBe('Old');
    });

    it('returns an upsert mutation for the stored entry', async () => {
      const target: Collection = collection();
      const result = await addResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        { key: 'common.ok', baseValue: 'OK' },
        {},
      );

      expect(result.created).toBe(true);
      expect(collected).toEqual([
        expect.objectContaining({ kind: 'upsert', translationsFolder: target.translationsFolder, key: 'common.ok' }),
      ]);
    });

    it.each([
      ['a key with path traversal', { key: '../evil', baseValue: 'x' }],
      ['a malformed targetFolder', { key: 'ok', baseValue: 'x', targetFolder: '../evil' }],
    ])('rejects %s and creates nothing', async (_label, params) => {
      await expect(
        addResource({ ...collection(), onMutation: onMutation ?? collection().onMutation }, params, {}),
      ).rejects.toThrow(InvalidResourceKeyError);
      expect(existsSync(join(root, 'translations'))).toBe(false);
    });
  });

  describe('terminology (Project Terms)', () => {
    const rules = [{ discouraged: 'Expenditure', preferred: 'Investment', reason: 'Finance style guide' }];

    it('returns one finding per discouraged term in the stored base value, and still adds it', async () => {
      writeFileSync(join(root, '.lingo-tracker-preferred-terminology.json'), JSON.stringify(rules), 'utf8');

      const result = await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { key: 'budget.title', baseValue: 'Capital expenditure' },
        {},
      );

      expect(result.terminology).toEqual({
        findings: [
          {
            key: 'budget.title',
            discouraged: 'Expenditure',
            preferred: 'Investment',
            reason: 'Finance style guide',
            message: 'consider "Investment" instead of "Expenditure"',
          },
        ],
        problems: [],
      });
      expect(read('resource_entries.json', 'budget').title.source).toBe('Capital expenditure');
    });

    it('returns no findings and no problems when there is no rule file', async () => {
      const result = await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { key: 'budget.title', baseValue: 'Capital expenditure' },
        {},
      );

      expect(result.terminology).toEqual({ findings: [], problems: [] });
    });

    it('checks the stored ICU value, not the Transloco input', async () => {
      const termRules = [{ discouraged: 'total', preferred: 'sum' }];
      writeFileSync(join(root, '.lingo-tracker-preferred-terminology.json'), JSON.stringify(termRules), 'utf8');
      vi.mocked(findPreferredTermFindings).mockClear();

      const result = await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { key: 'budget.sum', baseValue: 'The total: {{ total }}' },
        {},
      );

      expect(read('resource_entries.json', 'budget').sum.source).toBe('The total: {total}');
      expect(findPreferredTermFindings).toHaveBeenCalledWith('The total: {total}', termRules);
      expect(result.terminology.findings.map(({ discouraged }) => discouraged)).toEqual(['total']);
    });

    it('adds a named protected-terms file that does not exist to problems when auto-translation ran', async () => {
      const config: LingoTrackerConfig = {
        exportFolder: 'dist',
        importFolder: 'import',
        baseLocale: 'en',
        locales: ['en', 'fr'],
        protectedTermsFile: 'typo.json',
        translation: AUTO,
        collections: { main: { translationsFolder: join(root, 'translations') } },
      };
      const named = openCollection(config, 'main', { cwd: root });
      const provider = new InMemoryTranslationProvider();

      const translated = await addResource(
        { ...named, onMutation: onMutation ?? named.onMutation },
        { key: 'a.ok', baseValue: 'OK' },
        { provider },
      );
      const manual = await addResource(
        {
          ...openCollection({ ...config, translation: undefined }, 'main', { cwd: root }),
          onMutation:
            onMutation ?? openCollection({ ...config, translation: undefined }, 'main', { cwd: root }).onMutation,
        },
        {
          key: 'a.no',
          baseValue: 'No',
        },
        {},
      );

      expect(translated.terminology.problems).toEqual([
        `Protected terms file not found: ${join(root, 'typo.json')}. Treating as an empty list.`,
      ]);
      // Without auto-translation nothing is guarded, so the missing file limits nothing.
      expect(manual.terminology.problems).toEqual([]);
    });

    it('reports a broken rule file as a problem and skips the check', async () => {
      const rulesPath = join(root, '.lingo-tracker-preferred-terminology.json');
      writeFileSync(rulesPath, 'not json', 'utf8');

      const result = await addResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { key: 'budget.title', baseValue: 'Capital expenditure' },
        {},
      );

      expect(result.terminology.findings).toEqual([]);
      expect(result.terminology.problems).toEqual([
        expect.stringContaining(
          `Preferred terminology checks skipped: Preferred terminology file is not valid JSON: ${rulesPath}`,
        ),
      ]);
    });
  });
});
