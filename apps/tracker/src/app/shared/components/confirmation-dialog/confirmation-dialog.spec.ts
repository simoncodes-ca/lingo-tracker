import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfirmationDialog } from './confirmation-dialog';
import { ConfirmationDialogData } from './confirmation-dialog-data';

describe('ConfirmationDialog', () => {
  let component: ConfirmationDialog;
  let fixture: ComponentFixture<ConfirmationDialog>;
  let mockDialogRef: Partial<MatDialogRef<ConfirmationDialog>>;
  let mockTransloco: Partial<TranslocoService>;

  const defaultData: ConfirmationDialogData = {
    title: 'Test Title',
    message: 'Test Message',
  };

  const reconfigureTestBedWithData = async (
    data: ConfirmationDialogData
  ): Promise<void> => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ConfirmationDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ConfirmationDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(async () => {
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

    await TestBed.configureTestingModule({
      imports: [ConfirmationDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: defaultData },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: TranslocoService, useValue: mockTransloco },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmationDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
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
      await reconfigureTestBedWithData(customData);

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
      await reconfigureTestBedWithData(customData);

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
      await reconfigureTestBedWithData(destructiveData);

      expect(component.isDestructive).toBe(true);
    });

    it('should return false for isDestructive when actionType is standard', async () => {
      const standardData: ConfirmationDialogData = {
        ...defaultData,
        actionType: 'standard',
      };
      await reconfigureTestBedWithData(standardData);

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
