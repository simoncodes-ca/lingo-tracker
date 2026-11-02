import { computed, signal } from '@angular/core';
import { type AbstractControl, FormControl, FormGroup, type ValidationErrors } from '@angular/forms';
import type {
  ExportJobDto,
  ExportPlanDto,
  ExportRequestDto,
  LingoTrackerConfigDto,
} from '@simoncodes-ca/data-transfer';
import { type Observable, Subscription } from 'rxjs';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import type { StorageAdapter } from '../../shared/storage/keyed-storage';
import { JobStartAttempt } from '../store/form-submit-attempt-job';
import { resolveCollectionSettings } from '../store/collection-settings';
import type { ExportDialogData } from './export-dialog-data';
import {
  defaultDraft,
  type ExportDraft,
  fromExportRequest,
  persistDraft,
  readPersistedDraft,
  toExportRequest,
} from './export-draft';
import { ExportPreview } from './export-preview';

export type ExportSection = 'format' | 'collections' | 'locales' | 'filters' | 'output' | 'json';
type Controls<T> = {
  [K in keyof T]: T[K] extends object
    ? T[K] extends unknown[]
      ? FormControl<T[K]>
      : FormGroup<Controls<T[K]>>
    : FormControl<T[K]>;
};

export interface ExportFormOptions {
  data: ExportDialogData;
  translate: (key: string) => string;
  config: () => LingoTrackerConfigDto | null;
  dryRun: (request: ExportRequestDto) => Observable<ExportPlanDto>;
  storage?: () => StorageAdapter | undefined;
}

/** Typed export choices, validation and submit state, independent of the dialog DOM. */
export class ExportForm {
  readonly form: FormGroup<Controls<ExportDraft>>;
  readonly #changes = new Subscription();
  readonly #formTick = signal(Symbol());
  readonly draft = computed(() => {
    this.#formTick();
    return this.form.getRawValue();
  });
  /** Form validity as a signal, so templates and computeds follow it. */
  readonly valid = computed(() => {
    this.#formTick();
    return this.form.valid;
  });
  readonly activeSection = signal<ExportSection>('format');
  readonly #attempt = new JobStartAttempt<ExportRequestDto>(() =>
    this.options.translate(TRACKER_TOKENS.EXPORT.TOAST.STARTFAILED),
  );
  readonly saving = this.#attempt.saving;
  readonly submitAttempted = this.#attempt.state.attempted;
  readonly submitErrors = this.#attempt.state.errors;
  readonly sections = computed<readonly ExportSection[]>(() => [
    'format',
    'collections',
    'locales',
    'filters',
    'output',
    ...(this.draft().format === 'json' ? ['json' as const] : []),
  ]);
  readonly collectionNames = computed(() => Object.keys(this.options.config()?.collections ?? {}));
  readonly availableLocales = computed(() => {
    const config = this.options.config();
    if (!config) return [];
    const draft = this.draft();
    const names = draft.allCollections ? this.collectionNames() : draft.collections;
    return [
      ...new Set(
        names
          .filter((name) => this.collectionNames().includes(name))
          .flatMap((name) => {
            const settings = resolveCollectionSettings(config, name);
            return settings.locales.filter((locale) => locale !== settings.baseLocale);
          }),
      ),
    ];
  });
  /** Base locales of the chosen collections: shown locked, never exported. */
  readonly baseLocales = computed(() => {
    const config = this.options.config();
    if (!config) return [];
    const draft = this.draft();
    const names = draft.allCollections ? this.collectionNames() : draft.collections;
    return [
      ...new Set(
        names
          .filter((name) => this.collectionNames().includes(name))
          .map((name) => resolveCollectionSettings(config, name).baseLocale),
      ),
    ];
  });
  readonly selectedLocales = computed(() =>
    this.draft().allLocales
      ? this.availableLocales()
      : this.draft().locales.filter((locale) => this.availableLocales().includes(locale)),
  );
  readonly sectionErrors = computed<ReadonlySet<ExportSection>>(() => {
    this.#formTick();
    const errors = new Set<ExportSection>();
    const c = this.form.controls;
    const flag = (control: AbstractControl) => control.invalid && (control.touched || this.submitAttempted());
    if (flag(c.collections)) errors.add('collections');
    if (flag(c.locales)) errors.add('locales');
    if (flag(c.statuses)) errors.add('filters');
    if (flag(c.outputDirectory) || flag(c.filenamePattern)) errors.add('output');
    if (flag(c.json)) errors.add('json');
    return errors;
  });
  readonly preview: ExportPreview;

  /** The folder the form was seeded with while the config may not have been loaded yet. */
  #seededFolder: string;

  constructor(private readonly options: ExportFormOptions) {
    const config = options.config() ?? {};
    this.#seededFolder = defaultDraft(config).outputDirectory;
    const draft = options.data.request
      ? fromExportRequest(options.data.request, config)
      : ((options.storage ? readPersistedDraft(options.storage, config) : undefined) ?? defaultDraft(config));
    if (!options.data.request && options.data.preselectedCollection) {
      draft.allCollections = false;
      draft.collections = [options.data.preselectedCollection];
    }
    if (options.data.preselectedCollection) this.activeSection.set('collections');
    const control = <T>(value: T) => new FormControl<T>(value, { nonNullable: true });
    this.form = new FormGroup({
      format: control(draft.format),
      allCollections: control(draft.allCollections),
      collections: control(draft.collections),
      allLocales: control(draft.allLocales),
      locales: control(draft.locales),
      statuses: control(draft.statuses),
      tags: control(draft.tags),
      outputDirectory: control(draft.outputDirectory),
      filenamePattern: control(draft.filenamePattern),
      protectedTermNotes: control(draft.protectedTermNotes),
      json: new FormGroup({
        structure: control(draft.json.structure),
        rich: control(draft.json.rich),
        includeBase: control(draft.json.includeBase),
        basePropertyName: control(draft.json.basePropertyName),
        includeStatus: control(draft.json.includeStatus),
        includeComment: control(draft.json.includeComment),
        includeTags: control(draft.json.includeTags),
      }),
    });
    const c = this.form.controls;
    c.collections.addValidators(() =>
      (c.allCollections.value
        ? this.collectionNames()
        : c.collections.value.filter((name) => this.collectionNames().includes(name))
      ).length
        ? null
        : { collectionsEmpty: true },
    );
    c.locales.addValidators(() => (this.selectedLocales().length ? null : { localesEmpty: true }));
    c.statuses.addValidators(() => (c.statuses.value.length ? null : { statusEmpty: true }));
    c.filenamePattern.addValidators(() =>
      c.filenamePattern.value.trim() &&
      this.selectedLocales().length > 1 &&
      !c.filenamePattern.value.includes('{locale}')
        ? { patternLocale: true }
        : null,
    );
    c.json.controls.basePropertyName.addValidators((): ValidationErrors | null =>
      c.format.value === 'json' &&
      c.json.controls.includeBase.value &&
      ['value', 'comment', 'status', 'tags'].includes(c.json.controls.basePropertyName.value.trim())
        ? { basePropertyReserved: true }
        : null,
    );
    this.#changes.add(
      this.form.valueChanges.subscribe(() => {
        this.refreshSelections();
        this.#attempt.state.clear();
        // A Retry request is a one-off; it must not become the remembered draft.
        if (options.storage && !options.data.request) persistDraft(this.form.getRawValue(), options.storage);
      }),
    );
    this.#changes.add(this.form.events.subscribe(() => this.#formTick.set(Symbol())));
    this.refreshSelections();
    this.preview = new ExportPreview({
      request: () => (this.form.valid ? this.buildRequest() : undefined),
      dryRun: options.dryRun,
      failureMessage: () => options.translate(TRACKER_TOKENS.EXPORT.DIALOG.PREVIEW.FAILED),
    });
    this.#changes.add(this.preview.connect(this.form.valueChanges));
  }

  /**
   * The project config arrived after the form was built: reseed the output folder when the
   * user has not touched it, then reconcile selections against the real collections.
   */
  configLoaded(): void {
    const folder = this.form.controls.outputDirectory;
    const next = defaultDraft(this.options.config() ?? {}).outputDirectory;
    if (!folder.dirty && folder.value === this.#seededFolder && next !== folder.value) folder.setValue(next);
    this.#seededFolder = next;
    this.refreshSelections();
    // Refreshing is silent, so emit once: the preview must re-run against the real config.
    this.form.updateValueAndValidity();
  }

  /** Reconcile after collection choices (or the caller's project config) change. */
  refreshSelections(): void {
    this.#formTick.set(Symbol());
    const c = this.form.controls;
    // Without a config every locale looks unavailable; keep the choices until it arrives.
    if (this.options.config()) {
      const locales = c.locales.value.filter((locale) => this.availableLocales().includes(locale));
      if (locales.length !== c.locales.value.length) c.locales.setValue(locales, { emitEvent: false });
    }
    if (c.format.value !== 'json' && this.activeSection() === 'json') this.activeSection.set('format');
    const json = c.json.controls;
    for (const field of [json.includeBase, json.includeStatus, json.includeComment, json.includeTags]) {
      if (json.rich.value) field.enable({ emitEvent: false });
      else field.disable({ emitEvent: false });
    }
    if (json.rich.value && json.includeBase.value) json.basePropertyName.enable({ emitEvent: false });
    else json.basePropertyName.disable({ emitEvent: false });
    for (const field of [c.collections, c.locales, c.statuses, c.filenamePattern, json.basePropertyName])
      field.updateValueAndValidity({ emitEvent: false });
    this.#formTick.set(Symbol());
  }

  buildRequest(): ExportRequestDto {
    return toExportRequest(this.form.getRawValue(), {
      collectionNames: this.collectionNames(),
      locales: this.availableLocales(),
    });
  }

  retryPreview(): void {
    this.preview.refresh();
  }

  /** Show every error and move to the first section that has one. Returns whether the form is invalid. */
  revealErrors(): boolean {
    this.refreshSelections();
    if (this.#attempt.state.check(this.form)) return false;
    const first = this.sections().find((section) => this.sectionErrors().has(section));
    if (first) this.activeSection.set(first);
    return true;
  }

  submitResult(): ExportRequestDto | undefined {
    return this.revealErrors() ? undefined : this.buildRequest();
  }

  submit(start: (request: ExportRequestDto) => Observable<ExportJobDto>): Observable<ExportJobDto> {
    return this.#attempt.start(() => this.submitResult(), start);
  }

  destroy(): void {
    this.#changes.unsubscribe();
  }
}
