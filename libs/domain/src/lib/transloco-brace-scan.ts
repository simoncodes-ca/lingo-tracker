/**
 * Position-aware brace scanning across the Transloco ↔ ICU boundary.
 *
 * Transloco interpolates with `{{ name }}` while ICU Message Format uses `{name}`.
 * A context-free regex cannot tell the two apart at a sub-message boundary: when an
 * ICU `plural` / `select` / `selectordinal` branch body is exactly one argument, the
 * branch's opening brace and the argument's opening brace sit next to each other and
 * look like a Transloco placeholder.
 *
 * ```
 * This will delete {nameExists, select, hasName {{name}} other {this item}}.
 *                                               ^^
 *                                               branch open + argument open
 * ```
 *
 * Every function here resolves that ambiguity the same way. It walks the value and tracks
 * brace nesting and ICU quote state. At each `{{` it then knows whether the first brace
 * opens a branch body.
 *
 * - `convertTranslocoPlaceholders`, the converter, runs inbound on a value being stored.
 *   It rewrites `{{ name }}` to `{name}` and leaves a `{{` that opens a branch body alone.
 * - `expandPlaceholderOnlyBranchBodies`, the expander, runs outbound on a value being
 *   bundled. It wraps a branch body that is nothing but an argument in one extra brace
 *   pair. The interpolation pass in Transloco then consumes the argument and leaves the
 *   branch wrapper standing.
 * - `hasUnbundlableBranchBody`, the detector, is a predicate over a stored value. It
 *   reports a branch body that no bundled form carries to a Transloco runtime.
 *
 * @module transloco-brace-scan
 */

import { isQuoteToggle } from './icu-auto-fixer';

/**
 * Matches a run of `{`, an identifier (optionally dotted), and a run of two or more `}`.
 * Sticky, so it can be anchored at the first brace of a candidate run.
 *
 * Group 1 is the opening run, group 2 the identifier, group 3 the closing run.
 */
const BRACE_RUN_PATTERN = /(\{+)\s*(\w+(?:\.\w+)*)\s*(\}\}+)/y;

/** The keyword an ICU argument uses to select a sub-message. */
type SubMessageKeyword = 'plural' | 'select' | 'selectordinal';

/**
 * Matches the head of an argument body that selects a sub-message, e.g. `count, plural,`.
 * Sticky, so it can be anchored just past the `{` that opened the body.
 *
 * Group 1 is the sub-message keyword.
 */
const SUB_MESSAGE_ARGUMENT_PATTERN = /\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/y;

/**
 * Reads the sub-message keyword of the argument body starting at `start`.
 *
 * @param value - The full message string
 * @param start - Index just past the `{` that opened the body
 * @returns The keyword, or null when the text at `start` is not a sub-message argument head
 * @internal
 */
function readSubMessageKeyword(value: string, start: number): SubMessageKeyword | null {
  // Anchored rather than run over `value.substring(start)`, which would copy the rest of
  // the string at every `{`.
  SUB_MESSAGE_ARGUMENT_PATTERN.lastIndex = start;
  const match = SUB_MESSAGE_ARGUMENT_PATTERN.exec(value);

  // The alternation admits the three keywords and nothing else, so group 1 is one of them.
  return match === null ? null : (match[1] as SubMessageKeyword);
}

/**
 * Matches text that holds nothing but a branch selector token and whitespace.
 *
 * A `plural` argument can carry an `offset:N` clause ahead of its first selector. That
 * clause is argument syntax, not branch content.
 */
const SELECTOR_ONLY_PATTERN = /^\s*(?:offset\s*:\s*\d+\s+)?(?:=\d+|\w+)\s*$/;

/**
 * State the scanner keeps for each brace it has opened and not yet closed. The value is
 * the keyword of the sub-message argument that brace opened. It is null when the brace
 * opened anything else.
 */
type OpenBrace = SubMessageKeyword | null;

/** A run of opening braces, an identifier, and a run of closing braces. */
interface BraceRun {
  /** Number of consecutive `{` at the start of the run. */
  readonly openCount: number;
  /** Number of consecutive `}` that close the run (always two or more). */
  readonly closeCount: number;
  /** The identifier between the brace runs, with surrounding whitespace trimmed. */
  readonly name: string;
  /** Index just past the last `}` of the run. */
  readonly endIndex: number;
}

/**
 * Reads a convertible brace run starting at `start`.
 *
 * @param value - The full message string
 * @param start - Index of the first `{` of the run
 * @returns The run, or null when the text at `start` is not a run of two or more `{`
 *          around a single identifier closed by two or more `}`
 * @internal
 */
function readBraceRun(value: string, start: number): BraceRun | null {
  BRACE_RUN_PATTERN.lastIndex = start;
  const match = BRACE_RUN_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const openCount = match[1].length;

  // A single `{` is a plain ICU argument, never a Transloco placeholder
  if (openCount < 2) {
    return null;
  }

  return {
    openCount,
    closeCount: match[3].length,
    name: match[2],
    endIndex: start + match[0].length,
  };
}

/**
 * Decides whether the first brace of the run at `start` opens an ICU sub-message body.
 *
 * That is true only when both of these hold:
 *
 * - The innermost open brace belongs to a `plural`, `select` or `selectordinal` argument.
 * - The text back to the preceding `,`, `{` or `}` holds nothing but a branch selector
 *   token. A `plural` `offset:N` clause can come before that token.
 *
 * Any other preceding text is branch content, so both braces of the run belong to the
 * placeholder.
 *
 * @param value - The full message string
 * @param start - Index of the first `{` of the run
 * @param openBraces - Braces opened and not yet closed at `start`
 * @returns true when the first brace of the run is structural
 * @internal
 */
function opensSubMessageBody(value: string, start: number, openBraces: OpenBrace[]): boolean {
  if (!openBraces[openBraces.length - 1]) {
    return false;
  }

  let boundary = start - 1;
  while (boundary >= 0 && value[boundary] !== ',' && value[boundary] !== '{' && value[boundary] !== '}') {
    boundary--;
  }

  return SELECTOR_ONLY_PATTERN.test(value.substring(boundary + 1, start));
}

/**
 * Applies the brace bookkeeping for a run that was consumed in a single step.
 *
 * None of a run's braces can open a sub-message argument: each is followed either by
 * another `{` or by the run's identifier, and neither can carry the `name, plural,`
 * head that marks a sub-message.
 *
 * @param openBraces - The scanner's brace stack, mutated in place
 * @param run - The run that was consumed
 * @internal
 */
function applyBraceRun(openBraces: OpenBrace[], run: BraceRun): void {
  for (let n = 0; n < run.openCount; n++) {
    openBraces.push(null);
  }

  for (let n = 0; n < run.closeCount; n++) {
    openBraces.pop();
  }
}

/** Ends the walk without consuming the brace - how a predicate reports a hit. @internal */
const STOP_WALK = 'stop-walk';

/**
 * What a caller does with the `{` the walker stopped on. It replaces `length` characters
 * of input with `text`. It returns `STOP_WALK` to end the walk where it stands.
 * @internal
 */
type BraceAction = typeof STOP_WALK | { readonly text: string; readonly length: number };

/** What a walk produced. @internal */
interface ScanResult {
  /** The rewritten value, or `''` when the walk was asked not to collect text. */
  readonly text: string;
  /** Whether a `BraceAction` ended the walk early. */
  readonly stopped: boolean;
}

/**
 * Walks a value left to right, tracking ICU quote state and brace nesting, and hands
 * each unquoted `{` to `onOpenBrace`.
 *
 * This is the one place that holds the scan. Every exported function in this module
 * supplies only its `{` decision. Quote handling, the brace stack, and the copy of
 * everything else are shared, so the three cannot drift apart.
 *
 * A `{` the caller declines goes onto the stack with the sub-message keyword of the
 * argument body it opens, then gets copied through. A `}` pops. `onOpenBrace` receives
 * the stack by reference. The walker skips a consumed run without reading its braces. A
 * caller whose run holds an unequal number of `{` and `}` must do its own bookkeeping.
 *
 * @param value - The full message string
 * @param collectText - Whether to build the rewritten value. A predicate passes false to
 *                      skip the copy it never reads
 * @param onOpenBrace - Called at each unquoted `{`, with the index of that brace and the
 *                      braces open before it. Returns null to decline the position. A
 *                      consumed run must report a `length` of at least one, or the walk
 *                      cannot advance.
 * @returns The rewritten value and whether the walk stopped early
 * @internal
 */
function scanIcuBraces(
  value: string,
  collectText: boolean,
  onOpenBrace: (start: number, openBraces: OpenBrace[]) => BraceAction | null,
): ScanResult {
  const openBraces: OpenBrace[] = [];
  let text = '';
  let inEscapedSection = false;
  let i = 0;

  while (i < value.length) {
    const char = value[i];

    if (char === "'") {
      // `''` is always a literal apostrophe — copy both chars, no state change
      if (value[i + 1] === "'") {
        if (collectText) {
          text += "''";
        }
        i += 2;
        continue;
      }

      if (isQuoteToggle(value, i, inEscapedSection)) {
        inEscapedSection = !inEscapedSection;
      }

      if (collectText) {
        text += char;
      }
      i++;
      continue;
    }

    // Braces inside a quoted section are literal text and change no scanner state
    if (inEscapedSection) {
      if (collectText) {
        text += char;
      }
      i++;
      continue;
    }

    if (char === '{') {
      const action = onOpenBrace(i, openBraces);

      if (action === STOP_WALK) {
        return { text, stopped: true };
      }

      if (action) {
        if (collectText) {
          text += action.text;
        }
        i += action.length;
        continue;
      }

      openBraces.push(readSubMessageKeyword(value, i + 1));
    }

    if (char === '}') {
      openBraces.pop();
    }

    if (collectText) {
      text += char;
    }
    i++;
  }

  return { text, stopped: false };
}

/**
 * Converts Transloco double-brace placeholders to ICU single-brace placeholders,
 * leaving a `{{` that opens an ICU sub-message body untouched.
 *
 * An identifier can be dotted (`{{ a.b }}`) and can carry whitespace inside the braces.
 * The function trims that whitespace on output. A value with no `{{` comes back unchanged.
 *
 * The function never throws. It copies through byte for byte any brace run it does not
 * recognize. Three examples: an unbalanced value, a non-identifier such as
 * `{{ some text }}`, and a run closed by a single `}`. Validation is not its job.
 *
 * Applying the function to its own output produces the same string, so repeated
 * normalization of a stored tree converts nothing further.
 *
 * @param value - The translation string, potentially using Transloco syntax
 * @returns The string with genuine `{{ name }}` placeholders replaced by `{name}`
 *
 * @example
 * ```typescript
 * convertTranslocoPlaceholders('Hello {{ name }}');
 * // → 'Hello {name}'
 *
 * convertTranslocoPlaceholders('{deleteCount, plural, =1 {Delete {{itemName}}} other {Delete # items}}');
 * // → '{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}'
 *
 * convertTranslocoPlaceholders('{itemCount, plural, =1 {{{itemName}}} other {# items}}');
 * // → '{itemCount, plural, =1 {{itemName}} other {# items}}'
 *
 * convertTranslocoPlaceholders('{nameExists, select, hasName {{name}} other {this item}}');
 * // → unchanged — the first brace opens the `hasName` branch body
 * ```
 */
export function convertTranslocoPlaceholders(value: string): string {
  if (!value.includes('{{')) {
    return value;
  }

  return scanIcuBraces(value, true, (start, openBraces) => {
    const run = readBraceRun(value, start);
    const structuralBraces = run && opensSubMessageBody(value, start, openBraces) ? 1 : 0;

    if (!run || run.openCount - structuralBraces < 2) {
      return null;
    }

    // A run's open and close counts can differ, so the stack needs its own bookkeeping
    applyBraceRun(openBraces, run);

    // The innermost `{{` / `}}` pair is the placeholder. Braces outside it are structure
    return {
      text: `${'{'.repeat(run.openCount - 2)}{${run.name}}${'}'.repeat(run.closeCount - 2)}`,
      length: run.endIndex - start,
    };
  }).text;
}

/**
 * Transloco's own interpolation matcher: `{{`, no braces between, `}}`.
 * Sticky, so it can be anchored at a candidate `{{`.
 */
const TRANSLOCO_INTERPOLATION_PATTERN = /\{\{[^{}]*?\}\}/y;

/**
 * A branch body that is exactly one bare argument: `{{name}}` or `{{ a.b }}`.
 *
 * Sticky, so it can be anchored at a candidate `{`. The required `\s*\w` after the two
 * braces stops it from starting on a run of three. `\w` also excludes the comma of
 * `{{count, number}}`, so it does not match an argument carrying a format. It is strictly
 * narrower than `TRANSLOCO_INTERPOLATION_PATTERN`.
 */
const PLACEHOLDER_ONLY_BODY_PATTERN = /\{\{\s*\w+(?:\.\w+)*\s*\}\}/y;

/**
 * Reports whether a normalized ICU value carries a `plural`, `select` or `selectordinal`
 * branch body that no bundled form carries to a Transloco runtime. For example,
 * `{count, plural, =1 {{n, number}} other {# items}}`.
 *
 * A bundled value reaches the runtime through two passes. `DefaultTranspiler` substitutes
 * the `{{…}}` interpolations. The ICU compiler then reads the result.
 *
 * Inside a `plural` or `select` group, a branch body that is a bare argument name takes
 * the triple, `=1 {{{itemName}}}`. The interpolation matcher forbids a brace inside its
 * delimiters, so it takes the inner pair only. The outer brace stands as the branch
 * wrapper and the rendered text gains no character. Padding the body to
 * `=1 { {itemName}}` also survives both passes, but it adds a space to every rendered
 * string, so the encoding is the brace pair.
 *
 * Three shapes have no encoding. The predicate reports all three:
 *
 * - A branch body whose `{{…}}` run carries a format, `{{n, number}}`.
 * - A branch body whose `{{…}}` run is no parameter name, `{{some text}}`.
 * - Any branch body of a `selectordinal` group.
 *
 * On the first two, the interpolation pass substitutes an empty string for the run and
 * strands a branch with no body. The ICU compiler rejects the whole message, so the value
 * renders in no locale. Two edits put the position out of reach of the first pass. Add
 * text beside the argument in the branch body, or move the format out of the branch.
 *
 * On the third, `icuToTransloco` reads the group as a plain argument and emits one
 * interpolation, `{{ rank }}`. The expander runs over no part of it, so no branch reaches
 * the runtime.
 *
 * A `{{` qualifies only where a branch body begins. The innermost open brace belongs to a
 * sub-message argument. The text back to the preceding `,`, `{` or `}` holds nothing but
 * a selector token.
 *
 * The converter and the expander use that same position test. As a result, the predicate
 * skips a `{{` at the top level and one that follows branch text. Neither shape strands a
 * branch without a body. Braces inside an ICU quoted section are literal text, and the
 * walk skips those too.
 *
 * The function is a pure predicate. It never throws and never modifies the value.
 *
 * @param value - The stored translation string, already converted to ICU
 * @returns true when the value carries a branch body no bundled form carries
 *
 * @example
 * ```typescript
 * hasUnbundlableBranchBody('{count, plural, =1 {{n, number}} other {# items}}');
 * // → true
 *
 * hasUnbundlableBranchBody('{rank, selectordinal, one {{itemName}} other {#th}}');
 * // → true — the expander runs over no `selectordinal` group
 *
 * hasUnbundlableBranchBody('{nameExists, select, hasName {{name}} other {this item}}');
 * // → false — `expandPlaceholderOnlyBranchBodies` encodes it as the triple
 * ```
 */
export function hasUnbundlableBranchBody(value: string): boolean {
  if (!value.includes('{{')) {
    return false;
  }

  return scanIcuBraces(value, false, (start, openBraces) => {
    // Both patterns are sticky, so each is anchored immediately before its own test.
    TRANSLOCO_INTERPOLATION_PATTERN.lastIndex = start;
    const consumedByInterpolation = TRANSLOCO_INTERPOLATION_PATTERN.test(value);
    PLACEHOLDER_ONLY_BODY_PATTERN.lastIndex = start;
    const isBareArgument = PLACEHOLDER_ONLY_BODY_PATTERN.test(value);
    // `icuToTransloco` emits a `selectordinal` group as one interpolation and never
    // expands it, so no branch body of one gets wrapped, bare argument or not.
    const enclosingKeyword = openBraces[openBraces.length - 1];
    const carriedByExpansion = isBareArgument && enclosingKeyword !== 'selectordinal';

    if (consumedByInterpolation && !carriedByExpansion && opensSubMessageBody(value, start, openBraces)) {
      return STOP_WALK;
    }

    return null;
  }).stopped;
}

/**
 * Wraps every `plural`, `select` or `selectordinal` branch body that is nothing but an
 * argument in one extra brace pair, turning `=1 {{itemName}}` into `=1 {{{itemName}}}`.
 *
 * A bundled value reaches a Transloco consumer through two passes. `DefaultTranspiler`
 * substitutes the `{{…}}` interpolations. The ICU compiler then reads the result.
 *
 * On the single-brace form, the first pass consumes the opening brace of the branch
 * along with the argument. That strands a branch with no body, and the ICU compiler
 * rejects the whole message. The interpolation matcher forbids a brace inside the
 * delimiters, so on the triple it matches the inner pair only. The outer brace survives
 * as the branch wrapper, and the rendered text gains no character.
 *
 * A `{{` qualifies only where a branch body begins. The innermost open brace belongs to
 * a sub-message argument. The text back to the preceding `,`, `{` or `}` holds nothing
 * but a selector token. The converter and the detector use that same position test.
 *
 * Four shapes stay untouched:
 *
 * - A branch body carrying text beside the argument.
 * - A nested group.
 * - An argument with a format.
 * - Any `{{` at the top level or inside an ICU quoted section.
 *
 * Nested positions need no recursion. The walk over the whole value descends into inner
 * groups on its own. The function never throws, and it returns the value unchanged when
 * nothing qualifies.
 *
 * It is total but it does not preserve brace balance. The walk never tests balance, so
 * an unbalanced value whose text still qualifies at a position gains the extra pair like
 * any other. `'{c, plural, one {{name}}'` becomes `'{c, plural, one {{{name}}}'`. A
 * caller that needs a balanced result must validate the value first.
 *
 * @param value - The stored translation string, already converted to ICU
 * @returns The value with each qualifying branch body wrapped in one extra brace pair
 *
 * @example
 * ```typescript
 * expandPlaceholderOnlyBranchBodies('Cannot delete {itemCount, plural, =1 {{itemName}} other {items}}');
 * // → 'Cannot delete {itemCount, plural, =1 {{{itemName}}} other {items}}'
 *
 * expandPlaceholderOnlyBranchBodies('{deleteCount, plural, =1 {Delete {itemName}} other {# items}}');
 * // → unchanged — the branch body carries text beside the argument
 * ```
 */
export function expandPlaceholderOnlyBranchBodies(value: string): string {
  if (!value.includes('{{')) {
    return value;
  }

  return scanIcuBraces(value, true, (start, openBraces) => {
    PLACEHOLDER_ONLY_BODY_PATTERN.lastIndex = start;
    const match = PLACEHOLDER_ONLY_BODY_PATTERN.exec(value);

    if (!match || !opensSubMessageBody(value, start, openBraces)) {
      return null;
    }

    // Leaving the stack alone is what makes a second pass a no-op. On the emitted
    // `{{{name}}}` the pattern fails at the outer brace. That brace goes on the stack as a
    // non-sub-message brace, and the position test then rejects the inner pair. The
    // skipped run holds as many `}` as `{`, so the stack stays correct with no bookkeeping.
    return { text: `{${match[0]}}`, length: match[0].length };
  }).text;
}
