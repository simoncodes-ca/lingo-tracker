/**
 * Extracts the folder name from a full folder path.
 * For example: "apps.common.buttons" -> "buttons"
 */
export function extractFolderNameFromPath(folderPath: string): string {
  const parts = folderPath.split('.');
  return parts[parts.length - 1];
}

/**
 * Extracts the parent folder path from a full folder path.
 * For example: "apps.common.buttons" -> "apps.common"
 */
export function extractParentFolderPath(folderPath: string): string {
  const parts = folderPath.split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : '';
}

/**
 * Splits a resolved resource key into its components.
 * For example: "apps.common.buttons.cancel" ->
 *   { segments: ['apps','common','buttons','cancel'], folderPath: ['apps','common','buttons'], entryKey: 'cancel' }
 */
export function splitResolvedKey(resolvedKey: string): {
  segments: string[];
  folderPath: string[];
  entryKey: string;
} {
  const segments = resolvedKey.split('.');
  const entryKey = segments[segments.length - 1];
  const folderPath = segments.slice(0, -1);
  return { segments, folderPath, entryKey };
}
