/**
 * Real-filesystem tests for walkFolders.
 *
 * These tests are intentionally in a separate file because the mocked-fs tests
 * use `vi.mock('fs')` at module scope, which interferes with real filesystem
 * operations (including `os.tmpdir()` and `path.join()`). Keeping them isolated
 * ensures they run against the actual Node.js fs implementation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { walkFolders } from './iterative-folder-walker';

describe('walkFolders (real filesystem)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingo-walker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not follow symlinks to directories (symlinks are not traversed)', () => {
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

  it('does not follow symlinks to directories even when multiple symlinks exist', () => {
    // Node.js 18+: Dirent.isDirectory() is false for symlinks, so neither link1 nor link2
    // is pushed onto the stack regardless of visitedPaths.
    const realDir = path.join(tempDir, 'real');
    fs.mkdirSync(realDir);
    fs.mkdirSync(path.join(realDir, 'nested'));

    const link1 = path.join(tempDir, 'link1');
    const link2 = path.join(tempDir, 'link2');
    fs.symlinkSync(realDir, link1);
    fs.symlinkSync(realDir, link2);

    const visited: string[] = [];

    for (const visit of walkFolders(tempDir, { skipHidden: false })) {
      visited.push(visit.absolutePath);
    }

    // Only real directories are visited — realDir and its nested child
    expect(visited).toContain(tempDir);
    expect(visited).toContain(realDir);
    expect(visited).toContain(path.join(realDir, 'nested'));
    expect(visited).not.toContain(link1);
    expect(visited).not.toContain(link2);
  });

  it('skips directories whose realpath is already in visitedPaths (cycle detection)', () => {
    // This test exercises the visitedPaths branch in walkFolders by pre-populating
    // visitedPaths with the realpath of a real subdirectory before the walk begins.
    // When the walker pops that directory from the stack it finds its realpath already
    // present in the set and skips it — actually reaching the cycle-detection code path.
    const dirA = path.join(tempDir, 'a');
    const dirB = path.join(tempDir, 'b');
    fs.mkdirSync(dirA);
    fs.mkdirSync(dirB);

    const realPathOfB = fs.realpathSync(dirB);
    const visitedPaths = new Set<string>([realPathOfB]);
    const visited: string[] = [];

    for (const visit of walkFolders(tempDir, { visitedPaths })) {
      visited.push(visit.absolutePath);
    }

    // dirA was not pre-visited so it should be walked; dirB was pre-marked so it is skipped
    expect(visited).toContain(dirA);
    expect(visited).not.toContain(dirB);
  });

  it('completes without cycle checks when visitedPaths is not provided', () => {
    // Verifies the opt-in nature of cycle detection — normal traversal still works.
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

  it('yields correct keyPrefixes for a real nested directory structure', () => {
    fs.mkdirSync(path.join(tempDir, 'apps'));
    fs.mkdirSync(path.join(tempDir, 'apps', 'common'));
    fs.mkdirSync(path.join(tempDir, 'apps', 'common', 'buttons'));
    fs.writeFileSync(path.join(tempDir, 'apps', 'common', 'buttons', 'resource_entries.json'), '{}');

    const keyPrefixByPath: Record<string, string> = {};
    for (const visit of walkFolders(tempDir)) {
      keyPrefixByPath[visit.absolutePath] = visit.keyPrefix;
    }

    expect(keyPrefixByPath[tempDir]).toBe('');
    expect(keyPrefixByPath[path.join(tempDir, 'apps')]).toBe('apps');
    expect(keyPrefixByPath[path.join(tempDir, 'apps', 'common')]).toBe('apps.common');
    expect(keyPrefixByPath[path.join(tempDir, 'apps', 'common', 'buttons')]).toBe('apps.common.buttons');
  });
});
