import { HttpErrorResponse } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog, type MatDialogConfig } from '@angular/material/dialog';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { ResourceSummaryDto, ResourceTreeDto } from '@simoncodes-ca/data-transfer';
import { NEVER, type Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { collectionSettings } from '../../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { provideTrackerHttpClient, toApiError } from '../../shared/api-error/api-error';
import { NotificationService } from '../../shared/notification';
import {
  type EditorOutcome,
  TRANSLATION_EDITOR_TITLE_ID,
  type TranslationEditorDialogData,
} from '../dialogs/translation-editor';
import { BrowserStore } from '../store/browser.store';
import { BrowserApiService } from './browser-api.service';
import { CREATE_WARNING_DELAY_MS, TranslationEditorLauncher } from './translation-editor-launcher';

/** A stand-in for `MatDialog`: records every editor it opens and closes each with the next queued outcome. */
class FakeDialog {
  readonly opened: MatDialogConfig<TranslationEditorDialogData>[] = [];
  readonly outcomes: (EditorOutcome | undefined)[] = [];

  open(_component: unknown, config: MatDialogConfig<TranslationEditorDialogData>) {
    this.opened.push(config);
    const outcome = this.outcomes.shift();
    return { afterClosed: () => of(outcome) };
  }

  /** The data of the nth editor opened. */
  data(index = 0): TranslationEditorDialogData | undefined {
    return this.opened[index]?.data ?? undefined;
  }
}

describe('TranslationEditorLauncher', () => {
  let launcher: TranslationEditorLauncher;
  let store: InstanceType<typeof BrowserStore>;
  let dialog: FakeDialog;
  let getResourceTree: Mock<
    (collection: string, path?: string, includeNested?: boolean) => Observable<ResourceTreeDto>
  >;
  let notifications: { success: Mock; info: Mock; warning: Mock; error: Mock };

  const resource: ResourceSummaryDto = {
    fullKey: 'browser.header.backButton',
    folderPath: 'browser.header',
    entryKey: 'backButton',
    base: { locale: 'en', value: 'Back' },
    targets: [{ locale: 'fr', needsWork: true, sameAsBase: false }],
    tags: [],
    inheritedTags: [],
  };

  beforeEach(() => {
    dialog = new FakeDialog();
    getResourceTree = vi.fn(() => of({ path: 'browser.header', resources: [resource], children: [] }));
    notifications = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      imports: [getTranslocoTestingModule()],
      providers: [
        provideTrackerHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: dialog },
        { provide: BrowserApiService, useValue: { getResourceTree, getCacheStatus: () => NEVER } },
        { provide: NotificationService, useValue: notifications },
      ],
    });

    launcher = TestBed.inject(TranslationEditorLauncher);
    store = TestBed.inject(BrowserStore);
    patchState(unprotected(store), {
      selectedCollection: 'test-collection',
      availableLocales: ['en', 'fr'],
      baseLocale: 'en',
      currentFolderPath: 'browser',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('opening the editor', () => {
    it('should open a create in the folder the list shows', async () => {
      await launcher.openCreate();

      expect(dialog.data()).toEqual({
        mode: 'create',
        folderPath: 'browser',
        collectionName: 'test-collection',
        availableLocales: ['en', 'fr'],
        baseLocale: 'en',
        readOnly: false,
      });
      expect(dialog.opened[0]).toMatchObject({
        panelClass: 'translation-editor-dialog-panel',
        maxWidth: '100vw',
        autoFocus: false,
        ariaLabelledBy: TRANSLATION_EDITOR_TITLE_ID,
        restoreFocus: true,
      });
    });

    it('should open an edit on the resource, in its own folder, read-only when the collection is', async () => {
      patchState(unprotected(store), { isReadOnly: true });

      await launcher.openEdit(resource);

      expect(dialog.data()).toMatchObject({ mode: 'edit', resource, folderPath: 'browser.header', readOnly: true });
      expect(dialog.opened[0]?.restoreFocus).toBe(false);
    });

    it('should open nothing without an open collection', async () => {
      patchState(unprotected(store), { selectedCollection: null });

      expect(await launcher.openCreate()).toEqual({ kind: 'cancelled' });
      expect(dialog.opened).toEqual([]);
    });
  });

  describe('outcomes', () => {
    it('should confirm a save and warn about skipped locales', async () => {
      dialog.outcomes.push({ kind: 'saved', fullKey: resource.fullKey, skippedLocales: ['fr'] });

      const outcome = await launcher.openEdit(resource);

      expect(outcome).toEqual({ kind: 'saved', fullKey: resource.fullKey, skippedLocales: ['fr'] });
      expect(notifications.success).toHaveBeenCalledWith('Translation updated successfully');
      expect(notifications.warning).toHaveBeenCalledWith('Auto-translation skipped for fr');
    });

    it('should say where a moved entry went', async () => {
      dialog.outcomes.push({ kind: 'moved', fullKey: 'backButton', folderPath: '', skippedLocales: [] });

      await launcher.openEdit(resource);

      expect(notifications.success).toHaveBeenCalledWith('Moved "backButton" to root');
      expect(notifications.warning).not.toHaveBeenCalled();
    });

    it('should confirm a create, then warn about skipped locales once the first toast is gone', async () => {
      vi.useFakeTimers();
      dialog.outcomes.push({ kind: 'created', fullKey: 'browser.ok', skippedLocales: ['fr', 'de'] });

      await launcher.openCreate();

      expect(notifications.success).toHaveBeenCalledWith('Resource created successfully');
      expect(notifications.warning).not.toHaveBeenCalled();
      vi.advanceTimersByTime(CREATE_WARNING_DELAY_MS);
      expect(notifications.warning).toHaveBeenCalledWith('Auto-translation skipped for fr, de');
    });

    it('should say nothing for a cancel, or a dialog closed without a result', async () => {
      dialog.outcomes.push({ kind: 'cancelled' }, undefined);

      expect(await launcher.openEdit(resource)).toEqual({ kind: 'cancelled' });
      expect(await launcher.openCreate()).toEqual({ kind: 'cancelled' });
      expect(notifications.success).not.toHaveBeenCalled();
      expect(notifications.warning).not.toHaveBeenCalled();
    });

    it('should hand a taken key over to an edit of the entry that holds it, in its folder', async () => {
      patchState(unprotected(store), { listScope: { kind: 'search', query: 'back' } });
      dialog.outcomes.push({ kind: 'open-existing', fullKey: resource.fullKey });

      dialog.outcomes.push({ kind: 'saved', fullKey: resource.fullKey, skippedLocales: [] });

      // The create resolves with the outcome of the edit it handed over to.
      expect(await launcher.openCreate()).toEqual({ kind: 'saved', fullKey: resource.fullKey, skippedLocales: [] });
      expect(dialog.opened).toHaveLength(2);

      expect(getResourceTree).toHaveBeenCalledWith('test-collection', 'browser.header', false);
      expect(dialog.data(1)).toMatchObject({ mode: 'edit', resource, folderPath: 'browser.header' });
      expect(store.isSearchMode()).toBe(false);
      expect(store.currentFolderPath()).toBe('browser.header');
      expect(notifications.success).toHaveBeenCalledTimes(1);
      expect(notifications.success).toHaveBeenCalledWith('Translation updated successfully');
    });
  });

  describe('openByFullKey', () => {
    it('reads the folder again for a later hand-off after the resource changes', async () => {
      const updated = { ...resource, base: { locale: 'en', value: 'Return' } };
      getResourceTree
        .mockReturnValueOnce(of({ path: 'browser.header', resources: [resource], children: [] }))
        .mockReturnValueOnce(of({ path: 'browser.header', resources: [updated], children: [] }));
      vi.spyOn(store, 'showFolder').mockImplementation(() => undefined);

      await launcher.openByFullKey(resource.fullKey);
      await launcher.openByFullKey(resource.fullKey);

      expect(getResourceTree).toHaveBeenCalledTimes(2);
      expect(dialog.data(0)?.resource?.base.value).toBe('Back');
      expect(dialog.data(1)?.resource?.base.value).toBe('Return');
    });

    it('should resolve a root-level key against the collection root', async () => {
      getResourceTree.mockReturnValue(
        of({ path: '', resources: [{ ...resource, fullKey: 'backButton', folderPath: '' }], children: [] }),
      );

      await launcher.openByFullKey('backButton');

      expect(getResourceTree).toHaveBeenCalledWith('test-collection', '', false);
      expect(dialog.opened).toHaveLength(1);
    });

    it('should report a key the folder no longer holds instead of opening an empty editor', async () => {
      getResourceTree.mockReturnValue(of({ path: 'browser.header', resources: [], children: [] }));

      expect(await launcher.openByFullKey(resource.fullKey)).toEqual({ kind: 'cancelled' });
      expect(dialog.opened).toEqual([]);
      expect(notifications.error).toHaveBeenCalledWith('Resource not found. It may have been deleted.');
    });

    it('should report a failed lookup the same way', async () => {
      getResourceTree.mockReturnValue(
        throwError(() =>
          toApiError(
            new HttpErrorResponse({ status: 500, error: { statusCode: 500, error: 'Internal Server Error' } }),
          ),
        ),
      );

      await launcher.openByFullKey(resource.fullKey);

      expect(dialog.opened).toEqual([]);
      expect(notifications.error).toHaveBeenCalledWith('Resource not found. It may have been deleted.');
    });

    it('should open nothing, nor move the list, when another collection opened during the lookup', async () => {
      const lookup = new Subject<ResourceTreeDto>();
      getResourceTree.mockReturnValue(lookup);

      const opening = launcher.openByFullKey(resource.fullKey);
      store.openCollection(collectionSettings({ name: 'other' }));
      lookup.next({ path: 'browser.header', resources: [resource], children: [] });

      expect(await opening).toEqual({ kind: 'cancelled' });
      expect(dialog.opened).toEqual([]);
      expect(store.currentFolderPath()).toBe('');
      expect(notifications.error).not.toHaveBeenCalled();
    });
  });
});
