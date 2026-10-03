/** Preserve the CLI's parseInt inputs and error wording. */
export function parseMaxResults(value: string): number {
  const maxResults = parseInt(value, 10);
  if (Number.isNaN(maxResults)) {
    throw new Error(`--max-results must be a number, got "${value}"`);
  }
  return maxResults;
}
