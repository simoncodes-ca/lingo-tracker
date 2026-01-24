import { Injectable, Logger } from '@nestjs/common';
import * as core from '@simoncodes-ca/core';
import type { ResourceTreeNode } from '@simoncodes-ca/core';

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

  setCacheStatus(
    collectionName: string,
    status: CacheStatus,
    tree?: ResourceTreeNode,
    error?: string
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
        indexedAt: null,
        error,
      };
    } else {
      this.#cachedCollection.status = status;
      this.#cachedCollection.tree = tree ?? this.#cachedCollection.tree;
      this.#cachedCollection.error = error;

      if (status === CacheStatus.READY) {
        this.#cachedCollection.indexedAt = new Date();
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

  async indexCollection(collectionName: string, translationsFolder: string): Promise<void> {
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
          `Discarding indexing results for ${indexingCollectionName} - collection changed to ${this.#cachedCollection?.collectionName ?? 'none'}`
        );
        return;
      }

      this.setCacheStatus(indexingCollectionName, CacheStatus.READY, tree);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      this.#logger.error(
        `Failed to index collection ${indexingCollectionName} after ${duration}ms: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );

      if (this.#cachedCollection?.collectionName !== indexingCollectionName) {
        this.#logger.log(
          `Discarding error state for ${indexingCollectionName} - collection changed to ${this.#cachedCollection?.collectionName ?? 'none'}`
        );
        return;
      }

      this.setCacheStatus(indexingCollectionName, CacheStatus.ERROR, undefined, errorMessage);
      throw error;
    }
  }
}
