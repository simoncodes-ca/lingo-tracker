import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing.module';
import { NotificationService } from '../../../shared/notification';
import { TranslationEditorLauncher } from '../../services/translation-editor-launcher';
import { BrowserStore } from '../../store/browser.store';
import { TranslationMainHeader } from './translation-main-header';

describe('TranslationMainHeader', () => {
  let component: TranslationMainHeader;
  let spectator: Spectator<TranslationMainHeader>;
  let notificationsSpy: {
    success: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let launcherSpy: { openCreate: ReturnType<typeof vi.fn> };

  const createComponent = createComponentFactory({
    component: TranslationMainHeader,
    imports: [getTranslocoTestingModule()],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: NotificationService, useFactory: () => notificationsSpy },
      { provide: TranslationEditorLauncher, useFactory: () => launcherSpy },
    ],
  });

  beforeEach(() => {
    notificationsSpy = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() };
    launcherSpy = { openCreate: vi.fn().mockResolvedValue({ kind: 'cancelled' }) };

    spectator = createComponent();
    component = spectator.component;

    // Enable fake timers after Spectator setup completes.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // The dialog, its outcome and the feedback belong to the launcher
  // (translation-editor-launcher.spec.ts); the header only asks for a create.
  it('should ask the launcher for a create', () => {
    component.handleAddTranslation();

    expect(launcherSpy.openCreate).toHaveBeenCalledTimes(1);
  });

  describe('handleDensityToggle — toggle animation', () => {
    it('should immediately set isDensityToggleFlipping to true', () => {
      component.handleDensityToggle();

      expect(component.isDensityToggleFlipping()).toBe(true);
    });

    it('should call store.setDensityMode with the opposite mode at the 125ms midpoint', async () => {
      const store = spectator.inject(BrowserStore);
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
      const store = spectator.inject(BrowserStore);
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
