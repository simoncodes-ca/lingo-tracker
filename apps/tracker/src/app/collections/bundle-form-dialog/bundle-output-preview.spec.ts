import { signal } from '@angular/core';
import type { BundleDryRunResultDto } from '@simoncodes-ca/data-transfer';
import { of, Subject, Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toBundleDraft } from './bundle-draft';
import { BundlePreview, bundleOutputPreview, bundlePlannedOutputPreview } from './bundle-output-preview';

const draft = {
  dist: './dist/i18n',
  bundleName: 'admin.{locale}',
  typesEnabled: false,
  typeDistFile: '',
};
const locales = ['en', 'fr'];

describe('bundleOutputPreview', () => {
  it('previews bundle files at the root when dist is empty', () => {
    const preview = bundleOutputPreview({ draft: { ...draft, dist: '' }, locales: ['en'] });
    expect(preview.outputSummary).toBe('admin.{locale}.json');
    expect(preview.folders).toEqual([
      {
        path: '',
        pathParts: [],
        files: [{ name: 'admin.en.json', nameParts: ['admin.', 'en.', 'json'], kind: 'bundle', exists: undefined }],
      },
    ]);
  });

  it('returns no bundle files without a pattern', () => {
    const preview = bundleOutputPreview({ draft: { ...draft, dist: '', bundleName: ' ' }, locales });
    expect(preview).toEqual({ outputSummary: '', patternFiles: [], typeFileName: '', folders: [] });
  });

  it('strips dot slash and normalizes bundle output separators', () => {
    const preview = bundleOutputPreview({ draft: { ...draft, dist: ' ./dist//i18n/ ' }, locales: ['en'] });
    expect(preview.outputSummary).toBe('dist/i18n/admin.{locale}.json');
    expect(preview.folders[0]?.path).toBe('dist/i18n');
    expect(preview.folders[0]?.pathParts).toEqual(['dist/', 'i18n']);
  });

  it('adds a type file in a nested directory with wrapping segments', () => {
    const preview = bundleOutputPreview({
      draft: { ...draft, typesEnabled: true, typeDistFile: ' ./dist/types/admin_tokens-v2.ts ' },
      locales: ['en'],
    });
    expect(preview.typeFileName).toBe('admin_tokens-v2.ts');
    expect(preview.folders[1]).toEqual({
      path: 'dist/types',
      pathParts: ['dist/', 'types'],
      files: [
        {
          name: 'admin_tokens-v2.ts',
          nameParts: ['admin_', 'tokens-', 'v2.', 'ts'],
          kind: 'types',
          exists: undefined,
        },
      ],
    });
  });

  it('omits a hidden type path and a blank enabled type path', () => {
    for (const choices of [
      { typesEnabled: false, typeDistFile: './types.ts' },
      { typesEnabled: true, typeDistFile: ' ' },
    ]) {
      const preview = bundleOutputPreview({ draft: { ...draft, ...choices }, locales: [] });
      expect(preview.folders).toEqual([]);
      expect(preview.typeFileName).toBe('');
    }
  });

  it('uses echoed plan paths and preserves existing-file flags and order', () => {
    const plan = {
      files: [
        { path: './planned/admin.fr.json', kind: 'bundle' as const, exists: false, keysCount: 2, locale: 'fr' },
        { path: './planned/admin.en.json', kind: 'bundle' as const, exists: true, keysCount: 3, locale: 'en' },
        { path: './planned/types/admin.ts/', kind: 'types' as const, exists: true, keysCount: 3 },
      ],
    };
    const before = structuredClone(plan);
    const preview = bundleOutputPreview({ draft, locales, plan });
    expect(preview.folders.map((folder) => ({ path: folder.path, files: folder.files }))).toEqual([
      {
        path: 'planned',
        files: [
          { name: 'admin.fr.json', nameParts: ['admin.', 'fr.', 'json'], kind: 'bundle', exists: false },
          { name: 'admin.en.json', nameParts: ['admin.', 'en.', 'json'], kind: 'bundle', exists: true },
        ],
      },
      {
        path: 'planned/types',
        files: [{ name: 'admin.ts', nameParts: ['admin.', 'ts'], kind: 'types', exists: true }],
      },
    ]);
    expect(bundlePlannedOutputPreview(plan)).toEqual(preview.folders);
    expect(plan).toEqual(before);
    expect(preview.outputSummary).toBe('dist/i18n/admin.{locale}.json');
    expect(preview.patternFiles).toEqual(['admin.en.json', 'admin.fr.json']);
  });

  it('keeps an empty plan instead of falling back to draft paths', () => {
    expect(bundleOutputPreview({ draft, locales, plan: { files: [] } }).folders).toEqual([]);
  });

  it('projects a plan without draft values or locales', () => {
    expect(bundlePlannedOutputPreview({ files: [] })).toEqual([]);
  });

  it('expands multiple locales into nested folders in locale order', () => {
    const preview = bundleOutputPreview({ draft: { ...draft, bundleName: ' {locale}/admin ' }, locales });
    expect(preview.patternFiles).toEqual(['en/admin.json', 'fr/admin.json']);
    expect(
      preview.folders.map((folder) => ({ path: folder.path, names: folder.files.map((file) => file.name) })),
    ).toEqual([
      { path: 'dist/i18n/en', names: ['admin.json'] },
      { path: 'dist/i18n/fr', names: ['admin.json'] },
    ]);
  });
});

describe('BundlePreview with a fake dry run', () => {
  let subscriptions: Subscription;
  beforeEach(() => {
    vi.useFakeTimers();
    subscriptions = new Subscription();
  });
  afterEach(() => {
    subscriptions.unsubscribe();
    vi.useRealTimers();
  });

  const result: BundleDryRunResultDto = {
    name: 'main',
    locales: ['en', 'fr'],
    files: [{ path: 'dist/main.en.json', kind: 'bundle', locale: 'en', exists: true, keysCount: 12 }],
    keysPerLocale: { en: 12, fr: 10 },
    conflictsCount: 0,
    conflictKeys: [],
    hierarchicalConflicts: ['a.b'],
    warnings: [],
  };
  function setup(dryRun = vi.fn(() => new Subject<BundleDryRunResultDto>())) {
    const draft = signal({
      ...toBundleDraft({ dist: './dist', bundleName: 'main.{locale}', collections: 'All' }, []),
      name: 'main',
    });
    const locales = signal(['en']);
    const baseLocale = signal('en');
    const changes = new Subject<void>();
    const preview = new BundlePreview({ draft, locales, baseLocale, dryRun });
    subscriptions.add(preview.connect(changes));
    const edit = (dist: string) => {
      draft.update((value) => ({ ...value, dist }));
      changes.next();
    };
    return { preview, draft, locales, baseLocale, changes, edit, dryRun };
  }

  it('debounces edits, cancels at the next request, and releases in-flight work', () => {
    const first = new Subject<BundleDryRunResultDto>();
    const second = new Subject<BundleDryRunResultDto>();
    const dryRun = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { preview, edit } = setup(dryRun);
    expect(preview.previewStatus()).toBe('waiting');
    expect(preview.previewStale()).toBe(true);
    vi.advanceTimersByTime(200);
    edit('./other');
    vi.advanceTimersByTime(299);
    expect(dryRun).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dryRun).toHaveBeenCalledWith({
      name: 'main',
      bundle: { dist: './other', bundleName: 'main.{locale}', collections: 'All' },
    });
    expect(preview.previewStatus()).toBe('loading');
    edit('./latest');
    vi.advanceTimersByTime(299);
    expect(first.observed).toBe(true);
    vi.advanceTimersByTime(1);
    expect(first.observed).toBe(false);
    first.next(result);
    expect(preview.dryRun()).toBeUndefined();
    second.next(result);
    expect(preview.dryRun()).toBe(result);
    expect(preview.previewStatus()).toBe('ready');
    expect(preview.previewStale()).toBe(false);
    subscriptions.unsubscribe();
    expect(second.observed).toBe(false);
    edit('./ignored');
    vi.advanceTimersByTime(300);
    expect(dryRun).toHaveBeenCalledTimes(2);
  });

  it('retains ready output while stale, falls back after errors, and recovers', () => {
    const refresh = new Subject<BundleDryRunResultDto>();
    const recovery = new Subject<BundleDryRunResultDto>();
    const { preview, edit, locales, baseLocale } = setup(
      vi.fn().mockReturnValueOnce(of(result)).mockReturnValueOnce(refresh).mockReturnValueOnce(recovery),
    );
    vi.advanceTimersByTime(300);
    const tree = preview.previewTree();
    edit('./new');
    locales.set(['de']);
    expect(preview.previewTree()).toBe(tree);
    expect(preview.previewStale()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(preview.previewStatus()).toBe('ready');
    refresh.error(new Error('failed'));
    expect(preview.previewStatus()).toBe('error');
    expect(preview.previewStale()).toBe(false);
    expect(preview.dryRun()).toBe(result);
    expect(preview.previewTree()).toEqual(preview.localTree());
    expect(preview.hierarchicalConflicts()).toEqual([]);
    expect(preview.keysPerLocale()).toBe(12);
    baseLocale.set('fr');
    expect(preview.keysPerLocale()).toBe(10);
    baseLocale.set('missing');
    expect(preview.keysPerLocale()).toBe(12);
    edit('./recovered');
    vi.advanceTimersByTime(300);
    expect(preview.previewStatus()).toBe('loading');
    recovery.next(result);
    expect(preview.previewStatus()).toBe('ready');
    expect(preview.hierarchicalConflictList()).toBe('a.b');
    expect(preview.previewFileCount()).toBe(1);
  });

  it('clears the result after the gate closes and cancels pending debounce on disposal', () => {
    const { preview, edit, dryRun } = setup(vi.fn().mockReturnValue(of(result)));
    vi.advanceTimersByTime(300);
    edit(' ');
    expect(preview.dryRun()).toBe(result);
    expect(preview.previewStale()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(preview.previewStatus()).toBe('waiting');
    expect(preview.previewStale()).toBe(false);
    expect(preview.dryRun()).toBeUndefined();
    expect(dryRun).toHaveBeenCalledTimes(1);
    edit('./pending');
    subscriptions.unsubscribe();
    vi.advanceTimersByTime(300);
    expect(dryRun).toHaveBeenCalledTimes(1);
  });
});
