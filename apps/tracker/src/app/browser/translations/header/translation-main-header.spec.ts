import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { NotificationService } from '../../../shared/notification';
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
  let notificationsSpy: {
    success: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let mockDialogRef: { afterClosed: ReturnType<typeof vi.fn> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    notificationsSpy = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    mockDialogRef = { afterClosed: vi.fn() };
    mockDialog = { open: vi.fn().mockReturnValue(mockDialogRef) };

    await TestBed.configureTestingModule({
      imports: [TranslationMainHeader, BrowserAnimationsModule, getTranslocoTestingModule()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notificationsSpy },
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

  describe('handleAddTranslation — success notification', () => {
    it('should show success notification when translation is created', async () => {
      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(3200);

      expect(notificationsSpy.success).toHaveBeenCalledWith('Resource created successfully');
    });

    it('should not show any notification when dialog is dismissed without success', async () => {
      mockDialogRef.afterClosed.mockReturnValue(of(undefined));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(3200);

      expect(notificationsSpy.success).not.toHaveBeenCalled();
      expect(notificationsSpy.warning).not.toHaveBeenCalled();
    });
  });

  describe('handleAddTranslation — skippedLocales warning notification', () => {
    it('should show warning notification after success when skippedLocales is present', async () => {
      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
        skippedLocales: ['fr', 'de'],
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();

      // Success notification fires immediately (synchronously in subscribe)
      expect(notificationsSpy.success).toHaveBeenCalledWith('Resource created successfully');

      // Warning notification fires after 3200ms
      await vi.advanceTimersByTimeAsync(3200);

      expect(notificationsSpy.warning).toHaveBeenCalledWith(
        'Auto-translation skipped for fr, de (ICU format not supported)',
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
      await vi.advanceTimersByTimeAsync(3200);

      expect(notificationsSpy.warning).toHaveBeenCalledWith(
        'Auto-translation skipped for es (ICU format not supported)',
      );
    });

    it('should not show warning notification when skippedLocales is an empty array', async () => {
      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
        skippedLocales: [],
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(3200);

      expect(notificationsSpy.warning).not.toHaveBeenCalled();
    });

    it('should not show warning notification when skippedLocales is absent', async () => {
      const result: TranslationEditorResult = {
        key: 'new_key',
        baseValue: 'New Value',
        folderPath: '',
        success: true,
      };
      mockDialogRef.afterClosed.mockReturnValue(of(result));

      component.handleAddTranslation();
      await vi.advanceTimersByTimeAsync(3200);

      expect(notificationsSpy.warning).not.toHaveBeenCalled();
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
      await vi.advanceTimersByTimeAsync(3200);

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
