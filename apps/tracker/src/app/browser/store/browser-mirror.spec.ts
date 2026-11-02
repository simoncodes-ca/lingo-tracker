import type { FolderNodeDto, ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { describe, expect, it } from 'vitest';
import {
  type MirrorListState,
  type MirrorPlan,
  type MirrorTreeState,
  planBrowserWrite,
  planMirrorRollback,
  planOptimisticMove,
} from './browser-mirror';

const row = (fullKey: string, value = fullKey): ResourceSummaryDto => ({
  fullKey,
  folderPath: 'a',
  entryKey: fullKey.split('.').pop() ?? '',
  base: { locale: 'en', value },
  targets: [],
  tags: [],
  inheritedTags: [],
});
const node = (fullPath: string): FolderNodeDto => ({
  fullPath,
  name: fullPath.split('.').pop() ?? '',
  loaded: false,
});
const list = (): MirrorListState => ({
  translations: [row('a.one'), row('a.two')],
  searchResults: [
    { ...row('a.one'), matchType: 'partial-value' },
    { ...row('b.one'), matchType: 'exact-key' },
  ],
  loadedFolderPath: 'a',
});
const tree = (): MirrorTreeState => ({
  rootFolders: [node('a'), node('ab')],
  expandedFolders: new Set(['a', 'a.child', 'ab']),
  currentFolderPath: 'a.child',
});
const nextList = (state: MirrorListState, plan: MirrorPlan): MirrorListState => ({ ...state, ...plan.list });
const nextTree = (state: MirrorTreeState, plan: MirrorPlan): MirrorTreeState => ({ ...state, ...plan.tree });

describe('Browser Mirror', () => {
  it('entry-created reloads the list without editing caches', () => {
    expect(planBrowserWrite(list(), tree(), { kind: 'entry-created' })).toEqual({
      list: {},
      tree: {},
      effects: [{ kind: 'reload-list' }],
    });
  });

  it('entry-replaced patches both caches by full key and preserves search metadata', () => {
    const state = list();
    const replacement = row('a.one', 'new');
    const plan = planBrowserWrite(state, tree(), { kind: 'entry-replaced', key: 'a.one', resource: replacement });
    expect(plan.list.translations).toEqual([replacement, state.translations[1]]);
    expect(plan.list.searchResults).toEqual([{ ...replacement, matchType: 'partial-value' }, state.searchResults[1]]);
    expect(plan.tree).toEqual({});
    expect(plan.effects).toEqual([]);
    expect(state.translations[0]?.base.value).toBe('a.one');
  });

  it('entry replacement outside the folder keeps its rows by reference', () => {
    const state = list();
    const plan = planBrowserWrite(state, tree(), {
      kind: 'entry-replaced',
      key: 'b.one',
      resource: row('b.one', 'new'),
    });
    expect(plan.list.translations).toBe(state.translations);
    expect(plan.list.searchResults?.[1]?.base.value).toBe('new');
  });

  it('an uncached replacement preserves both arrays', () => {
    const state = list();
    const plan = planBrowserWrite(state, tree(), { kind: 'entry-replaced', key: 'missing', resource: row('missing') });
    expect(plan.list.translations).toBe(state.translations);
    expect(plan.list.searchResults).toBe(state.searchResults);
  });

  it('entry-removed drops the matching entry from both caches', () => {
    const plan = planBrowserWrite(list(), tree(), { kind: 'entry-removed', key: 'a.one' });
    expect(plan.list.translations?.map((item) => item.fullKey)).toEqual(['a.two']);
    expect(plan.list.searchResults?.map((item) => item.fullKey)).toEqual(['b.one']);
    expect(plan.tree).toEqual({});
    expect(plan.effects).toEqual([]);
  });

  it('entry-removed drops both caches without reloading for an editor move', () => {
    const plan = planBrowserWrite(list(), tree(), { kind: 'entry-removed', key: 'a.one' });
    expect(plan.list.translations?.map((item) => item.fullKey)).toEqual(['a.two']);
    expect(plan.list.searchResults?.map((item) => item.fullKey)).toEqual(['b.one']);
    expect(plan.effects).toEqual([]);
  });

  it('entry-moved reloads root folders before the list after a drag', () => {
    expect(planBrowserWrite(list(), tree(), { kind: 'entry-moved' })).toEqual({
      list: {},
      tree: {},
      effects: [{ kind: 'load-root' }, { kind: 'reload-list' }],
    });
  });

  it('folder-created inserts the response folder under its parent', () => {
    const state = tree();
    const parent: FolderNodeDto = { ...node('a'), loaded: true, tree: { path: 'a', resources: [], children: [] } };
    state.rootFolders = [parent];
    const plan = planBrowserWrite(list(), state, { kind: 'folder-created', folder: node('a.new'), parentPath: 'a' });
    expect(plan.tree.rootFolders?.[0]?.tree?.children).toEqual([node('a.new')]);
    expect(parent.tree?.children).toEqual([]);
    expect(plan.effects).toEqual([]);
    expect(plan.list).toEqual({});
  });

  it('folder-removed prunes tree and expansion then shows the parent of a deleted selection', () => {
    const plan = planBrowserWrite(list(), tree(), { kind: 'folder-removed', path: 'a' });
    expect(plan.tree.rootFolders).toEqual([node('ab')]);
    expect(plan.tree.expandedFolders).toEqual(new Set(['ab']));
    expect(plan.effects).toEqual([{ kind: 'show-folder', path: '' }]);
    expect(plan.list).toEqual({});
  });

  it('folder removal leaves a selection outside the deleted subtree in place', () => {
    const plan = planBrowserWrite(
      list(),
      { ...tree(), currentFolderPath: 'ab' },
      { kind: 'folder-removed', path: 'a' },
    );
    expect(plan.effects).toEqual([]);
  });

  it('folder-moved rebases the node, loads an unloaded destination, then expands and navigates', () => {
    const state = tree();
    const optimistic = planOptimisticMove(list(), state, { kind: 'folder', path: 'a' });
    const plan = planBrowserWrite(list(), nextTree(state, optimistic.plan), {
      kind: 'folder-moved',
      rollback: optimistic.rollback,
      destinationPath: 'ab',
    });
    expect(plan.tree.rootFolders?.[0]?.tree?.children).toEqual([node('ab.a')]);
    expect(plan.effects).toEqual([
      { kind: 'load-children', path: 'ab' },
      { kind: 'set-expansion', expanded: new Set(['ab.a', 'ab.a.child', 'ab']) },
      { kind: 'show-folder', path: 'ab.a' },
    ]);
    expect(state.rootFolders).toEqual([node('a'), node('ab')]);
  });

  it('folder moves with no captured node reload root before expansion and navigation', () => {
    const plan = planBrowserWrite(list(), tree(), {
      kind: 'folder-moved',
      rollback: { kind: 'folder', path: 'missing', node: undefined },
      destinationPath: '',
    });
    expect(plan.tree).toEqual({});
    expect(plan.effects.map((effect) => effect.kind)).toEqual(['load-root', 'set-expansion', 'show-folder']);
    expect(plan.effects[2]).toEqual({ kind: 'show-folder', path: 'missing' });
  });

  it('a folder move to root patches the tree without loading children', () => {
    const plan = planBrowserWrite(list(), tree(), {
      kind: 'folder-moved',
      rollback: { kind: 'folder', path: 'a', node: node('a') },
      destinationPath: '',
    });
    expect(plan.tree.rootFolders?.map((folder) => folder.fullPath)).toEqual(['a', 'ab']);
    expect(plan.effects.map((effect) => effect.kind)).toEqual(['set-expansion', 'show-folder']);
  });

  it('row moves remove only folder rows and rollback appends the captured row once', () => {
    const state = list();
    const optimistic = planOptimisticMove(state, tree(), { kind: 'row', key: 'a.one' });
    const moved = nextList(state, optimistic.plan);
    expect(moved.translations.map((item) => item.fullKey)).toEqual(['a.two']);
    expect(moved.searchResults).toBe(state.searchResults);
    expect(optimistic.plan.tree).toEqual({});
    const restored = nextList(moved, planMirrorRollback(moved, tree(), optimistic.rollback));
    expect(restored.translations.map((item) => item.fullKey)).toEqual(['a.two', 'a.one']);
    expect(planMirrorRollback(restored, tree(), optimistic.rollback).list).toEqual({});
  });

  it('row rollback leaves a newer folder load alone', () => {
    const optimistic = planOptimisticMove(list(), tree(), { kind: 'row', key: 'a.one' });
    const newer = { ...list(), loadedFolderPath: 'b', translations: [row('b.new')] };
    expect(planMirrorRollback(newer, tree(), optimistic.rollback).list).toEqual({});
  });

  it('row rollback cannot overwrite a newer version of the same row', () => {
    const optimistic = planOptimisticMove(list(), tree(), { kind: 'row', key: 'a.one' });
    const newer = { ...list(), translations: [row('a.one', 'newer')] };
    expect(planMirrorRollback(newer, tree(), optimistic.rollback).list).toEqual({});
  });

  it('row rollback ignores an uncached move', () => {
    const optimistic = planOptimisticMove(list(), tree(), { kind: 'row', key: 'missing' });
    expect(planMirrorRollback(list(), tree(), optimistic.rollback).list).toEqual({});
  });

  it('folder rollback restores only the detached node and retains concurrent additions', () => {
    const state = tree();
    const optimistic = planOptimisticMove(list(), state, { kind: 'folder', path: 'a' });
    expect(optimistic.plan.tree.rootFolders).toEqual([node('ab')]);
    expect(optimistic.plan.tree.expandedFolders).toBeUndefined();
    const moved = { ...nextTree(state, optimistic.plan), rootFolders: [node('ab'), node('newer')] };
    const restored = nextTree(moved, planMirrorRollback(list(), moved, optimistic.rollback));
    expect(restored.rootFolders).toEqual([node('a'), node('ab'), node('newer')]);
    expect(planMirrorRollback(list(), restored, optimistic.rollback).tree).toEqual({});
  });

  it('folder rollback cannot restore under an unloaded or missing parent', () => {
    const rollback = { kind: 'folder', path: 'a.child', node: node('a.child') } as const;
    expect(planMirrorRollback(list(), tree(), rollback).tree).toEqual({});
    expect(planMirrorRollback(list(), { ...tree(), rootFolders: [] }, rollback).tree).toEqual({});
  });

  it('folder rollback restores under a loaded parent without reverting its other children', () => {
    const state = {
      ...tree(),
      rootFolders: [{ ...node('a'), loaded: true, tree: { path: 'a', resources: [], children: [node('a.newer')] } }],
    };
    const plan = planMirrorRollback(list(), state, { kind: 'folder', path: 'a.child', node: node('a.child') });
    expect(plan.tree.rootFolders?.[0]?.tree?.children).toEqual([node('a.child'), node('a.newer')]);
  });

  it('folder rollback ignores a move whose node was never cached', () => {
    expect(planMirrorRollback(list(), tree(), { kind: 'folder', path: 'missing', node: undefined }).tree).toEqual({});
  });
});
