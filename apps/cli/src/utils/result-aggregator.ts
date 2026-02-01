/**
 * Utilities for aggregating numeric results from multiple operations.
 *
 * Provides type-safe aggregation of numeric fields across result arrays,
 * eliminating verbose boilerplate reduce patterns. This ensures:
 * - No missed fields when adding new metrics
 * - Type safety for aggregated values
 * - Consistent aggregation logic across commands
 *
 * @example
 * ```typescript
 * interface CollectionResult {
 *   entriesProcessed: number;
 *   filesCreated: number;
 *   filesUpdated: number;
 * }
 *
 * const results: CollectionResult[] = [
 *   { entriesProcessed: 5, filesCreated: 2, filesUpdated: 1 },
 *   { entriesProcessed: 3, filesCreated: 1, filesUpdated: 0 },
 * ];
 *
 * const totals = aggregateNumericFields(results, [
 *   'entriesProcessed',
 *   'filesCreated',
 *   'filesUpdated'
 * ]);
 * // → { entriesProcessed: 8, filesCreated: 3, filesUpdated: 1 }
 * ```
 */

/**
 * Aggregates numeric fields across an array of result objects.
 *
 * @template T - Type of result objects to aggregate
 * @param results - Array of result objects to aggregate
 * @param numericFields - Array of field names to sum across results
 * @returns Object with summed values for each specified field
 *
 * @example
 * ```typescript
 * const totals = aggregateNumericFields(collectionResults, [
 *   'entriesProcessed',
 *   'localesAdded',
 *   'filesCreated'
 * ]);
 * ```
 */
export function aggregateNumericFields<T extends Record<string, unknown>>(
  results: T[],
  numericFields: (keyof T)[],
): Record<keyof T, number> {
  // Initialize accumulator with all fields set to 0
  const initial = Object.fromEntries(
    numericFields.map((field) => [field, 0]),
  ) as Record<keyof T, number>;

  // Sum each numeric field across all results
  return results.reduce((accumulator, current) => {
    for (const field of numericFields) {
      const value = current[field];
      if (typeof value === 'number') {
        accumulator[field] += value;
      }
    }
    return accumulator;
  }, initial);
}
