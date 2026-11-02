/**
 * ICU → Transloco Format Converter
 *
 * Converts ICU single-brace simple placeholder syntax to Transloco double-brace
 * interpolation syntax. This is used when exporting bundle files for consumption
 * by Angular applications using Transloco with transloco-messageformat. Values
 * pass through interpolation first, then MessageFormat ICU compilation.
 *
 * Conversion rules:
 * - Simple `{varName}` placeholders → `{{ varName }}`
 * - Complex ICU constructs (`plural`, `select`, `number`, `date`, `time`) keep their
 *   structure. Transloco can consume ICU plural/select syntax via the messageformat
 *   pipe, so these must not be double-braced.
 * - The one edit inside a complex construct is a branch body that is nothing but an
 *   argument. It gains one extra brace pair so Transloco's interpolation pass consumes
 *   the argument and leaves the branch wrapper standing.
 *
 * - Top-level quoted sections stay verbatim for MessageFormat. Outside them,
 *   doubled apostrophes collapse unless followed by another apostrophe or a complex
 *   construct. Natural apostrophes stay unchanged.
 *
 * ICU:       `Hello {name}, you have {count} items`
 * Transloco: `Hello {{ name }}, you have {{ count }} items`
 *
 * ICU plural (structure unchanged):
 *   `{count, plural, one {# item} other {# items}}`
 *
 * ICU plural with a branch body that is only an argument:
 *   `{count, plural, =1 {{itemName}} other {# items}}`
 *   → `{count, plural, =1 {{{itemName}}} other {# items}}`
 *
 * @module icu-to-transloco
 */

import {
  hasIcuQuoteOpener,
  type IcuArgument,
  type IcuGroup,
  type IcuNode,
  type IcuParseOptions,
  type IcuRange,
  icuQuotedRuns,
  parseIcuMessage,
  spliceIcu,
  visitIcuNodes,
} from './icu-message';

/**
 * Keeps ICU quoted sections for the MessageFormat pass, while making apostrophes
 * outside them readable unless collapsing would merge adjacent apostrophes or
 * quote the next ICU construct.
 */
function prepareTextSegment(text: string, beforeComplex = false, preserveDoubled = false): string {
  let result = '';
  const quoted = Array<boolean>(text.length).fill(false);
  for (const run of icuQuotedRuns(text)) quoted.fill(true, run.start, run.end);
  const besideIcuSyntax = /[{}#]/.test(text);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "'") {
      if (text[i + 1] === "'") {
        const beforeApostrophe = text[i + 2] === "'";
        const beforeComplexConstruct = i + 2 === text.length && beforeComplex;
        result +=
          preserveDoubled || quoted[i] || beforeApostrophe || beforeComplexConstruct || besideIcuSyntax ? "''" : "'";
        i++;
        continue;
      }
    }
    result += char;
  }
  return result;
}

/**
 * Converts a string from ICU single-brace placeholder syntax to Transloco
 * double-brace interpolation syntax.
 *
 * Simple `{varName}` placeholders are converted to `{{ varName }}`. Complex
 * ICU expressions (`plural`, `select`, `number`, `date`, `time`) keep their
 * structure because Transloco handles them via the messageformat integration,
 * except that a branch body which is nothing but an argument gains one extra
 * brace pair so it survives Transloco's interpolation pass.
 *
 * Top-level ICU quoted sections are preserved verbatim for transloco-messageformat.
 * Outside them, doubled apostrophes collapse, except before another apostrophe or
 * a complex construct whose opening brace remains after interpolation. Natural
 * apostrophes stay unchanged. Malformed ICU is returned unchanged.
 *
 * @param value - The translation string in ICU format
 * @returns The string with simple ICU placeholders converted to Transloco syntax
 *
 * @example
 * ```typescript
 * icuToTransloco("Hello {name}");
 * // → "Hello {{ name }}"
 *
 * icuToTransloco("{count} items selected");
 * // → "{{ count }} items selected"
 *
 * icuToTransloco("No placeholders here");
 * // → "No placeholders here"
 *
 * // Adjacent placeholders
 * icuToTransloco("{a}{b}");
 * // → "{{ a }}{{ b }}"
 *
 * // Plural passes through unchanged
 * icuToTransloco("{count, plural, one {# item} other {# items}}");
 * // → "{count, plural, one {# item} other {# items}}"
 *
 * // A branch body that is only an argument gains a brace pair
 * icuToTransloco("{count, plural, =1 {{itemName}} other {# items}}");
 * // → "{count, plural, =1 {{{itemName}}} other {# items}}"
 *
 * // Mixed: simple converted, plural preserved
 * icuToTransloco("Hello {name}: {count, plural, one {# item} other {# items}}");
 * // → "Hello {{ name }}: {count, plural, one {# item} other {# items}}"
 * ```
 *
 * @param options - Parse options; plain Transloco passes `simpleArgumentPaths` so dotted arguments convert.
 */
export function icuToTransloco(value: string, options: IcuParseOptions = {}): string {
  // Values with no `'` and no `{` need no processing at all.
  if (!value.includes('{') && !value.includes("'")) {
    return value;
  }

  const message = parseIcuMessage(value, options);
  if (!message.ok) {
    return value;
  }

  const constructs = message.nodes.filter(
    (node): node is IcuArgument | IcuGroup => node.kind === 'argument' || node.kind === 'group',
  );
  // Collapsing a pair can close an earlier unmatched apostrophe across segment boundaries.
  const preserveDoubled = hasIcuQuoteOpener(value);

  // Values with no real placeholders may still contain ICU quote escaping
  // (e.g., `"Use '{'name'}' as a key"`). Preserve its quoted sections.
  if (constructs.length === 0) {
    return prepareTextSegment(value, false, preserveDoubled);
  }

  let result = '';
  let position = 0;
  for (const node of constructs) {
    const simpleArgument = node.kind === 'argument' && node.format === undefined;
    result += prepareTextSegment(value.slice(position, node.range.start), !simpleArgument, preserveDoubled);
    // plural, select, selectordinal, number, date, time — structure passes through, but a
    // branch body that is only an argument needs the extra brace pair so Transloco's
    // interpolation consumes the argument and leaves the branch wrapper standing.
    result += simpleArgument ? `{{ ${node.name} }}` : expandPlaceholderOnlyBodies(value, node);
    position = node.range.end;
  }

  // Append the trailing text segment that follows the last placeholder
  result += prepareTextSegment(value.slice(position), false, preserveDoubled);

  return result;
}

/**
 * The text of a top-level construct, with every case body that is exactly one bare
 * argument wrapped in one extra brace pair: `=1 {{itemName}}` becomes `=1 {{{itemName}}}`.
 *
 * The value parses in strict mode, and every case selector of a strict-ok message passes
 * the converter's position rule (`isBareSelectorBefore`), so every such body is wrapped and
 * the converter reads it back as a body. Bodies with text beside the argument, nested
 * groups and formatted arguments stay as they are.
 */
function expandPlaceholderOnlyBodies(value: string, construct: IcuArgument | IcuGroup): string {
  const edits: { range: IcuRange; text: string }[] = [];
  visitIcuNodes([construct], (node) => {
    if (node.kind !== 'group') return;
    for (const branch of node.cases) {
      const [only, ...rest] = branch.nodes;
      if (
        only?.kind === 'argument' &&
        only.format === undefined &&
        rest.length === 0 &&
        only.range.start === branch.body.start &&
        only.range.end === branch.body.end
      ) {
        edits.push({ range: only.range, text: `{${value.slice(only.range.start, only.range.end)}}` });
      }
    }
  });
  const { start, end } = construct.range;
  return spliceIcu(
    value.slice(start, end),
    edits.map(({ range, text }) => ({ range: { start: range.start - start, end: range.end - start }, text })),
  );
}

/**
 * Reports whether a normalized ICU value carries a `plural`, `select` or `selectordinal`
 * branch body that no bundled form carries to a Transloco runtime. For example,
 * `{count, plural, =1 {{n, number}} other {# items}}`.
 *
 * A bundled value reaches the runtime through two passes. `DefaultTranspiler` substitutes
 * the `{{…}}` interpolations. The ICU compiler then reads the result.
 *
 * Inside a sub-message group, a branch body that is a bare argument name takes
 * the triple, `=1 {{{itemName}}}`. The interpolation matcher forbids a brace inside its
 * delimiters, so it takes the inner pair only. The outer brace stands as the branch
 * wrapper and the rendered text gains no character.
 *
 * A body has no encoding when it is exactly one brace-delimited node with no brace
 * inside, other than a bare argument: an argument carrying a format, `{{n, number}}`, or
 * a run that is no argument at all, `{{some text}}`. The interpolation pass substitutes
 * an empty string for that run and strands a branch with no body, so the ICU compiler
 * rejects the whole message. Two edits put the position out of reach of the first pass.
 * Add text beside the argument in the branch body, or move the format out of the branch.
 *
 * Case bodies are found as the converter finds them, in interpolation mode, so the
 * predicate skips a `{{` at the top level and one that follows branch text. Braces inside
 * an ICU quoted section are literal text. The function never throws.
 *
 * @param value - The stored translation string, already converted to ICU
 * @returns true when the value carries a branch body no bundled form carries
 *
 * @example
 * ```typescript
 * hasUnbundlableBranchBody('{count, plural, =1 {{n, number}} other {# items}}');
 * // → true
 *
 * hasUnbundlableBranchBody('{nameExists, select, hasName {{name}} other {this item}}');
 * // → false — the bundler encodes it as the triple
 * ```
 */
export function hasUnbundlableBranchBody(value: string, options: IcuParseOptions = {}): boolean {
  if (!value.includes('{{')) {
    return false;
  }

  let found = false;
  visitIcuNodes(parseIcuMessage(value, { ...options, interpolation: true }).nodes, (node) => {
    if (found || node.kind !== 'group') return !found;
    found = node.cases.some((branch) => {
      const [only, ...rest] = branch.nodes;
      if (!only || rest.length > 0 || only.range.start !== branch.body.start || only.range.end !== branch.body.end) {
        return false;
      }
      const bareArgument = only.kind === 'argument' && only.syntax === 'icu' && only.format === undefined;
      // Transloco's matcher, {{([^{}]*?)}}, consumes the body only when nothing inside it is a brace.
      return !bareArgument && opensWithoutInnerBrace(only);
    });
    return !found;
  });
  return found;
}

/** A construct at an unquoted `{` with no brace inside it other than its own delimiters. */
function opensWithoutInnerBrace(node: IcuNode): boolean {
  if (node.kind === 'argument' || node.kind === 'group') return !node.innerBrace;
  return node.kind === 'error' && node.cause === 'frame' && node.frame !== undefined && !node.frame.innerBrace;
}
