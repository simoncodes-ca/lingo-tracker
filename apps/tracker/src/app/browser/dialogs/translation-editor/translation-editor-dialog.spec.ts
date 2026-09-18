import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { patchState } from '@ngrx/signals';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { NotificationService } from '../../../shared/notification';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../../store/browser.store';
import {
  TranslationEditorDialog,
  TRANSLATION_EDITOR_TITLE_ID,
  type TranslationEditorDialogData,
  type TranslationEditorResult,
} from './translation-editor-dialog';

describe('TranslationEditorDialog', () => {
  let component: TranslationEditorDialog;
  let fixture: ComponentFixture<TranslationEditorDialog>;
  let spectator: Spectator<TranslationEditorDialog>;
  let dialogRef: { close: Mock; afterOpened: Mock };
  let mockDialog: { open: Mock };
  let mockBrowserApi: {
    createResource: Mock;
    updateResource: Mock;
    searchTranslations: Mock;
    getResourceTree: Mock;
  };
  let mockNotifications: { success: Mock; info: Mock; warning: Mock; error: Mock };

  const createMockData = (mode: 'create' | 'edit', resource?: ResourceSummaryDto): TranslationEditorDialogData => ({
    mode,
    resource,
    collectionName: 'test-collection',
    folderPath: 'common.buttons',
    availableLocales: ['en', 'fr', 'de'],
    baseLocale: 'en',
  });

  const dialogData = createMockData('create');

  /** Lets the deferred focus task the dialog queues after a confirmation run. */
  const flushFocus = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  const createDialog = createComponentFactory({
    component: TranslationEditorDialog,
    imports: [BrowserAnimationsModule, getTranslocoTestingModule()],
    providers: [provideHttpClient(), provideHttpClientTesting()],
    componentProviders: [
      { provide: MatDialogRef, useFactory: () => dialogRef },
      { provide: MatDialog, useFactory: () => mockDialog },
      { provide: BrowserApiService, useFactory: () => mockBrowserApi },
      { provide: NotificationService, useFactory: () => mockNotifications },
      { provide: MAT_DIALOG_DATA, useValue: dialogData },
    ],
    detectChanges: false,
  });

  const renderDialog = (data: TranslationEditorDialogData): void => {
    dialogData.resource = undefined;
    dialogData.folderPath = undefined;
    dialogData.readOnly = undefined;
    Object.assign(dialogData, data);
    spectator = createDialog();
    fixture = spectator.fixture;
    component = spectator.component;
    spectator.detectChanges();
  };

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
      afterOpened: vi.fn().mockReturnValue(of(undefined)),
      keydownEvents: vi.fn().mockReturnValue(of()),
      backdropClick: vi.fn().mockReturnValue(of()),
      disableClose: false,
    };

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(true),
      }),
    };

    mockBrowserApi = {
      createResource: vi.fn().mockReturnValue(of({})),
      updateResource: vi.fn().mockReturnValue(of({})),
      searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
      getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
    };

    mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };

    renderDialog(createMockData('create'));
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should render the heading the dialog container is labelled by', () => {
      const heading = spectator.query(`#${TRANSLATION_EDITOR_TITLE_ID}`);

      expect(heading).toBeTruthy();
      expect(heading?.tagName).toBe('H2');
      expect(heading?.textContent?.trim()).toBeTruthy();
    });

    it('should display create mode title and subtitle', () => {
      expect(component.dialogTitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATETITLE);
      expect(component.dialogSubtitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATESUBTITLEX);
    });

    it('should display edit mode title and subtitle', async () => {
      const editData = createMockData('edit', {
        key: 'test_key',
        translations: { en: 'Test Value' },
        status: {},
      });
      renderDialog(editData);

      expect(component.dialogTitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITTITLE);
      expect(component.dialogSubtitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITSUBTITLEX);
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
      component.form.controls.key.setValue('test key');
      component.form.controls.key.markAsTouched();
      expect(component.getKeyErrorMessage()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYPATTERNERROR);
    });
  });

  describe('Dotted Keys - Location Absorption', () => {
    it('should split a pasted full key into folder path and leaf', () => {
      component.form.controls.key.setValue('apps.common.buttons.ok');

      expect(component.form.controls.key.value).toBe('ok');
      expect(component.selectedFolderPath()).toBe('apps.common.buttons');
      expect(component.form.controls.key.valid).toBe(true);
    });

    it('should replace the folder the dialog opened on', () => {
      expect(component.selectedFolderPath()).toBe('common.buttons');

      component.form.controls.key.setValue('apps.header.title');

      expect(component.selectedFolderPath()).toBe('apps.header');
    });

    it('should extend the derived folder while the user keeps typing dots', () => {
      component.form.controls.key.setValue('apps.');
      expect(component.selectedFolderPath()).toBe('apps');
      expect(component.form.controls.key.value).toBe('');

      component.form.controls.key.setValue('common.');
      expect(component.selectedFolderPath()).toBe('apps.common');

      component.form.controls.key.setValue('ok');
      expect(component.selectedFolderPath()).toBe('apps.common');
      expect(component.form.controls.key.value).toBe('ok');
    });

    it('should re-anchor on a folder the user picked instead of extending it', () => {
      component.form.controls.key.setValue('apps.');
      component.onFolderConfirmed('picked.folder');

      component.form.controls.key.setValue('other.ok');

      expect(component.selectedFolderPath()).toBe('other');
    });

    it('should collapse consecutive dots', () => {
      component.form.controls.key.setValue('apps..common...ok');

      expect(component.form.controls.key.value).toBe('ok');
      expect(component.selectedFolderPath()).toBe('apps.common');
    });

    it('should strip a leading dot without touching the folder', () => {
      component.form.controls.key.setValue('.ok');

      expect(component.form.controls.key.value).toBe('ok');
      expect(component.selectedFolderPath()).toBe('common.buttons');
    });

    it('should leave the folder alone when the value is only a dot', () => {
      component.form.controls.key.setValue('.');

      expect(component.form.controls.key.value).toBe('');
      expect(component.selectedFolderPath()).toBe('common.buttons');
    });

    it('should absorb a dotted key pasted into a partially filled field', () => {
      component.form.controls.key.setValue('ok');
      // What the DOM reports after pasting `apps.common.` before an existing `ok`.
      component.form.controls.key.setValue('apps.common.ok');

      expect(component.form.controls.key.value).toBe('ok');
      expect(component.selectedFolderPath()).toBe('apps.common');
    });

    it('should leave an invalid segment in the field for the pattern validator', () => {
      component.form.controls.key.setValue('apps.bad key.ok');

      expect(component.form.controls.key.value).toBe('apps.bad key.ok');
      expect(component.form.controls.key.hasError('pattern')).toBe(true);
      expect(component.selectedFolderPath()).toBe('common.buttons');
    });

    it('should submit the absorbed folder as part of the full key', async () => {
      mockBrowserApi.createResource.mockReturnValue(of({ entriesCreated: 1, created: true }));

      component.form.controls.key.setValue('apps.common.buttons.ok');
      component.form.controls.baseValue.setValue('OK');
      component.form.controls.comment.setValue('A comment');
      await component.onSubmit();

      expect(mockBrowserApi.createResource).toHaveBeenCalledWith(
        'test-collection',
        expect.objectContaining({ key: 'apps.common.buttons.ok' }),
      );
    });

    it('should announce the move for screen readers', () => {
      component.form.controls.key.setValue('apps.common.ok');

      expect(component.locationAbsorbedMessage()).toContain('apps.common');
    });

    it('should not absorb dots in edit mode, where the key is readonly', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
      };
      renderDialog(createMockData('edit', mockResource));

      component.form.controls.key.setValue('apps.common.ok');

      expect(component.form.controls.key.value).toBe('apps.common.ok');
      expect(component.selectedFolderPath()).toBe('common.buttons');
    });
  });

  describe('Auto-translate is not offered from the editor', () => {
    it('should expose no auto-translate entry point on the component', () => {
      const surface = component as unknown as Record<string, unknown>;
      expect(surface['onAutoTranslate']).toBeUndefined();
      expect(surface['canAutoTranslate']).toBeUndefined();
      expect(surface['isAutoTranslating']).toBeUndefined();
    });

    it('should render no auto-translate control on the Other Locales tab', () => {
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.auto-translate-button')).toBeNull();
      expect(host.querySelector('.locales-toolbar')).toBeNull();
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
      dialogRef = {
        close: vi.fn(),
        afterOpened: vi.fn().mockReturnValue(of(undefined)),
        keydownEvents: vi.fn().mockReturnValue(of()),
        backdropClick: vi.fn().mockReturnValue(of()),
        disableClose: false,
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({})),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
        getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
      };
      mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
      renderDialog(dataWithoutFolder);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment'); // Add comment to skip confirmation
      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.folderPath).toBe('');
    });
  });

  describe('Dialog Interaction', () => {
    it('should close dialog on cancel when nothing has been edited', async () => {
      await component.onCancel();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('should confirm before discarding unsaved edits', async () => {
      component.form.controls.baseValue.setValue('Half-written value');
      component.form.controls.baseValue.markAsDirty();

      // The shared confirmation mock resolves to `true` (discard).
      await component.onCancel();

      expect(mockDialog.open).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });

    it('should keep the dialog open when the user chooses to keep editing', async () => {
      mockDialog.open = vi.fn().mockReturnValue({ afterClosed: () => of(false) });
      component.form.controls.baseValue.setValue('Half-written value');
      component.form.controls.baseValue.markAsDirty();

      await component.onCancel();

      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should take ownership of Escape so stacked dialogs cannot close the editor', () => {
      expect(dialogRef.disableClose).toBe(true);
      expect(dialogRef.keydownEvents).toHaveBeenCalled();
      expect(dialogRef.backdropClick).toHaveBeenCalled();
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
      dialogRef = {
        close: vi.fn(),
        afterOpened: vi.fn().mockReturnValue(of(undefined)),
        keydownEvents: vi.fn().mockReturnValue(of()),
        backdropClick: vi.fn().mockReturnValue(of()),
        disableClose: false,
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({})),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
        getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
      };
      mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
      renderDialog(editData);

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
      renderDialog(editData);

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
      renderDialog(editData);

      expect(component.form.controls.baseValue.value).toBe('');
    });

    it('should handle missing comment', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
      };

      const editData = createMockData('edit', mockResource);
      renderDialog(editData);

      expect(component.form.controls.comment.value).toBe('');
    });

    it('should display correct save button label in edit mode', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
      };

      const editData = createMockData('edit', mockResource);
      renderDialog(editData);

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
      renderDialog(editData);

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
      dialogRef = {
        close: vi.fn(),
        afterOpened: vi.fn().mockReturnValue(of(undefined)),
        keydownEvents: vi.fn().mockReturnValue(of()),
        backdropClick: vi.fn().mockReturnValue(of()),
        disableClose: false,
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({})),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
        getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
      };
      mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
      renderDialog(createMockData('create'));
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

    it('should focus the comment field when user clicks "Add Comment"', async () => {
      mockDialog.open.mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(false)) });

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('');

      await component.onSubmit();
      // Focus is deferred a task past afterClosed() so the confirmation's focus
      // trap cannot restore focus to the Save button on top of it.
      await flushFocus();

      const commentField = spectator.query('#translation-editor-comment');
      expect(commentField).toBeTruthy();
      expect(document.activeElement).toBe(commentField);
    });

    it('should focus the comment field in edit mode when user clicks "Add Comment"', async () => {
      renderDialog(
        createMockData('edit', {
          key: 'test_key',
          translations: { en: 'Test Value' },
          status: {},
          comment: 'Existing comment',
        }),
      );
      mockDialog.open.mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(false)) });

      component.form.controls.comment.setValue('');

      await component.onSubmit();
      await flushFocus();

      const commentField = spectator.query('#translation-editor-comment');
      expect(commentField).toBeTruthy();
      expect(document.activeElement).toBe(commentField);
    });

    it('should select any existing comment text when the field is focused', async () => {
      mockDialog.open.mockReturnValue({ afterClosed: vi.fn().mockReturnValue(of(false)) });

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('   ');
      spectator.detectChanges();

      await component.onSubmit();
      await flushFocus();

      const commentField = spectator.query<HTMLTextAreaElement>('#translation-editor-comment');
      expect(commentField?.selectionStart).toBe(0);
      expect(commentField?.selectionEnd).toBe(3);
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
      dialogRef = {
        close: vi.fn(),
        afterOpened: vi.fn().mockReturnValue(of(undefined)),
        keydownEvents: vi.fn().mockReturnValue(of()),
        backdropClick: vi.fn().mockReturnValue(of()),
        disableClose: false,
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi
          .fn()
          .mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true, skippedLocales: ['es'] })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
        getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }),
      };
      mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
      renderDialog(editData);

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
      dialogRef = {
        close: vi.fn(),
        afterOpened: vi.fn().mockReturnValue(of(undefined)),
        keydownEvents: vi.fn().mockReturnValue(of()),
        backdropClick: vi.fn().mockReturnValue(of()),
        disableClose: false,
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi
          .fn()
          .mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true, skippedLocales: [] })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
        getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }),
      };
      mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
      renderDialog(editData);

      component.form.controls.baseValue.setValue('Updated Value');
      component.form.controls.comment.setValue('Updated comment');

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.skippedLocales).toBeUndefined();
    });
  });

  describe('Location popover', () => {
    it('should stay closed until the location pill is used', () => {
      expect(component.isFolderPopoverOpen()).toBe(false);
      expect(document.querySelector('.pop')).toBeNull();
    });

    it('should open the popover from the location pill', () => {
      spectator.click('[data-testid="location-pill"]');
      spectator.detectChanges();

      expect(component.isFolderPopoverOpen()).toBe(true);
      expect(document.querySelector('.pop')).not.toBeNull();
    });

    it('should toggle the popover shut on a second click', () => {
      component.openFolderPopover();
      spectator.detectChanges();

      component.toggleFolderPopover();
      spectator.detectChanges();

      expect(component.isFolderPopoverOpen()).toBe(false);
    });

    it('should stage a folder without committing it', () => {
      component.openFolderPopover();
      component.onFolderStaged('common.errors');

      expect(component.stagedFolderPath()).toBe('common.errors');
      expect(component.selectedFolderPath()).toBe('common.buttons');
      expect(component.popoverFolderPath()).toBe('common.errors');
    });

    it('should commit the staged folder and close on confirm', () => {
      component.openFolderPopover();
      component.onFolderStaged('common.errors');

      component.confirmStagedFolder();

      expect(component.selectedFolderPath()).toBe('common.errors');
      expect(component.isFolderPopoverOpen()).toBe(false);
      expect(component.stagedFolderPath()).toBeNull();
    });

    it('should keep the current folder when nothing was staged', () => {
      component.openFolderPopover();

      component.confirmStagedFolder();

      expect(component.selectedFolderPath()).toBe('common.buttons');
      expect(component.isFolderPopoverOpen()).toBe(false);
    });

    it('should dismiss the popover instead of the dialog on cancel', async () => {
      component.openFolderPopover();

      await component.onCancel();

      expect(component.isFolderPopoverOpen()).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should not open the popover in a read-only collection', () => {
      renderDialog({ ...createMockData('create'), readOnly: true });

      component.toggleFolderPopover();

      expect(component.isFolderPopoverOpen()).toBe(false);
    });
  });

  describe('Other locales drawer', () => {
    it('should stay closed until the Other locales row is used', () => {
      expect(component.isLocalesDrawerOpen()).toBe(false);
      expect(spectator.query('[data-testid="locales-drawer"]')).toBeNull();
    });

    it('should open the drawer from the Other locales row', () => {
      spectator.click('[data-testid="other-locales-row"]');
      spectator.detectChanges();

      expect(component.isLocalesDrawerOpen()).toBe(true);
      expect(spectator.query('[data-testid="locales-drawer"]')).not.toBeNull();
    });

    it('should close the drawer from Done', () => {
      component.openLocalesDrawer();
      spectator.detectChanges();

      spectator.click('[data-testid="drawer-done"]');
      spectator.detectChanges();

      expect(component.isLocalesDrawerOpen()).toBe(false);
      expect(spectator.query('[data-testid="locales-drawer"]')).toBeNull();
    });

    it('should dismiss the drawer instead of the dialog on cancel', async () => {
      component.openLocalesDrawer();

      await component.onCancel();

      expect(component.isLocalesDrawerOpen()).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should not open when the collection has only the base locale', () => {
      renderDialog({ ...createMockData('create'), availableLocales: ['en'] });

      component.openLocalesDrawer();

      expect(component.isLocalesDrawerOpen()).toBe(false);
    });

    it('should edit the same FormArray the save path reads', () => {
      component.openLocalesDrawer();
      spectator.detectChanges();

      component.setLocaleStatus(0, 'verified');

      expect(component.form.controls.translations.at(0).value.status).toBe('verified');
    });
  });

  describe('Context column', () => {
    it('should split the folder path for the location pill', () => {
      expect(component.folderSegments()).toEqual(['common', 'buttons']);
    });

    it('should mark the entry being created in the context tree', () => {
      component.form.controls.key.setValue('ok');
      spectator.detectChanges();

      const entry = component.contextTree().find((node) => node.kind === 'entry' && node.name === 'ok');
      expect(entry?.mark).toBe('new');
    });

    it('should mark the target folder as the one the entry lands in', () => {
      expect(component.contextTree().some((node) => node.here === true)).toBe(true);
    });

    it('should highlight the row of the entry being created, not just pill it', () => {
      component.form.controls.key.setValue('ok');
      spectator.detectChanges();

      const rows = spectator.queryAll('[data-testid="context-tree"] .ftree-n--target');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('ok');
    });

    it('should highlight the row of the entry being edited', () => {
      renderDialog(createMockData('edit', { key: 'ok', translations: { en: 'OK' }, status: {} }));
      spectator.detectChanges();

      const rows = spectator.queryAll('[data-testid="context-tree"] .ftree-n--target');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('ok');
      expect(rows[0]).not.toHaveClass('ftree-n--taken');
    });

    it('should not claim a collision before a key is typed', () => {
      expect(component.keyCollision()).toBe(false);
    });

    it('should not repeat the full key, which the footer already carries', () => {
      expect(spectator.query('[data-testid="context-full-key"]')).toBeNull();
      expect(spectator.query('[data-testid="footer-key"]')).not.toBeNull();
    });

    it('should summarise only the folder and the similar count', () => {
      expect(component.contextSummary()).toBe('common.buttons');
    });

    it('should list only the locales that are new or stale', () => {
      renderDialog(
        createMockData('edit', {
          key: 'ok',
          translations: { en: 'OK', fr: 'Oui', de: 'Ja' },
          status: { fr: 'stale', de: 'verified' },
        }),
      );

      expect(component.localesNeedingWork().map((locale) => locale.locale)).toEqual(['fr']);
      const rows = spectator.queryAll('[data-testid="locale-summary"] .lsum-r');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('fr');
      expect(spectator.query('[data-testid="locales-all-up-to-date"]')).toBeNull();
    });

    it('should show the caught-up line instead of an empty list', () => {
      renderDialog(
        createMockData('edit', {
          key: 'ok',
          translations: { en: 'OK', fr: 'Oui', de: 'Ja' },
          status: { fr: 'translated', de: 'verified' },
        }),
      );

      expect(component.localesNeedingWork()).toHaveLength(0);
      expect(spectator.queryAll('[data-testid="locale-summary"] .lsum-r')).toHaveLength(0);
      expect(spectator.query('[data-testid="locales-all-up-to-date"]')).not.toBeNull();
    });
  });

  describe('Key collision', () => {
    const entry = (key: string): ResourceSummaryDto => ({ key, translations: { en: key }, status: {} });

    /** Puts entries in the folder the browser is showing, the cheapest source. */
    const seedBrowserFolder = (folderPath: string, keys: string[]): void => {
      const store = spectator.inject(BrowserStore);
      patchState(store, { currentFolderPath: folderPath, translations: keys.map(entry) });
    };

    it('should detect a collision against the entries the browser already holds', () => {
      seedBrowserFolder('common.buttons', ['ok', 'cancel']);

      component.form.controls.key.setValue('ok');
      spectator.detectChanges();

      expect(component.keyCollision()).toBe(true);
      expect(spectator.query('[data-testid="key-collision-error"]')).not.toBeNull();
    });

    it('should ignore nested resources the browser folds into the folder listing', () => {
      seedBrowserFolder('common.buttons', ['ok', 'confirm.dialog.title']);

      component.form.controls.key.setValue('confirm');
      spectator.detectChanges();

      expect(component.keyCollision()).toBe(false);
      expect(component.contextTree().some((node) => node.name === 'confirm.dialog.title')).toBe(false);
    });

    it('should compare keys exactly, so case alone is not a collision', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.form.controls.key.setValue('OK');
      spectator.detectChanges();

      expect(component.keyCollision()).toBe(false);
    });

    it('should detect a collision in a folder chosen from the popover', () => {
      mockBrowserApi.getResourceTree.mockImplementation((_collection: string, path: string) =>
        of({ path, resources: path === 'common.errors' ? [entry('notFound')] : [], children: [] }),
      );

      component.form.controls.key.setValue('notFound');
      spectator.detectChanges();
      expect(component.keyCollision()).toBe(false);

      component.openFolderPopover();
      component.onFolderStaged('common.errors');
      component.confirmStagedFolder();
      spectator.detectChanges();

      expect(mockBrowserApi.getResourceTree).toHaveBeenCalledWith('test-collection', 'common.errors', false);
      expect(component.keyCollision()).toBe(true);
    });

    it('should not re-fetch a folder it has already loaded', () => {
      component.onFolderConfirmed('common.errors');
      component.onFolderConfirmed('common.buttons');
      component.onFolderConfirmed('common.errors');

      const errorFolderLoads = mockBrowserApi.getResourceTree.mock.calls.filter((call) => call[1] === 'common.errors');
      expect(errorFolderLoads).toHaveLength(1);
    });

    it('should claim nothing while a folder is still loading', () => {
      const pending = new Subject<unknown>();
      mockBrowserApi.getResourceTree.mockReturnValue(pending);

      component.onFolderConfirmed('common.errors');
      component.form.controls.key.setValue('notFound');
      spectator.detectChanges();

      expect(component.keyCollision()).toBe(false);
      expect(component.contextTree().some((node) => node.kind === 'entry')).toBe(false);

      pending.next({ path: 'common.errors', resources: [entry('notFound')], children: [] });
      pending.complete();
      spectator.detectChanges();

      expect(component.keyCollision()).toBe(true);
    });

    it('should never collide in edit mode, where the key is locked', () => {
      renderDialog(createMockData('edit', entry('ok')));
      seedBrowserFolder('common.buttons', ['ok']);
      spectator.detectChanges();

      expect(component.keyCollision()).toBe(false);
      expect(spectator.query('[data-testid="key-collision-error"]')).toBeNull();
    });

    it('should mark the colliding leaf as an existing entry in the context tree', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.form.controls.key.setValue('ok');
      spectator.detectChanges();

      const leaf = component.contextTree().find((node) => node.kind === 'entry' && node.name === 'ok');
      expect(leaf?.mark).toBe('exists');
      expect(spectator.query('[data-testid="tree-exists-pill"]')).not.toBeNull();
    });

    it('should mark the colliding row error-coloured rather than accented', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.form.controls.key.setValue('ok');
      spectator.detectChanges();

      expect(spectator.queryAll('[data-testid="context-tree"] .ftree-n--taken')).toHaveLength(1);
      expect(spectator.queryAll('[data-testid="context-tree"] .ftree-n--target')).toHaveLength(0);
    });

    it('should turn the footer key the error colour', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.form.controls.key.setValue('ok');
      spectator.detectChanges();

      expect(spectator.query('[data-testid="footer-key"]')).toHaveClass('mono--dup');
    });

    it('should leave the footer key unmarked while the key is free', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.form.controls.key.setValue('cancel');
      spectator.detectChanges();

      expect(spectator.query('[data-testid="footer-key"]')).not.toHaveClass('mono--dup');
    });

    it('should take the footer validity glyph back to idle', () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.form.controls.key.setValue('ok');
      component.form.controls.baseValue.setValue('OK');
      spectator.detectChanges();

      expect(component.form.valid).toBe(true);
      expect(component.isFormValid()).toBe(false);
    });

    it('should close with shouldOpenEdit from "Open existing"', async () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.form.controls.key.setValue('ok');
      spectator.detectChanges();

      spectator.click('[data-testid="open-existing"]');
      await Promise.resolve();
      await Promise.resolve();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.shouldOpenEdit).toBe(true);
      expect(result.existingResourceKey).toBe('common.buttons.ok');
    });

    it('should offer the conflict dialog instead of saving when the key is taken', async () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.form.controls.key.setValue('ok');
      component.form.controls.baseValue.setValue('OK');
      component.form.controls.comment.setValue('The affirmative button');
      spectator.detectChanges();

      await component.onSubmit();

      expect(mockBrowserApi.createResource).not.toHaveBeenCalled();
      expect(mockDialog.open).toHaveBeenCalled();
      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.shouldOpenEdit).toBe(true);
      expect(result.existingResourceKey).toBe('common.buttons.ok');
    });
  });

  describe('Sticky similar values', () => {
    const hit = (key: string, value: string) => ({ key, translations: { en: value }, status: {} });

    const searchReturns = (results: ReturnType<typeof hit>[]): void => {
      mockBrowserApi.searchTranslations.mockReturnValue(
        of({ query: '', results, totalFound: results.length, limited: false }),
      );
    };

    /** Types a value and lets the 300ms debounce run out. */
    const typeAndSettle = (value: string): void => {
      component.form.controls.baseValue.setValue(value);
      vi.advanceTimersByTime(300);
      spectator.detectChanges();
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should take no space with zero hits', () => {
      searchReturns([]);
      typeAndSettle('Discard unsaved changes?');

      expect(component.showSimilarContext()).toBe(false);
      expect(spectator.query('app-similar-translations')).toBeNull();
    });

    it('should show hits and pin them while the value is unchanged', () => {
      searchReturns([hit('common.actions.save', 'Save')]);
      typeAndSettle('Save changes');

      expect(component.showSimilarContext()).toBe(true);

      // Work elsewhere in the form leaves the pinned block alone.
      component.form.controls.comment.setValue('A comment');
      component.addTagValue('browser');
      vi.advanceTimersByTime(1000);
      spectator.detectChanges();

      expect(component.similarCount()).toBe(1);
      expect(spectator.query('app-similar-translations')).not.toBeNull();
    });

    it('should clear the pinned hits the moment the value changes', () => {
      searchReturns([hit('common.actions.save', 'Save')]);
      typeAndSettle('Save changes');
      expect(component.similarCount()).toBe(1);

      component.form.controls.baseValue.setValue('Save changes now');
      spectator.detectChanges();

      // Before the debounce has even started to run out.
      expect(component.similarCount()).toBe(0);
      expect(component.showSimilarContext()).toBe(false);
    });

    it('should stay silent below the three-character floor', () => {
      searchReturns([hit('common.actions.ok', 'OK')]);
      typeAndSettle('OK');

      expect(mockBrowserApi.searchTranslations).not.toHaveBeenCalled();
      expect(component.showSimilarContext()).toBe(false);
    });

    it('should show nothing in edit mode until the value differs, and clear again on revert', () => {
      vi.useRealTimers();
      renderDialog(
        createMockData('edit', { key: 'saveShortcutHint', translations: { en: 'Press Ctrl + Enter' }, status: {} }),
      );
      vi.useFakeTimers();
      searchReturns([hit('common.actions.save', 'Press Ctrl + Enter')]);

      typeAndSettle('Press Ctrl + Enter');
      expect(mockBrowserApi.searchTranslations).not.toHaveBeenCalled();
      expect(component.showSimilarContext()).toBe(false);

      typeAndSettle('Press Ctrl + Enter to save');
      expect(component.showSimilarContext()).toBe(true);

      typeAndSettle('Press Ctrl + Enter');
      expect(component.showSimilarContext()).toBe(false);
    });

    it('should single out a hit carrying the identical text', () => {
      searchReturns([hit('browser.search.clear', 'Clear Search'), hit('common.actions.clearAll', 'Clear All')]);
      typeAndSettle('clear search');

      expect(component.exactMatchKey()).toBe('browser.search.clear');
      expect(spectator.query('[data-testid="similar-exact-caption"]')).not.toBeNull();
    });

    it('should break a suggested key only after its dots', () => {
      searchReturns([hit('browser.translationEditor.saveShortcutHint', 'Press Ctrl + Enter to save')]);
      typeAndSettle('Press Ctrl + Enter to save');

      const key = spectator.query('app-similar-translations .result-key');
      expect(key).toBeDefined();
      expect(key?.textContent?.trim()).toBe('browser.translationEditor.saveShortcutHint');
      // One break opportunity per dot, and none inside a segment.
      expect(key?.querySelectorAll('wbr').length).toBe(2);
    });

    it('should leave a merely similar hit unmarked', () => {
      searchReturns([hit('common.actions.clearAll', 'Clear All')]);
      typeAndSettle('Clear Search');

      expect(component.exactMatchKey()).toBe('');
      expect(spectator.query('[data-testid="similar-exact-caption"]')).toBeNull();
    });

    it('should drop hits that only matched on their key', () => {
      searchReturns([
        hit('browser.translationEditor.saveButton', 'Create translation'),
        hit('common.actions.save', 'Save'),
      ]);
      typeAndSettle('Save draft');

      expect(component.similarResources().map((result) => result.key)).toEqual(['common.actions.save']);
      expect(component.similarCount()).toBe(1);
    });

    it('should ask for more hits than it shows and keep at most ten', () => {
      searchReturns(Array.from({ length: 25 }, (_, index) => hit(`common.actions.save${index}`, 'Save changes')));
      typeAndSettle('Save changes');

      expect(mockBrowserApi.searchTranslations).toHaveBeenCalledWith('test-collection', 'Save changes', 25);
      expect(component.similarCount()).toBe(10);
    });

    it('should count only the value matches, so the badge and the list agree', () => {
      searchReturns([
        hit('browser.translationEditor.saveButton', 'Create translation'),
        hit('browser.translationEditor.saveAnyway', 'Save Anyway'),
        hit('common.actions.save', 'Save'),
      ]);
      typeAndSettle('Save');

      expect(component.similarCount()).toBe(2);
      expect(component.similarResources().map((result) => result.key)).toEqual([
        'browser.translationEditor.saveAnyway',
        'common.actions.save',
      ]);
    });
  });

  describe('Focus handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should move focus into the drawer and hand it back on Done', () => {
      component.openLocalesDrawer();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      const drawerField = spectator.query('[data-testid="locales-drawer"] textarea');
      expect(document.activeElement).toBe(drawerField);

      component.closeLocalesDrawer();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(document.activeElement).toBe(spectator.query('[data-testid="other-locales-row"]'));
    });

    it('should hand focus back to the Other locales row when Escape closes the drawer', async () => {
      component.openLocalesDrawer();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      await component.onCancel();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(component.isLocalesDrawerOpen()).toBe(false);
      expect(document.activeElement).toBe(spectator.query('[data-testid="other-locales-row"]'));
    });

    it('should move focus to the popover filter and hand it back to the pill', () => {
      component.openFolderPopover();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(document.activeElement).toBe(component.folderFilterInput?.nativeElement);

      component.confirmStagedFolder();
      spectator.detectChanges();
      vi.advanceTimersByTime(0);

      expect(document.activeElement).toBe(spectator.query('[data-testid="location-pill"]'));
    });

    it('should dismiss the popover before the drawer before the dialog', async () => {
      component.openLocalesDrawer();
      component.openFolderPopover();
      spectator.detectChanges();

      await component.onCancel();
      expect(component.isFolderPopoverOpen()).toBe(false);
      expect(component.isLocalesDrawerOpen()).toBe(true);

      await component.onCancel();
      expect(component.isLocalesDrawerOpen()).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();

      await component.onCancel();
      expect(dialogRef.close).toHaveBeenCalled();
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
      dialogRef = {
        close: vi.fn(),
        afterOpened: vi.fn().mockReturnValue(of(undefined)),
        keydownEvents: vi.fn().mockReturnValue(of()),
        backdropClick: vi.fn().mockReturnValue(of()),
        disableClose: false,
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
        getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
      renderDialog(editData);

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
      dialogRef = {
        close: vi.fn(),
        afterOpened: vi.fn().mockReturnValue(of(undefined)),
        keydownEvents: vi.fn().mockReturnValue(of()),
        backdropClick: vi.fn().mockReturnValue(of()),
        disableClose: false,
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
        getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
      renderDialog(editData);

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

    it('should handle update API errors', async () => {
      const mockResource: ResourceSummaryDto = {
        key: 'existing_key',
        translations: { en: 'Existing Value' },
        status: {},
      };

      const editData = createMockData('edit', mockResource);
      dialogRef = {
        close: vi.fn(),
        afterOpened: vi.fn().mockReturnValue(of(undefined)),
        keydownEvents: vi.fn().mockReturnValue(of()),
        backdropClick: vi.fn().mockReturnValue(of()),
        disableClose: false,
      };
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
        getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
      renderDialog(editData);

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
      dialogRef = {
        close: vi.fn(),
        afterOpened: vi.fn().mockReturnValue(of(undefined)),
        keydownEvents: vi.fn().mockReturnValue(of()),
        backdropClick: vi.fn().mockReturnValue(of()),
        disableClose: false,
      };
      mockBrowserApi = {
        createResource: vi.fn().mockReturnValue(of({})),
        updateResource: vi.fn().mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true })),
        searchTranslations: vi.fn().mockReturnValue(of({ results: [], total: 0 })),
        getResourceTree: vi.fn().mockReturnValue(of({ path: '', resources: [], children: [] })),
      };
      mockDialog = {
        open: vi.fn().mockReturnValue({
          afterClosed: () => of(true),
        }),
      };
      mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
      renderDialog(editData);

      component.form.controls.baseValue.setValue('Updated Value');

      await component.onSubmit();

      const result = dialogRef.close.mock.calls.at(-1)?.[0] as TranslationEditorResult;
      expect(result.success).toBe(true);
      expect(result.key).toBe('existing_key');
      expect(result.baseValue).toBe('Updated Value');
    });
  });

  describe('Footer key copy', () => {
    let mockClipboard: { writeText: Mock };

    beforeEach(() => {
      mockClipboard = { writeText: vi.fn(() => Promise.resolve()) };
      Object.defineProperty(navigator, 'clipboard', {
        value: mockClipboard,
        writable: true,
        configurable: true,
      });
      renderDialog(createMockData('create'));
      component.form.controls.key.setValue('ok');
      spectator.detectChanges();
    });

    it('should copy the full key and confirm it', async () => {
      spectator.click('[data-testid="footer-key"]');
      await Promise.resolve();
      spectator.detectChanges();

      expect(mockClipboard.writeText).toHaveBeenCalledWith('common.buttons.ok');
      expect(mockNotifications.success).toHaveBeenCalledWith('Copied to clipboard');
      expect(component.keyJustCopied()).toBe(true);
      expect(spectator.query('[data-testid="footer-key"] .footer-key-icon')?.textContent?.trim()).toBe('check');
    });

    it('should say so when the clipboard refuses', async () => {
      mockClipboard.writeText = vi.fn(() => Promise.reject(new Error('denied')));

      spectator.click('[data-testid="footer-key"]');
      await Promise.resolve();
      spectator.detectChanges();

      expect(mockNotifications.error).toHaveBeenCalledWith('Failed to copy');
      expect(component.keyJustCopied()).toBe(false);
    });

    it('should keep the collision colour on the copy button', () => {
      const store = spectator.inject(BrowserStore);
      patchState(store, {
        currentFolderPath: 'common.buttons',
        translations: [{ key: 'ok', translations: { en: 'OK' }, status: {} }],
      });
      spectator.detectChanges();

      expect(spectator.query('[data-testid="footer-key"]')).toHaveClass('mono--dup');
    });
  });
});
