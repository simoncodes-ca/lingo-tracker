import { importStrategyPolicy } from '@simoncodes-ca/domain';
import { describe, expect, it } from 'vitest';
import { detectImportFormat } from './import-common';

describe('import-common', () => {
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
      expect(() => detectImportFormat('file.txt')).toThrow('Cannot auto-detect format');
      expect(() => detectImportFormat('file.xml')).toThrow('Cannot auto-detect format');
      expect(() => detectImportFormat('file')).toThrow('Cannot auto-detect format');
    });
  });

  describe('strategy defaults', () => {
    it('should return correct defaults for translation-service strategy', () => {
      const defaults = importStrategyPolicy('translation-service').defaults;
      expect(defaults).toEqual({
        createMissing: false,
        updateComments: false,
        updateTags: false,
      });
    });

    it('should return correct defaults for verification strategy', () => {
      const defaults = importStrategyPolicy('verification').defaults;
      expect(defaults).toEqual({
        createMissing: false,
        updateComments: false,
        updateTags: false,
      });
    });

    it('should return correct defaults for migration strategy', () => {
      const defaults = importStrategyPolicy('migration').defaults;
      expect(defaults).toEqual({
        createMissing: true,
        updateComments: true,
        updateTags: true,
      });
    });

    it('should return correct defaults for update strategy', () => {
      const defaults = importStrategyPolicy('update').defaults;
      expect(defaults).toEqual({
        createMissing: false,
        updateComments: false,
        updateTags: false,
      });
    });
  });
});
