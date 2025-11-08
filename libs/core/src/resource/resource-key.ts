/**
 * Regex pattern for validating individual key segments.
 * Each segment may contain only alphanumeric characters, _, or -.
 */
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Validates that a single segment (between dots) matches the allowed pattern.
 * @param segment - The segment to validate
 * @returns true if valid, false otherwise
 */
export function isValidSegment(segment: string): boolean {
  return SEGMENT_PATTERN.test(segment);
}

/**
 * Validates a dot-delimited key string.
 * All segments must match [A-Za-z0-9_-]+.
 * @param key - The key to validate (e.g., "apps.common.buttons.ok")
 * @throws Error if any segment is invalid
 */
export function validateKey(key: string): void {
  if (!key || key.trim() === '') {
    throw new Error('Key cannot be empty');
  }

  const segments = key.split('.');
  for (const segment of segments) {
    if (!isValidSegment(segment)) {
      throw new Error(
        `Invalid key segment "${segment}". Segments must match pattern [A-Za-z0-9_-]+`
      );
    }
  }
}

/**
 * Validates a target folder string.
 * All segments must match [A-Za-z0-9_-]+.
 * @param targetFolder - The target folder to validate (e.g., "apps.common")
 * @throws Error if any segment is invalid
 */
export function validateTargetFolder(targetFolder: string): void {
  if (targetFolder === '' || targetFolder.trim() === '') {
    // Empty target folder is valid
    return;
  }

  const segments = targetFolder.split('.');
  for (const segment of segments) {
    if (!isValidSegment(segment)) {
      throw new Error(
        `Invalid targetFolder segment "${segment}". Segments must match pattern [A-Za-z0-9_-]+`
      );
    }
  }
}

/**
 * Resolves a key and optional targetFolder into a single dot-delimited path.
 * Resolution: resolvedKey = targetFolder ? targetFolder + '.' + key : key
 * Note: No de-duplication is performed; segments may repeat.
 * @param key - The key (required)
 * @param targetFolder - The target folder (optional, empty string or omitted means no folder)
 * @returns The resolved key as a dot-delimited string
 */
export function resolveResourceKey(key: string, targetFolder?: string): string {
  return targetFolder && targetFolder.trim() !== ''
    ? `${targetFolder}.${key}`
    : key;
}

/**
 * Splits a resolved key into path segments for filesystem layout.
 * The last segment is the resource entry key; all preceding segments are folder paths.
 * @param resolvedKey - The fully resolved key (e.g., "apps.common.buttons.cancel")
 * @returns An object with { segments: string[], folderPath: string[], entryKey: string }
 */
export function splitResolvedKey(
  resolvedKey: string
): {
  segments: string[];
  folderPath: string[];
  entryKey: string;
} {
  const segments = resolvedKey.split('.');
  const entryKey = segments[segments.length - 1];
  const folderPath = segments.slice(0, -1);

  return {
    segments,
    folderPath,
    entryKey,
  };
}
