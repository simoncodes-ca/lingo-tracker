import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { CONFIG_FILENAME } from '../../constants';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import { loadConfig } from './config-file-operations';
import { readProjectTermsView } from './project-terms-view';
import type { ProtectedTermsEdit } from './protected-terms-request';
import { failure, written } from './project-terms-outcome.spec-helpers';
import { updateProjectTerms } from './update-project-terms';

const baseConfig: LingoTrackerConfig = {
  exportFolder: 'dist/lingo-export',
  importFolder: 'dist/lingo-import',
  baseLocale: 'en',
  locales: ['en', 'es'],
  collections: { myApp: { translationsFolder: './i18n', locales: ['en', 'es'], tags: ['feature-a'] } },
};

describe('protected terms edits', () => {
  const tempDir = useTempDir('protected-terms-edit-');
  const configPath = () => join(tempDir(), CONFIG_FILENAME);
  const defaultPath = () => join(tempDir(), '.lingo-tracker-protected-terms.json');
  const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
  const writeConfig = (config: LingoTrackerConfig = baseConfig) => writeFileSync(configPath(), JSON.stringify(config));
  const project = () => ({ projectRoot: tempDir(), sourceConfig: loadConfig({ cwd: tempDir() }) });
  const replaceGlobalTerms = (terms: string[]) =>
    updateProjectTerms(project(), { protectedTerms: { target: {}, change: { kind: 'replace', replace: terms } } });
  const replaceCollectionTerms = (collection: string, terms: string[]) =>
    updateProjectTerms(project(), {
      protectedTerms: { target: { collection }, change: { kind: 'edit', edit: { set: terms } } },
    });
  const changeGlobalTermsPointer = (pointer: string | undefined) =>
    updateProjectTerms(project(), { protectedTerms: { target: {}, change: { kind: 'view' }, file: pointer ?? '' } });
  const changeCollectionTermsPointer = (collection: string, pointer: string | undefined) =>
    updateProjectTerms(project(), {
      protectedTerms: { target: { collection }, change: { kind: 'view' }, file: pointer ?? '' },
    });
  const applyTermsEdit = (target: { collection?: string }, edit: ProtectedTermsEdit) =>
    updateProjectTerms(project(), { protectedTerms: { target, change: { kind: 'edit', edit } } });

  beforeEach(() => {
    mkdirSync(join(tempDir(), 'i18n'));
    mkdirSync(join(tempDir(), 'config'));
    writeConfig();
  });

  describe('global list', () => {
    it('writes normalized, deduped, sorted terms to the default file', () => {
      const result = replaceGlobalTerms([' Node.js ', 'iPhone', 'iPhone']);
      expect(written(result)?.protectedTermsResult?.filePath).toBe(defaultPath());
      expect(readJson(defaultPath())).toEqual(['iPhone', 'Node.js']);
    });
    it('leaves the config unchanged', () => {
      const before = readFileSync(configPath(), 'utf8');
      replaceGlobalTerms(['iPhone']);
      expect(readFileSync(configPath(), 'utf8')).toBe(before);
    });
    it('writes an empty array when cleared', () => {
      writeFileSync(defaultPath(), '["iPhone"]');
      replaceGlobalTerms([]);
      expect(readJson(defaultPath())).toEqual([]);
      expect(existsSync(defaultPath())).toBe(true);
    });
    it('ends the file with a trailing newline', () => {
      replaceGlobalTerms(['iPhone']);
      expect(readFileSync(defaultPath(), 'utf8')).toBe('[\n  "iPhone"\n]\n');
    });
  });

  describe('collection list', () => {
    it('writes to the collection file when configured', () => {
      writeConfig({
        ...baseConfig,
        collections: { myApp: { ...baseConfig.collections['myApp'], protectedTermsFile: 'i18n/terms.json' } },
      });
      const result = replaceCollectionTerms('myApp', ['iPhone', ' Node.js ']);
      expect(written(result)?.protectedTermsResult?.filePath).toBe(join(tempDir(), 'i18n/terms.json'));
      expect(readJson(written(result)?.protectedTermsResult?.filePath ?? '')).toEqual(['iPhone', 'Node.js']);
    });
    it('rejects a collection with no terms file', () => {
      expect(failure(replaceCollectionTerms('myApp', ['iPhone']), 'refused').error).toMatchObject({
        message: expect.stringContaining('has no protected terms file'),
      });
    });
    it('rejects an unknown collection', () => {
      expect(failure(replaceCollectionTerms('nope', ['iPhone']), 'refused').error).toMatchObject({
        message: expect.stringContaining('Collection "nope" not found'),
      });
    });
  });

  describe('global pointer', () => {
    it('stores the pointer and carries terms into the new file', () => {
      writeFileSync(defaultPath(), '["iPhone"]');
      const result = changeGlobalTermsPointer('config/terms.json');
      expect(written(result)?.protectedTermsFileChange?.filePath).toBe(join(tempDir(), 'config/terms.json'));
      expect((readJson(configPath()) as LingoTrackerConfig).protectedTermsFile).toBe('config/terms.json');
      expect(readJson(written(result)?.protectedTermsFileChange?.filePath ?? '')).toEqual(['iPhone']);
    });
    it.each([undefined, '', '   '])('clears the pointer for %j', (pointer) => {
      changeGlobalTermsPointer(pointer);
      expect((readJson(configPath()) as LingoTrackerConfig).protectedTermsFile).toBeUndefined();
    });
    it('leaves config untouched for a missing target directory', () => {
      const before = readFileSync(configPath(), 'utf8');
      expect(failure(changeGlobalTermsPointer('nope/terms.json'), 'refused').error).toMatchObject({
        message: expect.stringContaining('directory does not exist'),
      });
      expect(readFileSync(configPath(), 'utf8')).toBe(before);
    });
  });

  describe('collection pointer', () => {
    it('stores the pointer and creates the file', () => {
      const result = changeCollectionTermsPointer('myApp', 'i18n/terms.json');
      expect(written(result)?.protectedTermsFileChange?.filePath).toBe(join(tempDir(), 'i18n/terms.json'));
      expect((readJson(configPath()) as LingoTrackerConfig).collections['myApp'].protectedTermsFile).toBe(
        'i18n/terms.json',
      );
      expect(readJson(written(result)?.protectedTermsFileChange?.filePath ?? '')).toEqual([]);
    });
    it.each([undefined, '', '   '])('clears the pointer for %j', (pointer) => {
      const result = changeCollectionTermsPointer('myApp', pointer);
      expect(written(result)?.protectedTermsFileChange?.filePath).toBeUndefined();
      expect(written(result)?.protectedTermsFileChange?.message).toBe(
        'Collection "myApp" protected terms file cleared',
      );
      expect((readJson(configPath()) as LingoTrackerConfig).collections['myApp'].protectedTermsFile).toBeUndefined();
    });
    it('preserves a translation override and the rest of the record', () => {
      const translation = { enabled: false, provider: 'none' as const, apiKeyEnv: 'NONE' };
      writeConfig({ ...baseConfig, collections: { myApp: { ...baseConfig.collections['myApp'], translation } } });
      changeCollectionTermsPointer('myApp', 'i18n/terms.json');
      expect((readJson(configPath()) as LingoTrackerConfig).collections['myApp']).toEqual({
        translationsFolder: './i18n',
        tags: ['feature-a'],
        translation,
        protectedTermsFile: 'i18n/terms.json',
      });
    });
    it('rejects an unknown collection', () => {
      expect(failure(changeCollectionTermsPointer('nope', 'terms.json'), 'refused').error).toMatchObject({
        message: expect.stringContaining('Collection "nope" not found'),
      });
    });
    it('leaves config untouched for a missing target directory', () => {
      const before = readFileSync(configPath(), 'utf8');
      expect(failure(changeCollectionTermsPointer('myApp', 'nope/terms.json'), 'refused').error).toMatchObject({
        message: expect.stringContaining('directory does not exist'),
      });
      expect(readFileSync(configPath(), 'utf8')).toBe(before);
    });
  });

  it('adds, removes, and replaces terms through one edit interface', () => {
    writeFileSync(defaultPath(), '["iPhone"]');
    expect(written(applyTermsEdit({}, { add: [' Node.js ', 'iPhone'] }))?.protectedTermsResult?.terms).toEqual([
      'iPhone',
      'Node.js',
    ]);
    expect(written(applyTermsEdit({}, { remove: ['iPhone'] }))?.protectedTermsResult?.terms).toEqual(['Node.js']);
    expect(written(applyTermsEdit({}, { set: [' C++', ' C++ '] }))?.protectedTermsResult?.terms).toEqual(['C++']);
    expect(readJson(defaultPath())).toEqual(['C++']);
  });

  it('changes a pointer before adding to the new file and reports the list before the edit', () => {
    writeFileSync(defaultPath(), '["iPhone"]');
    changeGlobalTermsPointer('config/terms.json');
    const view = readProjectTermsView(project()).forTarget({});
    const result = applyTermsEdit({}, { add: ['Pixel'] });
    expect(view.globalTerms).toEqual(['iPhone']);
    expect(written(result)?.protectedTermsResult?.terms).toEqual(['iPhone', 'Pixel']);
    expect(written(result)?.protectedTermsResult?.filePath).toBe(join(tempDir(), 'config/terms.json'));
    expect(readJson(written(result)?.protectedTermsResult?.filePath ?? '')).toEqual(['iPhone', 'Pixel']);
  });

  it('does not overwrite a malformed list during an edit', () => {
    writeFileSync(defaultPath(), '{broken');
    expect(failure(applyTermsEdit({}, { add: ['New'] }), 'refused').error).toMatchObject({
      message: expect.stringContaining('not valid JSON'),
    });
    expect(readFileSync(defaultPath(), 'utf8')).toBe('{broken');
  });

  it('rejects a non-string list before writing a term file', () => {
    const before = readFileSync(configPath(), 'utf8');
    expect(failure(replaceGlobalTerms(['iPhone', 42] as never), 'refused').error).toMatchObject({
      message: expect.stringContaining('protectedTerms must be an array of strings'),
    });
    expect(existsSync(defaultPath())).toBe(false);
    expect(readFileSync(configPath(), 'utf8')).toBe(before);
  });
});
