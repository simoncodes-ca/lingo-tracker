/**
 * Real-filesystem tests for computeTreeFingerprint.
 *
 * The whole point of the fingerprint is what `stat` reports, so these run
 * against the real filesystem rather than a mocked `fs`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeTreeFingerprint, treeFingerprintsMatch } from './tree-fingerprint';

describe('computeTreeFingerprint', () => {
  let tempDir: string;

  const writeResourceFolder = (relativePath: string, entries: Record<string, unknown>): string => {
    const folderPath = path.join(tempDir, relativePath);
    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, 'resource_entries.json'), JSON.stringify(entries, null, 2), 'utf8');
    fs.writeFileSync(path.join(folderPath, 'tracker_meta.json'), JSON.stringify({}, null, 2), 'utf8');
    return folderPath;
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingo-fingerprint-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it('returns an all-zero fingerprint for a folder that does not exist', () => {
    const fingerprint = computeTreeFingerprint({ translationsFolder: path.join(tempDir, 'missing') });

    expect(fingerprint).toEqual({ fileCount: 0, folderCount: 0, totalSize: 0, maxMtimeMs: 0 });
  });

  it('counts resource files across nested folders', () => {
    writeResourceFolder('common/button', { ok: { source: 'OK' } });
    writeResourceFolder('common/dialog', { close: { source: 'Close' } });

    const fingerprint = computeTreeFingerprint({ translationsFolder: tempDir });

    // Two resource files per folder, three folders plus the root.
    expect(fingerprint.fileCount).toBe(4);
    expect(fingerprint.folderCount).toBe(4);
    expect(fingerprint.totalSize).toBeGreaterThan(0);
  });

  it('resolves a relative translations folder against cwd', () => {
    writeResourceFolder('translations/common', { ok: { source: 'OK' } });

    const fingerprint = computeTreeFingerprint({ translationsFolder: 'translations', cwd: tempDir });

    expect(fingerprint.fileCount).toBe(2);
  });

  it('ignores files that are not resource files', () => {
    const folderPath = writeResourceFolder('common', { ok: { source: 'OK' } });
    fs.writeFileSync(path.join(folderPath, 'README.md'), 'not a resource file', 'utf8');

    const fingerprint = computeTreeFingerprint({ translationsFolder: tempDir });

    expect(fingerprint.fileCount).toBe(2);
  });

  it('is stable when nothing changes', () => {
    writeResourceFolder('common', { ok: { source: 'OK' } });

    const first = computeTreeFingerprint({ translationsFolder: tempDir });
    const second = computeTreeFingerprint({ translationsFolder: tempDir });

    expect(treeFingerprintsMatch(first, second)).toBe(true);
  });

  it('changes when a resource file changes size, even within the same mtime tick', () => {
    const folderPath = writeResourceFolder('common', { ok: { source: 'OK' } });
    const before = computeTreeFingerprint({ translationsFolder: tempDir });

    // Deliberately not waiting for the clock to tick: coarse mtime granularity
    // is exactly the case size and counts exist to cover.
    fs.writeFileSync(
      path.join(folderPath, 'resource_entries.json'),
      JSON.stringify({ ok: { source: 'OK' }, cancel: { source: 'Cancel' } }, null, 2),
      'utf8',
    );

    const after = computeTreeFingerprint({ translationsFolder: tempDir });

    expect(treeFingerprintsMatch(before, after)).toBe(false);
  });

  it('changes when a resource folder is added', () => {
    writeResourceFolder('common', { ok: { source: 'OK' } });
    const before = computeTreeFingerprint({ translationsFolder: tempDir });

    writeResourceFolder('common/nested', { close: { source: 'Close' } });
    const after = computeTreeFingerprint({ translationsFolder: tempDir });

    expect(treeFingerprintsMatch(before, after)).toBe(false);
  });

  it('changes when a resource folder is removed', () => {
    writeResourceFolder('common', { ok: { source: 'OK' } });
    const removedFolder = writeResourceFolder('other', { close: { source: 'Close' } });
    const before = computeTreeFingerprint({ translationsFolder: tempDir });

    fs.rmSync(removedFolder, { recursive: true, force: true });
    const after = computeTreeFingerprint({ translationsFolder: tempDir });

    expect(treeFingerprintsMatch(before, after)).toBe(false);
  });

  it('detects an empty folder being added, even though it holds no resource files', () => {
    writeResourceFolder('common', { ok: { source: 'OK' } });
    const before = computeTreeFingerprint({ translationsFolder: tempDir });

    fs.mkdirSync(path.join(tempDir, 'empty'), { recursive: true });
    const after = computeTreeFingerprint({ translationsFolder: tempDir });

    expect(treeFingerprintsMatch(before, after)).toBe(false);
  });
});

describe('treeFingerprintsMatch', () => {
  const fingerprint = { fileCount: 2, folderCount: 1, totalSize: 100, maxMtimeMs: 1000 };

  it('treats a missing fingerprint as a mismatch', () => {
    expect(treeFingerprintsMatch(null, fingerprint)).toBe(false);
    expect(treeFingerprintsMatch(fingerprint, null)).toBe(false);
    expect(treeFingerprintsMatch(null, null)).toBe(false);
  });

  it('matches identical fingerprints', () => {
    expect(treeFingerprintsMatch(fingerprint, { ...fingerprint })).toBe(true);
  });

  it.each([
    ['fileCount', { fileCount: 3 }],
    ['folderCount', { folderCount: 2 }],
    ['totalSize', { totalSize: 101 }],
    ['maxMtimeMs', { maxMtimeMs: 1001 }],
  ])('does not match when %s differs', (_field, override) => {
    expect(treeFingerprintsMatch(fingerprint, { ...fingerprint, ...override })).toBe(false);
  });
});
