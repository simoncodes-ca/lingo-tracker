import { describe, expect, it } from 'vitest';
import { classifyICUContent } from './icu-classifier';
import { translocoToICU } from './transloco-to-icu';

/** A value whose `select` branch body is exactly one argument, so branch and argument braces are adjacent. */
const PLACEHOLDER_ONLY_BRANCH_BODY =
  'This will delete {nameExists, select, hasName {{name}} other {this item}} and cannot be undone.';

describe('classifyICUContent', () => {
  describe('plain values', () => {
    it('classifies text with no braces as plain', () => {
      expect(classifyICUContent('Hello world')).toBe('plain');
    });

    it('classifies an empty string as plain', () => {
      expect(classifyICUContent('')).toBe('plain');
    });

    it('classifies an ICU-quoted brace as plain', () => {
      expect(classifyICUContent("Use '{' to open a set")).toBe('plain');
    });
  });

  describe('simple placeholder values', () => {
    it('classifies a single ICU argument as simple placeholders', () => {
      expect(classifyICUContent('Hello {name}')).toBe('simple-placeholders');
    });

    it('classifies a Transloco placeholder as simple placeholders', () => {
      expect(classifyICUContent('Hello {{ name }}')).toBe('simple-placeholders');
    });

    it('classifies several arguments as simple placeholders', () => {
      expect(classifyICUContent('{count} of {total} items')).toBe('simple-placeholders');
    });

    it('classifies a numeric argument as simple placeholders', () => {
      expect(classifyICUContent('Hello {0}')).toBe('simple-placeholders');
    });
  });

  describe('plural and select values', () => {
    it('classifies a plural group as complex ICU', () => {
      expect(classifyICUContent('{count, plural, one {# item} other {# items}}')).toBe('complex-icu');
    });

    it('classifies a select group as complex ICU', () => {
      expect(classifyICUContent('{gender, select, male {he} female {she} other {they}}')).toBe('complex-icu');
    });

    it('classifies a placeholder mixed with a plural group as complex ICU', () => {
      expect(classifyICUContent('Hello {{ name }}, {count, plural, one {# item} other {# items}}')).toBe('complex-icu');
    });

    it('classifies an unbalanced brace as complex ICU', () => {
      expect(classifyICUContent('Hello {name')).toBe('complex-icu');
    });
  });

  describe('placeholder-only branch bodies', () => {
    it('classifies a select branch body that is only a placeholder as complex ICU', () => {
      expect(classifyICUContent(PLACEHOLDER_ONLY_BRANCH_BODY)).toBe('complex-icu');
    });

    it('classifies a plural branch body that is only a placeholder as complex ICU', () => {
      expect(classifyICUContent('{itemCount, plural, =1 {{itemName}} other {# items}}')).toBe('complex-icu');
    });

    it('classifies the same whether or not the value has been normalized', () => {
      const normalized = translocoToICU(PLACEHOLDER_ONLY_BRANCH_BODY);

      expect(classifyICUContent(normalized)).toBe(classifyICUContent(PLACEHOLDER_ONLY_BRANCH_BODY));
    });

    it('classifies the same after repeated normalization', () => {
      const once = translocoToICU(PLACEHOLDER_ONLY_BRANCH_BODY);
      const twice = translocoToICU(once);

      expect(twice).toBe(once);
      expect(classifyICUContent(twice)).toBe(classifyICUContent(PLACEHOLDER_ONLY_BRANCH_BODY));
    });
  });
});

it('classifies natural apostrophes around a simple argument', () => {
  expect(classifyICUContent("don't {name} isn't")).toBe('simple-placeholders');
});

describe('round-1 classifier pins', () => {
  it('treats ordinary apostrophes before arguments as literal', () => {
    expect(classifyICUContent("it's {name}")).toBe('simple-placeholders');
  });
  it('recognizes an argument after an incomplete quote', () => {
    expect(classifyICUContent("'{pa}")).toBe('simple-placeholders');
  });
  // The addendum accepted `plain` here; the tree classifier matches HEAD instead, so no
  // behaviour change remains to accept. A dotted name is a brace frame with no comma.
  it('classifies an invalid dotted stored argument as HEAD does', () => {
    expect(classifyICUContent('{a.b}')).toBe('simple-placeholders');
  });
  it('classifies brace text without a formatter comma as HEAD does', () => {
    expect(classifyICUContent('a } b')).toBe('plain');
    expect(classifyICUContent('{{{name}}}')).toBe('simple-placeholders');
    expect(classifyICUContent('{a {{x}}}')).toBe('simple-placeholders');
    expect(classifyICUContent('x {{a}} }')).toBe('simple-placeholders');
  });
  // HEAD skipped from an apostrophe to the next one, hiding the brace. The tree reads an
  // apostrophe as ICU does (allow-list 2), so the unclosed brace is skipped as malformed.
  it('skips an unclosed brace after a lone apostrophe as complex', () => {
    expect(classifyICUContent("'{")).toBe('complex-icu');
  });
  it('skips a malformed frame holding a formatted argument as complex', () => {
    expect(classifyICUContent("{a '{' {n,number}}")).toBe('complex-icu');
  });
  it('skips a brace holding only a no-break space as complex, as HEAD does', () => {
    expect(classifyICUContent('{\u00a0}')).toBe('complex-icu');
  });
  it('skips a lone or empty brace as complex, as HEAD does', () => {
    expect(classifyICUContent('{')).toBe('complex-icu');
    expect(classifyICUContent('{}')).toBe('complex-icu');
  });
});

describe('outer-frame rule (develop outputs)', () => {
  // I4: a closed, non-blank top-level frame without a comma of its own is simple, whatever it nests.
  for (const value of ['{outer {x,number}}', '{outer {n, plural, other {x}}}', '{a {b, c}}']) {
    it(`classifies ${value} as simple placeholders, as develop does`, () => {
      expect(classifyICUContent(value)).toBe('simple-placeholders');
    });
  }
  for (const value of ['{a b}', '{{{a}}}', '{ {{a}} }', '{a {{x}}}']) {
    it(`classifies ${value} as simple placeholders`, () => {
      expect(classifyICUContent(value)).toBe('simple-placeholders');
    });
  }
  for (const value of ["{a '{' {n,number}}", '{a, b}', '{ }', '{}', '{outer {x,number}']) {
    it(`classifies ${value} as complex ICU`, () => {
      expect(classifyICUContent(value)).toBe('complex-icu');
    });
  }
  for (const value of ['x}y', "'#{'"]) {
    it(`classifies ${value} as plain`, () => {
      expect(classifyICUContent(value)).toBe('plain');
    });
  }
  // I5: a value deeper than the parser's capacity is skipped, as develop does.
  it('classifies a value nested beyond the parser capacity as complex ICU', () => {
    expect(classifyICUContent(`x${'{'.repeat(20000)}`)).toBe('complex-icu');
  });
});
