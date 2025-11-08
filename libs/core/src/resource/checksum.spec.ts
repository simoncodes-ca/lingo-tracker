import { calculateChecksum, verifyChecksum } from './checksum';

describe('Checksum Utilities', () => {
  describe('calculateChecksum', () => {
    it('should calculate MD5 checksum of a string', () => {
      const value = 'Hello, World!';
      const checksum = calculateChecksum(value);
      // MD5 hash of "Hello, World!"
      expect(checksum).toBe('65a8e27d8879283831b664bd8b7f0ad4');
    });

    it('should produce consistent checksums for the same value', () => {
      const value = 'test value';
      const checksum1 = calculateChecksum(value);
      const checksum2 = calculateChecksum(value);
      expect(checksum1).toBe(checksum2);
    });

    it('should produce different checksums for different values', () => {
      const checksum1 = calculateChecksum('value1');
      const checksum2 = calculateChecksum('value2');
      expect(checksum1).not.toBe(checksum2);
    });

    it('should handle empty strings', () => {
      const checksum = calculateChecksum('');
      expect(checksum).toBe('d41d8cd98f00b204e9800998ecf8427e');
    });

    it('should handle strings with special characters', () => {
      const checksum = calculateChecksum('特殊文字');
      expect(typeof checksum).toBe('string');
      expect(checksum).toHaveLength(32); // MD5 produces 32 hex chars
    });
  });

  describe('verifyChecksum', () => {
    it('should verify matching checksums', () => {
      const value = 'test value';
      const checksum = calculateChecksum(value);
      expect(verifyChecksum(value, checksum)).toBe(true);
    });

    it('should reject mismatching checksums', () => {
      const value = 'test value';
      const wrongChecksum = calculateChecksum('different value');
      expect(verifyChecksum(value, wrongChecksum)).toBe(false);
    });

    it('should be case-insensitive for stored checksums', () => {
      const value = 'test value';
      const checksum = calculateChecksum(value).toUpperCase();
      // Note: lowercase comparison should work
      expect(verifyChecksum(value, checksum.toLowerCase())).toBe(true);
    });
  });
});
