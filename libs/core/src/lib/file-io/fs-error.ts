/** Filesystem errors can come from another VM realm, so instanceof Error is not reliable. */
export function hasFsErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
