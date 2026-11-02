import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { ResourceSummaryDto, SearchResultDto } from '@simoncodes-ca/data-transfer';
import { firstValueFrom, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { ApiError, provideTrackerHttpClient } from '../../../shared/api-error/api-error';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../browser.store';

const RESOURCES_URL = '/api/collections/my-collection/resources';

const entry = (fullKey: string, en = fullKey, fr?: string): ResourceSummaryDto => {
  const segments = fullKey.split('.');
  const entryKey = segments.pop() ?? '';
  return {
    fullKey,
    folderPath: segments.join('.'),
    entryKey,
    base: { locale: 'en', value: en },
    targets: fr === undefined ? [] : [{ locale: 'fr', value: fr, needsWork: true, sameAsBase: fr === en }],
    tags: [],
    inheritedTags: [],
  };
};
const hit = (fullKey: string, en = fullKey): SearchResultDto => ({
  ...entry(fullKey, en),
  matchType: 'partial-value',
});

describe('BrowserStore entry writes', () => {
  let store: InstanceType<typeof BrowserStore>;
  let http: HttpTestingController;

  /** The folder list as the browser shows `common` with nested resources folded in. */
  const folderMode = (): void => {
    patchState(unprotected(store), {
      selectedCollection: 'my-collection',
      listScope: { kind: 'folder', path: 'common' },
      currentFolderPath: 'common',
      translations: [entry('common.save', 'Save'), entry('common.dialog.title', 'Title')],
    });
  };

  /** A search over the same collection, with the `common` folder list still behind it. */
  const searchMode = (): void => {
    folderMode();
    patchState(unprotected(store), {
      listScope: { kind: 'search', query: 'sa' },
      searchResults: [hit('common.save', 'Save'), hit('errors.save', 'Save')],
    });
  };

  const englishOf = (items: readonly ResourceSummaryDto[], fullKey: string): string | undefined =>
    items.find((item) => item.fullKey === fullKey)?.base.value;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [getTranslocoTestingModule()],
      providers: [provideTrackerHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(BrowserStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  describe('createResource', () => {
    it('should post the DTO and reload the current folder so the list shows the new entry', () => {
      folderMode();
      const next = vi.fn();

      store.createResource('my-collection', { key: 'common.ok', baseValue: 'OK' }).subscribe(next);

      const post = http.expectOne({ method: 'POST', url: RESOURCES_URL });
      expect(post.request.body).toEqual({ key: 'common.ok', baseValue: 'OK' });
      post.flush({ entriesCreated: 1, created: true });

      const reload = http.expectOne((req) => req.url === `${RESOURCES_URL}/tree`);
      expect(reload.request.params.get('path')).toBe('common');
      reload.flush({ path: 'common', resources: [entry('common.ok'), entry('common.save')], children: [] });

      expect(next).toHaveBeenCalledWith({ entriesCreated: 1, created: true });
      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.ok', 'common.save']);
    });

    it('should cancel a folder load already in flight, so only the reload lands', () => {
      folderMode();
      const treeRequests = () => http.match((req) => req.url === `${RESOURCES_URL}/tree`);

      store.showFolder('common');
      store.createResource('my-collection', { key: 'common.ok', baseValue: 'OK' }).subscribe();
      http.expectOne({ method: 'POST', url: RESOURCES_URL }).flush({ entriesCreated: 1, created: true });

      const [stale, reload] = treeRequests();
      expect(stale.cancelled).toBe(true);
      reload.flush({ path: 'common', resources: [entry('common.ok'), entry('common.save')], children: [] });

      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.ok', 'common.save']);
    });

    it('should hand a failure to the caller without reloading', () => {
      folderMode();
      const error = vi.fn();

      store.createResource('my-collection', { key: 'common.save', baseValue: 'Save' }).subscribe({ error });
      http
        .expectOne({ method: 'POST', url: RESOURCES_URL })
        .flush({ message: 'exists' }, { status: 409, statusText: 'Conflict' });

      expect(error).toHaveBeenCalledWith(expect.any(ApiError));
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ kind: 'conflict', status: 409 }));
      http.expectNone((req) => req.url === `${RESOURCES_URL}/tree`);
    });
  });

  describe('updateResource', () => {
    const update = (key: string, response: object, moveTo?: string): void => {
      store
        .updateResource('my-collection', { key, baseValue: 'x', ...(moveTo !== undefined ? { moveTo } : {}) })
        .subscribe();
      const patch = http.expectOne({ method: 'PATCH', url: RESOURCES_URL });
      expect(patch.request.body.key).toBe(key);
      patch.flush(response);
    };

    it('should patch the folder list under its full key', () => {
      folderMode();

      update('common.save', { resolvedKey: 'common.save', updated: true, resource: entry('common.save', 'Save now') });

      expect(englishOf(store.translations(), 'common.save')).toBe('Save now');
      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.save', 'common.dialog.title']);
    });

    it('should patch a nested entry by its full key', () => {
      folderMode();

      update('common.dialog.title', {
        resolvedKey: 'common.dialog.title',
        updated: true,
        resource: entry('common.dialog.title', 'New'),
      });

      expect(englishOf(store.translations(), 'common.dialog.title')).toBe('New');
    });

    it('should patch both caches under the same full key', () => {
      searchMode();

      update('common.save', { resolvedKey: 'common.save', updated: true, resource: entry('common.save', 'Save now') });

      const result = store.searchResults().find((item) => item.fullKey === 'common.save');
      expect(result?.base.value).toBe('Save now');
      expect(result?.matchType).toBe('partial-value');
      expect(englishOf(store.searchResults(), 'errors.save')).toBe('Save');
      expect(englishOf(store.translations(), 'common.save')).toBe('Save now');
    });

    it('should patch a search result outside the folder list without touching the list', () => {
      searchMode();
      const listBefore = store.translations();

      update('errors.save', { resolvedKey: 'errors.save', updated: true, resource: entry('errors.save', 'Retry') });

      expect(englishOf(store.searchResults(), 'errors.save')).toBe('Retry');
      expect(store.translations()).toBe(listBefore);
    });

    it('should drop an entry sent to another folder from both caches', () => {
      searchMode();

      update('common.save', { resolvedKey: 'other.save', updated: true, resource: entry('other.save') }, 'other');

      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.dialog.title']);
      expect(store.searchResults().map((item) => item.fullKey)).toEqual(['errors.save']);
    });

    it('should patch in place when the DTO carries no moveTo', () => {
      folderMode();

      store.updateResource('my-collection', { key: 'common.save', baseValue: 'Save now' }).subscribe();
      const patch = http.expectOne({ method: 'PATCH', url: RESOURCES_URL });
      expect('moveTo' in patch.request.body).toBe(false);
      patch.flush({ resolvedKey: 'common.save', updated: true, resource: entry('common.save', 'Save now') });

      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.save', 'common.dialog.title']);
      expect(englishOf(store.translations(), 'common.save')).toBe('Save now');
    });

    it('should drop an entry moved to the collection root (an empty moveTo)', () => {
      folderMode();

      update('common.save', { resolvedKey: 'save', updated: true, resource: entry('save') }, '');

      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.dialog.title']);
    });

    it('should leave the caches alone when the response carries no resource', () => {
      folderMode();
      const before = store.translations();

      update('common.save', { resolvedKey: 'common.save', updated: false });

      expect(store.translations()).toBe(before);
    });

    it('should hand a failure to the caller and leave the caches alone', () => {
      folderMode();
      const before = store.translations();
      const error = vi.fn();

      store.updateResource('my-collection', { key: 'common.save', baseValue: 'x' }).subscribe({ error });
      http
        .expectOne({ method: 'PATCH', url: RESOURCES_URL })
        .flush({ message: 'gone' }, { status: 404, statusText: 'Not Found' });

      expect(error).toHaveBeenCalledWith(expect.any(ApiError));
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ kind: 'not-found', status: 404 }));
      expect(store.translations()).toBe(before);
    });
  });

  describe('deleteResource', () => {
    const remove = (fullKey: string, entriesDeleted: number): void => {
      store.deleteResource(fullKey).subscribe();
      const request = http.expectOne({ method: 'DELETE', url: RESOURCES_URL });
      expect(request.request.body).toEqual({ keys: [fullKey] });
      request.flush({ entriesDeleted });
    };

    it('should drop the entry from the folder list under its full key', () => {
      folderMode();

      remove('common.dialog.title', 1);

      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.save']);
    });

    it('should drop a search result under its full key, and the folder row with it', () => {
      searchMode();

      remove('common.save', 1);

      expect(store.searchResults().map((item) => item.fullKey)).toEqual(['errors.save']);
      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.dialog.title']);
    });

    it('should keep everything when the server deleted nothing', () => {
      folderMode();

      remove('common.save', 0);

      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.save', 'common.dialog.title']);
    });

    it('should ignore a key that is not cached', () => {
      folderMode();

      remove('common.missing', 1);

      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.save', 'common.dialog.title']);
    });
  });

  describe('translateResource', () => {
    const translate = (fullKey: string, resource: ResourceSummaryDto): void => {
      store.translateResource(fullKey).subscribe();
      const request = http.expectOne({ method: 'POST', url: `${RESOURCES_URL}/translate` });
      expect(request.request.body).toEqual({ key: fullKey });
      request.flush({ resource, translatedCount: 1, skippedLocales: [] });
    };

    it('should patch a nested folder row by its full key', () => {
      folderMode();

      translate('common.dialog.title', entry('common.dialog.title', 'Title', 'Titre'));

      const row = store.translations().find((item) => item.fullKey === 'common.dialog.title');
      expect(row?.targets.find((target) => target.locale === 'fr')?.value).toBe('Titre');
    });

    it('should patch a search result under its full key', () => {
      searchMode();

      translate('common.save', entry('common.save', 'Save', 'Enregistrer'));

      expect(
        store
          .searchResults()
          .find((item) => item.fullKey === 'common.save')
          ?.targets.find((target) => target.locale === 'fr')?.value,
      ).toBe('Enregistrer');
      expect(
        store
          .translations()
          .find((item) => item.fullKey === 'common.save')
          ?.targets.find((target) => target.locale === 'fr')?.value,
      ).toBe('Enregistrer');
    });
  });

  describe('write guards and outcomes', () => {
    it('returns read-only for delete without an HTTP call or cache changes', () => {
      searchMode();
      patchState(unprotected(store), { isReadOnly: true });
      const rows = store.translations();
      const results = store.searchResults();
      const next = vi.fn();

      store.deleteResource('common.save').subscribe(next);

      expect(next).toHaveBeenCalledWith({ kind: 'read-only', feedback: null });
      http.expectNone(() => true);
      expect(store.translations()).toBe(rows);
      expect(store.searchResults()).toBe(results);
    });

    it('returns read-only for translate without an HTTP call or cache changes', () => {
      searchMode();
      patchState(unprotected(store), { isReadOnly: true });
      const rows = store.translations();
      const results = store.searchResults();
      const next = vi.fn();

      store.translateResource('common.save').subscribe(next);

      expect(next).toHaveBeenCalledWith({ kind: 'read-only', feedback: [] });
      http.expectNone(() => true);
      expect(store.translations()).toBe(rows);
      expect(store.searchResults()).toBe(results);
    });

    it('returns no-collection for delete and translate without HTTP', () => {
      const deleted = vi.fn();
      const translated = vi.fn();

      store.deleteResource('common.save').subscribe(deleted);
      store.translateResource('common.save').subscribe(translated);

      expect(deleted).toHaveBeenCalledWith({ kind: 'no-collection', feedback: null });
      expect(translated).toHaveBeenCalledWith({ kind: 'no-collection', feedback: [] });
      http.expectNone(() => true);
    });

    it('checks the current read-only rule when subscribed, rather than when constructed', () => {
      folderMode();
      const deletion = store.deleteResource('common.save');
      const translation = store.translateResource('common.save');
      http.expectNone(() => true);
      patchState(unprotected(store), { isReadOnly: true });
      const deleted = vi.fn();
      const translated = vi.fn();

      deletion.subscribe(deleted);
      translation.subscribe(translated);

      expect(deleted).toHaveBeenCalledWith({ kind: 'read-only', feedback: null });
      expect(translated).toHaveBeenCalledWith({ kind: 'read-only', feedback: [] });
      http.expectNone(() => true);
    });

    it('normalises delete and translate refusals as ApiError while preserving unexpected error feedback', () => {
      folderMode();
      const api = TestBed.inject(BrowserApiService);
      vi.spyOn(api, 'deleteResource').mockReturnValue(throwError(() => new Error('Gone')));
      vi.spyOn(api, 'translateResource').mockReturnValue(throwError(() => 'boom'));
      const deleted = vi.fn();
      const translated = vi.fn();

      store.deleteResource('common.save').subscribe(deleted);
      store.translateResource('common.save').subscribe(translated);

      expect(deleted).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'refused',
          error: expect.any(ApiError),
          feedback: expect.objectContaining({ detail: 'Gone' }),
        }),
      );
      expect(translated).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'refused',
          error: expect.any(ApiError),
          feedback: [expect.objectContaining({ tone: 'error' })],
        }),
      );
      expect(store.translations()).toHaveLength(2);
    });

    it('preserves the API refusal and its message for both entry actions', () => {
      folderMode();
      const deleted = vi.fn();
      const translated = vi.fn();
      store.deleteResource('common.save').subscribe(deleted);
      store.translateResource('common.save').subscribe(translated);

      http
        .expectOne({ method: 'DELETE', url: RESOURCES_URL })
        .flush({ message: 'Gone' }, { status: 404, statusText: 'Not Found' });
      http
        .expectOne({ method: 'POST', url: `${RESOURCES_URL}/translate` })
        .flush({ message: 'Quota' }, { status: 429, statusText: 'Too Many Requests' });

      expect(deleted).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'refused',
          error: expect.objectContaining({ kind: 'not-found', status: 404 }),
          feedback: expect.objectContaining({ detail: 'Gone' }),
        }),
      );
      expect(translated).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'refused',
          error: expect.objectContaining({ status: 429 }),
          feedback: [expect.objectContaining({ detail: 'Quota' })],
        }),
      );
    });

    it('passes editor writes to their supplied collection regardless of the browser read-only state', () => {
      folderMode();
      patchState(unprotected(store), { isReadOnly: true });
      const api = TestBed.inject(BrowserApiService);
      const error = new Error('API refusal');
      const create = vi.spyOn(api, 'createResource').mockReturnValue(throwError(() => error));
      const update = vi.spyOn(api, 'updateResource').mockReturnValue(throwError(() => error));
      const dto = { key: 'common.save', baseValue: 'Save' };
      const created = vi.fn();
      const updated = vi.fn();

      store.createResource('editor-collection', dto).subscribe({ error: created });
      store.updateResource('editor-collection', dto).subscribe({ error: updated });

      expect(create).toHaveBeenCalledWith('editor-collection', dto);
      expect(update).toHaveBeenCalledWith('editor-collection', dto);
      expect(created.mock.calls[0]?.[0]).toBe(error);
      expect(updated.mock.calls[0]?.[0]).toBe(error);
      http.expectNone(() => true);
    });

    it('passes editor 409 errors through unchanged', () => {
      folderMode();
      const api = TestBed.inject(BrowserApiService);
      const conflict = new ApiError({ kind: 'conflict', status: 409, serverMessage: 'Key exists' });
      vi.spyOn(api, 'createResource').mockReturnValue(throwError(() => conflict));
      vi.spyOn(api, 'updateResource').mockReturnValue(throwError(() => conflict));
      const created = vi.fn();
      const updated = vi.fn();

      store.createResource('my-collection', { key: 'common.save', baseValue: 'Save' }).subscribe({ error: created });
      store.updateResource('my-collection', { key: 'common.save', baseValue: 'Save' }).subscribe({ error: updated });

      expect(created).toHaveBeenCalledWith(conflict);
      expect(updated).toHaveBeenCalledWith(conflict);
    });
  });

  describe('requestEntryDelete', () => {
    it('does not ask for confirmation in read-only mode or without a collection', async () => {
      const confirm = vi.fn().mockResolvedValue(true);
      expect(await firstValueFrom(store.requestEntryDelete('common.save', confirm))).toEqual({
        kind: 'no-collection',
        feedback: null,
      });
      folderMode();
      patchState(unprotected(store), { isReadOnly: true });

      expect(await firstValueFrom(store.requestEntryDelete('common.save', confirm))).toEqual({
        kind: 'read-only',
        feedback: null,
      });
      expect(confirm).not.toHaveBeenCalled();
      http.expectNone(() => true);
    });

    it('deletes only after confirmation and returns a silent cancellation otherwise', async () => {
      folderMode();
      expect(await firstValueFrom(store.requestEntryDelete('common.save', () => Promise.resolve(false)))).toEqual({
        kind: 'cancelled',
        feedback: null,
      });
      http.expectNone(() => true);
      const result = firstValueFrom(store.requestEntryDelete('common.save', () => Promise.resolve(true)));
      await Promise.resolve();
      http.expectOne({ method: 'DELETE', url: RESOURCES_URL }).flush({ entriesDeleted: 1 });

      expect(await result).toMatchObject({ kind: 'deleted', feedback: { tone: 'success' } });
      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.dialog.title']);
    });

    it('checks the session again after confirmation, including a reopen of the same collection', async () => {
      folderMode();
      const outcome = await firstValueFrom(
        store.requestEntryDelete('common.save', (inSession) => {
          expect(inSession()).toBe(true);
          patchState(unprotected(store), { sessionId: store.sessionId() + 1 });
          expect(inSession()).toBe(false);
          return Promise.resolve(true);
        }),
      );

      expect(outcome).toEqual({ kind: 'stale-session', feedback: null });
      http.expectNone(() => true);
    });

    it('rechecks read-only after confirmation when settings change in place', async () => {
      folderMode();
      const result = await firstValueFrom(
        store.requestEntryDelete('common.save', () => {
          patchState(unprotected(store), { isReadOnly: true });
          return Promise.resolve(true);
        }),
      );

      expect(result).toEqual({ kind: 'read-only', feedback: null });
      http.expectNone(() => true);
    });
  });

  describe('session guard', () => {
    /** Simulates another collection opening while a write is in flight. */
    const closeSession = (): void => {
      patchState(unprotected(store), { sessionId: store.sessionId() + 1 });
    };

    it('should not patch a folder-list entry whose response arrives after the collection was reopened', () => {
      folderMode();

      store.updateResource('my-collection', { key: 'common.save', baseValue: 'Save now' }).subscribe();
      closeSession();

      http
        .expectOne({ method: 'PATCH', url: RESOURCES_URL })
        .flush({ resolvedKey: 'common.save', updated: true, resource: entry('common.save', 'Save now') });

      expect(englishOf(store.translations(), 'common.save')).toBe('Save');
    });

    it('should still resolve the caller when the session closes before the response arrives', () => {
      folderMode();
      const next = vi.fn();

      store.updateResource('my-collection', { key: 'common.save', baseValue: 'x' }).subscribe(next);
      closeSession();

      const response = { resolvedKey: 'common.save', updated: true, resource: entry('common.save', 'Save now') };
      http.expectOne({ method: 'PATCH', url: RESOURCES_URL }).flush(response);

      expect(next).toHaveBeenCalledWith(response);
      // The store still shows the previous session's data untouched.
      expect(englishOf(store.translations(), 'common.save')).toBe('Save');
    });

    it('should not drop an entry deleted in a closed session', () => {
      folderMode();

      const next = vi.fn();
      store.deleteResource('common.save').subscribe(next);
      closeSession();

      http.expectOne({ method: 'DELETE', url: RESOURCES_URL }).flush({ entriesDeleted: 1 });

      expect(store.translations().map((item) => item.fullKey)).toEqual(['common.save', 'common.dialog.title']);
      expect(next).toHaveBeenCalledWith({ kind: 'stale-session', feedback: null });
    });

    it('should not reload the folder for a create whose session has closed', () => {
      folderMode();

      store.createResource('my-collection', { key: 'common.ok', baseValue: 'OK' }).subscribe();
      closeSession();

      http.expectOne({ method: 'POST', url: RESOURCES_URL }).flush({ entriesCreated: 1, created: true });

      http.expectNone((req) => req.url === `${RESOURCES_URL}/tree`);
    });

    it('should not patch a translation result from a closed session', () => {
      folderMode();

      const next = vi.fn();
      store.translateResource('common.save').subscribe(next);
      closeSession();

      http.expectOne({ method: 'POST', url: `${RESOURCES_URL}/translate` }).flush({
        resource: entry('common.save', 'Save', 'Enregistrer'),
        translatedCount: 1,
        skippedLocales: [],
      });

      expect(
        store
          .translations()
          .find((item) => item.fullKey === 'common.save')
          ?.targets.find((target) => target.locale === 'fr'),
      ).toBeUndefined();
      expect(next).toHaveBeenCalledWith({ kind: 'stale-session', feedback: [] });
    });

    it('returns silent stale-session outcomes for failed delete and translate responses', () => {
      searchMode();
      const deleted = vi.fn();
      const translated = vi.fn();
      store.deleteResource('common.save').subscribe(deleted);
      store.translateResource('common.save').subscribe(translated);
      closeSession();

      http
        .expectOne({ method: 'DELETE', url: RESOURCES_URL })
        .flush({ message: 'Gone' }, { status: 404, statusText: 'Not Found' });
      http
        .expectOne({ method: 'POST', url: `${RESOURCES_URL}/translate` })
        .flush({ message: 'Quota' }, { status: 429, statusText: 'Too Many Requests' });

      expect(deleted).toHaveBeenCalledWith({ kind: 'stale-session', feedback: null });
      expect(translated).toHaveBeenCalledWith({ kind: 'stale-session', feedback: [] });
      expect(store.translations()).toHaveLength(2);
      expect(store.searchResults()).toHaveLength(2);
    });
  });
});
