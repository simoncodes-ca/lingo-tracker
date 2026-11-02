import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectJsonStructure, extractFromFlat, extractFromHierarchical, parseJsonImport } from './parse-json-import';

describe('parse JSON import', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lingo-parse-json-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('detectJsonStructure', () => {
    it('should detect flat structure when all keys contain dots', () => {
      expect(detectJsonStructure({ 'common.ok': 'OK', 'dashboard.title': 'Dashboard' })).toBe('flat');
    });
    it('should detect hierarchical structure when keys do not contain dots', () => {
      expect(detectJsonStructure({ common: { ok: 'OK' }, dashboard: { title: 'Dashboard' } })).toBe('hierarchical');
    });
    it('should detect hierarchical structure for mixed keys', () => {
      expect(detectJsonStructure({ 'common.ok': 'OK', dashboard: { title: 'Dashboard' } })).toBe('hierarchical');
    });
    it('should handle empty object as hierarchical', () => expect(detectJsonStructure({})).toBe('hierarchical'));
    it('should detect flat structure with single dotted key', () => {
      expect(detectJsonStructure({ 'common.title': 'Title' })).toBe('flat');
    });
  });

  describe('extractFromFlat', () => {
    it('should extract resources from flat structure', () => {
      expect(extractFromFlat({ 'common.ok': 'OK', 'common.cancel': 'Cancel' })).toEqual([
        { key: 'common.ok', value: 'OK' },
        { key: 'common.cancel', value: 'Cancel' },
      ]);
    });
    it('should skip non-string values in flat structure', () => {
      expect(extractFromFlat({ 'common.title': 'Title', 'common.count': 42, 'common.items': ['a'] })).toEqual([
        { key: 'common.title', value: 'Title' },
      ]);
    });
    it('should handle empty object', () => expect(extractFromFlat({})).toEqual([]));
    it('should extract rich format objects from flat structure', () => {
      expect(
        extractFromFlat({
          'common.title': {
            value: 'Título',
            comment: 'Page title',
            baseValue: 'Title',
            status: 'verified',
            tags: ['ui', 'common'],
          },
        }),
      ).toEqual([
        {
          key: 'common.title',
          value: 'Título',
          comment: 'Page title',
          baseValue: 'Title',
          status: 'verified',
          tags: ['ui', 'common'],
        },
      ]);
    });
    it('should filter out non-string tags', () => {
      expect(extractFromFlat({ 'common.title': { value: 'Título', tags: ['ui', 123, null] } })[0]?.tags).toEqual([
        'ui',
      ]);
    });
    it('should handle mix of simple and rich formats', () => {
      expect(extractFromFlat({ 'common.title': 'Título', 'common.description': { value: 'Descripción' } })).toEqual([
        { key: 'common.title', value: 'Título' },
        { key: 'common.description', value: 'Descripción' },
      ]);
    });
  });

  describe('extractFromHierarchical', () => {
    it('should extract resources from hierarchical structure', () => {
      expect(extractFromHierarchical({ common: { buttons: { ok: 'OK', cancel: 'Cancel' }, title: 'Common' } })).toEqual(
        [
          { key: 'common.buttons.ok', value: 'OK' },
          { key: 'common.buttons.cancel', value: 'Cancel' },
          { key: 'common.title', value: 'Common' },
        ],
      );
    });
    it('should handle deeply nested structures', () => {
      expect(extractFromHierarchical({ one: { two: { three: { deepValue: 'Deep' } } } })).toEqual([
        { key: 'one.two.three.deepValue', value: 'Deep' },
      ]);
    });
    it('should skip non-string leaf values', () => {
      expect(extractFromHierarchical({ common: { title: 'Title', count: 42, items: ['a'], empty: null } })).toEqual([
        { key: 'common.title', value: 'Title' },
      ]);
    });
    it('should handle empty object', () => expect(extractFromHierarchical({})).toEqual([]));
    it('should handle single level structure', () => {
      expect(extractFromHierarchical({ title: 'Title', description: 'Description' })).toEqual([
        { key: 'title', value: 'Title' },
        { key: 'description', value: 'Description' },
      ]);
    });
    it('should extract rich format objects from hierarchical structure', () => {
      expect(
        extractFromHierarchical({ common: { title: { value: 'Título', comment: 'Page title', tags: ['ui'] } } }),
      ).toEqual([{ key: 'common.title', value: 'Título', comment: 'Page title', tags: ['ui'] }]);
    });
    it('should handle mix of simple and rich formats in hierarchy', () => {
      expect(
        extractFromHierarchical({ common: { title: 'Título', ok: { value: 'Aceptar', comment: 'OK button' } } }),
      ).toEqual([
        { key: 'common.title', value: 'Título' },
        { key: 'common.ok', value: 'Aceptar', comment: 'OK button' },
      ]);
    });
  });

  describe('parseJsonImport', () => {
    it('treats null and empty rich statuses as absent', () => {
      const path = join(dir, 'empty-status.json');
      writeFileSync(
        path,
        JSON.stringify({
          'common.null': { value: 'Oui', status: null },
          'common.empty': { value: 'Oui', status: '' },
        }),
      );
      expect(parseJsonImport(path).resources).toEqual([
        { key: 'common.null', value: 'Oui' },
        { key: 'common.empty', value: 'Oui' },
      ]);
    });

    it('skips an unknown status in a flat rich object with a warning', () => {
      const path = join(dir, 'bad-status.json');
      writeFileSync(path, JSON.stringify({ 'common.ok': { value: 'OK', status: 'verifed' } }));
      expect(parseJsonImport(path)).toEqual({
        resources: [],
        skipped: [
          { key: 'common.ok', reason: 'object looks like rich-format metadata but "status" is not a valid status' },
        ],
        warnings: [
          'Skipped 1 JSON value that cannot be imported: common.ok. See Skipped Resources in the import summary for the reasons.',
        ],
      });
    });

    it('throws when the source file is missing', () => {
      expect(() => parseJsonImport(join(dir, 'missing.json'))).toThrow(
        `Source file not found: ${join(dir, 'missing.json')}`,
      );
    });
    it('throws when JSON is malformed', () => {
      const path = join(dir, 'bad.json');
      writeFileSync(path, '{bad');
      expect(() => parseJsonImport(path)).toThrow('Failed to parse JSON file:');
    });
    it('parses a flat file and reports progress', () => {
      const path = join(dir, 'flat.json');
      writeFileSync(path, JSON.stringify({ 'common.ok': 'Aceptar', 'common.cancel': 'Cancelar' }));
      const onProgress = vi.fn();
      expect(parseJsonImport(path, { onProgress }).resources).toEqual([
        { key: 'common.ok', value: 'Aceptar' },
        { key: 'common.cancel', value: 'Cancelar' },
      ]);
      expect(onProgress.mock.calls.map(([message]) => message)).toEqual([
        `Reading JSON file: ${path}`,
        'Detected flat JSON structure',
        'Extracted 2 resources from JSON',
      ]);
    });
    it('parses a hierarchical file', () => {
      const path = join(dir, 'tree.json');
      writeFileSync(path, JSON.stringify({ common: { ok: 'Aceptar' } }));
      expect(parseJsonImport(path).resources).toEqual([{ key: 'common.ok', value: 'Aceptar' }]);
    });
    it('parses rich objects', () => {
      const path = join(dir, 'rich.json');
      writeFileSync(path, JSON.stringify({ 'common.ok': { value: 'Aceptar', baseValue: 'OK', tags: ['ui'] } }));
      expect(parseJsonImport(path).resources).toEqual([
        { key: 'common.ok', value: 'Aceptar', baseValue: 'OK', tags: ['ui'] },
      ]);
    });

    it('imports value namespaces without losing siblings and reports arrays', () => {
      const path = join(dir, 'filter.json');
      writeFileSync(
        path,
        JSON.stringify({
          filter: { value: 'Value', field: 'Field', operator: 'Operator' },
          list: ['one', 'two'],
          title: 'Title',
        }),
      );

      expect(parseJsonImport(path)).toEqual({
        resources: [
          { key: 'filter.value', value: 'Value' },
          { key: 'filter.field', value: 'Field' },
          { key: 'filter.operator', value: 'Operator' },
          { key: 'title', value: 'Title' },
        ],
        skipped: [{ key: 'list', reason: 'Unsupported JSON value type: array' }],
        warnings: [
          'Skipped 1 JSON value that cannot be imported: list. See Skipped Resources in the import summary for the reasons.',
        ],
      });
    });

    it('imports a namespace with value and status strings without throwing', () => {
      const path = join(dir, 'common.json');
      writeFileSync(path, JSON.stringify({ common: { value: 'Value', status: 'Status', save: 'Save' } }));

      expect(parseJsonImport(path)).toEqual({
        resources: [
          { key: 'common.value', value: 'Value' },
          { key: 'common.status', value: 'Status' },
          { key: 'common.save', value: 'Save' },
        ],
        skipped: [],
        warnings: [],
      });
    });

    it('recurses into schema-only objects with invalid status and reports exactly one warning', () => {
      const path = join(dir, 'ambiguous-status.json');
      writeFileSync(path, JSON.stringify({ common: { value: 'Value', status: 'Status' } }));

      expect(parseJsonImport(path)).toEqual({
        resources: [
          { key: 'common.value', value: 'Value' },
          { key: 'common.status', value: 'Status' },
        ],
        skipped: [],
        warnings: [
          '"common": object looks like rich-format metadata but "status" is not a valid status; imported as nested keys',
        ],
      });
    });

    it('explains why flat namespaces with non-schema keys are skipped', () => {
      const path = join(dir, 'flat-namespace.json');
      writeFileSync(path, JSON.stringify({ 'common.labels': { value: 'Value', status: 'Status', save: 'Save' } }));

      expect(parseJsonImport(path)).toEqual({
        resources: [],
        skipped: [
          {
            key: 'common.labels',
            reason: 'Object is not a rich resource; nested objects are not supported in flat JSON',
          },
        ],
        warnings: [
          'Skipped 1 JSON value that cannot be imported: common.labels. See Skipped Resources in the import summary for the reasons.',
        ],
      });
    });

    it('recurses into a rich-looking object with an extra non-schema key', () => {
      const path = join(dir, 'extra-key.json');
      writeFileSync(path, JSON.stringify({ common: { value: 'Value', comment: 'Comment', help: 'Help' } }));

      expect(parseJsonImport(path)).toEqual({
        resources: [
          { key: 'common.value', value: 'Value' },
          { key: 'common.comment', value: 'Comment' },
          { key: 'common.help', value: 'Help' },
        ],
        skipped: [],
        warnings: [],
      });
    });

    it('reports all unsupported hierarchical leaves with their full dot keys', () => {
      const path = join(dir, 'unsupported-tree.json');
      writeFileSync(path, JSON.stringify({ common: { count: 42, enabled: true, empty: null, list: ['one'] } }));

      expect(parseJsonImport(path)).toEqual({
        resources: [],
        skipped: [
          { key: 'common.count', reason: 'Unsupported JSON value type: number' },
          { key: 'common.enabled', reason: 'Unsupported JSON value type: boolean' },
          { key: 'common.empty', reason: 'Unsupported JSON value type: null' },
          { key: 'common.list', reason: 'Unsupported JSON value type: array' },
        ],
        warnings: [
          'Skipped 4 JSON values that cannot be imported: common.count, common.enabled, common.empty, common.list. See Skipped Resources in the import summary for the reasons.',
        ],
      });
    });

    it('reports unsupported flat values including non-rich objects', () => {
      const path = join(dir, 'unsupported-flat.json');
      writeFileSync(
        path,
        JSON.stringify({
          'common.count': 42,
          'common.enabled': false,
          'common.empty': null,
          'common.list': ['one'],
          'common.namespace': { label: 'Label' },
          'common.extra': { value: 'Value', field: 'Field' },
        }),
      );

      expect(parseJsonImport(path)).toEqual({
        resources: [],
        skipped: [
          { key: 'common.count', reason: 'Unsupported JSON value type: number' },
          { key: 'common.enabled', reason: 'Unsupported JSON value type: boolean' },
          { key: 'common.empty', reason: 'Unsupported JSON value type: null' },
          { key: 'common.list', reason: 'Unsupported JSON value type: array' },
          {
            key: 'common.namespace',
            reason: 'Object is not a rich resource; nested objects are not supported in flat JSON',
          },
          {
            key: 'common.extra',
            reason: 'Object is not a rich resource; nested objects are not supported in flat JSON',
          },
        ],
        warnings: [
          'Skipped 6 JSON values that cannot be imported: common.count, common.enabled, common.empty, common.list, common.namespace and 1 more. See Skipped Resources in the import summary for the reasons.',
        ],
      });
    });

    const invalidMetadata = [
      { field: 'status', value: 'Status', reason: 'is not a valid status' },
      { field: 'status', value: false, reason: 'is not a valid status' },
      { field: 'comment', value: 42, reason: 'is not a string' },
      { field: 'comment', value: null, reason: 'is not a string' },
      { field: 'baseValue', value: false, reason: 'is not a string' },
      { field: 'baseValue', value: null, reason: 'is not a string' },
      { field: 'tags', value: 'Tags', reason: 'is not an array' },
      { field: 'tags', value: null, reason: 'is not an array' },
    ];

    it('recurses into invalid rich metadata and warns with the full namespace key', () => {
      const path = join(dir, 'ambiguous-tree.json');
      for (const { field, value, reason } of invalidMetadata) {
        writeFileSync(path, JSON.stringify({ outer: { common: { value: 'Value', [field]: value } } }));
        const parsed = parseJsonImport(path);

        expect(parsed.resources).toContainEqual({ key: 'outer.common.value', value: 'Value' });
        expect(parsed.warnings).toContain(
          `"outer.common": object looks like rich-format metadata but "${field}" ${reason}; imported as nested keys`,
        );
        if (typeof value === 'string') {
          expect(parsed.resources).toContainEqual({ key: `outer.common.${field}`, value });
          expect(parsed.skipped).toEqual([]);
        } else {
          expect(parsed.skipped).toEqual([
            {
              key: `outer.common.${field}`,
              reason: `Unsupported JSON value type: ${value === null ? 'null' : typeof value}`,
            },
          ]);
        }
      }
    });

    it('skips invalid rich metadata in flat files with the ambiguity reason', () => {
      const path = join(dir, 'ambiguous-flat.json');
      for (const { field, value, reason } of invalidMetadata) {
        writeFileSync(path, JSON.stringify({ 'common.title': { value: 'Value', [field]: value } }));
        const issue = `object looks like rich-format metadata but "${field}" ${reason}`;

        expect(parseJsonImport(path)).toEqual({
          resources: [],
          skipped: [{ key: 'common.title', reason: issue }],
          warnings: [
            'Skipped 1 JSON value that cannot be imported: common.title. See Skipped Resources in the import summary for the reasons.',
          ],
        });
      }
    });

    it('requires a string value even when all keys are schema keys', () => {
      const path = join(dir, 'non-string-value.json');
      writeFileSync(path, JSON.stringify({ common: { value: 42, comment: 'Comment' } }));

      expect(parseJsonImport(path)).toEqual({
        resources: [{ key: 'common.comment', value: 'Comment' }],
        skipped: [{ key: 'common.value', reason: 'Unsupported JSON value type: number' }],
        warnings: [
          'Skipped 1 JSON value that cannot be imported: common.value. See Skipped Resources in the import summary for the reasons.',
        ],
      });
    });

    it('names every key in one warning when exactly five values are skipped', () => {
      const path = join(dir, 'five-skipped.json');
      writeFileSync(path, JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5 }));

      expect(parseJsonImport(path).warnings).toEqual([
        'Skipped 5 JSON values that cannot be imported: a, b, c, d, e. See Skipped Resources in the import summary for the reasons.',
      ]);
    });

    it('names the first five keys and counts the rest when more than five values are skipped', () => {
      const path = join(dir, 'many-skipped.json');
      writeFileSync(path, JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 }));

      expect(parseJsonImport(path).warnings).toEqual([
        'Skipped 7 JSON values that cannot be imported: a, b, c, d, e and 2 more. See Skipped Resources in the import summary for the reasons.',
      ]);
    });

    it('lists metadata fallback warnings first and the single skip warning last', () => {
      const path = join(dir, 'fallback-then-skip.json');
      writeFileSync(path, JSON.stringify({ list: ['one'], common: { value: 'Value', status: 'Status' }, count: 1 }));

      expect(parseJsonImport(path).warnings).toEqual([
        '"common": object looks like rich-format metadata but "status" is not a valid status; imported as nested keys',
        'Skipped 2 JSON values that cannot be imported: list, count. See Skipped Resources in the import summary for the reasons.',
      ]);
    });
  });
});
