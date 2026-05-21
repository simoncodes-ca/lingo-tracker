import { Component, ChangeDetectionStrategy, inject, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, FormArray, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { validateLocale } from '@simoncodes-ca/domain';
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
    MatIconModule,
    MatRadioModule,
    MatTooltipModule,
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
  });

  readonly addLocaleInput = new FormControl<string>('', { nonNullable: true });

  #originalLocales: string[] = [];

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
      });

      for (const locale of configLocales) {
        this.form.controls.locales.push(new FormControl<string>(locale, { nonNullable: true }));
      }

      if (this.#data.name) {
        this.form.controls.name.disable();
      }
    }
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
    return {
      name: raw.name,
      config: {
        translationsFolder: raw.translationsFolder,
        ...(localesArray.length > 0 ? { locales: localesArray } : {}),
        ...(raw.baseLocale ? { baseLocale: raw.baseLocale } : {}),
      },
    };
  }
}
