import type { AppRuntime } from './app-runtime';
import {
  type IcuFormat,
  type IcuParseOptions,
  icuQuotedRuns,
  parseIcuMessage,
  type SubMessageKeyword,
  visitIcuNodes,
} from './icu-message';
import { icuToTransloco } from './icu-to-transloco';
import { translocoToICU } from './transloco-to-icu';

export type IcuConstructKind = SubMessageKeyword | IcuFormat;

/** The stored-value grammar for a resolved app runtime. */
export function icuParseOptionsFor(runtime: AppRuntime): IcuParseOptions {
  return { simpleArgumentPaths: runtime === 'transloco' };
}

/** Converts app-runtime syntax to the ICU syntax used in storage. Never throws. */
export function toStoredIcu(value: string, runtime: AppRuntime): string {
  if (runtime === 'transloco-messageformat') return translocoToICU(value);

  // The parser's INTERPOLATION pattern, applied without ICU context: every other
  // character in plain Transloco is literal, including ICU-looking groups and quotes.
  const interpolation = /\{\{\s*(\w+(?:\.\w+)*)\s*\}\}/g;
  let result = '';
  let position = 0;
  for (const match of value.matchAll(interpolation)) {
    result += `${quoteLiteral(value, position, match.index)}{${match[1]}}`;
    position = match.index + match[0].length;
  }
  return result + quoteLiteral(value, position, value.length);
}

/** Quotes maximal brace runs, and apostrophes that could become ICU syntax. */
function quoteLiteral(value: string, start: number, end: number): string {
  // A quote between two brace runs must stay inside one ICU run: closing and
  // reopening around it would introduce another escaped apostrophe.
  return value.slice(start, end).replace(/[{}]+(?:'+[{}]+)*|'+/g, (run: string, offset: number) => {
    if (run[0] !== "'") return `'${run.replace(/'/g, "''")}'`;
    const before = value[start + offset - 1];
    const after = value[start + offset + run.length];
    return run.length >= 2 || before === '{' || before === '}' || after === '{' || after === '}' || after === '#'
      ? "''".repeat(run.length)
      : run;
  });
}

/** Converts stored ICU to the configured runtime, preserving malformed input. */
export function toRuntimeValue(value: string, runtime: AppRuntime): string {
  if (runtime === 'transloco-messageformat') return icuToTransloco(value);
  const message = parseIcuMessage(value, icuParseOptionsFor(runtime));
  if (!message.ok) return value;
  // Unsupported constructs retain today's messageformat representation for the whole
  // value, including the extra braces around placeholder-only branch bodies.
  if (unrenderableIcuConstructs(value, runtime).length > 0) return icuToTransloco(value, icuParseOptionsFor(runtime));

  return message.nodes
    .map((node) => {
      const text = value.slice(node.range.start, node.range.end);
      if (node.kind === 'literal') return unquoteLiteral(text);
      if (node.kind === 'argument' && node.format === undefined) return `{{ ${node.name} }}`;
      return icuToTransloco(text);
    })
    .join('');
}

function unquoteLiteral(text: string): string {
  let result = '';
  let position = 0;
  for (const run of icuQuotedRuns(text)) {
    result += text.slice(position, run.start).replace(/''/g, "'");
    result += text.slice(run.start + 1, run.end - 1).replace(/''/g, "'");
    position = run.end;
  }
  return result + text.slice(position).replace(/''/g, "'");
}

/** Unsupported ICU constructs, deduplicated in source order; malformed input is checked elsewhere. */
export function unrenderableIcuConstructs(value: string, runtime: AppRuntime): readonly IcuConstructKind[] {
  if (runtime === 'transloco-messageformat') return [];
  const message = parseIcuMessage(value, icuParseOptionsFor(runtime));
  if (!message.ok) return [];
  const kinds = new Set<IcuConstructKind>();
  visitIcuNodes(message.nodes, (node) => {
    if (node.kind === 'group') kinds.add(node.type);
    // Strict parsing accepts only IcuFormat values.
    if (node.kind === 'argument' && node.format !== undefined) kinds.add(node.format as IcuFormat);
  });
  return [...kinds];
}
