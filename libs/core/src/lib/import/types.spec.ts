import { describe, expect, it } from 'vitest';
import type {
  ImportChange,
  ImportChangeType,
  ImportedResource,
  ImportFormat,
  ImportResult,
  ImportRunOptions,
  ImportStrategy,
  ImportSummaryOptions,
  StatusTransition,
} from './types';

describe('import types', () => {
  describe('ImportFormat', () => {
    it('should allow xliff format', () => {
      const format: ImportFormat = 'xliff';
      expect(format).toBe('xliff');
    });

    it('should allow json format', () => {
      const format: ImportFormat = 'json';
      expect(format).toBe('json');
    });
  });

  describe('ImportStrategy', () => {
    it('should allow all strategy types', () => {
      const strategies: ImportStrategy[] = ['translation-service', 'verification', 'migration', 'update'];
      expect(strategies).toHaveLength(4);
    });
  });

  describe('ImportRunOptions', () => {
    it('should create valid import options with required fields', () => {
      const options: ImportRunOptions = {
        locale: 'es',
      };
      expect(options.locale).toBe('es');
    });

    it('should create import options with all fields', () => {
      const options: ImportSummaryOptions = {
        format: 'xliff',
        source: '/path/to/file.xliff',
        locale: 'es',
        strategy: 'translation-service',
        updateComments: false,
        updateTags: false,
        preserveStatus: false,
        createMissing: false,
        validateBase: true,
        dryRun: false,
        verbose: false,
        onProgress: () => undefined,
      };
      expect(options.format).toBe('xliff');
      expect(options.strategy).toBe('translation-service');
    });
  });

  describe('ImportedResource', () => {
    it('should create imported resource with minimal fields', () => {
      const resource: ImportedResource = {
        key: 'common.buttons.ok',
        value: 'OK',
      };
      expect(resource.key).toBe('common.buttons.ok');
      expect(resource.value).toBe('OK');
    });

    it('should create imported resource with all fields', () => {
      const resource: ImportedResource = {
        key: 'common.buttons.ok',
        value: 'OK',
        baseValue: 'OK',
        comment: 'Button text',
        status: 'verified',
        tags: ['ui', 'common'],
      };
      expect(resource.tags).toEqual(['ui', 'common']);
      expect(resource.status).toBe('verified');
    });
  });

  describe('ImportChangeType', () => {
    it('should allow all change types', () => {
      const types: ImportChangeType[] = ['created', 'updated', 'value-changed', 'skipped', 'failed'];
      expect(types).toHaveLength(5);
    });
  });

  describe('ImportChange', () => {
    it('should create import change for created resource', () => {
      const change: ImportChange = {
        key: 'common.title',
        type: 'created',
        newValue: 'Title',
        newStatus: 'translated',
      };
      expect(change.type).toBe('created');
      expect(change.newValue).toBe('Title');
    });

    it('should create import change for updated resource', () => {
      const change: ImportChange = {
        key: 'common.title',
        type: 'value-changed',
        oldValue: 'Old Title',
        newValue: 'New Title',
        oldStatus: 'translated',
        newStatus: 'translated',
      };
      expect(change.oldValue).toBe('Old Title');
      expect(change.newValue).toBe('New Title');
    });

    it('should create import change for skipped resource', () => {
      const change: ImportChange = {
        key: 'invalid..key',
        type: 'skipped',
        reason: 'Invalid key format (consecutive dots)',
      };
      expect(change.type).toBe('skipped');
      expect(change.reason).toBeDefined();
    });
  });

  describe('StatusTransition', () => {
    it('should create status transition for new resource', () => {
      const transition: StatusTransition = {
        to: 'translated',
        count: 10,
      };
      expect(transition.from).toBeUndefined();
      expect(transition.to).toBe('translated');
      expect(transition.count).toBe(10);
    });

    it('should create status transition for update', () => {
      const transition: StatusTransition = {
        from: 'new',
        to: 'translated',
        count: 5,
      };
      expect(transition.from).toBe('new');
      expect(transition.to).toBe('translated');
    });
  });

  describe('ImportResult', () => {
    it('should create complete import result', () => {
      const result: ImportResult = {
        strategy: 'translation-service',
        locale: 'es',
        collection: 'TestCollection',
        resourcesImported: 100,
        resourcesCreated: 0,
        resourcesUpdated: 100,
        resourcesSkipped: 5,
        resourcesFailed: 2,
        changes: [],
        statusTransitions: [
          { from: 'new', to: 'translated', count: 50 },
          { from: 'stale', to: 'translated', count: 50 },
        ],
        filesAffected: [],
        filesModified: [
          '/translations/common/buttons/resource_entries.json',
          '/translations/common/buttons/tracker_meta.json',
        ],
        warnings: ['XLIFF source differs from existing base value'],
        errors: ['Invalid key format: "common..buttons"'],
        icuAutoFixes: [],
        icuAutoFixErrors: [],
        dryRun: false,
      };

      expect(result.resourcesImported).toBe(100);
      expect(result.statusTransitions).toHaveLength(2);
      expect(result.filesModified).toHaveLength(2);
    });
  });
});
