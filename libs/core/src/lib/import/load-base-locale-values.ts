import type { Collection } from '../config/open-collection';
import { groupByFolder } from '../resource/folder-batch';
import { openResourceFolder } from '../resource/resource-folder';
import type { ImportedResource } from './types';

/**
 * Loads base locale values for all imported resources from existing resource files.
 *
 * Groups resources by folder to minimize file reads. Used to provide base values
 * for ICU auto-fixing during import operations.
 *
 * @param resources - Array of imported resources to load base values for
 * @param collection - The opened collection
 * @returns Map of resource keys to their base locale values
 */
export function loadBaseLocaleValues(resources: ImportedResource[], collection: Collection): Map<string, string> {
  const baseValues = new Map<string, string>();

  // This read phase is separate from the later import write phase.
  for (const { folderPath, members } of groupByFolder(collection, resources, (resource) => resource.key)) {
    try {
      const folder = openResourceFolder(folderPath, collection);

      for (const { key, entryKey } of members) {
        const source = folder.get(entryKey)?.entry.source;
        if (source) {
          baseValues.set(key, source);
        }
      }
    } catch {
      // ignore errors if files can't be parsed
    }
  }

  return baseValues;
}
