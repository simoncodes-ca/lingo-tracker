import { resolve, join } from 'path';
import type { ImportedResource } from './types';
import { splitResolvedKey } from '@simoncodes-ca/domain';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';

/**
 * Represents a group of resources that belong to the same folder path.
 *
 * This interface is used to batch-process resources efficiently by grouping
 * them according to their storage location. All resources in a group share
 * the same resource_entries.json and tracker_meta.json files.
 *
 * Grouping enables:
 * - Single file read/write operation per folder instead of per resource
 * - Atomic updates to all resources in the same folder
 * - Better performance for bulk imports
 */
export interface ResourceGroup {
  /** The full folder path where these resources are stored */
  folderPath: string;
  /** Absolute path to the resource_entries.json file for this folder */
  entryResourcePath: string;
  /** Absolute path to the tracker_meta.json file for this folder */
  entryMetaPath: string;
  /** Array of resources and their entry keys that belong to this folder */
  resources: Array<{
    /** The imported resource with key, value, and metadata */
    resource: ImportedResource;
    /** The entry key (last segment after splitting by folders) */
    entryKey: string;
  }>;
}

/**
 * Groups imported resources by their folder path for efficient batch processing.
 *
 * Resources in LingoTracker are stored in a hierarchical folder structure based on
 * dot-delimited keys. For example, the key "apps.common.buttons.ok" is stored in
 * the folder "apps/common/buttons/" with entry key "ok".
 *
 * This function analyzes each resource key, determines its folder path, and groups
 * all resources that belong to the same folder together. This enables batch file
 * operations instead of reading/writing files once per resource.
 *
 * Benefits of grouping:
 * - Reduces file I/O operations significantly (one read/write per folder vs per resource)
 * - Ensures atomic updates for all resources in the same folder
 * - Improves import performance, especially for large translation files
 * - Maintains data consistency by processing related resources together
 *
 * @param resources - Array of resources to group by folder path
 * @param translationsFolder - Base translations folder path (e.g., 'src/translations')
 * @param cwd - Current working directory for resolving absolute paths
 * @returns Map of folder paths to ResourceGroup objects containing grouped resources
 *
 * @example
 * ```typescript
 * const resources = [
 *   { key: 'common.ok', value: 'OK' },
 *   { key: 'common.cancel', value: 'Cancel' },
 *   { key: 'errors.notFound', value: 'Not Found' }
 * ];
 *
 * const groups = groupResourcesByFolder(
 *   resources,
 *   'src/translations',
 *   '/project'
 * );
 *
 * // Returns:
 * // Map {
 * //   'src/translations/common' => {
 * //     folderPath: 'src/translations/common',
 * //     entryResourcePath: '/project/src/translations/common/resource_entries.json',
 * //     entryMetaPath: '/project/src/translations/common/tracker_meta.json',
 * //     resources: [
 * //       { resource: { key: 'common.ok', value: 'OK' }, entryKey: 'ok' },
 * //       { resource: { key: 'common.cancel', value: 'Cancel' }, entryKey: 'cancel' }
 * //     ]
 * //   },
 * //   'src/translations/errors' => {
 * //     folderPath: 'src/translations/errors',
 * //     entryResourcePath: '/project/src/translations/errors/resource_entries.json',
 * //     entryMetaPath: '/project/src/translations/errors/tracker_meta.json',
 * //     resources: [
 * //       { resource: { key: 'errors.notFound', value: 'Not Found' }, entryKey: 'notFound' }
 * //     ]
 * //   }
 * // }
 * ```
 */
export function groupResourcesByFolder(
  resources: ImportedResource[],
  translationsFolder: string,
  cwd: string,
): Map<string, ResourceGroup> {
  const groups = new Map<string, ResourceGroup>();

  for (const resource of resources) {
    const { folderPath: pathSegments, entryKey } = splitResolvedKey(resource.key);

    const fullFolderPath = pathSegments.length ? join(translationsFolder, ...pathSegments) : translationsFolder;

    const entryResourcePath = resolve(cwd, fullFolderPath, RESOURCE_ENTRIES_FILENAME);
    const entryMetaPath = resolve(cwd, fullFolderPath, TRACKER_META_FILENAME);

    if (!groups.has(fullFolderPath)) {
      groups.set(fullFolderPath, {
        folderPath: fullFolderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [],
      });
    }

    const group = groups.get(fullFolderPath);
    if (group) {
      group.resources.push({
        resource,
        entryKey,
      });
    }
  }

  return groups;
}
