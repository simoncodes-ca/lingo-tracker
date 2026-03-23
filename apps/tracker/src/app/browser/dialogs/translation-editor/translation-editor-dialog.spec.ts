import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import {
  TranslationEditorDialog,
  type TranslationEditorDialogData,
  type TranslationEditorResult,
} from './translation-editor-dialog';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { of, throwError } from 'rxjs';
import { BrowserApiService } from '../../services/browser-api.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';

describe('TranslationEditorDialog', () => {
  let component: TranslationEditorDialog;
  let fixture: ComponentFixture<TranslationEditorDialog>;
  let dialogRef: { close: Mock; afterOpened: Mock };
  let mockDialog: { open: Mock };
  let mockBrowserApi: {
    createResource: Mock;
    updateResource: Mock;
    searchTranslations: Mock;
  };
  let mockSnackBar: { open: Mock };

  const createMockData = (mode: 'create' | 'edit', resource?: ResourceSummaryDto): TranslationEditorDialogData => ({
    mode,
    resource,
    collectionName: 'test-collection',
    folderPath: 'common.buttons',
    availableLocales: ['en', 'fr', 'de'],
    baseLocale: 'en',
  });

  const setupTestBed = async (data: TranslationEditorDialogData) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TranslationEditorDialog, BrowserAnimationsModule, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MatDialog, useValue: mockDialog },
        { provide: BrowserApiService, useValue: mockBrowserApi },
        { provide: MatSnackBar, useValue: mockSnackBar },
        {
          provide: MAT_DIALOG_DATA,
          useValue: data,
        },
      ],
    });

    // Override the provider after configure to ensure our mock takes precedence
    // over the one provided by MatDialogModule
    TestBed.overrideProvider(MatDialog, { useValue: mockDialog });

    await TestBed.compileComponents();

    fixture = TestBed.createComponent(TranslationEditorDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(async () => {
    dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(true),
      }),
    };

    mockBrowserApi = {
      createResource: vi.fn().mockReturnValue(of({})),
      updateResource: vi.fn().mockReturnValue(of({})),
      searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    await setupTestBed(createMockData('create'));
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should display create mode title and subtitle', () => {
      expect(component.dialogTitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATETITLE);
      expect(component.dialogSubtitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATESUBTITLE);
    });

    it('should display edit mode title and subtitle', async () => {
      const editData = createMockData('edit', {
        key: 'test_key',
        translations: { en: 'Test Value' },
        status: {},
      });
      await setupTestBed(editData);

      expect(component.dialogTitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITTITLE);
      expect(component.dialogSubtitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITSUBTITLE);
    });

    it('should display correct folder path', () => {
      expect(component.displayedFolderPath()).toBe('common.buttons');
    });

    it('should display "root" when no folder path provided', async () => {
      const dataWithoutFolder = createMockData('create');
      dataWithoutFolder.folderPath = undefined;
      await setupTestBed(dataWithoutFolder);

      expect(component.displayedFolderPath()).toBe('root');
    });
  });

  describe('Form Validation - Key Field', () => {
    it('should accept alphanumeric characters', () => {
      component.form.controls.key.setValue('test123');
      expect(component.form.controls.key.valid).toBe(true);
    });

    it('should accept underscores', () => {
      component.form.controls.key.setValue('test_key_name');
      expect(component.form.controls.key.valid).toBe(true);
    });

    it('should accept hyphens', () => {
      component.form.controls.key.setValue('test-key-name');
      expect(component.form.controls.key.valid).toBe(true);
    });

    it('should reject dots', () => {
      component.form.controls.key.setValue('test.key');
      expect(component.form.controls.key.hasError('pattern')).toBe(true);
    });

    it('should reject slashes', () => {
      component.form.controls.key.setValue('test/key');
      expect(component.form.controls.key.hasError('pattern')).toBe(true);
    });

    it('should reject special characters', () => {
      const specialChars = ['@', '#', '$', '%', '^', '&', '*', '(', ')'];
      specialChars.forEach((char) => {
        component.form.controls.key.setValue(`test${char}key`);
        expect(component.form.controls.key.hasError('pattern')).toBe(true);
      });
    });

    it('should reject spaces', () => {
      component.form.controls.key.setValue('test key');
      expect(component.form.controls.key.hasError('pattern')).toBe(true);
    });

    it('should require key field', () => {
      component.form.controls.key.setValue('');
      expect(component.form.controls.key.hasError('required')).toBe(true);
    });

    it('should return correct error message for required key', () => {
      component.form.controls.key.setValue('');
      component.form.controls.key.markAsTouched();
      expect(component.getKeyErrorMessage()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYREQUIRED);
    });

    it('should return correct error message for invalid pattern', () => {
      component.form.controls.key.setValue('test.key');
      component.form.controls.key.markAsTouched();
      expect(component.getKeyErrorMessage()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYPATTERNERROR);
    });
  });

  describe('Form Validation - Base Value Field', () => {
    it('should require base value field', () => {
      component.form.controls.baseValue.setValue('');
      expect(component.form.controls.baseValue.hasError('required')).toBe(true);
    });

    it('should accept non-empty base value', () => {
      component.form.controls.baseValue.setValue('Test translation');
      expect(component.form.controls.baseValue.valid).toBe(true);
    });
  });

  describe('Form Validation - Comment Field', () => {
    it('should not require comment field', () => {
      component.form.controls.comment.setValue('');
      expect(component.form.controls.comment.valid).toBe(true);
    });

    it('should accept any comment value', () => {
      component.form.controls.comment.setValue('This is a comment for translators');
      expect(component.form.controls.comment.valid).toBe(true);
    });
  });

  describe('Form Submission', () => {
    it('should block submission when form is invalid', () => {
      component.form.controls.key.setValue('');
      component.form.controls.baseValue.setValue('');
      component.onSubmit();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should allow submission when form is valid', async () => {
      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment');

      await component.onSubmit();

      // In create mode, dialogRef.close is called after API success
      expect(dialogRef.close).toHaveBeenCalled();
      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.key).toBe('test_key');
      expect(result.baseValue).toBe('Test Value');
      expect(result.comment).toBe('Test comment');
    });

    it('should exclude empty comment from result', async () => {
      // For empty comment, the confirmation dialog will be shown
      // Mock it to return true (Save Anyway)
      mockDialog.open.mockReturnValue({
        afterClosed: () => of(true),
      });

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('   ');

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.comment).toBeUndefined();
    });

    it('should use empty string for folderPath when not provided', async () => {
      const dataWithoutFolder = createMockData('create');
      dataWithoutFolder.folderPath = undefined;
      dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({})),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      };
      mockSnackBar = { open: vi.fn() };
      await setupTestBed(dataWithoutFolder);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment'); // Add comment to skip confirmation
      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.folderPath).toBe('');
    });
  });

  describe('Dialog Interaction', () => {
    it('should close dialog on cancel', () => {
      component.onCancel();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('should close dialog on Escape key', () => {
      component.onEscapeKey();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('should trigger save on Ctrl+Enter', async () => {
      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment'); // Add comment to skip confirmation

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
      });
      vi.spyOn(event, 'preventDefault');

      await component.onCtrlEnter(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('should trigger save on Cmd+Enter', async () => {
      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment'); // Add comment to skip confirmation

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
      });
      vi.spyOn(event, 'preventDefault');

      await component.onCtrlEnter(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('should not submit invalid form on Ctrl+Enter', () => {
      component.form.controls.key.setValue('');
      component.form.controls.baseValue.setValue('');

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
      });

      component.onCtrlEnter(event);

      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('Other Locales Toggle', () => {
    it('should default toggle to OFF', () => {
      expect(component.showOtherLocales()).toBe(false);
    });

    it('should toggle ON when clicked', () => {
      component.onToggleOtherLocales();
      expect(component.showOtherLocales()).toBe(true);
    });

    it('should toggle OFF when clicked twice', () => {
      component.onToggleOtherLocales();
      component.onToggleOtherLocales();
      expect(component.showOtherLocales()).toBe(false);
    });

    it('should initialize form controls for all non-base locales', () => {
      const translationsArray = component.form.controls.translations;
      expect(translationsArray.length).toBe(2); // fr and de (en is base)
    });

    it('should initialize all locale controls with empty values in create mode', () => {
      const translationsArray = component.form.controls.translations;
      translationsArray.controls.forEach((control) => {
        expect(control.value.value).toBe('');
        expect(control.value.status).toBe('new');
      });
    });
  });

  describe('Form Submission with Other Locales', () => {
    it('should include filled translations in create mode with status "new"', async () => {
      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment'); // Skip confirmation

      const translationsArray = component.form.controls.translations;
      translationsArray.at(0).patchValue({
        locale: 'fr',
        value: 'Valeur de test',
        status: 'translated',
      });

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.translations).toBeDefined();
      expect(result.translations?.length).toBe(1);
      expect(result.translations?.[0].locale).toBe('fr');
      expect(result.translations?.[0].value).toBe('Valeur de test');
      expect(result.translations?.[0].status).toBe('new');
    });

    it('should exclude empty translations from result', async () => {
      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment'); // Skip confirmation

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.translations).toBeUndefined();
    });

    it('should respect status dropdown values in edit mode', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value', fr: 'Valeur existante' },
        status: { fr: 'translated' },
      };

      const editData = createMockData('edit', mockResource);
      dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({})),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      };
      mockSnackBar = { open: vi.fn() };
      await setupTestBed(editData);

      const translationsArray = component.form.controls.translations;
      const frControl = translationsArray.controls.find((c) => c.value.locale === 'fr');

      frControl?.patchValue({
        status: 'verified',
      });

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.translations).toBeDefined();
      const frTranslation = result.translations?.find((t) => t.locale === 'fr');
      expect(frTranslation?.status).toBe('verified');
    });
  });

  describe('Edit Mode', () => {
    it('should pre-populate form with resource data', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value', fr: 'Valeur existante' },
        status: {},
        comment: 'Existing comment',
      };

      const editData = createMockData('edit', mockResource);
      await setupTestBed(editData);

      expect(component.form.controls.key.value).toBe('existing_key');
      expect(component.form.controls.baseValue.value).toBe('Existing Value');
      expect(component.form.controls.comment.value).toBe('Existing comment');
    });

    it('should handle missing base locale translation', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { fr: 'Valeur' },
        status: {},
      };

      const editData = createMockData('edit', mockResource);
      await setupTestBed(editData);

      expect(component.form.controls.baseValue.value).toBe('');
    });

    it('should handle missing comment', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
      };

      const editData = createMockData('edit', mockResource);
      await setupTestBed(editData);

      expect(component.form.controls.comment.value).toBe('');
    });

    it('should display correct save button label in edit mode', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
      };

      const editData = createMockData('edit', mockResource);
      await setupTestBed(editData);

      expect(component.saveButtonLabel()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UPDATEBUTTON);
    });

    it('should display correct save button label in create mode', () => {
      expect(component.saveButtonLabel()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.SAVEBUTTON);
    });

    it('should pre-populate other locale translations in edit mode', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: {
          en: 'Existing Value',
          fr: 'Valeur existante',
          de: 'Vorhandener Wert',
        },
        status: {
          fr: 'translated',
          de: 'verified',
        },
      };

      const editData = createMockData('edit', mockResource);
      await setupTestBed(editData);

      const translationsArray = component.form.controls.translations;
      const frControl = translationsArray.controls.find((c) => c.value.locale === 'fr');
      const deControl = translationsArray.controls.find((c) => c.value.locale === 'de');

      expect(frControl?.value.value).toBe('Valeur existante');
      expect(frControl?.value.status).toBe('translated');
      expect(deControl?.value.value).toBe('Vorhandener Wert');
      expect(deControl?.value.status).toBe('verified');
    });
  });

  describe('Comment Confirmation Flow', () => {
    beforeEach(async () => {
      dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({})),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      };
      mockSnackBar = { open: vi.fn() };
      await setupTestBed(createMockData('create'));
    });

    it('should save directly when comment is present', async () => {
      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment');

      await component.onSubmit();

      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.key).toBe('test_key');
      expect(result.baseValue).toBe('Test Value');
      expect(result.comment).toBe('Test comment');
    });

    it('should show confirmation dialog when comment is empty', async () => {
      const mockConfirmationDialogRef = {
        afterClosed: vi.fn().mockReturnValue(of(true)),
      };
      mockDialog.open.mockReturnValue(mockConfirmationDialogRef);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('');

      await component.onSubmit();

      expect(mockDialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: {
            title: 'No Comment Added',
            message:
              'Comments help other translators understand context. Are you sure you want to save without a comment?',
            confirmButtonText: 'Save Anyway',
            cancelButtonText: 'Add Comment',
          },
          width: '400px',
          disableClose: true,
        }),
      );
    });

    it('should show confirmation dialog when comment is whitespace only', async () => {
      const mockConfirmationDialogRef = {
        afterClosed: vi.fn().mockReturnValue(of(true)),
      };
      mockDialog.open.mockReturnValue(mockConfirmationDialogRef);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('   ');

      await component.onSubmit();

      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should complete save when user clicks "Save Anyway"', async () => {
      const mockConfirmationDialogRef = {
        afterClosed: vi.fn().mockReturnValue(of(true)),
      };
      mockDialog.open.mockReturnValue(mockConfirmationDialogRef);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('');

      await component.onSubmit();

      expect(dialogRef.close).toHaveBeenCalled();
      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.key).toBe('test_key');
      expect(result.baseValue).toBe('Test Value');
      expect(result.comment).toBeUndefined();
    });

    it('should not save when user clicks "Add Comment"', async () => {
      const mockConfirmationDialogRef = {
        afterClosed: vi.fn().mockReturnValue(of(false)),
      };
      mockDialog.open.mockReturnValue(mockConfirmationDialogRef);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('');

      await component.onSubmit();

      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should not save when user cancels confirmation dialog', async () => {
      const mockConfirmationDialogRef = {
        afterClosed: vi.fn().mockReturnValue(of(undefined)),
      };
      mockDialog.open.mockReturnValue(mockConfirmationDialogRef);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('');

      await component.onSubmit();

      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should not show confirmation again if already shown and user proceeded', async () => {
      const mockConfirmationDialogRef = {
        afterClosed: vi.fn().mockReturnValue(of(true)),
      };
      mockDialog.open.mockReturnValue(mockConfirmationDialogRef);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('');

      await component.onSubmit();

      expect(mockDialog.open).toHaveBeenCalledTimes(1);

      dialogRef.close.mockClear();
      mockDialog.open.mockClear();
      // Reset isSubmitting since the mock dialogRef.close doesn't actually close the dialog
      component.isSubmitting.set(false);

      await component.onSubmit();

      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('should allow showing confirmation again if user cancelled previously', async () => {
      const mockConfirmationDialogRef = {
        afterClosed: vi.fn().mockReturnValue(of(false)),
      };
      mockDialog.open.mockReturnValue(mockConfirmationDialogRef);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('');

      await component.onSubmit();

      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      expect(dialogRef.close).not.toHaveBeenCalled();

      mockDialog.open.mockClear();
      mockConfirmationDialogRef.afterClosed.mockReturnValue(of(true));
      mockDialog.open.mockReturnValue(mockConfirmationDialogRef);

      await component.onSubmit();

      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      expect(dialogRef.close).toHaveBeenCalled();
    });
  });

  describe('skippedLocales propagation', () => {
    it('should include skippedLocales in create result when API returns them', async () => {
      mockBrowserApi.createResource.mockReturnValue(
        of({ entriesCreated: 1, created: true, skippedLocales: ['fr', 'de'] }),
      );

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment');

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.skippedLocales).toEqual(['fr', 'de']);
    });

    it('should omit skippedLocales from create result when API returns empty array', async () => {
      mockBrowserApi.createResource.mockReturnValue(of({ entriesCreated: 1, created: true, skippedLocales: [] }));

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment');

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.skippedLocales).toBeUndefined();
    });

    it('should omit skippedLocales from create result when API omits the field', async () => {
      mockBrowserApi.createResource.mockReturnValue(of({ entriesCreated: 1, created: true }));

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment');

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.skippedLocales).toBeUndefined();
    });

    it('should include skippedLocales in update result when API returns them', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
        comment: 'A comment',
      };

      const editData = createMockData('edit', mockResource);
      dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi
          .fn()
          .mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true, skippedLocales: ['es'] })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }),
      };
      mockSnackBar = { open: vi.fn() };
      await setupTestBed(editData);

      component.form.controls.baseValue.setValue('Updated Value');
      component.form.controls.comment.setValue('Updated comment');

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.skippedLocales).toEqual(['es']);
    });

    it('should omit skippedLocales from update result when API returns empty array', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
        comment: 'A comment',
      };

      const editData = createMockData('edit', mockResource);
      dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi
          .fn()
          .mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true, skippedLocales: [] })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }),
      };
      mockSnackBar = { open: vi.fn() };
      await setupTestBed(editData);

      component.form.controls.baseValue.setValue('Updated Value');
      component.form.controls.comment.setValue('Updated comment');

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.skippedLocales).toBeUndefined();
    });
  });

  describe('Edit Mode API Integration', () => {
    it('should call updateResource API when submitting in edit mode', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value', fr: 'Valeur existante' },
        status: { fr: 'translated' },
        comment: 'Existing comment',
      };

      const editData = createMockData('edit', mockResource);
      dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockSnackBar = { open: vi.fn() };
      await setupTestBed(editData);

      component.form.controls.baseValue.setValue('Updated Value');
      component.form.controls.comment.setValue('Updated comment');

      await component.onSubmit();

      expect(mockBrowserApi.updateResource).toHaveBeenCalledWith(
        'test-collection',
        expect.objectContaining({
          key: 'common.buttons.existing_key',
          baseValue: 'Updated Value',
          comment: 'Updated comment',
        }),
      );
      expect(dialogRef.close).toHaveBeenCalled();
    });

    it('should include translations in update API call', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value', fr: 'Valeur existante' },
        status: { fr: 'translated' },
      };

      const editData = createMockData('edit', mockResource);
      dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockSnackBar = { open: vi.fn() };
      await setupTestBed(editData);

      const translationsArray = component.form.controls.translations;
      const frControl = translationsArray.controls.find((c) => c.value.locale === 'fr');
      frControl?.patchValue({ value: 'Nouvelle valeur' });

      await component.onSubmit();

      expect(mockBrowserApi.updateResource).toHaveBeenCalledWith(
        'test-collection',
        expect.objectContaining({
          locales: {
            fr: { value: 'Nouvelle valeur', status: 'translated' },
          },
        }),
      );
    });

    it('should show error when key is changed in edit mode', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
      };

      const editData = createMockData('edit', mockResource);
      await setupTestBed(editData);

      component.form.controls.key.setValue('new_key');
      await component.onSubmit();

      expect(component.errorMessage()).toBe(
        'Key renaming is not yet supported. Please use the same key or create a new resource.',
      );
      expect(mockBrowserApi.updateResource).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should handle update API errors', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
      };

      const editData = createMockData('edit', mockResource);
      dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(
          throwError(
            () =>
              new HttpErrorResponse({
                status: 404,
                statusText: 'Not Found',
                error: { message: 'Resource not found' },
              }),
          ),
        ),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockSnackBar = { open: vi.fn() };
      await setupTestBed(editData);

      await component.onSubmit();

      expect(component.errorMessage()).toBe('Resource not found. It may have been deleted.');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should close dialog with success result on successful update', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value', fr: 'Valeur existante' },
        status: { fr: 'translated' },
        comment: 'Existing comment',
      };

      const editData = createMockData('edit', mockResource);
      dialogRef = { close: vi.fn(), afterOpened: vi.fn().mockReturnValue(of(undefined)) };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockSnackBar = { open: vi.fn() };
      await setupTestBed(editData);

      component.form.controls.baseValue.setValue('Updated Value');

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.success).toBe(true);
      expect(result.key).toBe('existing_key');
      expect(result.baseValue).toBe('Updated Value');
    });
  });
});
