import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateResources } from './validate-resources';
import * as exportCommon from '../export/export-common';
import { LoadedResource } from '../export/export-common';

// Mock the export-common module
vi.mock('../export/export-common', async () => {
  const actual = await vi.importActual('../export/export-common');
  return {
    ...actual,
    loadResourcesFromCollections: vi.fn(),
  };
});

describe('validateResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('success cases', () => {
    it('should pass validation when all resources are verified', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: { es: 'Vale', fr: 'OK' },
          status: { es: 'verified', fr: 'verified' },
          collection: 'main',
        },
        {
          key: 'cancel',
          fullKey: 'common.cancel',
          source: 'Cancel',
          translations: { es: 'Cancelar', fr: 'Annuler' },
          status: { es: 'verified', fr: 'verified' },
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es', 'fr'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.successes).toHaveLength(4); // 2 resources × 2 locales
      expect(result.totalResourcesValidated).toBe(4);
      expect(result.totalUniqueKeys).toBe(2);
      expect(result.localesValidated).toBe(2);
      expect(result.collectionsValidated).toBe(1);
      expect(result.statusCounts.verified).toBe(4);
      expect(result.statusCounts.new).toBe(0);
      expect(result.statusCounts.stale).toBe(0);
      expect(result.statusCounts.translated).toBe(0);
    });

    it('should pass validation with empty collections', () => {
      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue([]);

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.successes).toHaveLength(0);
      expect(result.totalResourcesValidated).toBe(0);
      expect(result.totalUniqueKeys).toBe(0);
    });
  });

  describe('failure cases - new resources', () => {
    it('should fail validation when resources have new status', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: {},
          status: { es: 'new' },
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toEqual({
        key: 'common.ok',
        locale: 'es',
        collection: 'main',
        status: 'new',
      });
      expect(result.warnings).toHaveLength(0);
      expect(result.successes).toHaveLength(0);
      expect(result.statusCounts.new).toBe(1);
    });

    it('should treat missing status as new and fail validation', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: {},
          status: {}, // No status for 'es' locale
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].status).toBe('new');
      expect(result.statusCounts.new).toBe(1);
    });
  });

  describe('failure cases - stale resources', () => {
    it('should fail validation when resources have stale status', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: { es: 'Vale' },
          status: { es: 'stale' },
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toEqual({
        key: 'common.ok',
        locale: 'es',
        collection: 'main',
        status: 'stale',
      });
      expect(result.statusCounts.stale).toBe(1);
    });
  });

  describe('failure cases - translated resources (default behavior)', () => {
    it('should fail validation when resources have translated status and allowTranslated is false', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: { es: 'Vale' },
          status: { es: 'translated' },
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]).toEqual({
        key: 'common.ok',
        locale: 'es',
        collection: 'main',
        status: 'translated',
      });
      expect(result.warnings).toHaveLength(0);
      expect(result.statusCounts.translated).toBe(1);
    });
  });

  describe('warning cases - translated resources with allowTranslated flag', () => {
    it('should generate warnings when resources have translated status and allowTranslated is true', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: { es: 'Vale' },
          status: { es: 'translated' },
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es'],
        { allowTranslated: true },
      );

      expect(result.passed).toBe(true); // No failures, only warnings
      expect(result.failures).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toEqual({
        key: 'common.ok',
        locale: 'es',
        collection: 'main',
        status: 'translated',
      });
      expect(result.statusCounts.translated).toBe(1);
    });
  });

  describe('mixed statuses', () => {
    it('should correctly categorize resources with mixed statuses across multiple locales', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: { es: 'Vale', fr: 'OK', de: 'OK' },
          status: {
            es: 'verified',
            fr: 'translated',
            de: 'new',
          },
          collection: 'main',
        },
        {
          key: 'cancel',
          fullKey: 'common.cancel',
          source: 'Cancel',
          translations: { es: 'Cancelar', fr: 'Annuler', de: 'Abbrechen' },
          status: {
            es: 'stale',
            fr: 'verified',
            de: 'translated',
          },
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es', 'fr', 'de'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(false);
      expect(result.totalResourcesValidated).toBe(6); // 2 resources × 3 locales
      expect(result.totalUniqueKeys).toBe(2);
      expect(result.localesValidated).toBe(3);

      // Failures: new (de/ok), stale (es/cancel), translated (fr/ok, de/cancel)
      expect(result.failures).toHaveLength(4);
      expect(result.failures.filter((f) => f.status === 'new')).toHaveLength(1);
      expect(result.failures.filter((f) => f.status === 'stale')).toHaveLength(
        1,
      );
      expect(
        result.failures.filter((f) => f.status === 'translated'),
      ).toHaveLength(2);

      // Successes: verified (es/ok, fr/cancel)
      expect(result.successes).toHaveLength(2);

      // No warnings with allowTranslated=false
      expect(result.warnings).toHaveLength(0);

      // Status counts
      expect(result.statusCounts.new).toBe(1);
      expect(result.statusCounts.stale).toBe(1);
      expect(result.statusCounts.translated).toBe(2);
      expect(result.statusCounts.verified).toBe(2);
    });

    it('should correctly categorize with allowTranslated=true', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: { es: 'Vale', fr: 'OK' },
          status: {
            es: 'verified',
            fr: 'translated',
          },
          collection: 'main',
        },
        {
          key: 'cancel',
          fullKey: 'common.cancel',
          source: 'Cancel',
          translations: { es: 'Cancelar', fr: 'Annuler' },
          status: {
            es: 'new',
            fr: 'stale',
          },
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es', 'fr'],
        { allowTranslated: true },
      );

      expect(result.passed).toBe(false); // Still fails due to new/stale
      expect(result.failures).toHaveLength(2); // new and stale only
      expect(result.warnings).toHaveLength(1); // translated
      expect(result.successes).toHaveLength(1); // verified

      expect(result.failures.filter((f) => f.status === 'new')).toHaveLength(1);
      expect(result.failures.filter((f) => f.status === 'stale')).toHaveLength(
        1,
      );
      expect(
        result.warnings.filter((w) => w.status === 'translated'),
      ).toHaveLength(1);
    });
  });

  describe('multiple collections', () => {
    it('should validate resources across multiple collections', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: { es: 'Vale' },
          status: { es: 'verified' },
          collection: 'main',
        },
        {
          key: 'submit',
          fullKey: 'forms.submit',
          source: 'Submit',
          translations: { es: 'Enviar' },
          status: { es: 'new' },
          collection: 'app',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [
          { name: 'main', path: '/translations/main' },
          { name: 'app', path: '/translations/app' },
        ],
        ['es'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(false);
      expect(result.collectionsValidated).toBe(2);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].collection).toBe('app');
      expect(result.successes).toHaveLength(1);
      expect(result.successes[0].collection).toBe('main');
    });
  });

  describe('comprehensive validation - no early exit', () => {
    it('should collect ALL failures across all resources and locales', () => {
      // Create 100 resources with new status across 2 locales
      const mockResources: LoadedResource[] = Array.from(
        { length: 100 },
        (_, i) => ({
          key: `key${i}`,
          fullKey: `namespace.key${i}`,
          source: `Source ${i}`,
          translations: {},
          status: { es: 'new', fr: 'new' },
          collection: 'main',
        }),
      );

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es', 'fr'],
        { allowTranslated: false },
      );

      // Should report ALL 200 failures (100 resources × 2 locales)
      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(200);
      expect(result.totalResourcesValidated).toBe(200);
      expect(result.totalUniqueKeys).toBe(100);
      expect(result.statusCounts.new).toBe(200);
    });

    it('should collect ALL failures of different types across multiple locales', () => {
      const mockResources: LoadedResource[] = [
        // Resource 1: new in es, stale in fr
        {
          key: 'key1',
          fullKey: 'ns.key1',
          source: 'Source 1',
          translations: { es: '', fr: 'Val 1' },
          status: { es: 'new', fr: 'stale' },
          collection: 'main',
        },
        // Resource 2: translated in both (will be failure)
        {
          key: 'key2',
          fullKey: 'ns.key2',
          source: 'Source 2',
          translations: { es: 'Val 2', fr: 'Val 2' },
          status: { es: 'translated', fr: 'translated' },
          collection: 'main',
        },
        // Resource 3: new in es, verified in fr
        {
          key: 'key3',
          fullKey: 'ns.key3',
          source: 'Source 3',
          translations: { es: '', fr: 'Val 3' },
          status: { es: 'new', fr: 'verified' },
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es', 'fr'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(false);
      expect(result.totalResourcesValidated).toBe(6); // 3 resources × 2 locales

      // Should collect all failures: 2 new, 1 stale, 2 translated = 5 total
      expect(result.failures).toHaveLength(5);
      expect(result.failures.filter((f) => f.status === 'new')).toHaveLength(2);
      expect(result.failures.filter((f) => f.status === 'stale')).toHaveLength(
        1,
      );
      expect(
        result.failures.filter((f) => f.status === 'translated'),
      ).toHaveLength(2);

      // Should have 1 success
      expect(result.successes).toHaveLength(1);
      expect(result.successes[0].status).toBe('verified');
    });

    it('should validate across multiple collections and collect all failures', () => {
      const mockResources: LoadedResource[] = [
        // Collection 1 - 2 resources with failures
        {
          key: 'key1',
          fullKey: 'c1.key1',
          source: 'Source 1',
          translations: { es: '' },
          status: { es: 'new' },
          collection: 'collection1',
        },
        {
          key: 'key2',
          fullKey: 'c1.key2',
          source: 'Source 2',
          translations: { es: 'Val 2' },
          status: { es: 'stale' },
          collection: 'collection1',
        },
        // Collection 2 - 2 resources with failures
        {
          key: 'key1',
          fullKey: 'c2.key1',
          source: 'Source 3',
          translations: { es: 'Val 3' },
          status: { es: 'translated' },
          collection: 'collection2',
        },
        {
          key: 'key2',
          fullKey: 'c2.key2',
          source: 'Source 4',
          translations: { es: '' },
          status: { es: 'new' },
          collection: 'collection2',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [
          { name: 'collection1', path: '/c1' },
          { name: 'collection2', path: '/c2' },
        ],
        ['es'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(false);
      expect(result.collectionsValidated).toBe(2);
      expect(result.failures).toHaveLength(4);

      // Verify all collections are represented
      const collection1Failures = result.failures.filter(
        (f) => f.collection === 'collection1',
      );
      const collection2Failures = result.failures.filter(
        (f) => f.collection === 'collection2',
      );
      expect(collection1Failures).toHaveLength(2);
      expect(collection2Failures).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle resources with no translations in any locale', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: {},
          status: {},
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es', 'fr'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(false);
      expect(result.failures).toHaveLength(2); // Both locales default to 'new'
      expect(result.failures.every((f) => f.status === 'new')).toBe(true);
    });

    it('should handle validation with no target locales', () => {
      const mockResources: LoadedResource[] = [
        {
          key: 'ok',
          fullKey: 'common.ok',
          source: 'OK',
          translations: {},
          status: {},
          collection: 'main',
        },
      ];

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        [],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(true); // No locales to validate
      expect(result.failures).toHaveLength(0);
      expect(result.totalResourcesValidated).toBe(0);
      expect(result.localesValidated).toBe(0);
    });

    it('should handle large numbers of resources efficiently', () => {
      // Create 1000 resources
      const mockResources: LoadedResource[] = Array.from(
        { length: 1000 },
        (_, i) => ({
          key: `key${i}`,
          fullKey: `ns.key${i}`,
          source: `Source ${i}`,
          translations: { es: `Value ${i}` },
          status: { es: 'verified' },
          collection: 'main',
        }),
      );

      vi.mocked(exportCommon.loadResourcesFromCollections).mockReturnValue(
        mockResources,
      );

      const result = validateResources(
        [{ name: 'main', path: '/translations' }],
        ['es'],
        { allowTranslated: false },
      );

      expect(result.passed).toBe(true);
      expect(result.totalResourcesValidated).toBe(1000);
      expect(result.successes).toHaveLength(1000);
      expect(result.statusCounts.verified).toBe(1000);
    });
  });
});
