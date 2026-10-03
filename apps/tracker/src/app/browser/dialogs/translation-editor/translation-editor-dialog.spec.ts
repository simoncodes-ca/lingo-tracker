import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type WritableSignal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type {
  CreateResourceDto,
  LingoTrackerConfigDto,
  ResourceSummaryDto,
  SearchResultDto,
  TranslationStatus,
} from '@simoncodes-ca/data-transfer';
import { isNeedsWorkStatus } from '@simoncodes-ca/domain';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { CollectionsStore } from '../../../collections/store/collections.store';
import { provideTrackerHttpClient, toApiError } from '../../../shared/api-error/api-error';
import { NotificationService } from '../../../shared/notification';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../../store/browser.store';
import {
  type EditorOutcome,
  PREFERRED_TERM_ADVISORIES_ID,
  PREFERRED_TERM_DEBOUNCE_MS,
  TRANSLATION_EDITOR_TITLE_ID,
  TranslationEditorDialog,
  type TranslationEditorDialogData,
} from './translation-editor-dialog';

describe('TranslationEditorDialog', () => {
  let component: TranslationEditorDialog;
  let fixture: ComponentFixture<TranslationEditorDialog>;
  let spectator: Spectator<TranslationEditorDialog>;
  let dialogRef: {
    close: Mock;
    afterOpened: Mock;
    keydownEvents: Mock;
    backdropClick: Mock;
    disableClose: boolean;
  };
  let mockDialog: { open: Mock };
  let apiSpies: {
    createResource: Mock;
    updateResource: Mock;
    searchTranslations: Mock;
    getResourceTree: Mock;
  };
  let mockNotifications: { success: Mock; info: Mock; warning: Mock; error: Mock };
  let mockConfig: WritableSignal<LingoTrackerConfigDto | null>;

  const summary = (
    fullKey: string,
    baseValue: string,
    targets: Record<string, [string | undefined, TranslationStatus | undefined]> = {},
    extra: Partial<ResourceSummaryDto> = {},
  ): ResourceSummaryDto => {
    const segments = fullKey.split('.');
    const entryKey = segments.pop() ?? '';
    return {
      fullKey,
      folderPath: segments.join('.'),
      entryKey,
      base: { locale: 'en', value: baseValue },
      targets: Object.entries(targets).map(([locale, [value, status]]) => ({
        locale,
        value,
        status,
        needsWork: status === undefined || isNeedsWorkStatus(status),
        sameAsBase: (value?.trim() ?? '').length > 0 && value?.trim() === baseValue.trim(),
      })),
      tags: [],
      inheritedTags: [],
      ...extra,
    };
  };

  /** The outcome the dialog closed with. */
  const closedWith = (): EditorOutcome | undefined => dialogRef.close.mock.calls.at(-1)?.[0];
  /** The create request the dialog sent through the store. */
  const sentCreate = (): CreateResourceDto | undefined => apiSpies.createResource.mock.calls.at(-1)?.[1];

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
  describe('Tag input', () => {
    it('should reset the typed-text signal on Enter even when the text is blank', () => {
      spectator.detectChanges();
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input.chip-add-input');
      expect(input).not.toBeNull();
      if (!input) return;

      input.value = '   ';
      input.dispatchEvent(new Event('input'));
      expect(component.tagInputText()).toBe('   ');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));

      expect(component.tagInputText()).toBe('');
      expect(input.value).toBe('');
      expect(component.tagsList()).toEqual([]);
    });
  });

  const flushFocus = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  const createDialog = createComponentFactory({
    component: TranslationEditorDialog,
    imports: [BrowserAnimationsModule, getTranslocoTestingModule()],
    providers: [provideTrackerHttpClient(), provideHttpClientTesting()],
    componentProviders: [
      { provide: MatDialogRef, useFactory: () => dialogRef },
      { provide: MatDialog, useFactory: () => mockDialog },
      { provide: NotificationService, useFactory: () => mockNotifications },
      { provide: CollectionsStore, useFactory: () => ({ config: mockConfig }) },
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

    // The dialog uses the real SimilarValues and FolderPeek services; the API client is spied at its boundary.
    apiSpies = {
      createResource: vi.spyOn(BrowserApiService.prototype, 'createResource') as Mock,
      updateResource: vi.spyOn(BrowserApiService.prototype, 'updateResource') as Mock,
      searchTranslations: vi.spyOn(BrowserApiService.prototype, 'searchTranslations') as Mock,
      getResourceTree: vi.spyOn(BrowserApiService.prototype, 'getResourceTree') as Mock,
    };
    apiSpies.createResource.mockReturnValue(of({}));
    apiSpies.updateResource.mockReturnValue(of({}));
    apiSpies.searchTranslations.mockReturnValue(of({ results: [], total: 0 }));
    apiSpies.getResourceTree.mockReturnValue(of({ path: '', resources: [], children: [] }));

    mockNotifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    mockConfig = signal<LingoTrackerConfigDto | null>(null);

    renderDialog(createMockData('create'));
  });

  afterEach(() => vi.restoreAllMocks());

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
      const editData = createMockData('edit', summary('common.buttons.test_key', 'Test Value'));
      renderDialog(editData);

      expect(component.dialogTitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITTITLE);
      expect(component.dialogSubtitle()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITSUBTITLEX);
    });
  });

  describe('Form Validation - Key Field', () => {
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
    it('should publish the absorbed leaf and folder to collision and key preview', () => {
      const store = spectator.inject(BrowserStore);
      patchState(unprotected(store), {
        currentFolderPath: 'a.b',
        translations: [summary('a.b.c', 'Existing value')],
      });

      component.form.controls.key.setValue('a.b.c');
      spectator.detectChanges();

      expect(component.form.controls.key.value).toBe('c');
      expect(component.selectedFolderPath()).toBe('a.b');
      expect(component.fullKeyPreview()).toBe('a.b.c');
      expect(component.keyCollision()).toBe(true);
    });

    it('should split a pasted full key into folder path and leaf', () => {
      component.form.controls.key.setValue('apps.common.buttons.ok');

      expect(component.form.controls.key.value).toBe('ok');
      expect(component.selectedFolderPath()).toBe('apps.common.buttons');
      expect(component.form.controls.key.valid).toBe(true);
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

    it('should submit the absorbed folder as part of the full key', async () => {
      apiSpies.createResource.mockReturnValue(of({ entriesCreated: 1, created: true }));

      component.form.controls.key.setValue('apps.common.buttons.ok');
      component.form.controls.baseValue.setValue('OK');
      component.form.controls.comment.setValue('A comment');
      await component.onSubmit();

      expect(apiSpies.createResource).toHaveBeenCalledWith(
        'test-collection',
        expect.objectContaining({ key: 'apps.common.buttons.ok' }),
      );
    });

    it('should announce the move for screen readers', () => {
      component.form.controls.key.setValue('apps.common.ok');

      expect(component.locationAbsorbedMessage()).toContain('apps.common');
    });

    it('should not absorb dots in edit mode, where the key is readonly', async () => {
      const mockResource = summary('common.buttons.existing_key', 'Existing Value');
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
      expect(closedWith()).toEqual({ kind: 'created', fullKey: 'common.buttons.test_key', skippedLocales: [] });
      expect(sentCreate()).toMatchObject({
        key: 'common.buttons.test_key',
        baseValue: 'Test Value',
        comment: 'Test comment',
      });
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

      expect(closedWith()?.kind).toBe('created');
      expect(sentCreate()?.comment).toBeUndefined();
    });

    it('should use empty string for folderPath when not provided', async () => {
      const dataWithoutFolder = createMockData('create');
      dataWithoutFolder.folderPath = undefined;
      renderDialog(dataWithoutFolder);

      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment'); // Add comment to skip confirmation
      await component.onSubmit();

      expect(closedWith()).toEqual({ kind: 'created', fullKey: 'test_key', skippedLocales: [] });
    });
  });

  describe('Dialog Interaction', () => {
    it('should close dialog on cancel when nothing has been edited', async () => {
      await component.onCancel();
      expect(dialogRef.close).toHaveBeenCalledWith({ kind: 'cancelled' });
    });

    it('should confirm before discarding unsaved edits', async () => {
      component.form.controls.baseValue.setValue('Half-written value');
      component.form.controls.baseValue.markAsDirty();

      // The shared confirmation mock resolves to `true` (discard).
      await component.onCancel();

      expect(mockDialog.open).toHaveBeenCalled();
      expect(mockDialog.open.mock.calls.at(-1)?.[1]).toEqual({
        data: {
          title: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.TITLE,
          message: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.MESSAGE,
          confirmButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.DISCARD,
          cancelButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.KEEPEDITING,
        },
        width: '440px',
        disableClose: true,
      });
      expect(dialogRef.close).toHaveBeenCalledWith({ kind: 'cancelled' });
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

  describe('Edit Mode', () => {
    it('should display correct save button label in edit mode', async () => {
      const mockResource = summary('common.buttons.existing_key', 'Existing Value');

      const editData = createMockData('edit', mockResource);
      renderDialog(editData);

      expect(component.saveButtonLabel()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UPDATEBUTTON);
    });

    it('should display correct save button label in create mode', () => {
      expect(component.saveButtonLabel()).toBe(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.SAVEBUTTON);
    });
  });

  describe('Comment Confirmation Flow', () => {
    it('should save directly when comment is present', async () => {
      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('Test comment');

      await component.onSubmit();

      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalled();
      expect(closedWith()).toEqual({ kind: 'created', fullKey: 'common.buttons.test_key', skippedLocales: [] });
      expect(sentCreate()).toMatchObject({
        key: 'common.buttons.test_key',
        baseValue: 'Test Value',
        comment: 'Test comment',
      });
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

    it('should ignore Ctrl+Enter while the comment confirmation is open', async () => {
      const answer = new Subject<boolean>();
      mockDialog.open.mockReturnValue({ afterClosed: () => answer.asObservable() });
      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('');

      const first = component.onSubmit();
      await vi.waitFor(() => expect(mockDialog.open).toHaveBeenCalledTimes(1));
      const event = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true });
      await component.onCtrlEnter(event);

      expect(apiSpies.createResource).not.toHaveBeenCalled();
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      answer.next(true);
      answer.complete();
      await first;
      expect(apiSpies.createResource).toHaveBeenCalledTimes(1);
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
      expect(closedWith()?.kind).toBe('created');
      expect(sentCreate()).toMatchObject({ key: 'common.buttons.test_key', baseValue: 'Test Value' });
      expect(sentCreate()?.comment).toBeUndefined();
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
        createMockData('edit', summary('common.buttons.test_key', 'Test Value', {}, { comment: 'Existing comment' })),
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

    it('should ignore another save after Save Anyway has completed', async () => {
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
      await component.onSubmit();

      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(apiSpies.createResource).toHaveBeenCalledTimes(1);
    });

    it('should remember Save Anyway when a refused write is retried', async () => {
      mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });
      apiSpies.createResource
        .mockReturnValueOnce(throwError(() => toApiError(new HttpErrorResponse({ status: 503 }))))
        .mockReturnValueOnce(of({ entriesCreated: 1, created: true }));
      component.form.controls.key.setValue('test_key');
      component.form.controls.baseValue.setValue('Test Value');
      component.form.controls.comment.setValue('');

      await component.onSubmit();
      expect(component.errorMessage()).toBe('Failed to create translation');
      expect(dialogRef.close).not.toHaveBeenCalled();

      await component.onSubmit();
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      expect(apiSpies.createResource).toHaveBeenCalledTimes(2);
      expect(closedWith()).toEqual({ kind: 'created', fullKey: 'common.buttons.test_key', skippedLocales: [] });
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

    it('should select and stage a newly created folder', () => {
      component.form.controls.key.setValue('a.');
      component.openFolderPopover();

      component.onFolderCreated({ name: 'new', fullPath: 'common.new', loaded: false });

      expect(component.selectedFolderPath()).toBe('common.new');
      expect(component.stagedFolderPath()).toBe('common.new');
      expect(component.popoverFolderPath()).toBe('common.new');

      component.closeFolderPopover();
      component.form.controls.key.setValue('b.ok');
      expect(component.selectedFolderPath()).toBe('b');
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

    it('should highlight the row of the entry being created, not just pill it', () => {
      component.form.controls.key.setValue('ok');
      spectator.detectChanges();

      const rows = spectator.queryAll('[data-testid="context-tree"] .ftree-n--target');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('ok');
    });

    it('should highlight the row of the entry being edited', () => {
      renderDialog(createMockData('edit', summary('common.buttons.ok', 'OK')));
      spectator.detectChanges();

      const rows = spectator.queryAll('[data-testid="context-tree"] .ftree-n--target');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('ok');
      expect(rows[0]).not.toHaveClass('ftree-n--taken');
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
        createMockData(
          'edit',
          summary('common.buttons.ok', 'OK', {
            fr: ['Oui', 'stale'],
            de: ['Ja', 'verified'],
          }),
        ),
      );

      expect(component.localesNeedingWork().map((locale) => locale.locale)).toEqual(['fr']);
      const rows = spectator.queryAll('[data-testid="locale-summary"] .lsum-r');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.textContent).toContain('fr');
      expect(spectator.query('[data-testid="locales-all-up-to-date"]')).toBeNull();
    });

    it('should show the caught-up line instead of an empty list', () => {
      renderDialog(
        createMockData(
          'edit',
          summary('common.buttons.ok', 'OK', {
            fr: ['Oui', 'translated'],
            de: ['Ja', 'verified'],
          }),
        ),
      );

      expect(component.localesNeedingWork()).toHaveLength(0);
      expect(spectator.queryAll('[data-testid="locale-summary"] .lsum-r')).toHaveLength(0);
      expect(spectator.query('[data-testid="locales-all-up-to-date"]')).not.toBeNull();
    });
  });

  describe('Key collision', () => {
    const entry = (fullKey: string): ResourceSummaryDto => summary(fullKey, fullKey.split('.').at(-1) ?? fullKey);

    /** Puts entries in the folder the browser is showing, the cheapest source. */
    const seedBrowserFolder = (folderPath: string, keys: string[]): void => {
      const store = spectator.inject(BrowserStore);
      patchState(unprotected(store), {
        currentFolderPath: folderPath,
        translations: keys.map((key) => entry(folderPath ? `${folderPath}.${key}` : key)),
      });
    };

    it('should detect a collision against the entries the browser already holds', () => {
      seedBrowserFolder('common.buttons', ['ok', 'cancel']);

      component.form.controls.key.setValue('ok');
      spectator.detectChanges();

      expect(component.keyCollision()).toBe(true);
      expect(spectator.query('[data-testid="key-collision-error"]')).not.toBeNull();
    });

    it('should detect a collision in a folder chosen from the popover', () => {
      apiSpies.getResourceTree.mockImplementation((_collection: string, path: string) =>
        of({ path, resources: path === 'common.errors' ? [entry('notFound')] : [], children: [] }),
      );

      component.form.controls.key.setValue('notFound');
      spectator.detectChanges();
      expect(component.keyCollision()).toBe(false);

      component.openFolderPopover();
      component.onFolderStaged('common.errors');
      component.confirmStagedFolder();
      spectator.detectChanges();

      expect(apiSpies.getResourceTree).toHaveBeenCalledWith('test-collection', 'common.errors', false);
      expect(component.keyCollision()).toBe(true);
    });

    it('should detect a collision when an edit picks a folder holding its key', () => {
      apiSpies.getResourceTree.mockImplementation((_collection: string, path: string) =>
        of({ path, resources: path === 'common.errors' ? [entry('common.errors.save')] : [], children: [] }),
      );
      renderDialog(createMockData('edit', entry('common.buttons.save')));

      component.openFolderPopover();
      component.onFolderStaged('common.errors');
      component.confirmStagedFolder();
      spectator.detectChanges();

      expect(apiSpies.getResourceTree).toHaveBeenCalledWith('test-collection', 'common.errors', false);
      expect(component.keyCollision()).toBe(true);
      expect(spectator.query('[data-testid="key-collision-error"]')).not.toBeNull();
    });

    it('should not re-fetch a folder it has already loaded', () => {
      component.onFolderConfirmed('common.errors');
      component.onFolderConfirmed('common.buttons');
      component.onFolderConfirmed('common.errors');

      const errorFolderLoads = apiSpies.getResourceTree.mock.calls.filter((call) => call[1] === 'common.errors');
      expect(errorFolderLoads).toHaveLength(1);
    });

    it('should claim nothing while a folder is still loading', () => {
      const pending = new Subject<unknown>();
      apiSpies.getResourceTree.mockReturnValue(pending);

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

      expect(closedWith()).toEqual({ kind: 'open-existing', fullKey: 'common.buttons.ok' });
    });

    it('should offer the conflict dialog instead of saving when the key is taken', async () => {
      seedBrowserFolder('common.buttons', ['ok']);

      component.form.controls.key.setValue('ok');
      component.form.controls.baseValue.setValue('OK');
      component.form.controls.comment.setValue('The affirmative button');
      spectator.detectChanges();

      await component.onSubmit();

      expect(apiSpies.createResource).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(mockDialog.open).toHaveBeenCalled());
      expect(mockDialog.open.mock.calls.at(-1)?.[1]).toEqual({
        data: {
          title: 'Translation Key Already Exists',
          message:
            'The translation key "common.buttons.ok" already exists in this collection. Would you like to edit the existing translation or choose a different key?',
          confirmButtonText: 'Edit Existing',
          cancelButtonText: 'Choose Different Key',
        },
        width: '500px',
      });
      await vi.waitFor(() => expect(closedWith()).toEqual({ kind: 'open-existing', fullKey: 'common.buttons.ok' }));
    });
  });

  describe('Create errors from the server', () => {
    it('should show the unexpected-error token for a non-API failure', async () => {
      apiSpies.createResource.mockReturnValue(throwError(() => new Error('Unexpected')));
      component.form.controls.key.setValue('ok');
      component.form.controls.baseValue.setValue('OK');
      component.form.controls.comment.setValue('A comment');

      await component.onSubmit();

      expect(component.errorMessage()).toBe('An unexpected error occurred');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should open the conflict dialog and set shouldOpenEdit/existingResourceKey on a server-side 409', async () => {
      apiSpies.createResource.mockReturnValue(
        throwError(() =>
          toApiError(
            new HttpErrorResponse({
              status: 409,
              statusText: 'Conflict',
              error: { statusCode: 409, message: 'Resource already exists: common.buttons.ok' },
            }),
          ),
        ),
      );
      mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });

      component.form.controls.key.setValue('ok');
      component.form.controls.baseValue.setValue('OK');
      component.form.controls.comment.setValue('The affirmative button');

      await component.onSubmit();

      await vi.waitFor(() => expect(mockDialog.open).toHaveBeenCalled());
      await vi.waitFor(() => expect(closedWith()).toEqual({ kind: 'open-existing', fullKey: 'common.buttons.ok' }));
    });

    it('should show the server message for a 400 the API rejected as invalid', async () => {
      apiSpies.createResource.mockReturnValue(
        throwError(() =>
          toApiError(
            new HttpErrorResponse({
              status: 400,
              statusText: 'Bad Request',
              error: { statusCode: 400, message: 'Invalid resource key' },
            }),
          ),
        ),
      );

      component.form.controls.key.setValue('ok');
      component.form.controls.baseValue.setValue('OK');
      component.form.controls.comment.setValue('A comment');

      await component.onSubmit();

      expect(component.errorMessage()).toBe('Invalid resource key');
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should fall back to the create-failed message for a network failure, which carries no server message', async () => {
      apiSpies.createResource.mockReturnValue(
        throwError(() => toApiError(new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }))),
      );

      component.form.controls.key.setValue('ok');
      component.form.controls.baseValue.setValue('OK');
      component.form.controls.comment.setValue('A comment');

      await component.onSubmit();

      expect(component.errorMessage()).toBe('Failed to create translation');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('Sticky similar values', () => {
    const hit = (fullKey: string, value: string): SearchResultDto => ({
      ...summary(fullKey, value),
      matchType: 'similar-value',
    });

    const searchReturns = (results: ReturnType<typeof hit>[]): void => {
      apiSpies.searchTranslations.mockReturnValue(
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

    it('keeps the similar-values spinner through an eligible value’s debounce', () => {
      const pending = new Subject<{
        query: string;
        results: SearchResultDto[];
        totalFound: number;
        limited: boolean;
      }>();
      apiSpies.searchTranslations.mockReturnValue(pending);
      typeAndSettle('Save changes');
      expect(component.isSearchingSimilar()).toBe(true);

      component.form.controls.baseValue.setValue('Save changes now');
      expect(component.isSearchingSimilar()).toBe(true);
      vi.advanceTimersByTime(299);
      expect(component.isSearchingSimilar()).toBe(true);
      vi.advanceTimersByTime(1);
      pending.next({ query: 'Save changes now', results: [], totalFound: 0, limited: false });
      expect(component.isSearchingSimilar()).toBe(false);

      component.form.controls.baseValue.setValue('Sa');
      expect(component.isSearchingSimilar()).toBe(false);
    });

    it('should stay silent below the three-character floor', () => {
      searchReturns([hit('common.actions.ok', 'OK')]);
      typeAndSettle('OK');

      expect(apiSpies.searchTranslations).not.toHaveBeenCalled();
      expect(component.showSimilarContext()).toBe(false);
    });

    it('should show nothing in edit mode until the value differs, and clear again on revert', () => {
      vi.useRealTimers();
      renderDialog(createMockData('edit', summary('common.buttons.saveShortcutHint', 'Press Ctrl + Enter')));
      vi.useFakeTimers();
      searchReturns([hit('common.actions.save', 'Press Ctrl + Enter')]);

      typeAndSettle('Press Ctrl + Enter');
      expect(apiSpies.searchTranslations).not.toHaveBeenCalled();
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

    it('should ask the API for similar values, one more than it shows, and keep at most ten', () => {
      searchReturns(Array.from({ length: 11 }, (_, index) => hit(`common.actions.save${index}`, 'Save changes')));
      typeAndSettle('Save changes');

      expect(apiSpies.searchTranslations).toHaveBeenCalledWith('test-collection', 'Save changes', 11, 'similar');
      expect(component.similarCount()).toBe(10);
    });

    it('should drop the entry being edited and keep the ranked order of the rest', () => {
      vi.useRealTimers();
      renderDialog(createMockData('edit', summary('common.actions.save', 'Save')));
      vi.useFakeTimers();
      searchReturns([
        hit('common.actions.saveDraft', 'Save draft'),
        hit('common.actions.save', 'Save'),
        hit('browser.translationEditor.saveAnyway', 'Save Anyway'),
      ]);

      typeAndSettle('Save draft');

      expect(component.similarResources().map((result) => result.fullKey)).toEqual([
        'common.actions.saveDraft',
        'browser.translationEditor.saveAnyway',
      ]);
      expect(component.similarCount()).toBe(2);
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
    it('should show the missing-resource token when an edit has no original entry', async () => {
      renderDialog(createMockData('edit'));
      component.form.controls.key.setValue('ok');
      component.form.controls.baseValue.setValue('OK');
      component.form.controls.comment.setValue('A comment');

      await component.onSubmit();

      expect(component.errorMessage()).toBe('Cannot update: resource data is missing');
      expect(apiSpies.updateResource).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should show the update-failed token for an update API error without a server message', async () => {
      apiSpies.updateResource.mockReturnValue(throwError(() => toApiError(new HttpErrorResponse({ status: 503 }))));
      renderDialog(createMockData('edit', summary('common.buttons.ok', 'OK', {}, { comment: 'A comment' })));

      await component.onSubmit();

      expect(component.errorMessage()).toBe('Failed to update translation');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should show the invalid-request token for an update API error without a server message', async () => {
      apiSpies.updateResource.mockReturnValue(throwError(() => toApiError(new HttpErrorResponse({ status: 400 }))));
      renderDialog(createMockData('edit', summary('common.buttons.ok', 'OK', {}, { comment: 'A comment' })));

      await component.onSubmit();

      expect(component.errorMessage()).toBe('Invalid request');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should call updateResource API when submitting in edit mode', async () => {
      const mockResource = summary(
        'common.buttons.existing_key',
        'Existing Value',
        { fr: ['Valeur existante', 'translated'] },
        { comment: 'Existing comment' },
      );

      const editData = createMockData('edit', mockResource);
      apiSpies.updateResource.mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true }));
      renderDialog(editData);

      component.form.controls.baseValue.setValue('Updated Value');
      component.form.controls.comment.setValue('Updated comment');

      await component.onSubmit();

      expect(apiSpies.updateResource).toHaveBeenCalledWith(
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
      const mockResource = summary('common.buttons.existing_key', 'Existing Value', {
        fr: ['Valeur existante', 'translated'],
      });

      const editData = createMockData('edit', mockResource);
      apiSpies.updateResource.mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true }));
      renderDialog(editData);

      const translationsArray = component.form.controls.translations;
      const frControl = translationsArray.controls.find((c) => c.value.locale === 'fr');
      frControl?.patchValue({ value: 'Nouvelle valeur' });

      await component.onSubmit();

      expect(apiSpies.updateResource).toHaveBeenCalledWith(
        'test-collection',
        expect.objectContaining({
          locales: {
            fr: { value: 'Nouvelle valeur', status: 'translated' },
          },
        }),
      );
    });

    it('should handle update API errors', async () => {
      const mockResource = summary('common.buttons.existing_key', 'Existing Value');

      const editData = createMockData('edit', mockResource);
      apiSpies.updateResource.mockReturnValue(
        throwError(() =>
          toApiError(
            new HttpErrorResponse({
              status: 404,
              statusText: 'Not Found',
              error: { message: 'Resource not found' },
            }),
          ),
        ),
      );
      renderDialog(editData);

      await component.onSubmit();

      expect(component.errorMessage()).toBe('Resource not found. It may have been deleted.');
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should close dialog with success result on successful update', async () => {
      const mockResource = summary(
        'common.buttons.existing_key',
        'Existing Value',
        { fr: ['Valeur existante', 'translated'] },
        { comment: 'Existing comment' },
      );

      const editData = createMockData('edit', mockResource);
      apiSpies.updateResource.mockReturnValue(of({ resolvedKey: 'common.buttons.existing_key', updated: true }));
      renderDialog(editData);

      component.form.controls.baseValue.setValue('Updated Value');

      await component.onSubmit();

      expect(closedWith()).toEqual({ kind: 'saved', fullKey: 'common.buttons.existing_key', skippedLocales: [] });
      expect(apiSpies.updateResource.mock.calls.at(-1)?.[1]).toMatchObject({
        key: 'common.buttons.existing_key',
        baseValue: 'Updated Value',
      });
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
      await vi.waitFor(() => expect(mockNotifications.success).toHaveBeenCalledWith('Copied to clipboard'));
      spectator.detectChanges();

      expect(mockClipboard.writeText).toHaveBeenCalledWith('common.buttons.ok');
      expect(mockNotifications.success).toHaveBeenCalledWith('Copied to clipboard');
      expect(component.keyJustCopied()).toBe(true);
      expect(spectator.query('[data-testid="footer-key"] .footer-key-icon')?.textContent?.trim()).toBe('check');
    });

    it('should say so when the clipboard refuses', async () => {
      mockClipboard.writeText = vi.fn(() => Promise.reject(new Error('denied')));

      spectator.click('[data-testid="footer-key"]');
      await vi.waitFor(() => expect(mockNotifications.error).toHaveBeenCalledWith('Failed to copy'));
      spectator.detectChanges();

      expect(mockNotifications.error).toHaveBeenCalledWith('Failed to copy');
      expect(component.keyJustCopied()).toBe(false);
    });

    it('should keep the collision colour on the copy button', () => {
      const store = spectator.inject(BrowserStore);
      patchState(unprotected(store), {
        currentFolderPath: 'common.buttons',
        translations: [summary('common.buttons.ok', 'OK')],
      });
      spectator.detectChanges();

      expect(spectator.query('[data-testid="footer-key"]')).toHaveClass('mono--dup');
    });
  });
  describe('Preferred terminology advisories', () => {
    const expenditure = {
      discouraged: 'Expenditure',
      preferred: 'Investment',
      reason: 'Former financial-planning term.',
    };
    const customField = { discouraged: 'Custom Field', preferred: 'Configurable Field' };

    const useRules = (rules: LingoTrackerConfigDto['preferredTerminology'], error?: string): void => {
      mockConfig.set({
        baseLocale: 'en',
        locales: ['en', 'fr', 'de'],
        collections: {},
        preferredTerminology: rules,
        preferredTerminologyError: error,
      } as LingoTrackerConfigDto);
    };

    const advisories = (): HTMLElement[] => spectator.queryAll<HTMLElement>('[data-testid="preferred-term-advisory"]');
    const baseTextarea = (): HTMLTextAreaElement | null =>
      spectator.query<HTMLTextAreaElement>('#translation-editor-base-value');

    const openEditing = (baseValue: string): void => {
      renderDialog(createMockData('edit', summary('common.buttons.label', baseValue)));
    };

    const type = (value: string, settle = true): void => {
      component.form.controls.baseValue.setValue(value);
      if (settle) {
        vi.advanceTimersByTime(PREFERRED_TERM_DEBOUNCE_MS);
      }
      spectator.detectChanges();
    };

    beforeEach(() => {
      useRules([expenditure, customField]);
      renderDialog(createMockData('create'));
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should wait for a typing pause before advising', () => {
      component.form.controls.baseValue.setValue('Capital Expenditure');
      vi.advanceTimersByTime(PREFERRED_TERM_DEBOUNCE_MS - 1);
      spectator.detectChanges();
      expect(advisories()).toHaveLength(0);

      vi.advanceTimersByTime(1);
      spectator.detectChanges();

      expect(advisories()).toHaveLength(1);
      expect(advisories()[0].textContent).toContain(
        'Preferred terminology: consider “Investment” instead of “Expenditure”.',
      );
      expect(spectator.query('[data-testid="preferred-term-use"]')?.textContent?.trim()).toBe('Use “Investment”');
    });

    it('should advise at once when an existing value opens', () => {
      openEditing('Review the expenditure');

      expect(advisories()).toHaveLength(1);
    });

    it('should show one advisory per matched rule', () => {
      type('Expenditure on the Custom Field, and more expenditure');

      expect(advisories()).toHaveLength(2);
      expect(advisories()[0].textContent).toContain('“Expenditure”');
      expect(advisories()[1].textContent).toContain('“Custom Field”');
    });

    it('should show the reason only when the rule has one', () => {
      type('Expenditure on the Custom Field');

      const [withReason, withoutReason] = advisories();
      expect(withReason.querySelector('[data-testid="preferred-term-reason"]')?.textContent?.trim()).toBe(
        'Former financial-planning term.',
      );
      expect(withoutReason.querySelector('[data-testid="preferred-term-reason"]')).toBeNull();
    });

    it('should replace every occurrence on Use without saving', () => {
      component.form.controls.key.setValue('label');
      type('Expenditure, expenditure-report and {expenditure} stay');

      spectator.click('[data-testid="preferred-term-use"]');
      spectator.detectChanges();

      expect(component.form.controls.baseValue.value).toBe('Investment, Investment-report and {expenditure} stay');
      expect(component.form.controls.baseValue.dirty).toBe(true);
      expect(apiSpies.createResource).not.toHaveBeenCalled();
      expect(apiSpies.updateResource).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      // Gone without waiting out the debounce.
      expect(advisories()).toHaveLength(0);
      expect(spectator.query<HTMLButtonElement>('[data-testid="submit"]')?.disabled).toBe(false);
      expect(component.isFormValid()).toBe(true);
    });

    it('should hand focus back to the field after Use', () => {
      type('Expenditure');

      spectator.click('[data-testid="preferred-term-use"]');
      vi.advanceTimersByTime(0);

      expect(document.activeElement).toBe(baseTextarea());
    });

    it('should run the normal value-change flow on Use', () => {
      type('Total expenditure for the year');
      apiSpies.searchTranslations.mockClear();

      spectator.click('[data-testid="preferred-term-use"]');
      vi.advanceTimersByTime(300);

      expect(component.baseValueText()).toBe('Total Investment for the year');
      expect(apiSpies.searchTranslations).toHaveBeenCalledWith(
        'test-collection',
        'Total Investment for the year',
        expect.any(Number),
        'similar',
      );
    });

    it('should leave only the untouched rule after Use', () => {
      type('Expenditure on the Custom Field');

      spectator.click('[data-testid="preferred-term-use"]');
      spectator.detectChanges();

      expect(advisories()).toHaveLength(1);
      expect(advisories()[0].textContent).toContain('“Custom Field”');
    });

    it('should drop the advisory once the term is removed', () => {
      type('Expenditure');
      expect(advisories()).toHaveLength(1);

      type('Investment');

      expect(advisories()).toHaveLength(0);
    });

    it('should not block saving or make the field invalid', async () => {
      component.form.controls.key.setValue('label');
      component.form.controls.comment.setValue('A comment');
      type('Expenditure');

      expect(component.form.controls.baseValue.valid).toBe(true);
      expect(component.isFormValid()).toBe(true);

      await component.onSubmit();

      expect(apiSpies.createResource).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should render nothing without rules', () => {
      useRules(undefined);
      openEditing('Expenditure');

      expect(spectator.query('app-preferred-term-advisories')).toBeNull();
    });

    it('should render nothing when the rule file failed to load', () => {
      useRules(undefined, 'Invalid JSON');
      openEditing('Expenditure');

      expect(spectator.query('app-preferred-term-advisories')).toBeNull();
    });

    it('should describe the field with the advisories only while they exist', () => {
      expect(baseTextarea()?.getAttribute('aria-describedby')).toBe('translation-editor-icu-hint');

      type('Expenditure');

      const container = spectator.query(`#${PREFERRED_TERM_ADVISORIES_ID}`);
      expect(container).not.toBeNull();
      expect(baseTextarea()?.getAttribute('aria-describedby')).toBe(
        `translation-editor-icu-hint ${PREFERRED_TERM_ADVISORIES_ID}`,
      );

      type('Investment');

      expect(baseTextarea()?.getAttribute('aria-describedby')).toBe('translation-editor-icu-hint');
    });

    it('should keep the base-value error in the description alongside the advisories', () => {
      type('Expenditure');
      component.submitAttempted.set(true);
      component.form.controls.baseValue.setErrors({ required: true });
      spectator.detectChanges();

      expect(baseTextarea()?.getAttribute('aria-describedby')).toBe(
        `translation-editor-base-value-error ${PREFERRED_TERM_ADVISORIES_ID}`,
      );
    });

    it('should not announce advisories as a live region', () => {
      type('Expenditure on the Custom Field');

      const advisoryRoot = spectator.query('app-preferred-term-advisories');
      expect(advisoryRoot?.querySelector('[aria-live]')).toBeNull();
      expect(advisoryRoot?.querySelector('[role="status"], [role="alert"], [role="log"]')).toBeNull();
      expect(advisoryRoot?.closest('[aria-live]')).toBeNull();
    });

    it('should advise without offering Use when read-only', () => {
      renderDialog({
        ...createMockData('edit', summary('common.buttons.label', 'Expenditure')),
        readOnly: true,
      });

      expect(advisories()).toHaveLength(1);
      expect(spectator.query('[data-testid="preferred-term-use"]')).toBeNull();
    });
  });
});
