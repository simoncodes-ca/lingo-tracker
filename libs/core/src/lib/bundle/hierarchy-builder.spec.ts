import { buildKeyTree } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';

describe('Key Tree behavioural cases', () => {
  describe('buildKeyTree', () => {
    it('should handle empty input', () => {
      const result = buildKeyTree(Object.entries({})).tree;
      expect(result).toEqual({});
    });

    it('should handle single-level keys', () => {
      const result = buildKeyTree(
        Object.entries({
          ok: 'OK',
          cancel: 'Cancel',
        }),
      ).tree;

      expect(result).toEqual({
        ok: 'OK',
        cancel: 'Cancel',
      });
    });

    it('should build simple hierarchy', () => {
      const result = buildKeyTree(
        Object.entries({
          'apps.common.ok': 'OK',
          'apps.common.cancel': 'Cancel',
        }),
      ).tree;

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
      const result = buildKeyTree(
        Object.entries({
          'apps.common.buttons.ok': 'OK',
          'apps.common.buttons.cancel': 'Cancel',
          'apps.common.messages.welcome': 'Welcome',
          'admin.users.title': 'User Management',
        }),
      ).tree;

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
      const result = buildKeyTree(
        Object.entries({
          'a.b.c.d': 'deep',
          'a.b.x': 'medium',
          'a.y': 'shallow',
          z: 'root',
        }),
      ).tree;

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
      const result = buildKeyTree(
        Object.entries({
          'a.first': '1',
          'a.second': '2',
          'a.third': '3',
        }),
      ).tree;

      const keys = Object.keys(result['a'] as Record<string, string>);
      expect(keys).toEqual(['first', 'second', 'third']);
    });

    it('should handle keys with numbers and special characters', () => {
      const result = buildKeyTree(
        Object.entries({
          'app1.feature-x.item_1': 'Value 1',
          'app2.feature_y.item-2': 'Value 2',
        }),
      ).tree;

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
      const result = buildKeyTree(
        Object.entries({
          'parent.child': 'value',
        }),
      ).tree;

      expect(result).toEqual({
        parent: {
          child: 'value',
        },
      });
    });

    it('should handle values with special content', () => {
      const result = buildKeyTree(
        Object.entries({
          'key.subkey': 'Value with spaces',
          'key.another': 'Value\nwith\nnewlines',
          'key.third': 'Value "with" quotes',
        }),
      ).tree;

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
      const result = buildKeyTree(
        Object.entries({
          'a.b.c': 'deep',
        }),
      ).tree;

      expect(result).toEqual({
        a: {
          b: {
            c: 'deep',
          },
        },
      });
    });

    it('treats __proto__ and constructor segments as ordinary keys without touching Object.prototype', () => {
      const result = buildKeyTree(
        Object.entries({
          '__proto__.x': 'polluted?',
          'constructor.ok': 'OK',
          'toString.label': 'Label',
          'buttons.ok': 'Fine',
        }),
      ).tree;

      expect(({} as Record<string, unknown>)['x']).toBeUndefined();
      expect(Object.prototype).not.toHaveProperty('x');
      expect(JSON.parse(JSON.stringify(result))).toEqual(
        JSON.parse(
          '{"__proto__":{"x":"polluted?"},"constructor":{"ok":"OK"},"toString":{"label":"Label"},"buttons":{"ok":"Fine"}}',
        ),
      );
    });

    it('serializes normal keys exactly as a plain object would', () => {
      const flat = { 'a.b': '1', 'a.c': '2', d: '3' };

      expect(JSON.stringify(buildKeyTree(Object.entries(flat)).tree, null, 2)).toBe(
        JSON.stringify({ a: { b: '1', c: '2' }, d: '3' }, null, 2),
      );
    });
  });
});
