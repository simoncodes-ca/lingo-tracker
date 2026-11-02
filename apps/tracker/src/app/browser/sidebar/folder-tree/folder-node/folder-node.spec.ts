import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../../../testing/transloco-testing.module';
import { FolderNode } from './folder-node';

describe('FolderNode', () => {
  let component: FolderNode;
  let fixture: ComponentFixture<FolderNode>;
  let spectator: Spectator<FolderNode>;

  const folderWithChildren: FolderNodeDto = {
    name: 'common',
    fullPath: 'common',
    loaded: true,
    tree: {
      path: 'common',
      resources: [],
      children: [{ name: 'buttons', fullPath: 'common.buttons', loaded: true }],
    },
  };

  const createComponent = createComponentFactory({
    component: FolderNode,
    imports: [getTranslocoTestingModule()],
    providers: [provideHttpClient(), provideHttpClientTesting()],
    detectChanges: false,
  });

  beforeEach(() => {
    spectator = createComponent();
    fixture = spectator.fixture;
    component = spectator.component;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('accepts a root-level resource on a folder', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);
    fixture.componentRef.setInput('activeDragData', { type: 'resource', key: 'welcome', folderPath: '' });

    expect(component.isValidDropTarget()).toBe(true);
    expect(
      component.canDrop({ data: { type: 'resource', key: 'welcome', folderPath: '' } } as Parameters<
        typeof component.canDrop
      >[0]),
    ).toBe(true);
  });

  it('emits a folder dropped onto its current parent', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);
    const dragData = { type: 'folder' as const, path: 'common.buttons' };
    fixture.componentRef.setInput('activeDragData', dragData);
    const dropped = vi.fn();
    component.folderDropped.subscribe(dropped);

    expect(component.isValidDropTarget()).toBe(true);
    expect(component.canDrop({ data: dragData } as Parameters<typeof component.canDrop>[0])).toBe(true);
    component.onDrop({ item: { data: dragData } } as Parameters<typeof component.onDrop>[0]);

    expect(dropped).toHaveBeenCalledWith({ dragData, targetFolderPath: 'common' });
  });

  it('passes its own path with a confirmed folder name to the sidebar', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);
    const create = vi.fn();
    component.createFolder.subscribe(create);

    component.onFolderConfirm('icons');

    expect(create).toHaveBeenCalledWith({ folderName: 'icons', parentPath: 'common' });
  });

  it('should accept folder input', () => {
    const folder: FolderNodeDto = {
      name: 'common',
      fullPath: 'common',
      loaded: false,
    };

    fixture.componentRef.setInput('folder', folder);
    expect(component.folder()).toEqual(folder);
  });

  it('should emit folderClick when folder is clicked', () => {
    const folder: FolderNodeDto = {
      name: 'common',
      fullPath: 'common',
      loaded: false,
    };

    fixture.componentRef.setInput('folder', folder);

    const emitSpy = vi.fn();
    component.folderClick.subscribe(emitSpy);

    component.onFolderClick();

    expect(emitSpy).toHaveBeenCalledWith(folder);
  });

  it('should request expansion when a collapsed folder with children is clicked', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);

    const emitSpy = vi.fn();
    component.expandRequested.subscribe(emitSpy);

    component.onFolderClick();

    expect(emitSpy).toHaveBeenCalledWith('common');
  });

  it('should not request expansion when the folder is already expanded', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);
    fixture.componentRef.setInput('expandedPaths', new Set(['common']));

    const emitSpy = vi.fn();
    component.expandRequested.subscribe(emitSpy);

    component.onFolderClick();

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should not request expansion for a folder without children', () => {
    const folder: FolderNodeDto = {
      name: 'common',
      fullPath: 'common',
      loaded: true,
      tree: { path: 'common', resources: [], children: [] },
    };

    fixture.componentRef.setInput('folder', folder);

    const emitSpy = vi.fn();
    component.expandRequested.subscribe(emitSpy);

    component.onFolderClick();

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should emit toggleExpanded from the chevron without selecting the folder', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);

    const toggleSpy = vi.fn();
    const clickSpy = vi.fn();
    component.toggleExpanded.subscribe(toggleSpy);
    component.folderClick.subscribe(clickSpy);

    component.onToggleExpandedClick(new MouseEvent('click'));

    expect(toggleSpy).toHaveBeenCalledWith('common');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('should render a chevron only for folders with children', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.expand-toggle')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.expand-spacer')).toBeFalsy();

    fixture.componentRef.setInput('folder', {
      name: 'common',
      fullPath: 'common',
      loaded: true,
      tree: { path: 'common', resources: [], children: [] },
    } satisfies FolderNodeDto);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.expand-toggle')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.expand-spacer')).toBeTruthy();
  });

  it('should render child folders only while expanded', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.folder-children')).toBeFalsy();

    fixture.componentRef.setInput('expandedPaths', new Set(['common']));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.folder-children')).toBeTruthy();
  });

  it('should expand on ArrowRight and collapse on ArrowLeft', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);

    const expandSpy = vi.fn();
    const toggleSpy = vi.fn();
    component.expandRequested.subscribe(expandSpy);
    component.toggleExpanded.subscribe(toggleSpy);

    // Collapsed: ArrowRight opens, ArrowLeft does nothing.
    component.onTreeKeydown(new KeyboardEvent('keydown'), 'ArrowRight');
    component.onTreeKeydown(new KeyboardEvent('keydown'), 'ArrowLeft');
    expect(expandSpy).toHaveBeenCalledWith('common');
    expect(toggleSpy).not.toHaveBeenCalled();

    // Expanded: ArrowLeft closes, ArrowRight does nothing more.
    expandSpy.mockClear();
    fixture.componentRef.setInput('expandedPaths', new Set(['common']));
    component.onTreeKeydown(new KeyboardEvent('keydown'), 'ArrowRight');
    component.onTreeKeydown(new KeyboardEvent('keydown'), 'ArrowLeft');
    expect(expandSpy).not.toHaveBeenCalled();
    expect(toggleSpy).toHaveBeenCalledWith('common');
  });

  it.each([
    { key: 'ArrowRight', open: false, expanded: true, collapsed: false, selected: false, prevent: true },
    { key: 'ArrowRight', open: true, expanded: false, collapsed: false, selected: false, prevent: false },
    { key: 'ArrowLeft', open: true, expanded: false, collapsed: true, selected: false, prevent: true },
    { key: 'ArrowLeft', open: false, expanded: false, collapsed: false, selected: false, prevent: false },
    { key: 'Enter', open: false, expanded: true, collapsed: false, selected: true, prevent: false },
    { key: 'Enter', open: true, expanded: false, collapsed: false, selected: true, prevent: false },
    { key: ' ', open: false, expanded: true, collapsed: false, selected: true, prevent: false },
    { key: 'ArrowUp', open: false, expanded: false, collapsed: false, selected: false, prevent: false },
    { key: 'ArrowDown', open: false, expanded: false, collapsed: false, selected: false, prevent: false },
  ])('wires $key with open=$open to the intended outputs', (test) => {
    fixture.componentRef.setInput('folder', folderWithChildren);
    fixture.componentRef.setInput('expandedPaths', new Set(test.open ? ['common'] : []));
    fixture.detectChanges();
    const expanded = vi.fn();
    const collapsed = vi.fn();
    const selected = vi.fn();
    component.expandRequested.subscribe(expanded);
    component.toggleExpanded.subscribe(collapsed);
    component.folderClick.subscribe(selected);
    const event = new KeyboardEvent('keydown', { key: test.key, bubbles: true, cancelable: true });
    const header: HTMLElement | null = fixture.nativeElement.querySelector('.folder-header');
    header?.dispatchEvent(event);
    expect(expanded.mock.calls).toEqual(test.expanded ? [['common']] : []);
    expect(collapsed.mock.calls).toEqual(test.collapsed ? [['common']] : []);
    expect(selected.mock.calls).toEqual(test.selected ? [[folderWithChildren]] : []);
    expect(event.defaultPrevented).toBe(test.prevent);
  });

  it('should render folder name', () => {
    const folder: FolderNodeDto = {
      name: 'common',
      fullPath: 'common',
      loaded: false,
    };

    fixture.componentRef.setInput('folder', folder);
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const folderNameElement = compiled.querySelector('.folder-name');
    expect(folderNameElement).toBeTruthy();
    expect(folderNameElement?.textContent?.trim()).toBe('common');
  });

  it('should show closed folder icon while collapsed', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const folderIcon = compiled.querySelector('.folder-icon');
    expect(folderIcon).toBeTruthy();
    expect(folderIcon?.textContent?.trim()).toBe('folder');
  });

  it('should show open folder icon while expanded', () => {
    fixture.componentRef.setInput('folder', folderWithChildren);
    fixture.componentRef.setInput('expandedPaths', new Set(['common']));
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const folderIcon = compiled.querySelector('.folder-icon');
    expect(folderIcon).toBeTruthy();
    expect(folderIcon?.textContent?.trim()).toBe('folder_open');
  });

  it('should apply selected class when folder is selected', () => {
    const folder: FolderNodeDto = {
      name: 'common',
      fullPath: 'common',
      loaded: false,
    };

    fixture.componentRef.setInput('folder', folder);
    fixture.componentRef.setInput('selectedPath', 'common');
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.folder-header.selected')).toBeTruthy();
  });
});
