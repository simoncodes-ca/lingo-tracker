import * as fc from 'fast-check';

export const identifier = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'), {
    minLength: 1,
    maxLength: 12,
  })
  .map((characters) => `p${characters.join('')}`);

export const messageText = fc
  .array(fc.constantFrom('hello ', ' world', "don't ", "l'objet ", '#', ' ', '\n', '日本語', '🙂'), { maxLength: 5 })
  .map((chunks) => chunks.join(''));

const argument = identifier.map((name) => `{${name}}`);
const leaf = fc.oneof(
  messageText,
  argument,
  fc.tuple(messageText, argument, messageText).map((parts) => parts.join('')),
);

function group(body: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc.tuple(fc.constantFrom('plural', 'select', 'selectordinal'), body, body).map(([kind, first, other]) => {
    const name = kind === 'select' ? 'gender' : 'count';
    const selector = kind === 'select' ? 'chosen' : 'one';
    return `{${name}, ${kind}, ${selector} {${first}} other {${other}}}`;
  });
}

// Formatted arguments alone in branch bodies have no Transloco runtime encoding (see the scanner contract).
export const supportedMessage = fc
  .array(fc.oneof(leaf, group(fc.oneof(leaf, group(leaf)))), { minLength: 1, maxLength: 4 })
  .map((parts) => parts.join(' '));

export const literalText = fc
  .array(
    fc.constantFrom(
      { icu: 'hello ', text: 'hello ' },
      { icu: "'{'literal'}'", text: '{literal}' },
      { icu: "it''s ", text: "it's " },
      { icu: '#', text: '#' },
      { icu: "'#'", text: '#' },
    ),
    { maxLength: 6 },
  )
  // Separators prevent adjacent closing/opening quotes from becoming a literal apostrophe escape.
  .map((parts) => ({ icu: parts.map((part) => part.icu).join(' '), text: parts.map((part) => part.text).join(' ') }));

// fast-check 4 exposes Unicode generation through string's unit option rather than fullUnicodeString.
export const arbitraryMessage = fc.oneof(
  fc.string(),
  fc.string({ unit: 'grapheme' }),
  fc.string({ unit: fc.integer({ min: 0, max: 0xffff }).map((code) => String.fromCharCode(code)) }),
  fc
    .array(fc.constantFrom('{', '}', "'", '#', ',', ' ', 'name', 'plural', 'select', 'other'), { maxLength: 80 })
    .map((parts) => parts.join('')),
);

// Dense punctuation exposes lexical interactions that separated valid messages do not.
const icuishLeaf = fc
  .array(fc.oneof(fc.constantFrom("'", '{', '}', '#', '|', ' ', 'a', "''", "'#'", "'{x}", "'#''x'"), argument), {
    maxLength: 12,
  })
  .map((parts) => parts.join(''));

function icuishGroup(body: fc.Arbitrary<string>, includeNumericCases = false): fc.Arbitrary<string> {
  // A bare argument body, e.g. {x}, and unpadded braces reach placeholder-only branch handling.
  const branch = fc.oneof(body, argument);
  return fc
    .tuple(
      fc.constantFrom('plural', 'select', 'selectordinal'),
      branch,
      branch,
      fc.boolean(),
      fc.integer({ min: 0, max: includeNumericCases ? 18 : 11 }),
      fc.constantFrom('0', '2', '12', '-1', '+1', '1.5', '.5', '1e2'),
      fc.constantFrom('zero', 'one', 'two', 'few', 'many', 'other'),
    )
    .map(([kind, first, other, padded, variant, number, category]) => {
      const name = kind === 'select' ? 'gender' : 'count';
      const selector = kind === 'select' ? 'chosen' : category;
      // Padding makes nested structural braces distinguishable from the Part A delimiters.
      const pad = padded ? ' ' : '';
      const firstBody = `{${pad}${first}${pad}}`;
      const otherBody = `{${pad}${other}${pad}}`;
      const cases = [
        `${selector} ${firstBody} other ${otherBody}`,
        `${selector} x other ${otherBody}`,
        `${selector} ${firstBody} ${otherBody} other {z}`,
        `other ${firstBody}${otherBody}`,
        '',
        `${selector} ${firstBody}`,
        `=x ${firstBody} other ${otherBody}`,
        `foo ${firstBody} other ${otherBody}`,
        `other ${firstBody} offset:1`,
        `offset:1 offset:2 other ${otherBody}`,
        `offset:1 ${selector} ${firstBody} other ${otherBody}`,
        `other ${firstBody} other ${otherBody}`,
        `=${number} ${firstBody} other ${otherBody}`,
        `offset:${number} other ${otherBody}`,
        `offset:${number}other ${otherBody}`,
        `offset :${number} other ${otherBody}`,
        `offset: ${number}=${number} ${firstBody} other ${otherBody}`,
        `offset:${number} ${selector} ${firstBody} other ${otherBody}`,
        `=${number} ${firstBody} =${number} ${otherBody} other {fallback}`,
      ];
      return `{${name}, ${kind}, ${cases[variant]}${pad}}`;
    });
}

export const icuishMessage = fc
  .array(fc.oneof(icuishLeaf, icuishGroup(fc.oneof(icuishLeaf, icuishGroup(icuishLeaf)))), {
    minLength: 1,
    maxLength: 4,
  })
  .map((parts) => parts.join(''));

const typedArgument = fc.oneof(
  fc.constantFrom(
    '{count, number}',
    '{count, number, integer}',
    "{count, number, 'a}",
    "{count, number, ''}",
    "{count, number, 'a'0}",
    "{count, number, ''''}",
    '{count, number, percent}',
    '{count, number, currency}',
    '{count, number, ::currency/USD}',
    '{count, date}',
    '{count, date, short}',
    '{count, date, full}',
    '{count, time}',
    '{count, time, short}',
    '{count, time, full}',
    '{count, spellout}',
    '{count, ordinal}',
    '{count, duration}',
    '{count, unknown}',
    "{count, number, '#{pa}'}",
    "{count, date, '#{pa}'}",
    "{count, time, '#{pa}'}",
  ),
  fc
    .tuple(identifier, fc.constantFrom('number', 'date', 'time', 'spellout', 'ordinal', 'duration', 'unknown'))
    .map(([name, type]) => `{${name}, ${type}}`),
);

const unicodeIdentifier = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_日本語éЖالعربية🙂'), {
    minLength: 1,
    maxLength: 12,
  })
  .map((characters) => `p${characters.join('')}`);

const runtimeIdentifier = fc.oneof(identifier, unicodeIdentifier);
const headerWhitespace = fc.constantFrom('', ' ', '\t', '\n', '\r\n', '\v', '\f', '\u2028', '\u2029');
const supportedFormat = fc.constantFrom('number', 'date', 'time', 'duration');

const validArgument = fc
  .tuple(runtimeIdentifier, headerWhitespace, fc.option(supportedFormat))
  .map(([name, pad, type]) => (type === null ? `{${pad}${name}${pad}}` : `{${pad}${name}${pad},${pad}${type}${pad}}`));

const variedArgument = fc
  .tuple(
    fc.oneof(
      runtimeIdentifier,
      runtimeIdentifier.map((name) => `${name}.part`),
    ),
    headerWhitespace,
    fc.option(fc.constantFrom('number', 'date', 'time', 'duration', 'spellout', 'ordinal', 'unknown')),
  )
  .map(([name, pad, type]) => (type === null ? `{${pad}${name}${pad}}` : `{${pad}${name}${pad},${pad}${type}${pad}}`));

function validRuntimeGroup(body: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc
    .tuple(
      runtimeIdentifier,
      headerWhitespace,
      fc.constantFrom('plural', 'select', 'selectordinal'),
      fc.constantFrom('zero', 'one', 'two', 'few', 'many', 'other', '=2'),
      fc.option(fc.nat({ max: 12 })),
      body,
      body,
    )
    .map(([name, pad, type, category, offset, first, other]) => {
      const selector = type === 'select' ? 'chosen' : category;
      const offsetText = type !== 'select' && offset !== null ? `offset:${pad}${offset}${pad}` : '';
      return `{${pad}${name}${pad},${pad}${type}${pad},${pad}${offsetText}${selector}${pad}{${first}}${pad}other${pad}{${other}}${pad}}`;
    });
}

const validRuntimeLeaf = fc.oneof(
  messageText,
  validArgument,
  literalText.map(({ icu }) => icu),
);
// This grammar uses standard ICU syntax and built-in runtime formats, independent of English categories.
export const knownValidRuntimeMessage = fc
  .array(
    fc.oneof(
      validRuntimeLeaf,
      validRuntimeGroup(
        fc.oneof(validRuntimeLeaf, validRuntimeGroup(fc.oneof(validRuntimeLeaf, validRuntimeGroup(validRuntimeLeaf)))),
      ),
    ),
    { minLength: 1, maxLength: 4 },
  )
  .map((parts) => parts.join(' '));

export const quoteStressMessage = fc
  .tuple(
    fc.constantFrom("'x''#{", "'x''#{pa}'", "'#{", "'#{pa}'", "''#{pa}", "'#''{pa}'", "'{'"),
    fc.array(fc.constantFrom("'", "''", '#', '{', '}', '{pa}', 'x', ' '), { maxLength: 12 }),
    fc.constantFrom(
      'root',
      'select',
      'plural',
      'nestedSelect',
      'style',
      'pluralStyle',
      'numberStyle',
      'pluralNumberStyle',
    ),
  )
  .map(([start, chunks, context]) => {
    const body = start + chunks.join('');
    switch (context) {
      case 'select':
        return `{s, select, other {${body}}}`;
      case 'plural':
        return `{n, plural, other {${body}}}`;
      case 'nestedSelect':
        return `{n, plural, other {{s, select, other {${body}}}}}`;
      case 'style':
        return `{n, duration, ${body}}`;
      case 'pluralStyle':
        return `{n, plural, other {{n, duration, ${body}}}}`;
      case 'numberStyle':
        return `{n, number, ${body}}`;
      case 'pluralNumberStyle':
        return `{n, plural, other {{n, number, ${body}}}}`;
      default:
        return body;
    }
  });

// Compilation also covers formatted branch bodies that the two-pass renderer cannot carry.
const compilationLeaf = fc.oneof(icuishLeaf, typedArgument, variedArgument);
export const icuishCompilationMessage = fc
  .array(
    fc.oneof(
      icuishMessage,
      compilationLeaf,
      knownValidRuntimeMessage,
      variedArgument,
      icuishGroup(fc.oneof(compilationLeaf, icuishGroup(compilationLeaf, true)), true),
    ),
    {
      minLength: 1,
      maxLength: 4,
    },
  )
  .map((parts) => parts.join(''));

// Unicode whitespace around header tokens of otherwise valid messages. U+00A0, U+2000–U+200A
// and U+FEFF are whitespace and name characters at once; U+2028/9 are whitespace only;
// U+200E/F are pattern whitespace that JavaScript's \s does not match.
const unicodeHeaderSpace = fc.constantFrom('', '', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '‎', '‏', '﻿', '\v', '\f');
const unicodePad = fc.array(unicodeHeaderSpace, { maxLength: 2 }).map((parts) => parts.join(''));

const unicodeSpacedArgument = fc
  .tuple(identifier, fc.array(unicodePad, { minLength: 4, maxLength: 4 }), fc.option(supportedFormat), fc.boolean())
  .map(([name, [a, b, c, d], type, transloco]) => {
    if (transloco) return `{{${a}${name}${b}}}`;
    return type === null ? `{${a}${name}${b}}` : `{${a}${name}${b},${c}${type}${d}}`;
  });

function unicodeSpacedGroup(body: fc.Arbitrary<string>): fc.Arbitrary<string> {
  return fc
    .tuple(
      identifier,
      fc.constantFrom('plural', 'select', 'selectordinal'),
      fc.constantFrom('zero', 'one', 'two', 'few', 'many', 'other', '=2'),
      fc.option(fc.nat({ max: 12 })),
      fc.array(unicodePad, { minLength: 9, maxLength: 9 }),
      body,
      body,
    )
    .map(([name, type, category, offset, pads, first, other]) => {
      const [p0, p1, p2, p3, p4, p5, p6, p7, p8] = pads;
      const selector = type === 'select' ? 'chosen' : category;
      const offsetText = type !== 'select' && offset !== null ? `offset:${p4}${offset}${p5}` : '';
      return `{${p0}${name}${p1},${p2}${type}${p3},${p4}${offsetText}${selector}${p6}{${first}}${p7}other${p8}{${other}}${p0}}`;
    });
}

const unicodeSpacedLeaf = fc.oneof(messageText, unicodeSpacedArgument);
export const unicodeSpacedMessage = fc
  .array(
    fc.oneof(unicodeSpacedLeaf, unicodeSpacedGroup(fc.oneof(unicodeSpacedLeaf, unicodeSpacedGroup(unicodeSpacedLeaf)))),
    { minLength: 1, maxLength: 4 },
  )
  .map((parts) => parts.join(' '));

// Selectors the strict grammar accepts but an ASCII-only, space-after-offset rule rejects:
// `offset:N` glued to the category or `=N`, and select keys outside ASCII. Each first case
// body is only a Transloco-era `{{name}}`.
export const gluedSelectorMessage = fc
  .tuple(
    fc.boolean(),
    identifier,
    fc.nat({ max: 12 }),
    fc.constantFrom('', ' '),
    fc.constantFrom('zero', 'one', 'two', 'few', 'many', '=0', '=2', '=12'),
    fc.constantFrom('männlich', 'weiblich', '日本', 'é', 'Жена', 'chosen'),
    fc.constantFrom('', ' '),
    messageText,
    messageText,
  )
  .map(([plural, name, offset, glue, category, key, pad, other, text]) => {
    const cases = plural
      ? `offset:${offset}${glue}${category}${pad}{{${name}}} other {${other}}`
      : `${key}${pad}{{${name}}} other {${other}}`;
    return `${text}{${plural ? 'count, plural' : 'gender, select'}, ${cases}}`;
  });
