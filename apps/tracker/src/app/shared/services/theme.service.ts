import { Injectable, signal, computed, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'light' | 'dark' | 'system';
export type EffectiveTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'lingo-tracker-theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  // Current theme mode (user preference)
  readonly themeMode = signal<ThemeMode>('system');

  // System preference (tracked via media query)
  private readonly systemTheme = signal<EffectiveTheme>('light');

  // Effective theme (resolves 'system' to actual light/dark)
  readonly effectiveTheme = computed<EffectiveTheme>(() => {
    const mode = this.themeMode();
    if (mode === 'system') {
      return this.systemTheme();
    }
    return mode;
  });

  constructor() {
    if (this.isBrowser) {
      // Load theme preference from localStorage
      this.loadThemePreference();

      // Set up system theme detection
      this.setupSystemThemeListener();

      // Apply theme whenever effectiveTheme changes
      effect(() => {
        this.applyTheme(this.effectiveTheme());
      });
    }
  }

  /**
   * Set the theme mode
   */
  setTheme(mode: ThemeMode): void {
    this.themeMode.set(mode);
    this.saveThemePreference(mode);
  }

  /**
   * Load theme preference from localStorage
   */
  private loadThemePreference(): void {
    if (!this.isBrowser) return;

    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && this.isValidThemeMode(stored)) {
        this.themeMode.set(stored as ThemeMode);
      }
    } catch (error) {
      console.error('Failed to load theme preference:', error);
    }
  }

  /**
   * Save theme preference to localStorage
   */
  private saveThemePreference(mode: ThemeMode): void {
    if (!this.isBrowser) return;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  }

  /**
   * Apply theme by setting data-theme attribute on document root
   */
  private applyTheme(theme: EffectiveTheme): void {
    if (!this.isBrowser) return;

    const root = document.documentElement;

    // Remove existing theme classes/attributes
    root.removeAttribute('data-theme');

    // Set new theme
    root.setAttribute('data-theme', theme);
  }

  /**
   * Set up listener for system theme changes
   */
  private setupSystemThemeListener(): void {
    if (!this.isBrowser) return;

    // Get initial system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemTheme.set(mediaQuery.matches ? 'dark' : 'light');

    // Listen for changes
    mediaQuery.addEventListener('change', (event) => {
      this.systemTheme.set(event.matches ? 'dark' : 'light');
    });
  }

  /**
   * Type guard for theme mode validation
   */
  private isValidThemeMode(value: string): value is ThemeMode {
    return value === 'light' || value === 'dark' || value === 'system';
  }
}
