import { describe, it, expect } from 'vitest';
import { resolveFullKey, splitKey, resolveEffectiveFolderPath, resolveResourceForDialog } from './key-resolution';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';

describe('key-resolution', () => {
  describe('splitKey', () => {
    it('should split a dotted key into folder path and entry key', () => {
      expect(splitKey('forms.acceptedFormatsX')).toEqual({ folderPath: 'forms', entryKey: 'acceptedFormatsX' });
    });

    it('should handle single-segment keys', () => {
      expect(splitKey('acceptedFormatsX')).toEqual({ folderPath: '', entryKey: 'acceptedFormatsX' });
    });

    it('should handle deeply nested keys', () => {
      expect(splitKey('a.b.c.d')).toEqual({ folderPath: 'a.b.c', entryKey: 'd' });
    });
  });

  describe('resolveFullKey', () => {
    it('should return the key as-is in search mode', () => {
      expect(resolveFullKey('forms.save', true, 'ignored')).toBe('forms.save');
    });

    it('should prepend folder path in folder mode', () => {
      expect(resolveFullKey('save', false, 'forms')).toBe('forms.save');
    });

    it('should return key alone when folder path is empty', () => {
      expect(resolveFullKey('save', false, '')).toBe('save');
    });
  });

  describe('resolveEffectiveFolderPath', () => {
    it('should extract folder from key in search mode', () => {
      expect(resolveEffectiveFolderPath('forms.save', true, false, 'ignored')).toBe('forms');
    });

    it('should return current folder path in non-search mode', () => {
      expect(resolveEffectiveFolderPath('save', false, false, 'forms')).toBe('forms');
    });

    it('should combine paths for nested resources', () => {
      expect(resolveEffectiveFolderPath('fileUpload.acceptedFormatsX', false, true, 'forms')).toBe('forms.fileUpload');
    });

    it('should return relative path alone when current path is empty (nested)', () => {
      expect(resolveEffectiveFolderPath('fileUpload.acceptedFormatsX', false, true, '')).toBe('fileUpload');
    });

    it('should not combine for non-dotted keys even with nested flag', () => {
      expect(resolveEffectiveFolderPath('save', false, true, 'forms')).toBe('forms');
    });
  });

  describe('resolveResourceForDialog', () => {
    const resource: ResourceSummaryDto = {
      key: 'forms.save',
      translations: { en: 'Save' },
      status: {},
    };

    it('should strip to entry key in search mode', () => {
      expect(resolveResourceForDialog(resource, true, false).key).toBe('save');
    });

    it('should strip to entry key in nested mode with dotted key', () => {
      expect(resolveResourceForDialog(resource, false, true).key).toBe('save');
    });

    it('should return unchanged in folder mode with simple key', () => {
      const simple: ResourceSummaryDto = { ...resource, key: 'save' };
      expect(resolveResourceForDialog(simple, false, true).key).toBe('save');
    });

    it('should return unchanged in non-search, non-nested mode', () => {
      expect(resolveResourceForDialog(resource, false, false).key).toBe('forms.save');
    });
  });
});
