import { describe, it, expect } from 'vitest';
import { extractICUPlaceholders, hasICUPlaceholders, autoFixICUPlaceholders } from './icu-auto-fixer';

describe('extractICUPlaceholders \u2014 ICU quote escaping', () => {
  it('extracts a placeholder from a string containing a natural apostrophe', () => {
    const result = extractICUPlaceholders("don't have {count} items");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(1);
    expect(result.placeholders[0].name).toBe('count');
  });

  it('returns zero placeholders for a plain string with an apostrophe', () => {
    const result = extractICUPlaceholders("it's fine");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(0);
  });

  it('extracts a placeholder from a French string with an apostrophe', () => {
    const result = extractICUPlaceholders("l'objet {name}");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(1);
    expect(result.placeholders[0].name).toBe('name');
  });

  it('returns zero placeholders for a bare contraction', () => {
    const result = extractICUPlaceholders("can't");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(0);
  });

  it('returns zero placeholders when braces are fully ICU-escaped', () => {
    // '{'literal'}' \u2014 all braces are inside quoted sections
    const result = extractICUPlaceholders("'{'literal'}'");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(0);
  });

  it('returns only the real placeholder when some braces are escaped', () => {
    // '{'name'}' is {realVar} \u2014 first pair is escaped, second is a real placeholder
    const result = extractICUPlaceholders("'{'name'}' is {realVar}");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(1);
    expect(result.placeholders[0].name).toBe('realVar');
  });

  it('returns zero placeholders for a double-apostrophe literal', () => {
    // '' is a literal apostrophe \u2014 no section is opened, no braces follow
    const result = extractICUPlaceholders("''");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(0);
  });

  it('treats a double-apostrophe as a literal and still finds the following placeholder', () => {
    // it''s {name} \u2014 the '' is a literal apostrophe, not a section toggle
    const result = extractICUPlaceholders("it''s {name}");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(1);
    expect(result.placeholders[0].name).toBe('name');
  });

  it('returns success: false for a string ending with an open quoted section', () => {
    // '{ opens a quoted section that is never closed
    const result = extractICUPlaceholders("foo '{");
    expect(result.success).toBe(false);
    expect(result.error).toBe('Unclosed quoted section');
  });

  it('returns success with zero placeholders for a trailing lone apostrophe', () => {
    // "don'" \u2014 trailing ' is not followed by a syntax char, treated as literal
    const result = extractICUPlaceholders("don'");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(0);
  });

  it("recognises '#' as a syntax char that lets \"'\" start a quoted section", () => {
    // "'#' is literal" \u2014 '#' triggers the quoted section, so '#' is treated as plain text
    const result = extractICUPlaceholders("'#' is literal");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(0);
  });
});

describe('hasICUPlaceholders \u2014 ICU quote escaping', () => {
  it('returns true when a real placeholder follows a natural apostrophe', () => {
    expect(hasICUPlaceholders("don't touch {name}")).toBe(true);
  });

  it('returns false for a plain string with apostrophes and no braces', () => {
    expect(hasICUPlaceholders("don't touch anything")).toBe(false);
  });

  it('returns false when all braces are ICU-escaped', () => {
    expect(hasICUPlaceholders("'{'literal'}'")).toBe(false);
  });

  it('returns true when a real placeholder exists alongside escaped braces', () => {
    expect(hasICUPlaceholders("'{'name'}' is {realVar}")).toBe(true);
  });

  it('returns false for a double-apostrophe with no following braces', () => {
    expect(hasICUPlaceholders("it''s fine")).toBe(false);
  });

  it('returns true when a real placeholder follows a double-apostrophe', () => {
    expect(hasICUPlaceholders("it''s {name}")).toBe(true);
  });

  it('returns false for a string with an unclosed quoted section', () => {
    // malformed string \u2014 no valid placeholder can be detected
    expect(hasICUPlaceholders("foo '{")).toBe(false);
  });

  it('returns false for a trailing lone apostrophe', () => {
    expect(hasICUPlaceholders("don'")).toBe(false);
  });
});

describe('autoFixICUPlaceholders \u2014 end-to-end regression', () => {
  it('fixes a renamed ICU placeholder in a French translation with a natural apostrophe', () => {
    const result = autoFixICUPlaceholders("don't have {count} items", "n'a pas {nombre} articles");
    expect(result.wasFixed).toBe(true);
    expect(result.value).toContain('{count}');
    expect(result.value).not.toContain('{nombre}');
  });
});
