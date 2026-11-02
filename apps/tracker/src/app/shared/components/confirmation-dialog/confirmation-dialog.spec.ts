import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './confirmation-dialog';
import type { ConfirmationDialogData } from './confirmation-dialog-data';

describe('ConfirmationDialog', () => {
  let component: ConfirmationDialog;
  let spectator: Spectator<ConfirmationDialog>;
  let mockDialogRef: Partial<MatDialogRef<ConfirmationDialog>>;
  /** The dialog only calls `translate` for its default button labels. */
  let mockTransloco: { translate: ReturnType<typeof vi.fn<(key: string) => string>> };

  const defaultData: ConfirmationDialogData = {
    title: 'Test Title',
    message: 'Test Message',
  };

  const dialogData: ConfirmationDialogData = { ...defaultData };

  const createComponent = createComponentFactory({
    component: ConfirmationDialog,
    componentProviders: [
      { provide: MAT_DIALOG_DATA, useValue: dialogData },
      { provide: MatDialogRef, useFactory: () => mockDialogRef },
      { provide: TranslocoService, useFactory: () => mockTransloco },
    ],
    detectChanges: false,
  });

  const render = (data: ConfirmationDialogData): void => {
    dialogData.confirmButtonText = undefined;
    dialogData.cancelButtonText = undefined;
    dialogData.actionType = undefined;
    Object.assign(dialogData, data);
    spectator = createComponent();
    component = spectator.component;
    spectator.detectChanges();
  };

  beforeEach(() => {
    mockDialogRef = {
      close: vi.fn(),
    };

    const translateFn = vi.fn((key: string) => {
      const translations: Record<string, string> = {
        'common.actions.ok': 'OK',
        'common.actions.cancel': 'Cancel',
      };
      return translations[key] || key;
    });

    mockTransloco = {
      translate: translateFn,
    };

    render(defaultData);
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should inject dialog data', () => {
      expect(component.data).toEqual(defaultData);
    });

    it('should inject dialog ref', () => {
      expect(component.dialogRef).toBeTruthy();
    });
  });

  describe('Button Text Getters', () => {
    it('should return custom confirm button text when provided', async () => {
      const customData: ConfirmationDialogData = {
        ...defaultData,
        confirmButtonText: 'Custom Confirm',
      };
      render(customData);

      expect(component.confirmButtonText).toBe('Custom Confirm');
    });

    it('should return default translated confirm button text when not provided', () => {
      expect(component.confirmButtonText).toBe('OK');
      expect(mockTransloco.translate).toHaveBeenCalledWith('common.actions.ok');
    });

    it('should return custom cancel button text when provided', async () => {
      const customData: ConfirmationDialogData = {
        ...defaultData,
        cancelButtonText: 'Custom Cancel',
      };
      render(customData);

      expect(component.cancelButtonText).toBe('Custom Cancel');
    });

    it('should return default translated cancel button text when not provided', () => {
      expect(component.cancelButtonText).toBe('Cancel');
      expect(mockTransloco.translate).toHaveBeenCalledWith('common.actions.cancel');
    });
  });

  describe('Action Type', () => {
    it('should return true for isDestructive when actionType is destructive', async () => {
      const destructiveData: ConfirmationDialogData = {
        ...defaultData,
        actionType: 'destructive',
      };
      render(destructiveData);

      expect(component.isDestructive).toBe(true);
    });

    it('should return false for isDestructive when actionType is standard', async () => {
      const standardData: ConfirmationDialogData = {
        ...defaultData,
        actionType: 'standard',
      };
      render(standardData);

      expect(component.isDestructive).toBe(false);
    });

    it('should return false for isDestructive when actionType is not provided', () => {
      expect(component.isDestructive).toBe(false);
    });
  });

  describe('Dialog Actions', () => {
    it('should close dialog with false when onCancel is called', () => {
      component.onCancel();

      expect(mockDialogRef.close).toHaveBeenCalledWith(false);
    });

    it('should close dialog with true when onConfirm is called', () => {
      component.onConfirm();

      expect(mockDialogRef.close).toHaveBeenCalledWith(true);
    });
  });
});
