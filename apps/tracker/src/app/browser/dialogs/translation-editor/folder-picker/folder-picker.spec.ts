import { HttpErrorResponse } from '@angular/common/http';
import type { ComponentFixture } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../../../testing/transloco-testing.module';
import { toApiError } from '../../../../shared/api-error/api-error';
import { NotificationService } from '../../../../shared/notification';
import { BrowserStore } from '../../../store/browser.store';
import { decideCreateFolder } from '../../../store/folder-write-feedback';
import { FolderPicker } from './folder-picker';

describe('FolderPicker', () => {
  let component: FolderPicker;
  let fixture: ComponentFixture<FolderPicker>;
  let spectator: Spectator<FolderPicker>;

  const mockRootFolders: FolderNodeDto[] = [
    {
      name: 'common',
      fullPath: 'common',
      loaded: true,
      tree: {
        path: 'common',
        resources: [],
        children: [
          {
            name: 'buttons',
            fullPath: 'common.buttons',
            loaded: false,
          },
        ],
      },
    },
    {
      name: 'errors',
      fullPath: 'errors',
      loaded: false,
    },
  ];

  const mockStore = {
    createFolder: vi.fn(),
    selectedCollection: vi.fn(() => 'test-collection'),
  };

  const createComponent = createComponentFactory({
    component: FolderPicker,
    imports: [BrowserAnimationsModule, getTranslocoTestingModule()],
    providers: [
      {
        provide: NotificationService,
        useValue: {
          success: vi.fn(),
          info: vi.fn(),
          warning: vi.fn(),
          error: vi.fn(),
        },
      },
      { provide: BrowserStore, useValue: mockStore },
    ],
    detectChanges: true,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.createFolder.mockReset();
    spectator = createComponent({ detectChanges: false });
    fixture = spectator.fixture;
    component = spectator.component;

    // Set required inputs
    fixture.componentRef.setInput('currentPath', '');
    fixture.componentRef.setInput('rootFolders', mockRootFolders);

    spectator.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should display "root" when current path is empty', () => {
      expect(component.displayPath()).toBe('root');
    });

    it('should display folder path when provided', () => {
      fixture.componentRef.setInput('currentPath', 'common.buttons');
      fixture.detectChanges();
      expect(component.displayPath()).toBe('common.buttons');
    });

    it('should start collapsed', () => {
      expect(component.isExpanded()).toBe(false);
    });

    it('should have no selected path initially', () => {
      expect(component.selectedPath()).toBeNull();
    });
  });

  describe('Expand/Collapse Behavior', () => {
    it('should toggle expanded state when clicked', () => {
      expect(component.isExpanded()).toBe(false);
      component.toggleExpanded();
      expect(component.isExpanded()).toBe(true);
      component.toggleExpanded();
      expect(component.isExpanded()).toBe(false);
    });

    it('should show expand_more icon when collapsed', () => {
      component.isExpanded.set(false);
      expect(component.chevronIcon()).toBe('expand_more');
    });

    it('should show expand_less icon when expanded', () => {
      component.isExpanded.set(true);
      expect(component.chevronIcon()).toBe('expand_less');
    });

    it('should clear focused path when collapsing', () => {
      component.isExpanded.set(true);
      component.focusedPath.set('common');

      component.toggleExpanded();

      expect(component.isExpanded()).toBe(false);
      expect(component.focusedPath()).toBeNull();
    });
  });

  describe('Folder Selection', () => {
    it('should auto-confirm folder selection on select', () => {
      const emitSpy = vi.fn();
      component.folderConfirmed.subscribe(emitSpy);

      component.isExpanded.set(true);
      component.onFolderSelect('common');

      expect(component.selectedPath()).toBe('common');
      expect(emitSpy).toHaveBeenCalledWith('common');
      expect(component.isExpanded()).toBe(false);
    });

    it('should update selected path and close picker on select', () => {
      component.isExpanded.set(true);
      component.onFolderSelect('common.buttons');

      expect(component.selectedPath()).toBe('common.buttons');
      expect(component.isExpanded()).toBe(false);
    });

    it('should clear focused path on select', () => {
      component.isExpanded.set(true);
      component.focusedPath.set('common');

      component.onFolderSelect('common.buttons');

      expect(component.focusedPath()).toBeNull();
    });
  });

  describe('Expand Toggle', () => {
    it('should add folder to expanded paths when expanded', () => {
      expect(component.expandedPaths().has('common')).toBe(false);

      component.onExpandToggle('common');

      expect(component.expandedPaths().has('common')).toBe(true);
    });

    it('should remove folder from expanded paths when collapsed', () => {
      component.expandedPaths.set(new Set(['common']));

      component.onExpandToggle('common');

      expect(component.expandedPaths().has('common')).toBe(false);
    });
  });

  describe('Folder Creation', () => {
    it('uses the shared create method with an explicit parent and selects the result without a toast', () => {
      const response = {
        folderPath: 'common.new',
        created: true,
        folder: { name: 'new', fullPath: 'common.new', loaded: false },
      };
      mockStore.createFolder.mockReturnValue(
        of(decideCreateFolder({ kind: 'created', folder: response.folder, created: true })),
      );
      const created = vi.fn();
      component.folderCreated.subscribe(created);
      component.onAddFolder('common');

      component.onFolderNameConfirmed('new');

      expect(mockStore.createFolder).toHaveBeenCalledWith('new', 'common');
      expect(created).toHaveBeenCalledWith(response.folder);
      expect(component.selectedPath()).toBe('common.new');
      expect(component.isCreatingFolder()).toBe(false);
      expect(spectator.inject(NotificationService).success).not.toHaveBeenCalled();
    });

    it('toasts an existing folder as info and still selects it', () => {
      const folder = { name: 'new', fullPath: 'common.new', loaded: false };
      mockStore.createFolder.mockReturnValue(of(decideCreateFolder({ kind: 'created', folder, created: false })));
      component.onAddFolder('common');

      component.onFolderNameConfirmed('new');

      expect(spectator.inject(NotificationService).info).toHaveBeenCalledWith('Folder already exists');
      expect(component.selectedPath()).toBe('common.new');
    });

    it('keeps the draft open on a refusal and shows it under the input instead of as a toast', () => {
      const error = toApiError(
        new HttpErrorResponse({
          status: 409,
          error: { message: 'Already exists' },
        }),
      );
      mockStore.createFolder.mockReturnValue(of(decideCreateFolder({ kind: 'refused', error })));
      const notifications = spectator.inject(NotificationService);
      component.toggleExpanded();
      component.onAddFolder('common');

      component.onFolderNameConfirmed('new');
      fixture.detectChanges();

      expect(component.createError()).toBe('Already exists');
      expect(spectator.query('app-inline-folder-input .error-message')?.textContent).toContain('Already exists');
      expect(notifications.error).not.toHaveBeenCalled();
      expect(component.isAddingFolder()).toBe(true);
      expect(component.addFolderParentPath()).toBe('common');
    });

    it('clears the inline refusal when the name is edited or the draft is cancelled', () => {
      const error = toApiError(new HttpErrorResponse({ status: 409, error: { message: 'Already exists' } }));
      mockStore.createFolder.mockReturnValue(of(decideCreateFolder({ kind: 'refused', error })));
      component.onAddFolder('common');
      component.onFolderNameConfirmed('new');
      expect(component.createError()).toBe('Already exists');

      component.onFolderNameEdited();
      expect(component.createError()).toBeNull();

      component.onFolderNameConfirmed('new');
      component.onFolderNameCancelled();
      expect(component.createError()).toBeNull();
      expect(component.isAddingFolder()).toBe(false);
    });

    it.each([
      ['cancelled', (): void => component.onFolderNameCancelled(), false],
      ['replaced by a new draft', (): void => component.onAddFolder('errors'), true],
    ])('ignores a late refusal for a draft that was %s', (_, change, stillOpen) => {
      const late = new Subject<ReturnType<typeof decideCreateFolder>>();
      mockStore.createFolder.mockReturnValue(late);
      component.onAddFolder('common');
      component.onFolderNameConfirmed('new');
      change();

      const error = toApiError(new HttpErrorResponse({ status: 409, error: { message: 'Already exists' } }));
      late.next(decideCreateFolder({ kind: 'refused', error }));

      expect(component.createError()).toBeNull();
      expect(component.isAddingFolder()).toBe(stillOpen);
    });

    it('does not close a replacement draft when a late create succeeds', () => {
      const late = new Subject<ReturnType<typeof decideCreateFolder>>();
      mockStore.createFolder.mockReturnValue(late);
      component.onAddFolder('common');
      component.onFolderNameConfirmed('new');
      component.onAddFolder('errors');

      late.next(
        decideCreateFolder({
          kind: 'created',
          folder: { name: 'new', fullPath: 'common.new', loaded: false },
          created: true,
        }),
      );

      expect(component.isAddingFolder()).toBe(true);
      expect(component.addFolderParentPath()).toBe('errors');
    });

    it('closes the inline input without a toast when no collection is open', () => {
      mockStore.createFolder.mockReturnValue(of(decideCreateFolder({ kind: 'no-collection' })));
      const notifications = spectator.inject(NotificationService);
      const created = vi.fn();
      component.folderCreated.subscribe(created);
      component.onCreateFirstFolder();

      component.onFolderNameConfirmed('new');

      expect(mockStore.createFolder).toHaveBeenCalledWith('new', null);
      expect(component.isCreatingFolder()).toBe(false);
      expect(component.isAddingFolder()).toBe(false);
      expect(component.addFolderParentPath()).toBeNull();
      expect(created).not.toHaveBeenCalled();
      expect(notifications.error).not.toHaveBeenCalled();
      expect(notifications.success).not.toHaveBeenCalled();
    });

    it('closes the draft and clears its error when its create outlives the browser session', () => {
      const error = toApiError(new HttpErrorResponse({ status: 409, error: { message: 'Already exists' } }));
      mockStore.createFolder.mockReturnValueOnce(of(decideCreateFolder({ kind: 'refused', error })));
      const late = new Subject<ReturnType<typeof decideCreateFolder>>();
      mockStore.createFolder.mockReturnValueOnce(late);
      const created = vi.fn();
      component.folderCreated.subscribe(created);
      component.onAddFolder('common');
      component.onFolderNameConfirmed('new');
      component.onFolderNameConfirmed('retry');

      late.next(decideCreateFolder({ kind: 'stale-session' }));

      expect(component.isCreatingFolder()).toBe(false);
      expect(component.isAddingFolder()).toBe(false);
      expect(component.addFolderParentPath()).toBeNull();
      expect(component.createError()).toBeNull();
      expect(created).not.toHaveBeenCalled();
      expect(spectator.inject(NotificationService).error).not.toHaveBeenCalled();
    });

    it('keeps a toast refusal out of the inline draft error while leaving the input open', () => {
      const error = toApiError(new HttpErrorResponse({ status: 409, error: { message: 'Already exists' } }));
      const outcome = decideCreateFolder({ kind: 'refused', error });
      mockStore.createFolder.mockReturnValueOnce(of(outcome));
      component.onAddFolder('common');
      component.onFolderNameConfirmed('new');
      mockStore.createFolder.mockReturnValueOnce(
        of({ ...outcome, feedback: { tone: 'error', placement: 'toast', token: 'unused', detail: 'Try again' } }),
      );

      component.onFolderNameConfirmed('retry');

      expect(component.isAddingFolder()).toBe(true);
      expect(component.addFolderParentPath()).toBe('common');
      expect(component.createError()).toBeNull();
      expect(spectator.inject(NotificationService).error).toHaveBeenCalledWith('Try again');
    });

    it('keeps picker expansion separate from the browser tree', () => {
      component.onExpandToggle('common');
      expect(component.expandedPaths()).toEqual(new Set(['common']));
      expect(mockStore).not.toHaveProperty('expandedFolders');
    });
    it('should start folder creation when add folder is clicked', () => {
      expect(component.isAddingFolder()).toBe(false);

      component.onAddFolder('common');

      expect(component.isAddingFolder()).toBe(true);
      expect(component.addFolderParentPath()).toBe('common');
      expect(component.expandedPaths().has('common')).toBe(true);
    });

    it('should support creating first folder at root', () => {
      component.onCreateFirstFolder();

      expect(component.isAddingFolder()).toBe(true);
      expect(component.addFolderParentPath()).toBe('');
    });

    it('should reset folder creation state on cancel', () => {
      component.onAddFolder('common');

      component.onFolderNameCancelled();

      expect(component.isAddingFolder()).toBe(false);
      expect(component.addFolderParentPath()).toBeNull();
    });
  });

  describe('Empty State', () => {
    it('should detect when root folders exist', () => {
      expect(component.hasRootFolders()).toBe(true);
    });

    it('should detect when no root folders exist', () => {
      fixture.componentRef.setInput('rootFolders', []);
      fixture.detectChanges();

      expect(component.hasRootFolders()).toBe(false);
    });
  });

  describe('initiallyExpanded', () => {
    it('should auto-expand tree and set selectedPath when initiallyExpanded is true with currentPath', () => {
      // Create a fresh component with initiallyExpanded
      const expanded = createComponent({
        props: {
          currentPath: 'common.buttons',
          rootFolders: mockRootFolders,
          initiallyExpanded: true,
        },
        detectChanges: true,
      });

      const expandedComponent = expanded.component;
      expect(expandedComponent.isExpanded()).toBe(true);
      expect(expandedComponent.selectedPath()).toBe('common.buttons');
      expect(expandedComponent.expandedPaths().has('common')).toBe(true);
      expect(expandedComponent.expandedPaths().has('common.buttons')).toBe(true);
    });

    it('should auto-expand tree without setting selectedPath when currentPath is empty', () => {
      const expanded = createComponent({
        props: {
          currentPath: '',
          rootFolders: mockRootFolders,
          initiallyExpanded: true,
        },
        detectChanges: true,
      });

      const expandedComponent = expanded.component;
      expect(expandedComponent.isExpanded()).toBe(true);
      expect(expandedComponent.selectedPath()).toBeNull();
      expect(expandedComponent.expandedPaths().size).toBe(0);
    });

    it('should not auto-expand when initiallyExpanded is false', () => {
      expect(component.isExpanded()).toBe(false);
      expect(component.selectedPath()).toBeNull();
    });

    it('should keep the tree expanded after folder selection when initiallyExpanded is true', () => {
      const expanded = createComponent({
        props: {
          currentPath: 'common',
          rootFolders: mockRootFolders,
          initiallyExpanded: true,
        },
        detectChanges: true,
      });

      const expandedComponent = expanded.component;
      const emitSpy = vi.fn();
      expandedComponent.folderConfirmed.subscribe(emitSpy);

      expandedComponent.onFolderSelect('errors');

      expect(expandedComponent.selectedPath()).toBe('errors');
      expect(emitSpy).toHaveBeenCalledWith('errors');
      expect(expandedComponent.isExpanded()).toBe(true);
    });

    it('should not collapse the tree when toggleExpanded is called and initiallyExpanded is true', () => {
      const expanded = createComponent({
        props: {
          currentPath: 'common',
          rootFolders: mockRootFolders,
          initiallyExpanded: true,
        },
        detectChanges: true,
      });

      const expandedComponent = expanded.component;
      expandedComponent.toggleExpanded();

      expect(expandedComponent.isExpanded()).toBe(true);
    });
  });

  describe('Keyboard Navigation', () => {
    it('should move focus down on ArrowDown', () => {
      component.isExpanded.set(true);
      component.focusedPath.set(null);

      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      component.onTreeKeydown(event);

      expect(component.focusedPath()).toBe('common');
    });

    it('should move focus up on ArrowUp', () => {
      component.isExpanded.set(true);
      component.focusedPath.set('errors');

      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      component.onTreeKeydown(event);

      expect(component.focusedPath()).toBe('common');
    });

    it('should expand folder on ArrowRight', () => {
      component.isExpanded.set(true);
      component.focusedPath.set('common');

      const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
      component.onTreeKeydown(event);

      expect(component.expandedPaths().has('common')).toBe(true);
    });

    it('should collapse folder on ArrowLeft when expanded', () => {
      component.isExpanded.set(true);
      component.focusedPath.set('common');
      component.expandedPaths.set(new Set(['common']));

      const event = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
      component.onTreeKeydown(event);

      expect(component.expandedPaths().has('common')).toBe(false);
    });

    it('should auto-confirm folder on Enter', () => {
      const emitSpy = vi.fn();
      component.folderConfirmed.subscribe(emitSpy);

      component.isExpanded.set(true);
      component.focusedPath.set('common');

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      component.onTreeKeydown(event);

      expect(component.selectedPath()).toBe('common');
      expect(emitSpy).toHaveBeenCalledWith('common');
      expect(component.isExpanded()).toBe(false);
    });

    it('should auto-confirm folder on Space', () => {
      const emitSpy = vi.fn();
      component.folderConfirmed.subscribe(emitSpy);

      component.isExpanded.set(true);
      component.focusedPath.set('common');

      const event = new KeyboardEvent('keydown', { key: ' ' });
      component.onTreeKeydown(event);

      expect(component.selectedPath()).toBe('common');
      expect(emitSpy).toHaveBeenCalledWith('common');
      expect(component.isExpanded()).toBe(false);
    });
  });
});
