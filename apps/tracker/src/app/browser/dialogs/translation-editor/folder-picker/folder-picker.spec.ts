import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FolderPicker } from './folder-picker';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { BrowserStore } from '../../../store/browser.store';
import { getTranslocoTestingModule } from '../../../../../testing/transloco-testing.module';

describe('FolderPicker', () => {
  let component: FolderPicker;
  let fixture: ComponentFixture<FolderPicker>;

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
    createFolderAt: vi.fn(),
    selectedCollection: vi.fn(() => 'test-collection'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FolderPicker, BrowserAnimationsModule, getTranslocoTestingModule()],
      providers: [
        {
          provide: MatSnackBar,
          useValue: { open: vi.fn() },
        },
        {
          provide: BrowserStore,
          useValue: mockStore,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FolderPicker);
    component = fixture.componentInstance;

    // Set required inputs
    fixture.componentRef.setInput('currentPath', '');
    fixture.componentRef.setInput('rootFolders', mockRootFolders);

    fixture.detectChanges();
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
      component.isAddingFolder.set(true);
      component.addFolderParentPath.set('common');

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
