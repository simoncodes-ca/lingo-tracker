import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormGroup,
  FormControl,
  Validators,
} from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import { CollectionFormDialogData } from './collection-form-dialog-data';
import { LingoTrackerCollectionDto } from '@simoncodes-ca/data-transfer';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';

/**
 * Form value interface for the collection form.
 */
interface CollectionFormValue {
  name: string;
  translationsFolder: string;
  locales: string;
}

/**
 * Dialog result interface when the user confirms.
 */
export interface CollectionFormResult {
  name: string;
  config: LingoTrackerCollectionDto;
}

/**
 * Dialog component for creating or editing collections.
 *
 * Usage:
 * ```typescript
 * // Create mode
 * const dialogRef = this.dialog.open(CollectionFormDialog, {
 *   data: { mode: 'create' } as CollectionFormDialogData
 * });
 *
 * // Edit mode
 * const dialogRef = this.dialog.open(CollectionFormDialog, {
 *   data: {
 *     mode: 'edit',
 *     name: 'my-collection',
 *     config: { translationsFolder: './i18n', locales: ['en', 'fr'] }
 *   } as CollectionFormDialogData
 * });
 *
 * dialogRef.afterClosed().subscribe((result: CollectionFormResult | undefined) => {
 *   if (result) {
 *     // User confirmed
 *   }
 * });
 * ```
 */
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
    TranslocoModule,
  ],
  templateUrl: './collection-form-dialog.html',
  styleUrl: './collection-form-dialog.scss',
})
export class CollectionFormDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<CollectionFormDialog>);
  readonly data = inject<CollectionFormDialogData>(MAT_DIALOG_DATA);

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
    locales: new FormControl<string>('', {
      nonNullable: true,
    }),
  });

  get isEditMode(): boolean {
    return this.data.mode === 'edit';
  }

  get dialogTitle(): string {
    return this.isEditMode
      ? TRACKER_TOKENS.COLLECTIONS.DIALOG.EDIT.TITLE
      : TRACKER_TOKENS.COLLECTIONS.DIALOG.CREATE.TITLE;
  }

  ngOnInit(): void {
    if (this.isEditMode && this.data.config) {
      // Pre-populate form for edit mode
      const localesString = this.data.config.locales
        ? this.data.config.locales.join(', ')
        : '';

      this.form.patchValue({
        name: this.data.name || '',
        translationsFolder: this.data.config.translationsFolder || '',
        locales: localesString,
      });

      // Disable name field in edit mode (collection name cannot change)
      if (this.data.name) {
        this.form.controls.name.disable();
      }
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.form.invalid) {
      return;
    }

    const formValue = this.form.getRawValue() as CollectionFormValue;

    // Parse locales string into array
    const localesArray = formValue.locales
      .split(',')
      .map((locale) => locale.trim())
      .filter((locale) => locale.length > 0);

    const result: CollectionFormResult = {
      name: formValue.name,
      config: {
        translationsFolder: formValue.translationsFolder,
        ...(localesArray.length > 0 ? { locales: localesArray } : {}),
      },
    };

    this.dialogRef.close(result);
  }
}
