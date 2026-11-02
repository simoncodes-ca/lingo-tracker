import { resolveResourceKey, validateKey, validateTargetFolder } from '@simoncodes-ca/domain';
import { InvalidResourceKeyError } from '../errors/lingo-tracker-error';

/**
 * The core Resolved Key seam: validate before combining a key and optional target folder.
 * `inputKey` retains a submitted wildcard selection when checking its key prefix.
 * Domain validation messages pass through unchanged; no filesystem access is needed.
 */
export function resolveCheckedResourceKey(key: string, targetFolder?: string, inputKey = key): string {
  try {
    validateKey(key);
    if (targetFolder) validateTargetFolder(targetFolder);
  } catch (error: unknown) {
    throw new InvalidResourceKeyError(inputKey, error instanceof Error ? error.message : String(error));
  }
  return resolveResourceKey(key, targetFolder);
}
