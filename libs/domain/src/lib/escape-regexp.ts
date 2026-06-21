/**
 * Escapes a string so it can be used literally inside a regular expression.
 * Every character with special meaning in a regex is prefixed with a backslash.
 *
 * @example
 * new RegExp(escapeRegExp('a.b(c)')) // matches the literal "a.b(c)"
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
