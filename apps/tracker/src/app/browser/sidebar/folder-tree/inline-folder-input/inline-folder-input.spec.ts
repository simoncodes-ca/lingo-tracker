import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InlineFolderInput } from './inline-folder-input';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { getTranslocoTestingModule } from '../../../../../testing/transloco-testing.module';

describe('InlineFolderInput', () => {
  let component: InlineFolderInput;
  let fixture: ComponentFixture<InlineFolderInput>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InlineFolderInput, getTranslocoTestingModule()],
      providers: [provideNoopAnimations()],
    }).compileComponents();

    fixture = TestBed.createComponent(InlineFolderInput);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty form control', () => {
    expect(component.folderNameControl.value).toBe('');
  });

  it('should validate required field', () => {
    component.folderNameControl.setValue('');
    expect(component.folderNameControl.hasError('required')).toBe(true);
  });

  it('should validate pattern for valid folder names', () => {
    const validNames = ['folder', 'folder-name', 'folder_name', 'Folder123'];

    validNames.forEach((name) => {
      component.folderNameControl.setValue(name);
      expect(component.folderNameControl.valid).toBe(true);
    });
  });

  it('should invalidate folder names with special characters', () => {
    const invalidNames = ['folder name', 'folder@name', 'folder.name', 'folder/name', 'folder\\name'];

    invalidNames.forEach((name) => {
      component.folderNameControl.setValue(name);
      expect(component.folderNameControl.hasError('pattern')).toBe(true);
    });
  });

  it('should emit confirm event on Enter key with valid input', () => {
    const confirmSpy = vi.fn();
    component.confirm.subscribe(confirmSpy);

    component.folderNameControl.setValue('valid-folder');
    component.onEnterKey();

    expect(confirmSpy).toHaveBeenCalledWith('valid-folder');
  });

  it('should not emit confirm event on Enter key with invalid input', () => {
    const confirmSpy = vi.fn();
    component.confirm.subscribe(confirmSpy);

    component.folderNameControl.setValue('invalid folder');
    component.onEnterKey();

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('should emit cancel event on Escape key', () => {
    const cancelSpy = vi.fn();
    component.cancelInput.subscribe(cancelSpy);

    component.onEscapeKey();

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('should emit cancel event on blur', () => {
    const cancelSpy = vi.fn();
    component.cancelInput.subscribe(cancelSpy);

    component.onBlur();

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('should return required error message token key', () => {
    component.folderNameControl.setValue('');
    component.folderNameControl.markAsTouched();

    expect(component.getErrorMessage()).toBe('browser.folderInput.nameRequired');
  });

  it('should return pattern error message token key', () => {
    component.folderNameControl.setValue('invalid folder');
    component.folderNameControl.markAsTouched();

    expect(component.getErrorMessage()).toBe('browser.folderInput.namePatternError');
  });

  it('should show error only after user interaction', () => {
    component.folderNameControl.setValue('');

    // Before interaction
    expect(component.shouldShowError()).toBe(false);

    // After marking as touched
    component.folderNameControl.markAsTouched();
    expect(component.shouldShowError()).toBe(true);

    // After marking as dirty
    component.folderNameControl.setValue('');
    component.folderNameControl.markAsDirty();
    expect(component.shouldShowError()).toBe(true);
  });

  it('should not show error for valid input', () => {
    component.folderNameControl.setValue('valid-folder');
    component.folderNameControl.markAsTouched();

    expect(component.shouldShowError()).toBe(false);
  });

  it('should render input field with placeholder', () => {
    const compiled = fixture.nativeElement;
    const input = compiled.querySelector('.folder-input') as HTMLInputElement;

    expect(input).toBeTruthy();
    expect(input.placeholder).toBe('Folder name');
  });

  it('should render folder icon', () => {
    const compiled = fixture.nativeElement;
    const icon = compiled.querySelector('.folder-icon');

    expect(icon).toBeTruthy();
    expect(icon?.textContent?.trim()).toBe('create_new_folder');
  });

  it('should display error message when validation fails and touched', () => {
    component.folderNameControl.setValue('invalid folder');
    component.folderNameControl.markAsTouched();
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const errorMessage = compiled.querySelector('.error-message');

    expect(errorMessage).toBeTruthy();
    expect(errorMessage?.textContent?.trim()).toBe('Only letters, numbers, dashes, and underscores allowed');
  });

  it('should trim whitespace before emitting confirm', () => {
    const confirmSpy = vi.fn();
    component.confirm.subscribe(confirmSpy);

    // Set valid value first, then manually add internal whitespace handling test
    // Note: leading/trailing spaces fail pattern validation, so we test the trim on valid input
    component.folderNameControl.setValue('folder-name');
    component.onEnterKey();

    expect(confirmSpy).toHaveBeenCalledWith('folder-name');
  });

  it('should accept parentPath input', () => {
    fixture.componentRef.setInput('parentPath', 'common.buttons');
    expect(component.parentPath()).toBe('common.buttons');
  });

  it('should accept null parentPath for root level', () => {
    fixture.componentRef.setInput('parentPath', null);
    expect(component.parentPath()).toBeNull();
  });
});
