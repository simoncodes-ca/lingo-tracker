import {
  Component,
  ChangeDetectionStrategy,
  inject,
  type OnInit,
  type OnDestroy,
  type AfterViewInit,
  signal,
  computed,
  HostListener,
  ViewChild,
  type ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators, FormArray } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TextFieldModule } from '@angular/cdk/text-field';
import type {
  ResourceSummaryDto,
  TranslationStatus,
  CreateResourceDto,
  CreateResourceResponseDto,
  UpdateResourceDto,
  UpdateResourceResponseDto,
  SearchResultDto,
  FolderNodeDto,
} from '@simoncodes-ca/data-transfer';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../../store/browser.store';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationDialog } from '../../../shared/components/confirmation-dialog/confirmation-dialog';
import type { ConfirmationDialogData } from '../../../shared/components/confirmation-dialog/confirmation-dialog-data';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { SimilarTranslations } from './similar-translations';
import { FolderPicker } from './folder-picker/folder-picker';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError, takeUntil, tap } from 'rxjs/operators';
import { of } from 'rxjs';

export interface TranslationEditorDialogData {
  mode: 'create' | 'edit';
  resource?: ResourceSummaryDto;
  collectionName: string;
  folderPath?: string;
  availableLocales: string[];
  baseLocale: string;
}

interface TranslationFormValue {
  key: string;
  baseValue: string;
  comment: string;
  translations: LocaleTranslation[];
}

interface LocaleTranslation {
  locale: string;
  value: string;
  status: TranslationStatus;
}

export interface TranslationEditorResult {
  key: string;
  baseValue: string;
  comment?: string;
  folderPath: string;
  translations?: LocaleTranslation[];
  success?: boolean;
  shouldOpenEdit?: boolean;
  existingResourceKey?: string;
  resource?: ResourceSummaryDto;
  /** Locales skipped during auto-translation due to ICU format incompatibility. */
  skippedLocales?: string[];
}

@Component({
  standalone: true,
  selector: 'app-translation-editor-dialog',
  templateUrl: './translation-editor-dialog.html',
  styleUrls: ['./translation-editor-dialog.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    TextFieldModule,
    SimilarTranslations,
    FolderPicker,
    TranslocoPipe,
  ],
})
export class TranslationEditorDialog implements OnInit, OnDestroy, AfterViewInit {
  private readonly dialogRef = inject(MatDialogRef<TranslationEditorDialog>);
  private readonly dialog = inject(MatDialog);
  private readonly browserApi = inject(BrowserApiService);
  private readonly browserStore = inject(BrowserStore);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly destroy$ = new Subject<void>();
  private readonly baseValueSearch$ = new Subject<string>();

  readonly data = inject<TranslationEditorDialogData>(MAT_DIALOG_DATA);
  readonly TOKENS = TRACKER_TOKENS;

  @ViewChild('keyInput') keyInput?: ElementRef<HTMLInputElement>;
  @ViewChild('baseValueInput') baseValueInput?: ElementRef<HTMLInputElement>;

  #commentConfirmationShown = false;
  #originalBaseValue = '';

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly similarResources = signal<SearchResultDto[]>([]);
  readonly isSearchingSimilar = signal(false);
  readonly baseValueLength = signal(0);

  readonly form = new FormGroup({
    key: new FormControl<string>('', {
      validators: [Validators.required, Validators.pattern(/^[a-zA-Z0-9_-]+$/)],
      nonNullable: true,
    }),
    baseValue: new FormControl<string>('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
    comment: new FormControl<string>('', {
      nonNullable: true,
    }),
    translations: new FormArray<
      FormGroup<{
        locale: FormControl<string>;
        value: FormControl<string>;
        status: FormControl<TranslationStatus>;
      }>
    >([]),
  });

  readonly showOtherLocales = signal(false);
  readonly selectedFolderPath = signal<string>('');

  readonly rootFolders = computed(() => this.browserStore.rootFolders());

  readonly otherLocales = computed(() =>
    this.data.availableLocales.filter((locale) => locale !== this.data.baseLocale),
  );

  readonly translationStatusOptions: TranslationStatus[] = ['new', 'translated', 'stale', 'verified'];

  readonly isEditMode = computed(() => this.data.mode === 'edit');
  readonly dialogTitle = computed(() =>
    this.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITTITLE
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATETITLE,
  );
  readonly dialogSubtitle = computed(() =>
    this.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITSUBTITLE
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATESUBTITLE,
  );
  readonly saveButtonLabel = computed(() =>
    this.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UPDATEBUTTON
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.SAVEBUTTON,
  );
  readonly displayedFolderPath = computed(() => this.data.folderPath || 'root');
  readonly hasSearchQuery = computed(() => this.baseValueLength() >= 3);

  ngOnInit(): void {
    // Initialize folder path from dialog data
    this.selectedFolderPath.set(this.data.folderPath || '');
    this.#initializeOtherLocaleFormControls();

    if (this.isEditMode() && this.data.resource) {
      const baseValue = this.data.resource.translations[this.data.baseLocale] || '';
      const comment = this.data.resource.comment || '';

      this.form.patchValue({
        key: this.data.resource.key,
        baseValue,
        comment,
      });

      this.#originalBaseValue = baseValue;

      this.#populateOtherLocaleTranslations();
    } else if (this.data.folderPath) {
      // In create mode, we might have a pre-selected folder
      // The folder path is stored in data, not in the form
    }

    this.#setupSimilarResourcesSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit(): void {
    this.dialogRef.afterOpened().subscribe(() => {
      if (this.isEditMode()) {
        this.baseValueInput?.nativeElement.focus();
      } else {
        this.keyInput?.nativeElement.focus();
      }
    });
  }

  #initializeOtherLocaleFormControls(): void {
    const translationsArray = this.form.controls.translations;
    translationsArray.clear();

    this.otherLocales().forEach((locale) => {
      const localeGroup = new FormGroup({
        locale: new FormControl<string>(locale, { nonNullable: true }),
        value: new FormControl<string>('', { nonNullable: true }),
        status: new FormControl<TranslationStatus>('new', {
          nonNullable: true,
        }),
      });

      translationsArray.push(localeGroup);
    });
  }

  #populateOtherLocaleTranslations(): void {
    if (!this.data.resource) {
      return;
    }

    const translationsArray = this.form.controls.translations;

    translationsArray.controls.forEach((control) => {
      const locale = control.value.locale;
      if (!locale) {
        return;
      }
      const value = this.data.resource?.translations[locale] || '';
      const status = this.data.resource?.status[locale] || 'new';

      control.patchValue({ value, status });
    });
  }

  #setupSimilarResourcesSearch(): void {
    this.form.controls.baseValue.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.baseValueLength.set(value.trim().length);
      const shouldSearch = this.#shouldSearchForSimilar(value);
      if (shouldSearch) {
        this.baseValueSearch$.next(value);
      } else {
        this.similarResources.set([]);
      }
    });

    this.baseValueSearch$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        tap(() => this.isSearchingSimilar.set(true)),
        switchMap((query) => {
          if (!query || query.trim().length < 3) {
            return of({
              query: '',
              results: [],
              totalFound: 0,
              limited: false,
            });
          }

          return this.browserApi.searchTranslations(this.data.collectionName, query, 10).pipe(
            catchError(() =>
              of({
                query: '',
                results: [],
                totalFound: 0,
                limited: false,
              }),
            ),
          );
        }),
        tap(() => this.isSearchingSimilar.set(false)),
        takeUntil(this.destroy$),
      )
      .subscribe((searchResults) => {
        // Filter out current resource in edit mode
        const filteredResults =
          this.isEditMode() && this.data.resource
            ? searchResults.results.filter((r) => r.key !== this.#buildOriginalFullKey())
            : searchResults.results;
        this.similarResources.set(filteredResults);
      });
  }

  #shouldSearchForSimilar(currentValue: string): boolean {
    if (!currentValue || currentValue.trim().length < 3) {
      return false;
    }

    if (this.isEditMode()) {
      return currentValue !== this.#originalBaseValue;
    }

    return true;
  }

  @HostListener('window:keydown.escape')
  onEscapeKey(): void {
    this.onCancel();
  }

  @HostListener('window:keydown.control.enter', ['$event'])
  @HostListener('window:keydown.meta.enter', ['$event'])
  onCtrlEnter(event: Event): void {
    event.preventDefault();
    this.onSubmit();
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onToggleOtherLocales(): void {
    this.showOtherLocales.set(!this.showOtherLocales());
  }

  onFolderConfirmed(folderPath: string): void {
    this.selectedFolderPath.set(folderPath);
  }

  onFolderCreated(folder: FolderNodeDto): void {
    // Store's createFolderAt already updated rootFolders, just update selection
    this.selectedFolderPath.set(folder.fullPath);
  }

  onSimilarResourceClick(result: SearchResultDto): void {
    const fullKey = result.key;
    this.#copyToClipboard(fullKey, this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYCOPIED));
  }

  #copyToClipboard(text: string, successMessage: string): void {
    const failedMessage = this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COPYFAILED);

    if (!navigator.clipboard?.writeText) {
      this.snackBar.open(failedMessage, '', {
        duration: 2000,
        panelClass: ['error-snackbar'],
      });
      return;
    }

    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.snackBar.open(successMessage, '', {
          duration: 2000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
        });
      })
      .catch(() => {
        this.snackBar.open(failedMessage, '', {
          duration: 2000,
          panelClass: ['error-snackbar'],
        });
      });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    const formValue = this.form.getRawValue() as TranslationFormValue;
    const commentValue = formValue.comment.trim();

    if (!commentValue && !this.#commentConfirmationShown) {
      const shouldProceed = await this.#showCommentConfirmation();

      if (!shouldProceed) {
        return;
      }
    }

    if (this.isEditMode()) {
      this.#handleEditSubmit(formValue, commentValue);
    } else {
      this.#handleCreateSubmit(formValue, commentValue);
    }
  }

  #handleEditSubmit(formValue: TranslationFormValue, commentValue: string): void {
    if (!this.data.resource) {
      this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.MISSINGRESOURCE));
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const originalKey = this.#buildOriginalFullKey();
    const newKey = formValue.key;
    const newFolderPath = this.selectedFolderPath();
    const originalFolderPath = this.data.folderPath || '';

    const hasKeyChanged = newKey !== this.data.resource.key;
    const hasFolderChanged = newFolderPath !== originalFolderPath;

    if (hasKeyChanged) {
      this.isSubmitting.set(false);
      this.errorMessage.set(
        this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.KEYRENAMINGNOTSUPPORTED),
      );
      return;
    }

    const filledTranslations = formValue.translations.filter((translation) => {
      const hasValue = translation.value.trim().length > 0;
      const originalStatus = this.data.resource?.status[translation.locale] ?? 'new';
      const hasStatusChange = translation.status !== originalStatus;
      return hasValue || hasStatusChange;
    });

    const locales: Record<string, { value: string; status: TranslationStatus }> = {};
    filledTranslations.forEach((translation) => {
      locales[translation.locale] = { value: translation.value, status: translation.status };
    });

    const updateDto: UpdateResourceDto = {
      key: originalKey,
      baseValue: formValue.baseValue,
      comment: commentValue || undefined,
    };

    if (hasFolderChanged) {
      updateDto.targetFolder = newFolderPath || undefined;
    }

    if (Object.keys(locales).length > 0) {
      updateDto.locales = locales;
    }

    this.browserApi.updateResource(this.data.collectionName, updateDto).subscribe({
      next: (response: UpdateResourceResponseDto) => {
        this.dialogRef.close({
          key: newKey,
          baseValue: formValue.baseValue,
          comment: commentValue || undefined,
          folderPath: newFolderPath,
          translations: filledTranslations.length > 0 ? filledTranslations : undefined,
          success: true,
          resource: response.resource,
          skippedLocales: response.skippedLocales?.length ? response.skippedLocales : undefined,
        });
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.#handleUpdateError(error);
      },
    });
  }

  #handleCreateSubmit(formValue: TranslationFormValue, commentValue: string): void {
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    const fullKey = this.#buildFullKey(formValue.key);

    const filledTranslations = formValue.translations
      .filter((translation) => translation.value.trim().length > 0)
      .map((translation) => ({
        locale: translation.locale,
        value: translation.value,
        status: 'new' as TranslationStatus,
      }));

    const createDto: CreateResourceDto = {
      key: fullKey,
      baseValue: formValue.baseValue,
      comment: commentValue || undefined,
      baseLocale: this.data.baseLocale,
      translations: filledTranslations.length > 0 ? filledTranslations : undefined,
    };

    this.browserApi.createResource(this.data.collectionName, createDto).subscribe({
      next: (response: CreateResourceResponseDto) => {
        this.dialogRef.close({
          key: formValue.key,
          baseValue: formValue.baseValue,
          comment: commentValue || undefined,
          folderPath: this.selectedFolderPath(),
          translations: filledTranslations.length > 0 ? filledTranslations : undefined,
          success: true,
          skippedLocales: response.skippedLocales?.length ? response.skippedLocales : undefined,
        });
      },
      error: (error: unknown) => {
        this.isSubmitting.set(false);
        this.#handleCreateError(error, fullKey);
      },
    });
  }

  #buildFullKey(key: string): string {
    const folderPath = this.selectedFolderPath();
    if (!folderPath) {
      return key;
    }
    return `${folderPath}.${key}`;
  }

  #buildOriginalFullKey(): string {
    if (!this.data.resource) {
      return '';
    }
    const folderPath = this.data.folderPath || '';
    const key = this.data.resource.key;
    if (!folderPath) {
      return key;
    }
    return `${folderPath}.${key}`;
  }

  #handleCreateError(error: unknown, fullKey: string): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        this.#showKeyConflictDialog(fullKey);
        return;
      }

      if (error.status === 400) {
        const message =
          error.error?.message ||
          error.message ||
          this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.INVALIDREQUEST);
        this.errorMessage.set(message);
        return;
      }

      this.errorMessage.set(
        error.error?.message ||
          error.message ||
          this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.CREATEFAILED),
      );
      return;
    }

    this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.UNEXPECTED));
  }

  #handleUpdateError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.NOTFOUND));
        return;
      }

      if (error.status === 400) {
        const message =
          error.error?.message ||
          error.message ||
          this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.INVALIDREQUEST);
        this.errorMessage.set(message);
        return;
      }

      this.errorMessage.set(
        error.error?.message ||
          error.message ||
          this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.UPDATEFAILED),
      );
      return;
    }

    this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR.UNEXPECTED));
  }

  #showKeyConflictDialog(existingKey: string): void {
    const dialogData: ConfirmationDialogData = {
      title: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.TITLE),
      message: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.MESSAGEX, {
        key: existingKey,
      }),
      confirmButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.EDITEXISTING),
      cancelButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.CHOOSEDIFFERENTKEY),
    };

    const dialogRef = this.dialog.open<ConfirmationDialog, ConfirmationDialogData, boolean>(ConfirmationDialog, {
      data: dialogData,
      width: '500px',
    });

    dialogRef.afterClosed().subscribe((shouldEditExisting) => {
      if (shouldEditExisting) {
        this.dialogRef.close({
          key: this.form.controls.key.value,
          baseValue: this.form.controls.baseValue.value,
          comment: this.form.controls.comment.value.trim() || undefined,
          folderPath: this.selectedFolderPath(),
          shouldOpenEdit: true,
          existingResourceKey: existingKey,
        });
      }
    });
  }

  async #showCommentConfirmation(): Promise<boolean> {
    this.#commentConfirmationShown = true;

    const confirmationDialogData: ConfirmationDialogData = {
      title: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.TITLE),
      message: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.MESSAGE),
      confirmButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.SAVEANYWAY),
      cancelButtonText: this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.ADDCOMMENT),
    };

    const confirmationDialogRef = this.dialog.open(ConfirmationDialog, {
      data: confirmationDialogData,
      width: '400px',
      disableClose: true,
    });

    const confirmed = await confirmationDialogRef.afterClosed().toPromise();

    if (!confirmed) {
      this.#commentConfirmationShown = false;
    }

    return confirmed === true;
  }

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

  getLocaleDisplayName(locale: string | undefined): string {
    return locale ? locale.toUpperCase() : '';
  }

  getKeyErrorMessage(): string {
    const keyControl = this.form.controls.key;

    if (keyControl.hasError('required')) {
      return TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYREQUIRED;
    }

    if (keyControl.hasError('pattern')) {
      return TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYPATTERNERROR;
    }

    return '';
  }
}
