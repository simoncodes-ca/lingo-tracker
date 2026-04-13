import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { removeLocaleFromCollection } from './remove-locale-from-collection';
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
  return makeBaseConfig({
    locales: ['en', 'fr', 'de'],
    ...overrides,
  });
}

describe('removeLocaleFromCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes locale from config and purges resource entries', async () => {
    const entries: ResourceEntries = {
      ok: { source: 'OK', fr: 'OK FR', de: 'OK DE' },
    };
    const meta: TrackerMetadata = {
      ok: {
        en: { checksum: calculateChecksum('OK') },
        fr: { checksum: calculateChecksum('OK FR'), baseChecksum: calculateChecksum('OK'), status: 'translated' },
        de: { checksum: calculateChecksum('OK DE'), baseChecksum: calculateChecksum('OK'), status: 'translated' },
      },
    };

    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
      [TRANSLATIONS_FOLDER]: { type: 'directory', children: ['resource_entries.json', 'tracker_meta.json'] },
      [path.join(TRANSLATIONS_FOLDER, 'resource_entries.json')]: { type: 'file', content: JSON.stringify(entries) },
      [path.join(TRANSLATIONS_FOLDER, 'tracker_meta.json')]: { type: 'file', content: JSON.stringify(meta) },
    });

    const result = await removeLocaleFromCollection('main', 'fr', { cwd: CWD });

    expect(result.message).toBe('Locale "fr" removed from collection "main" successfully');
    expect(result.entriesPurged).toBe(1);
    expect(result.filesUpdated).toBe(1);

    const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;

    // First write: updated config (fr removed from locales)
    const configWrite = JSON.parse(writeCalls[0][1] as string);
    expect(configWrite.collections.main.locales).not.toContain('fr');
    expect(configWrite.collections.main.locales).toContain('de');

    // Second write: updated resource_entries.json (fr key removed)
    const entriesWrite = JSON.parse(writeCalls[1][1] as string);
    expect(entriesWrite.ok.fr).toBeUndefined();
    expect(entriesWrite.ok.de).toBe('OK DE');

    // Third write: updated tracker_meta.json (fr metadata removed)
    const metaWrite = JSON.parse(writeCalls[2][1] as string);
    expect(metaWrite.ok.fr).toBeUndefined();
    expect(metaWrite.ok.de).toBeDefined();
  });

  it('copies global locales into collection when collection has no locales override', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
      [TRANSLATIONS_FOLDER]: { type: 'directory', children: [] },
    });

    const result = await removeLocaleFromCollection('main', 'fr', { cwd: CWD });

    expect(result.message).toContain('fr');

    const configWriteCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const writtenConfig = JSON.parse(configWriteCall[1] as string);
    // Should have copied global locales and removed fr
    expect(writtenConfig.collections.main.locales).toEqual(['en', 'de']);
  });

  it('allows removing the last non-base locale (monolingual collection)', async () => {
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

    const result = await removeLocaleFromCollection('main', 'fr', { cwd: CWD });

    expect(result.message).toContain('fr');

    const configWriteCall = vi.mocked(fs.writeFileSync).mock.calls[0];
    const writtenConfig = JSON.parse(configWriteCall[1] as string);
    expect(writtenConfig.collections.main.locales).toEqual(['en']);
  });

  it('handles empty translations folder gracefully (no resource files)', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
      [TRANSLATIONS_FOLDER]: { type: 'directory', children: [] },
    });

    const result = await removeLocaleFromCollection('main', 'fr', { cwd: CWD });

    expect(result.entriesPurged).toBe(0);
    expect(result.filesUpdated).toBe(0);
  });

  it('handles non-existent translations folder gracefully', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
      // no translations folder
    });

    const result = await removeLocaleFromCollection('main', 'fr', { cwd: CWD });

    expect(result.entriesPurged).toBe(0);
    expect(result.filesUpdated).toBe(0);
  });

  it('throws when locale does not exist in collection', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
    });

    await expect(removeLocaleFromCollection('main', 'ja', { cwd: CWD })).rejects.toThrow(
      'Locale "ja" not found in collection "main"',
    );
  });

  it('throws when trying to remove the base locale', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
    });

    await expect(removeLocaleFromCollection('main', 'en', { cwd: CWD })).rejects.toThrow(
      'Cannot add or remove the base locale "en"',
    );
  });

  it('throws when collection does not exist', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
    });

    await expect(removeLocaleFromCollection('nonexistent', 'fr', { cwd: CWD })).rejects.toThrow(
      'Collection "nonexistent" not found',
    );
  });

  it('throws when locale format is invalid', async () => {
    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(makeConfig()) },
    });

    await expect(removeLocaleFromCollection('main', 'not-valid-123', { cwd: CWD })).rejects.toThrow(
      'Invalid locale format',
    );
  });

  it('uses collection-level baseLocale when blocking base locale removal', async () => {
    const config = makeConfig({
      collections: {
        main: { translationsFolder: 'src/i18n', baseLocale: 'fr', locales: ['fr', 'de'] },
      },
    });

    setupMockFs({
      [CONFIG_PATH]: { type: 'file', content: JSON.stringify(config) },
    });

    await expect(removeLocaleFromCollection('main', 'fr', { cwd: CWD })).rejects.toThrow(
      'Cannot add or remove the base locale "fr"',
    );
  });
});
