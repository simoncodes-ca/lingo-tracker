import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { ChipInput } from '../../shared/chip-input/chip-input';
import { CONFIG_FILE_MARKUP } from '../../shared/code-markup';
import { injectCollectionFormSubmit } from '../store/dialog-config-submit-adapters';
import type { CollectionDraftResult } from './collection-draft';
import { CollectionForm } from './collection-form';
import type { CollectionFormDialogData } from './collection-form-dialog-data';

/** What the dialog closes with: the collection as the server has now accepted it. */
export type CollectionFormResult = CollectionDraftResult;

@Component({
  selector: 'app-collection-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TranslocoModule,
    ChipInput,
  ],
  templateUrl: './collection-form-dialog.html',
  styleUrl: './collection-form-dialog.scss',
})
export class CollectionFormDialog {
  readonly #dialogRef = inject(MatDialogRef<CollectionFormDialog>);
  readonly #data = inject<CollectionFormDialogData>(MAT_DIALOG_DATA);

  readonly #submit = injectCollectionFormSubmit();

  readonly TOKENS = TRACKER_TOKENS;
  readonly configFileMarkup = CONFIG_FILE_MARKUP;

  readonly model = new CollectionForm(this.#data, this.#submit.env);
  /** True from submit until the server has answered. */
  readonly saving = this.model.saving;

  get dialogTitle(): string {
    return this.model.isEditMode
      ? TRACKER_TOKENS.COLLECTIONS.DIALOG.EDIT.TITLE
      : TRACKER_TOKENS.COLLECTIONS.DIALOG.CREATE.TITLE;
  }

  onCancel(): void {
    this.#dialogRef.close();
  }

  onSubmit(): Promise<void> {
    return this.model.submit({ dialog: this.#dialogRef, write: this.#submit.write });
  }
}
