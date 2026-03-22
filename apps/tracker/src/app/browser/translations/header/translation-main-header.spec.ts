import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { TranslationMainHeader } from './translation-main-header';
import type { TranslationEditorResult } from '../../dialogs/translation-editor';
import { BrowserStore } from '../../store/browser.store';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';

describe('TranslationMainHeader', () => {
  let component: TranslationMainHeader;
  let fixture: ComponentFixture<TranslationMainHeader>;
  let snackBarSpy: { open: ReturnType<typeof vi.fn> };
  let mockDialogRef: { afterClosed: ReturnType<typeof vi.fn> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    snackBarSpy = { open: vi.fn() };
    mockDialogRef = { afterClosed: vi.fn() };
    mockDialog = { open: vi.fn().mockReturnValue(mockDialogRef) };

    await TestBed.configureTestingModule({
      imports: [TranslationMainHeader, BrowserAnimationsModule, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TranslationMainHeader);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Enable fake timers AFTER TestBed async setup completes
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('handleAddTranslation — success snackbar', () => {
    it('should show success snackbar when translation is created', async () => {
      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(2200);

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'Resource created successfully',
        '',
        expect.objectContaining({ duration: 2000 }),
      );
    });

    it('should not show any snackbar when dialog is dismissed without success', async () => {
      mockDialogRef.afterClosed.mockReturnValue(of(undefined));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(2200);

      expect(snackBarSpy.open).not.toHaveBeenCalled();
    });
  });

  describe('handleAddTranslation — skippedLocales warning snackbar', () => {
    it('should show warning snackbar after success when skippedLocales is present', async () => {
      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
        skippedLocales: ['fr', 'de'],
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();

      // Success snackbar fires immediately (synchronously in subscribe)
      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'Resource created successfully',
        '',
        expect.objectContaining({ duration: 2000 }),
      );

      // Warning snackbar fires after 2200ms
      await vi.advanceTimersByTimeAsync(2200);

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'Auto-translation skipped for fr, de (ICU format not supported)',
        'Dismiss',
        expect.objectContaining({
          duration: 6000,
          panelClass: ['warning-snackbar'],
        }),
      );
    });

    it('should show warning for a single skipped locale', async () => {
      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
        skippedLocales: ['es'],
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(2200);

      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'Auto-translation skipped for es (ICU format not supported)',
        'Dismiss',
        expect.objectContaining({
          duration: 6000,
          panelClass: ['warning-snackbar'],
        }),
      );
    });

    it('should not show warning snackbar when skippedLocales is an empty array', async () => {
      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
        skippedLocales: [],
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(2200);

      const warningCalls = snackBarSpy.open.mock.calls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('ICU format'),
      );
      expect(warningCalls).toHaveLength(0);
    });

    it('should not show warning snackbar when skippedLocales is absent', async () => {
      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(2200);

      const warningCalls = snackBarSpy.open.mock.calls.filter(
        (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('ICU format'),
      );
      expect(warningCalls).toHaveLength(0);
    });

    it('should reload the current folder before showing snackbars', async () => {
      const store = TestBed.inject(BrowserStore);
      const selectFolderSpy = vi.spyOn(store, 'selectFolder');

      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
        skippedLocales: ['fr'],
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(2200);

      expect(selectFolderSpy).toHaveBeenCalled();
    });
  });

  describe('handleDensityToggle — toggle animation', () => {
    it('should immediately set isDensityToggleFlipping to true', () => {
      component.handleDensityToggle();

      expect(component.isDensityToggleFlipping()).toBe(true);
    });

    it('should call store.setDensityMode with the opposite mode at the 125ms midpoint', async () => {
      const store = TestBed.inject(BrowserStore);
      const setDensityModeSpy = vi.spyOn(store, 'setDensityMode');

      // Initial density mode defaults to 'compact', so next mode should be 'full'
      component.handleDensityToggle();

      expect(setDensityModeSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(125);

      expect(setDensityModeSpy).toHaveBeenCalledWith('full');
    });

    it('should reset isDensityToggleFlipping to false after 250ms', async () => {
      component.handleDensityToggle();

      await vi.advanceTimersByTimeAsync(250);

      expect(component.isDensityToggleFlipping()).toBe(false);
    });

    it('should pass only the second call value to the store on rapid double-click', async () => {
      const store = TestBed.inject(BrowserStore);
      const setDensityModeSpy = vi.spyOn(store, 'setDensityMode');

      // First call (compact → full), cancelled before midpoint
      component.handleDensityToggle();
      await vi.advanceTimersByTimeAsync(50);

      // Second call while first is still pending — store.densityMode() is still 'compact'
      // so next mode is again 'full', but this also cancels the first mid-timeout
      component.handleDensityToggle();
      await vi.advanceTimersByTimeAsync(125);

      // Only the second call's scheduled timeout should have fired
      expect(setDensityModeSpy).toHaveBeenCalledTimes(1);
      expect(setDensityModeSpy).toHaveBeenCalledWith('full');
    });
  });
});
