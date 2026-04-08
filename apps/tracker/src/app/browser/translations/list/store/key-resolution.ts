import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

/**
 * Resolves the full dot-delimited key for a resource.
 * In search mode the key already contains the full path.
 * In folder mode, prepends currentFolderPath.
 */
export function resolveFullKey(translationKey: string, isSearchMode: boolean, currentFolderPath: string): string {
  if (isSearchMode) return translationKey;
  return currentFolderPath ? `${currentFolderPath}.${translationKey}` : translationKey;
}

/**
 * Splits a full dot-delimited key into folder path and entry key.
 * E.g. "forms.acceptedFormatsX" → { folderPath: "forms", entryKey: "acceptedFormatsX" }
 */
export function splitKey(fullKey: string): { folderPath: string; entryKey: string } {
  const segments = fullKey.split('.');
  return {
    folderPath: segments.length > 1 ? segments.slice(0, -1).join('.') : '',
    entryKey: segments[segments.length - 1],
  };
}

function isRelativeNestedKey(key: string, showNestedResources: boolean): boolean {
  return showNestedResources && key.includes('.');
}

/**
 * Resolves the effective folder path for a resource.
 * - Search mode: extracts folder from the full key
 * - Nested resources shown + key has dots: combines currentFolderPath with relative folder segments
 * - Otherwise: returns currentFolderPath
 */
export function resolveEffectiveFolderPath(
  translationKey: string,
  isSearchMode: boolean,
  showNestedResources: boolean,
  currentFolderPath: string,
): string {
  if (isSearchMode) return splitKey(translationKey).folderPath;
  if (isRelativeNestedKey(translationKey, showNestedResources)) {
    const { folderPath: relativeFolderPath } = splitKey(translationKey);
    return currentFolderPath ? `${currentFolderPath}.${relativeFolderPath}` : relativeFolderPath;
  }
  return currentFolderPath;
}

/**
 * Resolves the resource DTO for the edit dialog.
 * In search mode or nested-resource mode, strips the key to just the entry key portion.
 * Otherwise returns the resource unchanged.
 */
export function resolveResourceForDialog(
  translation: ResourceSummaryDto,
  isSearchMode: boolean,
  showNestedResources: boolean,
): ResourceSummaryDto {
  if (isSearchMode || isRelativeNestedKey(translation.key, showNestedResources)) {
    return { ...translation, key: splitKey(translation.key).entryKey };
  }
  return translation;
}
