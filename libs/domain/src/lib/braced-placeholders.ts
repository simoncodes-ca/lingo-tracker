/**
 * Braced placeholders: a Transloco interpolation inside literal braces, `{{{name}}}`.
 *
 * Outside a case body, an unquoted `{` directly before `{{name}}` and the matching `}`
 * directly after it make a brace frame around the interpolation. `translocoToICU`
 * converts the interpolation and keeps the frame, so `{{{name}}}` is stored as
 * `{{name}}`, and the next write converts that again to `{name}`. Each write changes the
 * value, so entry points reject these shapes instead.
 *
 * A case body that is only a placeholder, `other {{{name}}}`, is the bundled form
 * `icuToTransloco` emits. Its outer braces are the case body, so it is not a braced
 * placeholder.
 *
 * @module braced-placeholders
 */

import { type IcuParseOptions, type IcuRange, parseIcuMessage, visitIcuNodes } from './icu-message';

/** A Transloco interpolation wrapped in literal braces. */
export interface BracedPlaceholder {
  /** The interpolation name, `a` for `{{{a}}}`. */
  readonly name: string;
  /** The outer braces, in the raw value. */
  readonly range: IcuRange;
}

/**
 * Finds every Transloco interpolation that literal braces wrap with nothing between them,
 * as the converter reads the value. Never throws.
 *
 * @example
 * ```typescript
 * findBracedPlaceholders('x {{{a}}} y'); // → [{ name: 'a', range: { start: 2, end: 9 } }]
 * findBracedPlaceholders('{n, plural, other {{{a}}}}'); // → [] — the outer braces are the case body
 * findBracedPlaceholders("'{'{{a}}'}'"); // → [] — the braces are quoted
 * ```
 */
export function findBracedPlaceholders(value: string, options: IcuParseOptions = {}): readonly BracedPlaceholder[] {
  if (!value.includes('{{')) return [];
  const found: BracedPlaceholder[] = [];
  visitIcuNodes(parseIcuMessage(value, { ...options, interpolation: true }).nodes, (node) => {
    if (node.kind !== 'error' || !node.frame?.wrapsInterpolation) return;
    const [only] = node.nodes;
    if (only?.kind === 'argument') found.push({ name: only.name, range: node.range });
  });
  return found;
}

/**
 * The validation message for one braced placeholder: where it is, what saving does to it
 * and how to write a literal brace beside a placeholder.
 */
export function describeBracedPlaceholder(found: BracedPlaceholder): string {
  const { name } = found;
  return (
    `Placeholder {{${name}}} at position ${found.range.start} is inside literal braces. ` +
    `LingoTracker reads "{{{${name}}}}" as a placeholder and removes the braces when it saves the value. ` +
    `To show a brace next to a placeholder, quote the brace: '{'{{${name}}}'}'. ` +
    `A case body that is only a placeholder, such as other {{{${name}}}}, is correct.`
  );
}
