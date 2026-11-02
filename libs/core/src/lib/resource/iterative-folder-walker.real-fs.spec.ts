/**
 * Real-filesystem tests for walkFolders.
 *
 * These tests are intentionally in a separate file because the mocked-fs tests
 * use `vi.mock('fs')` at module scope, which interferes with real filesystem
 * operations (including `os.tmpdir()` and `path.join()`). Keeping them isolated
 * ensures they run against the actual Node.js fs implementation.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanFolder, walkFolders } from './iterative-folder-walker';

/**
 * Creating a symlink needs a privilege the process does not always hold — on Windows it
 * requires Developer Mode or elevation. Probe once so the symlink cases run wherever the
 * privilege exists and are skipped only where it is missing.
 */
const canCreateSymlinks = ((): boolean => {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingo-symlink-probe-'));

  try {
    fs.symlinkSync(probeDir, path.join(probeDir, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
})();

describe('walkFolders (real filesystem)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingo-walker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it.skipIf(!canCreateSymlinks)('does not follow symlinks to directories (symlinks are not traversed)', () => {
    // Node.js 18+: Dirent.isDirectory() returns false for symlinks, so symlinks to
    // directories are silently skipped before the stack push — they are never followed.
    // Structure: tempDir/child/loop -> tempDir (circular symlink, but never followed)
    const childDir = path.join(tempDir, 'child');
    fs.mkdirSync(childDir);
    const symlinkPath = path.join(childDir, 'loop');
    fs.symlinkSync(tempDir, symlinkPath);

    const visited: string[] = [];

    for (const visit of walkFolders(tempDir)) {
      visited.push(visit.absolutePath);
    }

    // root and child are real directories and are visited; the symlink is not followed
    expect(visited).toContain(tempDir);
    expect(visited).toContain(childDir);
    expect(visited).not.toContain(symlinkPath);
    expect(visited).toHaveLength(2);
  });

  it.skipIf(!canCreateSymlinks)('does not follow symlinks to directories even when multiple symlinks exist', () => {
    // Node.js 18+: Dirent.isDirectory() is false for symlinks, so neither link1 nor link2
    // is pushed onto the stack.
    const realDir = path.join(tempDir, 'real');
    fs.mkdirSync(realDir);
    fs.mkdirSync(path.join(realDir, 'nested'));

    const link1 = path.join(tempDir, 'link1');
    const link2 = path.join(tempDir, 'link2');
    fs.symlinkSync(realDir, link1);
    fs.symlinkSync(realDir, link2);

    const visited: string[] = [];

    for (const visit of walkFolders(tempDir)) {
      visited.push(visit.absolutePath);
    }

    // Only real directories are visited — realDir and its nested child
    expect(visited).toContain(tempDir);
    expect(visited).toContain(realDir);
    expect(visited).toContain(path.join(realDir, 'nested'));
    expect(visited).not.toContain(link1);
    expect(visited).not.toContain(link2);
  });

  it.skipIf(!canCreateSymlinks)('skips a directory replaced by a link to an already visited realpath', () => {
    const dirA = path.join(tempDir, 'a');
    const dirB = path.join(tempDir, 'b');
    fs.mkdirSync(dirA);
    fs.mkdirSync(dirB);
    const scan = walkFolders(tempDir);
    expect(scan.next().value?.absolutePath).toBe(tempDir);
    expect(scan.next().value?.absolutePath).toBe(dirA);

    // The parent listed b as a directory; replace it before the scan reaches it.
    fs.rmdirSync(dirB);
    fs.symlinkSync(dirA, dirB);
    expect([...scan]).toEqual([]);
  });

  it('uses a fresh cycle guard for each walk', () => {
    // Verifies that the default cycle guard allows normal traversal.
    // We do NOT create an actual cycle here (that would hang indefinitely).
    const subDir = path.join(tempDir, 'sub');
    fs.mkdirSync(subDir);

    const visited: string[] = [];
    for (const visit of walkFolders(tempDir)) {
      visited.push(visit.absolutePath);
    }

    expect(visited).toContain(tempDir);
    expect(visited).toContain(subDir);
  });

  it('reports resource file names and retains excluded entries for pruning', () => {
    fs.mkdirSync(path.join(tempDir, '.hidden'));
    fs.mkdirSync(path.join(tempDir, 'resource_entries.json'));
    fs.writeFileSync(path.join(tempDir, 'tracker_meta.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'notes.txt'), 'notes');
    const visit = scanFolder(tempDir);
    expect(visit).toBeDefined();
    expect(visit?.resourceFileNames).toEqual(['tracker_meta.json']);
    expect(visit?.subdirectoryNames).toEqual(['resource_entries.json']);
    expect(visit?.entries.map((entry) => entry.name).sort()).toEqual([
      '.hidden',
      'notes.txt',
      'resource_entries.json',
      'tracker_meta.json',
    ]);
  });

  it('skips a child that disappears after its parent is scanned', () => {
    const child = path.join(tempDir, 'child');
    fs.mkdirSync(child);
    const scan = walkFolders(tempDir);
    expect(scan.next().value?.subdirectoryNames).toEqual(['child']);
    fs.rmdirSync(child);
    expect([...scan]).toEqual([]);
  });

  it('reports a child that disappears mid-walk through onUnlistable', () => {
    const child = path.join(tempDir, 'child');
    fs.mkdirSync(child);
    const problems: { absolutePath: string; error: unknown }[] = [];
    const scan = walkFolders(tempDir, {
      onUnlistable: (absolutePath, error) => problems.push({ absolutePath, error }),
    });
    expect(scan.next().value?.subdirectoryNames).toEqual(['child']);
    fs.rmdirSync(child);
    expect([...scan]).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.absolutePath).toBe(child);
    expect(problems[0]?.error).toMatchObject({ code: 'ENOENT' });
  });

  it('single-folder scan throws the original filesystem error for a missing folder', () => {
    const missing = path.join(tempDir, 'missing');
    expect(() => scanFolder(missing)).toThrow(/ENOENT:.*scandir/);
  });

  it('reports a root that is a file through onUnlistable and yields nothing', () => {
    const file = path.join(tempDir, 'file');
    fs.writeFileSync(file, '');
    const unlistable: string[] = [];

    const visits = [...walkFolders(file, { onUnlistable: (absolutePath) => unlistable.push(absolutePath) })];

    expect(visits).toEqual([]);
    expect(unlistable).toEqual([file]);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'reports a subdirectory it cannot list through onUnlistable and keeps walking',
    () => {
      const locked = path.join(tempDir, 'locked');
      fs.mkdirSync(locked);
      fs.mkdirSync(path.join(tempDir, 'open'));
      fs.chmodSync(locked, 0o000);
      const unlistable: string[] = [];

      try {
        const visited = [
          ...walkFolders(tempDir, { onUnlistable: (absolutePath) => unlistable.push(absolutePath) }),
        ].map((visit) => path.relative(tempDir, visit.absolutePath));

        expect(visited.sort()).toEqual(['', 'open']);
        expect(unlistable).toEqual([locked]);
      } finally {
        fs.chmodSync(locked, 0o700);
      }
    },
  );
});
