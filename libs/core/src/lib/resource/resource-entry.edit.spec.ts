import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPreferredTermFindings } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import type { TranslationConfig } from '../../config/translation-config';
import { type Collection, openCollection } from '../config/open-collection';
import {
  BracedPlaceholderError,
  CoreOperationError,
  InvalidBaseValueError,
  InvalidResourceKeyError,
  InvalidTranslationStatusError,
  LocaleNotFoundError,
  ResourceAlreadyExistsError,
  ResourceNotFoundError,
  TranslationError,
} from '../errors/lingo-tracker-error';
import { writeJsonFile } from '../file-io/json-file-operations';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
import { calculateChecksum as md5 } from './checksum';
import { editResource } from './resource-entry';
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

vi.mock('../file-io/json-file-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../file-io/json-file-operations')>();
  return { ...actual, writeJsonFile: vi.fn(actual.writeJsonFile) };
});

// Wrapped, not replaced: the specs below check which value the terminology check is given.
vi.mock('@simoncodes-ca/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/domain')>();
  return { ...actual, findPreferredTermFindings: vi.fn(actual.findPreferredTermFindings) };
});

const AUTO: TranslationConfig = { enabled: true, provider: 'google-translate', apiKeyEnv: 'KEY' };

describe('editResource (real fs)', () => {
  let root: string;

  function collection(translation?: TranslationConfig): Collection {
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'de', 'es'],
      collections: { main: { translationsFolder: join(root, 'translations') } },
      ...(translation && { translation }),
    };
    return openCollection(config, 'main', { cwd: root });
  }

  /**
   * Writes `common.save` with base "Save": fr a real translation (verified), de an untranslated
   * copy (new), es missing.
   */
  function seedEntry(): void {
    const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
      runtime: 'transloco-messageformat',
      baseLocale: 'en',
    });
    folder.setBase('save', 'Save');
    folder.setTranslation('save', 'fr', 'Enregistrer', 'verified');
    folder.setTranslation('save', 'de', 'Save', 'new');
    folder.save();
  }

  function read(file: 'resource_entries.json' | 'tracker_meta.json', ...segments: string[]) {
    return JSON.parse(readFileSync(join(root, 'translations', ...segments, file), 'utf8'));
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'edit-resource-'));
    seedEntry();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects empty base edits before writes, moves or translation', async () => {
    const provider = new InMemoryTranslationProvider();
    const paths = ['resource_entries.json', 'tracker_meta.json'].map((file) =>
      join(root, 'translations', 'common', file),
    );
    const before = paths.map((path) => readFileSync(path));
    for (const baseValue of ['', '   ', '\t\n']) {
      await expect(
        editResource(
          { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
          'common.save',
          { baseValue, comment: 'Changed', moveTo: 'new' },
          { provider },
        ),
      ).rejects.toThrow(InvalidBaseValueError);
      await expect(editResource(collection(AUTO), 'common.save', { baseValue }, { provider })).rejects.toThrow(
        'Base value must not be empty.',
      );
      expect(paths.map((path) => readFileSync(path))).toEqual(before);
      expect(existsSync(join(root, 'translations', 'new'))).toBe(false);
    }
    expect(provider.calls).toEqual([]);
    expect(collected).toEqual([]);
  });

  it('allows details and translations to change when the base value is undefined', async () => {
    const provider = new InMemoryTranslationProvider();
    await editResource(
      collection(AUTO),
      'common.save',
      {
        baseValue: undefined,
        comment: 'Context',
        tags: ['ui'],
        translations: { fr: { value: 'Sauver' } },
      },
      { provider },
    );
    expect(read('resource_entries.json', 'common')).toMatchObject({
      save: { source: 'Save', comment: 'Context', tags: ['ui'], fr: 'Sauver' },
    });
    expect(provider.calls).toEqual([]);
  });

  it.each([{ baseValue: '{{{a}}}' }, { baseValue: 'Changed', translations: { fr: { value: '{{{a}}}' } } }])(
    'rejects braced edits without changing files: %j',
    async (changes) => {
      seedEntry();
      const entriesPath = join(root, 'translations', 'common', 'resource_entries.json');
      const metaPath = join(root, 'translations', 'common', 'tracker_meta.json');
      const before = [readFileSync(entriesPath), readFileSync(metaPath)];
      await expect(
        editResource(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          'common.save',
          { ...changes, moveTo: 'other' },
          {},
        ),
      ).rejects.toThrow(BracedPlaceholderError);
      expect([readFileSync(entriesPath), readFileSync(metaPath)]).toEqual(before);
      expect(existsSync(join(root, 'translations', 'other'))).toBe(false);
      expect(collected).toEqual([]);
    },
  );
  it.each(['Hi', '{{{s}}}'])(
    'applies a comment edit while holding unchanged braced values (source=%s)',
    async (source) => {
      const value = '{{{a}}}';
      const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      });
      folder.setEntry(
        'save',
        { source, fr: value },
        {
          en: { checksum: md5(source) },
          fr: { checksum: md5(value), baseChecksum: md5(source), status: 'verified' },
        },
      );
      folder.save();
      const beforeMeta = readFileSync(join(root, 'translations', 'common', 'tracker_meta.json'));
      const result = await editResource(collection(), 'common.save', {
        baseValue: source,
        translations: { fr: { value } },
        comment: 'Updated comment',
      });
      expect(result.updated).toBe(true);
      expect(read('resource_entries.json', 'common').save).toEqual({ source, fr: value, comment: 'Updated comment' });
      expect(readFileSync(join(root, 'translations', 'common', 'tracker_meta.json'))).toEqual(beforeMeta);
    },
  );

  it.each([{ baseValue: '{{{changed}}}' }, { translations: { fr: { value: '{{{changed}}}' } } }])(
    'rejects changed braced values in a legacy entry without writes: %j',
    async (changes) => {
      const value = '{{{a}}}';
      const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      });
      folder.setEntry(
        'save',
        { source: value, fr: value },
        {
          en: { checksum: md5(value) },
          fr: { checksum: md5(value), baseChecksum: md5(value), status: 'new' },
        },
      );
      folder.save();
      const paths = ['resource_entries.json', 'tracker_meta.json'].map((file) =>
        join(root, 'translations', 'common', file),
      );
      const before = paths.map((path) => readFileSync(path));
      await expect(editResource(collection(), 'common.save', { ...changes, comment: 'Changed' })).rejects.toThrow(
        BracedPlaceholderError,
      );
      expect(paths.map((path) => readFileSync(path))).toEqual(before);
    },
  );

  it('ignores a braced translation for the base locale during an edit', async () => {
    const before = read('resource_entries.json', 'common').save;
    const metaPath = join(root, 'translations', 'common', 'tracker_meta.json');
    const beforeMeta = readFileSync(metaPath);
    const result = await editResource(collection(), 'common.save', {
      comment: 'Changed',
      translations: { en: { value: '{{{ignored}}}' } },
    });
    expect(result.updated).toBe(true);
    expect(read('resource_entries.json', 'common').save).toEqual({ ...before, comment: 'Changed' });
    expect(readFileSync(metaPath)).toEqual(beforeMeta);
  });

  it('stores accepted placeholder-only case bodies in base and translation edits with their metadata', async () => {
    const value = '{n, plural, other {{{a}}}}';
    const stored = '{n, plural, other {{a}}}';
    await editResource(collection(), 'common.save', {
      baseValue: value,
      translations: { fr: { value, status: 'verified' } },
    });
    expect(read('resource_entries.json', 'common')).toEqual({
      save: { source: stored, fr: stored, de: stored, es: stored },
    });
    expect(read('tracker_meta.json', 'common')).toEqual({
      save: {
        en: { checksum: md5(stored) },
        fr: { checksum: md5(stored), baseChecksum: md5(stored), status: 'verified' },
        de: { checksum: md5(stored), baseChecksum: md5(stored), status: 'new' },
        es: { checksum: md5(stored), baseChecksum: md5(stored), status: 'new' },
      },
    });
  });

  it('throws ResourceNotFoundError for a missing entry', async () => {
    await expect(
      editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.missing',
        { comment: 'x' },
        {},
      ),
    ).rejects.toThrow(ResourceNotFoundError);
    await expect(
      editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'nowhere.save',
        { comment: 'x' },
        {},
      ),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('reports no changes and writes nothing when nothing differs', async () => {
    const result = await editResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      'common.save',
      { baseValue: 'Save', translations: {} },
      {},
    );

    expect(result).toEqual({
      resolvedKey: 'common.save',
      updated: false,
      message: 'No changes detected',
    });
    expect(collected).toEqual([]);
  });

  describe('base value change', () => {
    it('keeps real translations as `stale` and re-seeds copies and missing locales as `new`', async () => {
      const provider = new InMemoryTranslationProvider();

      const result = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { baseValue: 'Save all' },
        { provider },
      );

      expect(read('resource_entries.json', 'common').save).toEqual({
        source: 'Save all',
        fr: 'Enregistrer',
        de: 'Save all',
        es: 'Save all',
      });
      const meta = read('tracker_meta.json', 'common').save;
      expect(meta.en).toEqual({ checksum: md5('Save all') });
      expect(meta.fr).toEqual({ checksum: md5('Enregistrer'), baseChecksum: md5('Save all'), status: 'stale' });
      expect(meta.de).toEqual({ checksum: md5('Save all'), baseChecksum: md5('Save all'), status: 'new' });
      expect(meta.es.status).toBe('new');
      expect(result.updated).toBe(true);
      expect(result.skippedLocales).toBeUndefined();
      expect(provider.calls).toEqual([]);
    });

    it('auto-translates every locale that needs work, except those supplied in the same edit', async () => {
      // es loses the placeholder marker, so the Translator skips it.
      const provider = new InMemoryTranslationProvider(({ text, targetLocale }) =>
        targetLocale === 'de' ? text.replace('Save all', 'Alles speichern') : 'Guardar todo',
      );

      const result = await editResource(
        { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
        'common.save',
        {
          baseValue: 'Save all {count}',
          translations: { fr: { value: 'Tout enregistrer {count}', status: 'translated' } },
        },
        { provider },
      );

      expect(provider.calls.map((call) => call.map(({ targetLocale }) => targetLocale))).toEqual([['de'], ['es']]);
      expect(read('resource_entries.json', 'common').save).toEqual({
        source: 'Save all {count}',
        fr: 'Tout enregistrer {count}',
        de: 'Alles speichern {count}',
        es: 'Save all {count}',
      });
      const meta = read('tracker_meta.json', 'common').save;
      expect(meta.fr.status).toBe('translated');
      expect(meta.de).toEqual({
        checksum: md5('Alles speichern {count}'),
        baseChecksum: md5('Save all {count}'),
        status: 'translated',
      });
      expect(meta.es.status).toBe('new');
      expect(result.skippedLocales).toEqual(['es']);
    });

    it('keeps the saved edit when the provider fails', async () => {
      const provider = new InMemoryTranslationProvider(() => {
        throw new TranslationError('down', 'SERVICE_ERROR', true);
      });

      await expect(
        editResource(
          { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
          'common.save',
          { baseValue: 'Save all' },
          { provider },
        ),
      ).rejects.toThrow(TranslationError);

      expect(read('resource_entries.json', 'common').save.source).toBe('Save all');
      expect(read('tracker_meta.json', 'common').save.fr.status).toBe('stale');
      expect(collected).toEqual([expect.objectContaining({ kind: 'upsert', key: 'common.save' })]);
    });

    it('does not seed anything when only the comment changes', async () => {
      const provider = new InMemoryTranslationProvider();

      await editResource(
        { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
        'common.save',
        { comment: 'Toolbar button' },
        { provider },
      );

      expect(provider.calls).toEqual([]);
      expect(read('resource_entries.json', 'common').save.es).toBeUndefined();
    });

    it('normalizes a Transloco base value to ICU', async () => {
      await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { baseValue: 'Save {{ count }}' },
        {},
      );

      expect(read('resource_entries.json', 'common').save.source).toBe('Save {count}');
    });
  });

  describe('details and translations', () => {
    it('stores a Transloco translation as ICU with its normalized checksum', async () => {
      await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { translations: { fr: { value: 'Bonjour {{ name }}', status: 'verified' } } },
        {},
      );

      expect(read('resource_entries.json', 'common').save.fr).toBe('Bonjour {name}');
      expect(read('tracker_meta.json', 'common').save.fr).toEqual({
        checksum: md5('Bonjour {name}'),
        baseChecksum: md5('Save'),
        status: 'verified',
      });
    });

    it('does nothing when the value is unchanged and no status is requested', async () => {
      expect(
        (
          await editResource(
            { ...collection(), onMutation: onMutation ?? collection().onMutation },
            'common.save',
            {
              translations: { de: { value: 'Save' }, fr: { value: 'Enregistrer' } },
            },
            {},
          )
        ).updated,
      ).toBe(false);
      expect(read('tracker_meta.json', 'common').save.de.status).toBe('new');
      expect(read('tracker_meta.json', 'common').save.fr.status).toBe('verified');
    });

    it('changes an identical copy to explicit translated without changing its value', async () => {
      await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        {
          translations: { de: { value: 'Save', status: 'translated' } },
        },
        {},
      );
      expect(read('tracker_meta.json', 'common').save.de.status).toBe('translated');
    });

    it('infers new for a changed value that copies the base', async () => {
      await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { translations: { fr: { value: 'Save' } } },
        {},
      );
      expect(read('tracker_meta.json', 'common').save.fr.status).toBe('new');
    });

    it('keeps explicit translated for a changed value that copies the base', async () => {
      await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        {
          translations: { fr: { value: 'Save', status: 'translated' } },
        },
        {},
      );
      expect(read('tracker_meta.json', 'common').save.fr.status).toBe('translated');
    });

    it('changes only an explicitly requested status for an unchanged value', async () => {
      const metaPath = join(root, 'translations', 'common', 'tracker_meta.json');
      const metadata = read('tracker_meta.json', 'common');
      metadata.save.fr.baseChecksum = 'old-base';
      writeFileSync(metaPath, JSON.stringify(metadata));

      await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        {
          translations: { fr: { value: 'Enregistrer', status: 'stale' } },
        },
        {},
      );

      expect(read('tracker_meta.json', 'common').save.fr).toEqual({
        checksum: md5('Enregistrer'),
        baseChecksum: 'old-base',
        status: 'stale',
      });
    });

    it('rejects an unknown base-locale translation status without changing files', async () => {
      const paths = ['resource_entries.json', 'tracker_meta.json'].map((file) =>
        join(root, 'translations', 'common', file),
      );
      const before = paths.map((path) => readFileSync(path));
      await expect(
        editResource(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          'common.save',
          { comment: 'Changed', translations: { en: { value: 'x', status: 'bogus' as never } } },
          {},
        ),
      ).rejects.toThrow(InvalidTranslationStatusError);
      expect(paths.map((path) => readFileSync(path))).toEqual(before);
      expect(collected).toEqual([]);
    });

    it('rejects an unknown status before changing the resource', async () => {
      await expect(
        editResource(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          'common.save',
          {
            translations: { fr: { value: 'Autre', status: 'verifed' as never } },
          },
          {},
        ),
      ).rejects.toThrow(InvalidTranslationStatusError);
      expect(read('resource_entries.json', 'common').save.fr).toBe('Enregistrer');
    });

    it('updates comment and normalized tags', async () => {
      await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { comment: 'Button', tags: ['UI', 'forms'] },
        {},
      );

      const entry = read('resource_entries.json', 'common').save;
      expect(entry.comment).toBe('Button');
      expect(entry.tags).toEqual(['ui', 'forms']);
    });

    it('writes a translation with status `translated` by default, or the supplied status', async () => {
      await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        {
          translations: { de: { value: 'Speichern' }, es: { value: 'Guardar', status: 'verified' } },
        },
        {},
      );

      const meta = read('tracker_meta.json', 'common').save;
      expect(meta.de.status).toBe('translated');
      expect(meta.es.status).toBe('verified');
      expect(read('resource_entries.json', 'common').save.de).toBe('Speichern');
    });

    it('changes only the status when the value is unchanged', async () => {
      await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        {
          translations: { fr: { value: 'Enregistrer', status: 'stale' } },
        },
        {},
      );

      const meta = read('tracker_meta.json', 'common').save;
      expect(meta.fr).toEqual({ checksum: md5('Enregistrer'), baseChecksum: md5('Save'), status: 'stale' });
    });

    it('ignores a value for the base locale', async () => {
      const result = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { translations: { en: { value: 'Nope' } } },
        {},
      );

      expect(result.updated).toBe(false);
      expect(read('resource_entries.json', 'common').save.source).toBe('Save');
    });

    it('rejects a locale the collection does not have', async () => {
      await expect(
        editResource(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          'common.save',
          { translations: { ja: { value: '保存' } } },
          {},
        ),
      ).rejects.toThrow(LocaleNotFoundError);
    });
  });

  it('still writes new copies when auto-translation is disabled, using the stored ICU snapshot', async () => {
    const result = await editResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      'common.save',
      { baseValue: 'Save {{ name }}' },
      {},
    );

    expect(result.entry?.source).toBe('Save {name}');
    expect(result.entry?.translations).toMatchObject({ fr: 'Enregistrer', de: 'Save {name}', es: 'Save {name}' });
    expect(result.entry?.metadata['de']?.status).toBe('new');
    expect(result.entry?.metadata['es']?.status).toBe('new');
    expect(result.skippedLocales).toBeUndefined();
    expect(collected).toHaveLength(2);
  });

  describe('moveTo', () => {
    it('delivers the saved edit and a reindex when the move write fails', async () => {
      const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
        '../file-io/json-file-operations',
      );
      const writer = vi.mocked(writeJsonFile);
      writer.mockImplementation((options) => {
        if (options.filePath.endsWith(join('dialogs', 'resource_entries.json'))) {
          throw new Error('destination write failed');
        }
        return actual.writeJsonFile(options);
      });
      try {
        await expect(
          editResource(
            { ...collection(), onMutation: onMutation ?? collection().onMutation },
            'common.save',
            { comment: 'Edited', moveTo: 'dialogs' },
            {},
          ),
        ).rejects.toThrow(CoreOperationError);
      } finally {
        writer.mockImplementation(actual.writeJsonFile);
      }
      expect(collected).toEqual([
        expect.objectContaining({ kind: 'upsert', key: 'common.save' }),
        { kind: 'reindex', translationsFolder: collection().translationsFolder },
      ]);
    });

    it('moves the edited entry into another folder, keeping its entry key', async () => {
      const target = collection();
      const result = await editResource(
        { ...target, onMutation: onMutation ?? target.onMutation },
        'common.save',
        { comment: 'Moved', moveTo: 'dialogs.actions' },
        {},
      );

      expect(result.resolvedKey).toBe('dialogs.actions.save');
      expect(result.entry?.comment).toBe('Moved');
      expect(read('resource_entries.json', 'dialogs', 'actions').save).toEqual({
        source: 'Save',
        comment: 'Moved',
        fr: 'Enregistrer',
        de: 'Save',
      });
      expect(read('tracker_meta.json', 'dialogs', 'actions').save.fr.status).toBe('verified');
      expect(existsSync(join(root, 'translations', 'common', 'resource_entries.json'))).toBe(false);
      expect(collected).toEqual([
        expect.objectContaining({ kind: 'upsert', key: 'common.save', translationsFolder: target.translationsFolder }),
        expect.objectContaining({ kind: 'remove', key: 'common.save', translationsFolder: target.translationsFolder }),
        expect.objectContaining({ kind: 'upsert', key: 'dialogs.actions.save' }),
        { kind: 'remove-folder', path: 'common', translationsFolder: target.translationsFolder },
      ]);
    });

    it('moves the entry to the collection root with an empty moveTo, even with no other change', async () => {
      const result = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { moveTo: '' },
        {},
      );

      expect(result.updated).toBe(true);
      expect(result.resolvedKey).toBe('save');
      expect(read('resource_entries.json').save.source).toBe('Save');
    });

    it('moves the entry to the collection root with a whitespace-only moveTo', async () => {
      const result = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { moveTo: '   ' },
        {},
      );

      expect(result.updated).toBe(true);
      expect(result.resolvedKey).toBe('save');
      expect(read('resource_entries.json').save.source).toBe('Save');
      expect(existsSync(join(root, 'translations', 'common', 'resource_entries.json'))).toBe(false);
    });

    it('edits in place when moveTo is the current folder', async () => {
      const result = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { comment: 'Same', moveTo: 'common' },
        {},
      );

      expect(result.resolvedKey).toBe('common.save');
      expect(collected).toEqual([expect.objectContaining({ kind: 'upsert', key: 'common.save' })]);
      expect(read('resource_entries.json', 'common').save.comment).toBe('Same');
    });

    it('refuses to overwrite an entry at the destination and changes nothing', async () => {
      const other = openUnreportedResourceFolder(join(root, 'translations', 'dialogs'), {
        runtime: 'transloco-messageformat',
        baseLocale: 'en',
      });
      other.setBase('save', 'Other');
      other.save();

      await expect(
        editResource(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          'common.save',
          { comment: 'Lost?', moveTo: 'dialogs' },
          {},
        ),
      ).rejects.toThrow(ResourceAlreadyExistsError);
      expect(read('resource_entries.json', 'common').save.comment).toBeUndefined();
      expect(read('resource_entries.json', 'dialogs').save.source).toBe('Other');
    });

    it('rejects a malformed destination folder', async () => {
      await expect(
        editResource(
          { ...collection(), onMutation: onMutation ?? collection().onMutation },
          'common.save',
          { moveTo: '../evil' },
          {},
        ),
      ).rejects.toThrow(InvalidResourceKeyError);
    });

    describe('while auto-translation is awaited', () => {
      /** A provider that waits until `release()`; `called` resolves once the edit is awaiting it. */
      function holdProvider(): { provider: InMemoryTranslationProvider; called: Promise<void>; release: () => void } {
        let release = (): void => undefined;
        let markCalled = (): void => undefined;
        const called = new Promise<void>((resolve) => {
          markCalled = resolve;
        });
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const provider = new InMemoryTranslationProvider();
        const translate = provider.translate.bind(provider);
        provider.translate = async (requests) => {
          markCalled();
          await held;
          return translate(requests);
        };
        return { provider, called, release: () => release() };
      }

      function writeDestinationEntry(key: string, value: string): void {
        const other = openUnreportedResourceFolder(join(root, 'translations', 'dialogs'), {
          runtime: 'transloco-messageformat',
          baseLocale: 'en',
        });
        other.setBase(key, value);
        other.save();
      }

      it('preserves a sibling written to the same folder during phase 2', async () => {
        const provider = holdProvider();
        const editing = editResource(
          { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
          'common.save',
          { baseValue: 'Save all' },
          { provider: provider.provider },
        );
        await provider.called;
        const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
          runtime: 'transloco-messageformat',
          baseLocale: 'en',
        });
        folder.setBase('cancel', 'Cancel');
        folder.setTranslation('cancel', 'fr', 'Annuler', 'verified');
        folder.save();
        provider.release();
        const result = await editing;

        expect(result.entry?.translations['fr']).toBe('[fr] Save all');
        expect(read('resource_entries.json', 'common').cancel).toEqual({ source: 'Cancel', fr: 'Annuler' });
        expect(read('tracker_meta.json', 'common').cancel.fr.status).toBe('verified');
        expect(collected).toHaveLength(2);
        expect(collected[1]).toEqual({
          kind: 'upsert',
          translationsFolder: collection().translationsFolder,
          key: 'common.save',
          entry: result.entry,
        });
      });

      it('keeps a manual fr translation and reports it as skipped', async () => {
        const provider = holdProvider();
        const editing = editResource(
          { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
          'common.save',
          { baseValue: 'Save all' },
          { provider: provider.provider },
        );
        await provider.called;
        const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
          runtime: 'transloco-messageformat',
          baseLocale: 'en',
        });
        folder.setTranslation('save', 'fr', 'Humain', 'translated');
        folder.save();
        provider.release();
        const result = await editing;

        expect(result.skippedLocales).toEqual(['fr']);
        expect(result.entry?.translations['fr']).toBe('Humain');
        expect(result.entry?.translations['de']).toBe('[de] Save all');
        expect(read('resource_entries.json', 'common').save.fr).toBe('Humain');
        expect(read('tracker_meta.json', 'common').save.fr.status).toBe('translated');
      });

      it('throws ResourceNotFoundError after deletion without resurrecting the entry', async () => {
        const provider = holdProvider();
        const editing = editResource(
          { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
          'common.save',
          { baseValue: 'Save all' },
          { provider: provider.provider },
        );
        await provider.called;
        const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
          runtime: 'transloco-messageformat',
          baseLocale: 'en',
        });
        expect(folder.get('save')?.entry.source).toBe('Save all');
        folder.remove('save');
        folder.save();
        provider.release();

        await expect(editing).rejects.toThrow(ResourceNotFoundError);
        expect(
          openUnreportedResourceFolder(join(root, 'translations', 'common'), {
            runtime: 'transloco-messageformat',
            baseLocale: 'en',
          }).has('save'),
        ).toBe(false);
        expect(collected).toEqual([expect.objectContaining({ kind: 'upsert', key: 'common.save' })]);
      });

      it('throws ResourceNotFoundError for the source deleted during translation before a move', async () => {
        const target = collection(AUTO);
        const provider = new InMemoryTranslationProvider(({ text, targetLocale }) => {
          const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
            runtime: 'transloco-messageformat',
            baseLocale: 'en',
          });
          if (folder.has('save')) {
            expect(folder.get('save')?.entry.source).toBe('Save all');
            folder.remove('save');
            folder.save();
          }
          return `[${targetLocale}] ${text}`;
        });

        const editing = editResource(
          { ...target, onMutation: onMutation ?? target.onMutation },
          'common.save',
          { baseValue: 'Save all', moveTo: 'dialogs' },
          { provider },
        );

        await expect(editing).rejects.toThrow(ResourceNotFoundError);
        await expect(editing).rejects.toThrow('common.save');
        expect(
          openUnreportedResourceFolder(join(root, 'translations', 'common'), {
            runtime: 'transloco-messageformat',
            baseLocale: 'en',
          }).has('save'),
        ).toBe(false);
        expect(
          openUnreportedResourceFolder(join(root, 'translations', 'dialogs'), {
            runtime: 'transloco-messageformat',
            baseLocale: 'en',
          }).has('save'),
        ).toBe(false);
        expect(collected).toEqual([expect.objectContaining({ kind: 'upsert', key: 'common.save' })]);
      });

      it('deduplicates translator and write-back skips in first-seen order', async () => {
        const provider = new InMemoryTranslationProvider(({ text, targetLocale }) => {
          const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
            runtime: 'transloco-messageformat',
            baseLocale: 'en',
          });
          folder.setTranslation('save', 'fr', 'Humain', 'translated');
          folder.setTranslation('save', 'de', 'Manuell', 'translated');
          folder.save();
          // Dropping the protected term skips de in the Translator, then seeding queues a new copy.
          return targetLocale === 'de' ? 'Speichern' : `[${targetLocale}] ${text}`;
        });

        const result = await editResource(
          { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
          'common.save',
          { baseValue: 'Save all' },
          { provider, protectedTerms: ['all'] },
        );

        expect(result.skippedLocales).toEqual(['de', 'fr']);
        expect(result.entry?.translations).toEqual({ fr: 'Humain', de: 'Manuell', es: '[es] Save all' });
        expect(result.entry?.metadata['de']?.status).toBe('translated');
        expect(read('resource_entries.json', 'common').save.de).toBe('Manuell');
        expect(collected).toHaveLength(2);
      });

      it('skips phase 2 after another base edit and returns fresh disk state', async () => {
        const provider = holdProvider();
        const editing = editResource(
          { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
          'common.save',
          { baseValue: 'Save all' },
          { provider: provider.provider },
        );
        await provider.called;
        const folder = openUnreportedResourceFolder(join(root, 'translations', 'common'), {
          runtime: 'transloco-messageformat',
          baseLocale: 'en',
        });
        folder.setBase('save', 'Save some');
        folder.save();
        provider.release();
        const result = await editing;

        expect(result.entry?.source).toBe('Save some');
        expect(result.skippedLocales).toEqual(['fr', 'de', 'es']);
        expect(collected).toHaveLength(1);
      });

      it('keeps an entry written to the destination folder meanwhile, and still moves the edited entry', async () => {
        const provider = holdProvider();

        const editing = editResource(
          { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
          'common.save',
          { baseValue: 'Save all', moveTo: 'dialogs' },
          { provider: provider.provider },
        );
        await provider.called;
        writeDestinationEntry('cancel', 'Cancel');
        provider.release();
        const result = await editing;

        const destination = read('resource_entries.json', 'dialogs');
        expect(destination.cancel).toEqual({ source: 'Cancel' });
        expect(destination.save.source).toBe('Save all');
        expect(result.resolvedKey).toBe('dialogs.save');
      });

      it('throws ResourceAlreadyExistsError when the entry key was taken meanwhile, keeping both entries', async () => {
        const provider = holdProvider();

        const editing = editResource(
          { ...collection(AUTO), onMutation: onMutation ?? collection(AUTO).onMutation },
          'common.save',
          { baseValue: 'Save all', moveTo: 'dialogs' },
          { provider: provider.provider },
        );
        await provider.called;
        writeDestinationEntry('save', 'Other');
        provider.release();

        await expect(editing).rejects.toThrow(ResourceAlreadyExistsError);
        expect(read('resource_entries.json', 'dialogs').save).toEqual({ source: 'Other' });
        // The edit itself was saved before the move was attempted.
        expect(read('resource_entries.json', 'common').save.source).toBe('Save all');
      });
    });
  });

  describe('terminology (Project Terms)', () => {
    const rules = [{ discouraged: 'Expenditure', preferred: 'Investment' }];

    beforeEach(() => {
      writeFileSync(join(root, '.lingo-tracker-preferred-terminology.json'), JSON.stringify(rules), 'utf8');
    });

    it('checks a supplied base value and returns the findings under the key', async () => {
      const result = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { baseValue: 'Save the expenditure' },
        {},
      );

      expect(result.terminology).toEqual({
        findings: [
          {
            key: 'common.save',
            discouraged: 'Expenditure',
            preferred: 'Investment',
            message: 'consider "Investment" instead of "Expenditure"',
          },
        ],
        problems: [],
      });
    });

    it('reports the findings under the destination key when the edit also moves the entry', async () => {
      const result = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        {
          baseValue: 'Save the expenditure',
          moveTo: 'dialogs',
        },
        {},
      );

      expect(result.terminology?.findings.map(({ key }) => key)).toEqual(['dialogs.save']);
    });

    it('checks the stored ICU value, not the Transloco input', async () => {
      vi.mocked(findPreferredTermFindings).mockClear();

      const result = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { baseValue: 'Save {{ expenditure }}' },
        {},
      );

      expect(read('resource_entries.json', 'common').save.source).toBe('Save {expenditure}');
      expect(findPreferredTermFindings).toHaveBeenCalledWith('Save {expenditure}', rules);
      // The placeholder is an argument, not wording.
      expect(result.terminology).toEqual({ findings: [], problems: [] });
    });

    it('adds a named protected-terms file that does not exist to problems when auto-translation ran', async () => {
      const config: LingoTrackerConfig = {
        exportFolder: 'dist',
        importFolder: 'import',
        baseLocale: 'en',
        locales: ['en', 'fr', 'de', 'es'],
        protectedTermsFile: 'typo.json',
        translation: AUTO,
        collections: { main: { translationsFolder: join(root, 'translations') } },
      };
      const named = openCollection(config, 'main', { cwd: root });

      const result = await editResource(
        { ...named, onMutation: onMutation ?? named.onMutation },
        'common.save',
        { baseValue: 'Save now' },
        { provider: new InMemoryTranslationProvider() },
      );

      expect(result.terminology?.problems).toEqual([
        `Protected terms file not found: ${join(root, 'typo.json')}. Treating as an empty list.`,
      ]);
    });

    it('leaves terminology out when the edit supplied no base value, or changed nothing', async () => {
      const comment = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { comment: 'Expenditure' },
        {},
      );
      const unchanged = await editResource(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        'common.save',
        { baseValue: 'Save' },
        {},
      );

      expect(comment.updated).toBe(true);
      expect(comment.terminology).toBeUndefined();
      expect(unchanged.updated).toBe(false);
      expect(unchanged.terminology).toBeUndefined();
    });
  });
});
