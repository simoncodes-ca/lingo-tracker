import { splitResolvedKey } from '@simoncodes-ca/domain';
import { resolveFolderAddress } from './folder-address';
import { resolveCheckedResourceKey } from './resource-key';

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
 * 1. Validating and combining targetFolder and key into a resolved key
 * 2. Splitting the resolved key into folder path and entry key
 * 3. Resolving the absolute folder path
 *
 * @param params - Path resolution parameters
 * @returns The folder address, resolved full key, entry key, and folder path segments
 * @throws {InvalidResourceKeyError} The key or target folder is malformed (domain message unchanged).
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
  return resolveResolvedResourcePaths({
    key: resolveCheckedResourceKey(params.key, params.targetFolder),
    translationsFolder: params.translationsFolder,
    cwd: params.cwd,
  });
}

/**
 * Maps a full key already validated by its caller or read from storage to its paths.
 * Does not validate key syntax. Collection folder policy still applies.
 */
export function resolveResolvedResourcePaths(
  params: Omit<ResourcePathResolutionParams, 'targetFolder'>,
): ResolvedResourcePaths {
  const { key: resolvedKey, translationsFolder, cwd = process.cwd() } = params;
  const { folderPath: folderPathSegments, entryKey } = splitResolvedKey(resolvedKey);

  const folderPath = resolveFolderAddress(translationsFolder, folderPathSegments.join('.'), cwd);

  return {
    resolvedKey,
    entryKey,
    folderPathSegments,
    folderPath,
  };
}
