import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as domain from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateChecksum } from './checksum';
import { openResourceFolder, translationLocales } from './resource-folder';

const md5 = calculateChecksum;

describe('ResourceFolder', () => {
  let dir: string;
  let folderPath: string;

  const readEntries = () => JSON.parse(readFileSync(join(folderPath, 'resource_entries.json'), 'utf8'));
  const readMeta = () => JSON.parse(readFileSync(join(folderPath, 'tracker_meta.json'), 'utf8'));
  const writePair = (entries: unknown, meta: unknown) => {
    writeFileSync(join(folderPath, 'resource_entries.json'), JSON.stringify(entries));
    writeFileSync(join(folderPath, 'tracker_meta.json'), JSON.stringify(meta));
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'resource-folder-'));
    folderPath = dir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('open', () => {
    it('treats missing files as an empty folder', () => {
      const folder = openResourceFolder(join(dir, 'missing'), { baseLocale: 'en' });
      expect(folder.isEmpty()).toBe(true);
      expect(folder.keys()).toEqual([]);
      expect(folder.get('ok')).toBeUndefined();
    });

    it('loads both files', () => {
      writePair({ ok: { source: 'OK', fr: 'Oui' } }, { ok: { en: { checksum: md5('OK') } } });
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(folder.keys()).toEqual(['ok']);
      expect(folder.get('ok')).toEqual({ entry: { source: 'OK', fr: 'Oui' }, meta: { en: { checksum: md5('OK') } } });
    });

    it('throws on malformed JSON', () => {
      writeFileSync(join(folderPath, 'resource_entries.json'), '{ not json');
      expect(() => openResourceFolder(folderPath, { baseLocale: 'en' })).toThrow();
    });

    it('does not treat prototype properties as keys', () => {
      writePair({}, {});
      expect(openResourceFolder(folderPath, { baseLocale: 'en' }).has('constructor')).toBe(false);
    });
  });

  describe('setBase', () => {
    it('normalizes a Transloco base value before calculating its checksum', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'fr' });
      folder.setBase('hello', 'Bonjour {{ name }}');

      expect(folder.get('hello')).toEqual({
        entry: { source: 'Bonjour {name}' },
        meta: { fr: { checksum: md5('Bonjour {name}') } },
      });
    });

    it('creates a new entry with its base checksum', () => {
      const folder = openResourceFolder(join(dir, 'a', 'b'), { baseLocale: 'en' });
      expect(folder.setBase('ok', 'OK')).toBe(true);
      folder.save();

      folderPath = join(dir, 'a', 'b');
      expect(readEntries()).toEqual({ ok: { source: 'OK' } });
      expect(readMeta()).toEqual({ ok: { en: { checksum: md5('OK') } } });
    });

    it('returns false when nothing changed', () => {
      writePair({ ok: { source: 'OK' } }, { ok: { en: { checksum: md5('OK') } } });
      expect(openResourceFolder(folderPath, { baseLocale: 'en' }).setBase('ok', 'OK')).toBe(false);
    });

    it('applies the staleness rule when the base value changes', () => {
      writePair(
        { ok: { source: 'OK', fr: "D'accord", es: 'Okay' } },
        {
          ok: {
            en: { checksum: md5('OK') },
            fr: { checksum: md5("D'accord"), baseChecksum: md5('OK'), status: 'verified' },
            es: { checksum: md5('Okay'), baseChecksum: md5('OK'), status: 'translated' },
          },
        },
      );

      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setBase('ok', 'Okay');

      expect(folder.get('ok')?.meta).toEqual({
        en: { checksum: md5('Okay') },
        fr: { checksum: md5("D'accord"), baseChecksum: md5('Okay'), status: 'stale' },
        // An untranslated copy of the new base stays 'new'
        es: { checksum: md5('Okay'), baseChecksum: md5('Okay'), status: 'new' },
      });
    });

    it('treats a stored checksum that disagrees with the stored value as a base change', () => {
      writePair(
        { ok: { source: 'Edited by hand', fr: 'Oui' } },
        {
          ok: {
            en: { checksum: md5('OK') },
            fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'translated' },
          },
        },
      );

      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(folder.setBase('ok', 'Edited by hand')).toBe(true);
      expect(folder.get('ok')?.meta?.['fr'].status).toBe('stale');
    });

    it('records a missing base checksum without staling translations', () => {
      writePair(
        { ok: { source: 'OK', fr: 'Oui' } },
        { ok: { fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'verified' } } },
      );

      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setBase('ok', 'OK');
      expect(folder.get('ok')?.meta).toEqual({
        fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'verified' },
        en: { checksum: md5('OK') },
      });
    });

    it('uses the configured base locale', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'fr' });
      folder.setBase('ok', 'Oui');
      expect(folder.get('ok')?.meta).toEqual({ fr: { checksum: md5('Oui') } });
    });
  });

  describe('setTranslation / setStatus', () => {
    it('normalizes a translation and keeps an already-ICU base checksum stable', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'fr' });
      folder.setBase('hello', 'Bonjour {name}');
      folder.setTranslation('hello', 'en', 'Hello {{ name }}', 'verified');
      expect(folder.setBase('hello', 'Bonjour {name}')).toBe(false);

      expect(folder.get('hello')).toEqual({
        entry: { source: 'Bonjour {name}', en: 'Hello {name}' },
        meta: {
          fr: { checksum: md5('Bonjour {name}') },
          en: { checksum: md5('Hello {name}'), baseChecksum: md5('Bonjour {name}'), status: 'verified' },
        },
      });
    });

    it('records checksum, current base checksum, and status', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setBase('ok', 'OK');
      folder.setTranslation('ok', 'fr', 'Oui', 'verified');

      expect(folder.get('ok')?.entry).toEqual({ source: 'OK', fr: 'Oui' });
      expect(folder.get('ok')?.meta?.['fr']).toEqual({
        checksum: md5('Oui'),
        baseChecksum: md5('OK'),
        status: 'verified',
      });
    });

    it('defaults status to translated', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setBase('ok', 'OK');
      folder.setTranslation('ok', 'fr', 'Oui');
      expect(folder.get('ok')?.meta?.['fr'].status).toBe('translated');
    });

    it('falls back to the checksum of the source when base metadata is missing', () => {
      writePair({ ok: { source: 'OK' } }, {});
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setTranslation('ok', 'fr', 'Oui');
      expect(folder.get('ok')?.meta?.['fr'].baseChecksum).toBe(md5('OK'));
    });

    it('rejects unknown keys and the base locale', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(() => folder.setTranslation('missing', 'fr', 'Oui')).toThrow('Resource entry not found');
      folder.setBase('ok', 'OK');
      expect(() => folder.setTranslation('ok', 'en', 'OK')).toThrow('base locale');
    });

    it('setStatus changes only the status', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setBase('ok', 'OK');
      folder.setTranslation('ok', 'fr', 'Oui');
      folder.setStatus('ok', 'fr', 'verified');
      expect(folder.get('ok')?.meta?.['fr']).toEqual({
        checksum: md5('Oui'),
        baseChecksum: md5('OK'),
        status: 'verified',
      });
      expect(() => folder.setStatus('ok', 'de', 'verified')).toThrow();
    });
    it('setStatus can re-confirm against the current base checksum', () => {
      writePair(
        { ok: { source: 'Okay', fr: 'Oui' } },
        {
          ok: {
            en: { checksum: md5('Okay') },
            fr: { checksum: 'kept', baseChecksum: md5('OK'), status: 'stale' },
          },
        },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setStatus('ok', 'fr', 'translated', { refreshBaseChecksum: true });
      expect(folder.get('ok')?.meta?.['fr']).toEqual({
        checksum: 'kept',
        baseChecksum: md5('Okay'),
        status: 'translated',
      });
    });
  });

  describe('setDetails', () => {
    it('sets, keeps, and removes comment and tags', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setBase('ok', 'OK');

      expect(folder.setDetails('ok', { comment: 'Button', tags: ['ui'] })).toBe(true);
      expect(folder.setDetails('ok', { comment: 'Button', tags: ['ui'] })).toBe(false);
      expect(folder.setDetails('ok', {})).toBe(false);
      expect(folder.get('ok')?.entry).toEqual({ source: 'OK', comment: 'Button', tags: ['ui'] });

      expect(folder.setDetails('ok', { comment: null, tags: [] })).toBe(true);
      expect(folder.get('ok')?.entry).toEqual({ source: 'OK' });
    });
  });

  describe('setEntry', () => {
    it('normalizes all locale values and updates checksums for converted values', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'fr' });
      folder.setEntry(
        'hello',
        { source: 'Bonjour {{ name }}', en: 'Hello {{ name }}' },
        {
          fr: { checksum: md5('Bonjour {{ name }}') },
          en: { checksum: md5('Hello {{ name }}'), baseChecksum: md5('Bonjour {{ name }}'), status: 'verified' },
        },
      );

      expect(folder.get('hello')).toEqual({
        entry: { source: 'Bonjour {name}', en: 'Hello {name}' },
        meta: {
          fr: { checksum: md5('Bonjour {name}') },
          en: { checksum: md5('Hello {name}'), baseChecksum: md5('Bonjour {name}'), status: 'verified' },
        },
      });
    });

    it('stores entry and metadata losslessly, keeping key position', () => {
      writePair({ a: { source: 'A' }, b: { source: 'B' } }, {});
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      const meta = {
        en: { checksum: md5('A2') },
        fr: { checksum: md5('Un'), baseChecksum: md5('A1'), status: 'verified' as const },
      };

      folder.setEntry('a', { source: 'A2', fr: 'Un', comment: 'c' }, meta);

      expect(folder.keys()).toEqual(['a', 'b']);
      expect(folder.get('a')).toEqual({ entry: { source: 'A2', fr: 'Un', comment: 'c' }, meta });
    });
  });

  describe('seedLocale / dropLocale', () => {
    it('seeds missing locales as new copies of the base and drops them again', () => {
      writePair(
        { ok: { source: 'OK' }, no: { source: 'No', de: 'Nein' } },
        { ok: { en: { checksum: md5('OK') } }, no: { en: { checksum: md5('No') } } },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });

      expect(folder.seedLocale('de')).toBe(1);
      expect(folder.get('ok')?.entry['de']).toBe('OK');
      expect(folder.get('ok')?.meta?.['de']).toEqual({ checksum: md5('OK'), baseChecksum: md5('OK'), status: 'new' });
      expect(folder.get('no')?.entry['de']).toBe('Nein');

      expect(folder.dropLocale('de')).toBe(2);
      expect(folder.get('ok')).toEqual({ entry: { source: 'OK' }, meta: { en: { checksum: md5('OK') } } });
      expect(folder.dropLocale('de')).toBe(0);
    });
  });

  it('infers status only when a translation write omits it', () => {
    const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
    folder.setBase('ok', 'OK');
    folder.setTranslation('ok', 'fr', 'OK');
    expect(folder.get('ok')?.meta?.['fr']?.status).toBe('new');
    folder.setTranslation('ok', 'fr', 'OK', 'translated');
    expect(folder.get('ok')?.meta?.['fr']?.status).toBe('translated');
  });

  describe('normalizeEntry', () => {
    it('converts the base and every translation once, counting changed values and seeded locales', () => {
      const source = { source: 'Hello {{ name }}!', fr: 'Bonjour {{ name }} !', es: 'Hola {name}' };
      writePair({ hello: source }, {});
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      const stored = folder.get('hello')?.entry;
      const convert = vi.spyOn(domain, 'translocoToICU');

      expect(folder.normalizeEntry('hello', ['fr', 'de'])).toEqual({
        valuesConverted: 2,
        tagsNormalized: 0,
        localesAdded: 1,
        changed: true,
      });
      expect(convert).toHaveBeenCalledTimes(3);
      expect(folder.get('hello')?.entry).toEqual({
        source: 'Hello {name}!',
        fr: 'Bonjour {name} !',
        es: 'Hola {name}',
        de: 'Hello {name}!',
      });
      expect(folder.get('hello')?.meta?.['de']).toEqual({
        checksum: md5('Hello {name}!'),
        baseChecksum: md5('Hello {name}!'),
        status: 'new',
      });
      expect(stored?.source).toBe('Hello {{ name }}!');
      expect(source.source).toBe('Hello {{ name }}!');
    });

    it('counts a converted stray base-locale value before dropping it', () => {
      writePair(
        { hello: { source: 'Hello {name}', en: 'Hello {{ name }}' } },
        {
          hello: { en: { checksum: md5('Hello {name}') } },
        },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(folder.normalizeEntry('hello', [])).toEqual({
        valuesConverted: 1,
        tagsNormalized: 0,
        localesAdded: 0,
        changed: true,
      });
      expect(folder.get('hello')).toEqual({
        entry: { source: 'Hello {name}' },
        meta: { en: { checksum: md5('Hello {name}') } },
      });
    });

    it('normalizes tags once and drops a tag list that normalizes to nothing', () => {
      writePair({ ok: { source: 'OK', tags: ['UI', 'Buttons', 'ui'] }, empty: { source: 'OK', tags: ['!!!'] } }, {});
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(folder.normalizeEntry('ok', [])).toEqual({
        valuesConverted: 0,
        tagsNormalized: 1,
        localesAdded: 0,
        changed: true,
      });
      expect(folder.get('ok')?.entry).toEqual({ source: 'OK', tags: ['ui', 'buttons'] });
      expect(folder.normalizeEntry('empty', [])).toEqual({
        valuesConverted: 0,
        tagsNormalized: 1,
        localesAdded: 0,
        changed: true,
      });
      expect(folder.get('empty')?.entry).toEqual({ source: 'OK' });
    });

    it('reports nothing for an entry that is already normalized', () => {
      const entry = { source: 'OK', fr: 'Oui', comment: 'Button', tags: ['ui'] };
      writePair(
        { ok: entry },
        {
          ok: {
            en: { checksum: md5('OK') },
            fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'translated' },
          },
        },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(folder.normalizeEntry('ok', ['fr'])).toEqual({
        valuesConverted: 0,
        tagsNormalized: 0,
        localesAdded: 0,
        changed: false,
      });
      expect(folder.get('ok')?.entry).toEqual(entry);
    });

    it('preserves an explicit translated status on an identical copy', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setBase('ok', 'OK');
      folder.setTranslation('ok', 'fr', 'OK', 'translated');

      folder.normalizeEntry('ok', ['fr']);

      expect(folder.get('ok')?.meta?.['fr']?.status).toBe('translated');
    });

    it('re-records every target translation, counting one without metadata as new, and seeds missing locales', () => {
      writePair(
        { ok: { source: 'OK', fr: 'Oui', de: 'OK' } },
        {
          ok: {
            en: { checksum: md5('OK') },
            fr: { checksum: 'outdated', baseChecksum: md5('OK'), status: 'verified' },
          },
        },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });

      const report = folder.normalizeEntry('ok', ['fr', 'de', 'es']);

      expect(report).toEqual({ valuesConverted: 0, tagsNormalized: 0, localesAdded: 1, changed: true });
      expect(folder.get('ok')).toEqual({
        entry: { source: 'OK', fr: 'Oui', de: 'OK', es: 'OK' },
        meta: {
          en: { checksum: md5('OK') },
          fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'verified' },
          de: { checksum: md5('OK'), baseChecksum: md5('OK'), status: 'new' },
          es: { checksum: md5('OK'), baseChecksum: md5('OK'), status: 'new' },
        },
      });
    });

    it('leaves the data and metadata of a non-target locale alone', () => {
      const esMeta = { checksum: 'outdated', baseChecksum: 'older-base', status: 'verified' };
      writePair(
        { ok: { source: 'OK', fr: 'Oui', es: 'Vale', de: 'Ja' } },
        {
          ok: {
            en: { checksum: md5('OK') },
            fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'translated' },
            es: esMeta,
          },
        },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });

      expect(folder.normalizeEntry('ok', ['fr'])).toEqual({
        valuesConverted: 0,
        tagsNormalized: 0,
        localesAdded: 0,
        changed: false,
      });
      expect(folder.get('ok')?.entry).toEqual({ source: 'OK', fr: 'Oui', es: 'Vale', de: 'Ja' });
      expect(folder.get('ok')?.meta?.['es']).toEqual(esMeta);
      expect(folder.get('ok')?.meta?.['de']).toBeUndefined();
    });

    it('converts a legacy value in a non-target locale and recomputes its checksum', () => {
      const source = 'Hello {name}';
      const legacy = 'Hola {{ name }}';
      writePair(
        { ok: { source, fr: 'Bonjour {name}', es: legacy } },
        {
          ok: {
            en: { checksum: md5(source) },
            fr: { checksum: md5('Bonjour {name}'), baseChecksum: md5(source), status: 'translated' },
            es: { checksum: md5(legacy), baseChecksum: md5(source), status: 'verified' },
          },
        },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });

      expect(folder.normalizeEntry('ok', ['fr'])).toEqual({
        valuesConverted: 1,
        tagsNormalized: 0,
        localesAdded: 0,
        changed: true,
      });
      expect(folder.get('ok')?.entry['es']).toBe('Hola {name}');
      expect(folder.get('ok')?.meta?.['es']).toEqual({
        checksum: md5('Hola {name}'),
        baseChecksum: md5(source),
        status: 'verified',
      });
    });

    describe('a translation made from an older base (stored baseChecksum differs from the base checksum)', () => {
      const drifted = (fr: string, status: string) => {
        writePair(
          { ok: { source: 'OK', fr } },
          {
            ok: {
              en: { checksum: md5('OK') },
              fr: { checksum: md5(fr), baseChecksum: md5('Okay'), status },
            },
          },
        );
        return openResourceFolder(folderPath, { baseLocale: 'en' });
      };

      it.each(['verified', 'translated'])('%s becomes stale with the current baseChecksum', (status) => {
        const folder = drifted('Oui', status);

        expect(folder.normalizeEntry('ok', ['fr'])).toEqual({
          valuesConverted: 0,
          tagsNormalized: 0,
          localesAdded: 0,
          changed: true,
        });
        expect(folder.get('ok')?.meta?.['fr']).toEqual({
          checksum: md5('Oui'),
          baseChecksum: md5('OK'),
          status: 'stale',
        });
      });

      it('becomes new when its value is a copy of the base', () => {
        const folder = drifted('OK', 'translated');
        folder.normalizeEntry('ok', ['fr']);
        expect(folder.get('ok')?.meta?.['fr']?.status).toBe('new');
      });

      it('stays new when it was new', () => {
        const folder = drifted('Oui', 'new');
        folder.normalizeEntry('ok', ['fr']);
        expect(folder.get('ok')?.meta?.['fr']).toEqual({
          checksum: md5('Oui'),
          baseChecksum: md5('OK'),
          status: 'new',
        });
      });

      it('is idempotent: a second run changes nothing', () => {
        const folder = drifted('Oui', 'verified');
        folder.normalizeEntry('ok', ['fr']);
        expect(folder.normalizeEntry('ok', ['fr'])).toEqual({
          valuesConverted: 0,
          tagsNormalized: 0,
          localesAdded: 0,
          changed: false,
        });
        expect(folder.get('ok')?.meta?.['fr']?.status).toBe('stale');
      });
    });

    it('keeps the status of a translation whose baseChecksum matches the base', () => {
      writePair(
        { ok: { source: 'OK', fr: 'Oui' } },
        {
          ok: {
            en: { checksum: md5('OK') },
            fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'verified' },
          },
        },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });

      expect(folder.normalizeEntry('ok', ['fr']).changed).toBe(false);
      expect(folder.get('ok')?.meta?.['fr']?.status).toBe('verified');
    });

    it('applies the staleness rule with current checksums when the base value changed', () => {
      writePair(
        { save: { source: 'Save changes', fr: 'Enregistrer', es: 'Save changes' } },
        {
          save: {
            en: { checksum: md5('Save') },
            fr: { checksum: 'outdated', baseChecksum: md5('Save'), status: 'verified' },
            es: { checksum: 'outdated', baseChecksum: md5('Save'), status: 'translated' },
          },
        },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });

      folder.normalizeEntry('save', ['fr', 'es']);

      expect(folder.get('save')?.meta).toEqual({
        en: { checksum: md5('Save changes') },
        fr: { checksum: md5('Enregistrer'), baseChecksum: md5('Save changes'), status: 'stale' },
        es: { checksum: md5('Save changes'), baseChecksum: md5('Save changes'), status: 'new' },
      });
    });

    it('normalizes tags, drops a stray base-locale property and reports no change when consistent', () => {
      writePair(
        { ok: { source: 'OK', en: 'OK', fr: 'Oui', tags: ['UI'] } },
        {
          ok: {
            en: { checksum: md5('OK') },
            fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'translated' },
          },
        },
      );
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });

      expect(folder.normalizeEntry('ok', ['fr'])).toEqual({
        valuesConverted: 0,
        tagsNormalized: 1,
        localesAdded: 0,
        changed: true,
      });
      expect(folder.get('ok')?.entry).toEqual({ source: 'OK', fr: 'Oui', tags: ['ui'] });
      expect(folder.normalizeEntry('ok', ['fr'])).toEqual({
        valuesConverted: 0,
        tagsNormalized: 0,
        localesAdded: 0,
        changed: false,
      });
    });

    it('rejects an unknown key', () => {
      writePair({}, {});
      expect(() => openResourceFolder(folderPath, { baseLocale: 'en' }).normalizeEntry('nope', [])).toThrow(
        'Resource entry not found: nope',
      );
    });
  });

  describe('treeEntry / translationLocales', () => {
    it('builds the tree entry and lists translation locales', () => {
      writePair({ ok: { source: 'OK', comment: 'c', tags: [], fr: 'Oui' } }, { ok: { en: { checksum: md5('OK') } } });
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      const stored = folder.get('ok');
      expect(stored).toBeDefined();
      expect(translationLocales(stored?.entry ?? { source: '' })).toEqual(['fr']);
      expect(folder.treeEntry('ok')).toEqual({
        key: 'ok',
        source: 'OK',
        translations: { fr: 'Oui' },
        metadata: { en: { checksum: md5('OK') } },
        comment: 'c',
      });
    });

    it('returns the entry with empty metadata when its metadata record is missing', () => {
      writePair({ ok: { source: 'OK', fr: 'Bien' } }, {});
      expect(openResourceFolder(folderPath, { baseLocale: 'en' }).treeEntry('ok')).toEqual({
        key: 'ok',
        source: 'OK',
        translations: { fr: 'Bien' },
        metadata: {},
      });
    });

    it('returns undefined when the entry is missing', () => {
      writePair({ ok: { source: 'OK' } }, {});
      expect(openResourceFolder(folderPath, { baseLocale: 'en' }).treeEntry('missing')).toBeUndefined();
    });
  });

  describe('hasMissingFiles', () => {
    it.each([true, false])('reports missing entries whether metadata exists (%s)', (metaPresent) => {
      if (metaPresent) writeFileSync(join(folderPath, 'tracker_meta.json'), '{}');
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(folder.hasMissingFiles()).toBe(true);
    });

    it('tracks a missing metadata file through dry saves, writes and removal', () => {
      writeFileSync(join(folderPath, 'resource_entries.json'), JSON.stringify({ ok: { source: 'OK' } }));
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(folder.hasMissingFiles()).toBe(true);
      expect(folder.save({ dryRun: true }).created).toEqual([join(folderPath, 'tracker_meta.json')]);
      expect(folder.hasMissingFiles()).toBe(true);
      folder.save();
      expect(folder.hasMissingFiles()).toBe(false);
      expect(openResourceFolder(folderPath, { baseLocale: 'en' }).hasMissingFiles()).toBe(false);
      folder.remove('ok');
      folder.save({ dryRun: true });
      expect(folder.hasMissingFiles()).toBe(false);
      folder.save();
      expect(folder.hasMissingFiles()).toBe(true);
    });
  });

  describe('save', () => {
    it('writes both files and reports which were created', () => {
      const target = join(dir, 'nested');
      const folder = openResourceFolder(target, { baseLocale: 'en' });
      folder.setBase('ok', 'OK');

      const first = folder.save();
      expect(first.written).toEqual([join(target, 'resource_entries.json'), join(target, 'tracker_meta.json')]);
      expect(first.created).toEqual(first.written);

      const second = folder.save();
      expect(second.created).toEqual([]);
    });

    it('dryRun reports without writing', () => {
      const target = join(dir, 'dry');
      const folder = openResourceFolder(target, { baseLocale: 'en' });
      folder.setBase('ok', 'OK');

      const result = folder.save({ dryRun: true });
      expect(result.written).toHaveLength(2);
      expect(existsSync(target)).toBe(false);
    });

    it('removes both files when the folder becomes empty', () => {
      writePair({ ok: { source: 'OK' } }, { ok: { en: { checksum: md5('OK') } } });
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(folder.remove('ok')).toBe(true);
      expect(folder.remove('ok')).toBe(false);

      const result = folder.save();
      expect(result.removed).toHaveLength(2);
      expect(existsSync(join(folderPath, 'resource_entries.json'))).toBe(false);
      expect(existsSync(join(folderPath, 'tracker_meta.json'))).toBe(false);
    });

    it('round-trips through disk', () => {
      const folder = openResourceFolder(folderPath, { baseLocale: 'en' });
      folder.setBase('ok', 'OK');
      folder.setTranslation('ok', 'fr', 'Oui');
      folder.save();

      const reopened = openResourceFolder(folderPath, { baseLocale: 'en' });
      expect(reopened.get('ok')).toEqual(folder.get('ok'));
    });
  });
});
