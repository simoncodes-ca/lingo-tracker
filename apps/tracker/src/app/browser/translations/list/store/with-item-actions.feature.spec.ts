import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../../i18n-types/tracker-resources';
import { collectionSettings } from '../../../../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../../../../testing/transloco-testing.module';
import { toApiError } from '../../../../shared/api-error/api-error';
import { NotificationService } from '../../../../shared/notification';
import { BrowserApiService } from '../../../services/browser-api.service';
import { TranslationEditorLauncher } from '../../../services/translation-editor-launcher';
import { BrowserStore } from '../../../store/browser.store';
import { TranslationListStore } from './translation-list.store';

const entry: ResourceSummaryDto = {
  fullKey: 'common.save',
  folderPath: 'common',
  entryKey: 'save',
  base: { locale: 'en', value: 'Save' },
  targets: [{ locale: 'fr', value: '', needsWork: true, sameAsBase: false }],
  tags: [],
  inheritedTags: [],
};

describe('TranslationListStore item actions', () => {
  let actions: InstanceType<typeof TranslationListStore>;
  let browser: InstanceType<typeof BrowserStore>;
  let api: { deleteResource: ReturnType<typeof vi.fn>; translateResource: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let notifications: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
  };
  let launcher: { openEdit: ReturnType<typeof vi.fn> };

  const openCollection = (readOnly = false): void => {
    browser.openCollection(collectionSettings({ name: 'my-collection', locales: ['en', 'fr'], readOnly }));
  };

  const expectNoNotifications = (): void => {
    expect(notifications.success).not.toHaveBeenCalled();
    expect(notifications.error).not.toHaveBeenCalled();
    expect(notifications.info).not.toHaveBeenCalled();
    expect(notifications.warning).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    api = { deleteResource: vi.fn(), translateResource: vi.fn() };
    dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };
    notifications = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() };
    launcher = { openEdit: vi.fn() };
    TestBed.configureTestingModule({
      imports: [getTranslocoTestingModule()],
      providers: [
        TranslationListStore,
        { provide: BrowserApiService, useValue: api },
        { provide: MatDialog, useValue: dialog },
        { provide: NotificationService, useValue: notifications },
        { provide: TranslationEditorLauncher, useValue: launcher },
      ],
    });
    browser = TestBed.inject(BrowserStore);
    actions = TestBed.inject(TranslationListStore);
  });

  it('confirms deletion with the existing dialog data and deletes the entry', async () => {
    openCollection();
    api.deleteResource.mockReturnValue(of({ entriesDeleted: 1 }));

    await actions.deleteTranslation(entry);

    const transloco = TestBed.inject(TranslocoService);
    expect(dialog.open).toHaveBeenCalledWith(expect.any(Function), {
      data: {
        title: transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.DELETERESOURCE.TITLE),
        message: transloco.translate(TRACKER_TOKENS.BROWSER.DIALOG.DELETERESOURCE.MESSAGEX, { key: entry.fullKey }),
        confirmButtonText: transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.DELETE),
        cancelButtonText: transloco.translate(TRACKER_TOKENS.COMMON.ACTIONS.CANCEL),
        actionType: 'destructive',
      },
    });
    expect(api.deleteResource).toHaveBeenCalledWith('my-collection', ['common.save']);
    expect(notifications.success).toHaveBeenCalledWith(
      transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.RESOURCEDELETED),
    );
  });

  it('does not delete when confirmation is cancelled', async () => {
    openCollection();
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });

    await actions.deleteTranslation(entry);

    expect(api.deleteResource).not.toHaveBeenCalled();
    expect(notifications.success).not.toHaveBeenCalled();
  });

  it('does not open confirmation for a read-only collection', async () => {
    openCollection(true);

    await actions.deleteTranslation(entry);

    expect(dialog.open).not.toHaveBeenCalled();
    expect(api.deleteResource).not.toHaveBeenCalled();
    expectNoNotifications();
  });

  it('does not open confirmation without a collection', async () => {
    await actions.deleteTranslation(entry);

    expect(dialog.open).not.toHaveBeenCalled();
    expect(api.deleteResource).not.toHaveBeenCalled();
  });

  it('reports a failed deletion using the API message', async () => {
    openCollection();
    api.deleteResource.mockReturnValue(
      throwError(() => toApiError(new HttpErrorResponse({ status: 404, error: { message: 'Gone' } }))),
    );

    await actions.deleteTranslation(entry);

    expect(notifications.error).toHaveBeenCalledWith('Gone');
  });

  it('translates the entry and reports success', () => {
    openCollection();
    api.translateResource.mockReturnValue(of({ resource: entry, translatedCount: 1, skippedLocales: [] }));

    actions.translateResource(entry);

    expect(api.translateResource).toHaveBeenCalledWith('my-collection', 'common.save');
    expect(actions.isTranslating(entry.fullKey)).toBe(false);
    expect(actions.isRecentlyUpdated(entry.fullKey)).toBe(true);
    expect(notifications.success).toHaveBeenCalled();
  });

  it('toasts the translated locales and a warning for the skipped ones', () => {
    openCollection();
    api.translateResource.mockReturnValue(of({ resource: entry, translatedCount: 2, skippedLocales: ['de', 'ja'] }));

    actions.translateResource(entry);

    expect(notifications.success).toHaveBeenCalledWith('2 locales translated successfully');
    expect(notifications.warning).toHaveBeenCalledWith('Auto-translation skipped for de, ja');
    expect(actions.isRecentlyUpdated(entry.fullKey)).toBe(true);
  });

  it('says everything is up to date when nothing was translated or skipped', () => {
    openCollection();
    api.translateResource.mockReturnValue(of({ resource: entry, translatedCount: 0, skippedLocales: [] }));

    actions.translateResource(entry);

    expect(notifications.info).toHaveBeenCalledWith('All locales are already up to date');
    expect(notifications.success).not.toHaveBeenCalled();
  });

  it('reports a delete that removed nothing as a failure', async () => {
    openCollection();
    api.deleteResource.mockReturnValue(of({ entriesDeleted: 0 }));

    await actions.deleteTranslation(entry);

    expect(notifications.error).toHaveBeenCalledWith('Failed to delete resource');
  });

  it('reports translation failure and clears the pending state', () => {
    openCollection();
    api.translateResource.mockReturnValue(
      throwError(() => toApiError(new HttpErrorResponse({ status: 404, error: { message: 'Gone' } }))),
    );

    actions.translateResource(entry);

    expect(actions.isTranslating(entry.fullKey)).toBe(false);
    expect(notifications.error).toHaveBeenCalledWith('Gone');
  });

  it('does not translate without a collection', () => {
    actions.translateResource(entry);

    expect(api.translateResource).not.toHaveBeenCalled();
    expect(actions.isTranslating(entry.fullKey)).toBe(false);
    expect(actions.isRecentlyUpdated(entry.fullKey)).toBe(false);
    expectNoNotifications();
  });

  it('does not translate a read-only collection', () => {
    openCollection(true);

    actions.translateResource(entry);

    expect(api.translateResource).not.toHaveBeenCalled();
    expect(actions.isTranslating(entry.fullKey)).toBe(false);
    expect(actions.isRecentlyUpdated(entry.fullKey)).toBe(false);
    expectNoNotifications();
  });

  it('does not delete when the collection changes while confirmation is open', async () => {
    openCollection();
    const closed = new Subject<boolean>();
    dialog.open.mockReturnValue({ afterClosed: () => closed.asObservable() });
    const deletion = actions.deleteTranslation(entry);
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledOnce());

    browser.openCollection(collectionSettings({ name: 'another-collection' }));
    closed.next(true);
    closed.complete();
    await deletion;

    expect(api.deleteResource).not.toHaveBeenCalled();
    expectNoNotifications();
  });

  it('clears pending translation without flashing or toasting a stale response', () => {
    openCollection();
    const response = new Subject<{ resource: ResourceSummaryDto; translatedCount: number; skippedLocales: string[] }>();
    api.translateResource.mockReturnValue(response.asObservable());
    actions.translateResource(entry);
    expect(actions.isTranslating(entry.fullKey)).toBe(true);

    browser.openCollection(collectionSettings({ name: 'another-collection' }));
    response.next({ resource: entry, translatedCount: 1, skippedLocales: [] });
    response.complete();

    expect(actions.isTranslating(entry.fullKey)).toBe(false);
    expect(actions.isRecentlyUpdated(entry.fullKey)).toBe(false);
    expectNoNotifications();
  });

  it('copies the entry key and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    actions.copyKey(entry);
    await vi.waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith(
        TestBed.inject(TranslocoService).translate(TRACKER_TOKENS.BROWSER.TOAST.COPIEDTOCLIPBOARD),
      ),
    );

    expect(writeText).toHaveBeenCalledWith('common.save');
    expect(notifications.success).toHaveBeenCalledWith(
      TestBed.inject(TranslocoService).translate(TRACKER_TOKENS.BROWSER.TOAST.COPIEDTOCLIPBOARD),
    );
  });

  it('reports clipboard failure', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
      configurable: true,
    });

    actions.copyKey(entry);
    await vi.waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        TestBed.inject(TranslocoService).translate(TRACKER_TOKENS.BROWSER.TOAST.COPYFAILED),
      ),
    );

    expect(notifications.error).toHaveBeenCalledWith(
      TestBed.inject(TranslocoService).translate(TRACKER_TOKENS.BROWSER.TOAST.COPYFAILED),
    );
  });

  it('opens the entry for edit and flashes a saved row', async () => {
    launcher.openEdit.mockResolvedValue({ kind: 'saved', fullKey: entry.fullKey, skippedLocales: [] });

    actions.editTranslation(entry);
    await Promise.resolve();

    expect(launcher.openEdit).toHaveBeenCalledWith(entry);
    expect(actions.isRecentlyUpdated(entry.fullKey)).toBe(true);
  });
});
