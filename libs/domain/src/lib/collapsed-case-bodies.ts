/**
 * Collapsed case bodies: stored values an earlier converter may have corrupted.
 *
 * Earlier versions opened a case body only when its selector matched an ASCII,
 * space-after-offset rule. A body behind `offset:2other` or a key such as `männlich` was
 * read as a stray brace instead, so its `{{x}}` was converted as a Transloco placeholder,
 * and the stored body became the literal text `x`.
 *
 * Such a value cannot be repaired reliably: `männlich {x}` is byte-identical to a value
 * whose author wrote the literal body `x`. So candidates are reported, never rewritten.
 * After the fix, the author restores a placeholder by editing the value to
 * `männlich {{x}}`.
 *
 * This module is a documented lexical survivor: `RETIRED_BARE_SELECTOR` exists only to
 * find values written under the retired rule.
 *
 * @module collapsed-case-bodies
 */

import {
  countIcuWork,
  type IcuParseOptions,
  type IcuRange,
  isBareSelectorBefore,
  parseIcuMessage,
  selectorTailBefore,
  visitIcuNodes,
} from './icu-message';

/** A case whose literal body may once have been the placeholder `{{body}}`. */
export interface CollapsedCaseBody {
  readonly selector: string;
  /** The literal body text, `x` for `{x}`. */
  readonly body: string;
  /** The range inside the case braces, in the raw value. */
  readonly bodyRange: IcuRange;
}

/**
 * The retired position rule. It exists only to find values written under it; nothing
 * parses with it.
 */
const RETIRED_BARE_SELECTOR = /^\s*(?:offset\s*:\s*\d+\s+)?(?:=\d+|\w+)\s*$/;

/** The text `{{name}}` converted to, before the fix, when its case brace was read as a stray. */
const CONVERTED_NAME = /^\w+(?:\.\w+)*$/;

/**
 * Finds the cases of a valid stored ICU value whose body may be a collapsed placeholder:
 * the body is one literal shaped like a placeholder name, and its selector passes the
 * current position rule but failed the retired one. Returns `[]` for invalid ICU.
 *
 * False positives are expected: `{g, select, männlich {Herr} other {y}}` is reported,
 * because it is byte-identical to a collapsed `männlich {{Herr}}`.
 *
 * @example
 * ```typescript
 * findCollapsedCaseBodies('{p, plural, offset:2other{x}}');
 * // → [{ selector: 'other', body: 'x', bodyRange: { start: 26, end: 27 } }]
 * findCollapsedCaseBodies('{p, plural, offset:2 other{x}}'); // → []
 * ```
 */
export function findCollapsedCaseBodies(value: string, options: IcuParseOptions = {}): readonly CollapsedCaseBody[] {
  const message = parseIcuMessage(value, options);
  if (!message.ok) return [];
  const found: CollapsedCaseBody[] = [];
  visitIcuNodes(message.nodes, (node) => {
    if (node.kind !== 'group') return;
    for (const branch of node.cases) {
      countIcuWork();
      const [only, ...rest] = branch.nodes;
      if (only?.kind !== 'literal' || rest.length > 0) continue;
      if (only.range.start !== branch.body.start || only.range.end !== branch.body.end) continue;
      const body = value.slice(only.range.start, only.range.end);
      countIcuWork(body.length);
      if (!CONVERTED_NAME.test(body)) continue;
      const brace = branch.body.start - 1;
      const tail = selectorTailBefore(value, brace);
      countIcuWork(tail.length);
      if (RETIRED_BARE_SELECTOR.test(tail) || !isBareSelectorBefore(value, brace)) continue;
      found.push({ selector: branch.selector, body, bodyRange: branch.body });
    }
  });
  return found;
}
