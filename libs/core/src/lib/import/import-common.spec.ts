import { describe, it, expect } from 'vitest';
import {
  validateImportKey,
  isKeyTooLong,
  detectImportFormat,
  getStrategyDefaults,
  validateLocale,
  isEmptyValue,
  detectHierarchicalConflicts,
  detectDuplicateKeys,
} from './import-common';

describe('import-common', () => {
  describe('validateImportKey', () => {
    it('should validate correct keys', () => {
      expect(() => validateImportKey('common')).not.toThrow();
      expect(() => validateImportKey('common.buttons')).not.toThrow();
      expect(() => validateImportKey('apps.dashboard.title')).not.toThrow();
      expect(() => validateImportKey('key_with_underscore')).not.toThrow();
      expect(() => validateImportKey('key-with-hyphen')).not.toThrow();
      expect(() => validateImportKey('key123')).not.toThrow();
    });

    it('should reject empty keys', () => {
      expect(() => validateImportKey('')).toThrow('Key cannot be empty');
      expect(() => validateImportKey('  ')).toThrow('Key cannot be empty');
    });

    it('should reject keys with consecutive dots', () => {
      expect(() => validateImportKey('common..buttons')).toThrow(
        'consecutive dots',
      );
    });

    it('should reject keys with leading dots', () => {
      expect(() => validateImportKey('.common')).toThrow(
        'leading or trailing dot',
      );
    });

    it('should reject keys with trailing dots', () => {
      expect(() => validateImportKey('common.')).toThrow(
        'leading or trailing dot',
      );
    });

    it('should reject keys with invalid characters', () => {
      expect(() => validateImportKey('common.buttons!')).toThrow(
        'Invalid key segment',
      );
      expect(() => validateImportKey('common.buttons spaces')).toThrow(
        'Invalid key segment',
      );
      expect(() => validateImportKey('common.buttons@ok')).toThrow(
        'Invalid key segment',
      );
    });
  });

  describe('isKeyTooLong', () => {
    it('should return false for normal length keys', () => {
      expect(isKeyTooLong('common.buttons.ok')).toBe(false);
      expect(isKeyTooLong('a'.repeat(200))).toBe(false);
    });

    it('should return true for very long keys', () => {
      expect(isKeyTooLong('a'.repeat(201))).toBe(true);
      expect(isKeyTooLong('a'.repeat(300))).toBe(true);
    });
  });

  describe('detectImportFormat', () => {
    it('should detect XLIFF format from .xliff extension', () => {
      expect(detectImportFormat('translations.xliff')).toBe('xliff');
      expect(detectImportFormat('/path/to/file.xliff')).toBe('xliff');
      expect(detectImportFormat('FILE.XLIFF')).toBe('xliff');
    });

    it('should detect XLIFF format from .xlf extension', () => {
      expect(detectImportFormat('translations.xlf')).toBe('xliff');
      expect(detectImportFormat('/path/to/file.XLF')).toBe('xliff');
    });

    it('should detect JSON format from .json extension', () => {
      expect(detectImportFormat('translations.json')).toBe('json');
      expect(detectImportFormat('/path/to/file.JSON')).toBe('json');
    });

    it('should throw error for unknown extensions', () => {
      expect(() => detectImportFormat('file.txt')).toThrow(
        'Cannot auto-detect format',
      );
      expect(() => detectImportFormat('file.xml')).toThrow(
        'Cannot auto-detect format',
      );
      expect(() => detectImportFormat('file')).toThrow(
        'Cannot auto-detect format',
      );
    });
  });

  describe('getStrategyDefaults', () => {
    it('should return correct defaults for translation-service strategy', () => {
      const defaults = getStrategyDefaults('translation-service');
      expect(defaults).toEqual({
        createMissing: false,
        updateComments: false,
        updateTags: false,
      });
    });

    it('should return correct defaults for verification strategy', () => {
      const defaults = getStrategyDefaults('verification');
      expect(defaults).toEqual({
        createMissing: false,
        updateComments: false,
        updateTags: false,
      });
    });

    it('should return correct defaults for migration strategy', () => {
      const defaults = getStrategyDefaults('migration');
      expect(defaults).toEqual({
        createMissing: true,
        updateComments: true,
        updateTags: true,
      });
    });

    it('should return correct defaults for update strategy', () => {
      const defaults = getStrategyDefaults('update');
      expect(defaults).toEqual({
        createMissing: false,
        updateComments: false,
        updateTags: false,
      });
    });
  });

  describe('validateLocale', () => {
    it('should validate correct locale codes', () => {
      expect(() => validateLocale('en')).not.toThrow();
      expect(() => validateLocale('es')).not.toThrow();
      expect(() => validateLocale('fr')).not.toThrow();
      expect(() => validateLocale('EN')).not.toThrow();
    });

    it('should validate locale codes with region', () => {
      expect(() => validateLocale('en-us')).not.toThrow();
      expect(() => validateLocale('fr-ca')).not.toThrow();
      expect(() => validateLocale('zh-cn')).not.toThrow();
      expect(() => validateLocale('EN-US')).not.toThrow();
    });

    it('should reject empty locales', () => {
      expect(() => validateLocale('')).toThrow('Locale cannot be empty');
      expect(() => validateLocale('  ')).toThrow('Locale cannot be empty');
    });

    it('should reject invalid locale formats', () => {
      expect(() => validateLocale('e')).toThrow('Invalid locale format');
      expect(() => validateLocale('english')).toThrow('Invalid locale format');
      expect(() => validateLocale('en_US')).toThrow('Invalid locale format');
      expect(() => validateLocale('en-')).toThrow('Invalid locale format');
      expect(() => validateLocale('-en')).toThrow('Invalid locale format');
    });
  });

  describe('isEmptyValue', () => {
    it('should return true for empty values', () => {
      expect(isEmptyValue('')).toBe(true);
      expect(isEmptyValue('  ')).toBe(true);
      expect(isEmptyValue('\t')).toBe(true);
      expect(isEmptyValue('\n')).toBe(true);
    });

    it('should return false for non-empty values', () => {
      expect(isEmptyValue('value')).toBe(false);
      expect(isEmptyValue('  value  ')).toBe(false);
      expect(isEmptyValue('0')).toBe(false);
    });
  });

  describe('detectHierarchicalConflicts', () => {
    it('should return empty array when no conflicts exist', () => {
      const keys = [
        'common.buttons.ok',
        'common.buttons.cancel',
        'dashboard.title',
      ];
      expect(detectHierarchicalConflicts(keys)).toEqual([]);
    });

    it('should detect when a key has both value and children', () => {
      const keys = ['common', 'common.buttons', 'common.buttons.ok'];
      const conflicts = detectHierarchicalConflicts(keys);
      expect(conflicts).toContain('common');
      expect(conflicts).toContain('common.buttons');
      expect(conflicts.length).toBe(2);
    });

    it('should detect single level conflict', () => {
      const keys = ['common', 'common.title'];
      const conflicts = detectHierarchicalConflicts(keys);
      expect(conflicts).toEqual(['common']);
    });

    it('should handle keys with similar prefixes but no conflict', () => {
      const keys = ['common', 'commonality'];
      expect(detectHierarchicalConflicts(keys)).toEqual([]);
    });
  });

  describe('detectDuplicateKeys', () => {
    it('should return empty map when no duplicates exist', () => {
      const keys = [
        'common.buttons.ok',
        'common.buttons.cancel',
        'dashboard.title',
      ];
      const duplicates = detectDuplicateKeys(keys);
      expect(duplicates.size).toBe(0);
    });

    it('should detect duplicate keys', () => {
      const keys = ['common.title', 'dashboard.title', 'common.title'];
      const duplicates = detectDuplicateKeys(keys);
      expect(duplicates.size).toBe(1);
      expect(duplicates.get('common.title')).toBe(2);
    });

    it('should detect multiple duplicate keys', () => {
      const keys = [
        'common.title',
        'dashboard.title',
        'common.title',
        'dashboard.title',
        'common.title',
      ];
      const duplicates = detectDuplicateKeys(keys);
      expect(duplicates.size).toBe(2);
      expect(duplicates.get('common.title')).toBe(3);
      expect(duplicates.get('dashboard.title')).toBe(2);
    });

    it('should handle empty array', () => {
      const duplicates = detectDuplicateKeys([]);
      expect(duplicates.size).toBe(0);
    });
  });
});
