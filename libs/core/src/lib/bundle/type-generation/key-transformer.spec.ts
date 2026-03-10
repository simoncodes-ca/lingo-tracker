import { bundleKeyToConstantName, segmentToPropertyName, splitKeyIntoSegments } from './key-transformer';

describe('Key Transformer', () => {
  describe('bundleKeyToConstantName', () => {
    it('should convert simple bundle key to constant name', () => {
      expect(bundleKeyToConstantName('common')).toBe('COMMON_TOKENS');
    });

    it('should convert hyphenated bundle key to constant name', () => {
      expect(bundleKeyToConstantName('core-ui')).toBe('CORE_UI_TOKENS');
    });

    it('should handle mixed case bundle keys', () => {
      expect(bundleKeyToConstantName('adminPanel')).toBe('ADMINPANEL_TOKENS');
    });
  });

  describe('segmentToPropertyName', () => {
    it('should convert lowercase segment to uppercase', () => {
      expect(segmentToPropertyName('buttons')).toBe('BUTTONS');
    });

    it('should replace hyphens with underscores', () => {
      expect(segmentToPropertyName('file-upload')).toBe('FILE_UPLOAD');
    });

    it('should convert camelCase to uppercase directly', () => {
      expect(segmentToPropertyName('someKey')).toBe('SOMEKEY');
    });

    it('should preserve numeric segments', () => {
      expect(segmentToPropertyName('404')).toBe('404');
    });

    it('should preserve leading/trailing underscores', () => {
      expect(segmentToPropertyName('_internal')).toBe('_INTERNAL');
      expect(segmentToPropertyName('value_')).toBe('VALUE_');
    });

    it('should handle special characters by converting to uppercase', () => {
      // Assuming special chars are allowed in keys but might need escaping in usage
      // The transformer just uppercases them as per requirements
      expect(segmentToPropertyName('user@email')).toBe('USER@EMAIL');
    });

    it('should allow reserved words', () => {
      expect(segmentToPropertyName('class')).toBe('CLASS');
      expect(segmentToPropertyName('function')).toBe('FUNCTION');
    });
  });

  describe('segmentToPropertyName (camelCase)', () => {
    it('should return a single word lowercased', () => {
      expect(segmentToPropertyName('buttons', 'camelCase')).toBe('buttons');
    });

    it('should convert hyphenated segment to camelCase', () => {
      expect(segmentToPropertyName('file-upload', 'camelCase')).toBe('fileUpload');
    });

    it('should convert multiple hyphens to camelCase', () => {
      expect(segmentToPropertyName('file-upload-button', 'camelCase')).toBe('fileUploadButton');
    });

    it('should normalize mixed-case input to camelCase', () => {
      expect(segmentToPropertyName('FILE-upload', 'camelCase')).toBe('fileUpload');
    });

    it('should lowercase a non-hyphenated already-camelCase input', () => {
      // No hyphens → split produces ['fileUpload'] → first part lowercased → 'fileupload'
      expect(segmentToPropertyName('fileUpload', 'camelCase')).toBe('fileupload');
    });

    it('should filter empty parts from double hyphens', () => {
      expect(segmentToPropertyName('file--upload', 'camelCase')).toBe('fileUpload');
    });

    it('should filter leading hyphen and return remaining word', () => {
      expect(segmentToPropertyName('-upload', 'camelCase')).toBe('upload');
    });

    it('should filter trailing hyphen and return preceding word', () => {
      expect(segmentToPropertyName('upload-', 'camelCase')).toBe('upload');
    });

    it('should return a single character lowercased', () => {
      expect(segmentToPropertyName('a', 'camelCase')).toBe('a');
    });

    it('should return numeric segment unchanged', () => {
      expect(segmentToPropertyName('404', 'camelCase')).toBe('404');
    });
  });

  describe('splitKeyIntoSegments', () => {
    it('should split simple dot-delimited key', () => {
      expect(splitKeyIntoSegments('common.buttons.ok')).toEqual(['common', 'buttons', 'ok']);
    });

    it('should handle single segment key', () => {
      expect(splitKeyIntoSegments('title')).toEqual(['title']);
    });

    it('should handle key with numeric segments', () => {
      expect(splitKeyIntoSegments('errors.404.message')).toEqual(['errors', '404', 'message']);
    });
  });
});
