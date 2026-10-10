import MessageFormat from '@messageformat/core';
import { describe, expect, it } from 'vitest';
import {
  autoFixICUPlaceholders,
  autoFixTranslocoPlaceholders,
  extractICUPlaceholders,
  extractTranslocoPlaceholders,
  hasICUPlaceholders,
  hasTranslocoPlaceholders,
  validateICUSyntax,
} from './icu-auto-fixer';
import { icuToTransloco } from './icu-to-transloco';

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

  it('reports an unclosed live brace after an unmatched apostrophe', () => {
    // Without a closing apostrophe, the brace remains live.
    const result = extractICUPlaceholders("foo '{");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Unquoted '{' does not start an argument at position 5");
  });

  it('returns success with zero placeholders for a trailing lone apostrophe', () => {
    // "don'" \u2014 trailing ' is not followed by a syntax char, treated as literal
    const result = extractICUPlaceholders("don'");
    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(0);
  });

  it('preserves a literal apostrophe before # at top level', () => {
    // # does not start an ICU quote outside a plural body.
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

  it('detects a live brace after an unmatched apostrophe', () => {
    // The quick predicate detects the brace; extraction reports malformed syntax.
    expect(hasICUPlaceholders("foo '{")).toBe(true);
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

describe('extractICUPlaceholders — sub-message classification', () => {
  const CLASSIFICATION_CASES: readonly { value: string; name: string; type: string }[] = [
    { value: '{count, plural, one {# item} other {# items}}', name: 'count', type: 'plural' },
    { value: '{gender, select, male {he} other {they}}', name: 'gender', type: 'select' },
    { value: '{rank, selectordinal, one {#st} other {#th}}', name: 'rank', type: 'selectordinal' },
  ];

  for (const { value, name, type } of CLASSIFICATION_CASES) {
    it(`classifies a ${type} group as ${type}`, () => {
      const result = extractICUPlaceholders(value);

      expect(result.placeholders).toHaveLength(1);
      expect(result.placeholders[0]?.type).toBe(type);
      expect(result.placeholders[0]?.name).toBe(name);
    });
  }
});

describe('autoFixICUPlaceholders — sub-message format rewriting', () => {
  it('rewrites a nested placeholder name inside a selectordinal format', () => {
    const result = autoFixICUPlaceholders(
      '{rank, selectordinal, one {#st} other {place {rank}}}',
      '{rang, selectordinal, one {#er} other {place {rang}}}',
    );

    expect(result.wasFixed).toBe(true);
    expect(result.value).toBe('{rank, selectordinal, one {#er} other {place {rank}}}');
  });
});

describe('icu-auto-fixer', () => {
  describe('hasICUPlaceholders', () => {
    it('should detect simple placeholders', () => {
      expect(hasICUPlaceholders('Hello {name}')).toBe(true);
      expect(hasICUPlaceholders('You have {count} items')).toBe(true);
      expect(hasICUPlaceholders('{0} of {1}')).toBe(true);
    });

    it('should detect plural placeholders', () => {
      expect(hasICUPlaceholders('{count, plural, one {# item} other {# items}}')).toBe(true);
    });

    it('should detect select placeholders', () => {
      expect(hasICUPlaceholders('{gender, select, male {he} female {she} other {they}}')).toBe(true);
    });

    it('should return false for strings without placeholders', () => {
      expect(hasICUPlaceholders('Hello world')).toBe(false);
      expect(hasICUPlaceholders('No placeholders here')).toBe(false);
      expect(hasICUPlaceholders('')).toBe(false);
    });

    it('should ignore escaped braces', () => {
      expect(hasICUPlaceholders("This is '{not a placeholder}'")).toBe(false);
      expect(hasICUPlaceholders("'{literal braces}' are ignored")).toBe(false);
    });

    it('should detect mixed escaped and real placeholders', () => {
      expect(hasICUPlaceholders("'{escaped}' and {real}")).toBe(true);
    });
  });

  describe('extractICUPlaceholders', () => {
    describe('simple placeholders', () => {
      it('should extract single placeholder', () => {
        const result = extractICUPlaceholders('Hello {name}');

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(1);
        expect(result.placeholders[0].name).toBe('name');
        expect(result.placeholders[0].type).toBe('simple');
        expect(result.placeholders[0].fullText).toBe('{name}');
        expect(result.textSegments).toEqual(['Hello ', '']);
      });

      it('should extract multiple placeholders', () => {
        const result = extractICUPlaceholders('Hello {firstName} {lastName}');

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(2);
        expect(result.placeholders[0].name).toBe('firstName');
        expect(result.placeholders[1].name).toBe('lastName');
        expect(result.textSegments).toEqual(['Hello ', ' ', '']);
      });

      it('should extract numeric placeholders', () => {
        const result = extractICUPlaceholders('{0} of {1}');

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(2);
        expect(result.placeholders[0].name).toBe('0');
        expect(result.placeholders[1].name).toBe('1');
      });

      it('should handle placeholder at start', () => {
        const result = extractICUPlaceholders('{name} is here');

        expect(result.success).toBe(true);
        expect(result.textSegments[0]).toBe('');
        expect(result.textSegments[1]).toBe(' is here');
      });

      it('should handle placeholder at end', () => {
        const result = extractICUPlaceholders('Hello {name}');

        expect(result.success).toBe(true);
        expect(result.textSegments[0]).toBe('Hello ');
        expect(result.textSegments[1]).toBe('');
      });

      it('should handle consecutive placeholders', () => {
        const result = extractICUPlaceholders('{firstName}{lastName}');

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(2);
        expect(result.textSegments).toEqual(['', '', '']);
      });
    });

    describe('plural placeholders', () => {
      it('should extract plural placeholder', () => {
        const result = extractICUPlaceholders('{count, plural, one {# item} other {# items}}');

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(1);
        expect(result.placeholders[0].name).toBe('count');
        expect(result.placeholders[0].type).toBe('plural');
        expect(result.placeholders[0].fullText).toBe('{count, plural, one {# item} other {# items}}');
      });

      it('should extract plural with surrounding text', () => {
        const result = extractICUPlaceholders('You have {count, plural, one {# item} other {# items}} in cart');

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(1);
        expect(result.textSegments).toEqual(['You have ', ' in cart']);
      });

      it('should extract complex plural with zero case', () => {
        const result = extractICUPlaceholders('{count, plural, =0 {no items} one {# item} other {# items}}');

        expect(result.success).toBe(true);
        expect(result.placeholders[0].type).toBe('plural');
      });
    });

    describe('select placeholders', () => {
      it('should extract select placeholder', () => {
        const result = extractICUPlaceholders('{gender, select, male {he} female {she} other {they}}');

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(1);
        expect(result.placeholders[0].name).toBe('gender');
        expect(result.placeholders[0].type).toBe('select');
      });

      it('should extract select with surrounding text', () => {
        const result = extractICUPlaceholders(
          'The user said {gender, select, male {he is} female {she is} other {they are}} happy',
        );

        expect(result.success).toBe(true);
        expect(result.textSegments).toEqual(['The user said ', ' happy']);
      });
    });

    describe('number/date/time formatters', () => {
      it('should extract number formatter', () => {
        const result = extractICUPlaceholders('Price: {price, number, currency}');

        expect(result.success).toBe(true);
        expect(result.placeholders[0].name).toBe('price');
        expect(result.placeholders[0].type).toBe('number');
      });

      it('should extract date formatter', () => {
        const result = extractICUPlaceholders('Date: {today, date, short}');

        expect(result.success).toBe(true);
        expect(result.placeholders[0].type).toBe('date');
      });

      it('should extract time formatter', () => {
        const result = extractICUPlaceholders('Time: {now, time, medium}');

        expect(result.success).toBe(true);
        expect(result.placeholders[0].type).toBe('time');
      });
    });

    describe('escaped braces', () => {
      it('should ignore escaped braces in text', () => {
        const result = extractICUPlaceholders("This is '{not a placeholder}'");

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(0);
        expect(result.textSegments).toEqual(["This is '{not a placeholder}'"]);
      });

      it('should handle mixed escaped and real placeholders', () => {
        const result = extractICUPlaceholders("'{escaped}' and {real}");

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(1);
        expect(result.placeholders[0].name).toBe('real');
      });
    });

    describe('nested patterns', () => {
      it('should handle nested plural with placeholders inside', () => {
        const result = extractICUPlaceholders(
          '{count, plural, one {You have {count} item} other {You have {count} items}}',
        );

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(1);
        expect(result.placeholders[0].type).toBe('plural');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        const result = extractICUPlaceholders('');

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(0);
        expect(result.textSegments).toEqual(['']);
      });

      it('should handle string with no placeholders', () => {
        const result = extractICUPlaceholders('Just plain text');

        expect(result.success).toBe(true);
        expect(result.placeholders).toHaveLength(0);
        expect(result.textSegments).toEqual(['Just plain text']);
      });

      it('should handle whitespace in placeholders', () => {
        const result = extractICUPlaceholders('Hello { name }');

        expect(result.success).toBe(true);
        expect(result.placeholders[0].name).toBe('name');
      });

      it('should detect unmatched opening brace', () => {
        const result = extractICUPlaceholders('Hello {name');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Unclosed placeholder');
      });

      it('should detect unmatched closing brace', () => {
        const result = extractICUPlaceholders('Hello name}');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Unmatched closing brace');
      });
    });
  });

  describe('validateICUSyntax', () => {
    it('rejects unquoted literal braces recursively and reports their position', () => {
      for (const value of [
        '{count, plural, one {x} other {{}}}',
        '{count, plural, one {{pa}} other {{{pa}}}}',
        '{count, plural, one {{pa}} other {{count, plural, one {{pa}} other {{}}}}}',
        '{}',
        '{ }',
        '{{pa}}',
        '{count, plural, other {{ }}}',
        '{count, plural, other {x} } }',
        '{count, plural, other {{some text}}}',
      ]) {
        expect(validateICUSyntax(value)).toBe(false);
        expect(icuToTransloco(value)).toBe(value);
        const extracted = extractICUPlaceholders(value);
        expect(extracted.success).toBe(false);
        expect(extracted.placeholders).toEqual([]);
        expect(extracted.error).toMatch(
          /(?:Unquoted '\{' does not start an argument|Unmatched closing brace) at position \d+/,
        );
      }
    });

    it('accepts structural branch braces, nested arguments and quoted literals', () => {
      for (const value of [
        '{count, plural, =1 {{item}} other {# items}}',
        "l''{count, plural, =1 {{item}} other {#}}",
        "{count, plural, one {'{'{item}} other {#}}",
        "'{}'",
        "{n, plural, one {'{}'} other {x}}",
        '{n, plural, one {{s, select, chosen {{item}} other {{0}}}} other {{itemName}}}',
        '{rank, selectordinal, one {{item}} other {{itemName}}}',
        '{0} {itemName} {日本語} { n, number, integer }',
      ]) {
        expect(validateICUSyntax(value)).toBe(true);
        expect(extractICUPlaceholders(value).success).toBe(true);
      }
    });

    it('should validate correct ICU syntax', () => {
      expect(validateICUSyntax('Hello {name}')).toBe(true);
      expect(validateICUSyntax('{count, plural, one {# item} other {# items}}')).toBe(true);
      expect(validateICUSyntax('No placeholders')).toBe(true);
    });

    it('should reject invalid ICU syntax', () => {
      expect(validateICUSyntax('Hello {name')).toBe(false);
      expect(validateICUSyntax('Hello name}')).toBe(false);
      expect(validateICUSyntax('Hello {{{name}}}')).toBe(false);
    });
  });

  describe('autoFixICUPlaceholders', () => {
    describe('no fix needed', () => {
      it('should return unchanged if base has no placeholders', () => {
        const result = autoFixICUPlaceholders('Hello world', 'Hola mundo');

        expect(result.wasFixed).toBe(false);
        expect(result.value).toBe('Hola mundo');
      });

      it('should return unchanged if placeholders already match', () => {
        const result = autoFixICUPlaceholders('Hello {name}', 'Hola {name}');

        expect(result.wasFixed).toBe(false);
        expect(result.value).toBe('Hola {name}');
      });

      it('should return unchanged if plural placeholders match', () => {
        const result = autoFixICUPlaceholders(
          '{count, plural, one {# item} other {# items}}',
          '{count, plural, one {# elemento} other {# elementos}}',
        );

        expect(result.wasFixed).toBe(false);
        expect(result.value).toBe('{count, plural, one {# elemento} other {# elementos}}');
      });
    });

    describe('simple placeholder replacement', () => {
      it('should fix renamed placeholder', () => {
        const result = autoFixICUPlaceholders('Hello {name}', 'Hola {nombre}');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Hola {name}');
        expect(result.description).toContain('{nombre} → {name}');
        expect(result.originalPlaceholders).toEqual(['{nombre}']);
        expect(result.fixedPlaceholders).toEqual(['{name}']);
      });

      it('should fix multiple renamed placeholders', () => {
        const result = autoFixICUPlaceholders('Hello {firstName} {lastName}', 'Hola {nombre} {apellido}');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Hola {firstName} {lastName}');
        expect(result.originalPlaceholders).toHaveLength(2);
        expect(result.fixedPlaceholders).toHaveLength(2);
      });

      it('should preserve translated text while fixing placeholders', () => {
        const result = autoFixICUPlaceholders('You have {count} items', 'Tienes {numero} elementos');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Tienes {count} elementos');
      });

      it('should fix placeholder with different position in translation', () => {
        const result = autoFixICUPlaceholders('{count} items in cart', 'Hay {cantidad} elementos en el carrito');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Hay {count} elementos en el carrito');
      });
    });

    describe('plural and select placeholder fixing', () => {
      it('should fix renamed plural placeholder', () => {
        const result = autoFixICUPlaceholders(
          '{count, plural, one {# item} other {# items}}',
          '{numero, plural, one {# elemento} other {# elementos}}',
        );

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('{count, plural, one {# elemento} other {# elementos}}');
        expect(result.description).toContain('{numero, plural');
      });

      it('should fix renamed select placeholder', () => {
        const result = autoFixICUPlaceholders(
          '{gender, select, male {he} female {she} other {they}}',
          '{genero, select, male {él} female {ella} other {ellos}}',
        );

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('{gender, select, male {él} female {ella} other {ellos}}');
      });

      it('should fix plural with surrounding text', () => {
        const result = autoFixICUPlaceholders(
          'You have {count, plural, one {# item} other {# items}} in cart',
          'Tienes {numero, plural, one {# elemento} other {# elementos}} en carrito',
        );

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Tienes {count, plural, one {# elemento} other {# elementos}} en carrito');
      });
    });

    describe('missing placeholders', () => {
      it('should insert single missing placeholder at end', () => {
        const result = autoFixICUPlaceholders('You have {count} items', 'Tienes items');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toContain('{count}');
        expect(result.description).toContain('Inserted missing placeholder');
      });

      it('should error on multiple missing placeholders', () => {
        const result = autoFixICUPlaceholders('Hello {firstName} {lastName}', 'Hola');

        expect(result.wasFixed).toBe(false);
        expect(result.error).toContain('missing 2 placeholders');
      });
    });

    describe('extra placeholders', () => {
      it('should error on extra placeholders', () => {
        const result = autoFixICUPlaceholders('Hello {name}', 'Hola {name} {extra}');

        expect(result.wasFixed).toBe(false);
        expect(result.error).toContain('extra placeholders');
      });
    });

    describe('malformed ICU syntax', () => {
      it('should error on malformed base value', () => {
        const result = autoFixICUPlaceholders('Hello {name', 'Hola {nombre}');

        expect(result.wasFixed).toBe(false);
        expect(result.error).toContain('Failed to parse base value');
      });

      it('should error on malformed translation value', () => {
        const result = autoFixICUPlaceholders('Hello {name}', 'Hola {nombre');

        expect(result.wasFixed).toBe(false);
        expect(result.error).toContain('Failed to parse translation value');
      });
    });

    describe('number/date/time formatters', () => {
      it('should fix renamed number formatter placeholder', () => {
        const result = autoFixICUPlaceholders('Price: {price, number, currency}', 'Precio: {precio, number, currency}');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Precio: {price, number, currency}');
      });

      it('should fix date formatter placeholder', () => {
        const result = autoFixICUPlaceholders('Date: {today, date, short}', 'Fecha: {hoy, date, short}');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Fecha: {today, date, short}');
      });
    });

    describe('edge cases', () => {
      it('should handle empty translation', () => {
        const result = autoFixICUPlaceholders('Hello {name}', '');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toContain('{name}');
      });

      it('should handle consecutive placeholders', () => {
        const result = autoFixICUPlaceholders('{firstName}{lastName}', '{nombre}{apellido}');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('{firstName}{lastName}');
      });

      it('should preserve whitespace in text segments', () => {
        const result = autoFixICUPlaceholders('Hello    {name}    world', 'Hola    {nombre}    mundo');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Hola    {name}    mundo');
      });
    });
  });

  describe('hasICUPlaceholders — Transloco exclusion', () => {
    it('should return false for a Transloco double-brace pattern', () => {
      expect(hasICUPlaceholders('Create {{ itemName }}?')).toBe(false);
      expect(hasICUPlaceholders('Hello {{ name }}')).toBe(false);
      expect(hasICUPlaceholders('{{ count }} items selected')).toBe(false);
    });

    it('should return true for a single-brace ICU pattern', () => {
      expect(hasICUPlaceholders('Create {itemName}?')).toBe(true);
      expect(hasICUPlaceholders('Hello {name}')).toBe(true);
    });

    it('should return false for plain text with no braces', () => {
      expect(hasICUPlaceholders('No placeholders here')).toBe(false);
    });

    it('should return false for empty double-brace {{}}', () => {
      expect(hasICUPlaceholders('text {{}}')).toBe(false);
    });
  });

  describe('hasTranslocoPlaceholders', () => {
    it('should detect single Transloco placeholder', () => {
      expect(hasTranslocoPlaceholders('Create {{ itemName }}?')).toBe(true);
    });

    it('should detect multiple Transloco placeholders', () => {
      expect(hasTranslocoPlaceholders('Hello {{ firstName }} {{ lastName }}')).toBe(true);
    });

    it('should detect placeholder with no spaces inside braces', () => {
      expect(hasTranslocoPlaceholders('{{count}} items')).toBe(true);
    });

    it('should return false for ICU single-brace patterns', () => {
      expect(hasTranslocoPlaceholders('Hello {name}')).toBe(false);
    });

    it('should return false for plain text', () => {
      expect(hasTranslocoPlaceholders('No placeholders')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(hasTranslocoPlaceholders('')).toBe(false);
    });
  });

  describe('extractTranslocoPlaceholders', () => {
    it('should extract a single placeholder with surrounding text', () => {
      const result = extractTranslocoPlaceholders('Create {{ itemName }}?');

      expect(result.success).toBe(true);
      expect(result.placeholders).toHaveLength(1);
      expect(result.placeholders[0].name).toBe('itemName');
      expect(result.placeholders[0].fullText).toBe('{{ itemName }}');
      expect(result.placeholders[0].startPosition).toBe(7);
      expect(result.placeholders[0].endPosition).toBe(21);
      expect(result.textSegments).toEqual(['Create ', '?']);
    });

    it('should extract multiple placeholders', () => {
      const result = extractTranslocoPlaceholders('Hello {{ firstName }} {{ lastName }}');

      expect(result.success).toBe(true);
      expect(result.placeholders).toHaveLength(2);
      expect(result.placeholders[0].name).toBe('firstName');
      expect(result.placeholders[1].name).toBe('lastName');
      expect(result.textSegments).toEqual(['Hello ', ' ', '']);
    });

    it('should extract placeholder at start', () => {
      const result = extractTranslocoPlaceholders('{{ count }} items selected');

      expect(result.success).toBe(true);
      expect(result.placeholders[0].name).toBe('count');
      expect(result.textSegments[0]).toBe('');
      expect(result.textSegments[1]).toBe(' items selected');
    });

    it('should extract placeholder at end', () => {
      const result = extractTranslocoPlaceholders('Welcome, {{ name }}');

      expect(result.success).toBe(true);
      expect(result.placeholders[0].name).toBe('name');
      expect(result.textSegments).toEqual(['Welcome, ', '']);
    });

    it('should return empty arrays for plain text', () => {
      const result = extractTranslocoPlaceholders('No placeholders');

      expect(result.success).toBe(true);
      expect(result.placeholders).toHaveLength(0);
      expect(result.textSegments).toEqual(['No placeholders']);
    });

    it('should handle placeholder without spaces inside braces', () => {
      const result = extractTranslocoPlaceholders('{{count}} items');

      expect(result.success).toBe(true);
      expect(result.placeholders[0].name).toBe('count');
    });
  });

  describe('autoFixTranslocoPlaceholders', () => {
    describe('no fix needed', () => {
      it('should return unchanged when base has no Transloco placeholders', () => {
        const result = autoFixTranslocoPlaceholders('Hello world', 'Hola mundo');

        expect(result.wasFixed).toBe(false);
        expect(result.value).toBe('Hola mundo');
      });

      it('should return unchanged when placeholders already match', () => {
        const result = autoFixTranslocoPlaceholders('Create {{ itemName }}?', 'Créer {{ itemName }} ?');

        expect(result.wasFixed).toBe(false);
        expect(result.value).toBe('Créer {{ itemName }} ?');
      });

      it('should return unchanged when multiple placeholders already match', () => {
        const result = autoFixTranslocoPlaceholders(
          'Hello {{ firstName }} {{ lastName }}',
          'Hola {{ firstName }} {{ lastName }}',
        );

        expect(result.wasFixed).toBe(false);
        expect(result.value).toBe('Hola {{ firstName }} {{ lastName }}');
      });

      it('should not fix when spacing differs but names match', () => {
        const result = autoFixTranslocoPlaceholders('Hello {{ name }}', 'Hola {{name}}');
        expect(result.wasFixed).toBe(false);
        expect(result.value).toBe('Hola {{name}}');
      });
    });

    describe('renamed placeholders', () => {
      it('should fix a single renamed placeholder', () => {
        const result = autoFixTranslocoPlaceholders('Create {{ itemName }}?', 'Créer {{ nomElement }} ?');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Créer {{ itemName }} ?');
        expect(result.originalPlaceholders).toEqual(['{{ nomElement }}']);
        expect(result.fixedPlaceholders).toEqual(['{{ itemName }}']);
      });

      it('should fix multiple renamed placeholders', () => {
        const result = autoFixTranslocoPlaceholders(
          'Hello {{ firstName }} {{ lastName }}',
          'Hola {{ nombre }} {{ apellido }}',
        );

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Hola {{ firstName }} {{ lastName }}');
        expect(result.originalPlaceholders).toHaveLength(2);
        expect(result.fixedPlaceholders).toHaveLength(2);
      });

      it('should preserve translated text segments while replacing placeholder names', () => {
        const result = autoFixTranslocoPlaceholders(
          'You have {{ count }} unread messages',
          'Sie haben {{ anzahl }} ungelesene Nachrichten',
        );

        expect(result.wasFixed).toBe(true);
        expect(result.value).toBe('Sie haben {{ count }} ungelesene Nachrichten');
      });
    });

    describe('missing placeholders', () => {
      it('should append a single missing placeholder at the end', () => {
        const result = autoFixTranslocoPlaceholders('Hello {{ name }}', 'Hola');

        expect(result.wasFixed).toBe(true);
        expect(result.value).toContain('{{ name }}');
        expect(result.description).toContain('Inserted missing placeholder');
      });

      it('should error when multiple placeholders are missing', () => {
        const result = autoFixTranslocoPlaceholders('Hello {{ firstName }} {{ lastName }}', 'Hola');

        expect(result.wasFixed).toBe(false);
        expect(result.error).toContain('missing 2 placeholders');
      });

      it('should error when translation has fewer placeholders than base', () => {
        const result = autoFixTranslocoPlaceholders('Hello {{ firstName }} {{ lastName }}', 'Hola {{ nombre }}');

        expect(result.wasFixed).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('count mismatch', () => {
      it('should error when translation has extra placeholders', () => {
        const result = autoFixTranslocoPlaceholders('Hello {{ name }}', 'Hola {{ name }} {{ extra }}');

        expect(result.wasFixed).toBe(false);
        expect(result.error).toContain('extra placeholders');
      });
    });
  });

  describe('autoFixICUPlaceholders — Transloco pass-through', () => {
    it('should not error on Transloco values when base has no ICU placeholders', () => {
      // "Create {{ itemName }}?" has no ICU single-braces, so autoFixICUPlaceholders
      // should treat it as having no placeholders and return as-is.
      const result = autoFixICUPlaceholders('Create {{ itemName }}?', 'Créer {{ nomElement }} ?');

      expect(result.wasFixed).toBe(false);
      expect(result.error).toBeUndefined();
      expect(result.value).toBe('Créer {{ nomElement }} ?');
    });

    it('should not error on plain Transloco value with no ICU braces', () => {
      const result = autoFixICUPlaceholders('{{ count }} items', '{{ anzahl }} Elemente');

      expect(result.wasFixed).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should pass through Transloco values via the hasTranslocoPlaceholders guard', () => {
      const result = autoFixICUPlaceholders('Create {{ itemName }}?', 'إنشاء {{ itemName }}؟');
      expect(result.wasFixed).toBe(false);
      expect(result.error).toBeUndefined();
      expect(result.value).toBe('إنشاء {{ itemName }}؟');
    });
  });
});

describe('icu-auto-fixer utility functions', () => {
  it('hasICUPlaceholders should detect various placeholder types', () => {
    expect(hasICUPlaceholders('Hello {name}')).toBe(true);
    expect(hasICUPlaceholders('{count, plural, one {#} other {#}}')).toBe(true);
    expect(hasICUPlaceholders('{gender, select, male {he} female {she}}')).toBe(true);
    expect(hasICUPlaceholders('No placeholders')).toBe(false);
    expect(hasICUPlaceholders("'{escaped}'")).toBe(false);
  });

  it('extractICUPlaceholders should extract all placeholder types', () => {
    const result = extractICUPlaceholders('Hello {name}, you have {count, plural, one {# item} other {# items}}');

    expect(result.success).toBe(true);
    expect(result.placeholders).toHaveLength(2);
    expect(result.placeholders[0].name).toBe('name');
    expect(result.placeholders[0].type).toBe('simple');
    expect(result.placeholders[1].name).toBe('count');
    expect(result.placeholders[1].type).toBe('plural');
  });

  it('validateICUSyntax should validate syntax', () => {
    expect(validateICUSyntax('Hello {name}')).toBe(true);
    expect(validateICUSyntax('{count, plural, one {#} other {#}}')).toBe(true);
    expect(validateICUSyntax('Hello {name')).toBe(false);
    expect(validateICUSyntax('Hello name}')).toBe(false);
  });
});

describe('appending placeholders after ICU quotes', () => {
  it('keeps unmatched apostrophes literal and leaves malformed translations unchanged', () => {
    for (const translation of ["'{", "'{''", "'{''}"]) {
      const fixed = autoFixICUPlaceholders('Hello {name}', translation);
      expect(fixed).toMatchObject({ wasFixed: false, value: translation });
      expect(fixed.error).toBeDefined();
      expect(autoFixICUPlaceholders('Hello {name}', fixed.value)).toEqual(fixed);
    }
    for (const translation of ["Use '{name}", "Item '{x}", "Item '#'{name}"]) {
      const fixed = autoFixICUPlaceholders('Hello {name}', translation);
      expect(fixed.value).toBe(translation.replace('{x}', '{name}'));
      expect(autoFixICUPlaceholders('Hello {name}', fixed.value)).toMatchObject({
        wasFixed: false,
        value: fixed.value,
      });
    }
    for (const translation of ["l''", "don't"]) {
      const fixed = autoFixICUPlaceholders('Hello {name}', translation);
      expect(fixed.value).toBe(`${translation} {name}`);
    }
    expect(new MessageFormat('en').compile("'{")({})).toBe("'{");
    expect(autoFixICUPlaceholders('Hello {name}', "'{").value).toBe("'{");
  });

  it('declines to append a Transloco placeholder after an unclosed live brace', () => {
    const base = 'Hello {{ name }}';
    const fixed = autoFixTranslocoPlaceholders(base, "'{");
    expect(fixed).toMatchObject({ wasFixed: false, value: "'{" });
    expect(fixed.error).toContain('ICU quoting');
    expect(extractTranslocoPlaceholders(fixed.value).placeholders).toEqual([]);
    expect(autoFixTranslocoPlaceholders(base, fixed.value)).toEqual(fixed);
    const interpolated = fixed.value.replace(/\{\{([^{}]*?)\}\}/, 'Ada');
    expect(new MessageFormat('en').compile(interpolated)({})).toBe("'{");
    expect(validateICUSyntax(interpolated)).toBe(false);
  });
});

describe('context-aware ICU quotes', () => {
  it('appends a missing placeholder after a literal apostrophe before # and is idempotent', () => {
    const fixed = autoFixICUPlaceholders('Hello {name}', "Item '#1");
    expect(fixed.value).toBe("Item '#1 {name}");
    expect(autoFixICUPlaceholders('Hello {name}', fixed.value)).toMatchObject({
      wasFixed: false,
      value: fixed.value,
    });
  });
});

it('declines repairs whose inserted apostrophes change ICU quoting', () => {
  const base = "{n, plural, one {# l'x} other {# l'y}}";
  for (const translation of ["x '{a}", "Voir '#"]) {
    const result = autoFixICUPlaceholders(base, translation);
    expect(result).toMatchObject({ wasFixed: false, value: translation });
    expect(result.error).toContain('ICU quoting');
    expect(autoFixICUPlaceholders(base, result.value)).toEqual(result);
  }
});

it('declines a Transloco rename when the result still has invalid ICU syntax', () => {
  const translation = "'{ {{ wrong }}";
  const result = autoFixTranslocoPlaceholders('Hello {{ name }}', translation);
  expect(result).toMatchObject({ wasFixed: false, value: translation });
  expect(result.error).toContain('ICU quoting');
  expect(autoFixTranslocoPlaceholders('Hello {{ name }}', result.value)).toEqual(result);
});

describe('ICU sub-message structure', () => {
  it('rejects selector/body mismatches, including nested groups', () => {
    for (const malformed of [
      '{n, plural, one x other {y}}',
      '{n, select, a {x} {y} other {z}}',
      '{n, plural, other {x}{y}}',
      '{n, plural, }',
    ]) {
      for (const value of [malformed, `{outer, select, other {${malformed}}}`]) {
        expect(validateICUSyntax(value)).toBe(false);
        expect(extractICUPlaceholders(value)).toMatchObject({ success: false, placeholders: [], textSegments: [] });
        expect(icuToTransloco(value)).toBe(value);
      }
    }
  });

  it('requires other and rejects invalid selectors, misplaced offsets and unknown types recursively', () => {
    for (const malformed of [
      '{n, plural, one {x}}',
      '{n, select, a {x}}',
      '{n, selectordinal, one {x}}',
      '{n, plural, =x {x} other {y}}',
      '{n, plural, foo {x} other {y}}',
      '{n, selectordinal, foo {x} other {y}}',
      '{n, select, =1 {x} other {y}}',
      '{n, plural, other {x} offset:1}',
      '{n, plural, offset:1 offset:2 other {x}}',
      '{n, select, offset:1 other {x}}',
      '{n, plural, offset:x other {x}}',
      '{n, plural}',
      '{n, unknown}',
      '{n, unknown, style}',
    ]) {
      for (const value of [malformed, `{outer, plural, other {${malformed}}}`]) {
        expect(validateICUSyntax(value)).toBe(false);
        expect(extractICUPlaceholders(value).success).toBe(false);
      }
    }
  });

  it('preserves duplicate selectors, all plural categories and runtime numeric selectors and offsets', () => {
    for (const valid of [
      '{n, plural, other {first} other {second}}',
      '{n, select, a {first} a {second} other {fallback}}',
      '{n, plural, zero {} one {} two {} few {} many {} other {}}',
      '{n, selectordinal, zero {} one {} two {} few {} many {} other {}}',
      '{n, plural, offset:1 =0 {} other {{name}}}',
      '{n, selectordinal, offset:2 one {#} other {#}}',
      "{n, plural, other {'one x {y}'}}",
    ]) {
      expect(validateICUSyntax(valid)).toBe(true);
      expect(extractICUPlaceholders(valid).success).toBe(true);
    }
  });
});

it('rejects runtime-unsupported numeric forms and rule-based formats without removing standard categories', () => {
  for (const unsupported of [
    '{n, spellout}',
    '{n, ordinal}',
    ...['-1', '+1', '1.5', '.5', '1e2'].flatMap((number) => [
      `{n, plural, =${number} {x} other {y}}`,
      `{n, plural, offset:${number} other {y}}`,
    ]),
    '{n, plural, offset :1 other {x}}',
    '{n, plural, offset: 1 offset:2 other {x}}',
  ]) {
    for (const value of [unsupported, `{outer, select, other {${unsupported}}}`]) {
      expect(validateICUSyntax(value)).toBe(false);
      expect(extractICUPlaceholders(value).success).toBe(false);
    }
  }
  for (const value of ['{n, plural, offset:1other {x}}', '{n, plural, offset: 1=2 {x} other {y}}']) {
    expect(validateICUSyntax(value)).toBe(true);
    expect(() => new MessageFormat('en').compile(value)).not.toThrow();
  }
});

it('rejects quoted hash runs containing opening braces outside plural contexts', () => {
  for (const value of [
    "'#{pa}'",
    "'#{'",
    "{s, select, other {'#{pa}'}}",
    "{n, number, '#{pa}'}",
    "{n, date, '#{pa}'}",
    "{n, time, '#{pa}'}",
    "{n, plural, other {x}} '#{pa}'",
  ]) {
    expect(validateICUSyntax(value)).toBe(false);
    expect(extractICUPlaceholders(value)).toMatchObject({ success: false, placeholders: [], textSegments: [] });
  }
});

it('inherits plural quoting through nested selects and formatter styles and restores the enclosing context', () => {
  for (const value of [
    "{n, plural, other {'#{pa}'}}",
    "{n, selectordinal, other {'#{pa}'}}",
    "{n, plural, other {{s, select, other {'#{pa}'}}}}",
    "{s, select, other {{n, plural, other {'#{pa}'}}}}",
    "{n, plural, other {{n, number, '#{pa}'}}}",
    "{n, plural, other {{n, date, '#{pa}'}}}",
    "{n, plural, other {{n, time, '#{pa}'}}}",
    "'#}'",
    "'#'",
    "'{'",
    "''#{pa}",
  ]) {
    expect(validateICUSyntax(value)).toBe(true);
    expect(() => new MessageFormat('en').compile(value)).not.toThrow();
    expect(extractICUPlaceholders(value).success).toBe(true);
  }
  expect(validateICUSyntax("{s, select, other {{n, plural, other {x}} '#{pa}'}}")).toBe(false);
});

it('validates and compiles duration and preserves its formatter when repairing a renamed argument', () => {
  for (const style of ['', ', seconds']) {
    const base = `Elapsed: {elapsed, duration${style}}`;
    const translation = `Écoulé : {duree, duration${style}}`;
    expect(validateICUSyntax(base)).toBe(true);
    expect(extractICUPlaceholders(base).placeholders[0]).toMatchObject({ name: 'elapsed', type: 'duration' });
    expect(new MessageFormat('en').compile(base)({ elapsed: 65 })).toBe('Elapsed: 1:05');
    const repaired = autoFixICUPlaceholders(base, translation);
    expect(repaired).toMatchObject({ wasFixed: true, value: `Écoulé : {elapsed, duration${style}}` });
    expect(new MessageFormat('en').compile(repaired.value)({ elapsed: 65 })).toBe('Écoulé : 1:05');
  }
});

it('rejects dotted argument names at the top level and in nested messages', () => {
  for (const invalid of ['{item.name}', '{item.name, number}', '{item.name, plural, other {x}}']) {
    for (const value of [invalid, `{n, plural, other {${invalid}}}`]) {
      expect(validateICUSyntax(value)).toBe(false);
      expect(extractICUPlaceholders(value)).toMatchObject({ success: false, placeholders: [], textSegments: [] });
      expect(() => new MessageFormat('en').compile(value)).toThrow();
    }
  }
});

it('rejects unpaired style quotes in all built-in formats, including nested arguments', () => {
  for (const type of ['number', 'date', 'time', 'duration']) {
    for (const style of ["'", "'a", "a'", "'''", "'a''b", "'a' '"]) {
      const malformed = `{n, ${type}, ${style}}`;
      for (const value of [malformed, `Hi ${malformed} there`, `{n, plural, other {${malformed}}}`]) {
        expect(validateICUSyntax(value)).toBe(false);
        expect(extractICUPlaceholders(value)).toMatchObject({ success: false, placeholders: [], textSegments: [] });
        expect(icuToTransloco(value)).toBe(value);
      }
    }
  }
  expect(autoFixICUPlaceholders('{n, number}', "{numero, number, 'a}")).toMatchObject({ wasFixed: false });
});

it('checks number pattern quotes after ICU decoding while preserving balanced style literals', () => {
  for (const style of ["''", "'a''b'"]) {
    const value = `{n, number, ${style}}`;
    expect(() => new MessageFormat('en').compile(value)).toThrow();
    expect(validateICUSyntax(value)).toBe(false);
  }
  for (const value of [
    "{n, number, 'a'0}",
    "{n, number, ''''}",
    "{n, number, '#'}",
    "{n, date, 'a'}",
    "{n, time, ''}",
    "{n, duration, ''}",
    "{n, plural, other {{n, number, 'a'0}}}",
    "{n, plural, other {{n, number, '#'}}}",
    "don't {n, number}",
  ]) {
    expect(validateICUSyntax(value)).toBe(true);
    expect(() => new MessageFormat('en').compile(value)).not.toThrow();
    expect(extractICUPlaceholders(value).success).toBe(true);
  }
});
