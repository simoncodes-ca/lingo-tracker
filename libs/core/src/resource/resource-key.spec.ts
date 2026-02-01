import {
  isValidSegment,
  validateKey,
  validateTargetFolder,
  resolveResourceKey,
  splitResolvedKey,
} from './resource-key';

describe('Resource Key Utilities', () => {
  describe('isValidSegment', () => {
    it('should accept alphanumeric segments', () => {
      expect(isValidSegment('apps')).toBe(true);
      expect(isValidSegment('buttons123')).toBe(true);
    });

    it('should accept segments with underscores and hyphens', () => {
      expect(isValidSegment('my_segment')).toBe(true);
      expect(isValidSegment('my-segment')).toBe(true);
      expect(isValidSegment('_segment')).toBe(true);
      expect(isValidSegment('-segment')).toBe(true);
    });

    it('should reject segments with invalid characters', () => {
      expect(isValidSegment('apps.common')).toBe(false);
      expect(isValidSegment('apps common')).toBe(false);
      expect(isValidSegment('apps$')).toBe(false);
      expect(isValidSegment('apps@')).toBe(false);
      expect(isValidSegment('')).toBe(false);
    });
  });

  describe('validateKey', () => {
    it('should accept valid keys', () => {
      expect(() => validateKey('apps.common.buttons.ok')).not.toThrow();
      expect(() => validateKey('simple')).not.toThrow();
      expect(() => validateKey('app_1.button-2')).not.toThrow();
    });

    it('should reject empty keys', () => {
      expect(() => validateKey('')).toThrow('Key cannot be empty');
      expect(() => validateKey('   ')).toThrow('Key cannot be empty');
    });

    it('should reject keys with invalid segments', () => {
      expect(() => validateKey('apps.common.buttons.ok!')).toThrow();
      expect(() => validateKey('apps..buttons')).toThrow();
      expect(() => validateKey('apps.common@buttons')).toThrow();
    });
  });

  describe('validateTargetFolder', () => {
    it('should accept valid target folders', () => {
      expect(() => validateTargetFolder('apps.common')).not.toThrow();
      expect(() => validateTargetFolder('single')).not.toThrow();
      expect(() => validateTargetFolder('app_1.button-2')).not.toThrow();
    });

    it('should accept empty target folder', () => {
      expect(() => validateTargetFolder('')).not.toThrow();
      expect(() => validateTargetFolder('   ')).not.toThrow();
    });

    it('should reject target folders with invalid segments', () => {
      expect(() => validateTargetFolder('apps.common!')).toThrow();
      expect(() => validateTargetFolder('apps@common')).toThrow();
    });
  });

  describe('resolveResourceKey', () => {
    it('should return key when targetFolder is empty', () => {
      expect(resolveResourceKey('buttons.ok', '')).toBe('buttons.ok');
      expect(resolveResourceKey('buttons.ok')).toBe('buttons.ok');
    });

    it('should concatenate targetFolder and key', () => {
      expect(resolveResourceKey('buttons.ok', 'apps.common')).toBe(
        'apps.common.buttons.ok',
      );
      expect(resolveResourceKey('cancel', 'dialogs')).toBe('dialogs.cancel');
    });

    it('should allow overlapping segments (no de-duplication)', () => {
      expect(resolveResourceKey('apps.buttons', 'apps.common')).toBe(
        'apps.common.apps.buttons',
      );
    });
  });

  describe('splitResolvedKey', () => {
    it('should split simple key into segments', () => {
      const result = splitResolvedKey('cancel');
      expect(result.segments).toEqual(['cancel']);
      expect(result.folderPath).toEqual([]);
      expect(result.entryKey).toBe('cancel');
    });

    it('should split nested key correctly', () => {
      const result = splitResolvedKey('apps.common.buttons.cancel');
      expect(result.segments).toEqual(['apps', 'common', 'buttons', 'cancel']);
      expect(result.folderPath).toEqual(['apps', 'common', 'buttons']);
      expect(result.entryKey).toBe('cancel');
    });

    it('should handle two-level keys', () => {
      const result = splitResolvedKey('dialogs.ok');
      expect(result.segments).toEqual(['dialogs', 'ok']);
      expect(result.folderPath).toEqual(['dialogs']);
      expect(result.entryKey).toBe('ok');
    });
  });

  describe('integration: key validation and resolution', () => {
    it('should validate and resolve equivalently positioned keys', () => {
      const key1 = 'apps.common.buttons.cancel';
      const key2 = 'buttons.cancel';
      const targetFolder = 'apps.common';

      validateKey(key1);
      validateKey(key2);
      validateTargetFolder(targetFolder);

      const resolved = resolveResourceKey(key2, targetFolder);
      expect(resolved).toBe(key1);

      const split1 = splitResolvedKey(key1);
      const split2 = splitResolvedKey(resolved);
      expect(split1).toEqual(split2);
    });
  });
});
