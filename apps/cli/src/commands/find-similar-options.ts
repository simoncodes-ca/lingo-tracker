import { flagName } from '../runner/flag-record';
import { FIND_SIMILAR_FLAGS } from './find-similar-flags';
/** Preserve the CLI's parseInt inputs and error wording. */
export function parseMaxResults(value: string): number {
  const maxResults = parseInt(value, 10);
  if (Number.isNaN(maxResults)) {
    throw new Error(`${flagName(FIND_SIMILAR_FLAGS.maxResults)} must be a number, got "${value}"`);
  }
  return maxResults;
}
