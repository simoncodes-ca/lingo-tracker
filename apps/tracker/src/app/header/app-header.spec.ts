import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppHeader } from './app-header';
import { ThemeService } from '../shared/services/theme.service';
import { getTranslocoTestingModule } from '../../testing/transloco-testing.module';

@Component({ standalone: true, template: '' })
class BlankRoute {}

describe('AppHeader', () => {
  let fixture: ComponentFixture<AppHeader>;
  let router: Router;
  let theme: ThemeService;

  /** The three app controls, in visual order: language, appearance, settings. */
  const actions = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.toolbar-actions button'));
  const settingsButton = () => actions()[2];
  const themeButton = () => actions()[1];
  const iconOf = (button: HTMLElement | undefined) => button?.querySelector('mat-icon')?.textContent?.trim();

  const navigate = async (url: string) => {
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    // ThemeService reads prefers-color-scheme on construction; jsdom has no matchMedia.
    window.matchMedia = vi.fn(
      () =>
        ({
          matches: false,
          media: '(prefers-color-scheme: dark)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    await TestBed.configureTestingModule({
      imports: [AppHeader, NoopAnimationsModule, getTranslocoTestingModule()],
      providers: [
        provideRouter([
          { path: 'settings', component: BlankRoute },
          { path: 'collections', component: BlankRoute },
        ]),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    theme = TestBed.inject(ThemeService);
    fixture = TestBed.createComponent(AppHeader);
    fixture.detectChanges();
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
    it('wears the light icon in the light theme', () => {
      theme.setTheme('light');
      fixture.detectChanges();

      expect(iconOf(themeButton())).toBe('light_mode');
    });

    it('wears the dark icon in the dark theme', () => {
      theme.setTheme('dark');
      fixture.detectChanges();

      expect(iconOf(themeButton())).toBe('dark_mode');
    });

    it('shows the resolved theme on system rather than a third glyph', () => {
      theme.setTheme('system');
      fixture.detectChanges();

      expect(['light_mode', 'dark_mode']).toContain(iconOf(themeButton()));
      expect(iconOf(themeButton())).toBe(theme.effectiveTheme() === 'dark' ? 'dark_mode' : 'light_mode');
    });

    it('names the selected mode, so system stays distinguishable from light', () => {
      theme.setTheme('system');
      fixture.detectChanges();

      expect(themeButton()?.getAttribute('aria-label')).toContain('System');
    });
  });
});
