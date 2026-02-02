import { Injectable, Logger } from '@nestjs/common';
import * as core from '@simoncodes-ca/core';
import { extractResourcesRecursively } from '@simoncodes-ca/core';
import type { ResourceTreeNode, ResourceTreeEntry } from '@simoncodes-ca/core';

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
}

@Injectable()
export class CollectionCacheService {
  readonly #logger = new Logger(CollectionCacheService.name);
  #cachedCollection: CachedCollection | null = null;

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
    return true;
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
