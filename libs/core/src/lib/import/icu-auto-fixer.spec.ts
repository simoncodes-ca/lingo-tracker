import { describe, it, expect } from 'vitest';
import {
  extractICUPlaceholders,
  hasICUPlaceholders,
  autoFixICUPlaceholders,
  validateICUSyntax,
  hasTranslocoPlaceholders,
  extractTranslocoPlaceholders,
  autoFixTranslocoPlaceholders,
} from '@simoncodes-ca/domain';

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
