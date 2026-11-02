import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDir } from '../../testing/temp-dir.spec-helpers';
import { CoreOperationError } from '../errors/lingo-tracker-error';
import { readJsonFile, readResourceEntries, readTrackerMetadata, writeJsonFile } from './json-file-operations';

describe('JSON file operations', () => {
  const dir = useTempDir('json-files-');

  it('writes pretty JSON by default and compact JSON on request, creating parents when requested', () => {
    const filePath = join(dir(), 'nested', 'data.json');
    writeJsonFile({ filePath, data: { value: 1 }, ensureDirectory: true });
    expect(readFileSync(filePath, 'utf8')).toBe('{\n  "value": 1\n}');
    expect(readJsonFile({ filePath })).toEqual({ value: 1 });
    writeJsonFile({ filePath, data: [1, 2], pretty: false });
    expect(readFileSync(filePath, 'utf8')).toBe('[1,2]');
  });

  it('returns defaults only for missing files and names required missing files', () => {
    const filePath = join(dir(), 'missing.json');
    const fallback = {};
    expect(readJsonFile({ filePath, defaultValue: fallback })).toBe(fallback);
    expect(() => readJsonFile({ filePath, errorContext: 'Loading' })).toThrow('Loading:');
    expect(() => readJsonFile({ filePath })).toThrow(CoreOperationError);
  });

  it('reports malformed and unreadable files even when defaults are supplied', () => {
    const filePath = join(dir(), 'bad.json');
    writeFileSync(filePath, '{');
    expect(() => readResourceEntries(filePath, {})).toThrow('Reading resource entries:');
    expect(() => readTrackerMetadata(filePath, {})).toThrow('Reading tracker metadata:');
    mkdirSync(join(dir(), 'folder'));
    expect(() => readJsonFile({ filePath: join(dir(), 'folder'), defaultValue: {} })).toThrow(CoreOperationError);
  });

  it('reads resource and metadata files through the typed helpers', () => {
    const filePath = join(dir(), 'data.json');
    writeJsonFile({ filePath, data: { ok: { source: 'OK' } } });
    expect(readResourceEntries(filePath)).toEqual({ ok: { source: 'OK' } });
    writeJsonFile({ filePath, data: { ok: {} } });
    expect(readTrackerMetadata(filePath)).toEqual({ ok: {} });
  });

  it('wraps write failures without silently creating missing parents', () => {
    expect(() => writeJsonFile({ filePath: join(dir(), 'missing', 'data.json'), data: {} })).toThrow(
      CoreOperationError,
    );
    const data: Record<string, unknown> = {};
    data['self'] = data;
    expect(() => writeJsonFile({ filePath: join(dir(), 'circular.json'), data })).toThrow(CoreOperationError);
  });
});
