import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportSourceError } from '../errors/internal';
import { inspectImportSource } from './inspect-import-source';

describe('inspectImportSource', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'inspect-import-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const assertSourceError = (path: string, stage: 'source' | 'format'): void => {
    expect(() => inspectImportSource(path, directory)).toThrow(ImportSourceError);
    expect(() => inspectImportSource(path, directory)).toThrow(expect.objectContaining({ stage }));
  };

  it('rejects missing files as source errors', () => {
    assertSourceError('missing.json', 'source');
  });

  it('rejects directories as source errors', () => {
    mkdirSync(join(directory, 'folder.json'));
    assertSourceError('folder.json', 'source');
  });

  it('rejects unrecognised extensions as format errors', () => {
    writeFileSync(join(directory, 'source.txt'), '{}');
    assertSourceError('source.txt', 'format');
  });

  for (const [extension, format] of [
    ['xlf', 'xliff'],
    ['xliff', 'xliff'],
    ['json', 'json'],
  ]) {
    it(`inspects .${extension} metadata without parsing entries`, () => {
      const path = join(directory, `source.${extension}`);
      writeFileSync(path, 'not a parsed document é');
      const stats = statSync(path);
      expect(inspectImportSource(path, directory)).toEqual({
        format,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });
    });
  }

  it('resolves relative paths against cwd', () => {
    mkdirSync(join(directory, 'nested'));
    writeFileSync(join(directory, 'nested', 'source.json'), '{}');
    expect(inspectImportSource('nested/source.json', directory).format).toBe('json');
  });

  for (const quote of ['"', "'"]) {
    it(`reads a target-language attribute with ${quote} quotes from the first file element`, () => {
      writeFileSync(
        join(directory, 'source.xlf'),
        `<xliff><file original="a > b"\n target-language = ${quote}fr-CA${quote}><body/></file></xliff>`,
      );
      expect(inspectImportSource('source.xlf', directory).xliffTargetLanguage).toBe('fr-CA');
    });
  }

  it('does not infer from a later file element when the first has no target', () => {
    writeFileSync(join(directory, 'source.xlf'), '<xliff><file/><file target-language="es"/></xliff>');
    expect(inspectImportSource('source.xlf', directory).xliffTargetLanguage).toBeUndefined();
  });

  it('ignores target-language text inside another attribute', () => {
    writeFileSync(
      join(directory, 'source.xlf'),
      `<xliff><file original=" target-language='fr'" target-language="es"/></xliff>`,
    );
    expect(inspectImportSource('source.xlf', directory).xliffTargetLanguage).toBe('es');
  });

  it('ignores attributes beyond the first 64 KiB', () => {
    writeFileSync(
      join(directory, 'source.xlf'),
      `<xliff><file ${' '.repeat(64 * 1024)}target-language="es"></file></xliff>`,
    );
    expect(inspectImportSource('source.xlf', directory).xliffTargetLanguage).toBeUndefined();
  });

  it('reads an attribute in a large file when its opening tag is within the head', () => {
    writeFileSync(
      join(directory, 'source.xlf'),
      `<xliff><file target-language="es"><body>${'x'.repeat(64 * 1024)}</body></file></xliff>`,
    );
    expect(inspectImportSource('source.xlf', directory).xliffTargetLanguage).toBe('es');
  });
});
