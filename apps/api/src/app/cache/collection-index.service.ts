import { Injectable, Logger } from '@nestjs/common';
import {
  type Collection,
  type MutationSink,
  type ResourceMutation,
  ResourceTreeIndex,
  type ResourceTreeNode,
  type SearchPage,
  type SearchRequest,
} from '@simoncodes-ca/core';
import type { CacheStatusDto } from '@simoncodes-ca/data-transfer';

/**
 * How long a disk fingerprint is trusted before it is computed again, in milliseconds.
 *
 * The scan is stat-only and costs a few milliseconds on a typical collection, but it runs
 * on read paths, so it is throttled rather than run per request.
 */
const DEFAULT_REVALIDATION_INTERVAL_MS = 2000;

/**
 * How many collections may be held in memory at once.
 *
 * Each entry holds a collection's whole tree, so the ceiling is a memory budget: several
 * tabs on different collections each keep their own index instead of evicting each other,
 * but an unbounded map would let a large workspace grow without limit. The least recently
 * used entry is dropped when the cap is reached.
 */
const DEFAULT_MAX_INDEXED_COLLECTIONS = 4;

/**
 * Result of reading a collection's tree.
 * - `ready`: the tree (or the subtree at the requested path; `null` when that path does not exist).
 * - `not-started` / `error`: the collection was not indexed (or the last attempt failed), so
 *   indexing was started by this read. Ask again shortly.
 * - `indexing`: indexing is already running.
 */
export type TreeRead =
  | { readonly status: 'ready'; readonly tree: ResourceTreeNode | null }
  | { readonly status: 'indexing' | 'not-started' | 'error' };

interface IndexEntry {
  /** The collection as it was when indexed. Its folder identifies which mutations apply. */
  readonly collection: Collection;
  status: 'indexing' | 'ready' | 'error';
  readonly index: ResourceTreeIndex;
  indexedAt: Date | null;
  error?: string;
  /**
   * Monotonic use counter, bumped on every read and write of this entry. A counter rather
   * than a clock: several collections can be touched within the same millisecond, and
   * eviction still needs a strict order between them.
   */
  accessSequence: number;
  /** Throttle stamp for the disk fingerprint check. */
  lastRevalidationAt: number;
  /** Deferred fingerprint refresh that covers this entry's own writes. */
  pendingFingerprintRefresh: NodeJS.Timeout | null;
}

/**
 * Collection Index — the API's in-memory copy of each open collection's resource tree.
 *
 * Callers read with `tree()`, `searchPage()` and `status()`, and the route pipe attaches `sink` when opening collections.
 * Everything else is internal: indexing on first read, dropping the copy when
 * the disk changed outside this process, patching the tree after a write (or dropping it
 * when a patch cannot be applied), and the memory cap.
 */
@Injectable()
export class CollectionIndex {
  readonly #logger = new Logger(CollectionIndex.name);
  readonly #entries = new Map<string, IndexEntry>();
  #accessSequence = 0;

  /** The index as a Mutation Sink. It never throws into a write. */
  readonly sink: MutationSink = (mutation) => {
    try {
      this.apply([mutation]);
    } catch (error) {
      this.#logger.error(`Could not apply a mutation: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  readonly #revalidationIntervalMs = Number(
    process.env.LINGO_TRACKER_REVALIDATE_INTERVAL_MS ?? DEFAULT_REVALIDATION_INTERVAL_MS,
  );

  readonly #maxEntries = Math.max(
    1,
    Number(process.env.LINGO_TRACKER_MAX_CACHED_COLLECTIONS ?? DEFAULT_MAX_INDEXED_COLLECTIONS),
  );

  /** Reads the tree (or the subtree at `path`). Starts indexing when the collection is not indexed. */
  tree(collection: Collection, path = ''): TreeRead {
    const entry = this.#read(collection);

    if (!entry || entry.status === 'error') {
      this.#index(collection);
      return { status: entry ? 'error' : 'not-started' };
    }

    if (entry.status === 'indexing' || !entry.index.loaded) {
      return { status: 'indexing' };
    }

    return { status: 'ready', tree: entry.index.subtree(path) };
  }

  /** Searches the index or disk without starting indexing. Logs unreadable disk folders. */
  searchPage(collection: Collection, request: SearchRequest): SearchPage {
    const entry = this.#read(collection);
    const source = entry?.status === 'ready' ? entry.index : new ResourceTreeIndex(collection);
    return source.searchPage(request, (warning) => this.#logger.warn(warning), collection);
  }

  /** Index state for the cache-status endpoint. Starts indexing when the collection is not indexed. */
  status(collection: Collection): CacheStatusDto {
    const entry = this.#read(collection);

    if (!entry) {
      this.#index(collection);
      return { status: 'not-started', collectionName: collection.name };
    }

    const status: CacheStatusDto = {
      status: entry.status,
      collectionName: collection.name,
    };
    if (entry.indexedAt) status.indexedAt = entry.indexedAt.toISOString();
    if (entry.error) status.error = entry.error;
    if (entry.status === 'ready' && entry.index.loaded) {
      status.stats = {
        totalKeys: entry.index.totalKeys,
        localeCount: entry.collection.locales.length,
      };
    }
    return status;
  }

  /**
   * Updates every indexed collection that a write changed. A collection whose tree does not
   * match what a mutation expects (or that got a `reindex`) is dropped, and the next read
   * indexes it again. The route pipe attaches `sink` to the Opened Collection; controllers never call this directly.
   */
  apply(changes: readonly ResourceMutation[]): void {
    const patched = new Set<IndexEntry>();

    for (const mutation of changes) {
      for (const entry of [...this.#entries.values()]) {
        const result = entry.index.apply(mutation);
        if (result.kind === 'reload') {
          this.#drop(entry, result.reason);
        } else if (result.kind === 'patched') {
          entry.accessSequence = ++this.#accessSequence;
          patched.add(entry);
        }
      }
    }

    for (const entry of patched) {
      if (this.#entries.get(entry.collection.name) === entry) this.#scheduleFingerprintRefresh(entry);
    }
  }

  /** Returns the entry for a read, after dropping it when the disk changed outside this process. */
  #read(collection: Collection): IndexEntry | undefined {
    const entry = this.#entries.get(collection.name);
    if (!entry) return undefined;

    entry.accessSequence = ++this.#accessSequence;

    if (entry.status === 'ready' && this.#changedOnDisk(entry, collection)) {
      this.#drop(entry, 'its translations folder changed on disk');
      return undefined;
    }
    return entry;
  }

  /**
   * The app holds a collection's whole tree in memory, so a CLI command, a `git checkout` or
   * a hand edit would otherwise stay invisible until a restart. Filesystem watching cannot
   * fix this portably: inotify never fires for Windows-side writes on a WSL `/mnt/c` mount,
   * and the same holds for several network and container mounts. So the check happens on
   * read, against a stat-only fingerprint, throttled so it costs almost nothing.
   */
  #changedOnDisk(entry: IndexEntry, collection: Collection): boolean {
    const now = Date.now();
    if (now - entry.lastRevalidationAt < this.#revalidationIntervalMs) return false;
    entry.lastRevalidationAt = now;

    // An own write is still waiting for its deferred fingerprint refresh. Adopt the
    // fingerprint now instead of reading our own change as somebody else's.
    if (entry.pendingFingerprintRefresh !== null) {
      entry.index.refreshFingerprint(collection);
      this.#cancelFingerprintRefresh(entry);
      return false;
    }

    return entry.index.isStale(collection);
  }

  #index(collection: Collection): void {
    const existing = this.#entries.get(collection.name);
    if (existing?.status === 'indexing') return;

    if (existing) {
      this.#cancelFingerprintRefresh(existing);
    } else {
      this.#evictLeastRecentlyUsed(collection.name);
    }

    const entry: IndexEntry = {
      collection,
      status: 'indexing',
      index: new ResourceTreeIndex(collection),
      indexedAt: null,
      accessSequence: ++this.#accessSequence,
      lastRevalidationAt: 0,
      pendingFingerprintRefresh: null,
    };
    this.#entries.set(collection.name, entry);

    const startedAt = Date.now();
    try {
      entry.index.load((warning) => this.#logger.warn(warning));
      entry.status = 'ready';
      entry.indexedAt = new Date();
      entry.lastRevalidationAt = Date.now();
      this.#logger.log(`Indexed collection ${collection.name} in ${Date.now() - startedAt}ms`);
    } catch (error) {
      entry.status = 'error';
      entry.error = error instanceof Error ? error.message : 'Unknown error occurred';
      this.#logger.error(
        `Failed to index collection ${collection.name}: ${entry.error}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  #drop(entry: IndexEntry, reason: string): void {
    this.#logger.log(`Dropping index of collection ${entry.collection.name}: ${reason}`);
    this.#cancelFingerprintRefresh(entry);
    this.#entries.delete(entry.collection.name);
  }

  /** Makes room for a new entry once the cap is reached by dropping the least recently used one. */
  #evictLeastRecentlyUsed(incomingName: string): void {
    if (this.#entries.size < this.#maxEntries) return;

    let victim: IndexEntry | undefined;
    for (const entry of this.#entries.values()) {
      if (entry.collection.name === incomingName) continue;
      if (!victim || entry.accessSequence < victim.accessSequence) victim = entry;
    }

    if (victim) this.#drop(victim, `the index holds at most ${this.#maxEntries} collections`);
  }

  /**
   * Queues a fingerprint refresh for the end of the current tick, so own writes do not later
   * read as outside changes. Writes deliver one mutation per `apply` call, so deferring
   * collapses a request into a single scan.
   */
  #scheduleFingerprintRefresh(entry: IndexEntry): void {
    if (entry.pendingFingerprintRefresh !== null) return;

    entry.pendingFingerprintRefresh = setTimeout(() => {
      entry.pendingFingerprintRefresh = null;
      entry.index.refreshFingerprint();
    }, 0);

    // A pending refresh must never hold the process open on its own.
    entry.pendingFingerprintRefresh.unref?.();
  }

  #cancelFingerprintRefresh(entry: IndexEntry): void {
    if (entry.pendingFingerprintRefresh !== null) {
      clearTimeout(entry.pendingFingerprintRefresh);
      entry.pendingFingerprintRefresh = null;
    }
  }
}
