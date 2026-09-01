import MessageFormat from '@messageformat/core';
import { normalizeTranslocoSyntax } from './normalize-transloco-syntax';

/**
 * Per-locale ICU compilation checks.
 *
 * A stored value is only valid *relative to the locale it is stored under*.
 * Plural categories are a property of the language: `one` selects 1 in `en`,
 * 0 and 1 in `fr`, 1/21/31/… in `is`, and does not exist at all in `ja` or
 * `ko`. ICU rejects the whole message rather than the offending branch, so a
 * value carrying a category its locale does not define renders nothing at
 * runtime — regardless of whether a human marked it `verified`.
 *
 * Compiling a whole collection against a single `MessageFormat` instance
 * reports nothing. The per-locale part is the point.
 *
 * @module icu-locale-validation
 */

/**
 * Cache of `MessageFormat` instances keyed by locale.
 *
 * Construction is cheap but not free, and validation compiles every value in
 * every locale — tens of thousands of calls on a real collection.
 *
 * A cached `null` records a locale the compiler refused to construct, so the
 * failure is diagnosed once instead of on every value.
 */
const compilerCache = new Map<string, MessageFormat | null>();

/**
 * Returns the cached compiler for a locale, or `null` if the locale is unusable.
 *
 * Neither constructing a `MessageFormat` nor compiling with it validates the
 * locale tag: a malformed tag such as `fr_CA` compiles happily and only throws
 * later, from `Intl`, when a number is actually formatted. So the tag is
 * checked directly against `Intl` instead.
 */
function compilerFor(locale: string): MessageFormat | null {
  const cached = compilerCache.get(locale);
  if (cached !== undefined) return cached;

  let compiler: MessageFormat | null;
  try {
    Intl.NumberFormat.supportedLocalesOf([locale]);
    compiler = new MessageFormat(locale);
  } catch {
    compiler = null;
  }

  compilerCache.set(locale, compiler);
  return compiler;
}

/**
 * Reports whether ICU can compile messages for a locale at all.
 *
 * This is a question about configuration, not about any stored value. A locale
 * tag that is not well-formed BCP 47 — an underscore separator such as `fr_CA`
 * is the usual cause — makes every value in that locale uncheckable. Callers
 * should test the locale once and report it as a configuration problem, rather
 * than compiling every value and blaming each one in turn.
 *
 * Unknown-but-well-formed tags are accepted: ICU falls back to a default
 * plural ruleset rather than rejecting them, so `zz` is "supported" in the
 * sense that values under it can still be compiled.
 *
 * Note that compiling is not itself a test of the tag: `MessageFormat` accepts
 * any string and compiles without complaint, and a malformed tag only surfaces
 * later as an `Intl` error while formatting a number. The tag is therefore
 * checked against `Intl` directly.
 *
 * @param locale - The locale code to test (e.g. `'en'`, `'pt-BR'`).
 * @returns `true` when values stored under this locale can be compiled.
 *
 * @example
 * ```typescript
 * isIcuLocaleSupported('pt-BR');  // → true
 * isIcuLocaleSupported('fr_CA');  // → false — use 'fr-CA'
 * ```
 */
export function isIcuLocaleSupported(locale: string): boolean {
  return compilerFor(locale) !== null;
}

/**
 * Compiles a stored value under its own locale and reports why it failed.
 *
 * Transloco double-brace syntax is normalised to single-brace ICU before
 * compiling. Consumers running a Transloco-style interpolation pass substitute
 * `{{ }}` *before* ICU parses, so a branch body that is a placeholder alone is
 * correctly authored as `=1 {{{name}}}`; compiling that text directly would
 * report a correct value as broken.
 *
 * Compilation alone is a complete check: `@messageformat/core` validates
 * plural categories against the locale and requires an `other` branch up
 * front, so a message that compiles always has a branch to select for every
 * count. Invoking the compiled function adds no further signal.
 *
 * An unsupported locale yields `undefined` — see {@link isIcuLocaleSupported}.
 *
 * @param value - The stored translation value, in ICU or Transloco syntax.
 * @param locale - The locale the value is stored under.
 * @returns A single-line explanation, or `undefined` when the value compiles.
 *
 * @example
 * ```typescript
 * findIcuCompileError('{count, plural, one {1 item} other {# items}}', 'en');
 * // → undefined
 *
 * findIcuCompileError('{count, plural, one {1 item} other {# items}}', 'ja');
 * // → 'The plural case one is not valid in this locale'
 *
 * findIcuCompileError('{count, plural, other {# items}}', 'ja');
 * // → undefined
 * ```
 */
export function findIcuCompileError(value: string, locale: string): string | undefined {
  const compiler = compilerFor(locale);
  if (!compiler) return undefined;

  try {
    compiler.compile(normalizeTranslocoSyntax(value));
    return undefined;
  } catch (error) {
    return summarizeCompileError(error);
  }
}

/**
 * Reduces a compiler error to one line fit for a CI log.
 *
 * `@messageformat/core` appends a source position, a source excerpt and a
 * caret line, and for a missing `other` branch it appends the entire parsed
 * token tree as JSON. All of it is far too long to print once per failing
 * value, and the position refers to the normalised text rather than to what is
 * stored on disk, so it would mislead as often as it helped.
 *
 * @internal
 */
function summarizeCompileError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split('\n')[0]?.trim() ?? '';

  // The missing-`other` error reads `No 'other' form found in {"type":...}`;
  // cut the token tree and the dangling preposition that introduced it.
  const withoutTokenTree = firstLine.replace(/\s*in\s*\{"type":.*$/, '').replace(/\s*\{"type":.*$/, '');

  // Parse errors end with ` at line 1 col 17:` before the excerpt on later lines.
  const withoutPosition = withoutTokenTree.replace(/\s*at line \d+ col \d+:?$/, '').trim();

  return withoutPosition.length > 0 ? withoutPosition : 'Value could not be compiled as ICU';
}
