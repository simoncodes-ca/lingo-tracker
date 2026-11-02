import { computed, signal } from '@angular/core';
import { type AbstractControl, FormControl, FormGroup, type ValidationErrors } from '@angular/forms';
import type {
  ImportJobDto,
  ImportPlanDto,
  ImportRequestDto,
  ImportSourceFileDto,
  ImportSourceListingDto,
  ImportStrategyDto,
  LingoTrackerConfigDto,
} from '@simoncodes-ca/data-transfer';
import {
  IMPORT_UPLOAD_EXTENSIONS,
  IMPORT_UPLOAD_MAX_BYTES,
  IMPORT_UPLOAD_MAX_FILES,
} from '@simoncodes-ca/data-transfer';
import { canImportLocale, findCollectionEntry, importableLocales, inferImportLocale } from '@simoncodes-ca/domain';
import {
  catchError,
  EMPTY,
  finalize,
  map,
  merge,
  type Observable,
  of,
  Subject,
  Subscription,
  switchMap,
  takeUntil,
  timer,
} from 'rxjs';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { ApiError, apiErrorMessage } from '../../shared/api-error/api-error';
import type { StorageAdapter } from '../../shared/storage/keyed-storage';
import { detailsElseMessage } from '../store/form-submit-attempt';
import { JobStartAttempt } from '../store/form-submit-attempt-job';
import { resolveCollectionSettings } from '../store/collection-settings';
import type { ImportDialogData } from './import-dialog-data';
import {
  defaultDraft,
  fromImportRequest,
  type ImportDraft,
  type ImportFileChoice,
  persistDraft,
  readPersistedDraft,
  sharedDirectory,
  toImportRequest,
} from './import-draft';
import { ImportPreview } from './import-preview';

export type ImportSection = 'source' | 'strategy' | 'options';
export type ListingStatus = 'idle' | 'loading' | 'ready' | 'error';
export type UploadStatus = 'idle' | 'uploading' | 'error';

const BYTES_PER_MB = 1024 * 1024;
const TOO_MANY_REQUESTS = 429;

interface ParsedFolder {
  /** `''` for a project-relative path, `/` for a POSIX absolute one, `c:` for a Windows drive. */
  readonly root: string;
  readonly segments: readonly string[];
  /** Windows-style (drive letter or backslashes): compared without case. */
  readonly windows: boolean;
}

function parseFolder(folder: string): ParsedFolder {
  const trimmed = folder.trim();
  const windows = /^[a-zA-Z]:/.test(trimmed) || trimmed.includes('\\');
  let rest = trimmed.replace(/\\/g, '/');
  let root = '';
  const drive = /^([a-zA-Z]:)/.exec(rest);
  if (drive) {
    root = (drive[1] ?? '').toLowerCase();
    rest = rest.slice(2);
    if (rest.startsWith('/')) root += '/';
  } else if (rest.startsWith('/')) root = '/';
  const segments: string[] = [];
  for (const segment of rest.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length > 0 && segments[segments.length - 1] !== '..') segments.pop();
      else if (root === '') segments.push(segment);
    } else segments.push(segment);
  }
  return { root, segments, windows };
}

/** A folder path as the comparison sees it: separators, `.`/`..`, root kind, and case for Windows-style paths. */
export function normalizeFolderPath(folder: string): string {
  const { root, segments, windows } = parseFolder(folder);
  const path = `${root}${segments.join('/')}`;
  return windows ? path.toLowerCase() : path;
}

/**
 * Uploads land only in the collection's import folder or below it; the server stays the authority.
 * An absolute path is never inside a project-relative folder, and case only matters for POSIX-style paths.
 */
export function isUploadFolder(folder: string, importFolder: string): boolean {
  const target = parseFolder(folder);
  const base = parseFolder(importFolder);
  if (base.segments.length === 0 || target.root !== base.root) return false;
  const fold = (value: string) => (target.windows || base.windows ? value.toLowerCase() : value);
  return (
    target.segments.length >= base.segments.length &&
    base.segments.every((segment, index) => fold(segment) === fold(target.segments[index] ?? ''))
  );
}

const foldName = (name: string): string => name.normalize('NFC').toLowerCase();

/** Typing in the folder field relists after this pause; choosing a collection relists at once. */
export const FOLDER_DEBOUNCE_MS = 300;
const FALLBACK_IMPORT_FOLDER = 'dist/lingo-import';

/** Why a checked file cannot be imported as it stands, keyed to a validation message. */
export type FilesProblem = 'filesRequired' | 'duplicatePath' | 'localeRequired' | 'baseLocaleNeedsMigration';

export interface ImportFileRow {
  readonly file: ImportSourceFileDto;
  readonly checked: boolean;
  /** The locale in force: the user's choice, else the listing's inference, else empty. */
  readonly locale: string;
  readonly localeOptions: readonly string[];
  /** The row's locale is the base locale and the strategy cannot write it: the row cannot be checked. */
  readonly blocked: boolean;
  /** Checked without a locale, once errors are revealed. */
  readonly localeMissing: boolean;
  /** Inferred from the XLIFF target-language and still unchanged: the one provenance worth stating. */
  readonly fromTargetLanguage: boolean;
  /** Another checked row writes the same locale. */
  readonly sharedLocale: boolean;
}

interface FormControls {
  collection: FormControl<string>;
  folder: FormControl<string>;
  files: FormControl<ImportFileChoice[]>;
  strategy: FormControl<ImportStrategyDto>;
  createMissing: FormControl<boolean | undefined>;
  updateComments: FormControl<boolean | undefined>;
  updateTags: FormControl<boolean | undefined>;
  preserveStatus: FormControl<boolean>;
  validateBase: FormControl<boolean>;
}

export interface ImportFormOptions {
  data: ImportDialogData;
  translate: (key: string, params?: Record<string, unknown>) => string;
  config: () => LingoTrackerConfigDto | null;
  listSources: (collection: string, folder?: string) => Observable<ImportSourceListingDto>;
  dryRun: (request: ImportRequestDto) => Observable<ImportPlanDto>;
  uploadSources: (
    collection: string,
    files: readonly File[],
    options: { folder?: string; overwrite?: boolean },
  ) => Observable<ImportSourceListingDto>;
  storage?: () => StorageAdapter | undefined;
}

/** Typed import choices, the file listing, validation and submit state, independent of the dialog DOM. */
export class ImportForm {
  readonly form: FormGroup<FormControls>;
  readonly #changes = new Subscription();
  readonly #formTick = signal(Symbol());
  readonly #listRequests = new Subject<{ collection: string; folder: string; delay: number }>();
  readonly #relisted = new Subject<void>();
  readonly #listCancel = new Subject<void>();
  readonly #folders: Record<string, string>;
  readonly #localeChoices = signal<Readonly<Record<string, string>>>({});
  #lastListKey = '';

  readonly draft = computed(() => {
    this.#formTick();
    return this.form.getRawValue();
  });
  /** Form validity as a signal, so templates and computeds follow it. */
  readonly valid = computed(() => {
    this.#formTick();
    return this.form.valid;
  });
  readonly activeSection = signal<ImportSection>('source');
  readonly #attempt = new JobStartAttempt<ImportRequestDto>(() =>
    this.options.translate(TRACKER_TOKENS.IMPORT.TOAST.STARTFAILED),
  );
  readonly saving = this.#attempt.saving;
  readonly submitAttempted = this.#attempt.state.attempted;
  readonly submitErrors = this.#attempt.state.errors;
  readonly sections: readonly ImportSection[] = ['source', 'strategy', 'options'];

  readonly listing = signal<ImportSourceListingDto | undefined>(undefined);
  readonly listingStatus = signal<ListingStatus>('idle');
  /** Checked files that a relist found gone; cleared by the next choice the user makes. */
  readonly droppedCount = signal(0);

  readonly uploadStatus = signal<UploadStatus>('idle');
  readonly uploadingCount = signal(0);
  readonly uploadErrors = signal<readonly string[]>([]);
  /** The clashing upload with the destination it was sent to: Replace goes back there, never to the current folder. */
  readonly uploadClash = signal<
    { files: readonly File[]; names: readonly string[]; collection: string; folder: string } | undefined
  >(undefined);
  readonly uploadNotice = signal<{ uploaded: number; listed: number; checked: number } | undefined>(undefined);

  readonly collectionNames = computed(() => Object.keys(this.options.config()?.collections ?? {}));
  readonly settings = computed(() => {
    this.#formTick();
    const config = this.options.config();
    const name = this.form.controls.collection.value;
    return config && this.collectionNames().includes(name) ? resolveCollectionSettings(config, name) : undefined;
  });
  readonly readOnly = computed(() => this.settings()?.readOnly === true);
  /** The collection's configured import folder: the server's answer once listed, else the config's. */
  readonly defaultFolder = computed(() => {
    const listing = this.listing();
    return listing && listing.collection === this.draft().collection
      ? listing.defaultFolder
      : this.configuredFolder(this.draft().collection);
  });
  /** The folder the next upload would write to is the import folder or below it. */
  readonly uploadAllowed = computed(() => {
    const listing = this.listing();
    const draft = this.draft();
    const resolved =
      this.listingStatus() === 'ready' && listing?.collection === draft.collection ? listing.folder : undefined;
    return isUploadFolder(resolved ?? (draft.folder.trim() || this.defaultFolder()), this.defaultFolder());
  });
  readonly canUpload = computed(
    () =>
      !this.readOnly() &&
      !this.saving() &&
      this.uploadAllowed() &&
      this.uploadStatus() !== 'uploading' &&
      this.form.controls.collection.value !== '',
  );
  readonly folderIsCustom = computed(() => {
    const folder = this.draft().folder.trim();
    return folder !== '' && folder !== this.defaultFolder();
  });
  /** A checked file (e.g. from a retry) names a locale the collection no longer has. */
  readonly hasObsoleteLocale = computed(() => {
    this.#formTick();
    return this.form.controls.files.value.some((file) => file.locale !== '' && !this.isKnownLocale(file.locale));
  });
  readonly checkedCount = computed(() => this.draft().files.length);
  readonly problem = computed<FilesProblem | undefined>(() => {
    this.#formTick();
    return this.filesProblem();
  });
  readonly rows = computed<readonly ImportFileRow[]>(() => this.buildRows());
  readonly sectionErrors = computed<ReadonlySet<ImportSection>>(() => {
    this.#formTick();
    const errors = new Set<ImportSection>();
    const c = this.form.controls;
    const flag = (control: AbstractControl) => control.invalid && (control.touched || this.submitAttempted());
    if (flag(c.collection) || flag(c.files) || this.hasObsoleteLocale() || this.listingStatus() === 'error')
      errors.add('source');
    return errors;
  });
  readonly preview: ImportPreview;

  /** The folder the form was seeded with while the config may not have been loaded yet. */
  #seededFolder: string;

  constructor(private readonly options: ImportFormOptions) {
    const config = options.config();
    const { data } = options;
    const persisted = !data.request && options.storage ? readPersistedDraft(options.storage) : undefined;
    this.#folders = { ...persisted?.foldersByCollection };
    const draft: ImportDraft = data.request
      ? fromImportRequest(data.request)
      : {
          ...defaultDraft(),
          ...(persisted
            ? {
                strategy: persisted.strategy,
                createMissing: persisted.createMissing,
                updateComments: persisted.updateComments,
                updateTags: persisted.updateTags,
                preserveStatus: persisted.preserveStatus,
                validateBase: persisted.validateBase,
              }
            : {}),
          collection: data.preselectedCollection ?? this.initialCollection(config, persisted?.collection),
        };
    draft.folder = data.request
      ? (sharedDirectory(data.request.files.map((file) => file.path)) ?? this.folderFor(draft.collection))
      : this.folderFor(draft.collection);
    this.#seededFolder = draft.folder;
    const control = <T>(value: T) => new FormControl<T>(value, { nonNullable: true });
    this.form = new FormGroup<FormControls>({
      collection: control(draft.collection),
      folder: control(draft.folder),
      files: control(draft.files),
      strategy: control(draft.strategy),
      createMissing: control<boolean | undefined>(draft.createMissing),
      updateComments: control<boolean | undefined>(draft.updateComments),
      updateTags: control<boolean | undefined>(draft.updateTags),
      preserveStatus: control(draft.preserveStatus),
      validateBase: control(draft.validateBase),
    });
    const c = this.form.controls;
    c.collection.addValidators((): ValidationErrors | null => {
      if (!c.collection.value || !this.collectionNames().includes(c.collection.value))
        return { collectionRequired: true };
      return this.readOnly() ? { collectionReadOnly: true } : null;
    });
    c.files.addValidators((): ValidationErrors | null => {
      const problem = this.filesProblem();
      return problem ? { [problem]: true } : null;
    });
    this.#changes.add(
      this.form.valueChanges.subscribe(() => {
        this.refreshSelections();
        this.#attempt.state.clear();
        this.rememberFolder();
        // A Retry request is a one-off; it must not become the remembered draft.
        if (options.storage && !data.request) persistDraft(this.form.getRawValue(), this.#folders, options.storage);
      }),
    );
    this.#changes.add(this.form.events.subscribe(() => this.#formTick.set(Symbol())));
    this.#changes.add(
      c.collection.valueChanges.subscribe(() => {
        this.uploadClash.set(undefined);
        this.requestListing(0);
      }),
    );
    this.#changes.add(
      c.folder.valueChanges.subscribe(() => {
        this.uploadClash.set(undefined);
        this.requestListing(FOLDER_DEBOUNCE_MS);
      }),
    );
    this.#changes.add(this.listSubscription());
    this.refreshSelections();
    this.preview = new ImportPreview({
      request: () => (this.form.valid && this.listingStatus() === 'ready' ? this.buildRequest() : undefined),
      dryRun: options.dryRun,
      failureMessage: () => options.translate(TRACKER_TOKENS.IMPORT.DIALOG.PREVIEW.FAILED),
    });
    this.#changes.add(this.preview.connect(merge(this.form.valueChanges, this.#relisted)));
    this.requestListing(0);
  }

  /** The config arrived after the dialog opened: choose a collection if none is, and refresh what depends on it. */
  configLoaded(): void {
    const c = this.form.controls;
    if (!this.options.data.request && !this.options.data.preselectedCollection && !this.settings()) {
      const collection = this.initialCollection(this.options.config(), undefined);
      if (collection) c.collection.setValue(collection, { emitEvent: false });
    }
    const next = this.folderFor(c.collection.value);
    // A retry's folder comes from its files; the collection default must not replace it.
    if (
      !this.options.data.request &&
      !c.folder.dirty &&
      c.folder.value === this.#seededFolder &&
      next !== c.folder.value
    )
      c.folder.setValue(next, { emitEvent: false });
    this.#seededFolder = next;
    this.refreshSelections();
    this.requestListing(0, true);
    // Refreshing is silent, so emit once: the preview must re-run against the real config.
    this.form.updateValueAndValidity();
  }

  /** Choose the target collection: its remembered folder replaces the old one and the old files are dropped. */
  selectCollection(name: string): void {
    const c = this.form.controls;
    if (c.collection.value === name) return;
    c.collection.markAsTouched();
    this.droppedCount.set(0);
    this.#localeChoices.set({});
    c.files.setValue([], { emitEvent: false });
    c.folder.setValue(this.folderFor(name), { emitEvent: false });
    c.folder.markAsPristine();
    this.#seededFolder = '';
    c.collection.setValue(name);
  }

  resetFolder(): void {
    this.form.controls.folder.setValue(this.defaultFolder());
  }

  setStrategy(strategy: ImportStrategyDto): void {
    this.form.controls.strategy.setValue(strategy);
  }

  setOption(
    name: 'createMissing' | 'updateComments' | 'updateTags' | 'preserveStatus' | 'validateBase',
    value: boolean,
  ): void {
    this.form.controls[name].setValue(value);
  }

  /** Upload files into the listed folder, then apply the refreshed listing and check what arrived. */
  uploadFiles(files: readonly File[], overwrite = false): void {
    const { collection, folder } = this.form.getRawValue();
    this.startUpload(files, overwrite, collection, folder.trim());
  }

  /** Overwrite the files the server reported as clashing, in the destination they clashed in. */
  replaceClashing(): void {
    const clash = this.uploadClash();
    if (clash) this.startUpload(clash.files, true, clash.collection, clash.folder);
  }

  private startUpload(files: readonly File[], overwrite: boolean, collection: string, folder: string): void {
    if (this.readOnly() || this.saving() || this.uploadStatus() === 'uploading' || files.length === 0) return;
    this.uploadErrors.set([]);
    this.uploadClash.set(undefined);
    this.uploadNotice.set(undefined);
    this.droppedCount.set(0);
    const translate = this.options.translate;
    const source = TRACKER_TOKENS.IMPORT.DIALOG.SOURCE;
    const problems: string[] = [];
    if (files.length > IMPORT_UPLOAD_MAX_FILES)
      problems.push(translate(source.UPLOADTOOMANYX, { max: IMPORT_UPLOAD_MAX_FILES }));
    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (!IMPORT_UPLOAD_EXTENSIONS.some((extension) => lower.endsWith(extension)))
        problems.push(translate(source.UPLOADWRONGTYPEX, { file: file.name }));
      else if (file.size > IMPORT_UPLOAD_MAX_BYTES)
        problems.push(
          translate(source.UPLOADTOOLARGEX, { file: file.name, max: IMPORT_UPLOAD_MAX_BYTES / BYTES_PER_MB }),
        );
    }
    if (problems.length > 0) {
      this.uploadErrors.set(problems);
      this.uploadStatus.set('error');
      return;
    }
    const destination = { collection, folder };
    this.uploadingCount.set(files.length);
    this.uploadStatus.set('uploading');
    this.#changes.add(
      this.options
        .uploadSources(collection, files, { folder: folder || undefined, overwrite })
        .pipe(
          finalize(() => {
            if (this.uploadStatus() === 'uploading') this.uploadStatus.set('idle');
          }),
        )
        .subscribe({
          next: (listing) => {
            this.uploadStatus.set('idle');
            if (!this.isCurrentDestination(destination)) {
              this.requestListing(0, true);
              return;
            }
            // An older listing request must not resolve after this one and undo the checks.
            this.#listCancel.next();
            this.applyListing(listing);
            const { listed, checked } = this.checkUploaded(files);
            this.uploadNotice.set({ uploaded: files.length, listed, checked });
          },
          error: (error: unknown) => this.uploadFailed(error, files, destination),
        }),
    );
  }

  private isCurrentDestination(destination: { collection: string; folder: string }): boolean {
    const { collection, folder } = this.form.getRawValue();
    return destination.collection === collection && destination.folder === folder.trim();
  }

  dismissClash(): void {
    this.uploadClash.set(undefined);
  }

  retryListing(): void {
    this.requestListing(0, true);
  }

  /** Check or uncheck one listed file. A blocked row cannot be checked. */
  toggleFile(path: string, checked: boolean): void {
    const control = this.form.controls.files;
    const row = this.rows().find((candidate) => candidate.file.path === path);
    control.markAsTouched();
    this.droppedCount.set(0);
    const rest = control.value.filter((choice) => choice.path !== path);
    if (!checked) {
      control.setValue(rest);
      return;
    }
    if (!row || row.blocked || this.readOnly()) return;
    control.setValue(this.orderByListing([...rest, { path, locale: row.locale }]));
  }

  /** Check every listed file the strategy and the collection allow; or clear them all. */
  setAllFiles(checked: boolean): void {
    const control = this.form.controls.files;
    control.markAsTouched();
    this.droppedCount.set(0);
    if (!checked) {
      control.setValue([]);
      return;
    }
    if (this.readOnly()) return;
    const kept = control.value;
    const added = this.rows()
      .filter((row) => !row.checked && !row.blocked)
      .map((row) => ({ path: row.file.path, locale: row.locale }));
    control.setValue(this.orderByListing([...kept, ...added]));
  }

  setLocale(path: string, locale: string): void {
    const control = this.form.controls.files;
    this.#localeChoices.update((choices) => ({ ...choices, [path]: locale }));
    control.markAsTouched();
    if (control.value.some((choice) => choice.path === path))
      control.setValue(control.value.map((choice) => (choice.path === path ? { ...choice, locale } : choice)));
    else this.#formTick.set(Symbol());
  }

  /** Reconcile after the strategy, collection or config changed. */
  refreshSelections(): void {
    this.#formTick.set(Symbol());
    const c = this.form.controls;
    for (const field of [c.collection, c.files]) field.updateValueAndValidity({ emitEvent: false });
    this.#formTick.set(Symbol());
  }

  buildRequest(): ImportRequestDto {
    const draft = this.form.getRawValue();
    return toImportRequest({ ...draft, files: this.orderByListing(draft.files) });
  }

  retryPreview(): void {
    this.preview.refresh();
  }

  /** Show every error and move to the first section that has one. Returns whether the form is invalid. */
  revealErrors(): boolean {
    this.refreshSelections();
    if (this.#attempt.state.check(this.form)) return false;
    const first = this.sections.find((section) => this.sectionErrors().has(section));
    if (first) this.activeSection.set(first);
    return true;
  }

  submitResult(): ImportRequestDto | undefined {
    return this.revealErrors() ? undefined : this.buildRequest();
  }

  submit(start: (request: ImportRequestDto) => Observable<ImportJobDto>): Observable<ImportJobDto> {
    return this.#attempt.start(() => this.submitResult(), start);
  }

  destroy(): void {
    this.#changes.unsubscribe();
    this.#listRequests.complete();
    this.#listCancel.complete();
    this.#relisted.complete();
  }

  /** The first writable collection by name, as the dialog lists them; a remembered one wins while it is usable. */
  private initialCollection(config: LingoTrackerConfigDto | null, remembered: string | undefined): string {
    if (!config) return remembered ?? '';
    const usable = (name: string) => !resolveCollectionSettings(config, name).readOnly;
    const names = Object.keys(config.collections ?? {});
    if (remembered && names.includes(remembered) && usable(remembered)) return remembered;
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).find(usable) ?? '';
  }

  private configuredFolder(collection: string): string {
    const config = this.options.config();
    return (
      findCollectionEntry(config?.collections, collection)?.importFolder?.trim() ||
      config?.importFolder?.trim() ||
      FALLBACK_IMPORT_FOLDER
    );
  }

  private folderFor(collection: string): string {
    return this.#folders[collection] ?? this.configuredFolder(collection);
  }

  private rememberFolder(): void {
    const { collection, folder } = this.form.getRawValue();
    if (!collection) return;
    const trimmed = folder.trim();
    if (trimmed && trimmed !== this.configuredFolder(collection)) this.#folders[collection] = trimmed;
    else delete this.#folders[collection];
  }

  /** Checked files in the order the list shows them, which is the order the import applies them. */
  private orderByListing(files: ImportFileChoice[]): ImportFileChoice[] {
    const position = new Map((this.listing()?.files ?? []).map((file, index) => [file.path, index]));
    const at = (choice: ImportFileChoice) => position.get(choice.path) ?? Number.MAX_SAFE_INTEGER;
    return [...files].sort((a, b) => at(a) - at(b));
  }

  /** A locale the collection knows: configured, or its base. Unknown until the config is loaded. */
  private isKnownLocale(locale: string): boolean {
    const settings = this.settings();
    return !settings || locale === settings.baseLocale || settings.locales.includes(locale);
  }

  private filesProblem(): FilesProblem | undefined {
    const { files, strategy, collection } = this.form.getRawValue();
    if (files.length === 0) return 'filesRequired';
    if (new Set(files.map((file) => file.path)).size !== files.length) return 'duplicatePath';
    if (files.some((file) => !file.locale || !this.isKnownLocale(file.locale))) return 'localeRequired';
    const baseLocale = this.settings()?.baseLocale;
    if (collection && baseLocale && files.some((file) => !canImportLocale(file.locale, baseLocale, strategy)))
      return 'baseLocaleNeedsMigration';
    return undefined;
  }

  private buildRows(): readonly ImportFileRow[] {
    this.#formTick();
    const listing = this.listing();
    if (this.listingStatus() !== 'ready' || !listing) return [];
    const { files, strategy } = this.form.getRawValue();
    const settings = this.settings();
    const baseLocale = settings?.baseLocale;
    const choices = this.#localeChoices();
    const options = settings
      ? importableLocales([...new Set([...settings.locales, settings.baseLocale])], settings.baseLocale, strategy)
      : [];
    const knownLocales = settings ? [...new Set([...settings.locales, settings.baseLocale])] : [];
    const revealed = this.submitAttempted() || this.form.controls.files.touched;
    const locales = new Map<string, number>();
    for (const choice of files) {
      if (this.isKnownLocale(choice.locale)) locales.set(choice.locale, (locales.get(choice.locale) ?? 0) + 1);
    }
    return listing.files.map((file) => {
      const choice = files.find((candidate) => candidate.path === file.path);
      const wanted = choice?.locale ?? choices[file.path] ?? file.locale ?? '';
      // A locale the collection no longer has counts as none: the row asks for a new one.
      const obsolete = wanted !== '' && !this.isKnownLocale(wanted);
      const locale = obsolete ? '' : wanted;
      const checked = choice !== undefined;
      return {
        file,
        checked,
        locale,
        localeOptions: locale && locale === baseLocale && !options.includes(locale) ? [...options, locale] : options,
        blocked: !!baseLocale && locale === baseLocale && !canImportLocale(locale, baseLocale, strategy),
        localeMissing: checked && !locale && (revealed || obsolete),
        // Worth stating only when the file name would not have given the same locale.
        fromTargetLanguage:
          file.localeSource === 'xliff-target-language' &&
          locale === file.locale &&
          inferImportLocale(file.name, knownLocales)?.locale !== file.locale,
        sharedLocale: checked && locale !== '' && (locales.get(locale) ?? 0) > 1,
      };
    });
  }

  /** Relist when the (collection, folder) key changed, or on demand. Stale responses are dropped by switchMap. */
  private listKey(): string {
    const { collection, folder } = this.form.getRawValue();
    return `${collection}\n${folder.trim()}`;
  }

  /**
   * Check the rows for the uploaded names (not blocked ones). `listed` counts uploaded files that
   * appear in the list; `checked` counts those that are checked now, newly or already.
   */
  private checkUploaded(files: readonly File[]): { listed: number; checked: number } {
    const names = new Set(files.map((file) => foldName(file.name)));
    const rows = this.rows().filter((row) => names.has(foldName(row.file.name)));
    const control = this.form.controls.files;
    const added = rows
      .filter((row) => !row.blocked && !row.checked)
      .map((row) => ({ path: row.file.path, locale: row.locale }));
    control.markAsTouched();
    if (added.length > 0) control.setValue(this.orderByListing([...control.value, ...added]));
    const checkedPaths = new Set(control.value.map((choice) => choice.path));
    return { listed: rows.length, checked: rows.filter((row) => checkedPaths.has(row.file.path)).length };
  }

  private uploadFailed(
    error: unknown,
    files: readonly File[],
    destination: { collection: string; folder: string },
  ): void {
    if (!this.isCurrentDestination(destination)) {
      // The user moved on: nothing here concerns the folder now on screen, except that the folder may have changed.
      this.uploadStatus.set('idle');
      this.requestListing(0, true);
      return;
    }
    if (error instanceof ApiError && error.kind === 'conflict') {
      const names = error.details.filter((item): item is string => typeof item === 'string');
      this.uploadClash.set({ files, names, ...destination });
      this.uploadStatus.set('idle');
      return;
    }
    const fallback = this.options.translate(
      error instanceof ApiError && error.status === TOO_MANY_REQUESTS
        ? TRACKER_TOKENS.IMPORT.DIALOG.SOURCE.UPLOADBUSY
        : TRACKER_TOKENS.IMPORT.DIALOG.SOURCE.UPLOADFAILED,
    );
    this.uploadErrors.set(
      error instanceof ApiError && error.status === TOO_MANY_REQUESTS
        ? [fallback]
        : detailsElseMessage({
            kind: 'message',
            details: error instanceof ApiError ? error.details : [],
            message: apiErrorMessage(error, fallback),
          }),
    );
    this.uploadStatus.set('error');
    // A partial write may have changed the folder: the relist shows whatever landed.
    this.requestListing(0, true);
  }

  private applyListing(listing: ImportSourceListingDto): void {
    this.listing.set(listing);
    this.listingStatus.set('ready');
    this.reconcile(listing);
    this.refreshSelections();
    this.#relisted.next();
  }

  private requestListing(delay: number, force = false): void {
    const { collection, folder } = this.form.getRawValue();
    const key = this.listKey();
    if (!force && key === this.#lastListKey) return;
    this.#lastListKey = key;
    this.#listRequests.next({ collection, folder: folder.trim(), delay });
  }

  private listSubscription(): Subscription {
    return this.#listRequests
      .pipe(
        switchMap((request) => {
          if (!request.collection) {
            this.listing.set(undefined);
            this.listingStatus.set('idle');
            return EMPTY;
          }
          this.listingStatus.set('loading');
          return timer(request.delay).pipe(
            switchMap(() => this.options.listSources(request.collection, request.folder || undefined)),
            map((listing) => ({ listing })),
            catchError(() => of({ listing: undefined })),
            takeUntil(this.#listCancel),
          );
        }),
      )
      .subscribe(({ listing }) => {
        this.listing.set(listing);
        this.listingStatus.set(listing ? 'ready' : 'error');
        if (listing) this.reconcile(listing);
        this.refreshSelections();
        this.#relisted.next();
      });
  }

  /** Keep checked rows whose path survived (with the user's locale); drop the rest. */
  private reconcile(listing: ImportSourceListingDto): void {
    const control = this.form.controls.files;
    const present = new Set(listing.files.map((file) => file.path));
    const kept = control.value.filter((choice) => present.has(choice.path));
    this.droppedCount.set(control.value.length - kept.length);
    this.#localeChoices.update((choices) =>
      Object.fromEntries(Object.entries(choices).filter(([path]) => present.has(path))),
    );
    if (kept.length !== control.value.length) control.setValue(kept, { emitEvent: false });
  }
}
