import { HttpErrorResponse } from '@angular/common/http';
import type { ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing.module';
import { toApiError } from '../../shared/api-error/api-error';
import { CollectionsStore } from '../store/collections.store';
import { CollectionFormDialog } from './collection-form-dialog';
import type { CollectionFormDialogData } from './collection-form-dialog-data';

const savedConfig: LingoTrackerConfigDto = {
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  baseLocale: 'en',
  locales: ['en'],
  collections: { 'my-collection': { translationsFolder: './i18n' } },
};

const createComponent = createComponentFactory({
  component: CollectionFormDialog,
  imports: [NoopAnimationsModule, getTranslocoTestingModule()],
  detectChanges: false,
});

/** The one `MatDialog` method the form uses: `open`, for the base-locale-change confirmation. */
type DialogMock = { open: ReturnType<typeof vi.fn> };

/** The two Config Writes the dialog makes; both accept by default. */
type StoreMock = { createCollection: ReturnType<typeof vi.fn>; updateCollection: ReturnType<typeof vi.fn> };

/** `close`, and `disableClose`, which the dialog sets while a write is in flight. */
type DialogRefMock = { close: ReturnType<typeof vi.fn>; disableClose: boolean | undefined };

const apiError = (status: number, body: object) =>
  toApiError(new HttpErrorResponse({ status, error: { statusCode: status, ...body } }));

const rejection = (status: number, body: object) =>
  throwError(() => toApiError(new HttpErrorResponse({ status, error: { statusCode: status, ...body } })));

const buildHarness = (
  data: CollectionFormDialogData,
  mockDialog: DialogMock = { open: vi.fn() },
): {
  fixture: ComponentFixture<CollectionFormDialog>;
  spectator: Spectator<CollectionFormDialog>;
  mockDialogRef: DialogRefMock;
  mockDialog: DialogMock;
  store: StoreMock;
} => {
  const mockDialogRef: DialogRefMock = { close: vi.fn(), disableClose: false };
  const store: StoreMock = {
    createCollection: vi.fn(() => of(savedConfig)),
    updateCollection: vi.fn(() => of(savedConfig)),
  };
  const spectator = createComponent({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: mockDialogRef },
      { provide: MatDialog, useValue: mockDialog },
      { provide: CollectionsStore, useValue: store },
    ],
  });
  spectator.detectChanges();
  return { fixture: spectator.fixture, spectator, mockDialogRef, mockDialog, store };
};

describe('CollectionFormDialog — create mode', () => {
  let fixture: ComponentFixture<CollectionFormDialog>;
  let component: CollectionFormDialog;
  let mockDialogRef: DialogRefMock;
  let store: StoreMock;

  beforeEach(async () => {
    ({ fixture, mockDialogRef, store } = buildHarness({ mode: 'create' }));
    component = fixture.componentInstance;
  });

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const fillValidForm = (): void => {
    component.model.form.controls.name.setValue('my-collection');
    component.model.form.controls.translationsFolder.setValue('./i18n');
    component.model.addLocaleInput.setValue('en');
    component.model.addLocale();
  };

  const submitError = (): string | null =>
    el().querySelector('[data-testid="submit-error"] span')?.textContent?.trim() ?? null;

  /** Cancel in the footer and the close icon in the header. */
  const closeButtons = (): HTMLButtonElement[] =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('[data-testid="cancel"]'));

  const press = (input: HTMLInputElement, key: string): void => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    fixture.detectChanges();
  };

  const chipTexts = (labelledBy: string): string[] =>
    Array.from(el().querySelectorAll(`[aria-labelledby="${labelledBy}"] .text-chip .locale-chip-body`)).map((chip) =>
      (chip.textContent ?? '').trim(),
    );

  describe('writing through the store', () => {
    it('should create the collection through the store and close only once the server has accepted it', async () => {
      fillValidForm();

      await component.onSubmit();

      expect(store.createCollection).toHaveBeenCalledWith({
        name: 'my-collection',
        collection: expect.objectContaining({ translationsFolder: './i18n', locales: ['en'], baseLocale: 'en' }),
      });
      expect(mockDialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-collection' }));
    });

    it('should render a taken-name refusal on the name field and keep the dialog open', async () => {
      store.createCollection.mockReturnValue(
        rejection(409, { message: 'Collection "my-collection" already exists', error: 'Conflict' }),
      );
      fillValidForm();

      await component.onSubmit();
      fixture.detectChanges();

      expect(mockDialogRef.close).not.toHaveBeenCalled();
      expect(component.saving()).toBe(false);
      expect(component.model.showNameConflict).toBe(true);
      expect(fixture.nativeElement.textContent).toContain('A collection named my-collection already exists.');
      expect(submitError()).toBeNull();

      component.model.form.controls.name.setValue('other');
      expect(component.model.showNameConflict).toBe(false);
      expect(component.model.form.controls.name.valid).toBe(true);
    });

    it('should stay open and show any other refusal above the buttons, keeping what was typed', async () => {
      store.createCollection.mockReturnValue(
        rejection(400, { message: 'collection.translationsFolder must be a string', error: 'Bad Request' }),
      );
      fillValidForm();

      await component.onSubmit();
      fixture.detectChanges();

      expect(mockDialogRef.close).not.toHaveBeenCalled();
      expect(submitError()).toBe('collection.translationsFolder must be a string');
      expect(component.model.form.controls.name.value).toBe('my-collection');
      expect(component.model.form.controls.name.valid).toBe(true);
    });

    it('should fall back to the create-failed text for a refusal without a message', async () => {
      store.createCollection.mockReturnValue(rejection(500, { error: 'Internal Server Error' }));
      fillValidForm();

      await component.onSubmit();
      fixture.detectChanges();

      expect(submitError()).toBe('Failed to create collection');
    });

    it('should clear the previous refusal and disable the button while the next submit is in flight', async () => {
      store.createCollection.mockReturnValueOnce(rejection(400, { message: 'nope', error: 'Bad Request' }));
      fillValidForm();
      await component.onSubmit();
      fixture.detectChanges();
      expect(submitError()).toBe('nope');

      await component.onSubmit();
      fixture.detectChanges();

      expect(submitError()).toBeNull();
      expect(mockDialogRef.close).toHaveBeenCalledTimes(1);
    });

    it('should clear a refusal on the next edit', async () => {
      store.createCollection.mockReturnValue(rejection(400, { message: 'nope', error: 'Bad Request' }));
      fillValidForm();
      await component.onSubmit();
      expect(component.model.submitError()).toBe('nope');

      component.model.form.controls.translationsFolder.setValue('./other');

      expect(component.model.submitError()).toBeNull();
    });

    it('should not let the dialog close while the write is in flight, and allow it again after a refusal', async () => {
      const write = new Subject<LingoTrackerConfigDto | null>();
      store.createCollection.mockReturnValue(write);
      fillValidForm();

      await component.onSubmit();
      fixture.detectChanges();

      expect(mockDialogRef.disableClose).toBe(true);
      expect(closeButtons().every((button) => button.disabled)).toBe(true);

      write.error(apiError(400, { message: 'nope', error: 'Bad Request' }));
      fixture.detectChanges();

      expect(mockDialogRef.disableClose).toBe(false);
      expect(closeButtons().some((button) => button.disabled)).toBe(false);
    });

    it('should ignore a second submit while the first is in flight', async () => {
      store.createCollection.mockReturnValue(new Subject<LingoTrackerConfigDto | null>());
      fillValidForm();

      await component.onSubmit();
      await component.onSubmit();

      expect(store.createCollection).toHaveBeenCalledTimes(1);
    });
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.model.isEditMode).toBe(false);
  });

  it('should toggle read-only from the switch and keep the user choice when the folder changes', () => {
    component.model.form.controls.translationsFolder.setValue('./node_modules/pkg/i18n');
    fixture.detectChanges();
    const toggle = el().querySelector<HTMLButtonElement>('mat-slide-toggle button');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-checked')).toBe('true');

    toggle?.click();
    fixture.detectChanges();
    expect(component.model.readOnly()).toBe(false);

    component.model.form.controls.translationsFolder.setValue('./node_modules/other/i18n');
    fixture.detectChanges();
    expect(component.model.readOnly()).toBe(false);
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
  });

  it('should add a pending locale when the input loses focus', () => {
    const input = el().querySelector<HTMLInputElement>('input[aria-describedby="locales-hint"]');
    expect(input).not.toBeNull();
    if (!input) return;
    input.value = 'es';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(component.model.locales()).toEqual(['es']);
  });

  it('should commit tags on Enter or comma, remove the last on Backspace, and commit a pending tag on blur', () => {
    component.model.toggleAdvanced();
    fixture.detectChanges();
    const input = el().querySelector<HTMLInputElement>('input[aria-describedby="tags-hint"]');
    expect(input).not.toBeNull();
    if (!input) return;

    input.value = ' Design System ';
    press(input, 'Enter');
    expect(input.value).toBe('');
    input.value = 'ui';
    press(input, ',');
    expect(chipTexts('tags-label')).toEqual(['design-system', 'ui']);

    press(input, 'Backspace');
    expect(chipTexts('tags-label')).toEqual(['design-system']);

    input.value = 'late';
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(chipTexts('tags-label')).toEqual(['design-system', 'late']);
  });

  it('should mark required fields touched instead of closing when submitted empty', async () => {
    await component.onSubmit();
    fixture.detectChanges();

    expect(component.model.form.controls.name.touched).toBe(true);
    expect(el().querySelector('#collection-name-error')).not.toBeNull();
    expect(el().querySelector('#collection-folder-error')).not.toBeNull();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should close dialog with result when form is valid and submitted', async () => {
    fillValidForm();

    await component.onSubmit();

    expect(mockDialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-collection',
        config: expect.objectContaining({ translationsFolder: './i18n', locales: ['en'], baseLocale: 'en' }),
      }),
    );
  });

  it('should send the exact create payload when nothing is set beyond the required fields', async () => {
    component.model.form.controls.name.setValue('my-collection');
    component.model.form.controls.translationsFolder.setValue('./i18n');

    await component.onSubmit();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      name: 'my-collection',
      config: {
        translationsFolder: './i18n',
        locales: [],
        readOnly: false,
        tags: [],
        protectedTermsFile: '',
      },
    });
  });

  it('should keep the protected terms editor hidden without a terms file', () => {
    component.model.toggleAdvanced();
    fixture.detectChanges();

    expect(el().querySelector('input[aria-describedby="protected-terms-hint"]')).toBeNull();
  });
});

describe('CollectionFormDialog — edit mode', () => {
  let fixture: ComponentFixture<CollectionFormDialog>;
  let component: CollectionFormDialog;
  let mockDialogRef: DialogRefMock;
  let mockDialog: DialogMock;
  let store: StoreMock;

  const editData: CollectionFormDialogData = {
    mode: 'edit',
    name: 'my-app',
    config: {
      translationsFolder: './i18n',
      baseLocale: 'en',
      locales: ['en', 'es', 'fr-ca'],
      protectedTerms: ['iPhone', 'Node.js'],
      protectedTermsFile: 'i18n/terms.json',
      protectedTermsFilePath: '/project/i18n/terms.json',
    },
  };

  beforeEach(async () => {
    mockDialog = { open: vi.fn() };

    ({ fixture, mockDialogRef, mockDialog, store } = buildHarness(editData, mockDialog));
    component = fixture.componentInstance;
  });

  it('should update the collection under its existing name through the store and close once accepted', async () => {
    await component.onSubmit();

    expect(store.updateCollection).toHaveBeenCalledWith('my-app', {
      name: undefined,
      collection: expect.objectContaining({ translationsFolder: './i18n', locales: ['en', 'es', 'fr-ca'] }),
    });
    expect(store.createCollection).not.toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-app' }));
  });

  it('should show a refusal above the buttons when the name is locked, so a conflict has no field to land on', async () => {
    store.updateCollection.mockReturnValue(rejection(409, { message: 'Collection "my-app" already exists' }));

    await component.onSubmit();
    fixture.detectChanges();

    expect(mockDialogRef.close).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="submit-error"] span')?.textContent,
    ).toContain('Collection "my-app" already exists');
  });

  it('should return protected terms and preserve the file pointer in the result config', async () => {
    component.model.addProtectedTerm('C++');
    await component.onSubmit();

    expect(mockDialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          protectedTerms: ['iPhone', 'Node.js', 'C++'],
          protectedTermsFile: 'i18n/terms.json',
        }),
      }),
    );
  });

  it('should show stored protected terms, add one on Enter, and drop the last on Backspace', () => {
    const chips = (): string[] =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          '[aria-labelledby="protected-terms-label"] .text-chip .locale-chip-body',
        ),
      ).map((chip) => (chip.textContent ?? '').trim());
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[aria-describedby="protected-terms-hint"]',
    );
    expect(chips()).toEqual(['iPhone', 'Node.js']);
    expect(input).not.toBeNull();
    if (!input) return;

    input.value = ' C++ ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    fixture.detectChanges();
    expect(chips()).toEqual(['iPhone', 'Node.js', 'C++']);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true }));
    fixture.detectChanges();
    expect(chips()).toEqual(['iPhone', 'Node.js']);
  });

  it('should open confirmation dialog when a pre-existing locale is removed on submit', async () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(false) });

    component.model.removeLocale(2);
    await component.onSubmit();

    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockDialog.open.mock.calls.at(-1)?.[1]).toEqual({
      data: {
        title: 'Remove locales',
        message: 'Removing locales: fr-ca. Their translation entries will be deleted. This cannot be undone.',
        confirmButtonText: 'Save',
        actionType: 'destructive',
      },
    });
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should close dialog with result after removal confirmation confirmed', async () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });

    component.model.removeLocale(2);
    await component.onSubmit();

    expect(mockDialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ locales: ['en', 'es'] }),
      }),
    );
  });

  it('should not open confirmation dialog when only adding a new locale on submit', async () => {
    component.model.addLocaleInput.setValue('de');
    component.model.addLocale();
    await component.onSubmit();

    expect(mockDialog.open).not.toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ locales: ['en', 'es', 'fr-ca', 'de'] }),
      }),
    );
  });

  it('should render the locale chips with the base locked and no remove control on it', () => {
    const el = fixture.nativeElement as HTMLElement;
    const chips = Array.from(el.querySelectorAll('.chip-list[aria-label] .locale-chip'));
    expect(chips).toHaveLength(3);
    expect(chips[0].classList).toContain('locale-chip--base');
    expect(chips[0].querySelector('.locale-chip-remove')).toBeNull();
    expect(chips[1].querySelector('.locale-chip-remove')).not.toBeNull();
  });
});

describe('CollectionFormDialog — edit mode with stored protected terms', () => {
  it('should render stored protected terms verbatim, one chip each, including untrimmed values', () => {
    const { fixture } = buildHarness({
      mode: 'edit',
      name: 'my-app',
      config: {
        translationsFolder: './i18n',
        baseLocale: 'en',
        locales: ['en'],
        protectedTerms: ['a', ' a', 'b'],
        protectedTermsFile: 'i18n/terms.json',
      },
    });

    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[aria-labelledby="protected-terms-label"] .text-chip'),
    ).toHaveLength(3);
  });
});
