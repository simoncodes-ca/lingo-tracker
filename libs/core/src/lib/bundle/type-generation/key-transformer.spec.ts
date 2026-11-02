import { constantNameToTypeName, segmentToPropertyName, splitKeyIntoSegments } from './key-transformer';

describe('Key Transformer', () => {
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

    it('should return empty string unchanged', () => {
      expect(segmentToPropertyName('')).toBe('');
    });
  });

  describe('segmentToPropertyName (camelCase)', () => {
    it('should return non-hyphenated segments as-is to preserve original casing', () => {
      expect(segmentToPropertyName('buttons', 'camelCase')).toBe('buttons');
      expect(segmentToPropertyName('fileUpload', 'camelCase')).toBe('fileUpload');
      expect(segmentToPropertyName('agGrid', 'camelCase')).toBe('agGrid');
      expect(segmentToPropertyName('addToLabel', 'camelCase')).toBe('addToLabel');
      expect(segmentToPropertyName('BUTTONS', 'camelCase')).toBe('BUTTONS');
      expect(segmentToPropertyName('_internal', 'camelCase')).toBe('_internal');
    });

    it('should convert hyphenated segment to camelCase', () => {
      expect(segmentToPropertyName('file-upload', 'camelCase')).toBe('fileUpload');
    });

    it('should convert multiple hyphens to camelCase', () => {
      expect(segmentToPropertyName('file-upload-button', 'camelCase')).toBe('fileUploadButton');
    });

    it('should preserve casing of all parts when segment has hyphens', () => {
      // First part keeps original casing; subsequent parts have first letter uppercased, tail preserved
      expect(segmentToPropertyName('FILE-upload', 'camelCase')).toBe('FILEUpload');
    });

    it('should filter empty parts from double hyphens', () => {
      expect(segmentToPropertyName('file--upload', 'camelCase')).toBe('fileUpload');
    });

    it('should return empty string for a hyphen-only segment', () => {
      expect(segmentToPropertyName('-', 'camelCase')).toBe('');
    });

    it('should filter leading hyphen and return remaining word', () => {
      expect(segmentToPropertyName('-upload', 'camelCase')).toBe('upload');
    });

    it('should filter trailing hyphen and return preceding word', () => {
      expect(segmentToPropertyName('upload-', 'camelCase')).toBe('upload');
    });

    it('should return a single character as-is', () => {
      expect(segmentToPropertyName('a', 'camelCase')).toBe('a');
    });

    it('should handle single-character parts produced by a hyphenated segment', () => {
      expect(segmentToPropertyName('a-b', 'camelCase')).toBe('aB');
    });

    it('should return numeric segment unchanged', () => {
      expect(segmentToPropertyName('404', 'camelCase')).toBe('404');
    });

    it('should preserve mixed-case tail in subsequent hyphen parts', () => {
      expect(segmentToPropertyName('my-XMLParser', 'camelCase')).toBe('myXMLParser');
    });

    it('should uppercase only the first char of a subsequent part that starts lowercase', () => {
      // 'xmlParser' starts with lowercase 'x' → uppercased to 'X', tail 'mlParser' preserved
      expect(segmentToPropertyName('my-xmlParser', 'camelCase')).toBe('myXmlParser');
    });

    it('should return empty string unchanged', () => {
      expect(segmentToPropertyName('', 'camelCase')).toBe('');
    });
  });

  describe('constantNameToTypeName', () => {
    it('should convert SCREAMING_SNAKE_CASE to PascalCase', () => {
      expect(constantNameToTypeName('MY_KEYS')).toBe('MyKeys');
    });

    it('should convert multi-word SCREAMING_SNAKE_CASE to PascalCase', () => {
      expect(constantNameToTypeName('MY_APP_TOKENS')).toBe('MyAppTokens');
    });

    it('should convert snake_case to PascalCase', () => {
      expect(constantNameToTypeName('my_translation_keys')).toBe('MyTranslationKeys');
    });

    it('should convert camelCase by capitalising the first letter only', () => {
      expect(constantNameToTypeName('myKeys')).toBe('MyKeys');
    });

    it('should leave PascalCase unchanged', () => {
      expect(constantNameToTypeName('MyKeys')).toBe('MyKeys');
    });

    it('should title-case a single all-uppercase word with no underscores', () => {
      expect(constantNameToTypeName('TOKENS')).toBe('Tokens');
    });

    it('should title-case other single all-uppercase words', () => {
      expect(constantNameToTypeName('DEBUG')).toBe('Debug');
      expect(constantNameToTypeName('ADMIN')).toBe('Admin');
      expect(constantNameToTypeName('KEYS')).toBe('Keys');
    });

    it('should handle leading/trailing underscores gracefully by ignoring empty segments', () => {
      expect(constantNameToTypeName('_INTERNAL_')).toBe('Internal');
    });

    it('should capitalise the character after a leading $ in camelCase input', () => {
      expect(constantNameToTypeName('$myTokens')).toBe('$MyTokens');
    });

    it('should capitalise the character after a leading $ in all-lowercase input', () => {
      expect(constantNameToTypeName('$tokens')).toBe('$Tokens');
    });

    it('should leave a $ prefix followed by already-uppercase letter unchanged', () => {
      expect(constantNameToTypeName('$MyTokens')).toBe('$MyTokens');
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
