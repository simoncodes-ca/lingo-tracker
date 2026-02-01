import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FolderPicker } from './folder-picker';
import { FolderNodeDto } from '@simoncodes-ca/data-transfer';

describe('FolderPicker', () => {
  let component: FolderPicker;
  let fixture: ComponentFixture<FolderPicker>;

  const mockRootFolders: FolderNodeDto[] = [
    {
      name: 'common',
      fullPath: 'common',
      loaded: true,
      tree: {
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FolderPicker, BrowserAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(FolderPicker);
    component = fixture.componentInstance;

    // Set required inputs
    fixture.componentRef.setInput('selectedPath', '');
    fixture.componentRef.setInput('rootFolders', mockRootFolders);
    fixture.componentRef.setInput('folderExists', true);

    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should display "root" when selected path is empty', () => {
      expect(component.displayPath()).toBe('root');
    });

    it('should display folder path when provided', () => {
      fixture.componentRef.setInput('selectedPath', 'common.buttons');
      fixture.detectChanges();
      expect(component.displayPath()).toBe('common.buttons');
    });

    it('should start collapsed', () => {
      expect(component.isExpanded()).toBe(false);
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
  });

  describe('Folder Selection', () => {
    it('should emit folderSelected when folder is clicked', () => {
      const emitSpy = vi.fn();
      component.folderSelected.subscribe(emitSpy);

      const mockFolder: FolderNodeDto = {
        name: 'common',
        fullPath: 'common',
        loaded: true,
      };

      component.onFolderClick(mockFolder);

      expect(emitSpy).toHaveBeenCalledWith('common');
    });

    it('should collapse picker when folder is selected', () => {
      component.isExpanded.set(true);

      const mockFolder: FolderNodeDto = {
        name: 'common',
        fullPath: 'common',
        loaded: true,
      };

      component.onFolderClick(mockFolder);

      expect(component.isExpanded()).toBe(false);
    });

    it('should clear custom input when folder is selected', () => {
      component.customInput.set('some-custom-path');

      const mockFolder: FolderNodeDto = {
        name: 'common',
        fullPath: 'common',
        loaded: true,
      };

      component.onFolderClick(mockFolder);

      expect(component.customInput()).toBe('');
    });
  });

  describe('Root Folder Selection', () => {
    it('should emit empty string when root is selected', () => {
      const emitSpy = vi.fn();
      component.folderSelected.subscribe(emitSpy);

      component.selectRoot();

      expect(emitSpy).toHaveBeenCalledWith('');
    });

    it('should collapse picker when root is selected', () => {
      component.isExpanded.set(true);
      component.selectRoot();
      expect(component.isExpanded()).toBe(false);
    });
  });

  describe('Custom Folder Input', () => {
    it('should update custom input signal on input change', () => {
      const mockEvent = {
        target: { value: 'custom.path' },
      } as unknown as Event;

      component.onCustomInputChange(mockEvent);

      expect(component.customInput()).toBe('custom.path');
    });

    it('should emit folderSelected when custom input is provided', () => {
      const emitSpy = vi.fn();
      component.folderSelected.subscribe(emitSpy);

      const mockEvent = {
        target: { value: 'custom.path' },
      } as unknown as Event;

      component.onCustomInputChange(mockEvent);

      expect(emitSpy).toHaveBeenCalledWith('custom.path');
    });

    it('should not emit when custom input is empty', () => {
      const emitSpy = vi.fn();
      component.folderSelected.subscribe(emitSpy);

      const mockEvent = {
        target: { value: '   ' },
      } as unknown as Event;

      component.onCustomInputChange(mockEvent);

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should collapse picker on Enter key in custom input', () => {
      component.isExpanded.set(true);

      const mockEvent = {
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent;

      component.onCustomInputKeyDown(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(component.isExpanded()).toBe(false);
    });
  });

  describe('Load Folder', () => {
    it('should emit loadFolder when requested', () => {
      const emitSpy = vi.fn();
      component.loadFolder.subscribe(emitSpy);

      component.onLoadFolder('common.buttons');

      expect(emitSpy).toHaveBeenCalledWith('common.buttons');
    });
  });

  describe('New Folder Indicator', () => {
    it('should show new folder chip when folder does not exist', () => {
      fixture.componentRef.setInput('folderExists', false);
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const chip = compiled.querySelector('.new-folder-chip');

      expect(chip).toBeTruthy();
    });

    it('should not show new folder chip when folder exists', () => {
      fixture.componentRef.setInput('folderExists', true);
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const chip = compiled.querySelector('.new-folder-chip');

      expect(chip).toBeFalsy();
    });
  });
});
