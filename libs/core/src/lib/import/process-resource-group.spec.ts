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
        false,
        filesModified,
        warnings,
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
        false,
        filesModified,
        warnings,
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
        false,
        filesModified,
        warnings,
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
        }),
      );
      writeFileSync(
        entryMetaPath,
        JSON.stringify({
          ok: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'translated',
            },
          },
          cancel: {
            en: { checksum: 'cancel-base' },
            es: {
              checksum: 'cancel-checksum',
              baseChecksum: 'cancel-base',
              status: 'verified',
            },
          },
        }),
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
        false,
        filesModified,
        warnings,
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
        false,
        filesModified,
        warnings,
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
        false,
        filesModified,
        warnings,
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
        false,
        filesModified,
        warnings,
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
        false,
        filesModified,
        warnings,
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
          ok: {
            source: 'OK',
            es: 'Bien',
            comment: 'Old comment',
            tags: ['old-tag'],
          },
        }),
      );
      writeFileSync(
        entryMetaPath,
        JSON.stringify({
          ok: {
            en: { checksum: 'base-checksum' },
            es: {
              checksum: 'old-checksum',
              baseChecksum: 'base-checksum',
              status: 'translated',
            },
          },
        }),
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
        false,
        filesModified,
        warnings,
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
        false,
        filesModified,
        warnings,
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
        false,
        filesModified,
        warnings,
      );

      const entries = JSON.parse(readFileSync(entryResourcePath, 'utf8'));
      expect(entries.ok.tags).toEqual(['new-tag', 'another-tag']);
    });
  });

  describe('base locale imports', () => {
    it('should create new resource in base locale when isBaseLocaleImport is true', () => {
      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.submit',
              value: 'Submit',
              comment: 'Form submit button',
              tags: ['forms', 'buttons'],
            },
            entryKey: 'submit',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      const changes = processResourceGroup(
        group,
        'en',
        'en',
        {
          source: 'test.json',
          locale: 'en',
          strategy: 'migration',
          createMissing: true,
          updateComments: true,
          updateTags: true,
        },
        false,
        true, // isBaseLocaleImport
        filesModified,
        warnings,
      );

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('created');
      expect(changes[0].key).toBe('common.buttons.submit');
      expect(changes[0].newValue).toBe('Submit');
      expect(changes[0].newStatus).toBeUndefined();

      // Verify resource entry created with source field
      const entries = JSON.parse(readFileSync(entryResourcePath, 'utf8'));
      expect(entries.submit.source).toBe('Submit');
      expect(entries.submit.comment).toBe('Form submit button');
      expect(entries.submit.tags).toEqual(['forms', 'buttons']);

      // Verify metadata only has checksum for base locale
      const meta = JSON.parse(readFileSync(entryMetaPath, 'utf8'));
      expect(meta.submit.en.checksum).toBeDefined();
      expect(meta.submit.en.status).toBeUndefined();
      expect(meta.submit.en.baseChecksum).toBeUndefined();
    });

    it('should update existing resource source value when isBaseLocaleImport is true', () => {
      // Create existing resource
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(
        entryResourcePath,
        JSON.stringify({
          ok: { source: 'OK', es: 'Bien' },
        }),
      );
      writeFileSync(
        entryMetaPath,
        JSON.stringify({
          ok: {
            en: { checksum: 'old-checksum' },
            es: {
              checksum: 'es-checksum',
              baseChecksum: 'old-checksum',
              status: 'translated',
            },
          },
        }),
      );

      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'Okay',
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      const changes = processResourceGroup(
        group,
        'en',
        'en',
        { source: 'test.json', locale: 'en', strategy: 'migration' },
        false,
        true, // isBaseLocaleImport
        filesModified,
        warnings,
      );

      expect(changes).toHaveLength(1);
      expect(changes[0].type).toBe('value-changed');
      expect(changes[0].oldValue).toBe('OK');
      expect(changes[0].newValue).toBe('Okay');
      expect(changes[0].oldStatus).toBeUndefined();
      expect(changes[0].newStatus).toBeUndefined();

      // Verify source field was updated
      const entries = JSON.parse(readFileSync(entryResourcePath, 'utf8'));
      expect(entries.ok.source).toBe('Okay');

      // Verify base locale checksum was updated
      const meta = JSON.parse(readFileSync(entryMetaPath, 'utf8'));
      expect(meta.ok.en.checksum).not.toBe('old-checksum');
      expect(meta.ok.en.status).toBeUndefined();
    });

    it('should update comment and tags for base locale when flags are set', () => {
      // Create existing resource
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(
        entryResourcePath,
        JSON.stringify({
          ok: { source: 'OK', comment: 'Old comment', tags: ['old'] },
        }),
      );
      writeFileSync(
        entryMetaPath,
        JSON.stringify({
          ok: {
            en: { checksum: 'checksum' },
          },
        }),
      );

      const group: ResourceGroup = {
        folderPath,
        entryResourcePath,
        entryMetaPath,
        resources: [
          {
            resource: {
              key: 'common.buttons.ok',
              value: 'OK',
              comment: 'New comment',
              tags: ['new', 'tags'],
            },
            entryKey: 'ok',
          },
        ],
      };

      const filesModified = new Set<string>();
      const warnings: string[] = [];

      processResourceGroup(
        group,
        'en',
        'en',
        {
          source: 'test.json',
          locale: 'en',
          strategy: 'migration',
          updateComments: true,
          updateTags: true,
        },
        false,
        true, // isBaseLocaleImport
        filesModified,
        warnings,
      );

      const entries = JSON.parse(readFileSync(entryResourcePath, 'utf8'));
      expect(entries.ok.comment).toBe('New comment');
      expect(entries.ok.tags).toEqual(['new', 'tags']);
    });
  });
});
