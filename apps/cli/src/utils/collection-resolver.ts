import { resolve } from 'node:path';
import type { LingoTrackerConfig, LingoTrackerCollection } from '@simoncodes-ca/core';

/**
 * Resolved collection data with computed paths
 */
export interface ResolvedCollection {
  name: string;
  config: LingoTrackerCollection;
  translationsFolderPath: string;
}

/**
 * Validates and resolves a collection from configuration.
 *
 * @param collectionName - Name of collection to resolve
 * @param config - LingoTracker configuration
 * @param baseDirectory - Base directory for resolving paths
 * @returns Resolved collection data, or null if not found
 *
 * @example
 * const collection = resolveCollection('main', config, cwd);
 * if (!collection) return;
 * // Use: collection.translationsFolderPath
 */
export function resolveCollection(
  collectionName: string,
  config: LingoTrackerConfig,
  baseDirectory: string
): ResolvedCollection | null {
  const collectionConfig = config.collections?.[collectionName];

  if (!collectionConfig) {
    console.log(`❌ Collection "${collectionName}" not found.`);
    return null;
  }

  return {
    name: collectionName,
    config: collectionConfig,
    translationsFolderPath: resolve(baseDirectory, collectionConfig.translationsFolder),
  };
}
