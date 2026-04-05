import { resolve, join } from 'node:path';
import type { ImportedResource } from './types';
import type { ResourceEntries } from '../../resource/resource-entry';
import { splitResolvedKey } from '@simoncodes-ca/domain';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { readJsonFile } from '../file-io/json-file-operations';

/**
 * Loads base locale values for all imported resources from existing resource files.
 *
 * Groups resources by folder to minimize file reads. Used to provide base values
 * for ICU auto-fixing during import operations.
 *
 * @param resources - Array of imported resources to load base values for
 * @param translationsFolder - Path to the translations directory
 * @param cwd - Current working directory for resolving absolute paths
 * @returns Map of resource keys to their base locale values
 */
export function loadBaseLocaleValues(
  resources: ImportedResource[],
  translationsFolder: string,
  cwd: string,
): Map<string, string> {
  const baseValues = new Map<string, string>();

  // Group by folder to minimize file reads
  const folderToKeys = new Map<string, Array<{ key: string; entryKey: string }>>();

  for (const resource of resources) {
    const { folderPath: pathSegments, entryKey } = splitResolvedKey(resource.key);

    const fullFolderPath = pathSegments.length ? join(translationsFolder, ...pathSegments) : translationsFolder;

    let folderKeys = folderToKeys.get(fullFolderPath);
    if (!folderKeys) {
      folderKeys = [];
      folderToKeys.set(fullFolderPath, folderKeys);
    }

    folderKeys.push({ key: resource.key, entryKey });
  }

  // Load base values from each folder
  for (const [folderPath, keys] of folderToKeys.entries()) {
    const entryResourcePath = resolve(cwd, folderPath, RESOURCE_ENTRIES_FILENAME);

    try {
      const resourceEntries = readJsonFile<ResourceEntries>({
        filePath: entryResourcePath,
        defaultValue: {} as ResourceEntries,
      });

      for (const { key, entryKey } of keys) {
        const entry = resourceEntries[entryKey];
        if (entry?.source) {
          baseValues.set(key, entry.source);
        }
      }
    } catch {
      // ignore errors if files can't be parsed
    }
  }

  return baseValues;
}
