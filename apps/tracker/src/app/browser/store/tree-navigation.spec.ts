import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { describe, expect, it } from 'vitest';
import { findFolderInTree } from './folder-tree.utils';
import {
  expandTreePath,
  navigateTree,
  PICKER_NAVIGATION,
  SIDEBAR_NAVIGATION,
  type TreeNavigationState,
} from './tree-navigation';

const nodes: FolderNodeDto[] = [
  {
    name: 'a',
    fullPath: 'a',
    loaded: true,
    tree: { path: 'a', resources: [], children: [{ name: 'b', fullPath: 'a.b', loaded: true }] },
  },
  { name: 'c', fullPath: 'c', loaded: true },
];

interface Case {
  key: string;
  focus: string | null;
  expanded: string[];
  pickerFocus: string | null;
  pickerExpanded: string[];
  sidebarExpanded: string[];
  pickerSelect?: string;
  sidebarSelect?: string;
  sidebarPrevent?: boolean;
}

const cases: Case[] = [
  { key: 'ArrowDown', focus: null, expanded: [], pickerFocus: 'a', pickerExpanded: [], sidebarExpanded: [] },
  { key: 'ArrowDown', focus: 'a', expanded: ['a'], pickerFocus: 'a.b', pickerExpanded: ['a'], sidebarExpanded: ['a'] },
  { key: 'ArrowDown', focus: 'c', expanded: [], pickerFocus: 'c', pickerExpanded: [], sidebarExpanded: [] },
  { key: 'ArrowUp', focus: 'c', expanded: ['a'], pickerFocus: 'a.b', pickerExpanded: ['a'], sidebarExpanded: ['a'] },
  { key: 'ArrowUp', focus: 'a', expanded: [], pickerFocus: 'a', pickerExpanded: [], sidebarExpanded: [] },
  { key: 'ArrowUp', focus: null, expanded: [], pickerFocus: null, pickerExpanded: [], sidebarExpanded: [] },
  {
    key: 'ArrowRight',
    focus: 'a',
    expanded: [],
    pickerFocus: 'a',
    pickerExpanded: ['a'],
    sidebarExpanded: ['a'],
    sidebarPrevent: true,
  },
  { key: 'ArrowRight', focus: 'a', expanded: ['a'], pickerFocus: 'a', pickerExpanded: ['a'], sidebarExpanded: ['a'] },
  { key: 'ArrowRight', focus: 'c', expanded: [], pickerFocus: 'c', pickerExpanded: ['c'], sidebarExpanded: [] },
  { key: 'ArrowRight', focus: null, expanded: [], pickerFocus: null, pickerExpanded: [], sidebarExpanded: [] },
  {
    key: 'ArrowLeft',
    focus: 'a',
    expanded: ['a'],
    pickerFocus: 'a',
    pickerExpanded: [],
    sidebarExpanded: [],
    sidebarPrevent: true,
  },
  { key: 'ArrowLeft', focus: 'a.b', expanded: ['a'], pickerFocus: 'a', pickerExpanded: ['a'], sidebarExpanded: ['a'] },
  { key: 'ArrowLeft', focus: 'a', expanded: [], pickerFocus: 'a', pickerExpanded: [], sidebarExpanded: [] },
  { key: 'ArrowLeft', focus: null, expanded: [], pickerFocus: null, pickerExpanded: [], sidebarExpanded: [] },
  ...['Enter', ' '].flatMap((key): Case[] => [
    {
      key,
      focus: 'a',
      expanded: [],
      pickerFocus: 'a',
      pickerExpanded: [],
      sidebarExpanded: ['a'],
      pickerSelect: 'a',
      sidebarSelect: 'a',
    },
    {
      key,
      focus: 'a',
      expanded: ['a'],
      pickerFocus: 'a',
      pickerExpanded: ['a'],
      sidebarExpanded: ['a'],
      pickerSelect: 'a',
      sidebarSelect: 'a',
    },
    {
      key,
      focus: 'c',
      expanded: [],
      pickerFocus: 'c',
      pickerExpanded: [],
      sidebarExpanded: [],
      pickerSelect: 'c',
      sidebarSelect: 'c',
    },
    { key, focus: null, expanded: [], pickerFocus: null, pickerExpanded: [], sidebarExpanded: [] },
  ]),
  { key: 'Escape', focus: 'a', expanded: [], pickerFocus: 'a', pickerExpanded: [], sidebarExpanded: [] },
];

function treeState(
  folders: readonly FolderNodeDto[],
  expandedPaths: ReadonlySet<string>,
  focus: string | null,
): TreeNavigationState {
  return {
    focusedPath: focus,
    expanded: focus !== null && expandedPaths.has(focus),
    hasChildren: focus !== null && (findFolderInTree(folders, focus)?.tree?.children.length ?? 0) > 0,
    hasRows: folders.length > 0,
    tree: { nodes: folders, expandedPaths },
  };
}

describe('tree navigation', () => {
  for (const mode of ['picker', 'sidebar'] as const) {
    it.each(cases)(`${mode}: $key at $focus with $expanded`, (test) => {
      const expandedPaths = new Set(test.expanded);
      const next = navigateTree(
        treeState(nodes, expandedPaths, test.focus),
        test.key,
        mode === 'picker' ? PICKER_NAVIGATION : SIDEBAR_NAVIGATION,
      );
      const focus = mode === 'picker' ? test.pickerFocus : test.focus;
      const expanded = mode === 'picker' ? test.pickerExpanded : test.sidebarExpanded;
      const selected = (mode === 'picker' ? test.pickerSelect : test.sidebarSelect) ?? null;
      const intent =
        selected !== null
          ? { kind: 'select', path: selected, open: expanded.includes(selected) && !test.expanded.includes(selected) }
          : focus !== test.focus && focus !== null
            ? { kind: 'focus', path: focus }
            : expanded.length > test.expanded.length
              ? { kind: 'expand', path: test.focus }
              : expanded.length < test.expanded.length
                ? { kind: 'collapse', path: test.focus }
                : { kind: 'none' };
      expect(next.intent).toEqual(intent);
      expect(next.preventDefault).toBe(mode === 'picker' ? test.key !== 'Escape' : (test.sidebarPrevent ?? false));
      expect([...expandedPaths]).toEqual(test.expanded);
    });

    it.each(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape'])(
      `${mode}: empty tree %s`,
      (key) => {
        const state = treeState([], new Set<string>(), null);
        expect(navigateTree(state, key, mode === 'picker' ? PICKER_NAVIGATION : SIDEBAR_NAVIGATION)).toEqual({
          intent: { kind: 'none' },
          preventDefault: false,
        });
      },
    );
  }

  it.each([
    ['ArrowRight', false, true, true, null],
    ['ArrowRight', true, true, false, null],
    ['ArrowLeft', true, false, true, null],
    ['ArrowLeft', false, false, false, null],
    ['ArrowUp', true, true, false, null],
    ['ArrowDown', true, true, false, null],
    ['Enter', false, false, false, ''],
    [' ', false, false, false, ''],
  ] as const)('sidebar collection root: %s, open=%s', (key, open, nextOpen, preventDefault, selectedPath) => {
    const next = navigateTree(
      {
        focusedPath: '',
        expanded: open,
        hasChildren: false,
        hasRows: true,
      },
      key,
      SIDEBAR_NAVIGATION,
    );
    expect(next.intent).toEqual(
      selectedPath !== null
        ? { kind: 'select', path: selectedPath, open: false }
        : nextOpen !== open
          ? { kind: nextOpen ? 'expand' : 'collapse', path: '' }
          : { kind: 'none' },
    );
    expect(next.preventDefault).toBe(preventDefault);
  });

  it.each([
    {
      key: 'ArrowRight',
      name: 'picker Right on an unloaded node',
      why: 'picker expansion does not require loaded children',
      options: PICKER_NAVIGATION,
      state: treeState([{ name: 'a', fullPath: 'a', loaded: false }], new Set(), 'a'),
      intent: { kind: 'expand', path: 'a' },
      preventDefault: true,
    },
    {
      key: 'ArrowRight',
      name: 'sidebar Right on an unloaded node',
      why: 'an unloaded node has no children to open',
      options: SIDEBAR_NAVIGATION,
      state: { focusedPath: 'a', expanded: false, hasChildren: false, hasRows: true },
      intent: { kind: 'none' },
      preventDefault: false,
    },
    {
      key: 'ArrowRight',
      name: 'sidebar Right on a loaded top-level leaf',
      why: 'a top-level folder is not the collection root',
      options: SIDEBAR_NAVIGATION,
      state: treeState([{ name: 'a', fullPath: 'a', loaded: true }], new Set(), 'a'),
      intent: { kind: 'none' },
      preventDefault: false,
    },
    {
      key: 'ArrowRight',
      name: 'picker without a root row',
      why: 'empty collection does not synthesize a navigable root',
      options: PICKER_NAVIGATION,
      state: treeState([], new Set(), ''),
      intent: { kind: 'none' },
      preventDefault: false,
    },
    {
      key: 'ArrowDown',
      name: 'picker starts without a collection root row',
      why: 'first Down focuses the first actual folder',
      options: PICKER_NAVIGATION,
      state: treeState(nodes, new Set(), null),
      intent: { kind: 'focus', path: 'a' },
      preventDefault: true,
    },
  ])('$name: $why', ({ state, key, options, intent, preventDefault }) => {
    expect(navigateTree(state, key, options)).toEqual({ intent, preventDefault });
  });

  it('keeps unloaded children out of picker focus order', () => {
    const next = navigateTree(
      treeState([{ ...nodes[0], loaded: false }, nodes[1]], new Set(['a']), 'a'),
      'ArrowDown',
      PICKER_NAVIGATION,
    );
    expect(next.intent).toEqual({ kind: 'focus', path: 'c' });
  });

  it('toggles and explicitly opens or closes without mutating expansion', () => {
    const original = new Set(['a']);
    expect([...expandTreePath(original, 'a')]).toEqual([]);
    expect([...expandTreePath(original, 'c', true)]).toEqual(['a', 'c']);
    expect([...expandTreePath(original, 'a', false)]).toEqual([]);
    expect(expandTreePath(original, 'a', true)).toBe(original);
    expect([...original]).toEqual(['a']);
  });
});
