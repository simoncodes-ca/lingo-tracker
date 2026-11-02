import * as crypto from 'node:crypto';

/**
 * Calculates the MD5 checksum of a string value.
 * @param value - The string value to hash
 * @returns The MD5 hex digest
 */
export function calculateChecksum(value: string): string {
  return crypto.createHash('md5').update(value).digest('hex');
}
