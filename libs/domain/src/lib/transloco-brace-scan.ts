/**
 * Position-aware Transloco → ICU placeholder conversion.
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
 * The scanner walks the value tracking brace nesting and ICU quote state. At a run of
 * `{` followed by an identifier and two or more `}`, it decides whether the first brace
 * of the run opens a branch body, subtracts that brace, and converts only when two or
 * more braces remain.
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

/** Matches the head of an argument body that selects a sub-message, e.g. `count, plural,`. */
const SUB_MESSAGE_ARGUMENT_PATTERN = /^\s*\w+\s*,\s*(?:plural|select|selectordinal)\s*,/;

/**
 * Matches text that holds nothing but a branch selector token and whitespace.
 *
 * A `plural` argument may carry an `offset:N` clause ahead of its first selector, which
 * is argument syntax rather than branch content.
 */
const SELECTOR_ONLY_PATTERN = /^\s*(?:offset\s*:\s*\d+\s+)?(?:=\d+|\w+)\s*$/;

/** State the scanner keeps for each brace it has seen opened and not yet closed. */
interface OpenBrace {
  /** True when this brace opened a `plural` / `select` / `selectordinal` argument. */
  readonly isSubMessageArgument: boolean;
}

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
 * That is true only when the innermost open brace belongs to a `plural` / `select` /
 * `selectordinal` argument and the text back to the preceding `,`, `{` or `}` is
 * nothing but a branch selector token, optionally preceded by a `plural` `offset:N`
 * clause. Any other preceding text is branch content, so both braces of the run belong
 * to the placeholder.
 *
 * @param value - The full message string
 * @param start - Index of the first `{` of the run
 * @param openBraces - Braces opened and not yet closed at `start`
 * @returns true when the first brace of the run is structural
 * @internal
 */
function opensSubMessageBody(value: string, start: number, openBraces: OpenBrace[]): boolean {
  const innermost = openBraces[openBraces.length - 1];

  if (!innermost?.isSubMessageArgument) {
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
    openBraces.push({ isSubMessageArgument: false });
  }

  for (let n = 0; n < run.closeCount; n++) {
    openBraces.pop();
  }
}

/**
 * Converts Transloco double-brace placeholders to ICU single-brace placeholders,
 * leaving a `{{` that opens an ICU sub-message body untouched.
 *
 * Identifiers may be dotted (`{{ a.b }}`) and may carry whitespace inside the braces,
 * which is trimmed on output. A value with no `{{` is returned unchanged.
 *
 * The function never throws. Any brace run it does not recognise — an unbalanced value,
 * a non-identifier such as `{{ some text }}`, a run closed by a single `}` — is copied
 * through byte for byte. Validation is not this function's job.
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

  const openBraces: OpenBrace[] = [];
  let result = '';
  let inEscapedSection = false;
  let i = 0;

  while (i < value.length) {
    const char = value[i];

    if (char === "'") {
      // `''` is always a literal apostrophe — copy both chars, no state change
      if (value[i + 1] === "'") {
        result += "''";
        i += 2;
        continue;
      }

      if (isQuoteToggle(value, i, inEscapedSection)) {
        inEscapedSection = !inEscapedSection;
      }

      result += char;
      i++;
      continue;
    }

    // Braces inside a quoted section are literal text and change no scanner state
    if (inEscapedSection) {
      result += char;
      i++;
      continue;
    }

    if (char === '{') {
      const run = readBraceRun(value, i);
      const structuralBraces = run && opensSubMessageBody(value, i, openBraces) ? 1 : 0;

      if (run && run.openCount - structuralBraces >= 2) {
        // The innermost `{{` / `}}` pair is the placeholder; braces outside it are structure
        result += '{'.repeat(run.openCount - 2);
        result += `{${run.name}}`;
        result += '}'.repeat(run.closeCount - 2);

        applyBraceRun(openBraces, run);
        i = run.endIndex;
        continue;
      }

      openBraces.push({
        isSubMessageArgument: SUB_MESSAGE_ARGUMENT_PATTERN.test(value.substring(i + 1)),
      });
      result += char;
      i++;
      continue;
    }

    if (char === '}') {
      openBraces.pop();
      result += char;
      i++;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Transloco's own interpolation matcher: `{{`, no braces between, `}}`.
 * Sticky, so it can be anchored at a candidate `{{`.
 */
const TRANSLOCO_INTERPOLATION_PATTERN = /\{\{[^{}]*?\}\}/y;

/**
 * Reports whether a normalized ICU value carries a `plural` / `select` /
 * `selectordinal` branch body that is nothing but an argument, e.g.
 * `{nameExists, select, hasName {{name}} other {this item}}`.
 *
 * Such a value is valid ICU, but it cannot reach a Transloco runtime intact.
 * Transloco's `DefaultTranspiler` applies its own `{{…}}` interpolation *before*
 * the message is handed to the ICU compiler. It consumes `{{name}}` and leaves
 * `hasName <value> other {this item}` — a branch with no body, which is an ICU
 * syntax error in every locale. Bundling cannot encode around it either: padding
 * the body to `{ {name}}` survives both layers but adds a space to the rendered
 * text. The only fix is authoring the shared text into each branch.
 *
 * A `{{` only qualifies when it sits where a branch body begins: the innermost
 * open brace belongs to a sub-message argument and the text back to the preceding
 * `,`, `{` or `}` is nothing but a selector token. That is the same position test
 * the converter uses, so a `{{` at the top level or one that follows branch text
 * is not reported — neither shape strands a branch without a body. Braces inside
 * an ICU quoted section are literal text and are skipped as well.
 *
 * The function is a pure predicate: it never throws and never modifies the value.
 *
 * @param value - The stored translation string, already converted to ICU
 * @returns true when the value carries a branch body that is only a placeholder
 *
 * @example
 * ```typescript
 * hasPlaceholderOnlyBranchBody('{nameExists, select, hasName {{name}} other {this item}}');
 * // → true
 *
 * hasPlaceholderOnlyBranchBody('{deleteCount, plural, =1 {Delete {itemName}} other {# items}}');
 * // → false
 * ```
 */
export function hasPlaceholderOnlyBranchBody(value: string): boolean {
  if (!value.includes('{{')) {
    return false;
  }

  const openBraces: OpenBrace[] = [];
  let inEscapedSection = false;
  let i = 0;

  while (i < value.length) {
    const char = value[i];

    if (char === "'") {
      // `''` is always a literal apostrophe — skip both chars, no state change
      if (value[i + 1] === "'") {
        i += 2;
        continue;
      }

      if (isQuoteToggle(value, i, inEscapedSection)) {
        inEscapedSection = !inEscapedSection;
      }

      i++;
      continue;
    }

    // Braces inside a quoted section are literal text and change no scanner state
    if (inEscapedSection) {
      i++;
      continue;
    }

    if (char === '{') {
      TRANSLOCO_INTERPOLATION_PATTERN.lastIndex = i;

      if (TRANSLOCO_INTERPOLATION_PATTERN.test(value) && opensSubMessageBody(value, i, openBraces)) {
        return true;
      }

      openBraces.push({
        isSubMessageArgument: SUB_MESSAGE_ARGUMENT_PATTERN.test(value.substring(i + 1)),
      });
      i++;
      continue;
    }

    if (char === '}') {
      openBraces.pop();
      i++;
      continue;
    }

    i++;
  }

  return false;
}
