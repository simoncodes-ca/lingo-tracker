import { describe, it, expect } from 'vitest';
import { normalizeEntry, NormalizeEntryParams } from './normalize-entry';
import { ResourceEntry } from '../../resource/resource-entry';
import { ResourceEntryMetadata } from '../../resource/resource-entry-metadata';
import { calculateChecksum } from '../../resource/checksum';

describe('Normalize Entry', () => {
  const baseLocale = 'en';
  const locales = ['en', 'fr-ca', 'es'];

  describe('normalizeEntry', () => {
    it('should recompute base checksum for base locale', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
      };

      const metadata: ResourceEntryMetadata = {};

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      const expectedChecksum = calculateChecksum('Cancel');
      expect(result.metadata[baseLocale]).toBeDefined();
      expect(result.metadata[baseLocale].checksum).toBe(expectedChecksum);
    });

    it('should add missing locale entry with base value and status new', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
        'fr-ca': 'Annuler',
        // es is missing
      };

      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum('Cancel') },
        'fr-ca': {
          checksum: calculateChecksum('Annuler'),
          baseChecksum: calculateChecksum('Cancel'),
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      // Should add es with base value
      expect(result.resourceEntry['es']).toBe('Cancel');
      expect(result.metadata['es']).toBeDefined();
      expect(result.metadata['es'].status).toBe('new');
      expect(result.metadata['es'].checksum).toBe(calculateChecksum('Cancel'));
      expect(result.metadata['es'].baseChecksum).toBe(
        calculateChecksum('Cancel'),
      );

      expect(result.changes.localesAdded).toBe(1);
    });

    it('should recompute checksum for existing locale entry', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
        'fr-ca': 'Annuler',
      };

      const oldChecksum = 'outdated-checksum';
      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum('Cancel') },
        'fr-ca': {
          checksum: oldChecksum,
          baseChecksum: calculateChecksum('Cancel'),
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      const expectedChecksum = calculateChecksum('Annuler');
      expect(result.metadata['fr-ca'].checksum).toBe(expectedChecksum);
      expect(result.metadata['fr-ca'].checksum).not.toBe(oldChecksum);

      expect(result.changes.checksumsUpdated).toBeGreaterThan(0);
    });

    it('should update baseChecksum to current base checksum', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
        'fr-ca': 'Annuler',
      };

      const oldBaseChecksum = 'old-base-checksum';
      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum('Cancel') },
        'fr-ca': {
          checksum: calculateChecksum('Annuler'),
          baseChecksum: oldBaseChecksum,
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      const currentBaseChecksum = calculateChecksum('Cancel');
      expect(result.metadata['fr-ca'].baseChecksum).toBe(currentBaseChecksum);
    });

    it('should set status to stale when base value changed', () => {
      // Simulate base value change: was "Save" now "Save Changes"
      const oldBaseValue = 'Save';
      const newBaseValue = 'Save Changes';

      const resourceEntry: ResourceEntry = {
        source: newBaseValue,
        'fr-ca': 'Enregistrer', // Translation for old value
      };

      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum(oldBaseValue) },
        'fr-ca': {
          checksum: calculateChecksum('Enregistrer'),
          baseChecksum: calculateChecksum(oldBaseValue),
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'save',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      expect(result.metadata['fr-ca'].status).toBe('stale');
      expect(result.changes.statusesChanged).toBe(2); // fr-ca: translated→stale, es: undefined→new
    });

    it('should preserve status translated when base unchanged', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
        'fr-ca': 'Annuler',
      };

      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum('Cancel') },
        'fr-ca': {
          checksum: calculateChecksum('Annuler'),
          baseChecksum: calculateChecksum('Cancel'),
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      expect(result.metadata['fr-ca'].status).toBe('translated');
    });

    it('should preserve status verified when base unchanged', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
        'fr-ca': 'Annuler',
      };

      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum('Cancel') },
        'fr-ca': {
          checksum: calculateChecksum('Annuler'),
          baseChecksum: calculateChecksum('Cancel'),
          status: 'verified',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      expect(result.metadata['fr-ca'].status).toBe('verified');
    });

    it('should set status to new when locale value equals new base value', () => {
      // Base changed from "OK" to "Okay", but locale also has "Okay"
      const oldBaseValue = 'OK';
      const newBaseValue = 'Okay';

      const resourceEntry: ResourceEntry = {
        source: newBaseValue,
        'fr-ca': newBaseValue, // Locale value matches new base
      };

      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum(oldBaseValue) },
        'fr-ca': {
          checksum: calculateChecksum('Okay'),
          baseChecksum: calculateChecksum(oldBaseValue),
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'ok',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      // Should be 'new' not 'stale' since locale equals base
      expect(result.metadata['fr-ca'].status).toBe('new');
    });

    it('should preserve comments and tags in resource entry', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
        comment: 'Cancel button label',
        tags: ['ui', 'buttons'],
        'fr-ca': 'Annuler',
      };

      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum('Cancel') },
        'fr-ca': {
          checksum: calculateChecksum('Annuler'),
          baseChecksum: calculateChecksum('Cancel'),
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      expect(result.resourceEntry.comment).toBe('Cancel button label');
      expect(result.resourceEntry.tags).toEqual(['ui', 'buttons']);
    });

    it('should return correct change counts (localesAdded, checksumsUpdated, statusesChanged)', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
        'fr-ca': 'Annuler',
        // es missing
      };

      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum('Cancel') },
        'fr-ca': {
          checksum: 'outdated-checksum',
          baseChecksum: calculateChecksum('Cancel'),
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      expect(result.changes.localesAdded).toBe(1); // es added
      expect(result.changes.checksumsUpdated).toBeGreaterThan(0); // fr-ca checksum updated
      expect(result.changes.statusesChanged).toBe(1); // es status new
    });

    it('should be no-op when entry already fully consistent', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
        'fr-ca': 'Annuler',
        es: 'Cancelar',
      };

      const baseChecksum = calculateChecksum('Cancel');
      const metadata: ResourceEntryMetadata = {
        en: { checksum: baseChecksum },
        'fr-ca': {
          checksum: calculateChecksum('Annuler'),
          baseChecksum,
          status: 'translated',
        },
        es: {
          checksum: calculateChecksum('Cancelar'),
          baseChecksum,
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      expect(result.changes.localesAdded).toBe(0);
      expect(result.changes.statusesChanged).toBe(0);
      // Note: checksums might still be counted as "updated" even if values are same
      // because we always recompute them
    });

    it('should handle entry with no previous metadata', () => {
      const resourceEntry: ResourceEntry = {
        source: 'New Entry',
      };

      const metadata: ResourceEntryMetadata = {};

      const params: NormalizeEntryParams = {
        entryKey: 'newEntry',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      // Should add all locales
      expect(result.resourceEntry['fr-ca']).toBe('New Entry');
      expect(result.resourceEntry['es']).toBe('New Entry');

      // All should have status 'new'
      expect(result.metadata['fr-ca'].status).toBe('new');
      expect(result.metadata['es'].status).toBe('new');

      expect(result.changes.localesAdded).toBe(2);
    });

    it('should handle multiple locales being added simultaneously', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Submit',
        // No translations yet
      };

      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum('Submit') },
      };

      const multipleLocales = ['en', 'fr-ca', 'es', 'de', 'ja'];
      const params: NormalizeEntryParams = {
        entryKey: 'submit',
        resourceEntry,
        metadata,
        baseLocale,
        locales: multipleLocales,
      };

      const result = normalizeEntry(params);

      expect(result.changes.localesAdded).toBe(4); // All except base locale
      expect(result.resourceEntry['fr-ca']).toBe('Submit');
      expect(result.resourceEntry.es).toBe('Submit');
      expect(result.resourceEntry.de).toBe('Submit');
      expect(result.resourceEntry.ja).toBe('Submit');
    });

    it('should remove base locale from resource entry if it exists', () => {
      const resourceEntry: ResourceEntry = {
        source: 'Cancel',
        en: 'Cancel', // Base locale should NOT be in resource entries
        'fr-ca': 'Annuler',
      };

      const metadata: ResourceEntryMetadata = {
        en: { checksum: calculateChecksum('Cancel') },
        'fr-ca': {
          checksum: calculateChecksum('Annuler'),
          baseChecksum: calculateChecksum('Cancel'),
          status: 'translated',
        },
      };

      const params: NormalizeEntryParams = {
        entryKey: 'cancel',
        resourceEntry,
        metadata,
        baseLocale,
        locales,
      };

      const result = normalizeEntry(params);

      // Base locale should NOT appear in normalized entry
      expect(result.resourceEntry[baseLocale]).toBeUndefined();
      // But source should still exist
      expect(result.resourceEntry.source).toBe('Cancel');
      // And other locales should be preserved
      expect(result.resourceEntry['fr-ca']).toBe('Annuler');
    });
  });
});
