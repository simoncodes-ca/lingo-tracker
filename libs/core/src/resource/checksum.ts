import * as crypto from 'node:crypto';

/**
 * Calculates the MD5 checksum of a string value.
 * @param value - The string value to hash
 * @returns The MD5 hex digest
 */
export function calculateChecksum(value: string): string {
  return crypto.createHash('md5').update(value).digest('hex');
}

/**
 * Verifies that a value matches its stored checksum.
 * @param value - The string value to verify
 * @param storedChecksum - The stored checksum to compare against
 * @returns true if the value's checksum matches the stored checksum
 */
export function verifyChecksum(value: string, storedChecksum: string): boolean {
  return calculateChecksum(value) === storedChecksum;
}
