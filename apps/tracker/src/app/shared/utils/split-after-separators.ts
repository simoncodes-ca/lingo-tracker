/** Separators after which a mono identifier may break: `.`, `_`, `-` and `/`. */
export const PATH_SEPARATORS = /(?<=[._\-/])/;

/**
 * Splits `value` after each separator so a template can emit `<wbr />` between the
 * parts (the Separator-Break Rule) and a long identifier wraps instead of clipping.
 */
export function splitAfterSeparators(value: string, separators: RegExp = PATH_SEPARATORS): readonly string[] {
  return value.length === 0 ? [] : value.split(separators);
}
