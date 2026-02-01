import type { ImportChange, StatusTransition } from './types';
import type { TranslationStatus } from '../../resource/translation-status';

/**
 * Calculates summary statistics from an array of import changes.
 *
 * This function analyzes the complete set of changes from an import operation
 * and computes various metrics that provide insight into what happened during the import.
 *
 * The statistics include:
 * - **resourcesCreated**: Number of new resources added to the system
 * - **resourcesUpdated**: Number of existing resources modified (includes both value-changed and updated)
 * - **resourcesSkipped**: Number of resources that were intentionally skipped (e.g., not found, strategy restrictions)
 * - **resourcesFailed**: Number of resources that failed to process due to errors
 *
 * These metrics help users understand the impact of an import operation and identify
 * any issues that may need attention (e.g., high failure rate, unexpected skips).
 *
 * @param changes - Array of all import changes from the operation
 * @returns Object containing counts for created, updated, skipped, and failed resources
 *
 * @example
 * ```typescript
 * const changes: ImportChange[] = [
 *   { key: 'key1', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
 *   { key: 'key2', type: 'value-changed', oldValue: 'Old', newValue: 'Updated', oldStatus: 'translated', newStatus: 'translated' },
 *   { key: 'key3', type: 'skipped', reason: 'Resource not found' },
 *   { key: 'key4', type: 'failed', reason: 'Invalid key format' }
 * ];
 *
 * const stats = calculateImportStatistics(changes);
 * console.log(`Created: ${stats.resourcesCreated}`);     // 1
 * console.log(`Updated: ${stats.resourcesUpdated}`);     // 1
 * console.log(`Skipped: ${stats.resourcesSkipped}`);     // 1
 * console.log(`Failed: ${stats.resourcesFailed}`);       // 1
 * ```
 */
export function calculateImportStatistics(changes: ImportChange[]): {
  resourcesCreated: number;
  resourcesUpdated: number;
  resourcesSkipped: number;
  resourcesFailed: number;
} {
  const resourcesCreated = changes.filter((c) => c.type === 'created').length;
  const resourcesUpdated = changes.filter((c) => c.type === 'updated' || c.type === 'value-changed').length;
  const resourcesSkipped = changes.filter((c) => c.type === 'skipped').length;
  const resourcesFailed = changes.filter((c) => c.type === 'failed').length;

  return {
    resourcesCreated,
    resourcesUpdated,
    resourcesSkipped,
    resourcesFailed,
  };
}

/**
 * Calculates status transitions from an array of import changes.
 *
 * This function analyzes how translation statuses changed during the import operation,
 * providing visibility into the workflow transitions that occurred. Status transitions
 * are essential for understanding the quality and progress of translations.
 *
 * Each transition captures:
 * - **from**: The previous status (undefined for new resources)
 * - **to**: The new status after import
 * - **count**: How many resources underwent this specific transition
 *
 * Common transitions include:
 * - `undefined → translated`: New resources created from import
 * - `translated → verified`: Translations reviewed and approved
 * - `stale → translated`: Outdated translations updated
 * - `new → translated`: Previously untranslated resources now have translations
 *
 * This data is crucial for tracking translation workflow progress and identifying
 * patterns (e.g., bulk verifications, large updates causing stale transitions).
 *
 * @param changes - Array of all import changes from the operation
 * @returns Array of status transitions with counts, sorted by transition type
 *
 * @example
 * ```typescript
 * const changes: ImportChange[] = [
 *   { key: 'key1', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
 *   { key: 'key2', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'verified' },
 *   { key: 'key3', type: 'value-changed', oldValue: 'Old', newValue: 'New', oldStatus: 'stale', newStatus: 'translated' },
 *   { key: 'key4', type: 'value-changed', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'verified' }
 * ];
 *
 * const transitions = calculateStatusTransitions(changes);
 * // Returns:
 * // [
 * //   { from: undefined, to: 'translated', count: 1 },
 * //   { from: 'translated', to: 'verified', count: 2 },
 * //   { from: 'stale', to: 'translated', count: 1 }
 * // ]
 * ```
 */
export function calculateStatusTransitions(changes: ImportChange[]): StatusTransition[] {
  const transitionMap = new Map<string, number>();

  for (const change of changes) {
    if (change.type === 'created' || change.type === 'updated' || change.type === 'value-changed') {
      const key = `${change.oldStatus || 'none'}→${change.newStatus}`;
      transitionMap.set(key, (transitionMap.get(key) || 0) + 1);
    }
  }

  const statusTransitions: StatusTransition[] = [];
  for (const [key, count] of transitionMap) {
    const [from, to] = key.split('→');
    statusTransitions.push({
      from: from === 'none' ? undefined : (from as TranslationStatus),
      to: to as TranslationStatus,
      count,
    });
  }

  return statusTransitions;
}
