import { describe, it, expect } from 'vitest';
import {
  getInitialStatus,
  getTranslatedStatus,
  shouldMarkStale,
  createBaseLocaleMetadata,
  createTranslatedMetadata,
  updateMetadataForBaseChange,
} from './status-helpers';
import type { LocaleMetadata } from './locale-metadata';

describe('getInitialStatus', () => {
  it('returns "new"', () => {
    expect(getInitialStatus()).toBe('new');
  });
});

describe('getTranslatedStatus', () => {
  it('returns "translated"', () => {
    expect(getTranslatedStatus()).toBe('translated');
  });
});

describe('shouldMarkStale', () => {
  it('returns false when no baseChecksum exists (base locale entry)', () => {
    const metadata: LocaleMetadata = { checksum: 'abc123' };
    expect(shouldMarkStale(metadata, 'def456')).toBe(false);
  });

  it('returns false when the baseChecksum matches the new base checksum', () => {
    const metadata: LocaleMetadata = {
      checksum: 'abc123',
      baseChecksum: 'base123',
    };
    expect(shouldMarkStale(metadata, 'base123')).toBe(false);
  });

  it('returns true when the baseChecksum differs from the new base checksum', () => {
    const metadata: LocaleMetadata = {
      checksum: 'abc123',
      baseChecksum: 'old-base',
    };
    expect(shouldMarkStale(metadata, 'new-base')).toBe(true);
  });
});

describe('createBaseLocaleMetadata', () => {
  it('creates metadata with only checksum — no status or baseChecksum', () => {
    const metadata = createBaseLocaleMetadata('base-checksum-123');
    expect(metadata).toEqual({ checksum: 'base-checksum-123' });
    expect(metadata.status).toBeUndefined();
    expect(metadata.baseChecksum).toBeUndefined();
  });
});

describe('createTranslatedMetadata', () => {
  it('creates metadata with checksum, baseChecksum, and translated status', () => {
    const metadata = createTranslatedMetadata('trans-checksum', 'base-checksum');
    expect(metadata).toEqual({
      checksum: 'trans-checksum',
      baseChecksum: 'base-checksum',
      status: 'translated',
    });
  });
});

describe('updateMetadataForBaseChange', () => {
  it('marks entry as stale when the baseChecksum has changed', () => {
    const metadata = createTranslatedMetadata('trans-old', 'base-old');
    const updated = updateMetadataForBaseChange(metadata, 'base-new');

    expect(updated).toEqual({
      checksum: 'trans-old',
      baseChecksum: 'base-new',
      status: 'stale',
    });
  });

  it('leaves status unchanged when the baseChecksum has not changed', () => {
    const metadata = createTranslatedMetadata('trans', 'base-same');
    const updated = updateMetadataForBaseChange(metadata, 'base-same');

    expect(updated).toEqual({
      checksum: 'trans',
      baseChecksum: 'base-same',
      status: 'translated',
    });
  });

  it('marks verified entries as stale when the base changes', () => {
    const metadata: LocaleMetadata = {
      checksum: 'trans',
      baseChecksum: 'base-old',
      status: 'verified',
    };
    const updated = updateMetadataForBaseChange(metadata, 'base-new');
    expect(updated.status).toBe('stale');
  });

  it('preserves verified status when the base has not changed', () => {
    const metadata: LocaleMetadata = {
      checksum: 'trans',
      baseChecksum: 'base-same',
      status: 'verified',
    };
    const updated = updateMetadataForBaseChange(metadata, 'base-same');
    expect(updated.status).toBe('verified');
  });

  it('does not alter base locale metadata (no baseChecksum)', () => {
    const metadata = createBaseLocaleMetadata('base-checksum');
    const updated = updateMetadataForBaseChange(metadata, 'new-base');

    expect(updated).toEqual({ checksum: 'base-checksum' });
    expect(updated.status).toBeUndefined();
  });

  describe('full lifecycle', () => {
    it('progresses through new → translated → stale correctly', () => {
      const baseMetadata = createBaseLocaleMetadata('base-v1');
      expect(baseMetadata.status).toBeUndefined();

      const translatedMetadata = createTranslatedMetadata('trans', 'base-v1');
      expect(translatedMetadata.status).toBe('translated');

      const staleMetadata = updateMetadataForBaseChange(translatedMetadata, 'base-v2');
      expect(staleMetadata.status).toBe('stale');
      expect(staleMetadata.baseChecksum).toBe('base-v2');
    });
  });
});
