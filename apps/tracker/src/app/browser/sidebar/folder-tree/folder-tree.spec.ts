import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import { getState, patchState } from '@ngrx/signals';
import { unprotected } from '@ngrx/signals/testing';
import type { CreateFolderResponseDto, DeleteFolderResponseDto } from '@simoncodes-ca/data-transfer';
import { NEVER, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectionSettings } from '../../../../testing/collection-settings';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { toApiError } from '../../../shared/api-error/api-error';
import { NotificationService } from '../../../shared/notification';
import { BrowserApiService } from '../../services/browser-api.service';
import { BrowserStore } from '../../store/browser.store';
import * as folderDropRules from '../../store/folder-drop';
import { FolderTree } from './folder-tree';

describe('FolderTree', () => {
  let component: FolderTree;
  let fixture: ComponentFixture<FolderTree>;
  let spectator: Spectator<FolderTree>;
  let httpMock: HttpTestingController;
  const dialog = { open: vi.fn() };

  beforeEach(() => dialog.open.mockReset());

  const createSpectator = createComponentFactory({
    component: FolderTree,
    imports: [getTranslocoTestingModule()],
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: MatDialog, useValue: dialog }],
    detectChanges: false,
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createComponent(detectChanges = false): void {
    spectator = createSpectator();
    fixture = spectator.fixture;
    component = spectator.component;
    httpMock = spectator.inject(HttpTestingController);
    fixture.componentRef.setInput('collectionName', 'my-collection');
    if (detectChanges) {
      spectator.detectComponentChanges();
    }
  }

  function openCollection(name: string): void {
    const api = spectator.inject(BrowserApiService);
    vi.spyOn(api, 'getCacheStatus').mockReturnValue(of({ status: 'ready', stats: { totalKeys: 0, localeCount: 0 } }));
    vi.spyOn(api, 'getResourceTree').mockReturnValue(of({ path: '', resources: [], children: [] }));
    component.store.openCollection(collectionSettings({ name, locales: [] }));
  }

  const createdFolder = { name: 'new', fullPath: 'new', loaded: false };

  function refuseCreate(message = 'Already exists'): void {
    const failure = toApiError(new HttpErrorResponse({ status: 409, error: { message } }));
    vi.spyOn(spectator.inject(BrowserApiService), 'createFolder').mockReturnValue(throwError(() => failure));
  }

  function showCreateFailure(parent: string | null = 'common'): void {
    refuseCreate();
    component.store.startAddingFolder(parent);
    component.onFolderConfirm('new', parent);
    expect(component.folderWriteError()).toBe('Already exists');
  }

  it('should create', () => {
    createComponent();
    expect(component).toBeTruthy();
  });

  it('should accept collectionName input', () => {
    createComponent();
    fixture.componentRef.setInput('collectionName', 'my-collection');
    expect(component.collectionName()).toBe('my-collection');
  });

  it('should stay disabled when mounted mid-search (re-entering the collection)', () => {
    createComponent();
    const store = spectator.inject(BrowserStore);
    store.showQuery('save');

    fixture.componentRef.setInput('collectionName', 'my-collection');
    spectator.detectComponentChanges();

    expect(store.isDisabled()).toBe(true);
    expect(spectator.query('.folder-tree')?.classList.contains('disabled')).toBe(true);
  });

  it('should emit folderSelected when folder is clicked', () => {
    createComponent();
    const emitSpy = vi.fn();
    component.folderSelected.subscribe(emitSpy);

    component.onFolderClick({
      name: 'common',
      fullPath: 'common',
      loaded: false,
    });

    expect(emitSpy).toHaveBeenCalledWith('common');

    // No HTTP call needed for this test
  });

  it('refuses direct folder and root handlers during search without emitting a selection', () => {
    createComponent();
    component.store.showFolder('common.buttons');
    component.store.showQuery('save');
    const selected = vi.fn();
    component.folderSelected.subscribe(selected);
    const before = getState(component.store);

    component.onFolderClick({ name: 'errors', fullPath: 'errors', loaded: false });
    component.onRootClick();
    component.onToggleExpanded('common');
    component.onExpandRequested('common');
    component.onToggleRootExpanded(new MouseEvent('click'));
    const right = new KeyboardEvent('keydown', { cancelable: true });
    const left = new KeyboardEvent('keydown', { cancelable: true });
    component.onRootTreeKeydown(right, 'ArrowRight');
    component.onRootTreeKeydown(left, 'ArrowLeft');
    expect(right.defaultPrevented).toBe(false);
    expect(left.defaultPrevented).toBe(false);
    component.onToggleExpandAll(new MouseEvent('click'));

    expect(getState(component.store)).toStrictEqual(before);
    expect(component.store.expandedFolders()).toBe(before.expandedFolders);
    expect(selected).not.toHaveBeenCalled();
  });

  it('refuses disabled node mouse and keyboard navigation through the store', () => {
    createComponent();
    const folder = {
      name: 'common',
      fullPath: 'common',
      loaded: true,
      tree: {
        path: 'common',
        resources: [],
        children: [{ name: 'buttons', fullPath: 'common.buttons', loaded: true }],
      },
    };
    patchState(unprotected(component.store), { rootFolders: [folder] });
    component.store.showQuery('save');
    fixture.detectChanges();
    const selected = vi.fn();
    component.folderSelected.subscribe(selected);
    const select = vi.spyOn(component.store, 'selectFolder');
    const before = getState(component.store);
    const header = spectator.query('.folder-header');
    expect(header?.getAttribute('tabindex')).toBe('-1');
    expect(header?.getAttribute('role')).toBe('presentation');

    header?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    header?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    header?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    header?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    spectator.query('.folder-header .expand-toggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(select).toHaveBeenCalledWith('common');
    expect(getState(component.store)).toStrictEqual(before);
    expect(component.store.expandedFolders()).toBe(before.expandedFolders);
    expect(selected).not.toHaveBeenCalled();
  });

  it('delegates root open, close and toggle and keeps selection separate', () => {
    createComponent();
    const selected = vi.fn();
    component.folderSelected.subscribe(selected);
    const toggle = new MouseEvent('click');
    const stop = vi.spyOn(toggle, 'stopPropagation');
    component.onToggleRootExpanded(toggle);
    expect(stop).toHaveBeenCalledOnce();
    expect(component.store.isRootExpanded()).toBe(false);

    const right = new KeyboardEvent('keydown', { cancelable: true });
    component.onRootTreeKeydown(right, 'ArrowRight');
    expect(right.defaultPrevented).toBe(true);
    expect(component.store.isRootExpanded()).toBe(true);
    const rightNoOp = new KeyboardEvent('keydown', { cancelable: true });
    component.onRootTreeKeydown(rightNoOp, 'ArrowRight');
    expect(rightNoOp.defaultPrevented).toBe(false);
    expect(component.store.isRootExpanded()).toBe(true);

    const left = new KeyboardEvent('keydown', { cancelable: true });
    component.onRootTreeKeydown(left, 'ArrowLeft');
    expect(left.defaultPrevented).toBe(true);
    expect(component.store.isRootExpanded()).toBe(false);
    const leftNoOp = new KeyboardEvent('keydown', { cancelable: true });
    component.onRootTreeKeydown(leftNoOp, 'ArrowLeft');
    expect(leftNoOp.defaultPrevented).toBe(false);
    expect(component.store.isRootExpanded()).toBe(false);
    expect(selected).not.toHaveBeenCalled();

    component.onRootClick();
    expect(selected).toHaveBeenCalledWith('');
  });

  it.each([
    { key: 'ArrowRight', open: false, nextOpen: true, selected: false, prevent: true },
    { key: 'ArrowRight', open: true, nextOpen: true, selected: false, prevent: false },
    { key: 'ArrowLeft', open: true, nextOpen: false, selected: false, prevent: true },
    { key: 'ArrowLeft', open: false, nextOpen: false, selected: false, prevent: false },
    { key: 'Enter', open: false, nextOpen: false, selected: true, prevent: false },
    { key: ' ', open: false, nextOpen: false, selected: true, prevent: false },
  ])('wires root $key with open=$open to expansion or selection', (test) => {
    createComponent();
    component.store.setRootExpanded(test.open);
    fixture.detectChanges();
    const selected = vi.fn();
    component.folderSelected.subscribe(selected);
    const setExpanded = vi.spyOn(component.store, 'setRootExpanded');
    const event = new KeyboardEvent('keydown', { key: test.key, bubbles: true, cancelable: true });
    spectator.query('.root-row')?.dispatchEvent(event);
    expect(component.store.isRootExpanded()).toBe(test.nextOpen);
    expect(setExpanded.mock.calls).toEqual(test.open !== test.nextOpen ? [[test.nextOpen]] : []);
    expect(selected.mock.calls).toEqual(test.selected ? [['']] : []);
    expect(event.defaultPrevented).toBe(test.prevent);
  });

  it('shares one root drop decision between highlighting, the predicate and the drop', () => {
    createComponent();
    const dragData = { type: 'folder' as const, path: 'common.buttons' };
    fixture.componentRef.setInput('activeDragDataFromParent', dragData);
    const decide = vi.spyOn(folderDropRules, 'folderDrop');
    const confirm = vi.spyOn(component, 'confirmMoveFolder').mockImplementation(() => undefined);

    expect(component.isValidRootDropTarget()).toBe(true);
    expect(component.canDropOnRoot({ data: dragData } as Parameters<typeof component.canDropOnRoot>[0])).toBe(true);
    component.onRootDrop({ item: { data: dragData } } as Parameters<typeof component.onRootDrop>[0]);

    expect(decide).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith('common.buttons', '');
    decide.mockRestore();
  });

  it('re-evaluates root drops for read-only state and refuses resources and folders already at root', () => {
    createComponent();
    const dragData = { type: 'folder' as const, path: 'common.buttons' };
    fixture.componentRef.setInput('activeDragDataFromParent', dragData);
    expect(component.isValidRootDropTarget()).toBe(true);
    patchState(unprotected(component.store), { isReadOnly: true });
    const confirm = vi.spyOn(component, 'confirmMoveFolder').mockImplementation(() => undefined);
    expect(component.isValidRootDropTarget()).toBe(false);
    component.onRootDrop({ item: { data: dragData } } as Parameters<typeof component.onRootDrop>[0]);
    expect(confirm).not.toHaveBeenCalled();

    patchState(unprotected(component.store), { isReadOnly: false });
    for (const data of [
      { type: 'folder' as const, path: 'common' },
      { type: 'resource' as const, key: 'common.save', folderPath: 'common' },
    ]) {
      fixture.componentRef.setInput('activeDragDataFromParent', data);
      expect(component.canDropOnRoot({ data } as Parameters<typeof component.canDropOnRoot>[0])).toBe(false);
      component.onRootDrop({ item: { data } } as Parameters<typeof component.onRootDrop>[0]);
    }
    expect(confirm).not.toHaveBeenCalled();
  });

  it('should not load folders on init (delegated to parent)', () => {
    createComponent();
    fixture.componentRef.setInput('collectionName', 'my-collection');

    // detectChanges triggers ngOnInit
    fixture.detectChanges();

    // FolderTree no longer loads on init - parent TranslationBrowser handles store initialization
    // Verify no HTTP requests are made
    httpMock.expectNone((request) => {
      return request.url.includes('/api/collections/my-collection/resources/tree');
    });
  });

  it('should render search input', async () => {
    createComponent();
    fixture.componentRef.setInput('collectionName', 'my-collection');
    fixture.detectChanges();

    // No HTTP request on init anymore
    // Wait for async operations to complete
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const searchInput = compiled.querySelector('input[type="text"]');

    expect(searchInput).toBeTruthy();
    expect(searchInput?.getAttribute('placeholder')).toBe('Filter folders...');
  });

  it('should debounce search input', async () => {
    vi.useFakeTimers();

    createComponent();
    fixture.componentRef.setInput('collectionName', 'my-collection');

    const setSpy = vi.spyOn(component.store, 'setFolderTreeFilter');

    fixture.detectChanges();

    // No HTTP request on init anymore

    component.onSearchChange('c');
    await vi.advanceTimersByTimeAsync(100);
    expect(setSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    expect(setSpy).toHaveBeenCalledWith('c');

    vi.useRealTimers();
  });

  async function expectPendingFilterApplied(disable: () => void, enable: () => void): Promise<void> {
    vi.useFakeTimers();
    try {
      createComponent();
      spectator.detectComponentChanges();
      component.onSearchChange('common');
      await vi.advanceTimersByTimeAsync(100);
      expect(component.store.folderTreeFilter()).toBe('');

      disable();
      spectator.detectComponentChanges();
      await vi.advanceTimersByTimeAsync(0);
      expect(component.store.isDisabled()).toBe(true);
      expect(spectator.query<HTMLInputElement>('app-search-input input')?.disabled).toBe(true);
      await vi.advanceTimersByTimeAsync(250);
      expect(component.store.folderTreeFilter()).toBe('common');
      expect(component.store.isDisabled()).toBe(true);

      enable();
      spectator.detectComponentChanges();
      await vi.advanceTimersByTimeAsync(0);
      expect(spectator.query<HTMLInputElement>('app-search-input input')?.disabled).toBe(false);
      component.onSearchChange('common');
      await vi.advanceTimersByTimeAsync(300);
      expect(component.store.folderTreeFilter()).toBe('common');
      expect(spectator.query<HTMLInputElement>('app-search-input input')?.value).toBe('common');
    } finally {
      vi.useRealTimers();
    }
  }

  it('applies a pending debounced filter when search disables the input', async () => {
    await expectPendingFilterApplied(
      () => component.store.showQuery('save'),
      () => component.store.clearSearch(),
    );
  });

  it('applies a pending debounced filter when an in-flight move disables the input', async () => {
    await expectPendingFilterApplied(
      () => patchState(unprotected(component.store), { movesInFlight: 1 }),
      () => patchState(unprotected(component.store), { movesInFlight: 0 }),
    );
  });

  it('opens the move confirmation and calls the store only when confirmed', async () => {
    createComponent();
    openCollection('my-collection');
    const closed = new Subject<boolean>();
    dialog.open.mockReturnValue({ afterClosed: () => closed.asObservable() });
    const move = vi.spyOn(spectator.inject(BrowserApiService), 'moveFolder').mockReturnValue(NEVER);

    component.confirmMoveFolder('common.buttons', 'errors');
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(dialog.open.mock.calls.at(-1)?.[1]).toEqual({
      width: '400px',
      data: {
        title: 'Move Folder',
        message: 'Move folder "buttons" and all its contents to "errors"?',
        confirmButtonText: 'Move',
        actionType: 'standard',
      },
    });
    expect(move).not.toHaveBeenCalled();

    closed.next(false);
    closed.complete();
    expect(move).not.toHaveBeenCalled();

    const confirmed = new Subject<boolean>();
    dialog.open.mockReturnValue({ afterClosed: () => confirmed.asObservable() });
    component.confirmMoveFolder('common.buttons', 'errors');
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(2));
    confirmed.next(true);
    confirmed.complete();
    await vi.waitFor(() => expect(move).toHaveBeenCalledWith('my-collection', 'common.buttons', 'errors'));
  });

  it('opens delete confirmation and calls the store only when confirmed', async () => {
    createComponent();
    openCollection('my-collection');
    const closed = new Subject<boolean>();
    dialog.open.mockReturnValue({ afterClosed: () => closed.asObservable() });
    const remove = vi.spyOn(spectator.inject(BrowserApiService), 'deleteFolder').mockReturnValue(NEVER);

    component.onDeleteFolder('common');
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(dialog.open.mock.calls.at(-1)?.[1]).toEqual({
      width: '400px',
      data: {
        title: 'Delete Folder',
        message: 'Delete "common" and all its contents?',
        confirmButtonText: 'Delete',
        actionType: 'destructive',
      },
    });
    expect(remove).not.toHaveBeenCalled();
    closed.next(false);
    closed.complete();
    expect(remove).not.toHaveBeenCalled();

    const confirmed = new Subject<boolean>();
    dialog.open.mockReturnValue({ afterClosed: () => confirmed.asObservable() });
    component.onDeleteFolder('common');
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledTimes(2));
    confirmed.next(true);
    confirmed.complete();
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('my-collection', 'common'));
  });

  it('handles a no-op folder move without confirmation and toasts once', () => {
    createComponent();
    openCollection('my-collection');
    const info = vi.spyOn(spectator.inject(NotificationService), 'info').mockImplementation(() => undefined);
    const move = vi.spyOn(spectator.inject(BrowserApiService), 'moveFolder');

    component.confirmMoveFolder('common.buttons', 'common.buttons');
    component.confirmMoveFolder('common.buttons', 'common');
    expect(dialog.open).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledOnce();
    expect(move).not.toHaveBeenCalled();
  });

  it('toasts when a folder is dropped onto its current parent', () => {
    createComponent();
    openCollection('my-collection');
    const info = vi.spyOn(spectator.inject(NotificationService), 'info').mockImplementation(() => undefined);
    const move = vi.spyOn(spectator.inject(BrowserApiService), 'moveFolder');

    component.onFolderDropped({
      dragData: { type: 'folder', path: 'common.buttons' },
      targetFolderPath: 'common',
    });

    expect(info).toHaveBeenCalledWith('Folder is already at this location');
    expect(dialog.open).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it('moves a resource dropped from the collection root into a folder', () => {
    createComponent();
    openCollection('my-collection');
    const move = vi.spyOn(spectator.inject(BrowserApiService), 'moveResource').mockReturnValue(NEVER);

    component.onResourceDropped({
      dragData: { type: 'resource', key: 'welcome', folderPath: '' },
      targetFolderPath: 'common',
    });

    expect(move).toHaveBeenCalledWith('my-collection', 'welcome', 'common.welcome');
  });

  it('does not write a folder move when confirmation is cancelled', async () => {
    createComponent();
    openCollection('my-collection');
    const closed = new Subject<boolean>();
    dialog.open.mockReturnValue({ afterClosed: () => closed.asObservable() });
    const move = vi.spyOn(spectator.inject(BrowserApiService), 'moveFolder');

    component.confirmMoveFolder('common.buttons', 'errors');

    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalledOnce());
    closed.next(false);
    closed.complete();
    expect(move).not.toHaveBeenCalled();
  });

  it('passes the inline parent to the API and keeps the draft open on a refusal, with no toast', () => {
    createComponent();
    openCollection('my-collection');
    refuseCreate();
    const error = vi.spyOn(spectator.inject(NotificationService), 'error').mockImplementation(() => undefined);
    component.store.startAddingFolder('common');

    component.onFolderConfirm('new', 'common');

    expect(spectator.inject(BrowserApiService).createFolder).toHaveBeenCalledWith('my-collection', 'new', 'common');
    expect(component.folderWriteError()).toBe('Already exists');
    expect(component.store.isAddingFolder()).toBe(true);
    expect(component.store.addFolderParentPath()).toBe('common');
    expect(component.store.error()).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('shows the fallback wording when the refusal carries no server message', () => {
    createComponent();
    openCollection('my-collection');
    vi.spyOn(spectator.inject(BrowserApiService), 'createFolder').mockReturnValue(
      throwError(() => toApiError(new HttpErrorResponse({ status: 500 }))),
    );

    component.onFolderConfirm('new', null);

    expect(component.folderWriteError()).toBe('Failed to create folder');
  });

  it('closes its draft after a successful sidebar create, with no toast', () => {
    createComponent();
    openCollection('my-collection');
    const success = vi.spyOn(spectator.inject(NotificationService), 'success').mockImplementation(() => undefined);
    vi.spyOn(spectator.inject(BrowserApiService), 'createFolder').mockReturnValue(
      of({ folderPath: 'common.new', created: true, folder: { ...createdFolder, fullPath: 'common.new' } }),
    );
    component.store.startAddingFolder('common');

    component.onFolderConfirm('new', 'common');

    expect(component.store.isAddingFolder()).toBe(false);
    expect(component.store.addFolderParentPath()).toBeNull();
    expect(success).not.toHaveBeenCalled();
  });

  it('toasts a refused folder delete with the server message', async () => {
    createComponent();
    openCollection('my-collection');
    const error = vi.spyOn(spectator.inject(NotificationService), 'error').mockImplementation(() => undefined);
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    vi.spyOn(spectator.inject(BrowserApiService), 'deleteFolder').mockReturnValue(
      throwError(() => toApiError(new HttpErrorResponse({ status: 409, error: { message: 'Not empty' } }))),
    );

    component.onDeleteFolder('common');

    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Not empty'));
  });

  it('still settles a confirmed folder delete when the sidebar is destroyed before the response', async () => {
    createComponent();
    openCollection('my-collection');
    const error = vi.spyOn(spectator.inject(NotificationService), 'error').mockImplementation(() => undefined);
    const success = vi.spyOn(spectator.inject(NotificationService), 'success').mockImplementation(() => undefined);
    const response = new Subject<DeleteFolderResponseDto>();
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    vi.spyOn(spectator.inject(BrowserApiService), 'deleteFolder').mockReturnValue(response.asObservable());
    const { store } = component;

    component.onDeleteFolder('common');
    await vi.waitFor(() => expect(store.deletingFolderPath()).toBe('common'));
    fixture.destroy();
    response.error(toApiError(new HttpErrorResponse({ status: 409, error: { message: 'Not empty' } })));

    expect(store.deletingFolderPath()).toBeNull();
    expect(store.isDeletingFolder()).toBe(false);
    expect(error).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it('still settles a confirmed folder move when the sidebar is destroyed before the response', async () => {
    createComponent();
    openCollection('my-collection');
    const { store } = component;
    await vi.waitFor(() => expect(store.folderTreeLoaded()).toBe(true));
    patchState(unprotected(store), {
      rootFolders: [
        { name: 'common', fullPath: 'common', loaded: false },
        { name: 'errors', fullPath: 'errors', loaded: false },
      ],
    });
    const response = new Subject<never>();
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    vi.spyOn(spectator.inject(BrowserApiService), 'moveFolder').mockReturnValue(response.asObservable());

    component.confirmMoveFolder('common', 'errors');
    await vi.waitFor(() => expect(store.isMoving()).toBe(true));
    expect(store.rootFolders().map((folder) => folder.fullPath)).not.toContain('common');
    fixture.destroy();
    response.error(toApiError(new HttpErrorResponse({ status: 500, error: { message: 'Boom' } })));

    expect(store.isMoving()).toBe(false);
    expect(store.rootFolders().map((folder) => folder.fullPath)).toContain('common');
  });

  it('keeps the inline error and tree visible through an unrelated folder expand and load', async () => {
    createComponent();
    openCollection('my-collection');
    await vi.waitFor(() => expect(component.store.folderTreeLoaded()).toBe(true));
    showCreateFailure(null);
    fixture.detectChanges();
    expect(spectator.query('.folder-list')).toBeTruthy();
    expect(spectator.query('app-inline-folder-input .error-message')?.textContent).toContain('Already exists');

    const previousTree = component.store.rootFolders();
    component.store.expandFolder('common');
    component.store.loadFolderChildren('common');
    await vi.waitFor(() => expect(component.store.rootFolders()).not.toBe(previousTree));
    fixture.detectChanges();

    expect(spectator.query('.folder-list')).toBeTruthy();
    expect(spectator.query('app-inline-folder-input .error-message')?.textContent).toContain('Already exists');
    expect(component.folderWriteError()).toBe('Already exists');
  });

  it('retires the refusal when the refused name is edited, and cancel clears it', async () => {
    createComponent();
    openCollection('my-collection');
    await vi.waitFor(() => expect(component.store.folderTreeLoaded()).toBe(true));
    showCreateFailure(null);
    fixture.detectChanges();

    spectator.typeInElement('newer', 'app-inline-folder-input input');
    fixture.detectChanges();

    expect(component.folderWriteError()).toBeNull();
    expect(spectator.query('app-inline-folder-input .error-message')).toBeNull();
    expect(component.store.isAddingFolder()).toBe(true);

    showCreateFailure(null);
    component.onFolderCancel();
    expect(component.folderWriteError()).toBeNull();
    expect(component.store.isAddingFolder()).toBe(false);
  });

  it('clears an inline create error when a new draft starts through the store', () => {
    createComponent();
    openCollection('my-collection');
    showCreateFailure();

    component.store.startAddingFolder('common');

    expect(component.folderWriteError()).toBeNull();
    expect(component.store.isAddingFolder()).toBe(true);
  });

  it('clears an inline create error when the add-folder button starts a draft', () => {
    createComponent();
    openCollection('my-collection');
    showCreateFailure();

    component.onAddFolderButtonClick();

    expect(component.folderWriteError()).toBeNull();
    expect(component.store.isAddingFolder()).toBe(true);
  });

  it('clears an inline create error when the retried sidebar create succeeds, not on a create elsewhere', () => {
    createComponent();
    openCollection('my-collection');
    showCreateFailure();
    vi.spyOn(spectator.inject(BrowserApiService), 'createFolder').mockReturnValue(
      of({ folderPath: 'new', created: true, folder: createdFolder }),
    );

    component.store.createFolder('other', null).subscribe();
    expect(component.folderWriteError()).toBe('Already exists');

    component.onFolderConfirm('new', 'common');
    expect(component.folderWriteError()).toBeNull();
  });

  it('clears an inline create error on a collection switch and reopen', () => {
    createComponent();
    openCollection('my-collection');
    showCreateFailure();

    component.store.openCollection(collectionSettings({ name: 'other', locales: [] }));
    expect(component.folderWriteError()).toBeNull();
    component.store.openCollection(collectionSettings({ name: 'my-collection', locales: [] }));
    expect(component.folderWriteError()).toBeNull();
  });

  it('leaves adding mode when no collection is open', () => {
    createComponent();
    const create = vi.spyOn(spectator.inject(BrowserApiService), 'createFolder');
    component.store.startAddingFolder('common');
    component.onFolderConfirm('new', 'common');

    expect(create).not.toHaveBeenCalled();
    expect(component.store.isAddingFolder()).toBe(false);
    expect(component.store.error()).toBeNull();
  });

  it('ignores a create success that arrives after another collection opens', () => {
    createComponent();
    openCollection('old');
    const pending = new Subject<CreateFolderResponseDto>();
    vi.spyOn(spectator.inject(BrowserApiService), 'createFolder').mockReturnValue(pending);
    component.store.startAddingFolder('common');
    component.onFolderConfirm('new', 'common');

    component.store.openCollection(collectionSettings({ name: 'new', locales: [] }));
    pending.next({
      folderPath: 'common.new',
      created: true,
      folder: { name: 'new', fullPath: 'common.new', loaded: false },
    });
    pending.complete();

    expect(component.store.selectedCollection()).toBe('new');
    expect(component.store.error()).toBeNull();
    expect(component.store.newlyCreatedFolderPath()).toBeNull();
    expect(component.store.isAddingFolder()).toBe(false);
  });

  it('ignores a create failure that arrives after another collection opens', () => {
    createComponent();
    openCollection('old');
    const pending = new Subject<CreateFolderResponseDto>();
    vi.spyOn(spectator.inject(BrowserApiService), 'createFolder').mockReturnValue(pending);
    component.store.startAddingFolder('common');
    component.onFolderConfirm('new', 'common');

    component.store.openCollection(collectionSettings({ name: 'new', locales: [] }));
    pending.error(
      toApiError(
        new HttpErrorResponse({
          status: 409,
          error: { message: 'Old failure' },
        }),
      ),
    );

    expect(component.store.selectedCollection()).toBe('new');
    expect(component.store.error()).toBeNull();
    expect(component.store.newlyCreatedFolderPath()).toBeNull();
    expect(component.store.isAddingFolder()).toBe(false);
  });

  describe('setNestedResources — toggle animation', () => {
    beforeEach(() => {
      createComponent();
      fixture.componentRef.setInput('collectionName', 'my-collection');
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should immediately set isNestedToggleFlipping to true', () => {
      component.setNestedResources(true);

      expect(component.isNestedToggleFlipping()).toBe(true);
    });

    it('should NOT call store.setNestedResources immediately', () => {
      const storeSpy = vi.spyOn(component.store, 'setNestedResources');

      component.setNestedResources(true);

      expect(storeSpy).not.toHaveBeenCalled();
    });

    it('should call store.setNestedResources with the correct value at the 125ms midpoint', async () => {
      const storeSpy = vi.spyOn(component.store, 'setNestedResources');

      component.setNestedResources(true);

      await vi.advanceTimersByTimeAsync(125);

      expect(storeSpy).toHaveBeenCalledWith(true);
    });

    it('should reset isNestedToggleFlipping to false after 250ms', async () => {
      component.setNestedResources(true);

      await vi.advanceTimersByTimeAsync(250);

      expect(component.isNestedToggleFlipping()).toBe(false);
    });

    it('should pass only the second call value to the store on rapid double-click', async () => {
      const storeSpy = vi.spyOn(component.store, 'setNestedResources');

      // First call — before midpoint, second call cancels it
      component.setNestedResources(true);
      await vi.advanceTimersByTimeAsync(50);

      // Second call overrides the pending mid-timeout
      component.setNestedResources(false);
      await vi.advanceTimersByTimeAsync(125);

      // Only the second call's value should reach the store
      expect(storeSpy).toHaveBeenCalledTimes(1);
      expect(storeSpy).toHaveBeenCalledWith(false);
    });
  });
});
