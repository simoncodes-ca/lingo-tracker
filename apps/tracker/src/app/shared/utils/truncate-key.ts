import { folderPathSegments } from '@simoncodes-ca/domain';

const MAXIMUM_LENGTH = 50;

/**
 * Shortens a dot-delimited resource key by dropping its middle segments, keeping
 * the first segment and the last one or two so both ends stay recognizable.
 * The full key is never discarded by callers — it is surfaced on hover and to
 * assistive technology — so this is a display-only shortening.
 */
export function truncateKey(key: string): string {
  if (!key || key.length < MAXIMUM_LENGTH) {
    return key;
  }

  const segments = folderPathSegments(key);

  if (segments.length === 1) {
    return key;
  }

  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];
  const basicTruncation = `${firstSegment}...${lastSegment}`;

  if (basicTruncation.length >= MAXIMUM_LENGTH) {
    return basicTruncation;
  }

  if (segments.length >= 3) {
    const secondToLastSegment = segments[segments.length - 2];
    const extendedTruncation = `${firstSegment}...${secondToLastSegment}.${lastSegment}`;

    if (extendedTruncation.length < MAXIMUM_LENGTH) {
      return extendedTruncation;
    }
  }

  return basicTruncation;
}
