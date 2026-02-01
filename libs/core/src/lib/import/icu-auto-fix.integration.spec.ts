import { describe, it, expect } from 'vitest';
import {
  autoFixICUPlaceholders,
  hasICUPlaceholders,
  extractICUPlaceholders,
  validateICUSyntax,
} from './icu-auto-fixer';
import { applyICUAutoFixToResources } from './apply-icu-auto-fix';
import type { ImportedResource } from './types';

describe('ICU Auto-Fix Integration', () => {
  describe('Real-world Translation Scenarios', () => {
    it('should handle Spanish translation with renamed placeholders', () => {
      const baseValue = 'Hello {name}, you have {count} items';
      const translatedValue = 'Hola {nombre}, tienes {cantidad} elementos';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe('Hola {name}, tienes {count} elementos');
      expect(result.originalPlaceholders).toEqual(['{nombre}', '{cantidad}']);
      expect(result.fixedPlaceholders).toEqual(['{name}', '{count}']);
    });

    it('should handle French translation with plural forms', () => {
      const baseValue = '{count, plural, one {# item} other {# items}}';
      const translatedValue = '{nombre, plural, one {# élément} other {# éléments}}';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe('{count, plural, one {# élément} other {# éléments}}');
    });

    it('should handle German translation with select statements', () => {
      const baseValue = '{gender, select, male {he} female {she} other {they}}';
      const translatedValue = '{geschlecht, select, male {er} female {sie} other {sie}}';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe('{gender, select, male {er} female {sie} other {sie}}');
    });

    it('should handle complex message with multiple placeholder types', () => {
      const baseValue = 'Hello {name}, you have {count, plural, one {# message} other {# messages}} from {sender}';
      const translatedValue =
        'Hola {nombre}, tienes {cantidad, plural, one {# mensaje} other {# mensajes}} de {remitente}';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe('Hola {name}, tienes {count, plural, one {# mensaje} other {# mensajes}} de {sender}');
    });
  });

  describe('Translation Service Error Patterns', () => {
    it('should handle translator removing placeholder by mistake', () => {
      const baseValue = 'You have {count} items in your cart';
      const translatedValue = 'Tienes items en tu carrito'; // Missing {count}

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      // Should insert the missing placeholder
      expect(result.wasFixed).toBe(true);
      expect(result.value).toContain('{count}');
    });

    it('should error on translator adding extra placeholder', () => {
      const baseValue = 'Hello {name}';
      const translatedValue = 'Hola {name} {extra}';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(false);
      expect(result.error).toContain('extra placeholders');
    });

    it('should error on translator breaking ICU syntax', () => {
      const baseValue = 'Hello {name}';
      const translatedValue = 'Hola {nombre'; // Unclosed brace

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(false);
      expect(result.error).toContain('Failed to parse');
    });
  });

  describe('Batch Processing with Real Data', () => {
    it('should process multiple resources from translation service', () => {
      // Simulating XLIFF import from translation service
      const resources: ImportedResource[] = [
        { key: 'greeting', value: 'Hola {nombre}' },
        {
          key: 'item_count',
          value: '{numero, plural, one {# elemento} other {# elementos}}',
        },
        {
          key: 'welcome',
          value: 'Bienvenido {usuario}, tienes {cantidad} notificaciones',
        },
        { key: 'no_placeholders', value: 'Sin marcadores de posición' },
      ];

      const baseValues: Record<string, string> = {
        greeting: 'Hello {name}',
        item_count: '{count, plural, one {# item} other {# items}}',
        welcome: 'Welcome {user}, you have {count} notifications',
        no_placeholders: 'No placeholders',
      };

      const result = applyICUAutoFixToResources({
        resources,
        getBaseValue: (key) => baseValues[key],
      });

      expect(result.resources[0].value).toBe('Hola {name}');
      expect(result.resources[1].value).toBe('{count, plural, one {# elemento} other {# elementos}}');
      expect(result.resources[2].value).toBe('Bienvenido {user}, tienes {count} notificaciones');
      expect(result.resources[3].value).toBe('Sin marcadores de posición');

      expect(result.autoFixes).toHaveLength(3); // First 3 were fixed
      expect(result.autoFixErrors).toHaveLength(0);
    });

    it('should collect errors for unfixable translations', () => {
      const resources: ImportedResource[] = [
        { key: 'good', value: 'Bueno {name}' },
        { key: 'extra', value: 'Extra {name} {unexpected}' },
        { key: 'malformed', value: 'Malformado {nombre' },
      ];

      const baseValues: Record<string, string> = {
        good: 'Good {name}',
        extra: 'Extra {name}',
        malformed: 'Malformed {name}',
      };

      const result = applyICUAutoFixToResources({
        resources,
        getBaseValue: (key) => baseValues[key],
      });

      expect(result.autoFixes).toHaveLength(0);
      expect(result.autoFixErrors).toHaveLength(2);

      const extraError = result.autoFixErrors.find((e) => e.key === 'extra');
      expect(extraError?.error).toContain('extra placeholders');

      const malformedError = result.autoFixErrors.find((e) => e.key === 'malformed');
      expect(malformedError?.error).toContain('Failed to parse');
    });
  });

  describe('Edge Cases and Complex Patterns', () => {
    it('should handle nested ICU patterns', () => {
      const baseValue = '{count, plural, one {You have {count} item} other {You have {count} items}}';
      const translatedValue = '{numero, plural, one {Tienes {numero} elemento} other {Tienes {numero} elementos}}';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe('{count, plural, one {Tienes {count} elemento} other {Tienes {count} elementos}}');
    });

    it('should handle number formatters', () => {
      const baseValue = 'Price: {price, number, currency}';
      const translatedValue = 'Precio: {precio, number, currency}';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe('Precio: {price, number, currency}');
    });

    it('should handle date and time formatters', () => {
      const baseValue = 'Date: {today, date, short} at {now, time, medium}';
      const translatedValue = 'Fecha: {hoy, date, short} a las {ahora, time, medium}';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe('Fecha: {today, date, short} a las {now, time, medium}');
    });

    it('should preserve whitespace and punctuation', () => {
      const baseValue = 'Hello   {name}  ,  you have  {count}  items  .';
      const translatedValue = 'Hola   {nombre}  ,  tienes  {cantidad}  elementos  .';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe('Hola   {name}  ,  tienes  {count}  elementos  .');
    });

    it('should handle escaped braces in translations', () => {
      const baseValue = "This is '{not a placeholder}' and {real}";
      const translatedValue = "Esto es '{no es un marcador}' y {verdadero}";

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe("Esto es '{no es un marcador}' y {real}");
    });

    it('should handle consecutive placeholders', () => {
      const baseValue = '{firstName}{lastName}';
      const translatedValue = '{nombre}{apellido}';

      const result = autoFixICUPlaceholders(baseValue, translatedValue);

      expect(result.wasFixed).toBe(true);
      expect(result.value).toBe('{firstName}{lastName}');
    });

    it('should handle placeholders at string boundaries', () => {
      const baseValue = '{name} is here';
      const translatedValue = '{nombre} está aquí';

      const result1 = autoFixICUPlaceholders(baseValue, translatedValue);
      expect(result1.value).toBe('{name} está aquí');

      const baseValue2 = 'Hello {name}';
      const translatedValue2 = 'Hola {nombre}';

      const result2 = autoFixICUPlaceholders(baseValue2, translatedValue2);
      expect(result2.value).toBe('Hola {name}');
    });
  });

  describe('Utility Functions', () => {
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

  describe('Performance and Scale', () => {
    it('should handle large number of resources efficiently', () => {
      const resources: ImportedResource[] = [];
      const baseValues: Record<string, string> = {};

      // Generate 1000 resources
      for (let i = 0; i < 1000; i++) {
        resources.push({
          key: `resource.${i}`,
          value: `Traducción {placeholder${i}}`,
        });
        baseValues[`resource.${i}`] = `Translation {placeholder${i}}`;
      }

      // Half have matching placeholders (no fix needed)
      // Half have renamed placeholders (need fix)
      for (let i = 0; i < 500; i++) {
        resources[i].value = `Traducción {placeholder${i}}`; // Match
        resources[i + 500].value = `Traducción {marcador${i}}`; // Renamed
      }

      const startTime = Date.now();
      const result = applyICUAutoFixToResources({
        resources,
        getBaseValue: (key) => baseValues[key],
      });
      const endTime = Date.now();

      expect(result.resources).toHaveLength(1000);
      expect(result.autoFixes).toHaveLength(500); // Half were fixed
      expect(result.autoFixErrors).toHaveLength(0);

      // Should complete in reasonable time (< 10 seconds for 1000 resources)
      // This is generous to avoid flaky tests on slower CI environments
      const elapsedTime = endTime - startTime;
      expect(elapsedTime).toBeLessThan(10000);
    });
  });
});
