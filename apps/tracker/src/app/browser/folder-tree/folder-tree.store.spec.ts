import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FolderTreeStore } from './folder-tree.store';
import { ResourceTreeDto, FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { patchState } from '@ngrx/signals';

describe('FolderTreeStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [FolderTreeStore],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should be created with initial state', () => {
    const store = TestBed.inject(FolderTreeStore);

    expect(store.rootFolders()).toEqual([]);
    expect(store.selectedFolderPath()).toBeNull();
    expect(store.searchFilter()).toBe('');
    expect(store.isLoading()).toBe(false);
    expect(store.isDisabled()).toBe(false);
  });

  it('should select a folder', () => {
    const store = TestBed.inject(FolderTreeStore);

    store.selectFolder('common.buttons');

    expect(store.selectedFolderPath()).toBe('common.buttons');
  });

  it('should clear selection when null is passed', () => {
    const store = TestBed.inject(FolderTreeStore);

    store.selectFolder('common.buttons');
    store.selectFolder(null);

    expect(store.selectedFolderPath()).toBeNull();
  });
});

describe('FolderTreeStore - Loading', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [FolderTreeStore],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('should load root folders', () => {
    const store = TestBed.inject(FolderTreeStore);

    const mockResponse: ResourceTreeDto = {
      path: '',
      resources: [],
      children: [
        { name: 'common', fullPath: 'common', loaded: false },
        { name: 'auth', fullPath: 'auth', loaded: false },
      ],
    };

    store.loadRootFolders('my-collection');
    expect(store.isLoading()).toBe(true);

    const req = httpMock.expectOne(
      '/api/collections/my-collection/resources/tree?path=&depth=2'
    );
    req.flush(mockResponse);

    expect(store.isLoading()).toBe(false);
    expect(store.rootFolders()).toEqual(mockResponse.children);
  });

  it('should handle loading error', () => {
    const store = TestBed.inject(FolderTreeStore);

    store.loadRootFolders('my-collection');

    const req = httpMock.expectOne(
      '/api/collections/my-collection/resources/tree?path=&depth=2'
    );
    req.error(new ProgressEvent('error'), { status: 500 });

    expect(store.isLoading()).toBe(false);
    expect(store.error()).toBeTruthy();
  });

  it('should load children for a folder', () => {
    const store = TestBed.inject(FolderTreeStore);

    // Set up initial state with root folders
    const initialFolders: FolderNodeDto[] = [
      { name: 'common', fullPath: 'common', loaded: false },
    ];

    store.loadRootFolders('my-collection');
    const req1 = httpMock.expectOne(
      '/api/collections/my-collection/resources/tree?path=&depth=2'
    );
    req1.flush({ path: '', resources: [], children: initialFolders });

    // Now load children for 'common' folder
    const mockResponse: ResourceTreeDto = {
      path: 'common',
      resources: [],
      children: [
        { name: 'buttons', fullPath: 'common.buttons', loaded: false },
        { name: 'labels', fullPath: 'common.labels', loaded: false },
      ],
    };

    store.loadFolderChildren({ collectionName: 'my-collection', folderPath: 'common' });

    const req2 = httpMock.expectOne(
      '/api/collections/my-collection/resources/tree?path=common&depth=2'
    );
    req2.flush(mockResponse);

    expect(store.isLoading()).toBe(false);

    // The folder should now be marked as loaded with children
    const rootFolders = store.rootFolders();
    expect(rootFolders[0].loaded).toBe(true);
    expect(rootFolders[0].tree).toBeDefined();
    expect(rootFolders[0].tree?.children).toEqual(mockResponse.children);
  });
});

describe('FolderTreeStore - Search', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [FolderTreeStore],
    });
  });

  it('should filter folders based on search term', () => {
    const store = TestBed.inject(FolderTreeStore);

    // Set up folders
    patchState(store, {
      rootFolders: [
        { name: 'common', fullPath: 'common', loaded: false },
        { name: 'auth', fullPath: 'auth', loaded: false },
        { name: 'dashboard', fullPath: 'dashboard', loaded: false },
      ],
    });

    store.setSearchFilter('com');

    const filtered = store.filteredFolders();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('common');
  });

  it('should show all folders when search is empty', () => {
    const store = TestBed.inject(FolderTreeStore);

    patchState(store, {
      rootFolders: [
        { name: 'common', fullPath: 'common', loaded: false },
        { name: 'auth', fullPath: 'auth', loaded: false },
      ],
    });

    store.setSearchFilter('');

    const filtered = store.filteredFolders();
    expect(filtered).toHaveLength(2);
  });

  it('should filter case-insensitively', () => {
    const store = TestBed.inject(FolderTreeStore);

    patchState(store, {
      rootFolders: [
        { name: 'Common', fullPath: 'Common', loaded: false },
        { name: 'AUTH', fullPath: 'AUTH', loaded: false },
      ],
    });

    store.setSearchFilter('common');

    const filtered = store.filteredFolders();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Common');
  });
});
