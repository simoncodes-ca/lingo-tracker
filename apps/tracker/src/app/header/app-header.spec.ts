import { Component } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { createComponentFactory, type Spectator } from '@ngneat/spectator/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';
import { ThemeService } from '../shared/services/theme.service';
import { AppHeader } from './app-header';

@Component({ standalone: true, template: '' })
class BlankRoute {}

describe('AppHeader', () => {
  let fixture: ComponentFixture<AppHeader>;
  let spectator: Spectator<AppHeader>;
  let router: Router;
  let theme: ThemeService;

  /** The three app controls, in visual order: language, appearance, settings. */
  const actions = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.toolbar-actions button'));
  const settingsButton = () => actions()[2];
  const themeButton = () => actions()[1];
  const iconOf = (button: HTMLElement | undefined) => button?.querySelector('mat-icon')?.textContent?.trim();

  const createComponent = createComponentFactory({
    component: AppHeader,
    imports: [getTranslocoTestingModule()],
    providers: [
      provideRouter([
        { path: 'settings', component: BlankRoute },
        { path: 'collections', component: BlankRoute },
      ]),
    ],
  });

  const navigate = async (url: string) => {
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    // ThemeService reads prefers-color-scheme on construction and the CDK
    // BreakpointObserver subscribes through the legacy addListener API; jsdom
    // has no matchMedia at all, so the stub has to answer both.
    window.matchMedia = vi.fn(
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    spectator = createComponent();
    fixture = spectator.fixture;
    router = spectator.inject(Router);
    theme = spectator.inject(ThemeService);
  });

  describe('settings button', () => {
    it('is live on another route', async () => {
      await navigate('/collections');

      const button = settingsButton();
      expect(button).toBeDefined();
      expect(button?.getAttribute('aria-disabled')).not.toBe('true');
      expect(button?.getAttribute('aria-current')).toBeNull();
    });

    it('goes inert on the settings page, where it has nothing to do', async () => {
      await navigate('/settings');

      const button = settingsButton();
      expect(button).toBeDefined();
      expect(button?.getAttribute('aria-disabled')).toBe('true');
      expect(button?.getAttribute('aria-current')).toBe('page');
    });

    it('stays focusable while inert, so keyboard users do not lose it', async () => {
      await navigate('/settings');

      // disabledInteractive keeps the control in the tab order and announces
      // aria-disabled, rather than removing it from the page for keyboard users.
      expect(settingsButton()?.disabled).toBe(false);
      expect(settingsButton()?.tabIndex).toBe(0);
    });

    it('becomes live again after navigating away', async () => {
      await navigate('/settings');
      await navigate('/collections');

      expect(settingsButton()?.getAttribute('aria-disabled')).not.toBe('true');
    });
  });

  describe('theme button', () => {
    it('wears the light icon when light is pinned', () => {
      theme.setTheme('light');
      fixture.detectChanges();

      expect(iconOf(themeButton())).toBe('light_mode');
    });

    it('wears the dark icon when dark is pinned', () => {
      theme.setTheme('dark');
      fixture.detectChanges();

      expect(iconOf(themeButton())).toBe('dark_mode');
    });

    it('wears the system icon on system, not the theme it resolves to', () => {
      theme.setTheme('system');
      fixture.detectChanges();

      expect(iconOf(themeButton())).toBe('computer');
    });

    it('names the selected mode, so system stays distinguishable from light', () => {
      theme.setTheme('system');
      fixture.detectChanges();

      expect(themeButton()?.getAttribute('aria-label')).toContain('System');
    });
  });
});
