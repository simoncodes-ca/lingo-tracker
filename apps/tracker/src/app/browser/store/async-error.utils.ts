/**
 * Extracts a human-readable error message from an unknown thrown value.
 * If the value is an Error, its message is used; otherwise the fallback string is returned.
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
