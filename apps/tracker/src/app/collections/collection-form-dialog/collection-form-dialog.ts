import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { ChipInput } from '../../shared/chip-input/chip-input';
import { injectConfirm } from '../../shared/confirm';
import { CollectionsStore } from '../store/collections.store';
import { NamedEntrySubmit } from '../store/dialog-config-submit';
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
  readonly #confirm = injectConfirm();
  readonly #translocoService = inject(TranslocoService);
  readonly #destroyRef = inject(DestroyRef);
  readonly #store = inject(CollectionsStore);

  readonly TOKENS = TRACKER_TOKENS;
  /** The config file name, wrapped in our own `<code>` so hints can set it in mono inside translated prose. */
  readonly configFileMarkup = '<code>.lingo-tracker.json</code>';

  /** True from submit until the server has answered. */
  readonly saving = signal(false);

  /** Owns the server-taken-name validator and the create/update submit. */
  readonly #namedEntrySubmit: NamedEntrySubmit<CollectionFormResult> = new NamedEntrySubmit({
    nameControl: (): FormControl<string> => this.model.form.controls.name,
    fallbackTokens: {
      create: TRACKER_TOKENS.COLLECTIONS.TOAST.CREATEFAILED,
      update: TRACKER_TOKENS.COLLECTIONS.TOAST.UPDATEFAILED,
    },
    translate: (token) => this.#translocoService.translate(token),
    dialogRef: this.#dialogRef,
    saving: this.saving,
    destroyRef: this.#destroyRef,
  });

  readonly model = new CollectionForm(this.#data, this.#namedEntrySubmit.nameValidator);

  constructor() {
    this.#destroyRef.onDestroy(() => this.model.destroy());
  }

  get dialogTitle(): string {
    return this.model.isEditMode
      ? TRACKER_TOKENS.COLLECTIONS.DIALOG.EDIT.TITLE
      : TRACKER_TOKENS.COLLECTIONS.DIALOG.CREATE.TITLE;
  }

  onCancel(): void {
    this.#dialogRef.close();
  }

  async onSubmit(): Promise<void> {
    if (this.saving() || !this.model.validate()) return;

    const removed = this.model.removedLocales();
    if (removed.length > 0) {
      const confirmed = await this.#confirm({
        title: TRACKER_TOKENS.COLLECTIONS.DIALOG.REMOVECONFIRMTITLE,
        message: {
          token: TRACKER_TOKENS.COLLECTIONS.DIALOG.REMOVECONFIRMBODY,
          params: { locales: removed.join(', ') },
        },
        confirmButtonText: TRACKER_TOKENS.COMMON.ACTIONS.SAVE,
        actionType: 'destructive',
      });
      if (!confirmed) return;
    }
    this.#save();
  }

  #save(): void {
    const result = this.model.result();
    const existingName = this.model.isEditMode ? this.#data.name : undefined;
    this.model.submitError.set(null);
    this.#namedEntrySubmit.submit({
      existingName,
      name: result.name,
      create: () => this.#store.createCollection({ name: result.name, collection: result.config }),
      update: (name, patch) => this.#store.updateCollection(name, { ...patch, collection: result.config }),
      result,
      onRefusal: (refusal) => {
        if (refusal.kind === 'message') this.model.submitError.set(refusal.message);
      },
    });
  }
}
