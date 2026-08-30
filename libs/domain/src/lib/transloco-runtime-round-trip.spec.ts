/**
 * Runtime round trip for bundled values.
 *
 * A bundled value reaches a Transloco consumer through two passes:
 *
 * 1. `DefaultTranspiler.transpile` substitutes every `{{ name }}` interpolation.
 * 2. `MessageFormatTranspiler` hands the result to `MessageFormat.compile`, which
 *    parses it as ICU and returns a render function.
 *
 * String equality against the bundled form says nothing about what the consumer
 * sees, because pass 1 can consume braces that pass 2 needs. The helpers below run
 * both passes so a case can assert on the rendered text or on the compile error.
 */

import MessageFormat from '@messageformat/core';
import { icuToTransloco } from './icu-to-transloco';

/** The parameters a consumer passes alongside a translation key. */
type RuntimeParams = Record<string, unknown>;

/** Which of the two `@messageformat/core` steps threw. */
type RuntimeFailureStage = 'compile' | 'render';

/** What a consumer would see for one value: rendered text, or the failure instead. */
type RuntimeResult =
  | { ok: true; emitted: string; interpolated: string; rendered: string }
  | { ok: false; stage: RuntimeFailureStage; emitted: string; interpolated: string; error: Error };

/**
 * Upper bound on pass 1 substitutions. The runtime has no such bound: a parameter
 * whose value reproduces its own token (`{ a: '{{a}}' }`) makes the loop rescan the
 * same match forever. This throws instead, so a defective fixture surfaces as a
 * failed test rather than a hung worker. It deviates from the runtime only on
 * inputs where the runtime itself would hang.
 */
const MAX_INTERPOLATION_PASSES = 10_000;

/**
 * Replica of Transloco's `getValue`
 * (`node_modules/@jsverse/transloco/fesm2022/jsverse-transloco.mjs:61-70`):
 * an own property wins over the dotted-path walk, so `{{ a.b }}` resolves against
 * either `{ 'a.b': … }` or `{ a: { b: … } }`.
 */
function getValue(obj: RuntimeParams, path: string): unknown {
  // Unreachable for a non-nullable `RuntimeParams`; kept so the replica matches the source.
  if (!obj) {
    return obj;
  }

  // biome-ignore lint/suspicious/noPrototypeBuiltins: mirrors the source form at jsverse-transloco.mjs:66
  if (Object.prototype.hasOwnProperty.call(obj, path)) {
    return obj[path];
  }

  return path.split('.').reduce<unknown>((carry, part) => (carry as RuntimeParams | undefined)?.[part], obj);
}

/**
 * Replica of `resolveMatcher`
 * (`node_modules/@jsverse/transloco/fesm2022/jsverse-transloco.mjs:187-190`) built
 * from the default `['{{', '}}']` interpolation delimiters. The character class
 * forbids the delimiter characters, so the matcher cannot start on a run of three
 * braces — it matches the inner pair and leaves the outer brace alone.
 */
function interpolationMatcher(): RegExp {
  return /\{\{([^{}]*?)\}\}/g;
}

/**
 * Pass 1. Replica of `DefaultTranspiler.transpile`'s string branch
 * (`node_modules/@jsverse/transloco/fesm2022/jsverse-transloco.mjs:95-118`; the
 * `while` loop proper is `:99-116`).
 *
 * The loop shape is deliberate and must not become `String.replaceAll`. The runtime
 * re-scans the whole string from index 0 after every single substitution, so a
 * substituted value can itself form the next match — inputs `replaceAll` never
 * revisits. `this.interpolationMatcher` is a getter that builds a new `RegExp` on
 * each access, so `lastIndex` never carries forward; calling the factory inside the
 * loop condition reproduces that. The substitution is `parsedValue.replace(match, …)`,
 * which rewrites the *first* occurrence of the matched text rather than the one
 * `exec` located — another difference `replaceAll` erases.
 *
 * An unresolved name substitutes an empty string. The runtime first falls back to a
 * nested `translation[match]` lookup; this replica omits that lookup and so behaves
 * as the runtime does with an empty translation object.
 */
function transpileInterpolations(value: string, params: RuntimeParams): string {
  let parsedValue = value;
  let paramMatch = interpolationMatcher().exec(parsedValue);
  let passes = 0;

  while (paramMatch !== null) {
    passes += 1;
    if (passes > MAX_INTERPOLATION_PASSES) {
      throw new Error(`transpile did not converge after ${MAX_INTERPOLATION_PASSES} substitutions`);
    }

    const [match, paramValue] = paramMatch;
    parsedValue = parsedValue.replace(match, () => {
      const name = paramValue.trim();
      const param = getValue(params, name);

      return param === undefined || param === null ? '' : String(param);
    });
    paramMatch = interpolationMatcher().exec(parsedValue);
  }

  return parsedValue;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Runs an already-bundled value through both runtime passes under one locale.
 *
 * A compile or render throw is an expected outcome for some shapes, so it is captured
 * and returned rather than escaping to the caller. The two are reported separately:
 * a compile throw is a defect in the value, a render throw is usually a defect in the
 * parameters. An unusable locale tag is neither, so the formatter is built outside the
 * captured region and its `Unknown locale` throw escapes.
 *
 * @param emitted - The value as it appears in the bundled locale file
 * @param params - The parameters the consumer supplies
 * @param locale - The locale the value was bundled for
 */
function renderBundledValue(emitted: string, params: RuntimeParams, locale: string): RuntimeResult {
  const interpolated = transpileInterpolations(emitted, params);
  const formatter = new MessageFormat(locale);

  let message: ReturnType<typeof formatter.compile>;

  try {
    message = formatter.compile(interpolated);
  } catch (error) {
    return { ok: false, stage: 'compile', emitted, interpolated, error: asError(error) };
  }

  try {
    return { ok: true, emitted, interpolated, rendered: message(params) };
  } catch (error) {
    return { ok: false, stage: 'render', emitted, interpolated, error: asError(error) };
  }
}

/**
 * Bundles a stored ICU value and runs the result through both runtime passes.
 *
 * @param stored - The value as held in `resource_entries.json`
 * @param params - The parameters the consumer supplies
 * @param locale - The locale the value is stored for
 */
function roundTripStoredValue(stored: string, params: RuntimeParams, locale: string): RuntimeResult {
  return renderBundledValue(icuToTransloco(stored), params, locale);
}

/** Shared by the table row and the standalone case below, so the two cannot drift. */
const DELETE_COUNT_PLURAL = '{deleteCount, plural, =1 {Delete {itemName}} other {Delete # items}}?';

interface RoundTripCase {
  name: string;
  stored: string;
  params: RuntimeParams;
  locale: string;
  /** The exact pass 1 output, when the case pins it. */
  interpolated?: string;
  /** Either the text a consumer sees, or the pass 2 failure it sees instead. */
  expected: { rendered: string } | { compileError: RegExp };
}

const CASES: RoundTripCase[] = [
  {
    name: 'plural branch body that is only an argument renders',
    stored: 'Cannot delete {itemCount, plural, =1 {{itemName}} other {items}}',
    params: { itemCount: 1, itemName: 'Flood Risk' },
    locale: 'en',
    interpolated: 'Cannot delete {itemCount, plural, =1 {Flood Risk} other {items}}',
    expected: { rendered: 'Cannot delete Flood Risk' },
  },
  {
    // With the argument supplied the branch body is the parameter value; without it the
    // body is empty. The extra brace pair keeps that an empty *body* rather than an empty
    // branch, so the message still compiles and the branch renders as nothing.
    name: 'plural branch body that is only an argument renders empty when the argument is missing',
    stored: 'Cannot delete {itemCount, plural, =1 {{itemName}} other {items}}',
    params: { itemCount: 1 },
    locale: 'en',
    interpolated: 'Cannot delete {itemCount, plural, =1 {} other {items}}',
    expected: { rendered: 'Cannot delete ' },
  },
  {
    name: 'select branch body that is only an argument renders',
    stored: 'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.',
    params: { nameExists: 'hasName', name: 'Flood Risk' },
    locale: 'en',
    interpolated: 'This will delete {nameExists, select, hasName {Flood Risk} other {this item}} and cannot be undone.',
    expected: { rendered: 'This will delete Flood Risk and cannot be undone.' },
  },
  {
    name: 'branch body that is only an argument, nested inside another group, renders',
    stored: '{riskCount, plural, =1 {{nameExists, select, hasName {{name}} other {it}}} other {# risks}}',
    params: { riskCount: 1, nameExists: 'hasName', name: 'Flood' },
    locale: 'en',
    interpolated: '{riskCount, plural, =1 {{nameExists, select, hasName {Flood} other {it}}} other {# risks}}',
    expected: { rendered: 'Flood' },
  },
  {
    name: 'plural branch body that is text plus an argument renders',
    stored: DELETE_COUNT_PLURAL,
    params: { deleteCount: 1, itemName: 'Flood Risk' },
    locale: 'en',
    expected: { rendered: 'Delete Flood Risk?' },
  },
  {
    name: 'plural branch body that is an argument plus text renders',
    stored: '{itemCount, plural, =1 {{itemName} contains} other {Selected items contain}} children',
    params: { itemCount: 1, itemName: 'Flood Risk' },
    locale: 'en',
    interpolated: '{itemCount, plural, =1 {{itemName} contains} other {Selected items contain}} children',
    expected: { rendered: 'Flood Risk contains children' },
  },
  {
    // The shape the bundle warning tells authors to write in place of `=1 {{n, number}}`.
    // The text beside the argument keeps the run out of pass 1's reach, so pass 2 sees the
    // branch body intact.
    name: 'branch body that is an argument carrying a format, beside text, renders',
    stored: '{count, plural, =1 {{n, number} item} other {# items}}',
    params: { count: 1, n: 5 },
    locale: 'en',
    interpolated: '{count, plural, =1 {{n, number} item} other {# items}}',
    expected: { rendered: '5 item' },
  },
  {
    name: 'branch body that is an argument carrying a format still fails to compile',
    stored: 'x {c, plural, =1 {{n, number}} other {# items}}',
    params: { c: 1, n: 5 },
    locale: 'en',
    interpolated: 'x {c, plural, =1  other {# items}}',
    expected: { compileError: /invalid syntax/i },
  },
];

describe('transloco runtime round trip', () => {
  describe.each(CASES)('$name', (testCase) => {
    const { stored, params, locale, interpolated, expected } = testCase;

    if (interpolated !== undefined) {
      it('produces the expected pass 1 output', () => {
        const result = roundTripStoredValue(stored, params, locale);

        expect(result.interpolated).toBe(interpolated);
      });
    }

    if ('rendered' in expected) {
      it('renders through both runtime passes', () => {
        const result = roundTripStoredValue(stored, params, locale);

        if (!result.ok) {
          throw new Error(`${result.stage} failed: ${result.error.message}\ninterpolated: ${result.interpolated}`);
        }

        expect(result.rendered).toBe(expected.rendered);
      });
    } else {
      it('is rejected by the ICU compiler', () => {
        const result = roundTripStoredValue(stored, params, locale);

        if (result.ok) {
          throw new Error(`expected a compile failure, rendered: ${result.rendered}`);
        }

        expect(result.stage).toBe('compile');
        expect(result.error.message).toMatch(expected.compileError);
      });
    }
  });

  it('substitutes the parameter value, not its name', () => {
    const result = roundTripStoredValue(DELETE_COUNT_PLURAL, { deleteCount: 1, itemName: 'Flood Risk' }, 'en');

    if (!result.ok) {
      throw new Error(`${result.stage} failed: ${result.error.message}\ninterpolated: ${result.interpolated}`);
    }

    expect(result.rendered).toContain('Flood Risk');
    expect(result.rendered).not.toContain('itemName');
  });

  it('substitutes an empty string for an unresolved name, as the runtime does', () => {
    expect(transpileInterpolations('Hello {{ name }}!', {})).toBe('Hello !');
  });
});
