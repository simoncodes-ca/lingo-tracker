import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollectionFormDialog } from './collection-form-dialog';
import type { CollectionFormDialogData } from './collection-form-dialog-data';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { of } from 'rxjs';

const buildTestBed = async (
  data: CollectionFormDialogData,
  mockDialog: Partial<MatDialog> = { open: vi.fn() },
): Promise<{
  fixture: ComponentFixture<CollectionFormDialog>;
  mockDialogRef: { close: ReturnType<typeof vi.fn> };
  mockDialog: Partial<MatDialog>;
}> => {
  const mockDialogRef = { close: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [CollectionFormDialog, NoopAnimationsModule, getTranslocoTestingModule()],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: mockDialogRef },
      { provide: MatDialog, useValue: mockDialog },
    ],
  }).compileComponents();

  TestBed.overrideProvider(MatDialog, { useValue: mockDialog });

  const fixture = TestBed.createComponent(CollectionFormDialog);
  fixture.detectChanges();
  return { fixture, mockDialogRef, mockDialog };
};

describe('CollectionFormDialog — create mode', () => {
  let fixture: ComponentFixture<CollectionFormDialog>;
  let component: CollectionFormDialog;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    ({ fixture, mockDialogRef } = await buildTestBed({ mode: 'create' }));
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not be in edit mode', () => {
    expect(component.isEditMode).toBe(false);
  });

  it('should add a valid locale and auto-set it as base', () => {
    component.addLocaleInput.setValue('en');
    component.addLocale();

    expect(component.form.controls.locales.length).toBe(1);
    expect(component.form.controls.locales.at(0).value).toBe('en');
    expect(component.form.controls.baseLocale.value).toBe('en');
    expect(component.addLocaleInput.value).toBe('');
    expect(component.addLocaleInput.errors).toBeNull();
  });

  it('should add a second locale without changing base', () => {
    component.addLocaleInput.setValue('en');
    component.addLocale();
    component.addLocaleInput.setValue('fr-ca');
    component.addLocale();

    expect(component.form.controls.locales.length).toBe(2);
    expect(component.form.controls.baseLocale.value).toBe('en');
  });

  it('should reject an invalid locale format', () => {
    component.addLocaleInput.setValue('xx-invalid-code');
    component.addLocale();

    expect(component.form.controls.locales.length).toBe(0);
    expect(component.addLocaleInput.hasError('invalidLocale')).toBe(true);
    expect(component.addLocaleInput.value).toBe('xx-invalid-code');
  });

  it('should reject a duplicate locale', () => {
    component.addLocaleInput.setValue('en');
    component.addLocale();
    component.addLocaleInput.setValue('en');
    component.addLocale();

    expect(component.form.controls.locales.length).toBe(1);
    expect(component.addLocaleInput.hasError('duplicateLocale')).toBe(true);
  });

  it('should normalize locale to lowercase on add', () => {
    component.addLocaleInput.setValue('EN');
    component.addLocale();

    expect(component.form.controls.locales.at(0).value).toBe('en');
  });

  it('should remove a locale row', () => {
    component.addLocaleInput.setValue('en');
    component.addLocale();
    component.addLocaleInput.setValue('es');
    component.addLocale();

    component.removeLocale(1);

    expect(component.form.controls.locales.length).toBe(1);
    expect(component.form.controls.locales.at(0).value).toBe('en');
  });

  it('should auto-promote first remaining locale to base when base is removed', () => {
    component.addLocaleInput.setValue('en');
    component.addLocale();
    component.addLocaleInput.setValue('es');
    component.addLocale();
    component.removeLocale(0);

    expect(component.form.controls.baseLocale.value).toBe('es');
  });

  it('should clear base locale when last locale is removed', () => {
    component.addLocaleInput.setValue('en');
    component.addLocale();
    component.removeLocale(0);

    expect(component.form.controls.locales.length).toBe(0);
    expect(component.form.controls.baseLocale.value).toBe('');
  });

  it('should not close dialog when form is invalid', async () => {
    await component.onSubmit();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should close dialog with result when form is valid and submitted', async () => {
    component.form.controls.name.setValue('my-collection');
    component.form.controls.translationsFolder.setValue('./i18n');
    component.addLocaleInput.setValue('en');
    component.addLocale();

    await component.onSubmit();

    expect(mockDialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-collection',
        config: expect.objectContaining({
          translationsFolder: './i18n',
          locales: ['en'],
          baseLocale: 'en',
        }),
      }),
    );
  });

  it('should omit baseLocale and locales from result when no locales added', async () => {
    component.form.controls.name.setValue('my-collection');
    component.form.controls.translationsFolder.setValue('./i18n');

    await component.onSubmit();

    const closeArg = mockDialogRef.close.mock.calls[0][0];
    expect(closeArg.config).not.toHaveProperty('locales');
    expect(closeArg.config).not.toHaveProperty('baseLocale');
  });
});

describe('CollectionFormDialog — edit mode', () => {
  let fixture: ComponentFixture<CollectionFormDialog>;
  let component: CollectionFormDialog;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  const editData: CollectionFormDialogData = {
    mode: 'edit',
    name: 'my-app',
    config: {
      translationsFolder: './i18n',
      baseLocale: 'en',
      locales: ['en', 'es', 'fr-ca'],
    },
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    mockDialog = { open: vi.fn() };

    ({ fixture, mockDialogRef, mockDialog } = await buildTestBed(editData, mockDialog));
    component = fixture.componentInstance;
  });

  it('should be in edit mode', () => {
    expect(component.isEditMode).toBe(true);
  });

  it('should pre-populate locale rows from config', () => {
    expect(component.form.controls.locales.length).toBe(3);
    expect(component.form.controls.locales.at(0).value).toBe('en');
    expect(component.form.controls.locales.at(1).value).toBe('es');
    expect(component.form.controls.locales.at(2).value).toBe('fr-ca');
  });

  it('should pre-populate baseLocale from config', () => {
    expect(component.form.controls.baseLocale.value).toBe('en');
  });

  it('should open confirmation dialog when a pre-existing locale is removed on submit', async () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(false) });

    component.removeLocale(2);
    await component.onSubmit();

    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should close dialog with result after removal confirmation confirmed', async () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });

    component.removeLocale(2);
    await component.onSubmit();

    expect(mockDialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ locales: ['en', 'es'] }),
      }),
    );
  });

  it('should not open confirmation dialog when only adding a new locale on submit', async () => {
    component.addLocaleInput.setValue('de');
    component.addLocale();
    await component.onSubmit();

    expect(mockDialog.open).not.toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ locales: ['en', 'es', 'fr-ca', 'de'] }),
      }),
    );
  });

  it('should keep base locale unchanged in edit mode', () => {
    expect(component.form.controls.baseLocale.value).toBe('en');
    component.removeLocale(1);
    expect(component.form.controls.baseLocale.value).toBe('en');
  });

  it('should not remove the base locale row in edit mode', () => {
    component.removeLocale(0);
    expect(component.form.controls.locales.length).toBe(3);
    expect(component.form.controls.locales.at(0).value).toBe('en');
  });
});
