import { resolve } from 'node:path';
import { folderPathFromSegments, folderPathSegments, splitResolvedKey } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { describeFolderProblem } from './collection-folders';
import { extractSubtree } from './extract-subtree';
import { loadResourceTree } from './load-resource-tree';
import { readCollection } from './read-collection';
import type { ResourceMutation } from './resource-mutation';
import type { ResourceTreeNode } from './resource-tree-types';
import { type SearchPage, type SearchRequest, searchPage, treeResources } from './search';
import { computeTreeFingerprint, type TreeFingerprint, treeFingerprintsMatch } from './tree-fingerprint';

export type ResourceTreeApplyResult =
  | { readonly kind: 'ignored' | 'patched' }
  | { readonly kind: 'reload'; readonly reason: string };

/** One collection's tree and mutation semantics, independent of caching policy and logging. */
export class ResourceTreeIndex {
  #tree: ResourceTreeNode | null;
  #fingerprint: TreeFingerprint | null;

  /** Optional tree and fingerprint snapshots permit tests without disk access. */
  constructor(
    readonly collection: Collection,
    tree: ResourceTreeNode | null = null,
    fingerprint: TreeFingerprint | null = null,
  ) {
    this.#tree = tree;
    this.#fingerprint = fingerprint;
  }

  get loaded(): boolean {
    return this.#tree !== null;
  }

  /** Fingerprint before loading, so a concurrent write forces another load on revalidation. */
  load(onWarning?: (warning: string) => void): void {
    this.refreshFingerprint();
    this.#tree = loadResourceTree({
      translationsFolder: this.collection.translationsFolder,
      baseLocale: this.collection.baseLocale,
      runtime: this.collection.runtime,
      path: '',
      depth: Number.POSITIVE_INFINITY,
      onProblem: (problem) => onWarning?.(describeFolderProblem(problem, { collectionName: this.collection.name })),
    });
  }

  subtree(path = ''): ResourceTreeNode | null {
    return this.#tree ? extractSubtree(this.#tree, path) : null;
  }

  get totalKeys(): number {
    return this.#tree ? countResources(this.#tree) : 0;
  }

  /** Until loaded, searches use the reader without populating the index. */
  searchPage(
    request: SearchRequest,
    onWarning?: (warning: string) => void,
    collection: Collection = this.collection,
  ): SearchPage {
    if (this.#tree) return searchPage(treeResources(this.#tree), collection, request);
    const { resources, warnings } = readCollection(collection);
    for (const warning of warnings) onWarning?.(warning);
    return searchPage(resources, collection, request);
  }

  /** A reload result invalidates this instance; its owner decides when to replace it. */
  apply(mutation: ResourceMutation): ResourceTreeApplyResult {
    if (resolve(mutation.translationsFolder) !== resolve(this.collection.translationsFolder)) {
      return { kind: 'ignored' };
    }
    if (mutation.kind === 'reindex') return this.#reload('a write asked for a re-index');
    if (this.#tree === null) return { kind: 'ignored' };
    try {
      patchTree(this.#tree, mutation);
      return { kind: 'patched' };
    } catch (error) {
      return this.#reload(error instanceof Error ? error.message : String(error));
    }
  }

  #reload(reason: string): ResourceTreeApplyResult {
    this.#tree = null;
    return { kind: 'reload', reason };
  }

  /** The owner schedules this after its own writes; no timer is owned here. */
  refreshFingerprint(collection: Collection = this.collection): void {
    this.#fingerprint = computeTreeFingerprint({
      translationsFolder: collection.translationsFolder,
    });
  }

  /** The optional collection preserves checks against the current read's folder settings. */
  isStale(collection: Collection = this.collection): boolean {
    return (
      treeFingerprintsMatch(
        this.#fingerprint,
        computeTreeFingerprint({ translationsFolder: collection.translationsFolder }),
      ) === false
    );
  }
}

/** Applies one write to an indexed tree. Throws when the tree does not match what the write expects. */
function patchTree(tree: ResourceTreeNode, mutation: Exclude<ResourceMutation, { kind: 'reindex' }>): void {
  switch (mutation.kind) {
    case 'upsert': {
      const { folder, name } = splitKey(mutation.key);
      const resources = folderAt(tree, folder, true).resources;
      const index = resources.findIndex((resource) => resource.key === name);
      if (index >= 0) {
        resources[index] = mutation.entry;
      } else {
        resources.push(mutation.entry);
        resources.sort((a, b) => a.key.localeCompare(b.key));
      }
      return;
    }
    case 'remove': {
      const { folder, name } = splitKey(mutation.key);
      const resources = folderAt(tree, folder, false).resources;
      const index = resources.findIndex((resource) => resource.key === name);
      if (index < 0) throw new Error(`resource "${mutation.key}" is not in the index`);
      resources.splice(index, 1);
      return;
    }
    case 'add-folder':
      folderAt(tree, segmentsOf(mutation.path), true);
      return;
    case 'remove-folder': {
      const { folder, name } = splitKey(mutation.path);
      const children = folderAt(tree, folder, false).children;
      const index = children.findIndex((child) => child.name === name);
      if (index < 0) throw new Error(`folder "${mutation.path}" is not in the index`);
      children.splice(index, 1);
      return;
    }
  }
}

/** Walks to the folder at `segments`. With `create`, missing folders are added (as on disk). */
function folderAt(tree: ResourceTreeNode, segments: readonly string[], create: boolean): ResourceTreeNode {
  let node = tree;

  for (let depth = 0; depth < segments.length; depth++) {
    const name = segments[depth];
    const fullPathSegments = segments.slice(0, depth + 1);
    let child = node.children.find((candidate) => candidate.name === name);

    if (!child && create) {
      child = {
        name,
        fullPathSegments,
        loaded: true,
        tree: {
          folderPathSegments: fullPathSegments,
          resources: [],
          children: [],
        },
      };
      node.children.push(child);
      node.children.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (!child?.tree) throw new Error(`folder "${folderPathFromSegments(fullPathSegments)}" is not in the index`);
    node = child.tree;
  }

  return node;
}

function segmentsOf(path: string): string[] {
  return folderPathSegments(path).filter((segment) => segment.length > 0);
}

/** Splits `a.b.c` into the folder `['a', 'b']` and the name `c`. */
function splitKey(key: string): { folder: string[]; name: string } {
  const { folderPath, entryKey } = splitResolvedKey(folderPathFromSegments(segmentsOf(key)));
  return { folder: folderPath, name: entryKey };
}

function countResources(node: ResourceTreeNode): number {
  return node.children.reduce(
    (total, child) => total + (child.tree ? countResources(child.tree) : 0),
    node.resources.length,
  );
}
