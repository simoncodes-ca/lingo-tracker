import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import { ReadOnlyCollectionError } from '../errors/lingo-tracker-error';
import { calculateChecksum } from '../resource/checksum';
import { readCollection } from '../resource/read-collection';
import { normalize } from './normalize';

const md5 = calculateChecksum;

describe('normalize', () => {
  const dir = useTempDir('normalize-');
  const collection = () => testCollection(dir(), { locales: ['en', 'fr', 'es'] });
  const readJson = (folder: string, file: string) => JSON.parse(readFileSync(join(folder, file), 'utf8'));
  const meta = (folder: string) => readJson(folder, 'tracker_meta.json');
  const entries = (folder: string) => readJson(folder, 'resource_entries.json');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a read-only collection', async () => {
    await expect(normalize(testCollection(dir(), { readOnly: true }))).rejects.toThrow(ReadOnlyCollectionError);
  });

  it('counts a locale value without metadata as new, like the reader and validate do', async () => {
    const folder = writeFolderFiles(dir(), 'common', { entries: { ok: { source: 'OK', fr: 'Oui', es: 'Vale' } } });

    const result = await normalize(collection());

    expect(result).toMatchObject({ entriesProcessed: 1, localesAdded: 0, filesCreated: 1, filesUpdated: 1 });
    expect(meta(folder).ok).toEqual({
      en: { checksum: md5('OK') },
      fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'new' },
      es: { checksum: md5('Vale'), baseChecksum: md5('OK'), status: 'new' },
    });
    const read = readCollection(collection());
    expect(read.resources[0]?.entry.metadata['fr']?.status).toBe('new');
  });

  it('seeds missing target locales as new copies of the base', async () => {
    const col = collection();
    seedResources(col, { 'common.ok': { source: 'OK', translations: { fr: 'Oui' } } });

    const result = await normalize(col);

    expect(result).toMatchObject({ entriesProcessed: 1, localesAdded: 1, filesCreated: 0, filesUpdated: 2 });
    const folder = join(dir(), 'common');
    expect(entries(folder).ok).toEqual({ source: 'OK', fr: 'Oui', es: 'OK' });
    expect(meta(folder).ok.es).toEqual({ checksum: md5('OK'), baseChecksum: md5('OK'), status: 'new' });
    expect(meta(folder).ok.fr.status).toBe('translated');
  });

  it('recomputes stale checksums and applies the Staleness rule when the base value was hand-edited', async () => {
    const folder = writeFolderFiles(dir(), 'common', {
      entries: { save: { source: 'Save changes', fr: 'Enregistrer', es: 'Save changes' } },
      meta: {
        save: {
          en: { checksum: md5('Save') },
          fr: { checksum: 'outdated', baseChecksum: md5('Save'), status: 'verified' },
          es: { checksum: md5('Save'), baseChecksum: md5('Save'), status: 'new' },
        },
      },
    });

    await normalize(collection());

    expect(meta(folder).save).toEqual({
      en: { checksum: md5('Save changes') },
      fr: { checksum: md5('Enregistrer'), baseChecksum: md5('Save changes'), status: 'stale' },
      es: { checksum: md5('Save changes'), baseChecksum: md5('Save changes'), status: 'new' },
    });
  });

  it('keeps statuses when only a translation checksum was out of date', async () => {
    const folder = writeFolderFiles(dir(), 'common', {
      entries: { ok: { source: 'OK', fr: 'Oui', es: 'Vale' } },
      meta: {
        ok: {
          en: { checksum: md5('OK') },
          fr: { checksum: 'outdated', baseChecksum: md5('OK'), status: 'verified' },
          es: { checksum: 'outdated', baseChecksum: md5('OK'), status: 'translated' },
        },
      },
    });

    const result = await normalize(collection());

    expect(result.filesUpdated).toBe(2);
    expect(meta(folder).ok.fr).toEqual({ checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'verified' });
    expect(meta(folder).ok.es).toEqual({ checksum: md5('Vale'), baseChecksum: md5('OK'), status: 'translated' });
  });

  it('marks translations made from an older base stale (a merge where the base changed on another branch)', async () => {
    const folder = writeFolderFiles(dir(), 'common', {
      entries: {
        verified: { source: 'OK', fr: 'Oui', es: 'Vale' },
        untouched: { source: 'Yes', fr: 'Oui', es: 'Sí' },
      },
      meta: {
        verified: {
          en: { checksum: md5('OK') },
          fr: { checksum: md5('Oui'), baseChecksum: md5('Okay'), status: 'verified' },
          es: { checksum: md5('Vale'), baseChecksum: md5('Okay'), status: 'translated' },
        },
        untouched: {
          en: { checksum: md5('Yes') },
          fr: { checksum: md5('Oui'), baseChecksum: md5('Yes'), status: 'verified' },
          es: { checksum: md5('Sí'), baseChecksum: md5('Okay'), status: 'new' },
        },
      },
    });

    const first = await normalize(collection());

    expect(first.filesUpdated).toBe(2);
    expect(meta(folder).verified).toEqual({
      en: { checksum: md5('OK') },
      fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'stale' },
      es: { checksum: md5('Vale'), baseChecksum: md5('OK'), status: 'stale' },
    });
    expect(meta(folder).untouched).toEqual({
      en: { checksum: md5('Yes') },
      fr: { checksum: md5('Oui'), baseChecksum: md5('Yes'), status: 'verified' },
      es: { checksum: md5('Sí'), baseChecksum: md5('Yes'), status: 'new' },
    });

    const second = await normalize(collection());
    expect(second.filesUpdated).toBe(0);
    expect(meta(folder).verified.fr.status).toBe('stale');
  });

  it('leaves a locale that is not in the collection untouched', async () => {
    const deMeta = { checksum: 'outdated', baseChecksum: 'older-base', status: 'verified' };
    const folder = writeFolderFiles(dir(), 'common', {
      entries: { ok: { source: 'OK', fr: 'Oui', es: 'Vale', de: 'Ja' } },
      meta: {
        ok: {
          en: { checksum: md5('OK') },
          fr: { checksum: md5('Oui'), baseChecksum: md5('OK'), status: 'translated' },
          es: { checksum: md5('Vale'), baseChecksum: md5('OK'), status: 'translated' },
          de: deMeta,
        },
      },
    });

    const result = await normalize(collection());

    expect(result.filesUpdated).toBe(0);
    expect(entries(folder).ok.de).toBe('Ja');
    expect(meta(folder).ok.de).toEqual(deMeta);
  });

  it('converts Transloco syntax to ICU, normalizes tags and drops a stray base-locale property', async () => {
    const folder = writeFolderFiles(dir(), 'common', {
      entries: {
        hello: {
          source: 'Hello {{ name }}',
          en: 'Hello',
          fr: 'Bonjour {{ name }}',
          es: 'Hola {name}',
          tags: ['UI', 'Buttons '],
        },
      },
    });

    const result = await normalize(collection());

    expect(result).toMatchObject({ valuesConverted: 2, tagsNormalized: 1, localesAdded: 0 });
    expect(entries(folder).hello).toEqual({
      source: 'Hello {name}',
      fr: 'Bonjour {name}',
      es: 'Hola {name}',
      tags: ['ui', 'buttons'],
    });
    expect(meta(folder).hello.fr.checksum).toBe(md5('Bonjour {name}'));
    expect(meta(folder).hello.en).toEqual({ checksum: md5('Hello {name}') });
  });

  it('is a no-op on a consistent collection and is idempotent', async () => {
    const col = collection();
    seedResources(col, {
      'common.ok': { source: 'OK', translations: { fr: 'Oui', es: 'Vale' }, comment: 'Button', tags: ['ui'] },
    });
    const folder = join(dir(), 'common');
    const before = { entries: entries(folder), meta: meta(folder) };

    const result = await normalize(col);

    expect(result).toEqual({
      entriesProcessed: 1,
      localesAdded: 0,
      valuesConverted: 0,
      tagsNormalized: 0,
      filesCreated: 0,
      filesUpdated: 0,
      foldersRemoved: 0,
      dryRun: false,
      problems: [],
    });
    expect({ entries: entries(folder), meta: meta(folder) }).toEqual(before);
  });

  it('walks nested folders, creates missing files and removes empty folders', async () => {
    writeFolderFiles(dir(), 'apps.common', { entries: { ok: { source: 'OK' } } });
    writeFolderFiles(dir(), 'apps.common.buttons', { entries: { cancel: { source: 'Cancel' } }, meta: {} });
    writeFolderFiles(dir(), 'apps.empty', { entries: {} });
    mkdirSync(join(dir(), 'orphan', 'deep'), { recursive: true });

    const result = await normalize(collection());

    expect(result).toMatchObject({ entriesProcessed: 2, localesAdded: 4, filesCreated: 1, filesUpdated: 3 });
    expect(result.foldersRemoved).toBe(3);
    expect(existsSync(join(dir(), 'apps', 'common', 'buttons', 'tracker_meta.json'))).toBe(true);
    expect(existsSync(join(dir(), 'orphan'))).toBe(false);
    // A folder with an empty entries file gets no metadata file from normalize; cleanup removes it.
    expect(existsSync(join(dir(), 'apps', 'empty'))).toBe(false);
  });

  it('dry run reports the changes without writing', async () => {
    const folder = writeFolderFiles(dir(), 'common', { entries: { ok: { source: 'OK' } } });
    mkdirSync(join(dir(), 'orphan'));

    const result = await normalize(collection(), { dryRun: true });

    expect(result).toMatchObject({
      entriesProcessed: 1,
      localesAdded: 2,
      filesCreated: 1,
      filesUpdated: 1,
      dryRun: true,
    });
    expect(existsSync(join(folder, 'tracker_meta.json'))).toBe(false);
    expect(entries(folder).ok).toEqual({ source: 'OK' });
    expect(existsSync(join(dir(), 'orphan'))).toBe(true);
  });

  it('returns zero counts for a missing translations folder', async () => {
    for (const dryRun of [false, true]) {
      const result = await normalize(testCollection(join(dir(), 'missing')), { dryRun });
      expect(result).toEqual({
        entriesProcessed: 0,
        localesAdded: 0,
        valuesConverted: 0,
        tagsNormalized: 0,
        filesCreated: 0,
        filesUpdated: 0,
        foldersRemoved: 0,
        dryRun,
        problems: [],
      });
    }
  });

  it('skips a folder with invalid JSON, returns it as a problem and leaves it untouched', async () => {
    const folder = writeFolderFiles(dir(), 'broken', { entries: 'invalid json{', meta: 'invalid json{' });
    writeFolderFiles(dir(), 'fine', { entries: { ok: { source: 'OK' } } });

    const result = await normalize(collection());

    expect(result.entriesProcessed).toBe(1);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatchObject({ folderPath: 'broken', absolutePath: folder });
    expect(result.problems[0]?.message).toContain('resource_entries.json');
    expect(readFileSync(join(folder, 'resource_entries.json'), 'utf8')).toBe('invalid json{');
  });

  it('leaves hidden folders alone: their entries are not normalized and their empty subfolders are kept', async () => {
    const hiddenFolder = writeFolderFiles(join(dir(), '.backup'), '', { entries: { ok: { source: 'Hi {{ name }}' } } });
    mkdirSync(join(hiddenFolder, 'empty'));

    const result = await normalize(collection());

    expect(result.entriesProcessed).toBe(0);
    expect(result.foldersRemoved).toBe(0);
    expect(entries(hiddenFolder).ok).toEqual({ source: 'Hi {{ name }}' });
    expect(existsSync(join(hiddenFolder, 'tracker_meta.json'))).toBe(false);
    expect(existsSync(join(hiddenFolder, 'empty'))).toBe(true);
  });

  it('keeps stray files and their ancestors without reporting errors', async () => {
    const folder = writeFolderFiles(dir(), 'apps.common', { entries: {}, meta: {} });
    writeFileSync(join(folder, 'notes.md'), 'my notes');
    const result = await normalize(collection());
    expect(result.foldersRemoved).toBe(0);
    expect(result.problems).toEqual([]);
    expect(readFileSync(join(folder, 'notes.md'), 'utf8')).toBe('my notes');
    expect(existsSync(join(dir(), 'apps'))).toBe(true);
  });
});
