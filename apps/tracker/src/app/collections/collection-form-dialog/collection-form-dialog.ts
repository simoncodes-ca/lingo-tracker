import { Component, ChangeDetectionStrategy, computed, inject, DestroyRef, type OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, FormArray, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule, type MatChipInputEvent } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { isUnderNodeModules, normalizeProtectedTerms, normalizeTag, validateLocale } from '@simoncodes-ca/domain';
import type { CollectionFormDialogData } from './collection-form-dialog-data';
import type { LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { ConfirmationDialog } from '../../shared/components/confirmation-dialog/confirmation-dialog';
import type { ConfirmationDialogData } from '../../shared/components/confirmation-dialog/confirmation-dialog-data';

export interface CollectionFormResult {
  name: string;
  config: LingoTrackerCollectionDto;
}

@Component({
  selector: 'app-collection-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatRadioModule,
    MatTooltipModule,
    MatChipsModule,
    TranslocoModule,
  ],
  templateUrl: './collection-form-dialog.html',
  styleUrl: './collection-form-dialog.scss',
})
export class CollectionFormDialog implements OnInit {
  readonly #dialogRef = inject(MatDialogRef<CollectionFormDialog>);
  readonly #data = inject<CollectionFormDialogData>(MAT_DIALOG_DATA);
  readonly #dialog = inject(MatDialog);
  readonly #translocoService = inject(TranslocoService);
  readonly #destroyRef = inject(DestroyRef);

  readonly TOKENS = TRACKER_TOKENS;

  readonly form = new FormGroup({
    name: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    translationsFolder: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    baseLocale: new FormControl<string>('', { nonNullable: true }),
    locales: new FormArray<FormControl<string>>([]),
    readOnly: new FormControl<boolean>(false, { nonNullable: true }),
  });

  readonly addLocaleInput = new FormControl<string>('', { nonNullable: true });
  readonly tagSeparatorKeyCodes = [ENTER, COMMA] as const;
  readonly tagsList = signal<string[]>([]);
  readonly protectedTermsList = signal<string[]>([]);
  /** The collection's `protectedTermsFile` pointer, preserved across an edit but not editable here. */
  readonly protectedTermsFile = signal<string | undefined>(undefined);
  /** Resolved path of that file, shown read-only so the source of a diff is obvious. */
  readonly protectedTermsFilePath = signal<string | undefined>(undefined);
  /** Terms live in a file, so without a pointer there is nowhere to save them — the chips stay disabled. */
  readonly canEditProtectedTerms = computed(() => this.protectedTermsFile() !== undefined);

  #originalLocales: string[] = [];
  /** Tracks whether the user manually toggled read-only, so auto-detection stops overriding it. */
  #readOnlyTouchedByUser = false;

  get isEditMode(): boolean {
    return this.#data.mode === 'edit';
  }

  get dialogTitle(): string {
    return this.isEditMode
      ? TRACKER_TOKENS.COLLECTIONS.DIALOG.EDIT.TITLE
      : TRACKER_TOKENS.COLLECTIONS.DIALOG.CREATE.TITLE;
  }

  ngOnInit(): void {
    if (this.isEditMode && this.#data.config) {
      const configLocales = this.#data.config.locales ?? [];
      this.#originalLocales = [...configLocales];

      this.form.patchValue({
        name: this.#data.name ?? '',
        translationsFolder: this.#data.config.translationsFolder ?? '',
        baseLocale: this.#data.config.baseLocale ?? '',
        readOnly: this.#data.config.readOnly ?? false,
      });

      this.tagsList.set(this.#data.config.tags ?? []);
      this.protectedTermsList.set(this.#data.config.protectedTerms ?? []);
      this.protectedTermsFile.set(this.#data.config.protectedTermsFile);
      this.protectedTermsFilePath.set(this.#data.config.protectedTermsFilePath);
      // An existing read-only flag is the user's prior choice — don't let auto-detection override it.
      this.#readOnlyTouchedByUser = this.#data.config.readOnly !== undefined;

      for (const locale of configLocales) {
        this.form.controls.locales.push(new FormControl<string>(locale, { nonNullable: true }));
      }

      if (this.#data.name) {
        this.form.controls.name.disable();
      }
    }

    // Auto-default read-only for node_modules paths until the user overrides it.
    this.form.controls.translationsFolder.valueChanges
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((folder) => {
        if (this.#readOnlyTouchedByUser) return;
        this.form.controls.readOnly.setValue(isUnderNodeModules(folder), { emitEvent: false });
      });
  }

  onReadOnlyToggle(): void {
    this.#readOnlyTouchedByUser = true;
  }

  /** Whether the entered folder is under node_modules (drives the read-only hint). */
  get isNodeModulesPath(): boolean {
    return isUnderNodeModules(this.form.controls.translationsFolder.value);
  }

  addLocale(): void {
    const input = this.addLocaleInput.value.trim().toLowerCase();
    if (!input) return;

    try {
      validateLocale(input);
    } catch {
      this.addLocaleInput.setErrors({ invalidLocale: true });
      this.addLocaleInput.markAsTouched();
      return;
    }

    const currentLocales = this.form.controls.locales.getRawValue();
    if (currentLocales.includes(input)) {
      this.addLocaleInput.setErrors({ duplicateLocale: true });
      this.addLocaleInput.markAsTouched();
      return;
    }

    this.addLocaleInput.setErrors(null);
    this.form.controls.locales.push(new FormControl<string>(input, { nonNullable: true }));

    if (!this.isEditMode && this.form.controls.locales.length === 1) {
      this.form.controls.baseLocale.setValue(input);
    }

    this.addLocaleInput.setValue('');
  }

  addCollectionTag(event: MatChipInputEvent): void {
    const normalized = normalizeTag(event.value);
    if (normalized && !this.tagsList().includes(normalized)) {
      this.tagsList.update((tags) => [...tags, normalized]);
    }
    event.chipInput?.clear();
  }

  removeCollectionTag(tag: string): void {
    this.tagsList.update((tags) => tags.filter((t) => t !== tag));
  }

  /**
   * Adds a protected term, trimming and deduping case-sensitively while preserving
   * the entered casing and punctuation (`iPhone`, `Node.js`, `C++` stay verbatim).
   */
  addProtectedTerm(event: MatChipInputEvent): void {
    const [term] = normalizeProtectedTerms([event.value]);
    if (term && !this.protectedTermsList().includes(term)) {
      this.protectedTermsList.update((terms) => [...terms, term]);
    }
    event.chipInput?.clear();
  }

  removeProtectedTerm(term: string): void {
    this.protectedTermsList.update((terms) => terms.filter((t) => t !== term));
  }

  removeLocale(index: number): void {
    if (this.isEditMode && this.form.controls.locales.at(index).value === this.form.controls.baseLocale.value) {
      return;
    }

    const removedLocale = this.form.controls.locales.at(index).value;
    this.form.controls.locales.removeAt(index);

    if (!this.isEditMode && this.form.controls.baseLocale.value === removedLocale) {
      const first = this.form.controls.locales.at(0);
      this.form.controls.baseLocale.setValue(first ? first.value : '');
    }
  }

  onCancel(): void {
    this.#dialogRef.close();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    if (this.isEditMode) {
      const localesArray = this.form.controls.locales.getRawValue();
      const removedLocales = this.#originalLocales.filter((l) => !localesArray.includes(l));

      if (removedLocales.length > 0) {
        const confirmRef = this.#dialog.open(ConfirmationDialog, {
          data: {
            title: this.#translocoService.translate(TRACKER_TOKENS.COLLECTIONS.DIALOG.REMOVECONFIRMTITLE),
            message: this.#translocoService.translate(TRACKER_TOKENS.COLLECTIONS.DIALOG.REMOVECONFIRMBODY, {
              locales: removedLocales.join(', '),
            }),
            confirmButtonText: this.#translocoService.translate(TRACKER_TOKENS.COMMON.ACTIONS.SAVE),
            actionType: 'destructive',
          } satisfies ConfirmationDialogData,
        });

        const confirmed = await firstValueFrom(confirmRef.afterClosed());
        if (confirmed) {
          this.#dialogRef.close(this.#buildResult());
        }
        return;
      }
    }

    this.#dialogRef.close(this.#buildResult());
  }

  #buildResult(): CollectionFormResult {
    const raw = this.form.getRawValue();
    const localesArray = raw.locales;
    const tags = this.tagsList();
    const protectedTermsFile = this.protectedTermsFile();
    const protectedTerms = this.protectedTermsList();
    return {
      name: raw.name,
      config: {
        translationsFolder: raw.translationsFolder,
        ...(localesArray.length > 0 ? { locales: localesArray } : {}),
        ...(raw.baseLocale ? { baseLocale: raw.baseLocale } : {}),
        readOnly: raw.readOnly,
        ...(tags.length > 0 ? { tags } : {}),
        // The pointer round-trips so an edit never drops it; the terms are only sent when
        // there is a file to write them to.
        ...(protectedTermsFile ? { protectedTermsFile, protectedTerms } : {}),
      },
    };
  }
}
