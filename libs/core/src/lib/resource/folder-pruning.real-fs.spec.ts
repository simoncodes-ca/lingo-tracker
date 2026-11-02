import * as fs from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seedResources, testCollection, useTempDir, writeFolderFiles } from '../../testing/temp-dir.spec-helpers';
import { PRUNABLE_OS_JUNK_FILES, pruneEmptiedFolders, pruneEmptyFolders } from './folder-pruning';
import type { ResourceMutation } from './resource-mutation';

vi.mock('node:fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:fs')>()) }));

// Replaces folder-utils.spec.ts and cleanup-empty-folders.spec.ts with real disk behavior.
// Filesystem spies only inject deterministic I/O failures; directory fixtures remain real.
describe('Folder Pruning (real fs)', () => {
  const root = useTempDir('folder-pruning-');
  const collection = () => testCollection(root());
  const folder = (address: string) => writeFolderFiles(root(), address, {});
  const stray = (address: string, name: string) => {
    const file = join(folder(address), name);
    fs.writeFileSync(file, 'keep me');
    return file;
  };
  const keptPaths = () => pruneEmptyFolders(collection()).kept.map((kept) => kept.folderPath);
  afterEach(() => vi.restoreAllMocks());

  it('removes an empty leaf without resource_entries.json', () => {
    const empty = folder('empty');
    expect(pruneEmptyFolders(collection()).removed).toEqual(['empty']);
    expect(fs.existsSync(empty)).toBe(false);
  });

  it('removes an empty resource_entries.json', () => {
    const empty = writeFolderFiles(root(), 'empty', { entries: {} });
    expect(pruneEmptyFolders(collection()).removed).toEqual(['empty']);
    expect(fs.existsSync(empty)).toBe(false);
  });

  it('removes empty entries and valid metadata together', () => {
    const empty = writeFolderFiles(root(), 'empty', { entries: {}, meta: { old: { en: { checksum: 'old' } } } });
    expect(pruneEmptyFolders(collection()).removed).toEqual(['empty']);
    expect(fs.existsSync(empty)).toBe(false);
  });

  it('removes valid tracker_meta.json when resource_entries.json is absent', () => {
    const empty = writeFolderFiles(root(), 'empty', { meta: {} });
    expect(pruneEmptyFolders(collection()).removed).toEqual(['empty']);
    expect(fs.existsSync(empty)).toBe(false);
  });

  it('removes nested empty folders bottom-up', () => {
    folder('apps.common.buttons');
    folder('apps.dashboard.alerts');
    const removed = pruneEmptyFolders(collection()).removed;
    expect(removed).toEqual(['apps.common.buttons', 'apps.dashboard.alerts', 'apps.common', 'apps.dashboard', 'apps']);
  });

  it('prunes deduplicated operation paths by depth and lexical order regardless of input order', () => {
    const last = folder('z.child.deep');
    const first = folder('a.child.deep');
    const unrelated = folder('unrelated');
    const mutations: ResourceMutation[] = [];
    const result = pruneEmptiedFolders(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      [last, first, last, root(), join(root(), 'a')],
      {},
    );
    expect(result.removed).toEqual(['a.child.deep', 'z.child.deep', 'a.child', 'z.child', 'a', 'z']);
    expect(result.problems).toEqual([]);
    expect(mutations).toEqual(
      result.removed.map((path) => ({ kind: 'remove-folder', translationsFolder: root(), path })),
    );
    expect(fs.existsSync(unrelated)).toBe(true);
    expect(fs.existsSync(root())).toBe(true);
  });

  it('handles a single level with several empty folders', () => {
    folder('one');
    folder('two');
    expect(pruneEmptyFolders(collection()).removed).toEqual(['one', 'two']);
  });

  it('reports no removals for a root with no subfolders', () => {
    expect(pruneEmptyFolders(collection())).toEqual({
      removed: [],
      kept: [{ folderPath: '', reason: 'root' }],
      problems: [],
    });
  });

  it('treats a missing translations folder as an empty collection', () => {
    expect(pruneEmptyFolders(testCollection(join(root(), 'missing')))).toEqual({ removed: [], kept: [], problems: [] });
  });

  it('treats a missing start folder as nothing to prune', () => {
    expect(pruneEmptyFolders(collection(), { startPath: 'missing' })).toEqual({ removed: [], kept: [], problems: [] });
  });

  it('removes an empty folder when the missing entries error comes from another VM realm', () => {
    const empty = folder('empty');
    const error: unknown = runInNewContext("Object.assign(new Error('Missing entries'), { code: 'ENOENT' })");
    expect(error).not.toBeInstanceOf(Error);
    const readFile = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
      if (args[0] === join(empty, 'resource_entries.json')) throw error;
      return Reflect.apply(readFile, fs, args);
    });
    const mutations: ResourceMutation[] = [];
    const result = pruneEmptyFolders(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      {},
    );
    expect(result.removed).toEqual(['empty']);
    expect(result.problems).toEqual([]);
    expect(fs.existsSync(empty)).toBe(false);
    expect(mutations).toEqual([{ kind: 'remove-folder', translationsFolder: root(), path: 'empty' }]);
  });

  it('treats a missing start as empty when lstat throws an error from another VM realm', () => {
    const error: unknown = runInNewContext("Object.assign(new Error('Missing start'), { code: 'ENOENT' })");
    expect(error).not.toBeInstanceOf(Error);
    vi.spyOn(fs, 'lstatSync').mockImplementation(() => {
      throw error;
    });
    expect(pruneEmptyFolders(collection(), { startPath: 'missing' })).toEqual({ removed: [], kept: [], problems: [] });
  });

  it('keeps a folder with resource entries and all its ancestors', () => {
    seedResources(collection(), { 'apps.common.ok': { source: 'OK' } });
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({
      folderPath: 'apps.common',
      reason: 'entries',
      entries: [join('apps', 'common', 'resource_entries.json')],
    });
    expect(result.kept.map((kept) => kept.folderPath)).toEqual(['apps.common', 'apps', '']);
  });

  it('keeps a parent of a retained subfolder even without resource files', () => {
    stray('parent.child', 'README');
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({
      folderPath: 'parent',
      reason: 'subfolders',
      entries: [join('parent', 'child')],
    });
  });

  it('keeps a folder with both entries and subfolders', () => {
    seedResources(collection(), { 'parent.ok': { source: 'OK' }, 'parent.child.ok': { source: 'Child' } });
    expect(keptPaths()).toEqual(['parent.child', 'parent', '']);
  });

  it('prunes empty branches at several depths while keeping populated branches', () => {
    folder('apps.common.buttons');
    seedResources(collection(), {
      'apps.dashboard.alerts.ok': { source: 'Alert' },
      'shared.ok': { source: 'Shared' },
    });
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual(['apps.common.buttons', 'apps.common']);
    expect(result.kept.map((kept) => kept.folderPath)).toEqual([
      'apps.dashboard.alerts',
      'apps.dashboard',
      'apps',
      'shared',
      '',
    ]);
  });

  it('reports the correct removal count and addresses among retained siblings', () => {
    folder('empty1');
    folder('empty2');
    seedResources(collection(), { 'populated.ok': { source: 'OK' } });
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual(['empty1', 'empty2']);
    expect(result.removed).toHaveLength(2);
    expect(fs.existsSync(join(root(), 'populated'))).toBe(true);
  });

  it('keeps notes.md and reports its path, protecting ancestors', () => {
    const notes = stray('apps.common', 'notes.md');
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({
      folderPath: 'apps.common',
      reason: 'content',
      entries: [join('apps', 'common', 'notes.md')],
    });
    expect(result.kept.map((kept) => kept.folderPath)).toEqual(['apps.common', 'apps', '']);
    expect(fs.readFileSync(notes, 'utf8')).toBe('keep me');
    expect(result.problems).toEqual([]);
  });

  it('keeps .gitkeep instead of treating all hidden files as disposable', () => {
    const file = stray('parent.child', '.gitkeep');
    expect(keptPaths()).toEqual(['parent.child', 'parent', '']);
    expect(fs.readFileSync(file, 'utf8')).toBe('keep me');
  });

  it('keeps multiple hidden files and reports each one', () => {
    stray('hiddenfiles', '.gitkeep');
    stray('hiddenfiles', '.notes');
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({
      folderPath: 'hiddenfiles',
      reason: 'content',
      entries: [join('hiddenfiles', '.gitkeep'), join('hiddenfiles', '.notes')],
    });
  });

  it('keeps hidden directories and never prunes their contents', () => {
    const hidden = join(folder('parent'), '.backup');
    fs.mkdirSync(join(hidden, 'empty'), { recursive: true });
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({
      folderPath: 'parent',
      reason: 'content',
      entries: [join('parent', '.backup')],
    });
    expect(fs.existsSync(join(hidden, 'empty'))).toBe(true);
  });

  it('deletes .DS_Store with an otherwise empty folder', () => {
    const file = stray('empty', '.DS_Store');
    expect(pruneEmptyFolders(collection()).removed).toEqual(['empty']);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('deletes all three OS junk files using the exported allowlist', () => {
    expect(PRUNABLE_OS_JUNK_FILES).toEqual(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
    for (const name of PRUNABLE_OS_JUNK_FILES) stray('empty', name);
    expect(pruneEmptyFolders(collection()).removed).toEqual(['empty']);
  });

  it('keeps malformed resource_entries.json and reports a problem', () => {
    const broken = writeFolderFiles(root(), 'parent.broken', { entries: 'invalid json{' });
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept.map((kept) => kept.folderPath)).toEqual(['parent.broken', 'parent', '']);
    expect(result.problems[0]).toMatchObject({ folderPath: 'parent.broken', absolutePath: broken });
    expect(result.problems[0]?.message).toContain('resource_entries.json');
  });

  it('keeps malformed tracker_meta.json with absent or empty entries', () => {
    writeFolderFiles(root(), 'absent', { meta: '{ broken' });
    writeFolderFiles(root(), 'empty', { entries: {}, meta: 'null' });
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.problems.map((problem) => problem.folderPath)).toEqual(['absent', 'empty']);
    expect(result.problems.every((problem) => problem.message.includes('tracker_meta.json'))).toBe(true);
  });

  it('keeps JSON values that are not collection objects', () => {
    writeFolderFiles(root(), 'array', { entries: '[]' });
    writeFolderFiles(root(), 'null', { entries: 'null' });
    writeFolderFiles(root(), 'primitive', { entries: '0' });
    expect(pruneEmptyFolders(collection()).problems).toHaveLength(3);
  });

  it('never removes the translations root or its files', () => {
    writeFolderFiles(root(), '', { entries: {}, meta: {} });
    fs.writeFileSync(join(root(), '.DS_Store'), 'junk');
    folder('empty');
    expect(pruneEmptyFolders(collection(), { startPath: '' }).removed).toEqual(['empty']);
    expect(fs.readdirSync(root())).toEqual(['.DS_Store', 'resource_entries.json', 'tracker_meta.json']);
  });

  it('limits pruning to startPath, includes the start folder, and leaves ancestors and siblings alone', () => {
    folder('apps.source.deep');
    folder('apps.sibling');
    expect(pruneEmptyFolders(collection(), { startPath: 'apps.source' }).removed).toEqual([
      'apps.source.deep',
      'apps.source',
    ]);
    expect(fs.existsSync(join(root(), 'apps'))).toBe(true);
    expect(fs.existsSync(join(root(), 'apps', 'sibling'))).toBe(true);
  });

  it('dryRun preserves all files and reports the same nested removals as a real run', () => {
    writeFolderFiles(root(), 'apps.deep', { entries: {}, meta: {} });
    stray('apps.deep', '.DS_Store');
    const dry = pruneEmptyFolders(collection(), { dryRun: true });
    expect(fs.existsSync(join(root(), 'apps', 'deep', 'resource_entries.json'))).toBe(true);
    expect(fs.existsSync(join(root(), 'apps', 'deep', '.DS_Store'))).toBe(true);
    expect(dry.removed).toEqual(['apps.deep', 'apps']);
    expect(pruneEmptyFolders(collection())).toEqual(dry);
  });

  it('emits remove-folder mutations deepest first immediately after each removal', () => {
    folder('apps.deep');
    const mutations: ResourceMutation[] = [];
    pruneEmptyFolders(
      {
        ...collection(),
        onMutation: (mutation) => {
          mutations.push(mutation);
          if (mutation.kind === 'remove-folder') {
            expect(fs.existsSync(join(root(), ...mutation.path.split('.')))).toBe(false);
            if (mutation.path === 'apps.deep') expect(fs.existsSync(join(root(), 'apps'))).toBe(true);
          }
        },
      },
      {},
    );
    expect(mutations).toEqual([
      { kind: 'remove-folder', translationsFolder: root(), path: 'apps.deep' },
      { kind: 'remove-folder', translationsFolder: root(), path: 'apps' },
    ]);
  });

  it('emits no mutations in dryRun', () => {
    folder('apps.deep');
    const onMutation = vi.fn();
    expect(
      pruneEmptyFolders({ ...collection(), onMutation: onMutation ?? collection().onMutation }, { dryRun: true })
        .removed,
    ).toEqual(['apps.deep', 'apps']);
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('keeps an unlistable folder, reports its problem, and continues with siblings', () => {
    const blocked = folder('parent.blocked');
    folder('sibling');
    const readdir = fs.readdirSync;
    vi.spyOn(fs, 'readdirSync').mockImplementation((...args) => {
      if (args[0] === blocked) throw new Error('Cannot list fixture');
      return Reflect.apply(readdir, fs, args);
    });
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual(['sibling']);
    expect(result.kept.map((kept) => kept.folderPath)).toEqual(['parent.blocked', 'parent', '']);
    expect(result.problems[0]).toMatchObject({ folderPath: 'parent.blocked', absolutePath: blocked });
  });

  it('preserves the raw listing error when a folder vanishes before classification', () => {
    const vanished = folder('vanished');
    const readdir = fs.readdirSync;
    let listed = false;
    let listingError: unknown;
    vi.spyOn(fs, 'readdirSync').mockImplementation((...args) => {
      try {
        const entries = Reflect.apply(readdir, fs, args);
        if (args[0] === vanished && !listed) {
          listed = true;
          fs.rmSync(vanished, { recursive: true });
        }
        return entries;
      } catch (error) {
        listingError = error;
        throw error;
      }
    });
    const result = pruneEmptyFolders(collection());
    expect(listingError).toBeInstanceOf(Error);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.message).toBe(listingError instanceof Error ? listingError.message : undefined);
    expect(result.problems[0]?.message).toContain('ENOENT');
  });

  it('keeps unreadable collection files and reports a problem', () => {
    const blocked = writeFolderFiles(root(), 'parent.blocked', { entries: {}, meta: {} });
    const readFile = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
      if (args[0] === join(blocked, 'tracker_meta.json')) throw new Error('Cannot read fixture');
      return Reflect.apply(readFile, fs, args);
    });
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.problems[0]?.message).toContain('tracker_meta.json');
    expect(fs.existsSync(join(blocked, 'resource_entries.json'))).toBe(true);
  });

  it('reports failed deletion without counting it as a removal or emitting a mutation', () => {
    const empty = folder('parent.empty');
    vi.spyOn(fs, 'rmdirSync').mockImplementation(() => {
      throw new Error('Cannot remove fixture');
    });
    const onMutation = vi.fn();
    const result = pruneEmptyFolders({ ...collection(), onMutation: onMutation ?? collection().onMutation }, {});
    expect(result.removed).toEqual([]);
    expect(result.problems[0]).toMatchObject({ folderPath: 'parent.empty', absolutePath: empty });
    expect(fs.existsSync(empty)).toBe(true);
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('does not use recursive rm or delete unknown content arriving before rmdir', () => {
    const empty = writeFolderFiles(root(), 'empty', { entries: {}, meta: {} });
    const unlink = fs.unlinkSync;
    const deleted: string[] = [];
    vi.spyOn(fs, 'unlinkSync').mockImplementation((file) => {
      deleted.push(String(file));
      unlink(file);
      fs.writeFileSync(join(empty, 'notes.md'), 'arrived during pruning');
    });
    const rm = vi.spyOn(fs, 'rmSync');
    const result = pruneEmptyFolders(collection());
    expect(deleted).toEqual([join(empty, 'tracker_meta.json'), join(empty, 'resource_entries.json')]);
    expect(rm).not.toHaveBeenCalled();
    expect(result.removed).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.message).toContain(
      'Removed tracker_meta.json, resource_entries.json before removal failed',
    );
    expect(result.problems[0]?.message).toContain('ENOTEMPTY');
    expect(fs.readFileSync(join(empty, 'notes.md'), 'utf8')).toBe('arrived during pruning');
  });

  it('keeps symbolic links even when they have a removable filename', () => {
    const target = stray('target', 'notes.md');
    fs.symlinkSync(target, join(folder('linked'), '.DS_Store'));
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({
      folderPath: 'linked',
      reason: 'content',
      entries: [join('linked', '.DS_Store')],
    });
    expect(fs.readFileSync(target, 'utf8')).toBe('keep me');
  });

  it('does not descend through a symbolic link in startPath', () => {
    const target = folder('target.empty');
    fs.symlinkSync(join(root(), 'target'), join(root(), 'linked'));
    const result = pruneEmptyFolders(collection(), { startPath: 'linked.empty' });
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([{ folderPath: 'linked', reason: 'problem', entries: ['linked'] }]);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('keeps a symbolic link used directly as the start folder and reports it', () => {
    const target = folder('target');
    fs.symlinkSync(target, join(root(), 'linked'));
    const result = pruneEmptyFolders(collection(), { startPath: 'linked' });
    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([{ folderPath: 'linked', reason: 'problem', entries: ['linked'] }]);
    expect(result.problems).toEqual([expect.objectContaining({ kind: 'unreadable', folderPath: 'linked' })]);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.lstatSync(join(root(), 'linked')).isSymbolicLink()).toBe(true);
  });

  it('keeps newly populated entries after classification and deletes nothing', () => {
    const empty = writeFolderFiles(root(), 'parent.empty', { entries: {}, meta: {} });
    const entriesPath = join(empty, 'resource_entries.json');
    fs.writeFileSync(join(empty, '.DS_Store'), 'junk');
    const readFile = fs.readFileSync;
    let entriesReads = 0;
    // The second read is the removal preflight: classification already decided to remove.
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
      if (args[0] === entriesPath && ++entriesReads === 2) {
        fs.writeFileSync(entriesPath, JSON.stringify({ first: { source: 'Created concurrently' } }));
      }
      return Reflect.apply(readFile, fs, args);
    });
    const unlink = vi.spyOn(fs, 'unlinkSync');
    const onMutation = vi.fn();
    const result = pruneEmptyFolders({ ...collection(), onMutation: onMutation ?? collection().onMutation }, {});
    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({
      folderPath: 'parent.empty',
      reason: 'entries',
      entries: [join('parent', 'empty', 'resource_entries.json')],
    });
    expect(result.kept.map((kept) => kept.folderPath)).toEqual(['parent.empty', 'parent', '']);
    expect(result.problems).toEqual([]);
    expect(unlink).not.toHaveBeenCalled();
    expect(onMutation).not.toHaveBeenCalled();
    expect(fs.readdirSync(empty)).toEqual(['.DS_Store', 'resource_entries.json', 'tracker_meta.json']);
    expect(JSON.parse(fs.readFileSync(entriesPath, 'utf8'))).toEqual({ first: { source: 'Created concurrently' } });
  });

  it('keeps entries that become malformed after classification and deletes nothing', () => {
    const empty = writeFolderFiles(root(), 'empty', { entries: {}, meta: {} });
    const entriesPath = join(empty, 'resource_entries.json');
    const readFile = fs.readFileSync;
    let entriesReads = 0;
    vi.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
      if (args[0] === entriesPath && ++entriesReads === 2) fs.writeFileSync(entriesPath, '{ incomplete');
      return Reflect.apply(readFile, fs, args);
    });
    const unlink = vi.spyOn(fs, 'unlinkSync');
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept.find((kept) => kept.folderPath === 'empty')?.reason).toBe('problem');
    expect(result.problems[0]?.message).toContain('resource_entries.json');
    expect(unlink).not.toHaveBeenCalled();
    expect(fs.readFileSync(join(empty, 'tracker_meta.json'), 'utf8')).toBe('{}');
  });

  it('keeps an entries file created after classification even when entries were absent', () => {
    const empty = writeFolderFiles(root(), 'empty', { meta: {} });
    const entriesPath = join(empty, 'resource_entries.json');
    const exists = fs.existsSync;
    vi.spyOn(fs, 'existsSync').mockImplementation((...args) => {
      if (args[0] === entriesPath) fs.writeFileSync(entriesPath, JSON.stringify({ first: { source: 'New' } }));
      return Reflect.apply(exists, fs, args);
    });
    const unlink = vi.spyOn(fs, 'unlinkSync');
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept.find((kept) => kept.folderPath === 'empty')?.reason).toBe('entries');
    expect(unlink).not.toHaveBeenCalled();
  });

  it('unlinks resource_entries.json last, after all other known files and right before rmdir', () => {
    const empty = writeFolderFiles(root(), 'empty', { entries: {}, meta: {} });
    for (const junk of PRUNABLE_OS_JUNK_FILES) fs.writeFileSync(join(empty, junk), 'junk');
    const operations: string[] = [];
    const unlink = fs.unlinkSync;
    const rmdir = fs.rmdirSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((file) => {
      operations.push(String(file));
      unlink(file);
    });
    vi.spyOn(fs, 'rmdirSync').mockImplementation((...args) => {
      operations.push(`rmdir:${String(args[0])}`);
      Reflect.apply(rmdir, fs, args);
    });
    expect(pruneEmptyFolders(collection()).removed).toEqual(['empty']);
    expect(operations.slice(-2)).toEqual([join(empty, 'resource_entries.json'), `rmdir:${empty}`]);
    expect(operations.slice(0, -2).sort()).toEqual(
      [...PRUNABLE_OS_JUNK_FILES, 'tracker_meta.json'].map((file) => join(empty, file)).sort(),
    );
  });

  it('rechecks entries immediately before their unlink if a writer runs during other file deletions', () => {
    const empty = writeFolderFiles(root(), 'empty', { entries: {}, meta: {} });
    const entriesPath = join(empty, 'resource_entries.json');
    const unlink = fs.unlinkSync;
    const deleted: string[] = [];
    vi.spyOn(fs, 'unlinkSync').mockImplementation((file) => {
      deleted.push(String(file));
      unlink(file);
      fs.writeFileSync(entriesPath, JSON.stringify({ first: { source: 'New' } }));
    });
    const result = pruneEmptyFolders(collection());
    expect(deleted).toEqual([join(empty, 'tracker_meta.json')]);
    expect(result.removed).toEqual([]);
    expect(result.kept.find((kept) => kept.folderPath === 'empty')?.reason).toBe('entries');
    expect(result.problems[0]?.message).toContain('Removed tracker_meta.json before removal failed');
    expect(JSON.parse(fs.readFileSync(entriesPath, 'utf8'))).toEqual({ first: { source: 'New' } });
  });

  it('reports the files already removed when a read-only parent prevents rmdir', ({ skip }) => {
    if (process.getuid?.() === 0) {
      skip();
      return;
    }
    const empty = writeFolderFiles(root(), 'parent.empty', { entries: {}, meta: {} });
    const parent = join(root(), 'parent');
    const mode = fs.statSync(parent).mode;
    fs.chmodSync(parent, 0o555);
    try {
      const result = pruneEmptyFolders(collection());
      expect(result.removed).toEqual([]);
      expect(result.kept.find((kept) => kept.folderPath === 'parent.empty')?.reason).toBe('problem');
      expect(result.problems[0]?.message).toContain(
        'Removed tracker_meta.json, resource_entries.json before removal failed',
      );
      expect(result.problems[0]?.message).toContain('EACCES');
      expect(fs.existsSync(empty)).toBe(true);
      expect(fs.readdirSync(empty)).toEqual([]);
    } finally {
      fs.chmodSync(parent, mode);
    }
  });

  it('keeps case variants of OS junk filenames because the allowlist match is exact', () => {
    const variants = ['.ds_store', 'THUMBS.DB', 'Desktop.ini'];
    for (const name of variants) stray('parent.variants', name);
    const result = pruneEmptyFolders(collection());
    expect(result.removed).toEqual([]);
    expect(result.kept).toContainEqual({
      folderPath: 'parent.variants',
      reason: 'content',
      entries: variants.map((name) => join('parent', 'variants', name)).sort(),
    });
    for (const name of variants)
      expect(fs.readFileSync(join(root(), 'parent', 'variants', name), 'utf8')).toBe('keep me');
  });
});
