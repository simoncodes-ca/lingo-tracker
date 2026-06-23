import { resolve } from 'node:path';
import type { LingoTrackerConfig, LingoTrackerCollection } from '@simoncodes-ca/core';
import { ErrorMessages } from './error-messages';

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
  baseDirectory: string,
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

/**
 * Resolves a collection for a mutating operation. Behaves like {@link resolveCollection},
 * but additionally refuses read-only collections: it prints an error, sets a non-zero exit
 * code (so the failure is detectable in CI), and returns null.
 *
 * Use this in commands that modify resources (add/edit/delete/move/normalize/import,
 * locale changes, auto-translate). Commands that only read, or that operate on the
 * collection's registration (delete-collection), should use {@link resolveCollection}.
 *
 * @example
 * const collection = resolveWritableCollection('main', config, cwd);
 * if (!collection) return;
 */
export function resolveWritableCollection(
  collectionName: string,
  config: LingoTrackerConfig,
  baseDirectory: string,
): ResolvedCollection | null {
  const resolved = resolveCollection(collectionName, config, baseDirectory);
  if (!resolved) return null;

  if (resolved.config.readOnly) {
    console.log(ErrorMessages.COLLECTION_READ_ONLY(resolved.name));
    process.exitCode = 1;
    return null;
  }

  return resolved;
}
