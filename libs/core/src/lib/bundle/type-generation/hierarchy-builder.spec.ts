import { buildTypeHierarchy, serializeHierarchy, type TypeHierarchyNode } from './hierarchy-builder';

describe('Hierarchy Builder', () => {
  describe('buildTypeHierarchy', () => {
    it('should build hierarchy for single-level keys', () => {
      const keys = ['common', 'admin'];
      const result = buildTypeHierarchy(keys);

      expect(result).toEqual({
        children: {
          COMMON: { children: {}, value: 'common' },
          ADMIN: { children: {}, value: 'admin' },
        },
      });
    });

    it('should build hierarchy for nested keys', () => {
      const keys = ['common.buttons.ok', 'common.buttons.cancel'];
      const result = buildTypeHierarchy(keys);

      expect(result.children['COMMON']).toBeDefined();
      expect(result.children['COMMON'].children['BUTTONS']).toBeDefined();
      expect(result.children['COMMON'].children['BUTTONS'].children['OK']).toEqual({
        children: {},
        value: 'common.buttons.ok',
      });
      expect(result.children['COMMON'].children['BUTTONS'].children['CANCEL']).toEqual({
        children: {},
        value: 'common.buttons.cancel',
      });
    });

    it('should handle mixed depth keys', () => {
      const keys = ['common.title', 'common.buttons.ok'];
      const result = buildTypeHierarchy(keys);

      expect(result.children['COMMON'].children['TITLE']).toEqual({
        children: {},
        value: 'common.title',
      });
      expect(result.children['COMMON'].children['BUTTONS'].children['OK']).toEqual({
        children: {},
        value: 'common.buttons.ok',
      });
    });

    it('should handle numeric and special character segments', () => {
      const keys = ['errors.404', 'users.user@email'];
      const result = buildTypeHierarchy(keys);

      expect(result.children['ERRORS'].children['404']).toEqual({
        children: {},
        value: 'errors.404',
      });
      expect(result.children['USERS'].children['USER@EMAIL']).toEqual({
        children: {},
        value: 'users.user@email',
      });
    });

    it('should build hierarchy using camelCase property names', () => {
      const keys = ['common.file-upload', 'common.buttons.ok'];
      const result = buildTypeHierarchy(keys, 'camelCase');

      expect(result.children['common']).toBeDefined();
      expect(result.children['common'].children['fileUpload']).toEqual({
        children: {},
        value: 'common.file-upload',
      });
      expect(result.children['common'].children['buttons']).toBeDefined();
      expect(result.children['common'].children['buttons'].children['ok']).toEqual({
        children: {},
        value: 'common.buttons.ok',
      });
    });

    it('should preserve mixed-case non-hyphenated segments in camelCase mode', () => {
      const keys = ['common.agGrid'];
      const result = buildTypeHierarchy(keys, 'camelCase');

      // 'agGrid' has no hyphens so it must be returned as-is — not lowercased or uppercased
      expect(result.children['common'].children['agGrid']).toEqual({
        children: {},
        value: 'common.agGrid',
      });
      expect(result.children['common'].children['aggrid']).toBeUndefined();
      expect(result.children['common'].children['AGGRID']).toBeUndefined();
    });

    it('rejects keys that are prefixes of other keys', () => {
      // This is the case where we have 'common' and 'common.title'
      // 'common' is a leaf value but also a parent
      const keys = ['common', 'common.title'];
      expect(() => buildTypeHierarchy(keys)).toThrow("Hierarchical conflicts in bundle 'types': common.");
      expect(() => buildTypeHierarchy([...keys].reverse())).toThrow(
        "Hierarchical conflicts in bundle 'types': common.",
      );
    });

    it('rejects parent conflicts introduced by token casing', () => {
      expect(() => buildTypeHierarchy(['foo-bar', 'foo_bar.child'])).toThrow(
        "Hierarchical conflicts in bundle 'types': foo-bar.",
      );
    });

    it('rejects distinct source keys that collapse onto one token leaf', () => {
      for (const keys of [
        ['foo-bar.ok', 'foo_bar.ok'],
        ['foo_bar.ok', 'foo-bar.ok'],
      ]) {
        expect(() => buildTypeHierarchy(keys)).toThrow('foo-bar.ok, foo_bar.ok');
      }
    });

    it('treats __proto__ and constructor segments as ordinary children without touching Object.prototype', () => {
      const result = buildTypeHierarchy(['__proto__.x', 'constructor.ok'], 'camelCase');

      expect(Object.prototype).not.toHaveProperty('value');
      expect(Object.prototype).not.toHaveProperty('x');
      expect(Object.keys(result.children)).toEqual(['__proto__', 'constructor']);
      expect(Object.getOwnPropertyDescriptor(result.children, '__proto__')?.value).toEqual({
        children: { x: { children: {}, value: '__proto__.x' } },
      });
      expect(result.children.constructor).toEqual({
        children: { ok: { children: {}, value: 'constructor.ok' } },
      });
      expect(serializeHierarchy(result, 'TOKENS')).toContain("ok: 'constructor.ok',");
    });
  });

  describe('serializeHierarchy', () => {
    it('should serialize simple hierarchy', () => {
      const node: TypeHierarchyNode = {
        children: {
          COMMON: {
            children: {
              OK: { children: {}, value: 'common.ok' },
            },
          },
        },
      };

      const output = serializeHierarchy(node, 'COMMON_TOKENS');

      expect(output).toContain('export const COMMON_TOKENS = {');
      expect(output).toContain('COMMON: {');
      expect(output).toContain("OK: 'common.ok',");
      expect(output).toContain('} as const;');
      expect(output).toContain('export type CommonTokens = typeof COMMON_TOKENS;');
    });

    it('should properly indent nested objects', () => {
      const node: TypeHierarchyNode = {
        children: {
          LEVEL1: {
            children: {
              LEVEL2: {
                children: {
                  ITEM: { children: {}, value: 'l1.l2.item' },
                },
              },
            },
          },
        },
      };

      const output = serializeHierarchy(node, 'TEST_TOKENS');

      // Check indentation
      expect(output).toContain('  LEVEL1: {');
      expect(output).toContain('    LEVEL2: {');
      expect(output).toContain("      ITEM: 'l1.l2.item',");
    });

    it('rejects manually supplied mixed serializer nodes', () => {
      const node: TypeHierarchyNode = {
        children: {
          COMMON: {
            value: 'common',
            children: {
              TITLE: { children: {}, value: 'common.title' },
            },
          },
        },
      };

      expect(() => serializeHierarchy(node, 'MIXED_TOKENS')).toThrow(
        "Hierarchical conflicts in bundle 'types': common.",
      );
    });
  });
});
