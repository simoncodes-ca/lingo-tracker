import { Injectable, Logger } from '@nestjs/common';
import type { FolderChild, ResourceTreeEntry, ResourceTreeNode, TreeFingerprint } from '@simoncodes-ca/core';
import * as core from '@simoncodes-ca/core';
import { computeTreeFingerprint, extractResourcesRecursively, treeFingerprintsMatch } from '@simoncodes-ca/core';

/**
 * How long a disk fingerprint is trusted before it is recomputed, in milliseconds.
 *
 * The scan is stat-only and costs a few milliseconds on a typical collection, but it runs
 * on read paths, so it is throttled rather than run per request.
 */
const DEFAULT_REVALIDATION_INTERVAL_MS = 2000;

export enum CacheStatus {
  NOT_STARTED = 'not-started',
  INDEXING = 'indexing',
  READY = 'ready',
  ERROR = 'error',
}

export interface CachedCollection {
  readonly collectionName: string;
  status: CacheStatus;
  tree: ResourceTreeNode | null;
  indexedAt: Date | null;
  error?: string;
  totalKeys: number;
  localeCount: number;
  /** Folder the tree was indexed from, needed to re-scan it later */
  translationsFolder: string | null;
  /** Disk state as of the last index or self-write, used to spot outside changes */
  fingerprint: TreeFingerprint | null;
}

@Injectable()
export class CollectionCacheService {
  readonly #logger = new Logger(CollectionCacheService.name);
  #cachedCollection: CachedCollection | null = null;
  #lastRevalidationAt = 0;
  #pendingFingerprintRefresh: NodeJS.Timeout | null = null;

  readonly #revalidationIntervalMs = Number(
    process.env.LINGO_TRACKER_REVALIDATE_INTERVAL_MS ?? DEFAULT_REVALIDATION_INTERVAL_MS,
  );

  getCacheStatus(collectionName: string): CacheStatus {
    if (!this.#cachedCollection || this.#cachedCollection.collectionName !== collectionName) {
      return CacheStatus.NOT_STARTED;
    }

    return this.#cachedCollection.status;
  }

  getCache(collectionName: string): ResourceTreeNode | null {
    if (!this.#cachedCollection || this.#cachedCollection.collectionName !== collectionName) {
      return null;
    }

    if (this.#cachedCollection.status !== CacheStatus.READY) {
      return null;
    }

    return this.#cachedCollection.tree;
  }

  getCacheMetadata(collectionName: string): { indexedAt: Date | null; error?: string } | null {
    if (!this.#cachedCollection || this.#cachedCollection.collectionName !== collectionName) {
      return null;
    }

    return {
      indexedAt: this.#cachedCollection.indexedAt,
      error: this.#cachedCollection.error,
    };
  }

  getCacheStats(collectionName: string): { totalKeys: number; localeCount: number } | null {
    if (!this.#cachedCollection || this.#cachedCollection.collectionName !== collectionName) {
      return null;
    }

    if (this.#cachedCollection.status !== CacheStatus.READY) {
      return null;
    }

    return {
      totalKeys: this.#cachedCollection.totalKeys,
      localeCount: this.#cachedCollection.localeCount,
    };
  }

  setCacheStatus(
    collectionName: string,
    status: CacheStatus,
    tree?: ResourceTreeNode,
    error?: string,
    localeCount?: number,
  ): void {
    if (this.#cachedCollection && this.#cachedCollection.collectionName !== collectionName) {
      this.#logger.log(`Clearing cache for previous collection: ${this.#cachedCollection.collectionName}`);
      this.#cachedCollection = null;
    }

    if (!this.#cachedCollection) {
      this.#cachedCollection = {
        collectionName,
        status,
        tree: tree ?? null,
        indexedAt: status === CacheStatus.READY ? new Date() : null,
        error,
        totalKeys: status === CacheStatus.READY && tree ? extractResourcesRecursively(tree).length : 0,
        localeCount: status === CacheStatus.READY ? (localeCount ?? 0) : 0,
        translationsFolder: null,
        fingerprint: null,
      };
    } else {
      this.#cachedCollection.status = status;
      this.#cachedCollection.tree = tree ?? this.#cachedCollection.tree;
      this.#cachedCollection.error = error;

      if (status === CacheStatus.READY) {
        this.#cachedCollection.indexedAt = new Date();

        if (tree) {
          this.#cachedCollection.totalKeys = extractResourcesRecursively(tree).length;
          this.#cachedCollection.localeCount = localeCount ?? 0;
        }
      }
    }

    this.#logger.log(`Cache status set to ${status} for collection: ${collectionName}`);
  }

  clearCache(): void {
    this.#cancelPendingFingerprintRefresh();

    if (this.#cachedCollection) {
      this.#logger.log(`Clearing cache for collection: ${this.#cachedCollection.collectionName}`);
      this.#cachedCollection = null;
    }
  }

  /**
   * Adds a folder to the cached tree without requiring a full re-index.
   * @param collectionName - The collection name
   * @param folderName - The name of the new folder
   * @param parentPath - The parent path (dot-delimited) or undefined for root
   * @returns true if the folder was added, false if cache wasn't ready or parent not found
   */
  addFolderToCache(collectionName: string, folderName: string, parentPath?: string): boolean {
    if (!this.#cachedCollection || this.#cachedCollection.collectionName !== collectionName) {
      this.#logger.warn(`Cannot add folder to cache: no cache for collection ${collectionName}`);
      return false;
    }

    if (this.#cachedCollection.status !== CacheStatus.READY || !this.#cachedCollection.tree) {
      this.#logger.warn(`Cannot add folder to cache: cache not ready for collection ${collectionName}`);
      return false;
    }

    const tree = this.#cachedCollection.tree;
    const parentSegments = parentPath ? parentPath.split('.') : [];
    const fullPathSegments = [...parentSegments, folderName];

    // Find the parent node
    let parentNode: ResourceTreeNode = tree;
    for (const segment of parentSegments) {
      const child = parentNode.children.find((c) => c.name === segment);
      if (!child || !child.tree) {
        this.#logger.warn(`Cannot add folder to cache: parent path "${parentPath}" not found or not loaded`);
        return false;
      }
      parentNode = child.tree;
    }

    // Check if folder already exists
    const existingChild = parentNode.children.find((c) => c.name === folderName);
    if (existingChild) {
      this.#logger.log(`Folder "${folderName}" already exists in cache at path "${parentPath || 'root'}"`);
      this.#scheduleFingerprintRefresh();
      return true;
    }

    // Create the new folder child entry
    const newFolderChild = {
      name: folderName,
      fullPathSegments,
      loaded: true,
      tree: {
        folderPathSegments: fullPathSegments,
        resources: [],
        children: [],
      },
    };

    // Add to parent's children and sort alphabetically
    parentNode.children.push(newFolderChild);
    parentNode.children.sort((a, b) => a.name.localeCompare(b.name));

    this.#logger.log(`Added folder "${folderName}" to cache at path "${parentPath || 'root'}"`);
    this.#scheduleFingerprintRefresh();
    return true;
  }

  /**
   * Adds a resource to the cached tree without requiring a full re-index.
   * @param collectionName - The collection name
   * @param resourceEntry - The resource entry to add
   * @param folderPath - The dot-delimited folder path where the resource belongs
   * @returns true if the resource was added, false if cache wasn't ready or folder not found
   */
  addResourceToCache(collectionName: string, resourceEntry: ResourceTreeEntry, folderPath: string): boolean {
    if (!this.#cachedCollection || this.#cachedCollection.collectionName !== collectionName) {
      this.#logger.warn(`Cannot add resource to cache: no cache for collection ${collectionName}`);
      return false;
    }

    if (this.#cachedCollection.status !== CacheStatus.READY || !this.#cachedCollection.tree) {
      this.#logger.warn(`Cannot add resource to cache: cache not ready for collection ${collectionName}`);
      return false;
    }

    const tree = this.#cachedCollection.tree;

    // Navigate to the target folder
    let targetNode: ResourceTreeNode = tree;
    if (folderPath) {
      const pathSegments = folderPath.split('.');
      for (const segment of pathSegments) {
        const child = targetNode.children.find((c) => c.name === segment);
        if (!child || !child.tree) {
          this.#logger.warn(`Cannot add resource to cache: folder path "${folderPath}" not found or not loaded`);
          return false;
        }
        targetNode = child.tree;
      }
    }

    // Check if resource already exists (update) or is new (add)
    const existingIndex = targetNode.resources.findIndex((r) => r.key === resourceEntry.key);
    if (existingIndex >= 0) {
      // Update existing resource
      targetNode.resources[existingIndex] = resourceEntry;
      this.#logger.log(`Updated resource "${resourceEntry.key}" in cache at path "${folderPath || 'root'}"`);
    } else {
      // Add new resource and sort alphabetically by key
      targetNode.resources.push(resourceEntry);
      targetNode.resources.sort((a, b) => a.key.localeCompare(b.key));
      // Update total keys count
      this.#cachedCollection.totalKeys++;
      this.#logger.log(`Added resource "${resourceEntry.key}" to cache at path "${folderPath || 'root'}"`);
    }

    this.#scheduleFingerprintRefresh();
    return true;
  }

  /**
   * Removes a folder from the cached tree without requiring a full re-index.
   * @param collectionName - The collection name
   * @param folderPath - The dot-delimited path to the folder to remove
   * @returns true if the folder was removed, false if cache wasn't ready or folder not found
   */
  removeFolderFromCache(collectionName: string, folderPath: string): boolean {
    if (!this.#cachedCollection || this.#cachedCollection.collectionName !== collectionName) {
      this.#logger.warn(`Cannot remove folder from cache: no cache for collection ${collectionName}`);
      return false;
    }

    if (this.#cachedCollection.status !== CacheStatus.READY || !this.#cachedCollection.tree) {
      this.#logger.warn(`Cannot remove folder from cache: cache not ready for collection ${collectionName}`);
      return false;
    }

    const tree = this.#cachedCollection.tree;
    const pathSegments = folderPath.split('.');

    if (pathSegments.length === 0) {
      this.#logger.warn(`Cannot remove folder from cache: invalid empty path`);
      return false;
    }

    // Navigate to the parent of the folder to be removed
    const folderNameToRemove = pathSegments[pathSegments.length - 1];
    const parentSegments = pathSegments.slice(0, -1);

    let parentNode: ResourceTreeNode = tree;
    for (const segment of parentSegments) {
      const child = parentNode.children.find((c) => c.name === segment);
      if (!child || !child.tree) {
        this.#logger.warn(`Cannot remove folder from cache: parent path not found or not loaded`);
        return false;
      }
      parentNode = child.tree;
    }

    // Find and remove the folder from parent's children
    const initialChildCount = parentNode.children.length;
    parentNode.children = parentNode.children.filter((child) => child.name !== folderNameToRemove);

    if (parentNode.children.length === initialChildCount) {
      this.#logger.warn(`Cannot remove folder from cache: folder "${folderPath}" not found`);
      return false;
    }

    this.#logger.log(`Removed folder "${folderPath}" from cache`);
    this.#scheduleFingerprintRefresh();
    return true;
  }

  /**
   * Removes a single resource entry from a specific folder in the cached tree
   * without requiring a full re-index.
   * @param collectionName - The collection name
   * @param resourceKey - The entry key of the resource to remove (last segment only)
   * @param folderPath - The dot-delimited folder path where the resource currently lives
   * @returns true if the resource was found and removed, false otherwise
   */
  removeResourceFromCache(collectionName: string, resourceKey: string, folderPath: string): boolean {
    if (!this.#cachedCollection || this.#cachedCollection.collectionName !== collectionName) {
      this.#logger.warn(`Cannot remove resource from cache: no cache for collection ${collectionName}`);
      return false;
    }

    if (this.#cachedCollection.status !== CacheStatus.READY || !this.#cachedCollection.tree) {
      this.#logger.warn(`Cannot remove resource from cache: cache not ready for collection ${collectionName}`);
      return false;
    }

    const tree = this.#cachedCollection.tree;

    // Navigate to the target folder
    let targetNode: ResourceTreeNode = tree;
    if (folderPath) {
      const pathSegments = folderPath.split('.');
      for (const segment of pathSegments) {
        const child = targetNode.children.find((c) => c.name === segment);
        if (!child || !child.tree) {
          this.#logger.warn(`Cannot remove resource from cache: folder path "${folderPath}" not found or not loaded`);
          return false;
        }
        targetNode = child.tree;
      }
    }

    const initialCount = targetNode.resources.length;
    targetNode.resources = targetNode.resources.filter((r) => r.key !== resourceKey);

    if (targetNode.resources.length === initialCount) {
      this.#logger.warn(
        `Cannot remove resource from cache: resource "${resourceKey}" not found at path "${folderPath || 'root'}"`,
      );
      return false;
    }

    this.#cachedCollection.totalKeys--;
    this.#logger.log(`Removed resource "${resourceKey}" from cache at path "${folderPath || 'root'}"`);
    this.#scheduleFingerprintRefresh();
    return true;
  }

  /**
   * Moves a folder in the cached tree without requiring a full re-index.
   * Removes the folder from its source location, updates all path references recursively,
   * and inserts it at the destination location while keeping the cache in READY state.
   * @param collectionName - The collection name
   * @param sourceFolderPath - The dot-delimited path to the folder to move
   * @param destinationFolderPath - The dot-delimited destination path (empty string for root)
   * @returns true if the folder was moved successfully, false if cache wasn't ready or operation failed
   */
  moveFolderInCache(collectionName: string, sourceFolderPath: string, destinationFolderPath: string): boolean {
    if (!this.#cachedCollection || this.#cachedCollection.collectionName !== collectionName) {
      this.#logger.warn(`Cannot move folder in cache: no cache for collection ${collectionName}`);
      return false;
    }

    if (this.#cachedCollection.status !== CacheStatus.READY || !this.#cachedCollection.tree) {
      this.#logger.warn(`Cannot move folder in cache: cache not ready for collection ${collectionName}`);
      return false;
    }

    const tree = this.#cachedCollection.tree;
    const sourceSegments = sourceFolderPath.split('.');
    const folderName = sourceSegments[sourceSegments.length - 1];
    const sourceParentSegments = sourceSegments.slice(0, -1);

    // Find and remove from source parent
    let sourceParent: ResourceTreeNode = tree;
    for (const segment of sourceParentSegments) {
      const child = sourceParent.children.find((c) => c.name === segment);
      if (!child?.tree) {
        this.#logger.warn(`Cannot move folder in cache: source parent path not found or not loaded`);
        return false;
      }
      sourceParent = child.tree;
    }

    const sourceIndex = sourceParent.children.findIndex((c) => c.name === folderName);
    if (sourceIndex === -1) {
      this.#logger.warn(`Cannot move folder in cache: source folder "${sourceFolderPath}" not found`);
      return false;
    }

    const [movedChild] = sourceParent.children.splice(sourceIndex, 1);

    // Calculate new path prefix
    const destSegments = destinationFolderPath ? destinationFolderPath.split('.') : [];
    const newFolderSegments = [...destSegments, folderName];

    // Find destination parent before modifying paths (so we can restore on failure)
    let destParent: ResourceTreeNode = tree;
    for (const segment of destSegments) {
      const child = destParent.children.find((c) => c.name === segment);
      if (!child?.tree) {
        // Fallback: restore source if destination not found
        sourceParent.children.splice(sourceIndex, 0, movedChild);
        this.#logger.warn(`Cannot move folder in cache: destination path "${destinationFolderPath}" not found`);
        return false;
      }
      destParent = child.tree;
    }

    // Recursively update paths for all descendants
    const updatePaths = (child: FolderChild, parentSegments: string[]): void => {
      const newFullPath = [...parentSegments, child.name];
      child.fullPathSegments = newFullPath;
      if (child.tree) {
        child.tree.folderPathSegments = newFullPath;
        for (const grandchild of child.tree.children) {
          updatePaths(grandchild, newFullPath);
        }
      }
    };

    // Update the moved folder's paths
    movedChild.fullPathSegments = newFolderSegments;
    if (movedChild.tree) {
      movedChild.tree.folderPathSegments = newFolderSegments;
      for (const grandchild of movedChild.tree.children) {
        updatePaths(grandchild, newFolderSegments);
      }
    }

    destParent.children.push(movedChild);
    destParent.children.sort((a, b) => a.name.localeCompare(b.name));

    this.#logger.log(`Moved folder "${sourceFolderPath}" to "${destinationFolderPath || 'root'}" in cache`);
    this.#scheduleFingerprintRefresh();
    return true;
  }

  /**
   * Drops the cache when the translations folder has changed underneath it.
   *
   * The app caches a collection's whole tree in memory, so a CLI command, a `git checkout`
   * or a hand edit would otherwise stay invisible until a restart — a browser refresh does
   * not help, because it re-reads the same cache. Filesystem watching cannot fix this
   * portably: inotify never fires for Windows-side writes on a WSL `/mnt/c` mount, and the
   * same holds for several network and container mounts. So the check happens on read,
   * against a stat-only fingerprint, throttled so it costs almost nothing.
   *
   * @param collectionName - The collection being read
   * @param translationsFolder - The collection's translations folder
   * @param cwd - Directory `translationsFolder` is resolved against
   * @returns true when the cache was dropped and needs re-indexing
   */
  revalidate(collectionName: string, translationsFolder: string, cwd?: string): boolean {
    const cached = this.#cachedCollection;

    if (!cached || cached.collectionName !== collectionName || cached.status !== CacheStatus.READY) {
      return false;
    }

    const now = Date.now();
    if (now - this.#lastRevalidationAt < this.#revalidationIntervalMs) {
      return false;
    }
    this.#lastRevalidationAt = now;

    const fingerprint = computeTreeFingerprint({ translationsFolder, cwd });

    // A write of our own is still waiting for its deferred baseline refresh. Adopt the
    // fingerprint now instead of reading our own change as somebody else's.
    if (this.#pendingFingerprintRefresh !== null) {
      this.#cancelPendingFingerprintRefresh();
      cached.fingerprint = fingerprint;
      return false;
    }

    if (treeFingerprintsMatch(cached.fingerprint, fingerprint)) {
      return false;
    }

    this.#logger.log(`Translations folder changed on disk for collection ${collectionName}, dropping cache`);
    this.clearCache();
    return true;
  }

  /**
   * Re-takes the disk fingerprint so the cache's own writes do not later read as external
   * changes. Safe to call when no collection is cached.
   */
  refreshFingerprint(): void {
    this.#cancelPendingFingerprintRefresh();

    const cached = this.#cachedCollection;
    if (!cached?.translationsFolder) {
      return;
    }

    cached.fingerprint = computeTreeFingerprint({ translationsFolder: cached.translationsFolder });
  }

  /**
   * Queues a fingerprint refresh for the end of the current tick.
   *
   * Bulk endpoints mutate the cache once per resource in a synchronous loop, so deferring
   * collapses a whole batch into a single scan.
   */
  #scheduleFingerprintRefresh(): void {
    if (this.#pendingFingerprintRefresh !== null || !this.#cachedCollection?.translationsFolder) {
      return;
    }

    this.#pendingFingerprintRefresh = setTimeout(() => {
      this.#pendingFingerprintRefresh = null;
      this.refreshFingerprint();
    }, 0);

    // A pending refresh must never hold the process open on its own.
    this.#pendingFingerprintRefresh.unref?.();
  }

  #cancelPendingFingerprintRefresh(): void {
    if (this.#pendingFingerprintRefresh !== null) {
      clearTimeout(this.#pendingFingerprintRefresh);
      this.#pendingFingerprintRefresh = null;
    }
  }

  async indexCollection(collectionName: string, translationsFolder: string, localeCount?: number): Promise<void> {
    const currentStatus = this.getCacheStatus(collectionName);

    if (currentStatus === CacheStatus.INDEXING) {
      this.#logger.warn(`Collection ${collectionName} is already being indexed, skipping duplicate request`);
      return;
    }

    this.setCacheStatus(collectionName, CacheStatus.INDEXING);
    const startTime = Date.now();
    const indexingCollectionName = collectionName;

    this.#logger.log(`Starting indexing for collection: ${collectionName}`);

    try {
      // Taken before the load: a write that lands mid-load then disagrees with this
      // fingerprint, which costs one extra re-index but never loses the change.
      const fingerprint = computeTreeFingerprint({ translationsFolder });

      const tree = core.loadResourceTree({
        translationsFolder,
        path: '',
        depth: Infinity,
        cwd: process.cwd(),
      });

      const duration = Date.now() - startTime;
      this.#logger.log(`Successfully indexed collection ${indexingCollectionName} in ${duration}ms`);

      if (this.#cachedCollection?.collectionName !== indexingCollectionName) {
        this.#logger.log(
          `Discarding indexing results for ${indexingCollectionName} - collection changed to ${
            this.#cachedCollection?.collectionName ?? 'none'
          }`,
        );
        return;
      }

      this.setCacheStatus(indexingCollectionName, CacheStatus.READY, tree, undefined, localeCount);

      if (this.#cachedCollection) {
        this.#cachedCollection.translationsFolder = translationsFolder;
        this.#cachedCollection.fingerprint = fingerprint;
      }
      this.#lastRevalidationAt = Date.now();
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      this.#logger.error(
        `Failed to index collection ${indexingCollectionName} after ${duration}ms: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (this.#cachedCollection?.collectionName !== indexingCollectionName) {
        this.#logger.log(
          `Discarding error state for ${indexingCollectionName} - collection changed to ${
            this.#cachedCollection?.collectionName ?? 'none'
          }`,
        );
        return;
      }

      this.setCacheStatus(indexingCollectionName, CacheStatus.ERROR, undefined, errorMessage);
      throw error;
    }
  }
}
