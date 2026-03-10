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

    it('should handle keys that are prefixes of other keys (mixed node)', () => {
      // This is the case where we have 'common' and 'common.title'
      // 'common' is a leaf value but also a parent
      const keys = ['common', 'common.title'];
      const result = buildTypeHierarchy(keys);

      const commonNode = result.children['COMMON'];
      expect(commonNode.value).toBe('common');
      expect(commonNode.children['TITLE']).toBeDefined();
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

    it('should handle mixed nodes by prioritizing children structure', () => {
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

      const output = serializeHierarchy(node, 'MIXED_TOKENS');

      // It should output COMMON as an object containing TITLE, ignoring the 'common' value leaf
      // because it has children
      expect(output).toContain('COMMON: {');
      expect(output).toContain("TITLE: 'common.title',");
      // Should NOT contain: COMMON: 'common'
      expect(output).not.toMatch(/COMMON: 'common',/);
    });
  });
});
