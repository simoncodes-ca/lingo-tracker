import { resolveResourceKey, splitResolvedKey, validateKey, validateTargetFolder } from '@simoncodes-ca/domain';
import { InvalidResourceKeyError } from '../errors/lingo-tracker-error';
import { resolveFolderAddress } from './folder-address';

export interface ResolvedResourcePaths {
  /** The fully resolved key (targetFolder.key) */
  readonly resolvedKey: string;
  /** The entry key (last segment of resolved key) */
  readonly entryKey: string;
  /** Path segments for folder structure */
  readonly folderPathSegments: readonly string[];
  /** Full path to the folder containing the resource files */
  readonly folderPath: string;
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
 * Resolves a resource key to its entry key and folder address.
 *
 * This function encapsulates the logic for:
 * 1. Combining targetFolder and key into a resolved key
 * 2. Splitting the resolved key into folder path and entry key
 * 3. Resolving the absolute folder path
 *
 * @param params - Path resolution parameters
 * @returns The folder address, resolved full key, entry key, and folder path segments
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
 * ```
 */
export function resolveResourcePaths(params: ResourcePathResolutionParams): ResolvedResourcePaths {
  const { key, translationsFolder, targetFolder, cwd = process.cwd() } = params;

  const resolvedKey = resolveResourceKey(key, targetFolder);
  const { folderPath: folderPathSegments, entryKey } = splitResolvedKey(resolvedKey);

  const folderPath = resolveFolderAddress(translationsFolder, folderPathSegments.join('.'), cwd);

  return {
    resolvedKey,
    entryKey,
    folderPathSegments,
    folderPath,
  };
}

/**
 * Validates a key and resolves all paths in one operation.
 * Throws `InvalidResourceKeyError` (with the domain validator's message) if the key or
 * targetFolder is invalid.
 */
export function validateAndResolvePaths(params: ResourcePathResolutionParams): ResolvedResourcePaths {
  try {
    validateKey(params.key);

    if (params.targetFolder) {
      validateTargetFolder(params.targetFolder);
    }
  } catch (error: unknown) {
    throw new InvalidResourceKeyError(params.key, error instanceof Error ? error.message : String(error));
  }

  return resolveResourcePaths(params);
}
