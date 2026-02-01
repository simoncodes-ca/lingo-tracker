import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormGroup,
  FormControl,
  Validators,
  FormArray,
} from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialog,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TextFieldModule } from '@angular/cdk/text-field';
import {
  ResourceSummaryDto,
  TranslationStatus,
  CreateResourceDto,
  UpdateResourceDto,
  SearchResultDto,
  FolderNodeDto,
} from '@simoncodes-ca/data-transfer';
import { TranslationApiService } from '../../services/translation-api.service';
import { BrowserApiService } from '../../services/browser-api.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ConfirmationDialog } from '../../../shared/components/confirmation-dialog/confirmation-dialog';
import { ConfirmationDialogData } from '../../../shared/components/confirmation-dialog/confirmation-dialog-data';
import { SimilarResourcesWarning } from './similar-resources-warning';
import { FolderPicker } from './folder-picker/folder-picker';
import { Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  takeUntil,
} from 'rxjs/operators';
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
    SimilarResourcesWarning,
    FolderPicker,
  ],
})
export class TranslationEditorDialog implements OnInit, OnDestroy {
  private readonly dialogRef = inject(
    MatDialogRef<TranslationEditorDialog>
  );
  private readonly dialog = inject(MatDialog);
  private readonly translationApi = inject(TranslationApiService);
  private readonly browserApi = inject(BrowserApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroy$ = new Subject<void>();
  private readonly baseValueSearch$ = new Subject<string>();

  readonly data = inject<TranslationEditorDialogData>(MAT_DIALOG_DATA);

  #commentConfirmationShown = false;
  #originalBaseValue = '';

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly similarResources = signal<SearchResultDto[]>([]);
  readonly isSearchingSimilar = signal(false);

  readonly form = new FormGroup({
    key: new FormControl<string>('', {
      validators: [
        Validators.required,
        Validators.pattern(/^[a-zA-Z0-9_-]+$/),
      ],
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
  readonly baseValueCharacterCount = signal(0);
  readonly commentCharacterCount = signal(0);
  readonly localeCharacterCounts = signal<Record<string, number>>({});
  readonly selectedFolderPath = signal<string>('');

  // Stub for folder picker - store not yet implemented
  readonly store = {
    rootFolders: () => [] as FolderNodeDto[],
  };
  readonly folderExists = computed(() => true);

  readonly otherLocales = computed(() =>
    this.data.availableLocales.filter(
      (locale) => locale !== this.data.baseLocale
    )
  );

  readonly translationStatusOptions: TranslationStatus[] = [
    'new',
    'translated',
    'stale',
    'verified',
  ];

  readonly isEditMode = computed(() => this.data.mode === 'edit');
  readonly dialogTitle = computed(() =>
    this.isEditMode() ? 'Edit Translation' : 'Create Translation'
  );
  readonly dialogSubtitle = computed(() =>
    this.isEditMode()
      ? 'Update translation values and metadata'
      : 'Add a new translation entry to your collection'
  );
  readonly saveButtonLabel = computed(() =>
    this.isEditMode() ? 'Update Translation' : 'Save Translation'
  );
  readonly displayedFolderPath = computed(() =>
    this.data.folderPath || 'root'
  );

  ngOnInit(): void {
    // Initialize folder path from dialog data
    this.selectedFolderPath.set(this.data.folderPath || '');
    this.#initializeOtherLocaleFormControls();

    if (this.isEditMode() && this.data.resource) {
      const baseValue =
        this.data.resource.translations[this.data.baseLocale] || '';
      const comment = this.data.resource.comment || '';

      this.form.patchValue({
        key: this.data.resource.key,
        baseValue,
        comment,
      });

      this.baseValueCharacterCount.set(baseValue.length);
      this.commentCharacterCount.set(comment.length);
      this.#originalBaseValue = baseValue;

      this.#populateOtherLocaleTranslations();
    } else if (this.data.folderPath) {
      // In create mode, we might have a pre-selected folder
      // The folder path is stored in data, not in the form
    }

    this.#setupCharacterCountTracking();
    this.#setupSimilarResourcesSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
    const counts: Record<string, number> = {};

    translationsArray.controls.forEach((control) => {
      const locale = control.value.locale;
      if (!locale) {
        return;
      }
      const value = this.data.resource?.translations[locale] || '';
      const status = this.data.resource?.status[locale] || 'new';

      control.patchValue({ value, status });
      counts[locale] = value.length;
    });

    this.localeCharacterCounts.set(counts);
  }

  #setupCharacterCountTracking(): void {
    this.form.controls.baseValue.valueChanges.subscribe((value) => {
      this.baseValueCharacterCount.set(value.length);
    });

    this.form.controls.comment.valueChanges.subscribe((value) => {
      this.commentCharacterCount.set(value.length);
    });

    this.form.controls.translations.valueChanges.subscribe((translations) => {
      const counts: Record<string, number> = {};
      translations.forEach((translation) => {
        if (translation.locale && translation.value) {
          counts[translation.locale] = translation.value.length;
        }
      });
      this.localeCharacterCounts.set(counts);
    });
  }

  #setupSimilarResourcesSearch(): void {
    this.form.controls.baseValue.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => {
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
        switchMap((query) => {
          if (!query || query.trim().length < 3) {
            this.isSearchingSimilar.set(false);
            return of({
              query: '',
              results: [],
              totalFound: 0,
              limited: false,
            });
          }

          this.isSearchingSimilar.set(true);
          return this.browserApi
            .searchTranslations(this.data.collectionName, query, 10)
            .pipe(
              catchError(() => {
                this.isSearchingSimilar.set(false);
                return of({
                  query: '',
                  results: [],
                  totalFound: 0,
                  limited: false,
                });
              })
            );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((searchResults) => {
        this.isSearchingSimilar.set(false);
        this.similarResources.set(searchResults.results);
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

  onFolderSelected(folderPath: string): void {
    this.selectedFolderPath.set(folderPath);
  }

  onLoadFolder(_folderPath: string): void {
    // Stub - folder loading not yet implemented
  }

  onSimilarResourceClick(result: SearchResultDto): void {
    const fullKey = result.key;
    this.#copyToClipboard(fullKey, 'Similar resource key copied');
  }

  #copyToClipboard(text: string, successMessage: string): void {
    if (!navigator.clipboard?.writeText) {
      this.snackBar.open('Failed to copy', '', {
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
        this.snackBar.open('Failed to copy', '', {
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

  #handleEditSubmit(
    formValue: TranslationFormValue,
    commentValue: string
  ): void {
    if (!this.data.resource) {
      this.errorMessage.set('Cannot update: resource data is missing');
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
        'Key renaming is not yet supported. Please use the same key or create a new resource.'
      );
      return;
    }

    const filledTranslations = formValue.translations.filter(
      (translation) => translation.value.trim().length > 0
    );

    const locales: Record<string, { value: string }> = {};
    filledTranslations.forEach((translation) => {
      locales[translation.locale] = { value: translation.value };
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

    this.translationApi
      .updateResource(this.data.collectionName, updateDto)
      .subscribe({
        next: () => {
          this.dialogRef.close({
            key: newKey,
            baseValue: formValue.baseValue,
            comment: commentValue || undefined,
            folderPath: newFolderPath,
            translations:
              filledTranslations.length > 0 ? filledTranslations : undefined,
            success: true,
          });
        },
        error: (error: unknown) => {
          this.isSubmitting.set(false);
          this.#handleUpdateError(error);
        },
      });
  }

  #handleCreateSubmit(
    formValue: TranslationFormValue,
    commentValue: string
  ): void {
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
      translations:
        filledTranslations.length > 0 ? filledTranslations : undefined,
    };

    this.translationApi
      .createResource(this.data.collectionName, createDto)
      .subscribe({
        next: () => {
          this.dialogRef.close({
            key: formValue.key,
            baseValue: formValue.baseValue,
            comment: commentValue || undefined,
            folderPath: this.selectedFolderPath(),
            translations:
              filledTranslations.length > 0 ? filledTranslations : undefined,
            success: true,
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
          error.error?.message || error.message || 'Invalid request';
        this.errorMessage.set(message);
        return;
      }

      this.errorMessage.set(
        error.error?.message ||
          error.message ||
          'Failed to create translation'
      );
      return;
    }

    this.errorMessage.set('An unexpected error occurred');
  }

  #handleUpdateError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        this.errorMessage.set('Resource not found. It may have been deleted.');
        return;
      }

      if (error.status === 400) {
        const message =
          error.error?.message || error.message || 'Invalid request';
        this.errorMessage.set(message);
        return;
      }

      this.errorMessage.set(
        error.error?.message ||
          error.message ||
          'Failed to update translation'
      );
      return;
    }

    this.errorMessage.set('An unexpected error occurred');
  }

  #showKeyConflictDialog(existingKey: string): void {
    const dialogData: ConfirmationDialogData = {
      title: 'Translation Key Already Exists',
      message: `The translation key "${existingKey}" already exists in this collection. Would you like to edit the existing translation or choose a different key?`,
      confirmButtonText: 'Edit Existing',
      cancelButtonText: 'Choose Different Key',
    };

    const dialogRef = this.dialog.open<
      ConfirmationDialog,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialog, {
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
      title: 'No Comment Added',
      message:
        'Comments help other translators understand context. Are you sure you want to save without a comment?',
      confirmButtonText: 'Save Anyway',
      cancelButtonText: 'Add Comment',
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

  getLocaleCharacterCount(locale: string | undefined): number {
    if (!locale) {
      return 0;
    }
    return this.localeCharacterCounts()[locale] || 0;
  }

  getLocaleFormGroup(
    index: number
  ): FormGroup<{
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
      return 'Translation key is required';
    }

    if (keyControl.hasError('pattern')) {
      return 'Only letters, numbers, underscores, and hyphens allowed';
    }

    return '';
  }
}
