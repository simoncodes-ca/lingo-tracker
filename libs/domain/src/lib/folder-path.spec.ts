import { describe, expect, it } from 'vitest';
import {
  collectAncestorPaths,
  folderPathFromSegments,
  folderPathLeaf,
  folderPathSegments,
  isDescendantFolderPath,
  isFolderPathUnder,
  joinFolderPath,
  parentFolderPath,
  rebaseFolderPath,
} from './folder-path';
import { resolveResourceKey, splitResolvedKey } from './resource-key';

describe('isDescendantFolderPath', () => {
  it('includes immediate and deeply nested descendants', () => {
    expect(isDescendantFolderPath('apps.buttons', 'apps.buttons.child')).toBe(true);
    expect(isDescendantFolderPath('apps', 'apps.buttons.child')).toBe(true);
  });

  it('excludes the source itself and its ancestors', () => {
    expect(isDescendantFolderPath('apps.buttons', 'apps.buttons')).toBe(false);
    expect(isDescendantFolderPath('apps.buttons', 'apps')).toBe(false);
    expect(isDescendantFolderPath('apps.buttons', '')).toBe(false);
  });

  it('requires a segment boundary and excludes unrelated paths', () => {
    expect(isDescendantFolderPath('apps', 'appsExtra.buttons')).toBe(false);
    expect(isDescendantFolderPath('apps.buttons', 'apps.buttonsExtra.child')).toBe(false);
    expect(isDescendantFolderPath('apps.buttons', 'shared.buttons.child')).toBe(false);
  });

  it('treats every non-root folder as a descendant of the root', () => {
    expect(isDescendantFolderPath('', 'apps')).toBe(true);
    expect(isDescendantFolderPath('', 'apps.buttons')).toBe(true);
    expect(isDescendantFolderPath('', '')).toBe(false);
  });
});

// These four pure parent/ancestor cases moved from Tracker navigation.
describe('shared folder navigation cases from Tracker', () => {
  it('finds the parent path, including the root boundary', () => {
    expect(parentFolderPath('common.buttons.ok')).toBe('common.buttons');
    expect(parentFolderPath('common')).toBeNull();
  });

  it('returns strict ancestors outermost first', () => {
    expect(collectAncestorPaths('apps.common.buttons')).toEqual(['apps', 'apps.common']);
  });

  it('excludes the path itself, so revealing a folder does not open it', () => {
    expect(collectAncestorPaths('apps')).toEqual([]);
  });

  it('returns nothing for the root path', () => {
    expect(collectAncestorPaths('')).toEqual([]);
  });
});

describe('Folder Address tables', () => {
  it.each<[string, string[], string | null, string, string[]]>([
    ['', [], null, '', []],
    ['apps', ['apps'], null, 'apps', []],
    ['apps.common.buttons', ['apps', 'common', 'buttons'], 'apps.common', 'buttons', ['apps', 'apps.common']],
    ['apps.', ['apps', ''], 'apps', '', ['apps']],
    ['apps..buttons', ['apps', '', 'buttons'], 'apps.', 'buttons', ['apps', 'apps.']],
    ['.apps', ['', 'apps'], '', 'apps', []],
    ['.', ['', ''], '', '', []],
    ['   ', ['   '], null, '   ', []],
  ])('segments, parent, leaf and ancestors for %j', (path, segments, parent, leaf, ancestors) => {
    expect(folderPathSegments(path)).toEqual(segments);
    expect(folderPathFromSegments(segments)).toBe(path);
    expect(parentFolderPath(path)).toBe(parent);
    expect(folderPathLeaf(path)).toBe(leaf);
    expect(collectAncestorPaths(path)).toEqual(ancestors);
  });

  it.each<[string, string, boolean, boolean]>([
    ['', '', false, true],
    ['', 'apps', true, true],
    ['', 'apps.common.buttons', true, true],
    ['apps', '', false, false],
    ['apps', 'apps', false, true],
    ['apps', 'apps.common', true, true],
    ['apps', 'apps.common.buttons', true, true],
    ['app', 'apps.x', false, false],
    ['apps.common', 'apps.commons.buttons', false, false],
    ['apps.common', 'shared.buttons', false, false],
    ['apps', 'apps.', true, true],
    ['apps.', 'apps..buttons', true, true],
  ])('descendant and inclusive membership of %j under %j', (source, path, descendant, under) => {
    expect(isDescendantFolderPath(source, path)).toBe(descendant);
    expect(isFolderPathUnder(source, path)).toBe(under);
  });

  it.each<[string, string, string]>([
    ['', '', ''],
    ['', 'ok', 'ok'],
    ['', 'buttons.ok', 'buttons.ok'],
    ['apps', 'ok', 'apps.ok'],
    ['apps.common.buttons', 'ok', 'apps.common.buttons.ok'],
    ['apps', 'apps.ok', 'apps.apps.ok'],
    ['apps', '', 'apps.'],
    ['apps.', 'ok', 'apps..ok'],
    ['   ', 'ok', '   .ok'],
  ])('joins %j and %j', (folder, key, expected) => {
    expect(joinFolderPath(folder, key)).toBe(expected);
    // Resource key resolution retains its established whitespace-only target convention.
    expect(resolveResourceKey(key, folder)).toBe(folder.trim() === '' ? key : expected);
  });

  it.each<[string, string, string, string]>([
    ['', '', '', ''],
    ['apps', 'apps', 'shared', 'shared'],
    ['apps.common.buttons', 'apps', 'shared', 'shared.common.buttons'],
    ['apps.common.buttons', 'apps.common', '', 'buttons'],
    ['apps.common', 'apps.common', '', ''],
    ['apps.common', '', 'shared', 'shared.apps.common'],
    ['', '', 'shared', 'shared'],
    ['apps', '', '', 'apps'],
    ['apps.x', 'app', 'shared', 'apps.x'],
    ['apps', 'apps.common', 'shared', 'apps'],
    ['shared.buttons', 'apps', 'errors', 'shared.buttons'],
    ['apps..buttons', 'apps', 'shared', 'shared..buttons'],
    ['apps.', 'apps', '', ''],
  ])('rebases %j from %j to %j', (path, source, destination, expected) => {
    expect(rebaseFolderPath(path, source, destination)).toBe(expected);
  });

  it.each<[string, string[], string[], string]>([
    ['', [], [], ''],
    ['ok', ['ok'], [], 'ok'],
    ['apps.common.ok', ['apps', 'common', 'ok'], ['apps', 'common'], 'ok'],
    ['apps..ok', ['apps', '', 'ok'], ['apps', ''], 'ok'],
    ['apps.', ['apps', ''], ['apps'], ''],
  ])('splits a resolved key %j with the same segment rule', (key, segments, folderPath, entryKey) => {
    expect(splitResolvedKey(key)).toEqual({ segments, folderPath, entryKey });
  });
});
