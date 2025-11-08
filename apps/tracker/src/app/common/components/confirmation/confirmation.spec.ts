import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmationDialogComponent } from './confirmation';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConfirmationDialogData } from './confirmation-data';
import { vi, describe, it, expect, beforeEach, SpyInstance } from 'vitest';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

describe('ConfirmationDialogComponent', () => {
  let component: ConfirmationDialogComponent;
  let fixture: ComponentFixture<ConfirmationDialogComponent>;
  let compiled: DebugElement;
  let mockDialogRef: MatDialogRef<ConfirmationDialogComponent, boolean> & { close: SpyInstance };

  const mockDialogData: ConfirmationDialogData = {
    title: 'Test Title',
    message: 'Test Message',
    confirmText: 'Yes',
    cancelText: 'No'
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn()
    } as any;

    await TestBed.configureTestingModule({
      imports: [ConfirmationDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmationDialogComponent);
    component = fixture.componentInstance;
    compiled = fixture.debugElement;
    fixture.detectChanges();
  });
  
  describe('button interactions', () => {
    it('should close dialog with true when confirm button is clicked', () => {
      const confirmButton = compiled.query(By.css('button[color="primary"]'));
      confirmButton.nativeElement.click();

      expect(mockDialogRef.close).toHaveBeenCalledWith(true);
    });

    it('should close dialog with false when cancel button is clicked', () => {
      const buttons = compiled.queryAll(By.css('button'));
      const cancelButton = buttons[0];
      cancelButton.nativeElement.click();

      expect(mockDialogRef.close).toHaveBeenCalledWith(false);
    });
  });

  describe('data injection', () => {
    it('should have data property with injected dialog data', () => {
      expect(component.data).toBeDefined();
      expect(component.data.title).toBe('Test Title');
      expect(component.data.message).toBe('Test Message');
      expect(component.data.confirmText).toBe('Yes');
      expect(component.data.cancelText).toBe('No');
    });

    it('should handle missing optional button texts', async () => {
      const minimalData: ConfirmationDialogData = {
        title: 'Delete Item',
        message: 'This action cannot be undone.'
      };

      await TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ConfirmationDialogComponent],
        providers: [
          { provide: MatDialogRef, useValue: { close: vi.fn() } },
          { provide: MAT_DIALOG_DATA, useValue: minimalData }
        ]
      }).compileComponents();

      fixture = TestBed.createComponent(ConfirmationDialogComponent);
      component = fixture.componentInstance;

      expect(component.data.confirmText).toBeUndefined();
      expect(component.data.cancelText).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in text', async () => {
      const specialData: ConfirmationDialogData = {
        title: 'Delete "item" with @special & chars?',
        message: 'Are you sure? <script>alert("xss")</script>'
      };

      await TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ConfirmationDialogComponent],
        providers: [
          { provide: MatDialogRef, useValue: { close: vi.fn() } },
          { provide: MAT_DIALOG_DATA, useValue: specialData }
        ]
      }).compileComponents();

      fixture = TestBed.createComponent(ConfirmationDialogComponent);
      fixture.detectChanges();
      compiled = fixture.debugElement;

      const title = compiled.query(By.css('[mat-dialog-title]'));
      expect(title.nativeElement.textContent).toContain('Delete "item" with @special & chars?');
    });
  });
});
