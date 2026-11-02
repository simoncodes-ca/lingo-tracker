import { signal } from '@angular/core';
import type { ExportJobDto, LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { EMPTY, of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { ApiError } from '../../shared/api-error/api-error';
import { MemoryStorageAdapter } from '../../shared/storage/keyed-storage';
import { defaultDraft, persistDraft } from './export-draft';
import { ExportForm, type ExportFormOptions } from './export-form';

const config: LingoTrackerConfigDto = {
  exportFolder: 'handoff',
  importFolder: 'in',
  baseLocale: 'en',
  locales: ['en', 'fr', 'ja'],
  collections: {
    main: { translationsFolder: 'main', readOnly: true },
    other: { translationsFolder: 'other', locales: ['en', 'de'] },
  },
};
const models: ExportForm[] = [];
function build(options: Partial<ExportFormOptions> = {}) {
  const model = new ExportForm({
    translate: (key) => key,
    data: {},
    config: () => config,
    dryRun: () => EMPTY,
    ...options,
  });
  models.push(model);
  return model;
}
afterEach(() => {
  for (const model of models) model.destroy();
  models.length = 0;
  vi.useRealTimers();
});

describe('ExportForm', () => {
  it('starts on Format with all collections and target locales including read-only collections', () => {
    const model = build();
    expect(model.activeSection()).toBe('format');
    expect(model.form.valid).toBe(true);
    expect(model.availableLocales()).toEqual(['fr', 'ja', 'de']);
    expect(model.form.getRawValue()).toEqual(defaultDraft(config));
    expect(model.sections()).toEqual(['format', 'collections', 'locales', 'filters', 'output']);
  });

  it('opens preselection on Collections and gives Retry request choices precedence', () => {
    const model = build({ data: { preselectedCollection: 'main' } });
    expect(model.activeSection()).toBe('collections');
    expect(model.buildRequest().collections).toEqual(['main']);
    expect(model.availableLocales()).toEqual(['fr', 'ja']);
    const retry = build({
      data: { preselectedCollection: 'main', request: { format: 'json', collections: ['other'], locales: ['de'] } },
    });
    expect(retry.buildRequest()).toMatchObject({ format: 'json', collections: ['other'], locales: ['de'] });
  });

  it('requires nonempty collection, locale and status sets and maps them to rail sections after reveal', () => {
    const model = build();
    const c = model.form.controls;
    c.allCollections.setValue(false);
    c.allLocales.setValue(false);
    c.statuses.setValue([]);
    expect(c.collections.errors).toEqual({ collectionsEmpty: true });
    expect(c.locales.errors).toEqual({ localesEmpty: true });
    expect(c.statuses.errors).toEqual({ statusEmpty: true });
    expect([...model.sectionErrors()]).toEqual([]);
    expect(model.submitResult()).toBeUndefined();
    expect([...model.sectionErrors()]).toEqual(['collections', 'locales', 'filters']);
    expect(model.activeSection()).toBe('collections');
    c.allCollections.setValue(true);
    c.allLocales.setValue(true);
    c.statuses.setValue(['verified']);
    expect(model.form.valid).toBe(true);
    expect([...model.sectionErrors()]).toEqual([]);
  });

  it('rejects no targets even with All switches on', () => {
    const model = build({
      config: () => ({ ...config, locales: ['en'], collections: { main: { translationsFolder: 'main' } } }),
    });
    expect(model.form.controls.locales.hasError('localesEmpty')).toBe(true);
    expect(model.submitResult()).toBeUndefined();
  });

  it('requires the locale placeholder for multiple effective locales but permits blank default and one locale', () => {
    const model = build();
    const c = model.form.controls;
    c.filenamePattern.setValue('handoff');
    c.filenamePattern.markAsTouched();
    expect(c.filenamePattern.errors).toEqual({ patternLocale: true });
    expect(model.sectionErrors().has('output')).toBe(true);
    c.filenamePattern.setValue('{locale}');
    expect(c.filenamePattern.valid).toBe(true);
    c.filenamePattern.setValue('');
    expect(c.filenamePattern.valid).toBe(true);
    c.allLocales.setValue(false);
    c.locales.setValue(['fr']);
    c.filenamePattern.setValue('handoff');
    expect(c.filenamePattern.valid).toBe(true);
  });

  it('drops locales that disappear when collections change and updates the placeholder validator', () => {
    const model = build();
    const c = model.form.controls;
    c.allLocales.setValue(false);
    c.locales.setValue(['fr', 'de']);
    c.filenamePattern.setValue('handoff');
    expect(c.filenamePattern.invalid).toBe(true);
    c.collections.setValue(['main']);
    c.allCollections.setValue(false);
    expect(c.locales.value).toEqual(['fr']);
    expect(c.filenamePattern.valid).toBe(true);
    expect(model.buildRequest().locales).toEqual(['fr']);
  });

  it('refreshes the locale union when config changes', () => {
    const current = signal(config);
    const model = build({ config: current });
    current.set({ ...config, locales: ['en', 'it'], collections: { main: config.collections['main'] } });
    model.refreshSelections();
    expect(model.availableLocales()).toEqual(['it']);
    expect(model.selectedLocales()).toEqual(['it']);
  });

  it('shows JSON only for JSON and falls back to Format when JSON is removed', () => {
    const model = build();
    model.form.controls.format.setValue('json');
    expect(model.sections()).toContain('json');
    model.activeSection.set('json');
    model.form.controls.format.setValue('xliff');
    expect(model.activeSection()).toBe('format');
    expect(model.sections()).not.toContain('json');
  });

  it('disables rich dependencies and the base property until enabled while retaining raw choices', () => {
    const model = build();
    const c = model.form.controls;
    const json = c.json.controls;
    for (const field of [
      json.includeBase,
      json.includeStatus,
      json.includeComment,
      json.includeTags,
      json.basePropertyName,
    ])
      expect(field.disabled).toBe(true);
    json.rich.setValue(true);
    expect(json.includeBase.enabled).toBe(true);
    expect(json.basePropertyName.disabled).toBe(true);
    json.includeBase.setValue(true);
    json.includeStatus.setValue(true);
    expect(json.basePropertyName.enabled).toBe(true);
    c.format.setValue('json');
    json.rich.setValue(false);
    expect(model.form.getRawValue().json.includeBase).toBe(true);
    expect(model.buildRequest().json).toEqual({ structure: 'hierarchical', rich: false });
    json.rich.setValue(true);
    expect(model.buildRequest().json?.includeBase).toBe(true);
  });

  it('rejects each reserved base property only when applicable, mapping it to Output and JSON', () => {
    const model = build();
    const c = model.form.controls;
    const json = c.json.controls;
    c.format.setValue('json');
    json.rich.setValue(true);
    json.includeBase.setValue(true);
    for (const name of ['value', 'comment', 'status', 'tags']) {
      json.basePropertyName.setValue(name);
      expect(json.basePropertyName.errors).toEqual({ basePropertyReserved: true });
    }
    json.basePropertyName.markAsTouched();
    expect(model.sectionErrors()).toEqual(new Set(['json']));
    c.format.setValue('xliff');
    expect(model.form.valid).toBe(true);
    c.format.setValue('json');
    json.rich.setValue(false);
    expect(model.form.valid).toBe(true);
    json.rich.setValue(true);
    json.basePropertyName.setValue('source');
    expect(model.form.valid).toBe(true);
  });

  it('restores and saves preferences without storing collection or locale selections', () => {
    const adapter = new MemoryStorageAdapter();
    const draft = defaultDraft();
    draft.format = 'json';
    persistDraft(draft, () => adapter);
    const model = build({ storage: () => adapter, data: { preselectedCollection: 'main' } });
    expect(model.form.controls.format.value).toBe('json');
    expect(model.form.controls.collections.value).toEqual(['main']);
    model.form.controls.filenamePattern.setValue('{locale}');
    const reopened = build({ storage: () => adapter });
    expect(reopened.form.controls.allCollections.value).toBe(true);
    expect(reopened.form.controls.collections.value).toEqual([]);
    expect(reopened.form.controls.filenamePattern.value).toBe('{locale}');
  });

  it('tracks saving, propagates start refusals, and clears submit errors on edit', () => {
    const model = build();
    const response = new Subject<ExportJobDto>();
    const start = vi.fn(() => response);
    const subscription = model.submit(start).subscribe();
    expect(model.saving()).toBe(true);
    model.submit(start).subscribe();
    expect(start).toHaveBeenCalledTimes(1);
    response.complete();
    expect(model.saving()).toBe(false);
    subscription.unsubscribe();
    const error = new ApiError({
      kind: 'invalid',
      status: 400,
      serverMessage: 'Invalid output',
      details: ['Folder blocked'],
    });
    const received = vi.fn();
    model.submit(() => throwError(() => error)).subscribe({ error: received });
    expect(received).toHaveBeenCalledWith(error);
    expect(model.submitErrors()).toEqual(['Folder blocked']);
    expect(model.saving()).toBe(false);
    model.form.controls.tags.setValue(['ui']);
    expect(model.submitErrors()).toEqual([]);
    const job: ExportJobDto = {
      jobId: 'job',
      request: model.buildRequest(),
      status: 'pending',
      progress: { current: 0, total: 1 },
    };
    const next = vi.fn();
    model.submit(() => of(job)).subscribe(next);
    expect(next).toHaveBeenCalledWith(job);
  });
  it('resolves preview and submit fallback keys through the translation port', () => {
    vi.useFakeTimers();
    const translate = vi.fn((key: string) =>
      key === TRACKER_TOKENS.EXPORT.DIALOG.PREVIEW.FAILED ? 'Preview failed' : 'Start failed',
    );
    const error = new ApiError({ kind: 'other', status: 500 });
    const model = build({ translate, dryRun: () => throwError(() => error) });
    vi.advanceTimersByTime(300);
    expect(translate).toHaveBeenCalledWith(TRACKER_TOKENS.EXPORT.DIALOG.PREVIEW.FAILED);
    expect(model.preview.error()).toBe('Preview failed');
    model.submit(() => throwError(() => error)).subscribe({ error: () => undefined });
    expect(translate).toHaveBeenCalledWith(TRACKER_TOKENS.EXPORT.TOAST.STARTFAILED);
    expect(model.submitErrors()).toEqual(['Start failed']);
  });

  it('does not remember a draft opened from a Retry request', () => {
    const adapter = new MemoryStorageAdapter();
    const model = build({ storage: () => adapter, data: { request: { format: 'json' } } });
    model.form.controls.filenamePattern.setValue('{locale}');
    expect(adapter.getItem('lingo-tracker.exportDraft')).toBeNull();
  });

  it('reseeds an untouched output folder and reconciles selections when the config loads late', () => {
    const current = signal<LingoTrackerConfigDto | null>(null);
    const model = build({ config: () => current() });
    expect(model.form.controls.outputDirectory.value).toBe('dist/lingo-export');
    expect(model.availableLocales()).toEqual([]);
    current.set(config);
    model.configLoaded();
    expect(model.form.controls.outputDirectory.value).toBe('handoff');
    expect(model.availableLocales()).toEqual(['fr', 'ja', 'de']);
    const edited = build({ config: () => current() });
    edited.form.controls.outputDirectory.setValue('mine');
    edited.form.controls.outputDirectory.markAsDirty();
    edited.configLoaded();
    expect(edited.form.controls.outputDirectory.value).toBe('mine');
  });

  it('exposes the base locales of the chosen collections and a validity signal', () => {
    const model = build();
    expect(model.baseLocales()).toEqual(['en']);
    expect(model.valid()).toBe(true);
    model.form.controls.statuses.setValue([]);
    expect(model.valid()).toBe(false);
  });

  it('keeps Retry locales while the config is missing and prunes only unavailable ones once it loads', () => {
    const current = signal<LingoTrackerConfigDto | null>(null);
    const model = build({
      config: () => current(),
      data: { request: { format: 'xliff', locales: ['fr', 'zz'] } },
    });
    expect(model.form.controls.locales.value).toEqual(['fr', 'zz']);
    model.refreshSelections();
    expect(model.form.controls.locales.value).toEqual(['fr', 'zz']);
    current.set(config);
    model.configLoaded();
    expect(model.form.controls.locales.value).toEqual(['fr']);
  });

  it.each([
    ['an unchanged folder', undefined],
    ['a custom folder', 'mine'],
  ])('re-runs the dry run when the config loads after the first debounce with %s', (_name, folder) => {
    vi.useFakeTimers();
    const current = signal<LingoTrackerConfigDto | null>(null);
    const dryRun = vi.fn(() => EMPTY);
    const model = build({
      config: () => current(),
      dryRun,
      data: { request: { format: 'xliff', ...(folder ? { outputDirectory: folder } : {}) } },
    });
    vi.advanceTimersByTime(300);
    // Without collections the form is invalid, so the first pass has nothing to ask the server.
    expect(dryRun).not.toHaveBeenCalled();
    expect(model.preview.status()).toBe('waiting');
    current.set({ ...config, exportFolder: '' });
    model.configLoaded();
    vi.advanceTimersByTime(300);
    expect(dryRun).toHaveBeenCalledTimes(1);
  });

  it('reveals every error and jumps to the first marked section on demand', () => {
    const model = build();
    const c = model.form.controls;
    c.statuses.setValue([]);
    c.filenamePattern.setValue('handoff');
    expect(model.valid()).toBe(false);
    expect([...model.sectionErrors()]).toEqual([]);
    expect(model.revealErrors()).toBe(true);
    expect([...model.sectionErrors()]).toEqual(['filters', 'output']);
    expect(model.activeSection()).toBe('filters');
    c.statuses.setValue(['new']);
    c.filenamePattern.setValue('');
    expect(model.revealErrors()).toBe(false);
  });
});
