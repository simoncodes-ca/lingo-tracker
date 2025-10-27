import {
  getInitialStatus,
  getTranslatedStatus,
  shouldMarkStale,
  createBaseLocaleMetadata,
  createTranslatedMetadata,
  updateMetadataForBaseChange,
} from './status-helpers';
import { SafeAny } from '../constants';

describe('Status Helpers', () => {
  describe('getInitialStatus', () => {
    it('should return "new" for initial status', () => {
      expect(getInitialStatus()).toBe('new');
    });
  });

  describe('getTranslatedStatus', () => {
    it('should return "translated" for translated status', () => {
      expect(getTranslatedStatus()).toBe('translated');
    });
  });

  describe('shouldMarkStale', () => {
    it('should return false if no baseChecksum exists', () => {
      const metadata = { checksum: 'abc123' };
      expect(shouldMarkStale(metadata, 'def456')).toBe(false);
    });

    it('should return false if baseChecksum matches new base checksum', () => {
      const metadata = {
        checksum: 'abc123',
        baseChecksum: 'base123',
      };
      expect(shouldMarkStale(metadata, 'base123')).toBe(false);
    });

    it('should return true if baseChecksum differs from new base checksum', () => {
      const metadata = {
        checksum: 'abc123',
        baseChecksum: 'old-base',
      };
      expect(shouldMarkStale(metadata, 'new-base')).toBe(true);
    });
  });

  describe('createBaseLocaleMetadata', () => {
    it('should create metadata with only checksum and no status', () => {
      const metadata = createBaseLocaleMetadata('base-checksum-123');
      expect(metadata).toEqual({
        checksum: 'base-checksum-123',
      });
      expect(metadata.status).toBeUndefined();
      expect(metadata.baseChecksum).toBeUndefined();
    });
  });

  describe('createTranslatedMetadata', () => {
    it('should create metadata with checksum, baseChecksum, and status', () => {
      const metadata = createTranslatedMetadata(
        'trans-checksum',
        'base-checksum'
      );
      expect(metadata).toEqual({
        checksum: 'trans-checksum',
        baseChecksum: 'base-checksum',
        status: 'translated',
      });
    });
  });

  describe('updateMetadataForBaseChange', () => {
    it('should mark as stale when baseChecksum differs', () => {
      const metadata = createTranslatedMetadata('trans-old', 'base-old');
      const updated = updateMetadataForBaseChange(metadata, 'base-new');

      expect(updated).toEqual({
        checksum: 'trans-old',
        baseChecksum: 'base-new',
        status: 'stale',
      });
    });

    it('should not mark as stale when baseChecksum matches', () => {
      const metadata = createTranslatedMetadata('trans', 'base-same');
      const updated = updateMetadataForBaseChange(metadata, 'base-same');

      expect(updated).toEqual({
        checksum: 'trans',
        baseChecksum: 'base-same',
        status: 'translated',
      });
    });

    it('should preserve status for verified entries when base matches', () => {
      const metadata: SafeAny = {
        checksum: 'trans',
        baseChecksum: 'base-same',
        status: 'verified',
      };
      const updated = updateMetadataForBaseChange(metadata, 'base-same');

      expect(updated.status).toBe('verified');
    });

    it('should mark verified entries as stale when base changes', () => {
      const metadata: SafeAny = {
        checksum: 'trans',
        baseChecksum: 'base-old',
        status: 'verified',
      };
      const updated = updateMetadataForBaseChange(metadata, 'base-new');

      expect(updated.status).toBe('stale');
    });

    it('should not affect metadata without baseChecksum', () => {
      const metadata = createBaseLocaleMetadata('base-checksum');
      const updated = updateMetadataForBaseChange(metadata, 'new-base');

      expect(updated).toEqual({
        checksum: 'base-checksum',
      });
      expect(updated.status).toBeUndefined();
    });
  });

  describe('integration: lifecycle scenarios', () => {
    it('should create new base entry, add translation, then mark stale', () => {
      // Step 1: Create base locale entry
      const baseMetadata = createBaseLocaleMetadata('base-v1');
      expect(baseMetadata.status).toBeUndefined();

      // Step 2: Create translated entry
      const translatedMetadata = createTranslatedMetadata('trans', 'base-v1');
      expect(translatedMetadata.status).toBe('translated');

      // Step 3: Base value changes
      const staleMetadata = updateMetadataForBaseChange(
        translatedMetadata,
        'base-v2'
      );
      expect(staleMetadata.status).toBe('stale');
      expect(staleMetadata.baseChecksum).toBe('base-v2');
    });
  });
});
