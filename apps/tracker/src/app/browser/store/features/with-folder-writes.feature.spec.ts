import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { CreateFolderResponseDto } from '@simoncodes-ca/data-transfer';
import { NEVER, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionSettings } from '../../../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { toApiError } from '../../../shared/api-error/api-error';
import type { Feedback } from '../../feedback';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../browser.store';
import type { CreateFolderOutcome } from './with-folder-writes.feature';

const created: CreateFolderResponseDto = {
  folderPath: 'common.new',
  created: true,
  folder: { name: 'new', fullPath: 'common.new', loaded: false },
};
const refusal = (message?: string) =>
  toApiError(new HttpErrorResponse({ status: 409, ...(message ? { error: { message } } : {}) }));

describe('BrowserStore folder writes', () => {
  let store: InstanceType<typeof BrowserStore>;
  let api: BrowserApiService;

  const open = (name = 'my-collection', readOnly = false): void =>
    store.openCollection(collectionSettings({ name, locales: [], readOnly }));
  const lastOutcome = (outcome$: ReturnType<typeof store.confirmFolderDraft>): CreateFolderOutcome | undefined => {
    let last: CreateFolderOutcome | undefined;
    outcome$.subscribe((outcome) => {
      last = outcome;
    });
    return last;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [getTranslocoTestingModule()] });
    store = TestBed.inject(BrowserStore);
    api = TestBed.inject(BrowserApiService);
    vi.spyOn(api, 'getCacheStatus').mockReturnValue(of({ status: 'ready', stats: { totalKeys: 0, localeCount: 0 } }));
    vi.spyOn(api, 'getResourceTree').mockReturnValue(of({ path: '', resources: [], children: [] }));
  });

  it('cancels the newly created folder timeout on collection reset and keeps a new session flash', () => {
    vi.useFakeTimers();
    try {
      open('old');
      vi.spyOn(api, 'createFolder').mockReturnValue(of(created));
      store.createFolder('new', 'common').subscribe();
      expect(store.newlyCreatedFolderPath()).toBe('common.new');
      vi.advanceTimersByTime(1000);

      open('new');
      expect(store.newlyCreatedFolderPath()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      store.createFolder('new', 'common').subscribe();
      vi.advanceTimersByTime(2000);
      expect(store.newlyCreatedFolderPath()).toBe('common.new');
      vi.advanceTimersByTime(1000);
      expect(store.newlyCreatedFolderPath()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { name: 'different paths', secondPath: 'common.other' },
    { name: 'the same path twice', secondPath: 'common.new' },
  ])('keeps the second create flash for its full delay: $name', ({ secondPath }) => {
    vi.useFakeTimers();
    try {
      open();
      vi.spyOn(api, 'createFolder')
        .mockReturnValueOnce(of(created))
        .mockReturnValueOnce(
          of({
            ...created,
            folderPath: secondPath,
            folder: { ...created.folder, fullPath: secondPath },
          }),
        );
      store.createFolder('new', 'common').subscribe();
      expect(store.newlyCreatedFolderPath()).toBe('common.new');
      vi.advanceTimersByTime(1000);
      store.createFolder(secondPath === 'common.new' ? 'new' : 'other', 'common').subscribe();
      expect(store.newlyCreatedFolderPath()).toBe(secondPath);
      vi.advanceTimersByTime(2000);
      expect(store.newlyCreatedFolderPath()).toBe(secondPath);
      vi.advanceTimersByTime(999);
      expect(store.newlyCreatedFolderPath()).toBe(secondPath);
      vi.advanceTimersByTime(1);
      expect(store.newlyCreatedFolderPath()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('confirmFolderDraft', () => {
    it('closes the draft on a create, which is silent', () => {
      open();
      vi.spyOn(api, 'createFolder').mockReturnValue(of(created));
      store.startAddingFolder('common');

      const outcome = lastOutcome(store.confirmFolderDraft('new', 'common'));

      expect(outcome?.kind).toBe('created');
      expect(outcome?.feedback).toBeNull();
      expect(store.isAddingFolder()).toBe(false);
      expect(store.addFolderParentPath()).toBeNull();
      expect(store.folderCreateError()).toBeNull();
    });

    it('toasts an existing folder as info and closes the draft', () => {
      open();
      vi.spyOn(api, 'createFolder').mockReturnValue(of({ ...created, created: false }));
      store.startAddingFolder('common');

      const outcome = lastOutcome(store.confirmFolderDraft('new', 'common'));

      expect(outcome?.feedback).toMatchObject({ tone: 'info', placement: 'toast' });
      expect(store.isAddingFolder()).toBe(false);
    });

    it('keeps the draft open on a refusal and holds it as the inline error, with the server message', () => {
      open();
      vi.spyOn(api, 'createFolder').mockReturnValue(throwError(() => refusal('Already exists')));
      store.startAddingFolder('common');

      const outcome = lastOutcome(store.confirmFolderDraft('new', 'common'));

      expect(outcome?.kind).toBe('refused');
      expect(store.isAddingFolder()).toBe(true);
      expect(store.addFolderParentPath()).toBe('common');
      expect(store.folderCreateError()).toMatchObject({ tone: 'error', placement: 'inline', detail: 'Already exists' });
    });

    it('closes the draft when the collection turned read-only under it', () => {
      open();
      store.startAddingFolder('common');
      store.updateSettings(collectionSettings({ name: 'my-collection', locales: [], readOnly: true }));
      const create = vi.spyOn(api, 'createFolder');

      const outcome = lastOutcome(store.confirmFolderDraft('new', 'common'));

      expect(outcome?.kind).toBe('read-only');
      expect(create).not.toHaveBeenCalled();
      expect(store.isAddingFolder()).toBe(false);
      expect(store.folderCreateError()).toBeNull();
    });

    it('closes the draft when no collection is open', () => {
      store.startAddingFolder('common');

      const outcome = lastOutcome(store.confirmFolderDraft('new', 'common'));

      expect(outcome?.kind).toBe('no-collection');
      expect(store.isAddingFolder()).toBe(false);
    });

    it('leaves the draft and the error alone when the create outlives its session', () => {
      open('old');
      const pending = new Subject<CreateFolderResponseDto>();
      vi.spyOn(api, 'createFolder').mockReturnValue(pending);
      store.startAddingFolder('common');
      const outcome = lastOutcome(store.confirmFolderDraft('new', 'common'));
      expect(outcome).toBeUndefined();

      open('new');
      store.startAddingFolder('errors');
      pending.error(refusal('Old failure'));

      expect(store.folderCreateError()).toBeNull();
      expect(store.addFolderParentPath()).toBe('errors');
    });
  });

  describe('the inline create error', () => {
    const refuseOnce = (): void => {
      open();
      vi.spyOn(api, 'createFolder').mockReturnValue(throwError(() => refusal('Already exists')));
      store.startAddingFolder('common');
      store.confirmFolderDraft('new', 'common').subscribe();
      expect(store.folderCreateError()).not.toBeNull();
    };

    it('survives a successful picker create, which is not the sidebar draft', () => {
      refuseOnce();
      vi.spyOn(api, 'createFolder').mockReturnValue(of(created));
      store.createFolder('new', null).subscribe();
      expect(store.folderCreateError()).not.toBeNull();
      expect(store.isAddingFolder()).toBe(true);
    });

    it('does not survive another collection opening, nor the same one reopening', () => {
      refuseOnce();
      open('other');
      expect(store.folderCreateError()).toBeNull();
      refuseOnce();
      open('my-collection');
      expect(store.folderCreateError()).toBeNull();
    });
  });

  describe('createFolder (the picker)', () => {
    it('hands back the feedback and leaves the sidebar draft and error alone, even on a refusal', () => {
      open();
      vi.spyOn(api, 'createFolder').mockReturnValue(throwError(() => refusal('Already exists')));
      store.startAddingFolder('errors');

      const outcome = lastOutcome(store.createFolder('new', 'common'));

      expect(outcome?.feedback).toMatchObject({ placement: 'inline', detail: 'Already exists' });
      expect(store.isAddingFolder()).toBe(true);
      expect(store.folderCreateError()).toBeNull();
    });
  });

  describe('requestFolderDelete', () => {
    it('deletes only after the confirmation says yes, and does not ask for a cancelled one', async () => {
      open();
      const remove = vi
        .spyOn(api, 'deleteFolder')
        .mockReturnValue(of({ deleted: true, folderPath: 'common', resourcesDeleted: 0 }));
      const outcomes: string[] = [];

      store.requestFolderDelete('common', () => Promise.resolve(false)).subscribe((o) => outcomes.push(o.kind));
      await vi.waitFor(() => expect(outcomes).toEqual(['cancelled']));
      expect(remove).not.toHaveBeenCalled();

      store.requestFolderDelete('common', () => Promise.resolve(true)).subscribe((o) => outcomes.push(o.kind));
      await vi.waitFor(() => expect(outcomes).toEqual(['cancelled', 'deleted']));
      expect(remove).toHaveBeenCalledWith('my-collection', 'common');
    });

    it('ends as stale when another collection opens while the confirmation is up', async () => {
      open('old');
      const remove = vi.spyOn(api, 'deleteFolder').mockReturnValue(NEVER);
      const outcomes: string[] = [];

      store
        .requestFolderDelete('common', () => {
          open('new');
          return Promise.resolve(true);
        })
        .subscribe((o) => outcomes.push(o.kind));

      await vi.waitFor(() => expect(outcomes).toEqual(['stale-session']));
      expect(remove).not.toHaveBeenCalled();
    });

    it('hands back a toast for a refusal', async () => {
      open();
      vi.spyOn(api, 'deleteFolder').mockReturnValue(throwError(() => refusal('Not empty')));
      let feedback: Feedback | null | undefined;

      store
        .requestFolderDelete('common', () => Promise.resolve(true))
        .subscribe((o) => {
          feedback = o.feedback;
        });

      await vi.waitFor(() =>
        expect(feedback).toMatchObject({ tone: 'error', placement: 'toast', detail: 'Not empty' }),
      );
    });
  });
  describe('mirror effect ordering', () => {
    it('removes the row before loading root folders and then reloading the list after a resource move', () => {
      open();
      const movedRow = {
        fullKey: 'a.one',
        folderPath: 'a',
        entryKey: 'one',
        base: { locale: 'en', value: 'One' },
        targets: [],
        tags: [],
        inheritedTags: [],
      };
      patchState(unprotected(store), { translations: [movedRow] });
      const effects: string[] = [];
      const rowsAtLoad: string[][] = [];
      vi.mocked(api.getResourceTree).mockImplementation((_collection, path = '', nested) => {
        expect(path).toBe('');
        effects.push(nested ? 'reload-list' : 'load-root');
        rowsAtLoad.push(store.translations().map((row) => row.fullKey));
        return of({ path, resources: [], children: [] });
      });
      vi.spyOn(api, 'moveResource').mockImplementation(() => {
        expect(store.translations()).toEqual([]);
        effects.push('optimistic-removal');
        return of({ movedCount: 1 });
      });
      let outcome: string | undefined;

      store.moveResource({ sourceKey: 'a.one', destinationFolderPath: 'b' }).subscribe((result) => {
        outcome = result.kind;
      });

      expect(outcome).toBe('moved');
      expect(effects).toEqual(['optimistic-removal', 'load-root', 'reload-list']);
      expect(rowsAtLoad).toEqual([[], []]);
    });

    it('patches the moved tree before loading children, then expands before showing the folder', () => {
      open();
      patchState(unprotected(store), {
        rootFolders: [
          { name: 'a', fullPath: 'a', loaded: false },
          { name: 'b', fullPath: 'b', loaded: false },
        ],
        expandedFolders: new Set(['a']),
      });
      const effects: string[] = [];
      const observations: { path: string; selected: string; expanded: string[]; movedPath: string | undefined }[] = [];
      vi.mocked(api.getResourceTree).mockImplementation((_collection, path = '') => {
        effects.push(path);
        observations.push({
          path,
          selected: store.currentFolderPath(),
          expanded: [...store.expandedFolders()],
          movedPath: store.rootFolders()[0]?.tree?.children?.[0]?.fullPath,
        });
        return of({ path, resources: [], children: [{ name: 'a', fullPath: 'b.a', loaded: false }] });
      });
      vi.spyOn(api, 'moveFolder').mockReturnValue(of({ movedCount: 1, foldersDeleted: 1, warnings: [], errors: [] }));
      let outcome: string | undefined;

      store.moveFolder({ sourceFolderPath: 'a', destinationFolderPath: 'b' }).subscribe((result) => {
        outcome = result.kind;
      });

      expect(outcome).toBe('moved');
      expect(effects).toEqual(['b', 'b.a']);
      expect(observations).toEqual([
        { path: 'b', selected: '', expanded: ['a'], movedPath: 'b.a' },
        { path: 'b.a', selected: 'b.a', expanded: ['b.a', 'b'], movedPath: 'b.a' },
      ]);
    });

    it('reloads root for an uncached folder before expansion and navigation', () => {
      open();
      patchState(unprotected(store), { expandedFolders: new Set(['a']) });
      const observations: { path: string; nested: boolean | undefined; selected: string; expanded: string[] }[] = [];
      vi.mocked(api.getResourceTree).mockImplementation((_collection, path = '', nested) => {
        observations.push({
          path,
          nested,
          selected: store.currentFolderPath(),
          expanded: [...store.expandedFolders()],
        });
        return of({ path, resources: [], children: [{ name: 'b', fullPath: 'b', loaded: false }] });
      });
      vi.spyOn(api, 'moveFolder').mockReturnValue(of({ movedCount: 1, foldersDeleted: 1, warnings: [], errors: [] }));
      let outcome: string | undefined;

      store.moveFolder({ sourceFolderPath: 'a', destinationFolderPath: 'b' }).subscribe((result) => {
        outcome = result.kind;
      });

      expect(outcome).toBe('moved');
      expect(observations).toEqual([
        { path: '', nested: false, selected: '', expanded: ['a'] },
        { path: 'b.a', nested: true, selected: 'b.a', expanded: ['b.a', 'b'] },
      ]);
      expect(store.rootFolders()[0]?.fullPath).toBe('b');
    });
  });
});
