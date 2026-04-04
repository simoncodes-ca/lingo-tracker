import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

import { walkFolders } from './iterative-folder-walker';
import type { FolderVisit } from './iterative-folder-walker';

// ─── Helpers ────────────────────────────────────────────────────────────────

type FakeDirent = Pick<fs.Dirent, 'name' | 'isDirectory'>;

function makeDirectoryDirent(name: string): FakeDirent {
  return { name, isDirectory: () => true };
}

function makeFileDirent(name: string): FakeDirent {
  return { name, isDirectory: () => false };
}

/**
 * Builds a minimal mock filesystem mapping absolute paths to their readdir results.
 * Keys are absolute paths; values are arrays of Dirent-like entries.
 */
type MockFilesystem = Record<string, FakeDirent[]>;

function installMockFilesystem(mockFs: MockFilesystem): void {
  vi.mocked(fs.existsSync).mockImplementation((p) => p.toString() in mockFs);

  vi.mocked(fs.readdirSync).mockImplementation((p, _opts) => {
    const entries = mockFs[p.toString()];
    if (entries === undefined) {
      const error = new Error(`ENOENT: no such file or directory, scandir '${p}'`);
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }
    return entries as unknown as fs.Dirent[];
  });
}

// ─── Mocked-fs tests ────────────────────────────────────────────────────────

vi.mock('fs');

describe('walkFolders (mocked fs)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Non-existent root ────────────────────────────────────────────────────

  describe('non-existent root', () => {
    it('yields nothing when root path does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const visits = [...walkFolders('/does-not-exist')];

      expect(visits).toHaveLength(0);
    });
  });

  // ── Empty directory ──────────────────────────────────────────────────────

  describe('empty directory', () => {
    it('yields exactly the root folder with empty subdirectoryNames', () => {
      installMockFilesystem({ '/root': [] });

      const visits = [...walkFolders('/root')];

      expect(visits).toHaveLength(1);
      expect(visits[0].absolutePath).toBe('/root');
      expect(visits[0].depth).toBe(0);
      expect(visits[0].keyPrefix).toBe('');
      expect(visits[0].subdirectoryNames).toEqual([]);
    });
  });

  // ── keyPrefix building ───────────────────────────────────────────────────

  describe('keyPrefix building', () => {
    it('builds dot-delimited keyPrefix relative to root', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('apps')],
        '/root/apps': [makeDirectoryDirent('common')],
        '/root/apps/common': [makeDirectoryDirent('buttons')],
        '/root/apps/common/buttons': [],
      });

      const visits = [...walkFolders('/root')];
      const prefixByPath: Record<string, string> = {};
      for (const visit of visits) {
        prefixByPath[visit.absolutePath] = visit.keyPrefix;
      }

      expect(prefixByPath['/root']).toBe('');
      expect(prefixByPath['/root/apps']).toBe('apps');
      expect(prefixByPath['/root/apps/common']).toBe('apps.common');
      expect(prefixByPath['/root/apps/common/buttons']).toBe('apps.common.buttons');
    });

    it('assigns depth values correctly', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('a')],
        '/root/a': [makeDirectoryDirent('b')],
        '/root/a/b': [],
      });

      const visits = [...walkFolders('/root')];
      const depthByPath: Record<string, number> = {};
      for (const visit of visits) {
        depthByPath[visit.absolutePath] = visit.depth;
      }

      expect(depthByPath['/root']).toBe(0);
      expect(depthByPath['/root/a']).toBe(1);
      expect(depthByPath['/root/a/b']).toBe(2);
    });
  });

  // ── DFS traversal order ──────────────────────────────────────────────────

  describe('DFS traversal order', () => {
    it('visits parent before its children (pre-order DFS)', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('apps'), makeDirectoryDirent('shared')],
        '/root/apps': [makeDirectoryDirent('buttons')],
        '/root/apps/buttons': [],
        '/root/shared': [],
      });

      const visitedPaths = [...walkFolders('/root')].map((v) => v.absolutePath);

      const rootIndex = visitedPaths.indexOf('/root');
      const appsIndex = visitedPaths.indexOf('/root/apps');
      const buttonsIndex = visitedPaths.indexOf('/root/apps/buttons');
      const sharedIndex = visitedPaths.indexOf('/root/shared');

      expect(rootIndex).toBeLessThan(appsIndex);
      expect(appsIndex).toBeLessThan(buttonsIndex);
      expect(rootIndex).toBeLessThan(sharedIndex);
    });

    it('includes all directories at all depths', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('a'), makeDirectoryDirent('b')],
        '/root/a': [makeDirectoryDirent('c')],
        '/root/a/c': [],
        '/root/b': [],
      });

      const visitedPaths = [...walkFolders('/root')].map((v) => v.absolutePath);

      expect(visitedPaths).toContain('/root');
      expect(visitedPaths).toContain('/root/a');
      expect(visitedPaths).toContain('/root/a/c');
      expect(visitedPaths).toContain('/root/b');
      expect(visitedPaths).toHaveLength(4);
    });
  });

  // ── Hidden directory filtering ───────────────────────────────────────────

  describe('hidden directory filtering', () => {
    it('skips hidden directories by default (skipHidden defaults to true)', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('visible'), makeDirectoryDirent('.hidden')],
        '/root/visible': [],
        '/root/.hidden': [],
      });

      const visitedPaths = [...walkFolders('/root')].map((v) => v.absolutePath);

      expect(visitedPaths).toContain('/root');
      expect(visitedPaths).toContain('/root/visible');
      expect(visitedPaths).not.toContain('/root/.hidden');
    });

    it('includes hidden directories when skipHidden is false', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('.git'), makeDirectoryDirent('src')],
        '/root/.git': [makeDirectoryDirent('objects')],
        '/root/.git/objects': [],
        '/root/src': [],
      });

      const visitedPaths = [...walkFolders('/root', { skipHidden: false })].map((v) => v.absolutePath);

      expect(visitedPaths).toContain('/root/.git');
      expect(visitedPaths).toContain('/root/.git/objects');
      expect(visitedPaths).toContain('/root/src');
    });

    it('excludes hidden dirs from subdirectoryNames when skipHidden is true', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('visible'), makeDirectoryDirent('.hidden')],
        '/root/visible': [],
        '/root/.hidden': [],
      });

      const rootVisit = [...walkFolders('/root')].find((v) => v.absolutePath === '/root');

      expect(rootVisit?.subdirectoryNames).toEqual(['visible']);
    });

    it('includes hidden dirs in subdirectoryNames when skipHidden is false', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('visible'), makeDirectoryDirent('.hidden')],
        '/root/visible': [],
        '/root/.hidden': [],
      });

      const rootVisit = [...walkFolders('/root', { skipHidden: false })].find((v) => v.absolutePath === '/root');

      expect(rootVisit?.subdirectoryNames).toContain('visible');
      expect(rootVisit?.subdirectoryNames).toContain('.hidden');
    });
  });

  // ── maxDepth limiting ────────────────────────────────────────────────────

  describe('maxDepth limiting', () => {
    it('yields only root when maxDepth is 0', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('apps')],
        '/root/apps': [makeDirectoryDirent('buttons')],
        '/root/apps/buttons': [],
      });

      const visits = [...walkFolders('/root', { maxDepth: 0 })];

      expect(visits).toHaveLength(1);
      expect(visits[0].absolutePath).toBe('/root');
    });

    it('yields root and immediate children when maxDepth is 1', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('apps'), makeDirectoryDirent('shared')],
        '/root/apps': [makeDirectoryDirent('buttons')],
        '/root/apps/buttons': [],
        '/root/shared': [],
      });

      const visits = [...walkFolders('/root', { maxDepth: 1 })];
      const visitedPaths = visits.map((v) => v.absolutePath);

      expect(visitedPaths).toContain('/root');
      expect(visitedPaths).toContain('/root/apps');
      expect(visitedPaths).toContain('/root/shared');
      expect(visitedPaths).not.toContain('/root/apps/buttons');
    });

    it('respects Infinity maxDepth (visits all levels)', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('a')],
        '/root/a': [makeDirectoryDirent('b')],
        '/root/a/b': [makeDirectoryDirent('c')],
        '/root/a/b/c': [],
      });

      const visits = [...walkFolders('/root', { maxDepth: Infinity })];

      expect(visits).toHaveLength(4);
    });

    it('still reports subdirectoryNames at the depth limit (not filtered by maxDepth)', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('apps')],
        '/root/apps': [makeDirectoryDirent('buttons'), makeDirectoryDirent('forms')],
        '/root/apps/buttons': [],
        '/root/apps/forms': [],
      });

      // maxDepth 1: apps is visited but its children are not descended into
      const visits = [...walkFolders('/root', { maxDepth: 1 })];
      const appsVisit = visits.find((v) => v.absolutePath === '/root/apps');

      // subdirectoryNames reports what *would* be visited, not what the depth limit blocks
      expect(appsVisit?.subdirectoryNames).toEqual(['buttons', 'forms']);
    });
  });

  // ── dirEntries passthrough ───────────────────────────────────────────────

  describe('dirEntries passthrough', () => {
    it('includes all raw Dirent entries (files and directories)', () => {
      const dirEntries: FakeDirent[] = [
        makeFileDirent('resource_entries.json'),
        makeFileDirent('tracker_meta.json'),
        makeDirectoryDirent('buttons'),
      ];
      installMockFilesystem({
        '/root': dirEntries,
        '/root/buttons': [],
      });

      const rootVisit = [...walkFolders('/root')].find((v) => v.absolutePath === '/root');

      expect(rootVisit?.dirEntries).toBe(dirEntries);
    });
  });

  // ── Early exit via break ─────────────────────────────────────────────────

  describe('early exit via break', () => {
    it('stops iterating when caller breaks out of the loop', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('a'), makeDirectoryDirent('b'), makeDirectoryDirent('c')],
        '/root/a': [],
        '/root/b': [],
        '/root/c': [],
      });

      const visited: FolderVisit[] = [];
      for (const visit of walkFolders('/root')) {
        visited.push(visit);
        if (visit.absolutePath === '/root') {
          break;
        }
      }

      // Only the root should have been collected before break
      expect(visited).toHaveLength(1);
      expect(visited[0].absolutePath).toBe('/root');
    });

    it('allows partial traversal by breaking after a specific path', () => {
      installMockFilesystem({
        '/root': [makeDirectoryDirent('a'), makeDirectoryDirent('b')],
        '/root/a': [],
        '/root/b': [],
      });

      const visited: string[] = [];
      for (const visit of walkFolders('/root')) {
        visited.push(visit.absolutePath);
        if (visit.absolutePath === '/root/a') {
          break;
        }
      }

      expect(visited).not.toContain('/root/b');
    });
  });
});
