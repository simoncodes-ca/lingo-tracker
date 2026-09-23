import { parse, type Token } from '@messageformat/parser';
import { escapeRegExp } from './escape-regexp';
import { maskTranslocoPlaceholders } from './transloco-brace-scan';

/**
 * Preferred terminology: a curated list of discouraged source-language terms, each
 * mapped to the term the product now uses instead.
 *
 * A finding is advice, never an error. An older term can still be right in a quotation
 * or a historical note, so everything here reports and suggests; nothing here rejects a
 * value. The only hard failures are in the rule list itself.
 *
 * Matching is case-insensitive and whole-word. Letters, digits and `_` are word
 * characters; everything else, including `-` and `'`, is a boundary. So `Expenditure`
 * matches `capital expenditure` and `expenditure-report` but not `Expenditures`,
 * `ExpenditureType` or `expenditure_id`.
 *
 * Only text a reader sees is scanned: ICU literal content, outside argument names,
 * formats, selectors, `#`, Transloco placeholders and HTML/XML tags.
 *
 * @module preferred-terminology
 */

/** One mapping from a discouraged term to its preferred replacement. */
export interface PreferredTermRule {
  discouraged: string;
  preferred: string;
  reason?: string;
}

/** A defect in one row of a submitted rule list. */
export interface PreferredTermRuleError {
  /** Row in the submitted list. */
  index: number;
  field: 'discouraged' | 'preferred' | 'reason' | 'rule';
  code:
    | 'empty'
    | 'invalid-character'
    | 'self-mapping'
    | 'duplicate'
    | 'chain'
    | 'contains-discouraged'
    | 'cycle'
    | 'invalid-type';
  message: string;
}

/** A half-open span `[start, end)` of UTF-16 code units in a raw value. */
export interface PreferredTermRange {
  start: number;
  end: number;
}

/** Every occurrence of one rule's discouraged term in a value. */
export interface PreferredTermFinding {
  rule: PreferredTermRule;
  /** Spans in the raw value, used by replacement and highlighting. */
  ranges: ReadonlyArray<PreferredTermRange>;
}

/**
 * Trims every field and drops a `reason` that is empty after trimming.
 *
 * Does not dedupe or validate; run `validatePreferredTermRules` for that.
 *
 * @example
 * ```typescript
 * normalizePreferredTermRules([{ discouraged: ' Expenditure ', preferred: 'Investment', reason: '  ' }]);
 * // → [{ discouraged: 'Expenditure', preferred: 'Investment' }]
 * ```
 */
export function normalizePreferredTermRules(rules: readonly PreferredTermRule[]): PreferredTermRule[] {
  return rules.map((rule) => {
    const normalized: PreferredTermRule = {
      discouraged: rule.discouraged.trim(),
      preferred: rule.preferred.trim(),
    };
    const reason = rule.reason?.trim();
    if (reason) {
      normalized.reason = reason;
    }
    return normalized;
  });
}

/** Characters a term may not contain: ICU syntax and tag delimiters. */
const INVALID_TERM_CHARACTERS = /[{}<>]/;

/** A row that passed the shape checks, reduced to what the cross-row checks compare. */
interface CheckedRow {
  index: number;
  discouraged: string;
  preferred: string;
}

/**
 * Validates a submitted rule list, returning one entry per defect (empty when valid).
 *
 * Accepts `unknown` rows so the API and the file reader share one shape check: a row
 * that is not an object, or a field that is not a string, is reported as `invalid-type`
 * rather than thrown. Terms are compared after trimming and case-insensitively, so
 * `Email → email` is a self-mapping.
 *
 * Codes, per row:
 *
 * - `invalid-type` — the row is not an object, or a field is not a string.
 * - `empty` — `discouraged` or `preferred` is blank.
 * - `invalid-character` — `discouraged` or `preferred` contains `{`, `}`, `<` or `>`.
 *   ICU syntax and tags are masked from visible text, so such a discouraged term can
 *   never match, and such a preferred term would corrupt the message when applied.
 * - `duplicate` — `discouraged` repeats an earlier row's (reported on the later row).
 * - `self-mapping` — `preferred` equals the row's own `discouraged`.
 * - `cycle` — following preferred → discouraged from this row leads back to it.
 * - `chain` — `preferred` equals another row's `discouraged`.
 * - `contains-discouraged` — `preferred` contains a discouraged term, its own included,
 *   as a whole word, so applying the suggestion would itself be flagged.
 *
 * At most one error is reported per field; for `preferred` the order above is the
 * priority.
 */
export function validatePreferredTermRules(rules: readonly unknown[]): PreferredTermRuleError[] {
  const errors: PreferredTermRuleError[] = [];
  const rows: CheckedRow[] = [];

  rules.forEach((rule, index) => {
    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
      errors.push({ index, field: 'rule', code: 'invalid-type', message: 'Rule must be an object.' });
      return;
    }

    const { discouraged, preferred, reason } = rule as Record<string, unknown>;
    let shapeOk = true;

    for (const [field, fieldValue] of [
      ['discouraged', discouraged],
      ['preferred', preferred],
    ] as const) {
      if (typeof fieldValue !== 'string') {
        errors.push({ index, field, code: 'invalid-type', message: `${label(field)} must be a string.` });
        shapeOk = false;
      } else if (fieldValue.trim().length === 0) {
        errors.push({ index, field, code: 'empty', message: `${label(field)} is required.` });
        shapeOk = false;
      } else if (INVALID_TERM_CHARACTERS.test(fieldValue)) {
        errors.push({
          index,
          field,
          code: 'invalid-character',
          message: `${label(field)} cannot contain "{", "}", "<" or ">".`,
        });
        shapeOk = false;
      }
    }

    if (reason !== undefined && typeof reason !== 'string') {
      errors.push({ index, field: 'reason', code: 'invalid-type', message: 'Reason must be a string.' });
    }

    if (shapeOk && typeof discouraged === 'string' && typeof preferred === 'string') {
      rows.push({ index, discouraged: discouraged.trim(), preferred: preferred.trim() });
    }
  });

  // First row per case-folded discouraged term; later rows are duplicates.
  const byDiscouraged = new Map<string, CheckedRow>();
  for (const row of rows) {
    const key = fold(row.discouraged);
    const first = byDiscouraged.get(key);
    if (first) {
      errors.push({
        index: row.index,
        field: 'discouraged',
        code: 'duplicate',
        message: `"${row.discouraged}" is already listed (row ${first.index + 1}).`,
      });
    } else {
      byDiscouraged.set(key, row);
    }
  }

  const discouragedRegexes = [...byDiscouraged.values()].map((row) => ({
    term: row.discouraged,
    regex: buildPreferredTermRegex(row.discouraged),
  }));

  for (const row of rows) {
    const error = checkPreferred(row, byDiscouraged, discouragedRegexes);
    if (error) {
      errors.push(error);
    }
  }

  return errors.sort((a, b) => a.index - b.index);
}

/** Runs the `preferred` checks for one row, returning the highest-priority failure. */
function checkPreferred(
  row: CheckedRow,
  byDiscouraged: ReadonlyMap<string, CheckedRow>,
  discouragedRegexes: ReadonlyArray<{ term: string; regex: RegExp }>,
): PreferredTermRuleError | undefined {
  const { index, discouraged, preferred } = row;

  if (fold(preferred) === fold(discouraged)) {
    return {
      index,
      field: 'preferred',
      code: 'self-mapping',
      message: `Preferred term must differ from the discouraged term "${discouraged}".`,
    };
  }

  const target = byDiscouraged.get(fold(preferred));
  if (target) {
    if (leadsBackTo(row, byDiscouraged)) {
      return {
        index,
        field: 'preferred',
        code: 'cycle',
        message: `"${discouraged}" → "${preferred}" forms a cycle that leads back to "${discouraged}".`,
      };
    }
    return {
      index,
      field: 'preferred',
      code: 'chain',
      message: `"${preferred}" is itself discouraged (row ${target.index + 1}); map "${discouraged}" to its final preferred term instead.`,
    };
  }

  for (const { term, regex } of discouragedRegexes) {
    regex.lastIndex = 0;
    if (regex.test(preferred)) {
      return {
        index,
        field: 'preferred',
        code: 'contains-discouraged',
        message: `"${preferred}" contains the discouraged term "${term}".`,
      };
    }
  }

  return undefined;
}

/** Whether following preferred → discouraged links from `start` returns to `start`. */
function leadsBackTo(start: CheckedRow, byDiscouraged: ReadonlyMap<string, CheckedRow>): boolean {
  const visited = new Set<CheckedRow>();
  let current = byDiscouraged.get(fold(start.preferred));
  while (current && !visited.has(current)) {
    if (fold(current.discouraged) === fold(start.discouraged)) {
      return true;
    }
    visited.add(current);
    current = byDiscouraged.get(fold(current.preferred));
  }
  return false;
}

function label(field: 'discouraged' | 'preferred'): string {
  return field === 'discouraged' ? 'Discouraged term' : 'Preferred term';
}

function fold(term: string): string {
  return term.toLowerCase();
}

/**
 * Returns a copy sorted by `discouraged`, case-insensitively, the order the rule file is
 * written in. Ties keep their input order.
 */
export function sortPreferredTermRules(rules: readonly PreferredTermRule[]): PreferredTermRule[] {
  return [...rules].sort((a, b) => a.discouraged.localeCompare(b.discouraged, 'en', { sensitivity: 'accent' }));
}

/**
 * Builds the whole-word, case-insensitive regex for a term. Letters, digits and `_` are
 * word characters; anything else is a boundary.
 */
function buildPreferredTermRegex(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(term)}(?![\\p{L}\\p{N}_])`, 'giu');
}

/**
 * HTML/XML tags (attributes included) and comments. A tag name starts with a letter in
 * any script, `_` or `:`, so `a < b` and `5 <3` stay text. Quoted attribute values are
 * scanned through their closing quote, so a `>` inside one does not end the tag. No part
 * of a tag, quoted values included, may contain `<`, so an unclosed tag or quote never
 * swallows the markup after it.
 */
const TAG_PATTERN = /<!--[\s\S]*?-->|<\/?[\p{L}_:][^<>"']*(?:(?:"[^"<]*"|'[^'<]*')[^<>"']*)*>/gu;

/**
 * Returns the spans of `value` a reader sees, as offsets into the raw value, sorted and
 * non-overlapping.
 *
 * Visible means ICU literal content. Argument names, formats and styles, select and
 * plural selectors, and `#` are excluded; plural/select branch text is included.
 * Transloco `{{ name }}` placeholders are excluded. Whole HTML/XML tags, attributes
 * included, are excluded, while the text between tags is kept.
 *
 * When the value does not parse as ICU, every `{…}` span (nested braces included; an
 * unclosed `{` runs to the end) and every tag is masked and the rest is visible.
 *
 * Approximation: ranges cover the raw source text of each literal, so ICU quoting is not
 * unescaped. `It''s` stays two apostrophes wide, and a quoted literal such as `'{x}'`
 * is visible including its quotes and braces. A term containing an apostrophe
 * therefore will not match a doubled `''` in the source.
 *
 * @example
 * ```typescript
 * extractVisibleTextRanges('Hi {name}, <b>welcome</b>');
 * // → [{ start: 0, end: 3 }, { start: 9, end: 11 }, { start: 14, end: 21 }]
 * ```
 */
export function extractVisibleTextRanges(value: string): PreferredTermRange[] {
  let candidates: PreferredTermRange[];
  try {
    candidates = [];
    collectContentRanges(parse(maskTranslocoPlaceholders(value)), candidates);
  } catch {
    candidates = braceFreeRanges(value);
  }

  return subtractRanges(candidates, tagRanges(value));
}

/** Adds the raw span of every literal content token, descending into branch bodies. */
function collectContentRanges(tokens: readonly Token[], out: PreferredTermRange[]): void {
  for (const token of tokens) {
    switch (token.type) {
      case 'content':
        if (token.ctx) {
          out.push({ start: token.ctx.offset, end: token.ctx.offset + token.ctx.text.length });
        }
        break;

      // Argument names, formats and their style params, and `#` are never visible text.
      case 'argument':
      case 'function':
      case 'octothorpe':
        break;

      default:
        for (const branch of token.cases) {
          collectContentRanges(branch.tokens, out);
        }
        break;
    }
  }
}

/** Fallback for unparseable values: everything outside `{…}` spans. */
function braceFreeRanges(value: string): PreferredTermRange[] {
  const ranges: PreferredTermRange[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '{') {
      if (depth === 0 && i > start) {
        ranges.push({ start, end: i });
      }
      depth++;
    } else if (char === '}') {
      if (depth === 0) {
        // A stray `}` is masked on its own.
        if (i > start) {
          ranges.push({ start, end: i });
        }
        start = i + 1;
      } else {
        depth--;
        if (depth === 0) {
          start = i + 1;
        }
      }
    }
  }
  if (depth === 0 && start < value.length) {
    ranges.push({ start, end: value.length });
  }
  return ranges;
}

function tagRanges(value: string): PreferredTermRange[] {
  return [...value.matchAll(TAG_PATTERN)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Removes every masked span from the candidates, merging adjacent results. */
function subtractRanges(
  candidates: readonly PreferredTermRange[],
  masks: readonly PreferredTermRange[],
): PreferredTermRange[] {
  const result: PreferredTermRange[] = [];
  const sorted = [...candidates].sort((a, b) => a.start - b.start);

  for (const candidate of sorted) {
    let pieces: PreferredTermRange[] = [candidate];
    for (const mask of masks) {
      pieces = pieces.flatMap((piece) => {
        if (mask.end <= piece.start || mask.start >= piece.end) {
          return [piece];
        }
        const kept: PreferredTermRange[] = [];
        if (mask.start > piece.start) kept.push({ start: piece.start, end: mask.start });
        if (mask.end < piece.end) kept.push({ start: mask.end, end: piece.end });
        return kept;
      });
    }

    for (const piece of pieces) {
      const last = result[result.length - 1];
      if (last && last.end >= piece.start) {
        last.end = Math.max(last.end, piece.end);
      } else if (piece.end > piece.start) {
        result.push({ ...piece });
      }
    }
  }

  return result;
}

/**
 * Finds the rules whose discouraged term appears in the visible text of `value`.
 *
 * Returns at most one finding per rule, in rule order, each carrying every matching
 * range. A match counts only when it lies entirely within one visible range. Rules with
 * a blank discouraged term are ignored.
 *
 * @example
 * ```typescript
 * findPreferredTermFindings('Capital expenditure', [{ discouraged: 'Expenditure', preferred: 'Investment' }]);
 * // → [{ rule, ranges: [{ start: 8, end: 19 }] }]
 * ```
 */
export function findPreferredTermFindings(value: string, rules: readonly PreferredTermRule[]): PreferredTermFinding[] {
  const findings: PreferredTermFinding[] = [];
  if (rules.length === 0 || value.length === 0) {
    return findings;
  }

  const visible = extractVisibleTextRanges(value);
  if (visible.length === 0) {
    return findings;
  }

  for (const rule of rules) {
    const term = rule.discouraged.trim();
    if (term.length === 0) {
      continue;
    }

    const ranges: PreferredTermRange[] = [];
    for (const match of value.matchAll(buildPreferredTermRegex(term))) {
      const start = match.index;
      const end = start + match[0].length;
      if (visible.some((range) => range.start <= start && end <= range.end)) {
        ranges.push({ start, end });
      }
    }

    if (ranges.length > 0) {
      findings.push({ rule, ranges });
    }
  }

  return findings;
}

/**
 * Replaces every visible occurrence of the rule's discouraged term with `rule.preferred`.
 * Arguments, placeholders and tags are never touched. Returns `value` unchanged when
 * nothing matches.
 *
 * The preferred term is inserted verbatim, except inside plural/selectordinal branch text
 * (a `select` nested in one included), where a bare `#` would become the count. There,
 * when the preferred term contains `#`, the branch's literal text is re-quoted with ICU
 * apostrophe quoting so the term reads back exactly as written. Values that do not parse
 * as ICU are always edited verbatim.
 *
 * @example
 * ```typescript
 * applyPreferredTerm('Expenditure for {expenditure}', { discouraged: 'Expenditure', preferred: 'Investment' });
 * // → 'Investment for {expenditure}'
 *
 * applyPreferredTerm('{n, plural, other {Old item}}', { discouraged: 'Old', preferred: 'C#' });
 * // → "{n, plural, other {C'#' item}}"
 * ```
 */
export function applyPreferredTerm(value: string, rule: PreferredTermRule): string {
  const [finding] = findPreferredTermFindings(value, [rule]);
  if (!finding) {
    return value;
  }

  const pluralContent = rule.preferred.includes('#') ? pluralContentRanges(value) : [];
  const edits: Array<PreferredTermRange & { text: string }> = [];
  for (const content of pluralContent) {
    const inside = finding.ranges.filter((range) => content.start <= range.start && range.end <= content.end);
    if (inside.length > 0) {
      edits.push({ ...content, text: requoteWithReplacements(value, content, inside, rule.preferred) });
    }
  }
  for (const range of finding.ranges) {
    if (!edits.some((edit) => edit.start <= range.start && range.end <= edit.end)) {
      edits.push({ ...range, text: rule.preferred });
    }
  }

  let result = value;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

/**
 * Raw spans of the literal content tokens where `#` is the count placeholder: plural and
 * selectordinal branch text, and the text of any select nested in one. Mirrors
 * `@messageformat/parser` in its default, non-strict mode. Empty when `value` does not
 * parse as ICU.
 */
function pluralContentRanges(value: string): PreferredTermRange[] {
  const ranges: PreferredTermRange[] = [];
  const walk = (tokens: readonly Token[], inPlural: boolean): void => {
    for (const token of tokens) {
      if (token.type === 'content') {
        if (inPlural && token.ctx) {
          ranges.push({ start: token.ctx.offset, end: token.ctx.offset + token.ctx.text.length });
        }
      } else if (token.type === 'plural' || token.type === 'selectordinal' || token.type === 'select') {
        const branchInPlural = inPlural || token.type !== 'select';
        for (const branch of token.cases) {
          walk(branch.tokens, branchInPlural);
        }
      }
    }
  };

  try {
    walk(parse(maskTranslocoPlaceholders(value)), false);
  } catch {
    return [];
  }
  return ranges;
}

/**
 * Rebuilds one plural-context content token: decodes its raw text to the literal a reader
 * sees, swaps each matched span for `preferred`, and re-encodes the result.
 */
function requoteWithReplacements(
  value: string,
  content: PreferredTermRange,
  matches: readonly PreferredTermRange[],
  preferred: string,
): string {
  const { literal, rawToLiteral } = decodeIcuLiteral(value.slice(content.start, content.end));

  let replaced = literal;
  for (let i = matches.length - 1; i >= 0; i--) {
    const start = rawToLiteral[matches[i].start - content.start];
    const end = rawToLiteral[matches[i].end - content.start];
    replaced = replaced.slice(0, start) + preferred + replaced.slice(end);
  }
  return encodePluralIcuLiteral(replaced);
}

/** `'{…}'`, `'}…'` or `'#…'` up to a closing apostrophe not followed by another; as in `@messageformat/parser`. */
const ICU_QUOTED_PATTERN = /'[{}#](?:[^']|'')*'(?!')/uy;

/**
 * Decodes the raw text of one content token (no bare `{`, `}` or `#`) to its literal,
 * with the literal offset at each raw offset. `''` reads as `'`; a quoted section reads
 * as its contents.
 */
function decodeIcuLiteral(raw: string): { literal: string; rawToLiteral: number[] } {
  let literal = '';
  const rawToLiteral: number[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw.startsWith("''", i)) {
      rawToLiteral.push(literal.length, literal.length + 1);
      literal += "'";
      i += 2;
      continue;
    }

    ICU_QUOTED_PATTERN.lastIndex = i;
    const quoted = ICU_QUOTED_PATTERN.exec(raw);
    if (quoted) {
      const end = i + quoted[0].length - 1;
      rawToLiteral.push(literal.length);
      for (i++; i < end; i++) {
        rawToLiteral.push(literal.length);
        if (raw.startsWith("''", i)) {
          rawToLiteral.push(literal.length + 1);
          i++;
        }
        literal += raw[i];
      }
      rawToLiteral.push(literal.length);
      i++;
      continue;
    }

    rawToLiteral.push(literal.length);
    literal += raw[i];
    i++;
  }
  rawToLiteral.push(literal.length);
  return { literal, rawToLiteral };
}

/**
 * Encodes a literal as plural-context ICU text that parses back to exactly the literal.
 * Each run of `{`, `}` and `#` is quoted, taking in any apostrophes that follow it so the
 * closing quote is never followed by another. An apostrophe is doubled wherever a single
 * one would start a quote, pair with its neighbour, or sit last before a following token.
 */
function encodePluralIcuLiteral(literal: string): string {
  const isSyntax = (char: string | undefined): boolean => char === '{' || char === '}' || char === '#';

  let out = '';
  let i = 0;
  while (i < literal.length) {
    const char = literal[i];
    if (isSyntax(char)) {
      let quoted = '';
      while (i < literal.length && (isSyntax(literal[i]) || literal[i] === "'")) {
        quoted += literal[i] === "'" ? "''" : literal[i];
        i++;
      }
      out += `'${quoted}'`;
    } else if (char === "'") {
      const next = literal[i + 1];
      out += next === undefined || next === "'" || isSyntax(next) ? "''" : "'";
      i++;
    } else {
      out += char;
      i++;
    }
  }
  return out;
}
