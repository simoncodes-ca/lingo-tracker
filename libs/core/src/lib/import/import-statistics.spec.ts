import { describe, it, expect } from 'vitest';
import { calculateImportStatistics, calculateStatusTransitions } from './import-statistics';
import { ImportChange } from './types';

describe('import-statistics', () => {
  describe('calculateImportStatistics', () => {
    it('should count created resources correctly', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
        { key: 'key2', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
        { key: 'key3', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'translated' },
      ];

      const stats = calculateImportStatistics(changes);

      expect(stats.resourcesCreated).toBe(2);
      expect(stats.resourcesUpdated).toBe(1);
      expect(stats.resourcesSkipped).toBe(0);
      expect(stats.resourcesFailed).toBe(0);
    });

    it('should count updated resources correctly', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'verified' },
        { key: 'key2', type: 'value-changed', oldValue: 'Old', newValue: 'Updated', oldStatus: 'translated', newStatus: 'translated' },
        { key: 'key3', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
      ];

      const stats = calculateImportStatistics(changes);

      expect(stats.resourcesCreated).toBe(1);
      expect(stats.resourcesUpdated).toBe(2); // Both 'updated' and 'value-changed' count
      expect(stats.resourcesSkipped).toBe(0);
      expect(stats.resourcesFailed).toBe(0);
    });

    it('should count skipped resources correctly', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'skipped', reason: 'Resource not found' },
        { key: 'key2', type: 'skipped', reason: 'Empty value' },
        { key: 'key3', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'translated' },
      ];

      const stats = calculateImportStatistics(changes);

      expect(stats.resourcesCreated).toBe(0);
      expect(stats.resourcesUpdated).toBe(1);
      expect(stats.resourcesSkipped).toBe(2);
      expect(stats.resourcesFailed).toBe(0);
    });

    it('should count failed resources correctly', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'failed', reason: 'Invalid key format' },
        { key: 'key2', type: 'failed', reason: 'Missing base value' },
        { key: 'key3', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
      ];

      const stats = calculateImportStatistics(changes);

      expect(stats.resourcesCreated).toBe(1);
      expect(stats.resourcesUpdated).toBe(0);
      expect(stats.resourcesSkipped).toBe(0);
      expect(stats.resourcesFailed).toBe(2);
    });

    it('should handle empty changes array', () => {
      const changes: ImportChange[] = [];

      const stats = calculateImportStatistics(changes);

      expect(stats.resourcesCreated).toBe(0);
      expect(stats.resourcesUpdated).toBe(0);
      expect(stats.resourcesSkipped).toBe(0);
      expect(stats.resourcesFailed).toBe(0);
    });

    it('should handle mixed change types', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
        { key: 'key2', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'verified' },
        { key: 'key3', type: 'value-changed', oldValue: 'Old', newValue: 'Updated', oldStatus: 'translated', newStatus: 'translated' },
        { key: 'key4', type: 'skipped', reason: 'Not found' },
        { key: 'key5', type: 'failed', reason: 'Invalid format' },
      ];

      const stats = calculateImportStatistics(changes);

      expect(stats.resourcesCreated).toBe(1);
      expect(stats.resourcesUpdated).toBe(2);
      expect(stats.resourcesSkipped).toBe(1);
      expect(stats.resourcesFailed).toBe(1);
    });
  });

  describe('calculateStatusTransitions', () => {
    it('should calculate status transitions for created resources', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
        { key: 'key2', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
      ];

      const transitions = calculateStatusTransitions(changes);

      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toEqual({
        from: undefined,
        to: 'translated',
        count: 2,
      });
    });

    it('should calculate status transitions for updated resources', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'verified' },
        { key: 'key2', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'verified' },
        { key: 'key3', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'new', newStatus: 'translated' },
      ];

      const transitions = calculateStatusTransitions(changes);

      expect(transitions).toHaveLength(2);
      expect(transitions).toContainEqual({
        from: 'translated',
        to: 'verified',
        count: 2,
      });
      expect(transitions).toContainEqual({
        from: 'new',
        to: 'translated',
        count: 1,
      });
    });

    it('should calculate status transitions for value-changed resources', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'value-changed', oldValue: 'Old', newValue: 'New', oldStatus: 'stale', newStatus: 'translated' },
        { key: 'key2', type: 'value-changed', oldValue: 'Old', newValue: 'New', oldStatus: 'stale', newStatus: 'translated' },
      ];

      const transitions = calculateStatusTransitions(changes);

      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toEqual({
        from: 'stale',
        to: 'translated',
        count: 2,
      });
    });

    it('should ignore skipped and failed changes', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
        { key: 'key2', type: 'skipped', reason: 'Not found' },
        { key: 'key3', type: 'failed', reason: 'Invalid format' },
      ];

      const transitions = calculateStatusTransitions(changes);

      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toEqual({
        from: undefined,
        to: 'translated',
        count: 1,
      });
    });

    it('should handle multiple different transitions', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'created', oldValue: '', newValue: 'New', oldStatus: undefined, newStatus: 'translated' },
        { key: 'key2', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'verified' },
        { key: 'key3', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'translated', newStatus: 'verified' },
        { key: 'key4', type: 'value-changed', oldValue: 'Old', newValue: 'New', oldStatus: 'stale', newStatus: 'translated' },
        { key: 'key5', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'new', newStatus: 'translated' },
      ];

      const transitions = calculateStatusTransitions(changes);

      expect(transitions).toHaveLength(4);
      expect(transitions).toContainEqual({ from: undefined, to: 'translated', count: 1 });
      expect(transitions).toContainEqual({ from: 'translated', to: 'verified', count: 2 });
      expect(transitions).toContainEqual({ from: 'stale', to: 'translated', count: 1 });
      expect(transitions).toContainEqual({ from: 'new', to: 'translated', count: 1 });
    });

    it('should handle empty changes array', () => {
      const changes: ImportChange[] = [];

      const transitions = calculateStatusTransitions(changes);

      expect(transitions).toHaveLength(0);
    });

    it('should aggregate same transitions', () => {
      const changes: ImportChange[] = [
        { key: 'key1', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'new', newStatus: 'translated' },
        { key: 'key2', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'new', newStatus: 'translated' },
        { key: 'key3', type: 'updated', oldValue: 'Old', newValue: 'New', oldStatus: 'new', newStatus: 'translated' },
        { key: 'key4', type: 'value-changed', oldValue: 'Old', newValue: 'New', oldStatus: 'new', newStatus: 'translated' },
      ];

      const transitions = calculateStatusTransitions(changes);

      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toEqual({
        from: 'new',
        to: 'translated',
        count: 4,
      });
    });
  });
});
