import { describe, it, expect } from 'vitest';
import { buildHierarchy } from './hierarchy-builder';

describe('hierarchy-builder', () => {
  describe('buildHierarchy', () => {
    it('should handle empty input', () => {
      const result = buildHierarchy({});
      expect(result).toEqual({});
    });

    it('should handle single-level keys', () => {
      const result = buildHierarchy({
        ok: 'OK',
        cancel: 'Cancel',
      });

      expect(result).toEqual({
        ok: 'OK',
        cancel: 'Cancel',
      });
    });

    it('should build simple hierarchy', () => {
      const result = buildHierarchy({
        'apps.common.ok': 'OK',
        'apps.common.cancel': 'Cancel',
      });

      expect(result).toEqual({
        apps: {
          common: {
            ok: 'OK',
            cancel: 'Cancel',
          },
        },
      });
    });

    it('should build complex multi-level hierarchy', () => {
      const result = buildHierarchy({
        'apps.common.buttons.ok': 'OK',
        'apps.common.buttons.cancel': 'Cancel',
        'apps.common.messages.welcome': 'Welcome',
        'admin.users.title': 'User Management',
      });

      expect(result).toEqual({
        apps: {
          common: {
            buttons: {
              ok: 'OK',
              cancel: 'Cancel',
            },
            messages: {
              welcome: 'Welcome',
            },
          },
        },
        admin: {
          users: {
            title: 'User Management',
          },
        },
      });
    });

    it('should handle mixed depth keys', () => {
      const result = buildHierarchy({
        'a.b.c.d': 'deep',
        'a.b.x': 'medium',
        'a.y': 'shallow',
        z: 'root',
      });

      expect(result).toEqual({
        a: {
          b: {
            c: {
              d: 'deep',
            },
            x: 'medium',
          },
          y: 'shallow',
        },
        z: 'root',
      });
    });

    it('should preserve value order (insertion order)', () => {
      const result = buildHierarchy({
        'a.first': '1',
        'a.second': '2',
        'a.third': '3',
      });

      const keys = Object.keys(result.a as Record<string, string>);
      expect(keys).toEqual(['first', 'second', 'third']);
    });

    it('should handle keys with numbers and special characters', () => {
      const result = buildHierarchy({
        'app1.feature-x.item_1': 'Value 1',
        'app2.feature_y.item-2': 'Value 2',
      });

      expect(result).toEqual({
        app1: {
          'feature-x': {
            item_1: 'Value 1',
          },
        },
        app2: {
          feature_y: {
            'item-2': 'Value 2',
          },
        },
      });
    });

    it('should handle single dot in key (two segments)', () => {
      const result = buildHierarchy({
        'parent.child': 'value',
      });

      expect(result).toEqual({
        parent: {
          child: 'value',
        },
      });
    });

    it('should handle values with special content', () => {
      const result = buildHierarchy({
        'key.subkey': 'Value with spaces',
        'key.another': 'Value\nwith\nnewlines',
        'key.third': 'Value "with" quotes',
      });

      expect(result).toEqual({
        key: {
          subkey: 'Value with spaces',
          another: 'Value\nwith\nnewlines',
          third: 'Value "with" quotes',
        },
      });
    });

    it('should create intermediate objects as needed', () => {
      // This tests that intermediate objects are created even if not explicitly present
      const result = buildHierarchy({
        'a.b.c': 'deep',
      });

      expect(result).toEqual({
        a: {
          b: {
            c: 'deep',
          },
        },
      });
    });
  });
});
