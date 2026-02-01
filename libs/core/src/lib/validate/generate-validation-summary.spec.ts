import { describe, it, expect } from 'vitest';
import { generateValidationSummary } from './generate-validation-summary';
import type { ResourceValidationResult, ValidationOptions, ResourceValidationDetail } from './types';

describe('generateValidationSummary', () => {
  const defaultOptions: ValidationOptions = {
    allowTranslated: false,
  };

  describe('successful validation', () => {
    it('should generate summary for all verified resources', () => {
      const result: ResourceValidationResult = {
        totalResourcesValidated: 100,
        totalUniqueKeys: 50,
        localesValidated: 2,
        collectionsValidated: 1,
        statusCounts: {
          new: 0,
          translated: 0,
          stale: 0,
          verified: 100,
        },
        failures: [],
        warnings: [],
        successes: createResourceDetails('verified', 100, 'es', 'main'),
        passed: true,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('✅ Validation PASSED');
      expect(summary).toContain('Total Resources Validated: 100');
      expect(summary).toContain('Unique Resource Keys: 50');
      expect(summary).toContain('Locales Validated: 2');
      expect(summary).toContain('Collections Validated: 1');
      expect(summary).toContain('✅ Verified: 100');
      expect(summary).toContain('✅ Validation passed successfully!');
      expect(summary).not.toContain('❌ Failures');
      expect(summary).not.toContain('⚠️  Warnings');
    });

    it('should show minimal output for successful validation with no resources', () => {
      const result: ResourceValidationResult = {
        totalResourcesValidated: 0,
        totalUniqueKeys: 0,
        localesValidated: 0,
        collectionsValidated: 0,
        statusCounts: {
          new: 0,
          translated: 0,
          stale: 0,
          verified: 0,
        },
        failures: [],
        warnings: [],
        successes: [],
        passed: true,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('✅ Validation PASSED');
      expect(summary).toContain('Total Resources Validated: 0');
      expect(summary).toContain('✅ Validation passed successfully!');
    });
  });

  describe('validation with failures only', () => {
    it('should display all new resource failures', () => {
      const failures = createResourceDetails('new', 10, 'es', 'main');
      const result: ResourceValidationResult = {
        totalResourcesValidated: 10,
        totalUniqueKeys: 10,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 10,
          translated: 0,
          stale: 0,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('❌ Validation FAILED');
      expect(summary).toContain('❌ Failures (10)');
      expect(summary).toContain('Locale: es (10 failures)');
      expect(summary).toContain('[main] resource-0 (new)');
      expect(summary).toContain('[main] resource-9 (new)');
      expect(summary).toContain('Total Failures: 10');
      expect(summary).toContain('❌ Validation failed. Please review the failures above.');
    });

    it('should display all stale resource failures', () => {
      const failures = createResourceDetails('stale', 5, 'fr', 'core');
      const result: ResourceValidationResult = {
        totalResourcesValidated: 5,
        totalUniqueKeys: 5,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 0,
          translated: 0,
          stale: 5,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('❌ Validation FAILED');
      expect(summary).toContain('❌ Failures (5)');
      expect(summary).toContain('Locale: fr (5 failures)');
      expect(summary).toContain('[core] resource-0 (stale)');
      expect(summary).toContain('⚠️  Stale: 5');
      expect(summary).toContain('Total Failures: 5');
    });

    it('should display mixed new and stale failures', () => {
      const newFailures = createResourceDetails('new', 3, 'es', 'main');
      const staleFailures = createResourceDetails('stale', 2, 'es', 'main');
      const failures = [...newFailures, ...staleFailures];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 5,
        totalUniqueKeys: 5,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 3,
          translated: 0,
          stale: 2,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('❌ Failures (5)');
      expect(summary).toContain('Locale: es (5 failures)');
      expect(summary).toContain('(new)');
      expect(summary).toContain('(stale)');
    });

    it('should treat translated as failure when allowTranslated is false', () => {
      const failures = createResourceDetails('translated', 8, 'de', 'app');
      const result: ResourceValidationResult = {
        totalResourcesValidated: 8,
        totalUniqueKeys: 8,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 0,
          translated: 8,
          stale: 0,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('❌ Validation FAILED');
      expect(summary).toContain('❌ Failures (8)');
      expect(summary).toContain('[app] resource-0 (translated)');
      expect(summary).toContain('✏️  Translated: 8');
    });
  });

  describe('validation with warnings only', () => {
    it('should display warnings when allowTranslated is true', () => {
      const warnings = createResourceDetails('translated', 5, 'es', 'main');
      const successes = createResourceDetails('verified', 15, 'es', 'main');
      const result: ResourceValidationResult = {
        totalResourcesValidated: 20,
        totalUniqueKeys: 20,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 0,
          translated: 5,
          stale: 0,
          verified: 15,
        },
        failures: [],
        warnings,
        successes,
        passed: true,
      };

      const optionsWithAllowTranslated: ValidationOptions = {
        allowTranslated: true,
      };

      const summary = generateValidationSummary(result, optionsWithAllowTranslated);

      expect(summary).toContain('✅ Validation PASSED');
      expect(summary).toContain('⚠️  Warnings (5)');
      expect(summary).toContain('Resources with "translated" status (not yet verified)');
      expect(summary).toContain('Locale: es (5 warnings)');
      expect(summary).toContain('[main] resource-0 (translated)');
      expect(summary).toContain('Total Warnings: 5');
      expect(summary).toContain('Total Successes: 15');
      expect(summary).toContain('✅ Validation passed with warnings.');
    });

    it('should not show warnings section when allowTranslated is false', () => {
      const result: ResourceValidationResult = {
        totalResourcesValidated: 10,
        totalUniqueKeys: 10,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 0,
          translated: 0,
          stale: 0,
          verified: 10,
        },
        failures: [],
        warnings: [],
        successes: createResourceDetails('verified', 10, 'es', 'main'),
        passed: true,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).not.toContain('⚠️  Warnings');
      expect(summary).not.toContain('Total Warnings');
    });
  });

  describe('validation with both failures and warnings', () => {
    it('should display both failures and warnings sections', () => {
      const failures = [
        ...createResourceDetails('new', 3, 'es', 'main'),
        ...createResourceDetails('stale', 2, 'es', 'main'),
      ];
      const warnings = createResourceDetails('translated', 5, 'es', 'main');
      const successes = createResourceDetails('verified', 10, 'es', 'main');

      const result: ResourceValidationResult = {
        totalResourcesValidated: 20,
        totalUniqueKeys: 20,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 3,
          translated: 5,
          stale: 2,
          verified: 10,
        },
        failures,
        warnings,
        successes,
        passed: false,
      };

      const optionsWithAllowTranslated: ValidationOptions = {
        allowTranslated: true,
      };

      const summary = generateValidationSummary(result, optionsWithAllowTranslated);

      expect(summary).toContain('❌ Validation FAILED');
      expect(summary).toContain('❌ Failures (5)');
      expect(summary).toContain('⚠️  Warnings (5)');
      expect(summary).toContain('Total Failures: 5');
      expect(summary).toContain('Total Warnings: 5');
      expect(summary).toContain('Total Successes: 10');
      expect(summary).toContain('❌ Validation failed. Please review the failures above.');
    });
  });

  describe('formatting with long resource keys', () => {
    it('should handle very long resource keys without breaking layout', () => {
      const longKeyFailures: ResourceValidationDetail[] = [
        {
          key: 'app.features.authentication.passwordReset.confirmationMessages.success.withEmailSentNotification',
          locale: 'es',
          collection: 'main',
          status: 'new',
        },
        {
          key: 'app.features.authentication.passwordReset.confirmationMessages.failure.withRetryInstructions',
          locale: 'es',
          collection: 'main',
          status: 'stale',
        },
      ];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 2,
        totalUniqueKeys: 2,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 1,
          translated: 0,
          stale: 1,
          verified: 0,
        },
        failures: longKeyFailures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain(
        'app.features.authentication.passwordReset.confirmationMessages.success.withEmailSentNotification',
      );
      expect(summary).toContain(
        'app.features.authentication.passwordReset.confirmationMessages.failure.withRetryInstructions',
      );
      expect(summary).toContain('❌ Failures (2)');
    });
  });

  describe('multi-locale scenarios', () => {
    it('should group failures by locale and sort alphabetically', () => {
      const failures = [
        ...createResourceDetails('new', 2, 'fr', 'main'),
        ...createResourceDetails('stale', 3, 'es', 'main'),
        ...createResourceDetails('new', 1, 'de', 'main'),
      ];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 6,
        totalUniqueKeys: 2,
        localesValidated: 3,
        collectionsValidated: 1,
        statusCounts: {
          new: 3,
          translated: 0,
          stale: 3,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      // Check that locales appear in alphabetical order
      const deIndex = summary.indexOf('Locale: de');
      const esIndex = summary.indexOf('Locale: es');
      const frIndex = summary.indexOf('Locale: fr');

      expect(deIndex).toBeGreaterThan(0);
      expect(esIndex).toBeGreaterThan(deIndex);
      expect(frIndex).toBeGreaterThan(esIndex);

      expect(summary).toContain('Locale: de (1 failures)');
      expect(summary).toContain('Locale: es (3 failures)');
      expect(summary).toContain('Locale: fr (2 failures)');
    });

    it('should group warnings by locale and sort alphabetically', () => {
      const warnings = [
        ...createResourceDetails('translated', 4, 'pt', 'main'),
        ...createResourceDetails('translated', 2, 'it', 'main'),
        ...createResourceDetails('translated', 1, 'ja', 'main'),
      ];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 7,
        totalUniqueKeys: 7,
        localesValidated: 3,
        collectionsValidated: 1,
        statusCounts: {
          new: 0,
          translated: 7,
          stale: 0,
          verified: 0,
        },
        failures: [],
        warnings,
        successes: [],
        passed: true,
      };

      const optionsWithAllowTranslated: ValidationOptions = {
        allowTranslated: true,
      };

      const summary = generateValidationSummary(result, optionsWithAllowTranslated);

      const itIndex = summary.indexOf('Locale: it');
      const jaIndex = summary.indexOf('Locale: ja');
      const ptIndex = summary.indexOf('Locale: pt');

      expect(itIndex).toBeGreaterThan(0);
      expect(jaIndex).toBeGreaterThan(itIndex);
      expect(ptIndex).toBeGreaterThan(jaIndex);
    });
  });

  describe('multi-collection scenarios', () => {
    it('should show collection names in failure details', () => {
      const failures = [
        {
          key: 'resource-1',
          locale: 'es',
          collection: 'main',
          status: 'new' as const,
        },
        {
          key: 'resource-2',
          locale: 'es',
          collection: 'admin',
          status: 'stale' as const,
        },
        {
          key: 'resource-3',
          locale: 'es',
          collection: 'auth',
          status: 'new' as const,
        },
      ];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 3,
        totalUniqueKeys: 3,
        localesValidated: 1,
        collectionsValidated: 3,
        statusCounts: {
          new: 2,
          translated: 0,
          stale: 1,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('[main] resource-1');
      expect(summary).toContain('[admin] resource-2');
      expect(summary).toContain('[auth] resource-3');
      expect(summary).toContain('Collections Validated: 3');
    });

    it('should show collection names in warning details', () => {
      const warnings = [
        {
          key: 'resource-1',
          locale: 'es',
          collection: 'main',
          status: 'translated' as const,
        },
        {
          key: 'resource-2',
          locale: 'es',
          collection: 'feature-x',
          status: 'translated' as const,
        },
      ];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 2,
        totalUniqueKeys: 2,
        localesValidated: 1,
        collectionsValidated: 2,
        statusCounts: {
          new: 0,
          translated: 2,
          stale: 0,
          verified: 0,
        },
        failures: [],
        warnings,
        successes: [],
        passed: true,
      };

      const optionsWithAllowTranslated: ValidationOptions = {
        allowTranslated: true,
      };

      const summary = generateValidationSummary(result, optionsWithAllowTranslated);

      expect(summary).toContain('[main] resource-1');
      expect(summary).toContain('[feature-x] resource-2');
    });
  });

  describe('overflow handling', () => {
    it('should truncate failures list when exceeding 100 resources', () => {
      const failures = createResourceDetails('new', 150, 'es', 'main');
      const result: ResourceValidationResult = {
        totalResourcesValidated: 150,
        totalUniqueKeys: 150,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 150,
          translated: 0,
          stale: 0,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('❌ Failures (150)');
      expect(summary).toContain('Locale: es (150 failures)');
      expect(summary).toContain('[main] resource-0 (new)');
      expect(summary).toContain('[main] resource-99 (new)');
      expect(summary).not.toContain('[main] resource-100 (new)');
      expect(summary).toContain('... and 50 more failures');
    });

    it('should truncate warnings list when exceeding 100 resources', () => {
      const warnings = createResourceDetails('translated', 120, 'fr', 'main');
      const result: ResourceValidationResult = {
        totalResourcesValidated: 120,
        totalUniqueKeys: 120,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 0,
          translated: 120,
          stale: 0,
          verified: 0,
        },
        failures: [],
        warnings,
        successes: [],
        passed: true,
      };

      const optionsWithAllowTranslated: ValidationOptions = {
        allowTranslated: true,
      };

      const summary = generateValidationSummary(result, optionsWithAllowTranslated);

      expect(summary).toContain('⚠️  Warnings (120)');
      expect(summary).toContain('[main] resource-0 (translated)');
      expect(summary).toContain('[main] resource-99 (translated)');
      expect(summary).not.toContain('[main] resource-100 (translated)');
      expect(summary).toContain('... and 20 more warnings');
    });

    it('should handle exactly 100 resources without overflow message', () => {
      const failures = createResourceDetails('new', 100, 'es', 'main');
      const result: ResourceValidationResult = {
        totalResourcesValidated: 100,
        totalUniqueKeys: 100,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 100,
          translated: 0,
          stale: 0,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('[main] resource-99 (new)');
      expect(summary).not.toContain('... and');
      expect(summary).not.toContain('more failures');
    });

    it('should truncate per locale when multiple locales exceed limit', () => {
      const failures = [
        ...createResourceDetails('new', 120, 'es', 'main'),
        ...createResourceDetails('stale', 110, 'fr', 'main'),
      ];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 230,
        totalUniqueKeys: 115,
        localesValidated: 2,
        collectionsValidated: 1,
        statusCounts: {
          new: 120,
          translated: 0,
          stale: 110,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('Locale: es (120 failures)');
      expect(summary).toContain('... and 20 more failures');
      expect(summary).toContain('Locale: fr (110 failures)');
      expect(summary).toContain('... and 10 more failures');
    });
  });

  describe('output format and readability', () => {
    it('should include separator lines for visual clarity', () => {
      const result: ResourceValidationResult = {
        totalResourcesValidated: 10,
        totalUniqueKeys: 10,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 0,
          translated: 0,
          stale: 0,
          verified: 10,
        },
        failures: [],
        warnings: [],
        successes: createResourceDetails('verified', 10, 'es', 'main'),
        passed: true,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      // Check for separator lines
      expect(summary).toContain('─'.repeat(50));
    });

    it('should use appropriate emojis for visual indicators', () => {
      const failures = [
        {
          key: 'new-resource',
          locale: 'es',
          collection: 'main',
          status: 'new' as const,
        },
        {
          key: 'stale-resource',
          locale: 'es',
          collection: 'main',
          status: 'stale' as const,
        },
      ];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 2,
        totalUniqueKeys: 2,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 1,
          translated: 0,
          stale: 1,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('❌'); // Failure indicator
      expect(summary).toContain('⚠️'); // Warning/stale indicator
      expect(summary).toContain('✅'); // Success/verified indicator
      expect(summary).toContain('📊'); // Statistics indicator
      expect(summary).toContain('📈'); // Status breakdown indicator
      expect(summary).toContain('📋'); // Summary indicator
    });

    it('should format numbers correctly in summary sections', () => {
      const result: ResourceValidationResult = {
        totalResourcesValidated: 1234,
        totalUniqueKeys: 617,
        localesValidated: 5,
        collectionsValidated: 3,
        statusCounts: {
          new: 0,
          translated: 0,
          stale: 0,
          verified: 1234,
        },
        failures: [],
        warnings: [],
        successes: createResourceDetails('verified', 1234, 'es', 'main'),
        passed: true,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('Total Resources Validated: 1234');
      expect(summary).toContain('Unique Resource Keys: 617');
      expect(summary).toContain('Locales Validated: 5');
      expect(summary).toContain('Collections Validated: 3');
    });
  });

  describe('edge cases', () => {
    it('should handle empty result gracefully', () => {
      const result: ResourceValidationResult = {
        totalResourcesValidated: 0,
        totalUniqueKeys: 0,
        localesValidated: 0,
        collectionsValidated: 0,
        statusCounts: {
          new: 0,
          translated: 0,
          stale: 0,
          verified: 0,
        },
        failures: [],
        warnings: [],
        successes: [],
        passed: true,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('✅ Validation PASSED');
      expect(summary).toContain('Total Resources Validated: 0');
      expect(summary).not.toContain('❌ Failures');
      expect(summary).not.toContain('⚠️  Warnings');
    });

    it('should handle single resource scenarios', () => {
      const failures: ResourceValidationDetail[] = [
        {
          key: 'single.resource',
          locale: 'es',
          collection: 'main',
          status: 'new',
        },
      ];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 1,
        totalUniqueKeys: 1,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 1,
          translated: 0,
          stale: 0,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('❌ Failures (1)');
      expect(summary).toContain('Locale: es (1 failures)');
      expect(summary).toContain('[main] single.resource (new)');
    });

    it('should handle resources with special characters in keys', () => {
      const failures: ResourceValidationDetail[] = [
        {
          key: 'resource.with-dashes_and_underscores.and.dots',
          locale: 'es',
          collection: 'main',
          status: 'new',
        },
        {
          key: 'resource.with.numbers.123.in.key',
          locale: 'es',
          collection: 'main',
          status: 'stale',
        },
      ];

      const result: ResourceValidationResult = {
        totalResourcesValidated: 2,
        totalUniqueKeys: 2,
        localesValidated: 1,
        collectionsValidated: 1,
        statusCounts: {
          new: 1,
          translated: 0,
          stale: 1,
          verified: 0,
        },
        failures,
        warnings: [],
        successes: [],
        passed: false,
      };

      const summary = generateValidationSummary(result, defaultOptions);

      expect(summary).toContain('resource.with-dashes_and_underscores.and.dots');
      expect(summary).toContain('resource.with.numbers.123.in.key');
    });
  });
});

/**
 * Helper function to create an array of ResourceValidationDetail objects
 * for testing purposes.
 *
 * @param status - The translation status to assign to all resources
 * @param count - The number of resources to create
 * @param locale - The locale for all resources
 * @param collection - The collection for all resources
 * @returns Array of ResourceValidationDetail objects
 */
function createResourceDetails(
  status: 'new' | 'translated' | 'stale' | 'verified',
  count: number,
  locale: string,
  collection: string,
): ResourceValidationDetail[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `resource-${i}`,
    locale,
    collection,
    status,
  }));
}
