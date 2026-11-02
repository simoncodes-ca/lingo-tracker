import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OpenedCollection } from '../config/open-collection';
import { FolderNotFoundError } from '../errors/lingo-tracker-error';
import { createFolder } from '../folder/create-folder';
import { deleteFolder } from '../folder/delete-folder';
import { deleteResource } from './delete-resource';
import { executeMove } from './execute-move';
import { addResource, editResource } from './resource-entry';
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

/** Core writes report what they changed, so an in-memory index can follow without re-reading disk. */
describe('mutations delivered by core writes (real fs)', () => {
  let root: string;

  const collection = (translationsFolder = root, name = 'main'): OpenedCollection => ({
    runtime: 'transloco-messageformat',
    onMutation: () => undefined,
    name,
    translationsFolder,
    baseLocale: 'en',
    locales: ['en', 'fr'],
    targetLocales: ['fr'],
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

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'resource-mutation-'));
    await addResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { key: 'common.ok', baseValue: 'OK' },
      {},
    );
    await addResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { key: 'common.cancel', baseValue: 'Cancel' },
      {},
    );
    collected.length = 0;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('addResource delivers the stored entry, as the tree loader would read it', async () => {
    await addResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      {
        key: 'apps.greeting',
        baseValue: 'Hello {{ name }}',
        comment: 'Shown on login',
        tags: ['ui'],
        translations: [{ locale: 'fr', value: 'Bonjour {{ name }}', status: 'translated' }],
      },
      {},
    );

    expect(collected).toEqual([
      {
        kind: 'upsert',
        translationsFolder: root,
        key: 'apps.greeting',
        entry: openUnreportedResourceFolder(join(root, 'apps'), {
          runtime: 'transloco-messageformat',
          baseLocale: 'en',
        }).treeEntry('greeting'),
      },
    ]);
    // The entry holds the stored (ICU) form, not the Transloco input.
    expect(collected[0]).toMatchObject({
      entry: { source: 'Hello {name}', translations: { fr: 'Bonjour {name}' } },
    });
  });

  it('addResource on an existing key returns one upsert with the replaced entry', async () => {
    const result = await addResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { key: 'common.ok', baseValue: 'Okay' },
      { onExisting: 'replace' },
    );

    expect(result.created).toBe(false);
    expect(collected).toEqual([
      {
        kind: 'upsert',
        translationsFolder: root,
        key: 'common.ok',
        entry: openUnreportedResourceFolder(join(root, 'common'), {
          runtime: 'transloco-messageformat',
          baseLocale: 'en',
        }).treeEntry('ok'),
      },
    ]);
    expect(collected[0]).toMatchObject({ entry: { source: 'Okay' } });
  });

  it('editResource delivers the updated entry, and nothing when nothing changed', async () => {
    await editResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      'common.ok',
      { baseValue: 'Okay' },
      {},
    );
    expect(collected).toEqual([
      {
        kind: 'upsert',
        translationsFolder: root,
        key: 'common.ok',
        entry: expect.objectContaining({ source: 'Okay' }),
      },
      expect.objectContaining({ kind: 'upsert', key: 'common.ok' }),
    ]);

    const unchanged = await editResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      'common.ok',
      { baseValue: 'Okay' },
      {},
    );
    expect(unchanged.updated).toBe(false);
    expect(collected).toHaveLength(2);
  });

  it('editResource with moveTo delivers a removal and an upsert keyed by their fully resolved keys', async () => {
    await editResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      'common.ok',
      { moveTo: 'shared', baseValue: 'Okay' },
      {},
    );

    expect(collected).toEqual([
      {
        kind: 'upsert',
        translationsFolder: root,
        key: 'common.ok',
        entry: expect.objectContaining({ source: 'Okay' }),
      },
      expect.objectContaining({ kind: 'upsert', key: 'common.ok' }),
      { kind: 'remove', translationsFolder: root, key: 'common.ok' },
      {
        kind: 'upsert',
        translationsFolder: root,
        key: 'shared.ok',
        entry: expect.objectContaining({ source: 'Okay' }),
      },
    ]);
  });

  it('deleteResource delivers a remove for each deleted key only', () => {
    deleteResource(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { keys: ['common.ok', 'common.missing'] },
    );

    expect(collected).toEqual([{ kind: 'remove', translationsFolder: root, key: 'common.ok' }]);
  });

  it('moveResource by pattern delivers a remove and an upsert per moved key, removes first', async () => {
    await executeMove(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { source: 'common.*', destination: 'shared' },
    );

    const kinds = collected.map((mutation) => mutation.kind);
    expect(kinds).toEqual(['remove', 'remove', 'upsert', 'upsert', 'remove-folder']);
    expect(collected.map((mutation) => [mutation.kind, 'key' in mutation ? mutation.key : ''])).toEqual(
      expect.arrayContaining([
        ['upsert', 'shared.ok'],
        ['remove', 'common.ok'],
        ['upsert', 'shared.cancel'],
        ['remove', 'common.cancel'],
      ]),
    );
  });

  it('moveResource to another translations folder puts the upsert there', async () => {
    const other = mkdtempSync(join(tmpdir(), 'resource-mutation-other-'));
    try {
      await executeMove(
        {
          ...{
            ...collection(),
            sourceConfig: {
              exportFolder: 'dist',
              importFolder: 'import',
              baseLocale: 'en',
              locales: ['en', 'fr'],
              collections: { other: { translationsFolder: other } },
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
                locales: ['en', 'fr'],
                collections: { other: { translationsFolder: other } },
              },
            }.onMutation,
        },
        { source: 'common.ok', destination: 'imported.ok', toCollection: 'other' },
      );

      expect(collected).toEqual([
        { kind: 'remove', translationsFolder: root, key: 'common.ok' },
        {
          kind: 'upsert',
          translationsFolder: other,
          key: 'imported.ok',
          entry: expect.objectContaining({ key: 'ok' }),
        },
      ]);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('moveFolder delivers the per-key moves, then the removal of the source folder', async () => {
    await executeMove(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { kind: 'folder', source: 'common', destination: 'apps' },
    );

    expect(collected).toHaveLength(5);
    expect(collected[collected.length - 1]).toEqual({
      kind: 'remove-folder',
      translationsFolder: root,
      path: 'common',
    });
    expect(collected.filter((mutation) => mutation.kind === 'upsert').map((mutation) => mutation.key)).toEqual(
      expect.arrayContaining(['apps.common.ok', 'apps.common.cancel']),
    );
  });

  it('createFolder and deleteFolder deliver the folder change', () => {
    createFolder(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { folderName: 'empty', parentPath: 'apps' },
    );
    expect(collected).toEqual([{ kind: 'add-folder', translationsFolder: root, path: 'apps.empty' }]);
    collected.length = 0;
    deleteFolder({ ...collection(), onMutation: onMutation ?? collection().onMutation }, { folderPath: 'apps.empty' });
    expect(collected).toEqual([{ kind: 'remove-folder', translationsFolder: root, path: 'apps.empty' }]);
    expect(() =>
      deleteFolder(
        { ...collection(), onMutation: onMutation ?? collection().onMutation },
        { folderPath: 'apps.empty' },
      ),
    ).toThrow(FolderNotFoundError);
  });

  it('createFolder on an existing folder returns created: false and no mutations', () => {
    const result = createFolder(
      { ...collection(), onMutation: onMutation ?? collection().onMutation },
      { folderName: 'common' },
    );

    expect(result.created).toBe(false);
    expect(collected).toEqual([]);
  });
});
