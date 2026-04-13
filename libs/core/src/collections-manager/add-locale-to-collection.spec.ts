import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { addLocaleToCollection } from './add-locale-to-collection';
import { calculateChecksum } from '../resource/checksum';
import type { ResourceEntries } from '../resource/resource-entry';
import type { TrackerMetadata } from '../resource/tracker-metadata';
import type { SafeAny } from '../constants';
import { setupMockFs, makeBaseConfig } from './locale-spec-helpers';

vi.mock('fs');

const CWD = '/test';
const CONFIG_PATH = path.join(CWD, '.lingo-tracker.json');
const TRANSLATIONS_FOLDER = path.join(CWD, 'src/i18n');

function makeConfig(overrides: SafeAny = {}) {
  return makeBaseConfig(overrides);
}

describe('addLocaleToCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds locale to config and backfills resource entries', async () => {
    const entries: ResourceEntries = {
      ok: { source: 'OK', fr: 'OK' },
    };
    const meta: TrackerMetadata = {
      ok: { en: { checksum: calculateChecksum('OK') }, fr: { checksum: calculateChecksum('OK'), baseChecksum: calculateChecksum('OK'), status: 'new' } },
    };

    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
      [TRANSLATIONS_FOLDER]: { type: 'directory', children: ['resource_entries.json', 'tracker_meta.json'] },
      [path.join(TRANSLATIONS_FOLDER, 'resource_entries.json')]: { type: 'file', content: JSON.stringify(entries) },
      [path.join(TRANSLATIONS_FOLDER, 'tracker_meta.json')]: { type: 'file', content: JSON.stringify(meta) },
    });

    const result = await addLocaleToCollection('main', 'de', { cwd: CWD });

    expect(result.message).toBe('Locale "de" added to collection "main" successfully');
    expect(result.entriesBackfilled).toBe(1);
    expect(result.filesUpdated).toBe(1);

    const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
    // First call: config file
    const configWrite = JSON.parse(writeCalls[0][1] as string);
    expect(configWrite.collections.main.locales).toContain('de');

    // Second call: resource_entries.json — de entry should be source value
    const entriesWrite = JSON.parse(writeCalls[1][1] as string);
    expect(entriesWrite.ok.de).toBe('OK');

    // Third call: tracker_meta.json — de metadata should be status 'new'
    const metaWrite = JSON.parse(writeCalls[2][1] as string);
    expect(metaWrite.ok.de).toMatchObject({
      checksum: calculateChecksum('OK'),
      baseChecksum: calculateChecksum('OK'),
      status: 'new',
    });
  });

  it('copies global locales into collection when collection has no locales override', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
      [TRANSLATIONS_FOLDER]: { type: 'directory', children: [] },
    });

    const result = await addLocaleToCollection('main', 'de', { cwd: CWD });

    expect(result.message).toContain('de');

    const configWriteCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const writtenConfig = JSON.parse(configWriteCall[1] as string);
    // Should have copied global locales AND added de
    expect(writtenConfig.collections.main.locales).toEqual(['en', 'fr', 'de']);
  });

  it('does not copy global locales when collection already has explicit locales', async () => {
    const config = makeConfig({
      locales: ['en', 'fr'],
      collections: {
        main: { translationsFolder: 'src/i18n', locales: ['en', 'fr'] },
      },
    });

    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(config) },
      [TRANSLATIONS_FOLDER]: { type: 'directory', children: [] },
    });

    await addLocaleToCollection('main', 'de', { cwd: CWD });

    const configWriteCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const writtenConfig = JSON.parse(configWriteCall[1] as string);
    expect(writtenConfig.collections.main.locales).toEqual(['en', 'fr', 'de']);
  });

  it('handles empty translations folder gracefully (no resource files)', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
      [TRANSLATIONS_FOLDER]: { type: 'directory', children: [] },
    });

    const result = await addLocaleToCollection('main', 'de', { cwd: CWD });

    expect(result.entriesBackfilled).toBe(0);
    expect(result.filesUpdated).toBe(0);
  });

  it('handles non-existent translations folder gracefully', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
      // translations folder not in mockFs
    });

    const result = await addLocaleToCollection('main', 'de', { cwd: CWD });

    expect(result.entriesBackfilled).toBe(0);
    expect(result.filesUpdated).toBe(0);
  });

  it('throws when locale already exists in collection', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
    });

    await expect(addLocaleToCollection('main', 'fr', { cwd: CWD })).rejects.toThrow(
      'Locale "fr" already exists in collection "main"',
    );
  });

  it('throws when trying to add the base locale', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
    });

    await expect(addLocaleToCollection('main', 'en', { cwd: CWD })).rejects.toThrow(
      'Cannot add or remove the base locale "en"',
    );
  });

  it('throws when collection does not exist', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
    });

    await expect(addLocaleToCollection('nonexistent', 'de', { cwd: CWD })).rejects.toThrow(
      'Collection "nonexistent" not found',
    );
  });

  it('throws when locale format is invalid', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
    });

    await expect(addLocaleToCollection('main', 'not-valid-123', { cwd: CWD })).rejects.toThrow(
      'Invalid locale format',
    );
  });

  it('uses collection-level baseLocale when blocking base locale add', async () => {
    const config = makeConfig({
      collections: {
        main: { translationsFolder: 'src/i18n', baseLocale: 'fr' },
      },
    });

    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(config) },
    });

    await expect(addLocaleToCollection('main', 'fr', { cwd: CWD })).rejects.toThrow(
      'Cannot add or remove the base locale "fr"',
    );
  });
});
