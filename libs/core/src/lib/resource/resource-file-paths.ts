import { resolve, join } from 'node:path';
import {
  validateKey,
  validateTargetFolder,
  resolveResourceKey,
  splitResolvedKey,
} from '../../resource/resource-key';
import {
  RESOURCE_ENTRIES_FILENAME,
  TRACKER_META_FILENAME,
} from '../../constants';

export interface ResolvedResourcePaths {
  /** The fully resolved key (targetFolder.key) */
  readonly resolvedKey: string;
  /** The entry key (last segment of resolved key) */
  readonly entryKey: string;
  /** Path segments for folder structure */
  readonly folderPathSegments: readonly string[];
  /** Full path to the folder containing the resource files */
  readonly folderPath: string;
  /** Full path to resource_entries.json */
  readonly resourceEntriesPath: string;
  /** Full path to tracker_meta.json */
  readonly trackerMetaPath: string;
}

export interface ResourcePathResolutionParams {
  /** The resource key to resolve */
  readonly key: string;
  /** Root translations folder */
  readonly translationsFolder: string;
  /** Optional target folder to prepend to key */
  readonly targetFolder?: string;
  /** Current working directory (default: process.cwd()) */
  readonly cwd?: string;
}

/**
 * Resolves a resource key to all necessary file system paths.
 *
 * This function encapsulates the logic for:
 * 1. Combining targetFolder and key into a resolved key
 * 2. Splitting the resolved key into folder path and entry key
 * 3. Resolving absolute paths for resource files
 *
 * @param params - Path resolution parameters
 * @returns Object containing all resolved paths
 *
 * @example
 * ```typescript
 * const paths = resolveResourcePaths({
 *   key: 'buttons.ok',
 *   translationsFolder: '/app/translations',
 *   targetFolder: 'apps.common',
 *   cwd: process.cwd()
 * });
 *
 * // Results:
 * // resolvedKey: "apps.common.buttons.ok"
 * // entryKey: "ok"
 * // folderPathSegments: ["apps", "common", "buttons"]
 * // folderPath: "/app/translations/apps/common/buttons"
 * // resourceEntriesPath: "/app/translations/apps/common/buttons/resource_entries.json"
 * // trackerMetaPath: "/app/translations/apps/common/buttons/tracker_meta.json"
 * ```
 */
export function resolveResourcePaths(
  params: ResourcePathResolutionParams,
): ResolvedResourcePaths {
  const { key, translationsFolder, targetFolder, cwd = process.cwd() } = params;

  const resolvedKey = resolveResourceKey(key, targetFolder);
  const { folderPath: folderPathSegments, entryKey } =
    splitResolvedKey(resolvedKey);

  const relativeFolderPath = folderPathSegments.length
    ? join(translationsFolder, ...folderPathSegments)
    : translationsFolder;

  const folderPath = resolve(cwd, relativeFolderPath);
  const resourceEntriesPath = join(folderPath, RESOURCE_ENTRIES_FILENAME);
  const trackerMetaPath = join(folderPath, TRACKER_META_FILENAME);

  return {
    resolvedKey,
    entryKey,
    folderPathSegments,
    folderPath,
    resourceEntriesPath,
    trackerMetaPath,
  };
}

/**
 * Validates a key and resolves all paths in one operation.
 * Throws if key or targetFolder are invalid.
 */
export function validateAndResolvePaths(
  params: ResourcePathResolutionParams,
): ResolvedResourcePaths {
  validateKey(params.key);

  if (params.targetFolder) {
    validateTargetFolder(params.targetFolder);
  }

  return resolveResourcePaths(params);
}
