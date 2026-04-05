/**
 * Utilities for loading translation resources from collections
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { walkFolders } from '../normalize/iterative-folder-walker';
import type { ResourceEntries } from '../../resource/resource-entry';
import { readJsonFile } from '../file-io/json-file-operations';

export interface FlatResource {
  readonly key: string;
  readonly value: string;
  readonly tags?: string[];
}

/**
 * Loads all resources from a collection's translations folder.
 *
 * Returns a flat list of resources with full keys. When a `cache` map is
 * provided, parsed `ResourceEntries` objects are stored in it by file path
 * so subsequent calls for the same folder (e.g., different locales in the
 * same bundle generation) avoid redundant disk reads and JSON parsing.
 * The cache is intentionally short-lived: callers should create it per
 * invocation and discard it afterwards to avoid stale data.
 *
 * @param translationsFolder - Path to collection's translations folder
 * @param locale - Target locale to extract values for
 * @param baseLocale - Base locale (source values use 'source' property)
 * @param cache - Optional per-invocation cache of parsed ResourceEntries by file path
 * @returns Array of flat resources with keys, values, and tags
 */
export function loadCollectionResources(
  translationsFolder: string,
  locale: string,
  baseLocale: string,
  cache?: Map<string, ResourceEntries>,
): FlatResource[] {
  const resources: FlatResource[] = [];

  if (!fs.existsSync(translationsFolder)) {
    return resources;
  }

  for (const visit of walkFolders(translationsFolder, { skipHidden: false })) {
    const resourceEntriesPath = path.join(visit.absolutePath, RESOURCE_ENTRIES_FILENAME);

    if (!fs.existsSync(resourceEntriesPath)) continue;

    try {
      let entries: ResourceEntries;

      const cached = cache?.get(resourceEntriesPath);
      if (cached) {
        entries = cached;
      } else {
        entries = readJsonFile<ResourceEntries>({ filePath: resourceEntriesPath });
        cache?.set(resourceEntriesPath, entries);
      }

      for (const [entryKey, entry] of Object.entries(entries)) {
        const fullKey = visit.keyPrefix ? `${visit.keyPrefix}.${entryKey}` : entryKey;

        // For base locale, use 'source' property; for others, use locale key
        const value = locale === baseLocale ? entry.source : entry[locale];

        // Extract translation value (skip if missing)
        if (typeof value === 'string') {
          resources.push({
            key: fullKey,
            value,
            tags: entry.tags,
          });
        }
      }
    } catch {
      // Skip invalid JSON files
      console.warn(`⚠️  Skipping invalid JSON: ${resourceEntriesPath}`);
    }
  }

  return resources;
}
