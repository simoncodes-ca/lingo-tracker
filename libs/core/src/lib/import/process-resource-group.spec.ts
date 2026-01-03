import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { processResourceGroup } from './process-resource-group';
import { ResourceGroup } from './resource-grouping';

describe('process-resource-group', () => {
  const testDir = join(process.cwd(), 'test-temp-process-group');
  const folderPath = join(testDir, 'common', 'buttons');
  const entryResourcePath = join(folderPath, 'resource_entries.json');
  const entryMetaPath = join(folderPath, 'tracker_meta.json');

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('creating new resources', () => {
    it('should create new resource when createMissing is true and baseValue is provided', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Aceptar',
              baseValue: 'OK',
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      const changes = processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', createMissing: true },
        false,
        filesModified,
        warnings
      );

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('created');
      expect(changes[0].key).toBe('common.buttons.ok');
      expect(changes[0].newValue).toBe('Aceptar');
      expect(changes[0].newStatus).toBe('translated');

      // Verify files were created
      expect(existsSync(entryResourcePath)).toBe(true);
      expect(existsSync(entryMetaPath)).toBe(true);
      expect(filesModified.has(entryResourcePath)).toBe(true);
      expect(filesModified.has(entryMetaPath)).toBe(true);
    });

    it('should fail to create resource when createMissing is false', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Aceptar',
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      const changes = processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', createMissing: false },
        false,
        filesModified,
        warnings
      );

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('skipped');
      expect(changes[0].reason).toContain('strategy does not allow creation');
      expect(filesModified.size).toBe(0);
    });

    it('should fail to create resource when baseValue is missing', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Aceptar',
              // No baseValue
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      const changes = processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', createMissing: true },
        false,
        filesModified,
        warnings
      );

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('failed');
      expect(changes[0].reason).toContain('base value not provided');
    });
  });

  describe('updating existing resources', () => {
    beforeEach(() => {
      // Create existing resource files
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(
        entryResourcePath,
        JSON.stringify({
          ok: { source: 'OK', es: 'Bien' },
          cancel: { source: 'Cancel', es: 'Cancelar' },
        })
      );
      writeFileSync(
        entryMetaPath,
        JSON.stringify({
          ok: {
            en: { checksum: 'base-checksum' },
            es: { checksum: 'old-checksum', baseChecksum: 'base-checksum', status: 'translated' },
          },
          cancel: {
            en: { checksum: 'cancel-base' },
            es: { checksum: 'cancel-checksum', baseChecksum: 'cancel-base', status: 'verified' },
          },
        })
      );
    });

    it('should update resource value when it changes', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Aceptar', // Changed from 'Bien'
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      const changes = processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', strategy: 'translation-service' },
        false,
        filesModified,
        warnings
      );

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('value-changed');
      expect(changes[0].oldValue).toBe('Bien');
      expect(changes[0].newValue).toBe('Aceptar');
      expect(changes[0].newStatus).toBe('translated');

      // Verify file was updated
      const entries = JSON.parse(readFileSync(entryResourcePath, 'utf8'));
      expect(entries.ok.es).toBe('Aceptar');
    });

    it('should preserve existing status when value does not change', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Bien', // Same as existing
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      const changes = processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', strategy: 'translation-service' },
        false,
        filesModified,
        warnings
      );

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('updated');
      expect(changes[0].oldStatus).toBe('translated');
      expect(changes[0].newStatus).toBe('translated');
    });

    it('should set status to verified for verification strategy', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Bien', // Same value
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      const changes = processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', strategy: 'verification' },
        false,
        filesModified,
        warnings
      );

      expect(changes).toHaveLength(1);
      expect(changes[0].newStatus).toBe('verified');

      // Verify metadata was updated
      const meta = JSON.parse(readFileSync(entryMetaPath, 'utf8'));
      expect(meta.ok.es.status).toBe('verified');
    });

    it('should warn on base value mismatch when validateBase is enabled', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Aceptar',
              baseValue: 'Okay', // Different from stored 'OK'
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', validateBase: true },
        false,
        filesModified,
        warnings
      );

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Base value mismatch');
      expect(warnings[0]).toContain('common.buttons.ok');
    });
  });

  describe('dry run mode', () => {
    it('should not write files in dry run mode', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Aceptar',
              baseValue: 'OK',
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      const changes = processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', createMissing: true },
        true, // Dry run
        filesModified,
        warnings
      );

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('created');

      // Files should not exist
      expect(existsSync(entryResourcePath)).toBe(false);
      expect(existsSync(entryMetaPath)).toBe(false);
      expect(filesModified.size).toBe(0);
    });
  });

  describe('comment and tag updates', () => {
    beforeEach(() => {
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(
        entryResourcePath,
        JSON.stringify({
          ok: { source: 'OK', es: 'Bien', comment: 'Old comment', tags: ['old-tag'] },
        })
      );
      writeFileSync(
        entryMetaPath,
        JSON.stringify({
          ok: {
            en: { checksum: 'base-checksum' },
            es: { checksum: 'old-checksum', baseChecksum: 'base-checksum', status: 'translated' },
          },
        })
      );
    });

    it('should update comment when updateComments is true', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Aceptar',
              comment: 'New comment',
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', updateComments: true },
        false,
        filesModified,
        warnings
      );

      const entries = JSON.parse(readFileSync(entryResourcePath, 'utf8'));
      expect(entries.ok.comment).toBe('New comment');
    });

    it('should not update comment when updateComments is false', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Aceptar',
              comment: 'New comment',
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', updateComments: false },
        false,
        filesModified,
        warnings
      );

      const entries = JSON.parse(readFileSync(entryResourcePath, 'utf8'));
      expect(entries.ok.comment).toBe('Old comment');
    });

    it('should update tags when updateTags is true', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Aceptar',
              tags: ['new-tag', 'another-tag'],
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      processResourceGroup(
        group,
        'es',
        'en',
        { source: 'test.json', locale: 'es', updateTags: true },
        false,
        filesModified,
        warnings
      );

      const entries = JSON.parse(readFileSync(entryResourcePath, 'utf8'));
      expect(entries.ok.tags).toEqual(['new-tag', 'another-tag']);
    });
  });
});
