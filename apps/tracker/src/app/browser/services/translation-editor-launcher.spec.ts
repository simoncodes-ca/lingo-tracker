import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { patchState } from '@ngrx/signals';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { NotificationService } from '../../shared/notification';
import { BrowserStore } from '../store/browser.store';
import { BrowserApiService } from './browser-api.service';
import { TRANSLATION_EDITOR_TITLE_ID } from '../dialogs/translation-editor';
import { TranslationEditorLauncher } from './translation-editor-launcher';

describe('TranslationEditorLauncher', () => {
  let launcher: TranslationEditorLauncher;
  let store: InstanceType<typeof BrowserStore>;
  let mockDialog: { open: Mock };
  let mockApi: { getResourceTree: Mock };
  let notifications: { success: Mock; info: Mock; warning: Mock; error: Mock };

  const resource = { key: 'backButton', translations: { en: 'Back' }, status: {} };

  beforeEach(() => {
    mockDialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(undefined) }) };
    mockApi = { getResourceTree: vi.fn().mockReturnValue(of({ resources: [resource], folders: [] })) };
    notifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      imports: [getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: mockDialog },
        { provide: BrowserApiService, useValue: mockApi },
        { provide: NotificationService, useValue: notifications },
      ],
    });

    launcher = TestBed.inject(TranslationEditorLauncher);
    store = TestBed.inject(BrowserStore);
    patchState(store, { availableLocales: ['en', 'fr'], baseLocale: 'en' });
  });

  describe('openByFullKey', () => {
    it('should open the editor in edit mode on the entry the key names', () => {
      launcher.openByFullKey('browser.header.backButton', 'test-collection');

      expect(mockApi.getResourceTree).toHaveBeenCalledWith('test-collection', 'browser.header', false);
      expect(mockDialog.open).toHaveBeenCalledTimes(1);

      const config = mockDialog.open.mock.calls[0][1];
      expect(config.data).toMatchObject({
        mode: 'edit',
        collectionName: 'test-collection',
        folderPath: 'browser.header',
        resource: { key: 'backButton' },
      });
      expect(config.panelClass).toBe('translation-editor-dialog-panel');
      expect(config.ariaLabelledBy).toBe(TRANSLATION_EDITOR_TITLE_ID);
    });

    it('should move the browser to the folder the entry lives in', () => {
      launcher.openByFullKey('browser.header.backButton', 'test-collection');

      expect(store.currentFolderPath()).toBe('browser.header');
    });

    it('should leave search mode before navigating, so the list matches the dialog', () => {
      patchState(store, { isSearchMode: true, searchQuery: 'back' });

      launcher.openByFullKey('browser.header.backButton', 'test-collection');

      expect(store.isSearchMode()).toBe(false);
    });

    it('should resolve a root-level key against the collection root', () => {
      launcher.openByFullKey('backButton', 'test-collection');

      expect(mockApi.getResourceTree).toHaveBeenCalledWith('test-collection', '', false);
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
    });

    it('should report a key the folder no longer holds instead of opening an empty editor', () => {
      mockApi.getResourceTree.mockReturnValue(of({ resources: [], folders: [] }));

      launcher.openByFullKey('browser.header.backButton', 'test-collection');

      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(notifications.error).toHaveBeenCalledWith('Resource not found. It may have been deleted.');
    });

    it('should report a failed lookup the same way', () => {
      mockApi.getResourceTree.mockReturnValue(throwError(() => new Error('boom')));

      launcher.openByFullKey('browser.header.backButton', 'test-collection');

      expect(mockDialog.open).not.toHaveBeenCalled();
      expect(notifications.error).toHaveBeenCalledWith('Resource not found. It may have been deleted.');
    });
  });

  describe('openEditor', () => {
    it('should update the cache under the store key and flash the row after a save', () => {
      patchState(store, { translations: [{ ...resource, key: 'backButton' }] });
      const onUpdated = vi.fn();
      mockDialog.open.mockReturnValue({
        afterClosed: () =>
          of({
            key: 'backButton',
            baseValue: 'Back',
            folderPath: 'browser.header',
            success: true,
            resource: { ...resource, translations: { en: 'Go back' } },
          }),
      });

      launcher.openEditor({
        resource,
        collectionName: 'test-collection',
        folderPath: 'browser.header',
        storeKey: 'backButton',
        onUpdated,
      });

      expect(store.translations()[0].translations['en']).toBe('Go back');
      expect(onUpdated).toHaveBeenCalledWith('backButton');
      expect(notifications.success).toHaveBeenCalled();
    });

    it('should drop the entry from the cache when it was saved into another folder', () => {
      patchState(store, { translations: [{ ...resource, key: 'backButton' }] });
      mockDialog.open.mockReturnValue({
        afterClosed: () =>
          of({
            key: 'backButton',
            baseValue: 'Back',
            folderPath: 'browser.footer',
            success: true,
            resource,
          }),
      });

      launcher.openEditor({
        resource,
        collectionName: 'test-collection',
        folderPath: 'browser.header',
        storeKey: 'backButton',
      });

      expect(store.translations()).toEqual([]);
      expect(notifications.success).not.toHaveBeenCalled();
    });
  });
});
