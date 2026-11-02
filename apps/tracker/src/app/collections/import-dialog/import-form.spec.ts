import type {
  ImportJobDto,
  ImportPlanDto,
  ImportSourceFileDto,
  ImportSourceListingDto,
  LingoTrackerConfigDto,
} from '@simoncodes-ca/data-transfer';
import { EMPTY, NEVER, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api-error/api-error';
import { MemoryStorageAdapter } from '../../shared/storage/keyed-storage';
import { defaultDraft, persistDraft } from './import-draft';
import {
  FOLDER_DEBOUNCE_MS,
  ImportForm,
  type ImportFormOptions,
  isUploadFolder,
  normalizeFolderPath,
} from './import-form';

const config: LingoTrackerConfigDto = {
  exportFolder: 'out',
  importFolder: 'in',
  baseLocale: 'en',
  locales: ['en', 'es', 'fr'],
  collections: {
    main: { translationsFolder: 'main' },
    locked: { translationsFolder: 'locked', readOnly: true },
    other: { translationsFolder: 'other', importFolder: 'other-in', locales: ['en', 'de'] },
  },
};

const file = (name: string, overrides: Partial<ImportSourceFileDto> = {}): ImportSourceFileDto => ({
  path: `in/${name}`,
  name,
  format: name.endsWith('.json') ? 'json' : 'xliff',
  sizeBytes: 2048,
  modifiedAt: '2026-10-19T16:45:00.000Z',
  ...overrides,
});

const listing = (
  files: readonly ImportSourceFileDto[],
  overrides: Partial<ImportSourceListingDto> = {},
): ImportSourceListingDto => ({
  collection: 'main',
  folder: 'in',
  defaultFolder: 'in',
  exists: true,
  files,
  ...overrides,
});

const FILES = [
  file('es.xliff', { locale: 'es', localeSource: 'xliff-target-language' }),
  file('fr.xliff', { locale: 'fr', localeSource: 'file-name' }),
  file('en.json', { locale: 'en', localeSource: 'file-name', localeProblem: 'base-locale' }),
  file('notes.json'),
];

const models: ImportForm[] = [];
function build(options: Partial<ImportFormOptions> = {}) {
  const listSources = vi.fn(() => of(listing(FILES)));
  const model = new ImportForm({
    translate: (key) => key,
    data: {},
    config: () => config,
    listSources,
    dryRun: () => EMPTY,
    uploadSources: () => EMPTY,
    ...options,
  });
  models.push(model);
  return { model, listSources };
}

/** Let the listing's own request run, then the preview debounce. */
const settle = (): void => {
  vi.advanceTimersByTime(FOLDER_DEBOUNCE_MS);
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const model of models) model.destroy();
  models.length = 0;
  vi.useRealTimers();
});

describe('ImportForm', () => {
  describe('seeding', () => {
    it('opens on Source with the first writable collection and its configured folder', () => {
      const { model } = build();
      expect(model.activeSection()).toBe('source');
      expect(model.draft().collection).toBe('main');
      expect(model.draft().folder).toBe('in');
    });

    it('prefers a preselected collection and its own import folder', () => {
      const { model } = build({ data: { preselectedCollection: 'other' } });
      expect(model.draft().collection).toBe('other');
      expect(model.draft().folder).toBe('other-in');
    });

    it('restores the remembered strategy, options, collection and per-collection folder', () => {
      const adapter = new MemoryStorageAdapter();
      persistDraft(
        { ...defaultDraft(), collection: 'other', strategy: 'migration', updateTags: false },
        { other: 'custom' },
        () => adapter,
      );
      const { model } = build({ storage: () => adapter });
      expect(model.draft()).toMatchObject({
        collection: 'other',
        folder: 'custom',
        strategy: 'migration',
        updateTags: false,
        files: [],
      });
    });

    it('chooses a collection once the config arrives', () => {
      let current: LingoTrackerConfigDto | null = null;
      const { model } = build({ config: () => current });
      expect(model.draft().collection).toBe('');
      current = config;
      model.configLoaded();
      expect(model.draft().collection).toBe('main');
      expect(model.draft().folder).toBe('in');
    });

    it('keeps a retry folder when the config arrives after the dialog opened', () => {
      let current: LingoTrackerConfigDto | null = null;
      const { model } = build({
        config: () => current,
        data: { request: { collection: 'main', files: [{ path: 'drop/a.xliff', locale: 'fr' }] } },
      });
      current = config;
      model.configLoaded();
      expect(model.draft().folder).toBe('drop');
    });

    it('prefills a retry from its request: folder from the files, strategy, options and checked rows', () => {
      const { model } = build({
        data: {
          request: {
            collection: 'main',
            files: [
              { path: 'drop/a.xliff', locale: 'fr' },
              { path: 'drop/b.json', locale: 'es' },
            ],
            strategy: 'migration',
            updateTags: false,
          },
        },
      });
      expect(model.draft()).toMatchObject({
        collection: 'main',
        folder: 'drop',
        strategy: 'migration',
        updateTags: false,
        files: [
          { path: 'drop/a.xliff', locale: 'fr' },
          { path: 'drop/b.json', locale: 'es' },
        ],
      });
    });

    it('falls back to the collection folder when a retry spans folders', () => {
      const { model } = build({
        data: {
          request: {
            collection: 'other',
            files: [
              { path: 'a/x.xliff', locale: 'de' },
              { path: 'b/y.xliff', locale: 'de' },
            ],
          },
        },
      });
      expect(model.draft().folder).toBe('other-in');
    });

    it('does not remember a retry request', () => {
      const adapter = new MemoryStorageAdapter();
      const { model } = build({
        storage: () => adapter,
        data: { request: { collection: 'main', files: [{ path: 'in/es.xliff', locale: 'es' }], strategy: 'update' } },
      });
      model.setStrategy('verification');
      expect(adapter.getItem('lingo-tracker.importDraft')).toBeNull();
    });
  });

  describe('listing', () => {
    it('lists the collection folder at once and prefills nothing in the draft', () => {
      const { model, listSources } = build();
      expect(model.listingStatus()).toBe('loading');
      settle();
      expect(listSources).toHaveBeenCalledWith('main', 'in');
      expect(model.listingStatus()).toBe('ready');
      expect(model.draft().files).toEqual([]);
    });

    it('prefills each row locale from the inference, leaving an uninferred row empty', () => {
      const { model } = build();
      settle();
      expect(model.rows().map((row) => [row.file.name, row.locale])).toEqual([
        ['es.xliff', 'es'],
        ['fr.xliff', 'fr'],
        ['en.json', 'en'],
        ['notes.json', ''],
      ]);
    });

    it('debounces folder edits by 300 ms and sends the trimmed value', () => {
      const { model, listSources } = build();
      settle();
      listSources.mockClear();
      model.form.controls.folder.setValue('x');
      model.form.controls.folder.setValue('xy ');
      vi.advanceTimersByTime(FOLDER_DEBOUNCE_MS - 1);
      expect(listSources).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(listSources).toHaveBeenCalledTimes(1);
      expect(listSources).toHaveBeenCalledWith('main', 'xy');
    });

    it('asks the server for its default when the folder is emptied', () => {
      const { model, listSources } = build();
      settle();
      model.form.controls.folder.setValue('');
      settle();
      expect(listSources).toHaveBeenLastCalledWith('main', undefined);
    });

    it('relists immediately when the collection changes, with that collection folder', () => {
      const { model, listSources } = build();
      settle();
      model.selectCollection('other');
      vi.advanceTimersByTime(0);
      expect(listSources).toHaveBeenLastCalledWith('other', 'other-in');
      expect(model.draft().folder).toBe('other-in');
    });

    it('keeps the result of the latest key when an older response arrives late', () => {
      const first = new Subject<ImportSourceListingDto>();
      const second = new Subject<ImportSourceListingDto>();
      const listSources = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
      const { model } = build({ listSources });
      vi.advanceTimersByTime(0);
      model.form.controls.folder.setValue('next');
      settle();
      second.next(listing([file('fr.xliff', { locale: 'fr' })], { folder: 'next' }));
      first.next(listing([file('es.xliff', { locale: 'es' })]));
      expect(model.rows().map((row) => row.file.name)).toEqual(['fr.xliff']);
    });

    it('reports a failed listing and recovers on retry', () => {
      const listSources = vi
        .fn()
        .mockReturnValueOnce(throwError(() => new Error('down')))
        .mockReturnValue(of(listing(FILES)));
      const { model } = build({ listSources });
      settle();
      expect(model.listingStatus()).toBe('error');
      expect(model.sectionErrors().has('source')).toBe(true);
      model.retryListing();
      settle();
      expect(model.listingStatus()).toBe('ready');
    });

    it('offers Reset to default only for a custom folder, using the server default', () => {
      const { model } = build();
      settle();
      expect(model.folderIsCustom()).toBe(false);
      model.form.controls.folder.setValue('elsewhere');
      expect(model.folderIsCustom()).toBe(true);
      model.resetFolder();
      expect(model.draft().folder).toBe('in');
      expect(model.folderIsCustom()).toBe(false);
    });

    it('remembers a custom folder per collection and forgets it when reset', () => {
      const adapter = new MemoryStorageAdapter();
      const { model } = build({ storage: () => adapter });
      model.form.controls.folder.setValue('custom');
      expect(JSON.parse(adapter.getItem('lingo-tracker.importDraft') ?? '{}').foldersByCollection).toEqual({
        main: 'custom',
      });
      model.resetFolder();
      expect(JSON.parse(adapter.getItem('lingo-tracker.importDraft') ?? '{}').foldersByCollection).toEqual({});
    });
  });

  describe('file selection and reconciliation', () => {
    it('keeps checked rows whose path survives a relist, with the locale the user chose', () => {
      const { model } = build();
      settle();
      model.toggleFile('in/es.xliff', true);
      model.toggleFile('in/notes.json', true);
      model.setLocale('in/notes.json', 'fr');
      expect(model.draft().files).toEqual([
        { path: 'in/es.xliff', locale: 'es' },
        { path: 'in/notes.json', locale: 'fr' },
      ]);
      model.setLocale('in/es.xliff', 'fr');
      model.retryListing();
      settle();
      expect(model.draft().files).toEqual([
        { path: 'in/es.xliff', locale: 'fr' },
        { path: 'in/notes.json', locale: 'fr' },
      ]);
      expect(model.droppedCount()).toBe(0);
    });

    it('drops checked rows that vanished, with a count for the hint', () => {
      const listSources = vi
        .fn()
        .mockReturnValueOnce(of(listing(FILES)))
        .mockReturnValue(of(listing([FILES[0] as ImportSourceFileDto])));
      const { model } = build({ listSources });
      settle();
      model.toggleFile('in/es.xliff', true);
      model.toggleFile('in/fr.xliff', true);
      model.retryListing();
      settle();
      expect(model.draft().files.map((choice) => choice.path)).toEqual(['in/es.xliff']);
      expect(model.droppedCount()).toBe(1);
      model.toggleFile('in/es.xliff', false);
      expect(model.droppedCount()).toBe(0);
    });

    it('clears the checked files when another collection is chosen', () => {
      const { model } = build();
      settle();
      model.toggleFile('in/es.xliff', true);
      model.selectCollection('other');
      expect(model.draft().files).toEqual([]);
    });

    it('selects every row the strategy allows, and clears them', () => {
      const { model } = build();
      settle();
      model.setAllFiles(true);
      // The base-locale row is blocked and the uninferred row has no locale yet.
      expect(model.draft().files.map((choice) => choice.path)).toEqual(['in/es.xliff', 'in/fr.xliff', 'in/notes.json']);
      model.setAllFiles(false);
      expect(model.draft().files).toEqual([]);
    });

    it('flags two checked rows that write the same locale', () => {
      const { model } = build();
      settle();
      model.toggleFile('in/es.xliff', true);
      model.toggleFile('in/notes.json', true);
      model.setLocale('in/notes.json', 'es');
      expect(
        model
          .rows()
          .filter((row) => row.sharedLocale)
          .map((row) => row.file.name),
      ).toEqual(['es.xliff', 'notes.json']);
    });

    it('stays quiet when the file name gives the same locale as the target-language', () => {
      const { model } = build();
      settle();
      expect(model.rows().map((row) => row.fromTargetLanguage)).toEqual([false, false, false, false]);
    });

    it('states provenance when the name gives no locale or a different one, until the user changes it', () => {
      const vendor = [
        file('batch.xliff', { locale: 'es', localeSource: 'xliff-target-language' }),
        file('fr.xliff', { locale: 'es', localeSource: 'xliff-target-language' }),
      ];
      const { model } = build({ listSources: vi.fn(() => of(listing(vendor))) });
      settle();
      expect(model.rows().map((row) => row.fromTargetLanguage)).toEqual([true, true]);
      model.setLocale('in/batch.xliff', 'fr');
      expect(model.rows()[0]?.fromTargetLanguage).toBe(false);
    });
  });

  describe('request order', () => {
    it('orders the request by the list, not by the order the files were checked', () => {
      const { model } = build();
      settle();
      model.toggleFile('in/fr.xliff', true);
      model.toggleFile('in/es.xliff', true);
      expect(model.draft().files.map((choice) => choice.path)).toEqual(['in/es.xliff', 'in/fr.xliff']);
      expect(model.buildRequest().files.map((choice) => choice.path)).toEqual(['in/es.xliff', 'in/fr.xliff']);
    });

    it('keeps list order when a file is unchecked and checked again', () => {
      const { model } = build();
      settle();
      model.setAllFiles(true);
      model.toggleFile('in/es.xliff', false);
      model.toggleFile('in/es.xliff', true);
      expect(model.buildRequest().files.map((choice) => choice.path)).toEqual([
        'in/es.xliff',
        'in/fr.xliff',
        'in/notes.json',
      ]);
    });
  });

  describe('locales the collection no longer has', () => {
    const retry = () =>
      build({
        data: {
          request: {
            collection: 'main',
            files: [
              { path: 'in/es.xliff', locale: 'es' },
              { path: 'in/fr.xliff', locale: 'de' },
            ],
          },
        },
      });

    it('treats an unconfigured locale on a checked file as no locale', () => {
      const { model } = retry();
      settle();
      expect(model.form.controls.files.hasError('localeRequired')).toBe(true);
      expect(model.valid()).toBe(false);
      expect(model.hasObsoleteLocale()).toBe(true);
      expect(model.sectionErrors().has('source')).toBe(true);
      const row = model.rows().find((candidate) => candidate.file.name === 'fr.xliff');
      expect(row?.locale).toBe('');
      expect(row?.localeMissing).toBe(true);
      expect(row?.localeOptions).toEqual(['es', 'fr']);
    });

    it('is submittable again once a configured locale is chosen', () => {
      const { model } = retry();
      settle();
      model.setLocale('in/fr.xliff', 'fr');
      expect(model.valid()).toBe(true);
      expect(model.hasObsoleteLocale()).toBe(false);
    });
  });

  describe('base-locale gating', () => {
    it('blocks the base-locale row until the strategy is migration', () => {
      const { model } = build();
      settle();
      const base = () => model.rows().find((row) => row.file.name === 'en.json');
      expect(base()?.blocked).toBe(true);
      model.toggleFile('in/en.json', true);
      expect(model.draft().files).toEqual([]);
      model.setStrategy('migration');
      expect(base()?.blocked).toBe(false);
      model.toggleFile('in/en.json', true);
      expect(model.draft().files).toEqual([{ path: 'in/en.json', locale: 'en' }]);
      expect(model.form.controls.files.valid).toBe(true);
    });

    it('offers the base locale as a choice only under migration', () => {
      const { model } = build();
      settle();
      const choices = () => model.rows().find((row) => row.file.name === 'notes.json')?.localeOptions;
      expect(choices()).toEqual(['es', 'fr']);
      model.setStrategy('migration');
      expect(choices()).toEqual(['en', 'es', 'fr']);
    });

    it('invalidates a checked base-locale file when the strategy leaves migration', () => {
      const { model } = build();
      settle();
      model.setStrategy('migration');
      model.toggleFile('in/en.json', true);
      model.setStrategy('update');
      expect(model.form.controls.files.hasError('baseLocaleNeedsMigration')).toBe(true);
      expect(model.problem()).toBe('baseLocaleNeedsMigration');
      expect(model.valid()).toBe(false);
    });
  });

  describe('validators', () => {
    it('requires a collection that exists', () => {
      const { model } = build({ data: { preselectedCollection: 'missing' } });
      expect(model.form.controls.collection.hasError('collectionRequired')).toBe(true);
    });

    it('refuses a read-only collection', () => {
      const { model } = build({ data: { preselectedCollection: 'locked' } });
      expect(model.readOnly()).toBe(true);
      expect(model.form.controls.collection.hasError('collectionReadOnly')).toBe(true);
      expect(model.valid()).toBe(false);
    });

    it('requires at least one file', () => {
      const { model } = build();
      settle();
      expect(model.form.controls.files.hasError('filesRequired')).toBe(true);
    });

    it('requires a locale on every checked file', () => {
      const { model } = build();
      settle();
      model.toggleFile('in/notes.json', true);
      expect(model.form.controls.files.hasError('localeRequired')).toBe(true);
      model.setLocale('in/notes.json', 'fr');
      expect(model.form.controls.files.valid).toBe(true);
    });

    it('rejects the same path twice', () => {
      const { model } = build({
        data: {
          request: {
            collection: 'main',
            files: [
              { path: 'in/es.xliff', locale: 'es' },
              { path: 'in/es.xliff', locale: 'fr' },
            ],
          },
        },
      });
      expect(model.form.controls.files.hasError('duplicatePath')).toBe(true);
    });

    it('shows section errors only after they are revealed, then jumps to the Source section', () => {
      const { model } = build();
      settle();
      model.activeSection.set('options');
      expect(model.sectionErrors().has('source')).toBe(false);
      expect(model.revealErrors()).toBe(true);
      expect(model.sectionErrors().has('source')).toBe(true);
      expect(model.activeSection()).toBe('source');
    });

    it('refuses to check a file in a read-only collection', () => {
      const { model } = build({ data: { preselectedCollection: 'locked' } });
      settle();
      model.toggleFile('in/es.xliff', true);
      expect(model.draft().files).toEqual([]);
    });
  });

  describe('preview and submit', () => {
    const plan = {} as ImportPlanDto;

    it('runs the dry run only for a valid form with a resolved listing', () => {
      const dryRun = vi.fn(() => of(plan));
      const { model } = build({ dryRun });
      settle();
      vi.advanceTimersByTime(FOLDER_DEBOUNCE_MS);
      expect(dryRun).not.toHaveBeenCalled();
      model.toggleFile('in/es.xliff', true);
      vi.advanceTimersByTime(FOLDER_DEBOUNCE_MS);
      expect(dryRun).toHaveBeenCalledWith({
        collection: 'main',
        files: [{ path: 'in/es.xliff', locale: 'es' }],
        strategy: 'translation-service',
      });
      expect(model.preview.plan()).toBe(plan);
    });

    it('does not start without a valid form', () => {
      const start = vi.fn();
      const { model } = build();
      settle();
      model.submit(start).subscribe();
      expect(start).not.toHaveBeenCalled();
      expect(model.submitAttempted()).toBe(true);
    });

    it('starts the minimal request and clears the saving flag', () => {
      const job = { jobId: 'j' } as ImportJobDto;
      const start = vi.fn(() => of(job));
      const { model } = build();
      settle();
      model.toggleFile('in/es.xliff', true);
      const results: ImportJobDto[] = [];
      model.submit(start).subscribe((value) => results.push(value));
      expect(start).toHaveBeenCalledWith({
        collection: 'main',
        files: [{ path: 'in/es.xliff', locale: 'es' }],
        strategy: 'translation-service',
      });
      expect(results).toEqual([job]);
      expect(model.saving()).toBe(false);
    });

    it('shows the server details when the start request fails', () => {
      const { model } = build();
      settle();
      model.toggleFile('in/es.xliff', true);
      const error = new ApiError({ kind: 'invalid', status: 400, details: ['File "x" is not importable.'] });
      model.submit(() => throwError(() => error)).subscribe({ error: () => undefined });
      expect(model.submitErrors()).toEqual(['File "x" is not importable.']);
      model.form.controls.strategy.setValue('update');
      expect(model.submitErrors()).toEqual([]);
    });
  });
  describe('upload', () => {
    const upload = (name: string, size = 10) => {
      const file = new File(['x'], name);
      Object.defineProperty(file, 'size', { value: size });
      return file;
    };
    const uploaded = listing([...FILES, file('vendor.xliff', { locale: 'es', localeSource: 'xliff-target-language' })]);

    it('pre-checks count, type and size without a request', () => {
      const uploadSources = vi.fn(() => of(uploaded));
      const { model } = build({ uploadSources });
      settle();
      model.uploadFiles(Array.from({ length: 11 }, (_, index) => upload(`f${index}.json`)));
      expect(model.uploadErrors()).toEqual(['import.dialog.source.uploadTooManyX']);
      expect(model.uploadStatus()).toBe('error');
      model.uploadFiles([upload('notes.txt'), upload('big.json', 21 * 1024 * 1024)]);
      expect(model.uploadErrors()).toHaveLength(2);
      expect(uploadSources).not.toHaveBeenCalled();
    });

    it('passes the file name, size limit and counts to the translator', () => {
      const translate = vi.fn((key: string) => key);
      const { model } = build({ translate });
      settle();
      model.uploadFiles([upload('big.json', 21 * 1024 * 1024)]);
      expect(translate).toHaveBeenCalledWith('import.dialog.source.uploadTooLargeX', { file: 'big.json', max: 20 });
    });

    it('applies the returned listing and checks the uploaded rows that are not blocked', () => {
      const withBase = listing([...uploaded.files]);
      const uploadSources = vi.fn(() => of(withBase));
      const { model } = build({ uploadSources });
      settle();
      model.uploadFiles([upload('vendor.xliff'), upload('EN.json')]);
      expect(uploadSources).toHaveBeenCalledWith('main', expect.any(Array), { folder: 'in', overwrite: false });
      expect(model.draft().files).toEqual([{ path: 'in/vendor.xliff', locale: 'es' }]);
      expect(model.uploadNotice()).toEqual({ uploaded: 2, listed: 2, checked: 1 });
      expect(model.uploadStatus()).toBe('idle');
      expect(model.form.controls.files.touched).toBe(true);
    });

    it('reports fewer listed than uploaded', () => {
      const { model } = build({ uploadSources: () => of(uploaded) });
      settle();
      model.uploadFiles([upload('vendor.xliff'), upload('ghost.json')]);
      expect(model.uploadNotice()).toEqual({ uploaded: 2, listed: 1, checked: 1 });
    });

    it('does not duplicate rows that were already checked', () => {
      const { model } = build({ uploadSources: () => of(uploaded) });
      settle();
      model.toggleFile('in/es.xliff', true);
      model.uploadFiles([upload('es.xliff'), upload('vendor.xliff')]);
      expect(model.draft().files.map((choice) => choice.path)).toEqual(['in/es.xliff', 'in/vendor.xliff']);
    });

    it('reruns the preview once for the applied listing', () => {
      const dryRun = vi.fn(() => of({} as ImportPlanDto));
      const { model } = build({ dryRun, uploadSources: () => of(uploaded) });
      settle();
      model.uploadFiles([upload('vendor.xliff')]);
      vi.advanceTimersByTime(FOLDER_DEBOUNCE_MS);
      expect(dryRun).toHaveBeenCalledTimes(1);
      expect(dryRun).toHaveBeenCalledWith(
        expect.objectContaining({ files: [{ path: 'in/vendor.xliff', locale: 'es' }] }),
      );
    });

    it('relists instead of applying a response for a folder the user has left', () => {
      const reply = new Subject<ImportSourceListingDto>();
      const { model, listSources } = build({ uploadSources: () => reply });
      settle();
      model.uploadFiles([upload('vendor.xliff')]);
      expect(model.uploadStatus()).toBe('uploading');
      model.form.controls.folder.setValue('in/other');
      settle();
      listSources.mockClear();
      reply.next(uploaded);
      vi.advanceTimersByTime(0);
      expect(listSources).toHaveBeenCalledWith('main', 'in/other');
      expect(model.draft().files).toEqual([]);
      expect(model.uploadNotice()).toBeUndefined();
    });

    it('offers Replace on a clash and resends with overwrite', () => {
      const clash = new ApiError({ kind: 'conflict', status: 409, details: ['es.xliff'] });
      const uploadSources = vi
        .fn()
        .mockReturnValueOnce(throwError(() => clash))
        .mockReturnValue(of(uploaded));
      const { model } = build({ uploadSources });
      settle();
      model.uploadFiles([upload('es.xliff')]);
      expect(model.uploadClash()?.names).toEqual(['es.xliff']);
      expect(model.uploadStatus()).toBe('idle');
      model.replaceClashing();
      expect(uploadSources).toHaveBeenLastCalledWith('main', expect.any(Array), { folder: 'in', overwrite: true });
      expect(model.uploadClash()).toBeUndefined();
    });

    it('keeps the existing file when the clash is dismissed', () => {
      const clash = new ApiError({ kind: 'conflict', status: 409, details: ['es.xliff'] });
      const { model } = build({ uploadSources: () => throwError(() => clash) });
      settle();
      model.uploadFiles([upload('es.xliff')]);
      model.dismissClash();
      expect(model.uploadClash()).toBeUndefined();
    });

    it('shows server details and relists after another error', () => {
      const failure = new ApiError({ kind: 'invalid', status: 400, details: ['"x" is empty.'] });
      const { model, listSources } = build({ uploadSources: () => throwError(() => failure) });
      settle();
      listSources.mockClear();
      model.uploadFiles([upload('x.json')]);
      expect(model.uploadErrors()).toEqual(['"x" is empty.']);
      expect(model.uploadStatus()).toBe('error');
      vi.advanceTimersByTime(0);
      expect(listSources).toHaveBeenCalledTimes(1);
    });

    it('falls back to the generic message, and a friendly one for 429', () => {
      const busy = new ApiError({ kind: 'other', status: 429 });
      const { model } = build({ uploadSources: () => throwError(() => busy) });
      settle();
      model.uploadFiles([upload('x.json')]);
      expect(model.uploadErrors()).toEqual(['import.dialog.source.uploadBusy']);
      const generic = new ApiError({ kind: 'other', status: 500 });
      const second = build({ uploadSources: () => throwError(() => generic) });
      settle();
      second.model.uploadFiles([upload('x.json')]);
      expect(second.model.uploadErrors()).toEqual(['import.dialog.source.uploadFailed']);
    });

    it('does nothing for a read-only collection, an empty drop or a running upload', () => {
      const uploadSources = vi.fn(() => NEVER);
      const locked = build({ data: { preselectedCollection: 'locked' }, uploadSources });
      settle();
      locked.model.uploadFiles([upload('a.json')]);
      expect(uploadSources).not.toHaveBeenCalled();
      const running = build({ uploadSources });
      settle();
      running.model.uploadFiles([]);
      running.model.uploadFiles([upload('a.json')]);
      running.model.uploadFiles([upload('b.json')]);
      expect(uploadSources).toHaveBeenCalledTimes(1);
    });

    it('allows uploads only into the import folder or below it', () => {
      const { model } = build();
      settle();
      expect(model.canUpload()).toBe(true);
      model.form.controls.folder.setValue('in/sub');
      settle();
      expect(model.uploadAllowed()).toBe(true);
      model.form.controls.folder.setValue('elsewhere');
      expect(model.uploadAllowed()).toBe(false);
      expect(model.canUpload()).toBe(false);
    });

    it('normalises separators, dots and trailing slashes', () => {
      expect(normalizeFolderPath(' ./dist//lingo-import/ ')).toBe('dist/lingo-import');
      expect(normalizeFolderPath('dist/lingo-import/../x')).toBe('dist/x');
      expect(normalizeFolderPath('/dist/lingo-import')).toBe('/dist/lingo-import');
      expect(normalizeFolderPath('C:\\Dist\\Import\\')).toBe('c:/dist/import');
    });

    it('keeps absolute paths distinct from project-relative ones', () => {
      expect(isUploadFolder('/dist/lingo-import', 'dist/lingo-import')).toBe(false);
      expect(isUploadFolder('C:/dist/lingo-import', 'dist/lingo-import')).toBe(false);
      expect(isUploadFolder('/abs/in/sub', '/abs/in')).toBe(true);
      expect(isUploadFolder('/abs/other', '/abs/in')).toBe(false);
    });

    it('compares case only for POSIX-style paths', () => {
      expect(isUploadFolder('Dist/Lingo-Import', 'dist/lingo-import')).toBe(false);
      expect(isUploadFolder('DIST\\lingo-import\\sub', 'dist/lingo-import')).toBe(true);
      expect(isUploadFolder('C:\\Dist\\Import', 'c:/dist/import')).toBe(true);
    });

    it('treats only the folder and its descendants as inside', () => {
      expect(isUploadFolder('dist/lingo-import', 'dist/lingo-import')).toBe(true);
      expect(isUploadFolder('dist/lingo-import/sub', 'dist/lingo-import')).toBe(true);
      expect(isUploadFolder('dist/lingo-import-other', 'dist/lingo-import')).toBe(false);
      expect(isUploadFolder('dist/lingo-import/../x', 'dist/lingo-import')).toBe(false);
      expect(isUploadFolder('dist', 'dist/lingo-import')).toBe(false);
      expect(isUploadFolder('x', '')).toBe(false);
    });

    it('sends Replace to the destination that clashed, with the same File objects', () => {
      const first = upload('es.xliff');
      const second = upload('fr.xliff');
      const clash = new ApiError({ kind: 'conflict', status: 409, details: ['es.xliff'] });
      const uploadSources = vi
        .fn()
        .mockReturnValueOnce(throwError(() => clash))
        .mockReturnValue(of(uploaded));
      const { model } = build({ uploadSources });
      settle();
      model.uploadFiles([first, second]);
      model.replaceClashing();
      const [collection, sent, options] = uploadSources.mock.calls[1] ?? [];
      expect(collection).toBe('main');
      expect(sent[0]).toBe(first);
      expect(sent[1]).toBe(second);
      expect(options).toEqual({ folder: 'in', overwrite: true });
    });

    it('drops a clash that arrives after the destination changed', () => {
      const reply = new Subject<ImportSourceListingDto>();
      const { model } = build({ uploadSources: () => reply });
      settle();
      model.uploadFiles([upload('es.xliff')]);
      model.selectCollection('other');
      reply.error(new ApiError({ kind: 'conflict', status: 409, details: ['es.xliff'] }));
      expect(model.uploadClash()).toBeUndefined();
      expect(model.uploadErrors()).toEqual([]);
      expect(model.uploadStatus()).toBe('idle');
    });

    it('clears a shown clash when the folder or the collection changes, so Replace cannot hit the new one', () => {
      const clash = new ApiError({ kind: 'conflict', status: 409, details: ['es.xliff'] });
      const uploadSources = vi.fn(() => throwError(() => clash));
      const { model } = build({ uploadSources });
      settle();
      model.uploadFiles([upload('es.xliff')]);
      model.form.controls.folder.setValue('in/other');
      expect(model.uploadClash()).toBeUndefined();
      model.uploadFiles([upload('es.xliff')]);
      expect(model.uploadClash()).toBeDefined();
      model.selectCollection('other');
      expect(model.uploadClash()).toBeUndefined();
      uploadSources.mockClear();
      model.replaceClashing();
      expect(uploadSources).not.toHaveBeenCalled();
    });

    it('lets the upload listing win over an older listing request that resolves later', () => {
      const older = new Subject<ImportSourceListingDto>();
      const listSources = vi
        .fn()
        .mockReturnValueOnce(of(listing(FILES)))
        .mockReturnValue(older);
      const { model } = build({ listSources, uploadSources: () => of(uploaded) });
      settle();
      model.retryListing();
      vi.advanceTimersByTime(0);
      model.uploadFiles([upload('vendor.xliff')]);
      expect(model.draft().files).toEqual([{ path: 'in/vendor.xliff', locale: 'es' }]);
      older.next(listing(FILES));
      expect(model.draft().files).toEqual([{ path: 'in/vendor.xliff', locale: 'es' }]);
      expect(model.rows().map((row) => row.file.name)).toContain('vendor.xliff');
      expect(model.listingStatus()).toBe('ready');
    });

    it('counts checked files separately from listed ones', () => {
      const baseOnly = build({ uploadSources: () => of(uploaded) });
      settle();
      baseOnly.model.uploadFiles([upload('en.json')]);
      expect(baseOnly.model.uploadNotice()).toEqual({ uploaded: 1, listed: 1, checked: 0 });
      const already = build({ uploadSources: () => of(uploaded) });
      settle();
      already.model.toggleFile('in/es.xliff', true);
      already.model.uploadFiles([upload('es.xliff'), upload('en.json')]);
      expect(already.model.uploadNotice()).toEqual({ uploaded: 2, listed: 2, checked: 1 });
    });

    it('does not upload while a submit is in flight, and cannot upload', () => {
      const uploadSources = vi.fn(() => of(uploaded));
      const { model } = build({ uploadSources });
      settle();
      model.toggleFile('in/es.xliff', true);
      const subscription = model.submit(() => NEVER).subscribe();
      expect(model.canUpload()).toBe(false);
      model.uploadFiles([upload('es.xliff')]);
      expect(uploadSources).not.toHaveBeenCalled();
      subscription.unsubscribe();
    });
  });
});
