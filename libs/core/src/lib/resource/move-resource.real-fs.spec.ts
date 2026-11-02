import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import type { OpenedCollection } from '../config/open-collection';
import {
  CollectionNotFoundError,
  InvalidResourceKeyError,
  ReadOnlyCollectionError,
} from '../errors/lingo-tracker-error';
import { writeJsonFile } from '../file-io/json-file-operations';
import { calculateChecksum } from './checksum';
import { executeMove, executeMoves } from './execute-move';
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

const md5 = calculateChecksum;

/**
 * Regression: moves used to go through addResource, which rebuilt metadata and marked every
 * carried translation 'translated' — losing 'verified' and 'stale'. Moves are now lossless.
 */
describe('moving resources keeps metadata (real fs)', () => {
  let root: string;

  const collection = (translationsFolder = root, name = 'main'): OpenedCollection => ({
    runtime: 'transloco-messageformat',
    onMutation: () => undefined,
    name,
    translationsFolder,
    baseLocale: 'en',
    locales: ['en', 'fr', 'es'],
    targetLocales: ['fr', 'es'],
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
  });

  const entries = { ok: { source: 'OK', comment: 'Button', tags: ['ui'], fr: "D'accord", es: 'Vale' } };
  const meta = {
    ok: {
      en: { checksum: md5('OK') },
      fr: { checksum: md5("D'accord"), baseChecksum: md5('OK'), status: 'verified' },
      es: { checksum: md5('Vale'), baseChecksum: md5('Old OK'), status: 'stale' },
    },
  };

  function writeFolder(...segments: string[]): void {
    const folder = join(root, ...segments);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'resource_entries.json'), JSON.stringify(entries));
    writeFileSync(join(folder, 'tracker_meta.json'), JSON.stringify(meta));
  }

  function read(file: 'resource_entries.json' | 'tracker_meta.json', ...segments: string[]) {
    return JSON.parse(readFileSync(join(root, ...segments, file), 'utf8'));
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'move-resource-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('executeMove carries values, details, checksums, and statuses', async () => {
    writeFolder('common');

    const result = await executeMove(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { source: 'common.ok', destination: 'shared.buttons.confirm' },
    );

    expect(result).toEqual({
      outcome: 'succeeded',
      movedCount: 1,
      warnings: [],
      errors: [],
    });
    expect(collected).toEqual([
      { kind: 'remove', translationsFolder: root, key: 'common.ok' },
      { kind: 'upsert', translationsFolder: root, key: 'shared.buttons.confirm', entry: expect.any(Object) },
      { kind: 'remove-folder', translationsFolder: root, path: 'common' },
    ]);
    expect(read('resource_entries.json', 'shared', 'buttons')).toEqual({ confirm: entries.ok });
    expect(read('tracker_meta.json', 'shared', 'buttons')).toEqual({ confirm: meta.ok });
    // Source folder had only this entry, so both files are removed
    expect(existsSync(join(root, 'common', 'resource_entries.json'))).toBe(false);
  });

  it('executeMove with a pattern keeps statuses', async () => {
    writeFolder('common', 'buttons');

    await executeMove(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { source: 'common.*', destination: 'shared' },
    );

    expect(read('tracker_meta.json', 'shared', 'buttons').ok.fr.status).toBe('verified');
    expect(read('tracker_meta.json', 'shared', 'buttons').ok.es.status).toBe('stale');
  });

  it('executeMove across collections keeps statuses', async () => {
    writeFolder('common');
    const otherCollection = join(root, 'other');

    await executeMove(
      {
        ...{
          ...collection(),
          sourceConfig: {
            exportFolder: 'dist',
            importFolder: 'import',
            baseLocale: 'en',
            locales: ['en', 'fr', 'es'],
            collections: { other: { translationsFolder: otherCollection } },
          },
        },
        onMutation:
          onMutation ??
          {
            ...collection(),
            sourceConfig: {
              exportFolder: 'dist',
              importFolder: 'import',
              baseLocale: 'en',
              locales: ['en', 'fr', 'es'],
              collections: { other: { translationsFolder: otherCollection } },
            },
          }.onMutation,
      },
      { source: 'common.ok', destination: 'common.ok', toCollection: 'other' },
    );

    expect(read('tracker_meta.json', 'other', 'common')).toEqual(meta);
  });

  it('refuses a missing destination before a single resource move writes', async () => {
    writeFolder('common');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { main: { translationsFolder: root } },
    };
    expect(() =>
      executeMove(
        {
          ...{ ...collection(), sourceConfig: config },
          onMutation: onMutation ?? { ...collection(), sourceConfig: config }.onMutation,
        },
        { source: 'common.ok', destination: 'shared.ok', toCollection: 'missing' },
      ),
    ).toThrow(CollectionNotFoundError);
    expect(collected).toEqual([]);
    expect(read('resource_entries.json', 'common')).toEqual(entries);
  });

  it('refuses a read-only destination before a single resource move writes', async () => {
    writeFolder('common');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { vendor: { translationsFolder: 'vendor', readOnly: true } },
    };
    expect(() =>
      executeMove(
        {
          ...{ ...collection(), sourceConfig: config, projectRoot: root },
          onMutation: onMutation ?? { ...collection(), sourceConfig: config, projectRoot: root }.onMutation,
        },
        { source: 'common.ok', destination: 'shared.ok', toCollection: 'vendor' },
      ),
    ).toThrow(ReadOnlyCollectionError);
    expect(collected).toEqual([]);
    expect(read('resource_entries.json', 'common')).toEqual(entries);
  });

  it('resolves a relative destination using the supplied cwd', async () => {
    writeFolder('common');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { other: { translationsFolder: 'other' } },
    };
    const result = await executeMove(
      {
        ...{ ...collection(), sourceConfig: config, projectRoot: root },
        onMutation: onMutation ?? { ...collection(), sourceConfig: config, projectRoot: root }.onMutation,
      },
      { source: 'common.ok', destination: 'shared.ok', toCollection: 'other' },
    );
    expect(result.movedCount).toBe(1);
    expect(read('resource_entries.json', 'other', 'shared')).toEqual(entries);
    expect(collected.map(({ translationsFolder }) => translationsFolder)).toEqual([root, join(root, 'other'), root]);
  });

  it('executeMove with a folder keeps statuses', async () => {
    writeFolder('apps', 'buttons');

    const result = await executeMove(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { kind: 'folder', source: 'apps.buttons', destination: 'shared' },
    );

    expect(result.errors).toEqual([]);
    expect(result.outcome).toBe('succeeded');
    expect(read('resource_entries.json', 'shared', 'buttons')).toEqual(entries);
    expect(read('tracker_meta.json', 'shared', 'buttons')).toEqual(meta);
    expect(existsSync(join(root, 'apps', 'buttons'))).toBe(false);
  });

  it('does not overwrite an existing destination without override', async () => {
    writeFolder('common');
    writeFolder('shared');

    const result = await executeMove(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { source: 'common.ok', destination: 'shared.ok' },
    );

    expect(result.movedCount).toBe(0);
    expect(result.warnings[0]).toContain('Destination key already exists');
    expect(existsSync(join(root, 'common', 'resource_entries.json'))).toBe(true);
  });

  it('moves a pattern to the collection root with an empty destination', async () => {
    writeFolder('common', 'buttons');

    const result = await executeMove(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { source: 'common.*', destination: '' },
    );

    expect(result.errors).toEqual([]);
    expect(result.outcome).toBe('succeeded');
    expect(result.movedCount).toBe(1);
    expect(read('resource_entries.json', 'buttons')).toEqual(entries);
    expect(read('tracker_meta.json', 'buttons')).toEqual(meta);
  });

  it('reports a missing destination and still runs later moves', async () => {
    writeFolder('common');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { main: { translationsFolder: root } },
    };

    const result = await executeMoves(
      {
        ...{ ...collection(), sourceConfig: config },
        onMutation: onMutation ?? { ...collection(), sourceConfig: config }.onMutation,
      },
      [
        { source: 'common.ok', destination: 'ignored.ok', toCollection: 'missing' },
        { source: 'common.ok', destination: 'shared.ok' },
      ],
    );

    expect(result.errors).toEqual(['Destination collection "missing" not found']);
    expect(result.outcome).toBe('failed');
    expect(result.movedCount).toBe(1);
    expect(read('resource_entries.json', 'shared')).toEqual(entries);
    expect(collected.map(({ kind }) => kind)).toEqual(['remove', 'upsert', 'remove-folder']);
  });

  it('rejects a malformed batch pattern before any write or mutation', async () => {
    writeFolder('common');
    writeFolder('later');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { main: { translationsFolder: root } },
    };
    const before = readFileSync(join(root, 'common', 'resource_entries.json'), 'utf8');
    const metadataBefore = readFileSync(join(root, 'common', 'tracker_meta.json'), 'utf8');
    expect(() =>
      executeMoves(
        {
          ...{ ...collection(), sourceConfig: config },
          onMutation: onMutation ?? { ...collection(), sourceConfig: config }.onMutation,
        },
        [
          { source: 'common.ok', destination: 'shared.ok' },
          { source: 'invalid@char*', destination: 'dest' },
          { source: 'later.ok', destination: 'never.ok' },
        ],
      ),
    ).toThrow(InvalidResourceKeyError);
    expect(readFileSync(join(root, 'common', 'resource_entries.json'), 'utf8')).toBe(before);
    expect(readFileSync(join(root, 'common', 'tracker_meta.json'), 'utf8')).toBe(metadataBefore);
    expect(existsSync(join(root, 'shared'))).toBe(false);
    expect(read('resource_entries.json', 'later')).toEqual(entries);
    expect(existsSync(join(root, 'never'))).toBe(false);
    expect(collected).toEqual([]);
  });

  it('rejects malformed source keys and destinations anywhere in a batch before writing', async () => {
    writeFolder('common');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { main: { translationsFolder: root } },
    };
    for (const malformed of [
      { source: 'invalid@key', destination: 'dest.ok' },
      { source: 'common.ok', destination: 'invalid@dest' },
      { source: 'common.*', destination: 'invalid@prefix' },
      { source: 'common.ok', destination: '' },
    ]) {
      expect(() =>
        executeMoves(
          {
            ...{ ...collection(), sourceConfig: config },
            onMutation: onMutation ?? { ...collection(), sourceConfig: config }.onMutation,
          },
          [{ source: 'common.ok', destination: 'shared.ok' }, { ...malformed }],
        ),
      ).toThrow(InvalidResourceKeyError);
      expect(read('resource_entries.json', 'common')).toEqual(entries);
      expect(read('tracker_meta.json', 'common')).toEqual(meta);
      expect(existsSync(join(root, 'shared'))).toBe(false);
      expect(collected).toEqual([]);
    }
  });

  it('keeps runtime skips in the report and permits a root destination for patterns', async () => {
    writeFolder('common');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { main: { translationsFolder: root } },
    };
    const result = await executeMoves(
      {
        ...{ ...collection(), sourceConfig: config },
        onMutation: onMutation ?? { ...collection(), sourceConfig: config }.onMutation,
      },
      [
        { source: 'missing.key', destination: 'dest.key' },
        { source: 'absent.*', destination: '' },
        { source: 'common.*', destination: '' },
      ],
    );
    expect(result).toMatchObject({ movedCount: 1, outcome: 'failed' });
    expect(result.errors).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(read('resource_entries.json')).toEqual(entries);
    expect(collected.map(({ kind }) => kind)).toEqual(['remove', 'upsert', 'remove-folder']);
  });

  it('keeps the first move delivered when the second move write fails', async () => {
    writeFolder('common');
    writeFolder('second');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: { main: { translationsFolder: root } },
    };
    const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
      '../file-io/json-file-operations',
    );
    const writer = vi.mocked(writeJsonFile);
    writer.mockImplementation((options) => {
      if (options.filePath.endsWith(join('blocked', 'resource_entries.json'))) throw new Error('blocked write');
      return actual.writeJsonFile(options);
    });
    let result: Awaited<ReturnType<typeof executeMoves>>;
    try {
      result = await executeMoves(
        {
          ...{ ...collection(), sourceConfig: config },
          onMutation: onMutation ?? { ...collection(), sourceConfig: config }.onMutation,
        },
        [
          { source: 'common.ok', destination: 'shared.ok' },
          { source: 'second.ok', destination: 'blocked.ok' },
        ],
      );
    } finally {
      writer.mockImplementation(actual.writeJsonFile);
    }
    expect(result.errors).toEqual([expect.stringContaining('Failed to write the move')]);
    expect(result.outcome).toBe('failed');
    expect(collected).toEqual([
      { kind: 'remove', translationsFolder: root, key: 'common.ok' },
      expect.objectContaining({ kind: 'upsert', translationsFolder: root, key: 'shared.ok' }),
      { kind: 'reindex', translationsFolder: root },
      { kind: 'remove-folder', translationsFolder: root, path: 'common' },
    ]);
  });

  it('preserves the read-only destination error text', async () => {
    writeFolder('common');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: {
        main: { translationsFolder: root },
        vendor: { translationsFolder: join(root, 'vendor'), readOnly: true },
      },
    };

    const result = await executeMoves(
      {
        ...{ ...collection(), sourceConfig: config },
        onMutation: onMutation ?? { ...collection(), sourceConfig: config }.onMutation,
      },
      [{ source: 'common.ok', destination: 'shared.ok', toCollection: 'vendor' }],
    );

    expect(result.errors).toEqual(['Collection "vendor" is read-only. Its resources cannot be modified.']);
    expect(result.outcome).toBe('failed');
    expect(result.movedCount).toBe(0);
    expect(existsSync(join(root, 'common', 'resource_entries.json'))).toBe(true);
    expect(collected).toEqual([]);
  });

  it('continues a batch after a read-only destination and resolves a later destination with cwd', async () => {
    writeFolder('common');
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en', 'fr', 'es'],
      collections: {
        vendor: { translationsFolder: 'vendor', readOnly: true },
        other: { translationsFolder: 'other' },
      },
    };
    const result = await executeMoves(
      {
        ...{ ...collection(), sourceConfig: config, projectRoot: root },
        onMutation: onMutation ?? { ...collection(), sourceConfig: config, projectRoot: root }.onMutation,
      },
      [
        { source: 'common.ok', destination: 'ignored.ok', toCollection: 'vendor' },
        { source: 'common.ok', destination: 'shared.ok', toCollection: 'other' },
      ],
    );
    expect(result).toEqual({
      outcome: 'failed',
      movedCount: 1,
      warnings: [],
      errors: ['Collection "vendor" is read-only. Its resources cannot be modified.'],
    });
    expect(read('resource_entries.json', 'other', 'shared')).toEqual(entries);
    expect(collected.map(({ translationsFolder }) => translationsFolder)).toEqual([root, join(root, 'other'), root]);
  });
});
