import { computed, type Signal, signal, type WritableSignal } from '@angular/core';
import { FormControl, FormGroup, type ValidatorFn, Validators } from '@angular/forms';
import { isUnderNodeModules } from '@simoncodes-ca/domain';
import { Subscription } from 'rxjs';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import {
  type CollectionDraft,
  type CollectionDraftResult,
  canRemoveLocale,
  chooseBaseLocale,
  displayedBaseLocale,
  removedLocales,
  toCollectionDraft,
  toCollectionResult,
  withAddedLocale,
  withFolder,
  withoutLocale,
  withoutProtectedTerm,
  withoutTag,
  withProtectedTerm,
  withTag,
  withUserReadOnly,
} from './collection-draft';
import type { CollectionFormDialogData } from './collection-form-dialog-data';

/**
 * The collection dialog's form model, independent of the dialog DOM. The Collection Draft is the
 * one copy of the collection's values; every edit goes through its rules. The typed form holds
 * only the two text inputs the user types into, and feeds each change into the draft.
 */
export class CollectionForm {
  readonly #changes = new Subscription();
  readonly #draft: WritableSignal<CollectionDraft>;

  readonly form: FormGroup<{ name: FormControl<string>; translationsFolder: FormControl<string> }>;
  readonly addLocaleInput = new FormControl<string>('', { nonNullable: true });

  /** Why the server refused the last submit, unless the refusal belongs to the name field. Cleared on the next edit. */
  readonly submitError = signal<string | null>(null);

  readonly draft: Signal<CollectionDraft>;
  readonly locales = computed(() => this.#draft().locales);
  readonly readOnly = computed(() => this.#draft().readOnly);
  readonly tags = computed(() => this.#draft().tags);
  readonly protectedTerms = computed(() => this.#draft().protectedTerms);
  /** Terms live in a file, so without a pointer there is nowhere to save them and the editor stays hidden. */
  readonly canEditProtectedTerms = computed(() => this.#draft().protectedTermsFile !== undefined);
  /** Resolved path of that file, shown read-only so the source of a diff is obvious. */
  readonly protectedTermsFilePath = computed(() => this.#draft().protectedTermsFilePath);
  /** Whether the entered folder is under node_modules (drives the read-only hint). */
  readonly isNodeModulesPath = computed(() => isUnderNodeModules(this.#draft().translationsFolder));
  /**
   * The locale shown as BASE. In edit mode a collection without its own `baseLocale` inherits the
   * global one, so the inherited value is what gets marked and locked; only an explicit choice
   * is ever written back.
   */
  readonly displayedBaseLocale = computed(() => {
    const { mode, baseLocale, effectiveBaseLocale } = this.#draft();
    return displayedBaseLocale(mode, baseLocale, effectiveBaseLocale);
  });
  /** The one line under the locale chips: what clicking does, what is locked, or what empty means. */
  readonly localesHintToken = computed(() => {
    if (this.isEditMode) return TRACKER_TOKENS.COLLECTIONS.DIALOG.BASEHINTEDIT;
    return this.locales().length > 0
      ? TRACKER_TOKENS.COLLECTIONS.DIALOG.BASEHINTCREATE
      : TRACKER_TOKENS.COLLECTIONS.DIALOG.LOCALESINHERITHINT;
  });
  /**
   * Tags and protected terms are the rarely-touched part of a collection, so they sit behind a
   * disclosure. It opens by itself when there is already something in it to look at.
   */
  readonly advancedOpen: WritableSignal<boolean>;

  constructor(
    private readonly data: CollectionFormDialogData,
    nameValidator: ValidatorFn,
  ) {
    const seed = toCollectionDraft(data);
    this.#draft = signal(seed);
    this.draft = this.#draft.asReadonly();
    this.advancedOpen = signal(seed.tags.length > 0 || seed.protectedTerms.length > 0);
    this.form = new FormGroup({
      name: new FormControl<string>('', { validators: [Validators.required, nameValidator], nonNullable: true }),
      translationsFolder: new FormControl<string>('', { validators: [Validators.required], nonNullable: true }),
    });
    const { name, translationsFolder } = seed;
    this.form.patchValue({ name, translationsFolder });
    if (this.isEditMode && data.name) this.form.controls.name.disable();

    // Subscribed after seeding, so only the user's typing reaches the draft.
    const { controls } = this.form;
    this.#changes.add(
      controls.name.valueChanges.subscribe((value) => this.#draft.update((d) => ({ ...d, name: value }))),
    );
    // Auto-default read-only for node_modules paths until the user overrides it.
    this.#changes.add(
      controls.translationsFolder.valueChanges.subscribe((folder) => this.#draft.update((d) => withFolder(d, folder))),
    );
    this.#changes.add(this.form.valueChanges.subscribe(() => this.submitError.set(null)));
  }

  get isEditMode(): boolean {
    return this.data.mode === 'edit';
  }

  destroy(): void {
    this.#changes.unsubscribe();
  }

  get showNameError(): boolean {
    const control = this.form.controls.name;
    return (control.hasError('required') || control.hasError('nameExists')) && control.touched;
  }

  /** The server refused the name as taken; the next keystroke on the field clears it. */
  get showNameConflict(): boolean {
    return this.form.controls.name.hasError('nameExists');
  }

  get showFolderError(): boolean {
    const control = this.form.controls.translationsFolder;
    return control.hasError('required') && control.touched;
  }

  // ───────────────────────────── locales ─────────────────────────────

  isBaseLocale(locale: string): boolean {
    return this.displayedBaseLocale() === locale;
  }

  /** The base locale is a create-time decision; after that it anchors every checksum and is locked. */
  setBaseLocale(locale: string): void {
    const { mode, baseLocale, locales } = this.#draft();
    const next = chooseBaseLocale(mode, baseLocale, locales, locale);
    if (next !== baseLocale) this.#edit((d) => ({ ...d, baseLocale: next }));
  }

  canRemoveLocale(index: number): boolean {
    return canRemoveLocale(this.#draft().mode, this.locales()[index], this.displayedBaseLocale());
  }

  /** Adds the typed locale, or marks the input with why it was refused. */
  addLocale(): void {
    const result = withAddedLocale(this.#draft(), this.addLocaleInput.value);
    if (result.kind === 'blank') return;
    if (result.kind !== 'added') {
      this.addLocaleInput.setErrors({ [result.kind]: true });
      this.addLocaleInput.markAsTouched();
      return;
    }
    this.addLocaleInput.setErrors(null);
    this.#edit(() => result.draft);
    this.addLocaleInput.setValue('');
  }

  removeLocale(index: number): void {
    const current = this.#draft();
    const next = withoutLocale(current, index);
    if (next !== current) this.#edit(() => next);
  }

  // ───────────────────────────── options ─────────────────────────────

  setReadOnly(readOnly: boolean): void {
    this.#edit((d) => withUserReadOnly(d, readOnly));
  }

  toggleAdvanced(): void {
    this.advancedOpen.update((open) => !open);
  }

  // ───────────────────────────── tags and protected terms ─────────────────────────────

  addTag(raw: string): void {
    this.#draft.update((d) => withTag(d, raw));
  }

  removeTag(tag: string): void {
    this.#draft.update((d) => withoutTag(d, tag));
  }

  addProtectedTerm(raw: string): void {
    this.#draft.update((d) => withProtectedTerm(d, raw));
  }

  removeProtectedTerm(term: string): void {
    this.#draft.update((d) => withoutProtectedTerm(d, term));
  }

  // ───────────────────────────── submit ─────────────────────────────

  /** True when the form may be submitted; otherwise marks every field so its error shows. */
  validate(): boolean {
    if (this.form.valid) return true;
    this.form.markAllAsTouched();
    return false;
  }

  /** The locales the original collection had that this edit drops, for the confirmation. */
  removedLocales(): string[] {
    return removedLocales(this.#draft());
  }

  result(): CollectionDraftResult {
    return toCollectionResult(this.#draft());
  }

  /** A change to locales, base locale or read-only: the same edits that retire a stale refusal. */
  #edit(change: (draft: CollectionDraft) => CollectionDraft): void {
    this.#draft.update(change);
    this.submitError.set(null);
  }
}
