import { mkdirSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import { type CollectionFolderProblem, describeFolderProblem, walkCollectionFolders } from './collection-folders';

describe('describeFolderProblem', () => {
  it.each<{
    kind: CollectionFolderProblem['kind'];
    folderPath: string;
    collectionName?: string;
    expected: string;
  }>([
    { kind: 'unreadable', folderPath: 'apps.common', expected: "Skipped unreadable folder 'apps.common': bad JSON" },
    { kind: 'unreadable', folderPath: '', expected: "Skipped unreadable folder '(root)': bad JSON" },
    { kind: 'not-removed', folderPath: 'apps.empty', expected: "Could not remove folder 'apps.empty': bad JSON" },
    {
      kind: 'unreadable',
      folderPath: 'apps',
      collectionName: 'main',
      expected: "Collection 'main': Skipped unreadable folder 'apps': bad JSON",
    },
    {
      kind: 'unreadable',
      folderPath: '',
      collectionName: 'main',
      expected: "Collection 'main': Skipped unreadable folder '(root)': bad JSON",
    },
    {
      kind: 'not-removed',
      folderPath: 'apps.empty',
      collectionName: 'main',
      expected: "Collection 'main': Could not remove folder 'apps.empty': bad JSON",
    },
  ])('$kind at "$folderPath" (collection: $collectionName)', ({ kind, folderPath, collectionName, expected }) => {
    const problem: CollectionFolderProblem = { kind, folderPath, absolutePath: '/unused', message: 'bad JSON' };
    expect(describeFolderProblem(problem, { collectionName })).toBe(expected);
  });
});

describe('walkCollectionFolders', () => {
  const root = useTempDir('collection-folder-scan-');

  it('keeps folder listings private and reports a child that disappears during the scan', () => {
    const child = join(root(), 'child');
    mkdirSync(child);
    const scan = walkCollectionFolders(root());
    const first = scan.next();
    expect(first.value).toBeDefined();
    if (first.done) throw new Error('Expected the root folder');
    expect(Object.keys(first.value).sort()).toEqual([
      'absolutePath',
      'depth',
      'folderPath',
      'segments',
      'subfolderNames',
    ]);
    rmdirSync(child);
    const problems = [...scan];
    expect(problems).toHaveLength(1);
    expect(problems[0]?.problem).toMatchObject({
      kind: 'unreadable',
      folderPath: 'child',
      absolutePath: child,
      message: expect.stringContaining('ENOENT'),
    });
    expect(problems[0]).not.toHaveProperty('entries');
    expect(problems[0]).not.toHaveProperty('resourceFileNames');
  });
});
