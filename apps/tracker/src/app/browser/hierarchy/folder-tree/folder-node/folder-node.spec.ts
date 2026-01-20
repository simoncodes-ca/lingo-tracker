import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FolderNode } from './folder-node';
import { FolderNodeDto } from '@simoncodes-ca/data-transfer';
import { getTranslocoTestingModule } from '../../../../../testing/transloco-testing.module';

describe('FolderNode', () => {
  let component: FolderNode;
  let fixture: ComponentFixture<FolderNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        FolderNode,
        getTranslocoTestingModule(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FolderNode);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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

  it('should emit loadFolder when unloaded folder is clicked', () => {
    const folder: FolderNodeDto = {
      name: 'common',
      fullPath: 'common',
      loaded: false,
    };

    fixture.componentRef.setInput('folder', folder);

    const emitSpy = vi.fn();
    component.loadFolder.subscribe(emitSpy);

    component.onLoadClick();

    expect(emitSpy).toHaveBeenCalledWith('common');
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

  it('should show "click to load" for unloaded folders', () => {
    const folder: FolderNodeDto = {
      name: 'common',
      fullPath: 'common',
      loaded: false,
    };

    fixture.componentRef.setInput('folder', folder);
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.load-hint')).toBeTruthy();
    expect(compiled.querySelector('.load-hint')?.textContent?.trim()).toBe('click to load');
  });

  it('should not show "click to load" for loaded folders', () => {
    const folder: FolderNodeDto = {
      name: 'common',
      fullPath: 'common',
      loaded: true,
      tree: { path: 'common', resources: [], children: [] },
    };

    fixture.componentRef.setInput('folder', folder);
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.load-hint')).toBeFalsy();
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
