import { computed, signal } from '@angular/core';
import type { BundleDryRunRequestDto, BundleDryRunResultDto } from '@simoncodes-ca/data-transfer';
import { bundleOutputFile } from '@simoncodes-ca/domain';
import { catchError, debounceTime, map, type Observable, of, type Subscription, startWith, switchMap, tap } from 'rxjs';
import { PATH_SEPARATORS, splitAfterSeparators } from '../../shared/utils/split-after-separators';
import { type BundleDraft, bundleDryRunRequest } from './bundle-draft';

interface OutputDraft {
  readonly dist: string;
  readonly bundleName: string;
  readonly typesEnabled: boolean;
  readonly typeDistFile: string;
}

export interface BundleOutputPreview {
  readonly outputSummary: string;
  readonly patternFiles: readonly string[];
  readonly typeFileName: string;
  readonly folders: readonly PreviewFolder[];
}

export interface PreviewFolder {
  readonly path: string;
  readonly pathParts: readonly string[];
  readonly files: readonly PreviewFile[];
}

export interface PreviewFile {
  readonly name: string;
  readonly nameParts: readonly string[];
  readonly kind: 'bundle' | 'types';
  readonly exists: boolean | undefined;
}

interface PreviewPath {
  path: string;
  kind: PreviewFile['kind'];
  exists: boolean | undefined;
}

export const LOCALE_PLACEHOLDER = '{locale}';

/** Projects draft output paths or an API plan into the dialog's file preview. */
export function bundleOutputPreview(input: {
  readonly draft: OutputDraft;
  readonly locales: readonly string[];
  readonly plan?: Pick<BundleDryRunResultDto, 'files'>;
}): BundleOutputPreview {
  const { draft, locales, plan } = input;
  return {
    outputSummary: outputSummary(draft),
    patternFiles: patternFiles(draft, locales),
    typeFileName: typeFileName(draft),
    folders: plan ? bundlePlannedOutputPreview(plan) : localTree(draft, locales),
  };
}

function outputSummary(draft: OutputDraft): string {
  if (!draft.dist.trim() && !draft.bundleName.trim()) return '';
  return bundleOutputFile({ dist: draft.dist.trim(), bundleName: draft.bundleName.trim() }, LOCALE_PLACEHOLDER);
}

function typeFileName(draft: OutputDraft): string {
  if (!draft.typesEnabled) return '';
  return draft.typeDistFile.trim().split('/').pop() ?? '';
}

function patternFiles(draft: OutputDraft, locales: readonly string[]): string[] {
  const bundleName = draft.bundleName.trim();
  if (!bundleName) return [];
  return locales.map((locale) => bundleOutputFile({ dist: '', bundleName }, locale));
}

function outputFiles(draft: OutputDraft, locales: readonly string[]): string[] {
  const bundleName = draft.bundleName.trim();
  if (!bundleName) return [];
  return locales.map((locale) => bundleOutputFile({ dist: draft.dist.trim(), bundleName }, locale));
}

function localTree(draft: OutputDraft, locales: readonly string[]): readonly PreviewFolder[] {
  const files: PreviewPath[] = outputFiles(draft, locales).map((path) => ({ path, kind: 'bundle', exists: undefined }));
  if (draft.typesEnabled && draft.typeDistFile.trim()) {
    files.push({ path: stripDotSlash(draft.typeDistFile.trim()), kind: 'types', exists: undefined });
  }
  return groupIntoFolders(files);
}

/** The API plan echoes configured type paths, so tidy those paths for the tree. */
function stripDotSlash(path: string): string {
  return path.replace(/^\.\//, '').replace(/\/+$/, '');
}

export function bundlePlannedOutputPreview(plan: Pick<BundleDryRunResultDto, 'files'>): readonly PreviewFolder[] {
  return groupIntoFolders(plan.files.map((file) => ({ ...file, path: stripDotSlash(file.path) })));
}

function groupIntoFolders(files: readonly PreviewPath[]): readonly PreviewFolder[] {
  const folders = new Map<string, PreviewFile[]>();
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    const folder = slash >= 0 ? file.path.slice(0, slash) : '';
    const name = slash >= 0 ? file.path.slice(slash + 1) : file.path;
    const list = folders.get(folder) ?? [];
    list.push({ name, nameParts: splitAfterSeparators(name, PATH_SEPARATORS), kind: file.kind, exists: file.exists });
    folders.set(folder, list);
  }
  return [...folders.entries()].map(([path, files]) => ({
    path,
    pathParts: splitAfterSeparators(path, PATH_SEPARATORS),
    files,
  }));
}

export type PreviewStatus = 'waiting' | 'loading' | 'ready' | 'error';

interface BundlePreviewOptions {
  draft: () => BundleDraft;
  locales: () => readonly string[];
  baseLocale: () => string;
  dryRun: (request: BundleDryRunRequestDto) => Observable<BundleDryRunResultDto>;
}

const TOKEN_SEPARATORS = /(?<=[._])/;

/** Preview projections and refresh lifecycle; the caller owns the returned subscription. */
export class BundlePreview {
  readonly #options: BundlePreviewOptions;
  readonly dryRun = signal<BundleDryRunResultDto | undefined>(undefined);
  readonly previewStatus = signal<PreviewStatus>('waiting');
  /** True from the first keystroke until the next dry run lands. */
  readonly previewStale = signal(false);

  readonly #localOutputPreview = computed(() =>
    bundleOutputPreview({ draft: this.#options.draft(), locales: this.#options.locales() }),
  );

  /** Rail summary under Output: `dist/pattern.json` (the placeholder kept), or nothing until one is typed. */
  readonly outputSummary = computed(() => this.#localOutputPreview().outputSummary);

  readonly typeFileName = computed(() => this.#localOutputPreview().typeFileName);

  /** The bundle file per project locale, relative to the output folder. */
  readonly patternFiles = computed(() => this.#localOutputPreview().patternFiles);

  /** Client-side tree from the form alone; used while waiting and when the dry run fails. */
  readonly localTree = computed(() => this.#localOutputPreview().folders);

  readonly previewTree = computed(() => {
    const result = this.dryRun();
    if (!result || this.previewStatus() === 'error') return this.localTree();
    return bundlePlannedOutputPreview(result);
  });

  readonly previewFileCount = computed(() =>
    this.previewTree().reduce((total, folder) => total + folder.files.length, 0),
  );

  /**
   * Bundled keys that are both a leaf and a parent (e.g. `buttons.ok` next to
   * `buttons.ok.label`). Generation throws on these, so the preview must show
   * them as an error rather than letting the bundle look ready to ship.
   */
  readonly hierarchicalConflicts = computed<readonly string[]>(() => {
    if (this.previewStatus() === 'error') return [];
    return this.dryRun()?.hierarchicalConflicts ?? [];
  });

  /** The colliding keys as one readable list for the preview error line. */
  readonly hierarchicalConflictList = computed(() => this.hierarchicalConflicts().join(', '));

  readonly keysPerLocale = computed(() => {
    const result = this.dryRun();
    if (!result) return undefined;
    const base = result.keysPerLocale[this.#options.baseLocale()];
    if (base !== undefined) return base;
    return Math.max(0, ...Object.values(result.keysPerLocale));
  });

  /** Example token path split after `.` and `_`, so it wraps between segments, never mid-identifier. */
  readonly tokenPathParts = computed<readonly string[]>(() => {
    const tokenPath = this.dryRun()?.exampleKey?.tokenPath;
    if (!tokenPath) return [];
    return tokenPath.split(TOKEN_SEPARATORS);
  });

  constructor(options: BundlePreviewOptions) {
    this.#options = options;
  }

  connect(changes: Observable<unknown>): Subscription {
    return changes
      .pipe(
        startWith(null),
        tap(() => this.previewStale.set(true)),
        debounceTime(300),
        map(() => bundleDryRunRequest(this.#options.draft())),
        switchMap((request) => {
          if (!request) {
            return of({ status: 'waiting' as const, result: undefined });
          }
          this.previewStatus.update((status) => (status === 'ready' ? status : 'loading'));
          return this.#options.dryRun(request).pipe(
            map((result) => ({ status: 'ready' as const, result })),
            catchError(() => of({ status: 'error' as const, result: undefined })),
          );
        }),
      )
      .subscribe(({ status, result }) => {
        this.previewStatus.set(status);
        if (status !== 'error') this.dryRun.set(result);
        this.previewStale.set(false);
      });
  }
}
