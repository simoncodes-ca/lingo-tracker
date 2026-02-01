import { describe, it, expect } from 'vitest';
import { aggregateNumericFields } from './result-aggregator';

describe('aggregateNumericFields', () => {
  interface TestResult {
    count: number;
    total: number;
    errors: number;
  }

  it('should aggregate numeric fields across multiple results', () => {
    const results: TestResult[] = [
      { count: 5, total: 100, errors: 0 },
      { count: 3, total: 75, errors: 1 },
      { count: 8, total: 200, errors: 2 },
    ];

    const aggregated = aggregateNumericFields(results, [
      'count',
      'total',
      'errors',
    ]);

    expect(aggregated).toEqual({
      count: 16,
      total: 375,
      errors: 3,
    });
  });

  it('should return zeros for empty results array', () => {
    const results: TestResult[] = [];

    const aggregated = aggregateNumericFields(results, [
      'count',
      'total',
      'errors',
    ]);

    expect(aggregated).toEqual({
      count: 0,
      total: 0,
      errors: 0,
    });
  });

  it('should handle single result', () => {
    const results: TestResult[] = [{ count: 10, total: 500, errors: 2 }];

    const aggregated = aggregateNumericFields(results, [
      'count',
      'total',
      'errors',
    ]);

    expect(aggregated).toEqual({
      count: 10,
      total: 500,
      errors: 2,
    });
  });

  it('should only aggregate specified fields', () => {
    const results: TestResult[] = [
      { count: 5, total: 100, errors: 0 },
      { count: 3, total: 75, errors: 1 },
    ];

    const aggregated = aggregateNumericFields(results, ['count', 'errors']);

    expect(aggregated).toEqual({
      count: 8,
      errors: 1,
    });
  });

  it('should handle results with additional non-numeric fields', () => {
    interface ExtendedResult extends TestResult {
      name: string;
      timestamp: Date;
    }

    const results: ExtendedResult[] = [
      { count: 5, total: 100, errors: 0, name: 'first', timestamp: new Date() },
      { count: 3, total: 75, errors: 1, name: 'second', timestamp: new Date() },
    ];

    const aggregated = aggregateNumericFields(results, [
      'count',
      'total',
      'errors',
    ]);

    expect(aggregated).toEqual({
      count: 8,
      total: 175,
      errors: 1,
    });
  });

  it('should skip non-numeric values safely', () => {
    interface MixedResult {
      count: number;
      value: number | string;
    }

    const results: MixedResult[] = [
      { count: 5, value: 100 },
      { count: 3, value: 'invalid' as any }, // Type assertion to simulate edge case
      { count: 2, value: 50 },
    ];

    const aggregated = aggregateNumericFields(results, ['count', 'value']);

    expect(aggregated.count).toBe(10);
    expect(aggregated.value).toBe(150); // Should only sum numeric values
  });

  it('should handle zero values correctly', () => {
    const results: TestResult[] = [
      { count: 0, total: 0, errors: 0 },
      { count: 0, total: 0, errors: 0 },
    ];

    const aggregated = aggregateNumericFields(results, [
      'count',
      'total',
      'errors',
    ]);

    expect(aggregated).toEqual({
      count: 0,
      total: 0,
      errors: 0,
    });
  });

  it('should handle negative numbers', () => {
    const results: TestResult[] = [
      { count: 10, total: 100, errors: 0 },
      { count: -3, total: -25, errors: 1 },
      { count: 5, total: 50, errors: -1 },
    ];

    const aggregated = aggregateNumericFields(results, [
      'count',
      'total',
      'errors',
    ]);

    expect(aggregated).toEqual({
      count: 12,
      total: 125,
      errors: 0,
    });
  });
});
