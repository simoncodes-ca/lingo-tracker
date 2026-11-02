import * as fs from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import type { OpenedCollection } from '../config/open-collection';
import {
  CollectionNotFoundError,
  InvalidResourceKeyError,
  ReadOnlyCollectionError,
} from '../errors/lingo-tracker-error';
import { executeMove, executeMoves, type MoveRequest } from './execute-move';
import * as movePlan from './move-plan';
import type { ResourceMutation } from './resource-mutation';

function collection(translationsFolder: string, name = 'main'): OpenedCollection {
  return {
    runtime: 'transloco-messageformat',
    onMutation: () => undefined,
    name,
    translationsFolder,
    baseLocale: 'en',
    locales: ['en'],
    targetLocales: [],
    translationConfig: undefined,
    tags: [],
    termFiles: {
      protectedTerms: { path: '/nonexistent/.lingo-tracker-protected-terms.json', explicit: false },
      preferredTerminology: { path: '/nonexistent/.lingo-tracker-preferred-terminology.json', explicit: false },
    },
    readOnly: false,
    projectRoot: translationsFolder,
    sourceConfig: { exportFolder: 'dist', importFolder: 'import', baseLocale: 'en', locales: ['en'], collections: {} },
    config: { translationsFolder },
  };
}

const moveConfig = (name: string, translationsFolder: string): LingoTrackerConfig => ({
  exportFolder: 'dist',
  importFolder: 'import',
  baseLocale: 'en',
  locales: ['en'],
  collections: { [name]: { translationsFolder } },
});

// Keep real filesystem operations; a mutable copy permits the validation-order spy below.
vi.mock('node:fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:fs')>()) }));

describe('Move Resource (real fs)', () => {
  const root = useTempDir('move-resource-unified-');
  let testDir: string;

  beforeEach(() => {
    testDir = root();
  });
  afterEach(() => vi.restoreAllMocks());

  describe('Single Resource Move', () => {
    it('should move a single resource successfully', async () => {
      // Setup source
      const sourceFolder = join(testDir, 'common', 'buttons');
      fs.mkdirSync(sourceFolder, { recursive: true });
      const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        sourceFile,
        JSON.stringify({
          ok: { source: 'OK', comment: 'OK button' },
        }),
      );

      const result = await executeMove(collection(testDir), {
        source: 'common.buttons.ok',
        destination: 'common.actions.ok',
      });

      expect(result.movedCount).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.outcome).toBe('succeeded');

      // Verify source gone
      // In this case, since 'ok' was the only key, the file should be deleted by deleteResource -> unlinkSync
      expect(fs.existsSync(sourceFile)).toBe(false);

      // Verify dest exists
      const destFolder = join(testDir, 'common', 'actions');
      const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
      expect(fs.existsSync(destFile)).toBe(true);

      const destFileContent = fs.readFileSync(destFile, 'utf8');
      expect(destFileContent).toBeDefined();
      const destContent = JSON.parse(destFileContent);
      expect(destContent.ok).toBeDefined();
      expect(destContent.ok.source).toBe('OK');
    });

    it('should warn and skip if destination exists and override is false', async () => {
      // Setup source
      const sourceFolder = join(testDir, 'a');
      fs.mkdirSync(sourceFolder, { recursive: true });
      const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        sourceFile,
        JSON.stringify({
          key: { source: 'Source' },
        }),
      );

      // Setup dest
      const destFolder = join(testDir, 'b');
      fs.mkdirSync(destFolder, { recursive: true });
      const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        destFile,
        JSON.stringify({
          key: { source: 'Dest' },
        }),
      );

      const result = await executeMove(collection(testDir), {
        source: 'a.key',
        destination: 'b.key',
        override: false,
      });

      expect(result.movedCount).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.outcome).toBe('succeeded');

      // Verify no change
      const sourceFileContent = fs.readFileSync(sourceFile, 'utf8');
      expect(sourceFileContent).toBeDefined();
      const sourceContent = JSON.parse(sourceFileContent);
      expect(sourceContent.key).toBeDefined();
    });

    it('should override if destination exists and override is true', async () => {
      // Setup source
      const sourceFolder = join(testDir, 'a');
      fs.mkdirSync(sourceFolder, { recursive: true });
      const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        sourceFile,
        JSON.stringify({
          key: { source: 'Source' },
        }),
      );

      // Setup dest
      const destFolder = join(testDir, 'b');
      fs.mkdirSync(destFolder, { recursive: true });
      const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        destFile,
        JSON.stringify({
          key: { source: 'Dest' },
        }),
      );

      const result = await executeMove(collection(testDir), {
        source: 'a.key',
        destination: 'b.key',
        override: true,
      });

      expect(result.movedCount).toBe(1);

      // Verify dest updated
      const destFileContent = fs.readFileSync(destFile, 'utf8');
      expect(destFileContent).toBeDefined();
      const destContent = JSON.parse(destFileContent);
      expect(destContent.key.source).toBe('Source');
    });
  });

  describe('Wildcard Pattern Move', () => {
    it('should move multiple resources matching pattern', async () => {
      // Setup: common.buttons.ok, common.buttons.cancel
      const sourceFolder = join(testDir, 'common', 'buttons');
      fs.mkdirSync(sourceFolder, { recursive: true });
      const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        sourceFile,
        JSON.stringify({
          ok: { source: 'OK' },
          cancel: { source: 'Cancel' },
        }),
      );

      const result = await executeMove(collection(testDir), {
        source: 'common.buttons.*',
        destination: 'common.actions',
      });

      expect(result.movedCount).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.outcome).toBe('succeeded');

      // Verify dest
      const destFolder = join(testDir, 'common', 'actions');
      const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
      expect(fs.existsSync(destFile)).toBe(true);

      const destFileContent = fs.readFileSync(destFile, 'utf8');
      expect(destFileContent).toBeDefined();
      const destContent = JSON.parse(destFileContent);
      expect(destContent.ok).toBeDefined();
      expect(destContent.cancel).toBeDefined();
    });

    it('should handle nested resources in wildcard', async () => {
      // Setup: common.buttons.ok, common.buttons.sub.item
      const buttonsFolder = join(testDir, 'common', 'buttons');
      fs.mkdirSync(buttonsFolder, { recursive: true });
      const buttonsFile = join(buttonsFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        buttonsFile,
        JSON.stringify({
          ok: { source: 'OK' },
        }),
      );

      const subFolder = join(buttonsFolder, 'sub');
      fs.mkdirSync(subFolder, { recursive: true });
      const subFile = join(subFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        subFile,
        JSON.stringify({
          item: { source: 'Item' },
        }),
      );

      const result = await executeMove(collection(testDir), {
        source: 'common.buttons.*',
        destination: 'common.actions',
      });

      expect(result.movedCount).toBe(2);

      // Verify dest
      const actionsFolder = join(testDir, 'common', 'actions');
      const actionsFile = join(actionsFolder, RESOURCE_ENTRIES_FILENAME);
      const actionsFileContent = fs.readFileSync(actionsFile, 'utf8');
      expect(actionsFileContent).toBeDefined();
      const actionsContent = JSON.parse(actionsFileContent);
      expect(actionsContent.ok).toBeDefined();

      const subActionsFolder = join(actionsFolder, 'sub');
      const subActionsFile = join(subActionsFolder, RESOURCE_ENTRIES_FILENAME);
      const subActionsFileContent = fs.readFileSync(subActionsFile, 'utf8');
      expect(subActionsFileContent).toBeDefined();
      const subActionsContent = JSON.parse(subActionsFileContent);
      expect(subActionsContent.item).toBeDefined();
    });
  });
  describe('Cross-Collection Move', () => {
    it('should move resource to a different destination folder', async () => {
      // Setup source in collection A
      const collectionAFolder = join(testDir, 'collectionA');
      const sourceFolder = join(collectionAFolder, 'common', 'buttons');
      fs.mkdirSync(collectionAFolder, { recursive: true });
      fs.mkdirSync(sourceFolder, { recursive: true });
      const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        sourceFile,
        JSON.stringify({
          ok: { source: 'OK' },
        }),
      );

      // Setup dest in collection B
      const collectionBFolder = join(testDir, 'collectionB');
      fs.mkdirSync(collectionBFolder, { recursive: true });

      const result = await executeMove(
        { ...collection(collectionAFolder, 'collectionA'), sourceConfig: moveConfig('collectionB', collectionBFolder) },
        { source: 'common.buttons.ok', destination: 'common.actions.ok', toCollection: 'collectionB' },
      );

      expect(result.movedCount).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(result.outcome).toBe('succeeded');

      // Verify source gone from A
      expect(fs.existsSync(sourceFile)).toBe(false);

      // Verify dest exists in B
      const destFolder = join(collectionBFolder, 'common', 'actions');
      const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
      expect(fs.existsSync(destFile)).toBe(true);

      const destFileContent = fs.readFileSync(destFile, 'utf8');
      expect(destFileContent).toBeDefined();
      const destContent = JSON.parse(destFileContent);
      expect(destContent.ok).toBeDefined();
      expect(destContent.ok.source).toBe('OK');
    });

    it('should move wildcard resources to a different destination folder', async () => {
      // Setup source in collection A
      const collectionAFolder = join(testDir, 'collectionA');
      const sourceFolder = join(collectionAFolder, 'common', 'buttons');
      fs.mkdirSync(collectionAFolder, { recursive: true });
      fs.mkdirSync(sourceFolder, { recursive: true });
      const sourceFile = join(sourceFolder, RESOURCE_ENTRIES_FILENAME);
      fs.writeFileSync(
        sourceFile,
        JSON.stringify({
          ok: { source: 'OK' },
          cancel: { source: 'Cancel' },
        }),
      );

      // Setup dest in collection B
      const collectionBFolder = join(testDir, 'collectionB');
      fs.mkdirSync(collectionBFolder, { recursive: true });

      const result = await executeMove(
        { ...collection(collectionAFolder, 'collectionA'), sourceConfig: moveConfig('collectionB', collectionBFolder) },
        { source: 'common.buttons.*', destination: 'common.actions', toCollection: 'collectionB' },
      );

      expect(result.movedCount).toBe(2);

      // Verify dest in B
      const destFolder = join(collectionBFolder, 'common', 'actions');
      const destFile = join(destFolder, RESOURCE_ENTRIES_FILENAME);
      expect(fs.existsSync(destFile)).toBe(true);

      const destFileContent = fs.readFileSync(destFile, 'utf8');
      expect(destFileContent).toBeDefined();
      const destContent = JSON.parse(destFileContent);
      expect(destContent.ok).toBeDefined();
      expect(destContent.cancel).toBeDefined();
    });
  });

  describe('Security', () => {
    it('should handle invalid characters in pattern during scanning', async () => {
      // Test with invalid characters that shouldn't be allowed in keys
      const invalidPattern = 'invalid@char*';
      const invalidPath = join(testDir, 'invalid@char');
      const exists = vi.spyOn(fs, 'existsSync');

      expect(() =>
        executeMove(collection(testDir), {
          source: invalidPattern,
          destination: 'dest',
        }),
      ).toThrow(
        expect.objectContaining({
          name: InvalidResourceKeyError.name,
          kind: 'invalid',
          key: invalidPattern,
          message: 'Key validation: Invalid key segment "invalid@char". Segments must match pattern [A-Za-z0-9_-]+',
        }),
      );
      expect(exists).not.toHaveBeenCalledWith(invalidPath);
    });
  });

  it('fails a wildcard run that moves readable resources but reports an unreadable folder', async () => {
    writeFolderFiles(testDir, 'source.good', { entries: { ok: { source: 'OK' } } });
    writeFolderFiles(testDir, 'source.bad', { entries: '{ invalid json' });

    const result = await executeMove(collection(testDir), { source: 'source.*', destination: 'dest' });

    expect(result.movedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.outcome).toBe('failed');
    expect(fs.existsSync(join(testDir, 'source', 'bad', RESOURCE_ENTRIES_FILENAME))).toBe(true);
  });

  it('fails a single resource move when the source does not exist', async () => {
    const result = await executeMove(collection(testDir), {
      source: 'missing.key',
      destination: 'dest.key',
    });

    expect(result.movedCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.outcome).toBe('failed');
  });
  it('throws a typed missing destination for every selection before any filesystem work', async () => {
    const exists = vi.spyOn(fs, 'existsSync');
    for (const kind of ['key', 'pattern', 'folder'] as const) {
      expect(() =>
        executeMove(collection(testDir), {
          ...(kind === 'folder' ? { kind: 'folder' as const } : {}),
          source: kind === 'pattern' ? 'source.*' : 'source',
          destination: 'dest',
          toCollection: 'other',
        }),
      ).toThrow(expect.objectContaining({ name: CollectionNotFoundError.name, kind: 'not-found' }));
    }
    expect(exists).not.toHaveBeenCalled();
  });

  it('throws destination refusals for each single selection and reports them in batches without mutations', () => {
    const onMutation = vi.fn();
    const write = vi.spyOn(fs, 'writeFileSync');
    const config = {
      ...moveConfig('vendor', 'vendor'),
      collections: { vendor: { translationsFolder: 'vendor', readOnly: true } },
    };
    for (const source of ['source.key', 'source.*']) {
      for (const kind of [undefined, 'folder'] as const) {
        for (const name of ['missing', 'vendor']) {
          const error =
            name === 'missing' ? new CollectionNotFoundError(name, 'destination') : new ReadOnlyCollectionError(name);
          const request: MoveRequest = {
            ...(kind === 'folder' ? { kind } : {}),
            source: kind === 'folder' ? 'source' : source,
            destination: 'dest',
            toCollection: name,
          };
          expect(() =>
            executeMove(
              {
                ...{ ...collection(testDir), sourceConfig: config },
                onMutation: onMutation ?? { ...collection(testDir), sourceConfig: config }.onMutation,
              },
              request,
            ),
          ).toThrow(error);
          expect(
            executeMoves(
              {
                ...{ ...collection(testDir), sourceConfig: config },
                onMutation: onMutation ?? { ...collection(testDir), sourceConfig: config }.onMutation,
              },
              [request],
            ),
          ).toMatchObject({
            outcome: 'failed',
            movedCount: 0,
            errors: [error.message],
          });
        }
      }
    }
    expect(write).not.toHaveBeenCalled();
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('validates batch resource selections exactly once before execution', async () => {
    const validate = vi.spyOn(movePlan, 'validateMoveInput');
    await executeMoves(collection(testDir), [
      { source: 'missing.key', destination: 'dest.key' },
      { source: 'missing.*', destination: '' },
    ]);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('prevalidates folder inputs and reports missing destinations per batch operation', () => {
    const onMutation = vi.fn();
    const write = vi.spyOn(fs, 'writeFileSync');
    const first: MoveRequest = { source: 'source.ok', destination: 'dest.ok', toCollection: 'other' };
    expect(() =>
      executeMoves({ ...collection(testDir), onMutation: onMutation ?? collection(testDir).onMutation }, [
        first,
        { kind: 'folder', source: 'invalid@folder', destination: 'dest' },
      ]),
    ).toThrow(expect.objectContaining({ code: 'INVALID_FOLDER_PATH' }));
    expect(
      executeMoves({ ...collection(testDir), onMutation: onMutation ?? collection(testDir).onMutation }, [
        first,
        { source: 'source.*', destination: 'dest', toCollection: 'other' },
        { kind: 'folder', source: 'source', destination: 'dest', toCollection: 'other' },
      ]),
    ).toMatchObject({
      outcome: 'failed',
      movedCount: 0,
      errors: Array(3).fill(new CollectionNotFoundError('other', 'destination').message),
    });
    expect(write).not.toHaveBeenCalled();
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('infers key and pattern selections from source addresses', () => {
    writeFolderFiles(testDir, 'source', { entries: { ok: { source: 'OK' }, cancel: { source: 'Cancel' } } });
    expect(executeMove(collection(testDir), { source: 'source.ok', destination: 'dest.ok' }).movedCount).toBe(1);
    expect(executeMove(collection(testDir), { source: 'source.*', destination: 'other' }).movedCount).toBe(1);
  });

  it('throws for a missing folder in single and batch moves before earlier selections write', () => {
    writeFolderFiles(testDir, 'source', { entries: { ok: { source: 'OK' } } });
    const onMutation = vi.fn();
    const write = vi.spyOn(fs, 'writeFileSync');
    const missing: MoveRequest = { kind: 'folder', source: 'absent', destination: 'dest' };
    expect(() =>
      executeMove({ ...collection(testDir), onMutation: onMutation ?? collection(testDir).onMutation }, missing),
    ).toThrow(expect.objectContaining({ code: 'FOLDER_NOT_FOUND' }));
    expect(() =>
      executeMoves({ ...collection(testDir), onMutation: onMutation ?? collection(testDir).onMutation }, [
        { source: 'source.ok', destination: 'dest.ok' },
        missing,
      ]),
    ).toThrow(expect.objectContaining({ code: 'FOLDER_NOT_FOUND' }));
    expect(write).not.toHaveBeenCalled();
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('aggregates folder removals and continues mixed selections after a destination refusal', async () => {
    writeFolderFiles(testDir, 'source', { entries: { ok: { source: 'OK' } } });
    writeFolderFiles(testDir, 'tree', { entries: { ok: { source: 'Folder OK' } } });
    const result = await executeMoves({ ...collection(testDir), sourceConfig: moveConfig('main', testDir) }, [
      { source: 'source.*', destination: 'ignored', toCollection: 'missing' },
      { source: 'source.ok', destination: 'dest.ok' },
      { kind: 'folder', source: 'tree', destination: 'shared' },
    ]);
    expect(result).toEqual({
      outcome: 'failed',
      movedCount: 2,
      foldersDeleted: 1,
      warnings: [],
      errors: [new CollectionNotFoundError('missing', 'destination').message],
    });
    expect(fs.existsSync(join(testDir, 'tree'))).toBe(false);
    expect(fs.existsSync(join(testDir, 'source'))).toBe(false);
    expect(fs.existsSync(join(testDir, 'shared', 'tree', RESOURCE_ENTRIES_FILENAME))).toBe(true);
  });
});

describe('Move Run interrupted mutation reporting', () => {
  const root = useTempDir('move-interrupted-sink-');

  it('prunes the in-flight move and earlier emptied folders when the second sink upsert throws', () => {
    writeFolderFiles(root(), 'a', { entries: { ok: { source: 'A' } } });
    writeFolderFiles(root(), 'c', { entries: { ok: { source: 'C' } } });
    writeFolderFiles(root(), 'later', { entries: { ok: { source: 'Later' } } });
    const failure = new Error('Second upsert failed');
    const onMutation = vi.fn((mutation: ResourceMutation) => {
      if (mutation.kind === 'upsert' && mutation.key === 'd.ok') throw failure;
    });

    expect(() =>
      executeMoves({ ...collection(root()), onMutation: onMutation ?? collection(root()).onMutation }, [
        { source: 'a.*', destination: 'b' },
        { source: 'c.*', destination: 'd' },
        { source: 'later.*', destination: 'untouched' },
      ]),
    ).toThrow(failure);

    expect(fs.existsSync(join(root(), 'a'))).toBe(false);
    expect(fs.existsSync(join(root(), 'c'))).toBe(false);
    expect(fs.existsSync(join(root(), 'b', RESOURCE_ENTRIES_FILENAME))).toBe(true);
    expect(fs.existsSync(join(root(), 'd', RESOURCE_ENTRIES_FILENAME))).toBe(true);
    expect(fs.existsSync(join(root(), 'later', RESOURCE_ENTRIES_FILENAME))).toBe(true);
    expect(fs.existsSync(join(root(), 'untouched'))).toBe(false);
    expect(onMutation.mock.calls.map(([mutation]) => mutation)).toEqual([
      { kind: 'remove', translationsFolder: root(), key: 'a.ok' },
      expect.objectContaining({ kind: 'upsert', key: 'b.ok' }),
      { kind: 'remove', translationsFolder: root(), key: 'c.ok' },
      expect.objectContaining({ kind: 'upsert', key: 'd.ok' }),
      { kind: 'remove-folder', translationsFolder: root(), path: 'a' },
      { kind: 'remove-folder', translationsFolder: root(), path: 'c' },
    ]);
  });
});
