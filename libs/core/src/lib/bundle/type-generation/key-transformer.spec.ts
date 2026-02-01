import {
  bundleKeyToConstantName,
  segmentToPropertyName,
  splitKeyIntoSegments,
} from './key-transformer';

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

  describe('splitKeyIntoSegments', () => {
    it('should split simple dot-delimited key', () => {
      expect(splitKeyIntoSegments('common.buttons.ok')).toEqual([
        'common',
        'buttons',
        'ok',
      ]);
    });

    it('should handle single segment key', () => {
      expect(splitKeyIntoSegments('title')).toEqual(['title']);
    });

    it('should handle key with numeric segments', () => {
      expect(splitKeyIntoSegments('errors.404.message')).toEqual([
        'errors',
        '404',
        'message',
      ]);
    });
  });
});
