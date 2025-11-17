/**
 * Utilities for loading translation resources from collections
 */

import * as fs from 'fs';
import * as path from 'path';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { ResourceEntries } from '../../resource/resource-entry';

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
 * @returns Array of flat resources with keys, values, and tags
 */
export function loadCollectionResources(
  translationsFolder: string,
  locale: string
): FlatResource[] {
  const resources: FlatResource[] = [];

  if (!fs.existsSync(translationsFolder)) {
    return resources;
  }

  loadFolderResources(translationsFolder, '', locale, resources);

  return resources;
}

/**
 * Recursively loads resources from a folder
 *
 * @param folderPath - Current folder path
 * @param keyPrefix - Accumulated key prefix
 * @param locale - Target locale
 * @param resources - Accumulator array
 */
function loadFolderResources(
  folderPath: string,
  keyPrefix: string,
  locale: string,
  resources: FlatResource[]
): void {
  const resourceEntriesPath = path.join(folderPath, RESOURCE_ENTRIES_FILENAME);

  if (fs.existsSync(resourceEntriesPath)) {
    try {
      const content = fs.readFileSync(resourceEntriesPath, 'utf8');
      const entries: ResourceEntries = JSON.parse(content);

      for (const [entryKey, entry] of Object.entries(entries)) {
        const fullKey = keyPrefix ? `${keyPrefix}.${entryKey}` : entryKey;
        const value = entry[locale];

        // Extract translation value (skip if missing)
        if (typeof value === 'string') {
          resources.push({
            key: fullKey,
            value,
            tags: entry.tags,
          });
        }
      }
    } catch (error) {
      // Skip invalid JSON files
      console.warn(`⚠️  Skipping invalid JSON: ${resourceEntriesPath}`);
    }
  }

  // Recursively process subfolders
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subfolderPath = path.join(folderPath, entry.name);
      const subKeyPrefix = keyPrefix ? `${keyPrefix}.${entry.name}` : entry.name;
      loadFolderResources(subfolderPath, subKeyPrefix, locale, resources);
    }
  }
}
