/**
 * ICU Message: the one parse of a translation value.
 *
 * `parseIcuMessage` reads a value into a tree of range-annotated nodes. Every node
 * carries its exact `[start, end)` span in the source, so callers rewrite a value by
 * splicing ranges rather than by printing a tree. The parser never throws. Malformed
 * input becomes `error` nodes, and parsing continues, so conversion stays total.
 *
 * Recovery keeps brace balance: a construct that does not parse still owns the braces
 * that delimit it. Its content is parsed as message content up to its matching `}`, and
 * the result hangs under the `error` node. Every unquoted `{` therefore opens exactly one
 * frame and every `}` closes one, whatever the input.
 *
 * Three options select the grammar:
 *
 * - `interpolation` reads Transloco `{{ name }}` placeholders as `argument` nodes with
 *   `syntax: 'transloco'`. Off by default, because a stored ICU value holds none.
 * - `lenient` accepts what the MessageFormat runtime parser accepts in its default mode:
 *   a `{` that starts no argument and a `}` outside any argument are text, any argument
 *   type is accepted, `other` is optional and an argument style is not quote-checked.
 *   Off by default, so the parse matches the strict rules the bundle needs.
 * - `simpleArgumentPaths` accepts identifier paths in simple ICU arguments such as
 *   `{user.name}`. Off by default; plain Transloco uses it for its stored interpolations.
 *
 * Quoted runs are the same in every context: `'{…'`, `'}…'` or `'#…'` up to a closing
 * apostrophe not followed by another, with `''` as a literal apostrophe.
 *
 * In strict interpolation mode, the mode `translocoToICU` converts in, two rules follow
 * a position test rather than the selector grammar: a group brace opens a case body only
 * when `isBareSelectorBefore` holds, and a brace that starts a sub-message head opens a
 * group even where a case body could open. The position test accepts every selector the
 * strict grammar accepts, `offset:2other` and `männlich` included. In lenient
 * interpolation mode, a case body that fails the same position test and holds only
 * `{{name}}` reads as the text the converter leaves there (see `convertedCaseBody`).
 *
 * @module icu-message
 */

/** A `[start, end)` span of the source string. */
export interface IcuRange {
  readonly start: number;
  readonly end: number;
}

/** The keyword an ICU argument uses to select a sub-message. */
export type SubMessageKeyword = 'plural' | 'select' | 'selectordinal';

/** Every keyword that opens a sub-message, in the order the ICU spec lists them. */
export const SUB_MESSAGE_KEYWORDS: readonly SubMessageKeyword[] = ['plural', 'select', 'selectordinal'];

/** The argument formats the Transloco runtime can render. */
export type IcuFormat = 'number' | 'date' | 'time' | 'duration';

const SUPPORTED_FORMATS: readonly string[] = ['number', 'date', 'time', 'duration'] satisfies readonly IcuFormat[];

/** Raw text, including quoted runs and `''`. `#` is text here unless it sits in plural content. */
export interface IcuLiteral {
  readonly kind: 'literal';
  readonly range: IcuRange;
  readonly inPlural: boolean;
}

/** `#` inside plural or selectordinal content. */
export interface IcuPound {
  readonly kind: 'pound';
  readonly range: IcuRange;
}

/** Lexical facts about a construct that starts at an unquoted `{`. */
export interface IcuBraceFacts {
  /** The construct ends with its own `}`; false when the value ends first. */
  readonly closed: boolean;
  /** A `{` or `}` other than its own delimiters lies inside it, quoted or not. */
  readonly innerBrace: boolean;
}

/** Lexical facts about a brace frame: a construct at an unquoted `{` that did not parse. */
export interface IcuFrameFacts extends IcuBraceFacts {
  /** Only whitespace between the braces. */
  readonly blank: boolean;
  /** A `,` between the braces outside nested non-literal nodes. */
  readonly ownComma: boolean;
  /** An ICU quoted run overlaps the frame. */
  readonly quoted: boolean;
  /** The frame holds exactly one Transloco interpolation filling [start + 1, end - 1), and is closed. */
  readonly wrapsInterpolation: boolean;
}

/** `{name}`, `{name, format}` or `{name, format, style}`; or Transloco `{{ name }}`. */
export interface IcuArgument extends IcuBraceFacts {
  readonly kind: 'argument';
  readonly range: IcuRange;
  readonly nameRange: IcuRange;
  readonly name: string;
  /** An `IcuFormat` in strict mode; any type name in lenient mode. */
  readonly format?: string;
  /** The text after the second comma, parsed as message content. */
  readonly style?: { readonly range: IcuRange; readonly nodes: readonly IcuNode[] };
  readonly syntax: 'icu' | 'transloco';
}

/** `{name, plural | select | selectordinal, cases}`. */
export interface IcuGroup extends IcuBraceFacts {
  readonly kind: 'group';
  readonly range: IcuRange;
  readonly nameRange: IcuRange;
  readonly name: string;
  readonly type: SubMessageKeyword;
  readonly offset?: number;
  readonly cases: readonly IcuCase[];
  /** Constructs between the cases that open no case body. Malformed input only. */
  readonly strays: readonly IcuNode[];
}

/**
 * Why a span is malformed:
 *
 * - `stray-close`: a strict-mode `}` with no open construct.
 * - `quote-escape`: a `'#…{…'` quoted run outside plural content.
 * - `frame`: a construct at an unquoted `{` that did not parse; see `frame`.
 * - `unclosed`: the zero-width marker that ends an unclosed value.
 * - `stray-text`: a lenient group recovery token.
 * - `capacity`: nesting deeper than the call stack.
 */
export type IcuErrorCause = 'stray-close' | 'quote-escape' | 'frame' | 'unclosed' | 'stray-text' | 'capacity';

/** A malformed span. A brace frame keeps the content parsed up to its matching `}`. */
export interface IcuError {
  readonly kind: 'error';
  readonly range: IcuRange;
  readonly message: string;
  readonly cause: IcuErrorCause;
  /** Present if and only if `cause` is `frame`. */
  readonly frame?: IcuFrameFacts;
  readonly nodes: readonly IcuNode[];
}

export type IcuNode = IcuLiteral | IcuPound | IcuArgument | IcuGroup | IcuError;

/** One case of a group: its selector and its body, the range inside the braces. */
export interface IcuCase {
  readonly selector: string;
  readonly selectorRange: IcuRange;
  readonly body: IcuRange;
  readonly nodes: readonly IcuNode[];
}

export interface IcuParseError {
  readonly message: string;
  readonly position: number;
}

export interface IcuMessage {
  readonly source: string;
  /** Top-level nodes. Their ranges tile `source`; an unclosed value ends in a zero-width `error`. */
  readonly nodes: readonly IcuNode[];
  /** In source order of detection. */
  readonly errors: readonly IcuParseError[];
  readonly ok: boolean;
}

export interface IcuParseOptions {
  /** Read Transloco `{{ name }}` placeholders as arguments. */
  readonly interpolation?: boolean;
  /** Accept what the MessageFormat runtime parser accepts. */
  readonly lenient?: boolean;
  /** Accept Transloco identifier paths in simple ICU arguments; all other grammar rules stay in force. */
  readonly simpleArgumentPaths?: boolean;
}

const NAME = String.raw`[^\p{Pat_Syn}\p{Pat_WS}]+`;
const LENIENT_HEADER = new RegExp(String.raw`\{\s*(${NAME})\s*`, 'uy');
const LENIENT_SUB_MESSAGE = /,\s*(plural|select|selectordinal)\s*,\s*/uy;
const LENIENT_TYPE = new RegExp(String.raw`,\s*(${NAME})\s*`, 'uy');
const LENIENT_OFFSET = /\s*offset\s*:\s*(\d+)\s*/uy;
const LENIENT_EXACT_CASE = /\s*(=\d+)\s*\{/uy;
const SPACE_CHAR = /\s/u;
const NAME_CHAR = /[^\p{Pat_Syn}\p{Pat_WS}]/u;
const SPACE_RUN = /\s*/uy;
const NAME_RUN = new RegExp(NAME, 'uy');
/** A run of name characters and whitespace: one token for recovery. */
const WORD_RUN = /(?:\s|[^\p{Pat_Syn}\p{Pat_WS}])+/uy;
const LENIENT_GROUP_END = /\s*\}/uy;
const QUOTE_OPENER = "'[{}#]";
const QUOTE_OPENER_PATTERN = new RegExp(QUOTE_OPENER, 'u');
const INTERPOLATION = /\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/y;
const SIMPLE_ARGUMENT_PATH = /\{\s*(\w+(?:\.\w+)*)\s*\}/y;
const QUOTED_RUN = new RegExp(`${QUOTE_OPENER}(?:[^']|'')*'(?!')`, 'uy');
const PLURAL_CATEGORIES: readonly string[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

let workSteps = 0;

/**
 * Records `steps` units of scanning work: a character visited, a token read, a recovery
 * step. Specs bound the total by the input length, so super-linear work fails
 * deterministically. Internal; not exported from the package barrel.
 */
export function countIcuWork(steps = 1): void {
  workSteps += steps;
}

/** The scanning work `run` records through `countIcuWork`. Internal, for complexity specs. */
export function measureIcuWork(run: () => void): number {
  const before = workSteps;
  run();
  return workSteps - before;
}

/**
 * Narrows an arbitrary string to a sub-message keyword.
 *
 * @example
 * ```typescript
 * isSubMessageKeyword('selectordinal'); // → true
 * isSubMessageKeyword('number'); // → false
 * ```
 */
export function isSubMessageKeyword(value: string): value is SubMessageKeyword {
  return (SUB_MESSAGE_KEYWORDS as readonly string[]).includes(value);
}

/** The opaque ICU quoted runs of `source`, in order. Context-free, like the runtime lexer. */
export function icuQuotedRuns(source: string): readonly IcuRange[] {
  return lexIcu(source).runs;
}

/**
 * One pass over `source`: its quoted runs, and for every `{` or `}`, quoted or not, the
 * index of the next one (`source.length` after the last).
 */
function lexIcu(source: string): { runs: readonly IcuRange[]; nextBrace: ReadonlyMap<number, number> } {
  const runs: IcuRange[] = [];
  const nextBrace = new Map<number, number>();
  let previousBrace = -1;
  let quotedUntil = 0;
  countIcuWork(source.length);
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '{' || char === '}') {
      if (previousBrace >= 0) nextBrace.set(previousBrace, i);
      previousBrace = i;
    }
    if (char !== "'" || i < quotedUntil) continue;
    if (source[i + 1] === "'") {
      quotedUntil = i + 2;
      continue;
    }
    QUOTED_RUN.lastIndex = i;
    const match = QUOTED_RUN.exec(source);
    countIcuWork(match ? match[0].length : 1);
    if (match) {
      runs.push({ start: i, end: i + match[0].length });
      quotedUntil = i + match[0].length;
    }
  }
  if (previousBrace >= 0) nextBrace.set(previousBrace, source.length);
  return { runs, nextBrace };
}

/**
 * Whether an apostrophe that is not part of a `''` pair stands before `{`, `}` or `#`, so
 * it may open an ICU quote, closed or not.
 */
export function hasIcuQuoteOpener(source: string): boolean {
  return QUOTE_OPENER_PATTERN.test(source.replace(/''/g, ''));
}

/**
 * Whether any of `runs` (sorted and non-overlapping, as `icuQuotedRuns` returns them)
 * overlaps `[start, end)`. A binary search, so a caller may ask once per node.
 */
export function overlapsIcuRun(runs: readonly IcuRange[], start: number, end: number): boolean {
  let low = 0;
  let high = runs.length;
  while (low < high) {
    countIcuWork();
    const middle = (low + high) >> 1;
    if ((runs[middle]?.end ?? 0) <= start) low = middle + 1;
    else high = middle;
  }
  const run = runs[low];
  return run !== undefined && run.start < end;
}

/** Reports complete Transloco interpolations with a delimiter inside an ICU quoted run. */
export function hasQuotedInterpolationDelimiter(icu: string): boolean {
  const runs = icuQuotedRuns(icu);
  for (const match of icu.matchAll(/\{\{[^{}]*?\}\}/g)) {
    countIcuWork(match[0].length);
    const delimiter = match.index + match[0].length - 2;
    if (overlapsIcuRun(runs, match.index, match.index + 1) || overlapsIcuRun(runs, delimiter, delimiter + 1))
      return true;
  }
  return false;
}

/**
 * Whether the text before the `{` at `brace`, back to the preceding `,`, `{` or `}`, is a
 * single selector token, optionally after a plural `offset:N` clause.
 *
 * In interpolation mode it decides which group braces open a case body. Every case
 * selector the strict grammar accepts passes it, so it never closes a body the grammar
 * opens. Internal: exported for specs and the collapsed-case-body report, not from the
 * package barrel.
 *
 * @internal
 */
export function isBareSelectorBefore(source: string, brace: number): boolean {
  return isBareSelector(selectorTailBefore(source, brace));
}

/**
 * Whether `tail` is `\s*(?:offset\s*:\s*\d+(?!\d)\s*)?(?:=\d+|NAME+)\s*`, read in linear
 * time. The pattern itself backtracks super-linearly on characters such as U+00A0, which
 * are whitespace and name characters at once.
 *
 * @internal
 */
export function isBareSelector(tail: string): boolean {
  countIcuWork(tail.length);
  if (isSpacedToken(tail)) return true;
  const rest = afterOffsetClause(tail.trimStart());
  return rest !== undefined && isSpacedToken(rest);
}

/**
 * Whether `text` is `\s*(?:=\d+|NAME+)\s*`. Trimmed text must be the token. With nothing
 * left, a whitespace-like name character, such as a lone U+00A0, is a token by itself.
 */
function isSpacedToken(text: string): boolean {
  const token = text.trim();
  return token ? isSelectorToken(token) : isNameRun(text, false);
}

/** `=\d+`, or one or more name characters. */
function isSelectorToken(token: string): boolean {
  if (token[0] === '=') return token.length > 1 && digitRunEnd(token, 1) === token.length;
  return token.length > 0 && isNameRun(token, true);
}

/** Whether every code point of `text` is a name character (`all`), or any one is. */
function isNameRun(text: string, all: boolean): boolean {
  for (let i = 0; i < text.length; ) {
    countIcuWork();
    const char = String.fromCodePoint(text.codePointAt(i) ?? 0);
    if (NAME_CHAR.test(char) !== all) return !all;
    i += char.length;
  }
  return all;
}

/** The index after the ASCII digits that start at `from`. */
function digitRunEnd(text: string, from: number): number {
  let end = from;
  while (end < text.length && text[end] >= '0' && text[end] <= '9') {
    countIcuWork();
    end++;
  }
  return end;
}

/** The text after a leading `offset\s*:\s*\d+`, or undefined when `token` has no such clause. */
function afterOffsetClause(token: string): string | undefined {
  if (!token.startsWith('offset')) return undefined;
  let i = skipSpaces(token, 'offset'.length);
  if (token[i] !== ':') return undefined;
  i = skipSpaces(token, i + 1);
  const digitsEnd = digitRunEnd(token, i);
  return digitsEnd > i ? token.slice(digitsEnd) : undefined;
}

function skipSpaces(text: string, from: number): number {
  let i = from;
  while (i < text.length && SPACE_CHAR.test(text[i])) {
    countIcuWork();
    i++;
  }
  return i;
}

/**
 * The text before the `{` at `brace`, back to the preceding `,`, `{` or `}`.
 *
 * @internal
 */
export function selectorTailBefore(source: string, brace: number): string {
  let boundary = brace - 1;
  while (boundary >= 0 && source[boundary] !== ',' && source[boundary] !== '{' && source[boundary] !== '}') {
    boundary--;
  }
  countIcuWork(brace - boundary);
  return source.slice(boundary + 1, brace);
}

/**
 * Parses a translation value into a range-annotated tree. Never throws.
 *
 * @example
 * ```typescript
 * parseIcuMessage('Hi {name}').nodes.map((node) => node.kind); // → ['literal', 'argument']
 * parseIcuMessage('Hi {{ name }}', { interpolation: true }).nodes[1]; // → argument, syntax 'transloco'
 * parseIcuMessage('Hi {name').ok; // → false
 * ```
 */
export function parseIcuMessage(source: string, options: IcuParseOptions = {}): IcuMessage {
  try {
    return new Parser(source, options).parse();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    // Nesting deeper than the engine's call stack: report it rather than throw.
    const message = 'Message nesting exceeds parser capacity';
    return {
      source,
      nodes: [{ kind: 'error', range: { start: 0, end: source.length }, message, cause: 'capacity', nodes: [] }],
      errors: [{ message, position: 0 }],
      ok: false,
    };
  }
}

/** Calls `visit` on every node, depth first. Returning `false` skips the node's children. */
export function visitIcuNodes(nodes: readonly IcuNode[], visit: (node: IcuNode, inPlural: boolean) => unknown): void {
  const walk = (items: readonly IcuNode[], inPlural: boolean): void => {
    for (const node of items) {
      countIcuWork();
      if (visit(node, node.kind === 'literal' ? node.inPlural : inPlural) === false) continue;
      if (node.kind === 'argument' && node.style) walk(node.style.nodes, inPlural);
      if (node.kind === 'error') walk(node.nodes, inPlural);
      if (node.kind === 'group') {
        const caseInPlural = inPlural || node.type !== 'select';
        for (const item of node.cases) walk(item.nodes, caseInPlural);
        walk(node.strays, caseInPlural);
      }
    }
  };
  walk(nodes, false);
}

/** Applies non-overlapping edits to `source` in one left-to-right pass over the source. */
export function spliceIcu(
  source: string,
  edits: readonly { readonly range: IcuRange; readonly text: string }[],
): string {
  let result = '';
  let position = 0;
  for (const edit of [...edits].sort((a, b) => a.range.start - b.range.start)) {
    countIcuWork(edit.range.start - position + edit.text.length);
    result += source.slice(position, edit.range.start) + edit.text;
    position = edit.range.end;
  }
  countIcuWork(source.length - position);
  return result + source.slice(position);
}

/** One left-to-right recursive-descent pass. Each method starts at `position` and advances it. */
class Parser {
  private position = 0;
  private readonly errors: IcuParseError[] = [];
  private readonly quotes: Map<number, number>;
  /** Apostrophe counts for argument styles, built on the first style. */
  private styleQuotes?: StyleQuoteCounts;
  private readonly runs: readonly IcuRange[];
  /** For every `{` or `}`, quoted or not, the index of the next one. */
  private readonly nextBrace: ReadonlyMap<number, number>;
  private readonly interpolation: boolean;
  private readonly lenient: boolean;
  private readonly simpleArgumentPaths: boolean;
  private depth = 0;
  private outermostStart = 0;
  private unclosedReported = false;

  constructor(
    private readonly source: string,
    options: IcuParseOptions,
  ) {
    const lexed = lexIcu(source);
    this.runs = lexed.runs;
    this.nextBrace = lexed.nextBrace;
    this.quotes = new Map(this.runs.map((run) => [run.start, run.end]));
    this.interpolation = options.interpolation === true;
    this.lenient = options.lenient === true;
    this.simpleArgumentPaths = options.simpleArgumentPaths === true;
  }

  parse(): IcuMessage {
    const nodes = this.content(false, false);
    if (this.unclosedReported) {
      const end = this.source.length;
      nodes.push({
        kind: 'error',
        range: { start: end, end },
        message: 'Unclosed placeholder',
        cause: 'unclosed',
        nodes: [],
      });
    }
    return { source: this.source, nodes, errors: this.errors, ok: this.errors.length === 0 };
  }

  private report(message: string, position: number): void {
    this.errors.push({ message, position });
  }

  /** A value that ends inside a construct reports the outermost one once, and nothing else. */
  private reportUnclosed(): void {
    if (this.unclosedReported) return;
    this.unclosedReported = true;
    this.report(`Unclosed placeholder starting at position ${this.outermostStart}`, this.outermostStart);
  }

  /** Consumes the `}` that closes a frame, or records that the value ended first. */
  private close(): boolean {
    if (this.source[this.position] === '}') {
      this.position++;
      return true;
    }
    this.reportUnclosed();
    return false;
  }

  /**
   * ICU simple styles pair every apostrophe, even before ordinary text. MessageFormat also
   * decodes message quoting before it reads a number pattern, so a balanced raw style such
   * as `''` can still leave an unclosed pattern quote. Answered from counts taken once per
   * value, so nested styles are not rescanned.
   */
  private hasBalancedStyleQuotes(start: number, end: number, format: string, inPlural: boolean): boolean {
    this.styleQuotes ??= countStyleQuotes(this.source, this.quotes);
    const counts = this.styleQuotes;
    const between = (prefix: Int32Array): number => (prefix[end] ?? 0) - (prefix[start] ?? 0);
    if (between(counts.apostrophes) % 2 !== 0) return false;
    return format !== 'number' || between(inPlural ? counts.decoded : counts.rawHash) % 2 === 0;
  }

  /** The facts of a construct spanning `[start, this.position)`. */
  private braceFacts(start: number, closed: boolean): IcuBraceFacts {
    return { closed, innerBrace: this.hasInnerBrace(start, this.position, closed) };
  }

  /** Whether a brace lies strictly inside `[start, end)`, not counting its own delimiters. `start` holds a `{`. */
  private hasInnerBrace(start: number, end: number, closed: boolean): boolean {
    return (this.nextBrace.get(start) ?? this.source.length) < (closed ? end - 1 : end);
  }

  /** The facts of the brace frame `[start, end)` whose direct children are `nodes`. */
  private frameFacts(start: number, end: number, closed: boolean, nodes: readonly IcuNode[]): IcuFrameFacts {
    const source = this.source;
    const limit = closed ? end - 1 : end;
    let ownComma = false;
    let solid = false;
    let constructs = 0;
    let position = start + 1;
    const scanGap = (gapEnd: number): void => {
      for (let i = position; i < gapEnd; i++) {
        countIcuWork();
        const char = source[i];
        if (char === ',') ownComma = true;
        if (!solid && !SPACE_CHAR.test(char)) solid = true;
      }
    };
    for (const child of nodes) {
      if (child.kind === 'literal' || child.kind === 'pound') continue;
      constructs++;
      scanGap(child.range.start);
      position = child.range.end;
    }
    scanGap(limit);
    const [only] = nodes;
    const wrapsInterpolation =
      closed &&
      nodes.length === 1 &&
      only?.kind === 'argument' &&
      only.syntax === 'transloco' &&
      only.range.start === start + 1 &&
      only.range.end === end - 1;
    return {
      closed,
      innerBrace: this.hasInnerBrace(start, end, closed),
      blank: constructs === 0 && !solid,
      ownComma,
      quoted: overlapsIcuRun(this.runs, start, end),
      wrapsInterpolation,
    };
  }

  /** Message content up to a `}` (left for the caller when `inFrame`) or the end. */
  private content(inPlural: boolean, inFrame: boolean): IcuNode[] {
    const source = this.source;
    const nodes: IcuNode[] = [];
    let literalStart = this.position;
    const flush = (end: number): void => {
      if (literalStart < end) nodes.push({ kind: 'literal', range: { start: literalStart, end }, inPlural });
    };
    const add = (start: number, node: IcuNode): void => {
      flush(start);
      nodes.push(node);
      literalStart = this.position;
    };

    while (this.position < source.length) {
      countIcuWork();
      const start = this.position;
      const char = source[start];
      const quoteEnd = this.quotes.get(start);
      if (quoteEnd !== undefined) {
        this.position = quoteEnd;
        // Outside plural content the runtime keeps `'#…'` raw, so a brace inside it is unquoted.
        if (!inPlural && source[start + 1] === '#' && source.slice(start, quoteEnd).includes('{')) {
          const message = `Unsupported escape pattern outside plural at position ${start}`;
          this.report(message, start);
          add(start, { kind: 'error', range: { start, end: quoteEnd }, message, cause: 'quote-escape', nodes: [] });
        }
      } else if (char === "'" && source[start + 1] === "'") {
        this.position += 2;
      } else if (char === '}') {
        if (inFrame) break;
        this.position++;
        if (!this.lenient) {
          const message = `Unmatched closing brace at position ${start}`;
          this.report(message, start);
          add(start, { kind: 'error', range: { start, end: this.position }, message, cause: 'stray-close', nodes: [] });
        }
      } else if (char === '#' && inPlural) {
        this.position++;
        add(start, { kind: 'pound', range: { start, end: this.position } });
      } else if (char === '{') {
        const node = this.construct(inPlural);
        if (node) add(start, node);
      } else {
        this.position++;
      }
    }
    flush(this.position);
    return nodes;
  }

  /** The construct at a `{` in content position. Undefined when lenient mode reads the brace as text. */
  private construct(inPlural: boolean): IcuNode | undefined {
    if (this.depth === 0) this.outermostStart = this.position;
    this.depth++;
    try {
      const start = this.position;
      const path = this.simpleArgumentPaths ? this.header(SIMPLE_ARGUMENT_PATH) : undefined;
      if (path) {
        return {
          kind: 'argument',
          range: { start, end: this.position },
          ...path,
          syntax: 'icu',
          ...this.braceFacts(start, true),
        };
      }
      return this.lenient ? this.lenientConstruct(inPlural) : this.strictConstruct(inPlural);
    } finally {
      this.depth--;
    }
  }

  private interpolationAt(start: number): IcuArgument | undefined {
    if (!this.interpolation) return undefined;
    INTERPOLATION.lastIndex = start;
    const match = INTERPOLATION.exec(this.source);
    if (!match) return undefined;
    countIcuWork(match[0].length);
    const name = match[1];
    const nameStart = start + match[0].indexOf(name);
    this.position = start + match[0].length;
    return {
      kind: 'argument',
      range: { start, end: this.position },
      nameRange: { start: nameStart, end: nameStart + name.length },
      name,
      syntax: 'transloco',
      closed: true,
      innerBrace: true,
    };
  }

  private header(pattern: RegExp): { name: string; nameRange: IcuRange } | undefined {
    const start = this.position;
    pattern.lastIndex = start;
    const match = pattern.exec(this.source);
    if (!match) return undefined;
    countIcuWork(match[0].length);
    const nameStart = start + match[0].indexOf(match[1]);
    this.position = start + match[0].length;
    return trimName({ name: match[1], nameRange: { start: nameStart, end: nameStart + match[1].length } });
  }

  /** Reports `message`, then parses content up to the matching `}` under one error node. */
  private errorFrame(message: string, at: number, start: number, inPlural: boolean): IcuError {
    this.report(message, at);
    const nodes = this.content(inPlural, true);
    const closed = this.close();
    const frame = this.frameFacts(start, this.position, closed, nodes);
    return { kind: 'error', range: { start, end: this.position }, message, cause: 'frame', frame, nodes };
  }

  private strictConstruct(inPlural: boolean): IcuNode {
    const source = this.source;
    const start = this.position;
    const interpolation = this.interpolationAt(start);
    if (interpolation) return interpolation;

    const spaced = readSpacedName(source, start + 1, '},', true);
    if (!spaced) {
      this.position = start + 1;
      return this.errorFrame(`Unquoted '{' does not start an argument at position ${start}`, start, start, inPlural);
    }
    const header = trimName(spaced.header);
    this.position = spaced.end;
    const typeStart = this.position;
    const type = source[typeStart] === ',' ? readSpacedName(source, typeStart + 1, '},', false) : undefined;
    if (!type) {
      if (typeStart < source.length && source[typeStart] !== '}') {
        return this.errorFrame(`Invalid argument type at position ${typeStart}`, typeStart, start, inPlural);
      }
      const closed = this.close();
      // A name of whitespace-like name characters only, `{\u00a0}`, trims to nothing.
      if (!header.name && start === this.outermostStart && source[this.position - 1] === '}') {
        const text = source.slice(start, this.position);
        this.report(`Invalid placeholder syntax at position ${start}: ${text}`, start);
      }
      return {
        kind: 'argument',
        range: { start, end: this.position },
        ...header,
        syntax: 'icu',
        ...this.braceFacts(start, closed),
      };
    }
    this.position = type.end;
    const format = type.header.name;
    // Stored values were converted reading the keyword with `\s*` around it, so a
    // trailing U+00A0 still opens a group there; the strict grammar keeps it in the type.
    const keyword = this.interpolation ? format.trim() : format;
    if (isSubMessageKeyword(keyword)) {
      if (source[this.position] !== ',') {
        return this.errorFrame(
          `Missing sub-message cases at position ${this.position}`,
          this.position,
          start,
          inPlural,
        );
      }
      this.position++;
      return this.strictGroup(start, header, keyword, inPlural);
    }
    // Spellout and ordinal require custom formatters absent from the target runtime.
    if (!SUPPORTED_FORMATS.includes(format)) {
      return this.errorFrame(
        `Unsupported argument type at position ${typeStart}: ${format}`,
        typeStart,
        start,
        inPlural,
      );
    }
    if (source[this.position] !== ',') {
      const closed = this.close();
      return {
        kind: 'argument',
        range: { start, end: this.position },
        ...header,
        format,
        syntax: 'icu',
        ...this.braceFacts(start, closed),
      };
    }
    this.position++;
    const styleStart = this.position;
    const nodes = this.content(inPlural, true);
    const style = { range: { start: styleStart, end: this.position }, nodes };
    if (this.position < source.length && !this.hasBalancedStyleQuotes(styleStart, this.position, format, inPlural)) {
      this.report(`Unterminated quoted literal in argument style at position ${styleStart}`, styleStart);
    }
    const closed = this.close();
    return {
      kind: 'argument',
      range: { start, end: this.position },
      ...header,
      format,
      style,
      syntax: 'icu',
      ...this.braceFacts(start, closed),
    };
  }

  /** The text between cases is selector text; each `{` opens a case body or, failing that, a stray. */
  private strictGroup(
    start: number,
    header: { name: string; nameRange: IcuRange },
    type: SubMessageKeyword,
    inPlural: boolean,
  ): IcuGroup {
    const source = this.source;
    const caseInPlural = inPlural || type !== 'select';
    const cases: IcuCase[] = [];
    const strays: IcuNode[] = [];
    let offset: number | undefined;
    let hasOther = false;
    let selectorStart = this.position;

    while (this.position < source.length) {
      countIcuWork();
      const at = this.position;
      const char = source[at];
      const quoteEnd = this.quotes.get(at);
      if (quoteEnd !== undefined) {
        if (!caseInPlural && source[at + 1] === '#' && source.slice(at, quoteEnd).includes('{')) {
          this.report(`Unsupported escape pattern outside plural at position ${at}`, at);
        }
        this.position = quoteEnd;
      } else if (char === "'" && source[at + 1] === "'") {
        this.position += 2;
      } else if (char === '}') {
        countIcuWork(at - selectorStart);
        if (!hasOther || source.slice(selectorStart, at).trim()) {
          this.report(`Invalid sub-message cases or missing 'other' at position ${selectorStart}`, selectorStart);
        }
        this.position++;
        return this.group(start, header, type, offset, cases, strays, true);
      } else if (char === '{') {
        const segment = source.slice(selectorStart, at);
        countIcuWork(segment.length);
        const selector = readStrictSelector(segment, type, cases.length === 0);
        if (!selector) {
          this.report(`Invalid sub-message selector or missing body at position ${selectorStart}`, selectorStart);
        }
        const opensBody = this.interpolation
          ? isBareSelectorBefore(source, at) && !this.opensSubMessage(at)
          : selector !== undefined;
        if (opensBody) {
          const key = selector?.selector ?? segment.trim();
          if (cases.length === 0) offset = selector?.offset;
          hasOther ||= key === 'other';
          cases.push(this.caseBody(key, segment, caseInPlural));
        } else {
          strays.push(this.strictConstruct(caseInPlural));
        }
        selectorStart = this.position;
      } else {
        this.position++;
      }
    }
    this.reportUnclosed();
    return this.group(start, header, type, offset, cases, strays, false);
  }

  /** A group spanning `[start, this.position)`. */
  private group(
    start: number,
    header: { name: string; nameRange: IcuRange },
    type: SubMessageKeyword,
    offset: number | undefined,
    cases: readonly IcuCase[],
    strays: readonly IcuNode[],
    closed: boolean,
  ): IcuGroup {
    const range = { start, end: this.position };
    return { kind: 'group', range, ...header, type, offset, cases, strays, ...this.braceFacts(start, closed) };
  }

  /**
   * Whether the `{` at `brace` starts a sub-message head, `{name, plural,`. In interpolation
   * mode such a brace opens a group wherever it stands, even where a case body could open:
   * the Transloco-era converter typed every brace by the text that follows it.
   */
  private opensSubMessage(brace: number): boolean {
    const header = readSpacedName(this.source, brace + 1, '},', true);
    if (!header || this.source[header.end] !== ',') return false;
    const type = readSpacedName(this.source, header.end + 1, '},', false);
    return type !== undefined && isSubMessageKeyword(type.header.name.trim()) && this.source[type.end] === ',';
  }

  /** Parses the body at the `{` at `position`, whose selector text is the `segment` before it. */
  private caseBody(selector: string, segment: string, inPlural: boolean): IcuCase {
    const brace = this.position;
    const selectorEnd = brace - (segment.length - segment.trimEnd().length);
    this.position++;
    const nodes = this.content(inPlural, true);
    const body = { start: brace + 1, end: this.position };
    this.close();
    return { selector, selectorRange: { start: selectorEnd - selector.length, end: selectorEnd }, body, nodes };
  }

  /**
   * In interpolation mode, a case brace that fails `isBareSelectorBefore` and opens
   * `{{name}}` is where the converter rewrites `{{name}}` to `{name}`, so the runtime reads
   * the case body as the text `name`. The body is read the same way here: one literal
   * between the outer braces. Only malformed selectors reach it, such as `a.b {{x}}`.
   */
  private convertedCaseBody(selector: string, segment: string, inPlural: boolean): IcuCase | undefined {
    const brace = this.position;
    if (!this.interpolation || isBareSelectorBefore(this.source, brace)) return undefined;
    INTERPOLATION.lastIndex = brace;
    const match = INTERPOLATION.exec(this.source);
    if (!match) return undefined;
    const body = { start: brace + 1, end: brace + match[0].length - 1 };
    this.position = body.end + 1;
    const selectorEnd = brace - (segment.length - segment.trimEnd().length);
    return {
      selector,
      selectorRange: { start: selectorEnd - selector.length, end: selectorEnd },
      body,
      nodes: [{ kind: 'literal', range: body, inPlural }],
    };
  }

  /** The runtime lexer's argument states: a type, a sub-message, or a closing brace. */
  private lenientConstruct(inPlural: boolean): IcuNode | undefined {
    const source = this.source;
    const start = this.position;
    const interpolation = this.interpolationAt(start);
    if (interpolation) return interpolation;

    const header = this.header(LENIENT_HEADER);
    if (!header) {
      this.position = start + 1;
      return undefined;
    }
    const at = this.position;
    if (at >= source.length) {
      this.reportUnclosed();
      return {
        kind: 'argument',
        range: { start, end: at },
        ...header,
        syntax: 'icu',
        ...this.braceFacts(start, false),
      };
    }
    if (source[at] === '}') {
      this.position++;
      return {
        kind: 'argument',
        range: { start, end: this.position },
        ...header,
        syntax: 'icu',
        ...this.braceFacts(start, true),
      };
    }
    LENIENT_SUB_MESSAGE.lastIndex = at;
    const subMessage = LENIENT_SUB_MESSAGE.exec(source);
    if (subMessage && isSubMessageKeyword(subMessage[1])) {
      this.position += subMessage[0].length;
      return this.lenientGroup(start, header, subMessage[1], inPlural);
    }
    const styled = source[at] === ',' ? readSpacedName(source, at + 1, ',', false) : undefined;
    LENIENT_TYPE.lastIndex = at;
    const simple = styled ? undefined : LENIENT_TYPE.exec(source);
    // The runtime trims a type, so a trailing U+00A0 is not part of it.
    const format = (styled?.header.name ?? simple?.[1])?.trim();
    if (format === undefined || isSubMessageKeyword(format.toLowerCase())) {
      return this.errorFrame(`Invalid argument type at position ${at}`, at, start, inPlural);
    }
    this.position = styled ? styled.end + 1 : LENIENT_TYPE.lastIndex;
    countIcuWork(this.position - at);
    if (!styled) {
      if (this.position < source.length && source[this.position] !== '}') {
        return this.errorFrame(`Invalid argument type at position ${at}`, at, start, inPlural);
      }
      const closed = this.close();
      return {
        kind: 'argument',
        range: { start, end: this.position },
        ...header,
        format,
        syntax: 'icu',
        ...this.braceFacts(start, closed),
      };
    }
    const styleStart = this.position;
    const nodes = this.content(inPlural, true);
    const style = { range: { start: styleStart, end: this.position }, nodes };
    const closed = this.close();
    return {
      kind: 'argument',
      range: { start, end: this.position },
      ...header,
      format,
      style,
      syntax: 'icu',
      ...this.braceFacts(start, closed),
    };
  }

  /** The runtime lexer's select state: offsets, `key {`, and the closing brace. */
  private lenientGroup(
    start: number,
    header: { name: string; nameRange: IcuRange },
    type: SubMessageKeyword,
    inPlural: boolean,
  ): IcuGroup {
    const source = this.source;
    const caseInPlural = inPlural || type !== 'select';
    const cases: IcuCase[] = [];
    const strays: IcuNode[] = [];
    let offset: number | undefined;

    while (this.position < source.length) {
      countIcuWork();
      const at = this.position;
      LENIENT_OFFSET.lastIndex = at;
      const offsetMatch = LENIENT_OFFSET.exec(source);
      if (offsetMatch) {
        if (type === 'select' || cases.length > 0) {
          this.report(`Unexpected plural offset at position ${at}`, at);
        }
        offset = Number(offsetMatch[1]);
        this.position += offsetMatch[0].length;
        countIcuWork(offsetMatch[0].length);
        continue;
      }
      const caseHead = readLenientCase(source, at);
      if (caseHead) {
        const key = caseHead.key;
        const valid = key.startsWith('=') ? type !== 'select' : type === 'select' || PLURAL_CATEGORIES.includes(key);
        if (!valid) this.report(`Invalid sub-message selector at position ${at}`, at);
        this.position = caseHead.brace;
        const segment = source.slice(at, this.position);
        cases.push(this.convertedCaseBody(key, segment, caseInPlural) ?? this.caseBody(key, segment, caseInPlural));
        continue;
      }
      LENIENT_GROUP_END.lastIndex = at;
      const end = LENIENT_GROUP_END.exec(source);
      if (end) {
        this.position += end[0].length;
        return this.group(start, header, type, offset, cases, strays, true);
      }
      SPACE_RUN.lastIndex = at;
      SPACE_RUN.exec(source);
      const next = SPACE_RUN.lastIndex;
      this.position = next;
      if (next >= source.length) break;
      this.report(`Invalid sub-message cases at position ${at}`, at);
      // Recover past one whole token, so no position is read twice.
      if (source[next] === '{') {
        strays.push(this.construct(caseInPlural) ?? errorAt(next, this.position));
        continue;
      }
      WORD_RUN.lastIndex = next;
      this.position = this.quotes.get(next) ?? (WORD_RUN.test(source) ? WORD_RUN.lastIndex : next + 1);
      countIcuWork(this.position - at);
    }
    this.reportUnclosed();
    return this.group(start, header, type, offset, cases, strays, false);
  }
}

/**
 * Reads `\s*(name)\s*` from `from` up to a terminator in `terminators` (or the end of
 * the source, when `endTerminates`), as the sticky pattern with a lookahead would, but in
 * one linear pass. Some characters, such as U+00A0, are both whitespace and name
 * characters, so the pattern itself backtracks super-linearly on long runs of them.
 *
 * @returns the name and the index of the terminator, or undefined when there is no match
 */
function readSpacedName(
  source: string,
  from: number,
  terminators: string,
  endTerminates: boolean,
): { header: { name: string; nameRange: IcuRange }; end: number } | undefined {
  let firstSolid = -1;
  let solidEnd = -1;
  let lastName = -1;
  let end = from;
  while (end < source.length) {
    const char = String.fromCodePoint(source.codePointAt(end) ?? 0);
    const space = SPACE_CHAR.test(char);
    const name = NAME_CHAR.test(char);
    if (!space && !name) break;
    if (!space) {
      if (firstSolid < 0) firstSolid = end;
      solidEnd = end + char.length;
    }
    if (name) lastName = end;
    end += char.length;
    countIcuWork();
  }
  if (end < source.length ? !terminators.includes(source[end]) : !endTerminates) return undefined;

  // Leading spaces are taken greedily, so the name starts at the first character that is
  // not whitespace and runs as far as name characters go; only whitespace may follow.
  // Without such a character, the name is the last character that can be one.
  let nameStart = firstSolid;
  let nameEnd: number;
  if (firstSolid >= 0) {
    NAME_RUN.lastIndex = firstSolid;
    if (!NAME_RUN.test(source)) return undefined;
    nameEnd = Math.min(NAME_RUN.lastIndex, end);
    if (nameEnd < solidEnd) return undefined;
  } else {
    if (lastName < 0) return undefined;
    nameStart = lastName;
    nameEnd = lastName + String.fromCodePoint(source.codePointAt(lastName) ?? 0).length;
  }
  const name = source.slice(nameStart, nameEnd);
  return { header: { name, nameRange: { start: nameStart, end: nameEnd } }, end };
}

/** The runtime lexer's `key {` token at `from`: the key and the index of its brace. */
function readLenientCase(source: string, from: number): { key: string; brace: number } | undefined {
  LENIENT_EXACT_CASE.lastIndex = from;
  const exact = LENIENT_EXACT_CASE.exec(source);
  if (exact) return { key: exact[1], brace: LENIENT_EXACT_CASE.lastIndex - 1 };
  const named = readSpacedName(source, from, '{', false);
  return named && { key: named.header.name.trim(), brace: named.end };
}

/**
 * Drops the whitespace a name may end with, such as U+00A0, which is also a name
 * character. The runtime and the placeholder extractor both trim names.
 */
function trimName(header: { name: string; nameRange: IcuRange }): { name: string; nameRange: IcuRange } {
  const name = header.name.trim();
  const start = header.nameRange.start + header.name.indexOf(name);
  return { name, nameRange: { start, end: start + name.length } };
}

function errorAt(start: number, end: number): IcuError {
  return { kind: 'error', range: { start, end }, message: 'Unexpected text', cause: 'stray-text', nodes: [] };
}

/** The selector of the case whose text precedes a body brace, by the strict grammar. */
function readStrictSelector(
  segment: string,
  type: SubMessageKeyword,
  firstCase: boolean,
): { selector: string; offset?: number } | undefined {
  let selector = segment.trim();
  let offset: number | undefined;
  // A single numeric offset belongs before the first plural/ordinal case.
  if (type !== 'select' && firstCase) {
    const match = /^offset:\s*(\d+)\s*/.exec(selector);
    if (match) {
      offset = Number(match[1]);
      selector = selector.slice(match[0].length);
    }
  }
  if (type === 'select') {
    return new RegExp(`^${NAME}$`, 'u').test(selector) ? { selector } : undefined;
  }
  return PLURAL_CATEGORIES.includes(selector) || /^=\d+$/.test(selector) ? { selector, offset } : undefined;
}

/**
 * Prefix counts over a value, indexed by offset: raw apostrophes, and the apostrophes of
 * the number pattern MessageFormat reads after decoding message quoting, with every quoted
 * run decoded (`decoded`, plural content) or with `'#…'` runs kept raw (`rawHash`, outside
 * it). A style never splits a quoted run or a `''` pair, so a difference of two entries is
 * exact for it.
 */
interface StyleQuoteCounts {
  readonly apostrophes: Int32Array;
  readonly decoded: Int32Array;
  readonly rawHash: Int32Array;
}

function countStyleQuotes(source: string, quotes: ReadonlyMap<number, number>): StyleQuoteCounts {
  const apostrophes = new Int32Array(source.length + 1);
  const decoded = new Int32Array(source.length + 1);
  const rawHash = new Int32Array(source.length + 1);
  let raw = 0;
  let decodedCount = 0;
  let rawHashCount = 0;
  let i = 0;
  while (i < source.length) {
    const runEnd = quotes.get(i);
    let end = i + 1;
    if (runEnd !== undefined) {
      end = runEnd;
      let inside = 0;
      for (let j = i; j < end; j++) if (source[j] === "'") inside++;
      countIcuWork(end - i);
      raw += inside;
      // The delimiters go, and each `''` inside reads as one apostrophe.
      decodedCount += (inside - 2) / 2;
      rawHashCount += source[i + 1] === '#' ? inside : (inside - 2) / 2;
    } else if (source[i] === "'") {
      end = source[i + 1] === "'" ? i + 2 : i + 1;
      raw += end - i;
      decodedCount++;
      rawHashCount++;
    }
    for (let j = i + 1; j <= end; j++) {
      countIcuWork();
      apostrophes[j] = raw;
      decoded[j] = decodedCount;
      rawHash[j] = rawHashCount;
    }
    i = end;
  }
  return { apostrophes, decoded, rawHash };
}
