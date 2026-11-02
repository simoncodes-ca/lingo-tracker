import { computed, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, type ValidatorFn, Validators } from '@angular/forms';
import type { ResourceSummaryDto, TranslationStatus } from '@simoncodes-ca/data-transfer';
import {
  type AppRuntime,
  DEFAULT_APP_RUNTIME,
  DEFAULT_MISSING_METADATA_STATUS,
  isNeedsWorkStatus,
  summaryTarget,
} from '@simoncodes-ca/domain';
import { merge, type Subscription } from 'rxjs';
import { bracedPlaceholderValidator } from '../../../shared/validators/braced-placeholder.validator';
import { nonBlankValidator } from '../../../shared/validators/non-blank.validator';
import { segmentValidator } from '../../../shared/validators/segment.validator';
import {
  addTag as addDraftTag,
  hasUnsavedChanges,
  type LocaleDraft,
  type ResourceEntryDraft,
  removeTag as removeDraftTag,
} from './resource-entry-draft';

/** The editable fields and their plain draft snapshot, independent of the dialog DOM. */
export class EditorEntryForm {
  private readonly bracedValidator: ValidatorFn;
  readonly form = new FormGroup({
    key: new FormControl<string>('', {
      validators: [Validators.required, segmentValidator],
      nonNullable: true,
    }),
    baseValue: new FormControl<string>('', {
      validators: [nonBlankValidator, bracedPlaceholderValidator],
      nonNullable: true,
    }),
    comment: new FormControl<string>('', { nonNullable: true }),
    translations: new FormArray<
      FormGroup<{
        locale: FormControl<string>;
        value: FormControl<string>;
        status: FormControl<TranslationStatus>;
      }>
    >([]),
  });

  readonly #tags = signal<readonly string[]>([]);
  readonly tags = this.#tags.asReadonly();
  readonly formState = signal(this.form.getRawValue());
  readonly localeSummaries = computed<LocaleDraft[]>(() => this.formState().translations);
  readonly localesNeedingWork = computed(() =>
    this.localeSummaries().filter((locale) => isNeedsWorkStatus(locale.status)),
  );
  readonly needWorkCount = computed(() => this.localesNeedingWork().length);

  /** Set once the user attempts to save, so errors surface on untouched fields too. */
  readonly submitAttempted = signal(false);

  /** Live form validity, for the footer's earned check glyph. */
  readonly isFormValid = computed(() => {
    this.formState();
    return this.form.valid && !this.keyCollision();
  });

  /** True once the key control is both invalid and worth complaining about. */
  readonly showKeyError = computed(() => {
    this.formState();
    return this.form.controls.key.invalid && (this.form.controls.key.touched || this.submitAttempted());
  });

  /** True once the English value is both invalid (missing or braced) and worth complaining about. */
  readonly showBaseValueError = computed(() => {
    this.formState();
    return this.form.controls.baseValue.invalid && (this.form.controls.baseValue.touched || this.submitAttempted());
  });

  /** True once the translation row's value is invalid and worth complaining about. */
  showLocaleValueError(index: number): boolean {
    this.formState();
    const value = this.getLocaleFormGroup(index).controls.value;
    return value.invalid && (value.touched || this.submitAttempted());
  }

  /** The first translation row whose value is invalid, -1 when none is. */
  readonly firstInvalidLocaleIndex = computed(() => {
    this.formState();
    return this.form.controls.translations.controls.findIndex((group) => group.controls.value.invalid);
  });

  /** The typed locale fields shared by the drawer and save path. */
  getLocaleFormGroup(index: number): FormGroup<{
    locale: FormControl<string>;
    value: FormControl<string>;
    status: FormControl<TranslationStatus>;
  }> {
    return this.form.controls.translations.at(index) as FormGroup<{
      locale: FormControl<string>;
      value: FormControl<string>;
      status: FormControl<TranslationStatus>;
    }>;
  }

  readonly #changes: Subscription;
  #initialDraft: ResourceEntryDraft | undefined;

  constructor(
    private readonly keyCollision: () => boolean = () => false,
    runtime: () => AppRuntime = () => DEFAULT_APP_RUNTIME,
  ) {
    this.bracedValidator = (control) => bracedPlaceholderValidator(control, runtime());
    this.form.controls.baseValue.setValidators([nonBlankValidator, this.bracedValidator]);
    this.form.controls.baseValue.updateValueAndValidity();
    this.#changes = merge(this.form.valueChanges, this.form.statusChanges).subscribe(() => this.publishSnapshot());
  }

  seed(
    availableLocales: readonly string[],
    baseLocale: string,
    resource: ResourceSummaryDto | undefined,
    folderPath: string,
  ): void {
    const translations = this.form.controls.translations;
    translations.clear();
    for (const locale of availableLocales.filter((candidate) => candidate !== baseLocale)) {
      const target = resource ? summaryTarget(resource, locale) : undefined;
      translations.push(
        new FormGroup({
          locale: new FormControl(locale, { nonNullable: true }),
          value: new FormControl(target?.value ?? '', { validators: [this.bracedValidator], nonNullable: true }),
          status: new FormControl<TranslationStatus>(target?.status ?? DEFAULT_MISSING_METADATA_STATUS, {
            nonNullable: true,
          }),
        }),
      );
    }
    if (resource) {
      this.form.patchValue({ key: resource.entryKey, baseValue: resource.base.value, comment: resource.comment || '' });
      this.#tags.set([...resource.tags]);
    }
    this.publishSnapshot();
    this.#initialDraft = this.draft(folderPath);
  }

  publishSnapshot(): void {
    this.formState.set(this.form.getRawValue());
  }

  addTag(raw: string): void {
    this.#tags.update((tags) => addDraftTag(tags, raw));
  }

  removeTag(tag: string, inherited: readonly string[]): void {
    this.#tags.update((tags) => removeDraftTag(tags, tag, inherited));
  }

  draft(folderPath: string): ResourceEntryDraft {
    const { key, baseValue, comment, translations } = this.form.getRawValue();
    return { key, baseValue, comment, translations, folderPath, tags: this.tags() };
  }

  initialBaseValue(): string | undefined {
    return this.#initialDraft?.baseValue;
  }

  hasUnsavedChanges(folderPath: string): boolean {
    return (
      this.#initialDraft !== undefined && hasUnsavedChanges(this.draft(folderPath), this.#initialDraft, this.form.dirty)
    );
  }

  destroy(): void {
    this.#changes.unsubscribe();
  }
}
