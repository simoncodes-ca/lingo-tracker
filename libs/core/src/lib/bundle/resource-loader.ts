/**
 * Utilities for loading translation resources from collections
 */

import * as fs from 'fs';
import * as path from 'path';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { walkFolders } from '../normalize/iterative-folder-walker';
import type { ResourceEntries } from '../../resource/resource-entry';

export interface FlatResource {
  readonly key: string;
  readonly value: string;
  readonly tags?: string[];
}

/**
 * Loads all resources from a collection's translations folder
 * Returns flat list of resources with full keys
 *
 * @param translationsFolder - Path to collection's translations folder
 * @param locale - Target locale to extract values for
 * @param baseLocale - Base locale (source values use 'source' property)
 * @returns Array of flat resources with keys, values, and tags
 */
export function loadCollectionResources(
  translationsFolder: string,
  locale: string,
  baseLocale: string,
): FlatResource[] {
  const resources: FlatResource[] = [];

  if (!fs.existsSync(translationsFolder)) {
    return resources;
  }

  for (const visit of walkFolders(translationsFolder, { skipHidden: false })) {
    const resourceEntriesPath = path.join(visit.absolutePath, RESOURCE_ENTRIES_FILENAME);

    if (!fs.existsSync(resourceEntriesPath)) continue;

    try {
      const content = fs.readFileSync(resourceEntriesPath, 'utf8');
      const entries: ResourceEntries = JSON.parse(content);

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
