import { OverlayModule } from '@angular/cdk/overlay';
import { TextFieldModule } from '@angular/cdk/text-field';
import { CommonModule } from '@angular/common';
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  type OnDestroy,
  type OnInit,
  ViewChild,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { CollectionsStore } from '../../../collections/store/collections.store';
import { ChipInput } from '../../../shared/chip-input/chip-input';
import { injectConfirm } from '../../../shared/confirm';
import { NotificationService } from '../../../shared/notification';
import { injectFeedback } from '../../feedback';
import { FolderPeek } from '../../services/folder-peek';
import { SimilarValues } from '../../services/similar-values';
import { BrowserStore } from '../../store/browser.store';
import { EditorFocus } from './editor-focus';
import { EditorFocusAnchorDirective } from './editor-focus-anchor';
import { EditorSession, type TranslationEditorDialogData } from './editor-session';
import type { EditorOutcome } from './editor-submit';
import { FolderPicker } from './folder-picker/folder-picker';
import { PreferredTermAdvisories } from './preferred-term-advisories/preferred-term-advisories';
import { SimilarTranslations } from './similar-translations';

export const TRANSLATION_EDITOR_TITLE_ID = 'translation-editor-title';

@Component({
  standalone: true,
  selector: 'app-translation-editor-dialog',
  templateUrl: './translation-editor-dialog.html',
  styleUrls: ['./translation-editor-dialog.scss', './translation-editor-context.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [{ provide: EditorFocus, useFactory: () => new EditorFocus() }],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    OverlayModule,
    TextFieldModule,
    MatAutocompleteModule,
    SimilarTranslations,
    FolderPicker,
    TranslocoPipe,
    MatTooltipModule,
    PreferredTermAdvisories,
    ChipInput,
    EditorFocusAnchorDirective,
  ],
})
export class TranslationEditorDialog implements OnInit, OnDestroy, AfterViewInit {
  private readonly dialogRef = inject<MatDialogRef<TranslationEditorDialog, EditorOutcome>>(MatDialogRef);
  private readonly destroy$ = new Subject<void>();
  readonly TOKENS = TRACKER_TOKENS;
  readonly titleId = TRANSLATION_EDITOR_TITLE_ID;
  readonly data = inject<TranslationEditorDialogData>(MAT_DIALOG_DATA);
  /** The tree inside the location popover, so "New folder" can reuse its creation flow. */
  @ViewChild(FolderPicker) folderPicker?: FolderPicker;

  readonly #focus = inject(EditorFocus);

  private readonly transloco = inject(TranslocoService);
  readonly session = new EditorSession(this.data, {
    browser: inject(BrowserStore),
    config: inject(CollectionsStore).config,
    peek: inject(FolderPeek).openFolderPeek(),
    similar: inject(SimilarValues),
    translate: (token, params) => this.transloco.translate(token, params),
    activeLang: () => this.transloco.getActiveLang(),
    confirm: injectConfirm(),
    close: (outcome) => this.dialogRef.close(outcome),
    editorFocus: this.#focus,
    feedbackText: injectFeedback().text,
    notifications: inject(NotificationService),
  });

  readonly presentation = this.session.presentation;

  ngOnInit(): void {
    this.dialogRef.disableClose = true;
    this.dialogRef
      .keydownEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          void this.session.onCancel();
        }
      });
    this.dialogRef
      .backdropClick()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => void this.session.onCancel());
  }

  ngAfterViewInit(): void {
    this.dialogRef
      .afterOpened()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.#focus.request(this.session.isEditMode() ? 'base-value' : 'key');
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.session.destroy();
  }

  @HostListener('window:keydown.control.enter', ['$event'])
  @HostListener('window:keydown.meta.enter', ['$event'])
  async onCtrlEnter(event: Event): Promise<void> {
    event.preventDefault();
    await this.session.onSubmit();
  }

  onFolderFilterInput(event: Event): void {
    this.session.panels.setFolderFilter((event.target as HTMLInputElement).value);
  }

  onTagInputChange(event: Event): void {
    this.session.tagInputText.set((event.target as HTMLInputElement).value);
  }

  addTagFromAutocomplete(event: MatAutocompleteSelectedEvent, input: HTMLInputElement): void {
    this.session.addTagValue(event.option.value as string);
    input.value = '';
  }

  startNewFolder(): void {
    this.folderPicker?.onAddFolder(this.session.popoverFolderPath());
  }
}
