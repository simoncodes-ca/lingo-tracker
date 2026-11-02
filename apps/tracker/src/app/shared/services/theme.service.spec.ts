import { PLATFORM_ID } from '@angular/core';
import { createServiceFactory, type SpectatorService } from '@ngneat/spectator/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_STORAGE } from '../storage/browser-storage';
import type { StorageAdapter } from '../storage/keyed-storage';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let spectator: SpectatorService<ThemeService>;
  let mockLocalStorage: Record<string, string>;
  let failingAdapter: StorageAdapter | undefined;
  /** The parts of `MediaQueryList` the service reads; `matches` stays writable so a test can flip it. */
  let mockMediaQueryList: {
    matches: boolean;
    media: string;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let mediaQueryListeners: Array<(event: MediaQueryListEvent) => void>;

  /**
   * Helper function to recreate the ThemeService with a fresh Spectator configuration.
   * Reduces boilerplate for tests that need to reinitialize the service.
   */
  const recreateService = (): void => {
    spectator = createService();
    service = spectator.service;
  };

  const createService = createServiceFactory({
    service: ThemeService,
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: LOCAL_STORAGE, useValue: () => failingAdapter ?? window.localStorage },
    ],
  });

  /**
   * Helper function to create a properly typed MediaQueryListEvent for testing.
   * @param matches - Whether the media query matches (true for dark mode preference)
   */
  const createMediaQueryListEvent = (matches: boolean): MediaQueryListEvent => {
    const changeEvent = new Event('change') as MediaQueryListEvent;
    Object.defineProperty(changeEvent, 'matches', { value: matches });
    return changeEvent;
  };

  beforeEach(() => {
    // Reset mocks
    mockLocalStorage = {};
    failingAdapter = undefined;
    mediaQueryListeners = [];

    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key];
      }),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock matchMedia
    mockMediaQueryList = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn((event: string, listener: (event: MediaQueryListEvent) => void) => {
        if (event === 'change') {
          mediaQueryListeners.push(listener);
        }
      }),
      removeEventListener: vi.fn(),
    };

    // A partial fake: the service never touches onchange, addListener or dispatchEvent.
    window.matchMedia = vi.fn(() => mockMediaQueryList as unknown as MediaQueryList);

    // Mock document.documentElement
    const mockRoot = {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
    Object.defineProperty(document, 'documentElement', {
      value: mockRoot,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be created', () => {
      recreateService();

      expect(service).toBeTruthy();
    });

    it('should initialize with system theme mode by default', () => {
      recreateService();

      expect(service.themeMode()).toBe('system');
    });

    it('should set up media query listener on initialization', () => {
      recreateService();

      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
      expect(mockMediaQueryList.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should load theme preference from localStorage on init', () => {
      mockLocalStorage['lingo-tracker-theme'] = 'dark';
      recreateService();

      expect(service.themeMode()).toBe('dark');
    });

    it('should apply theme on initialization', () => {
      recreateService();
      // Clear mocks so we're only testing this initialization.
      vi.clearAllMocks();
      spectator.flushEffects(); // Flush effects to ensure theme application runs

      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  describe('Theme Mode Management', () => {
    it('should set theme mode to light', () => {
      recreateService();
      service.setTheme('light');

      expect(service.themeMode()).toBe('light');
      expect(mockLocalStorage['lingo-tracker-theme']).toBe('light');
    });

    it('should set theme mode to dark', () => {
      recreateService();
      service.setTheme('dark');

      expect(service.themeMode()).toBe('dark');
      expect(mockLocalStorage['lingo-tracker-theme']).toBe('dark');
    });

    it('should set theme mode to system', () => {
      recreateService();
      service.setTheme('system');

      expect(service.themeMode()).toBe('system');
      expect(mockLocalStorage['lingo-tracker-theme']).toBe('system');
    });

    it('should persist theme preference to localStorage', () => {
      recreateService();
      service.setTheme('dark');

      expect(window.localStorage.setItem).toHaveBeenCalledWith('lingo-tracker-theme', 'dark');
    });
  });

  describe('Effective Theme Computation', () => {
    it('should return light when theme mode is light', () => {
      recreateService();
      service.setTheme('light');

      expect(service.effectiveTheme()).toBe('light');
    });

    it('should return dark when theme mode is dark', () => {
      recreateService();
      service.setTheme('dark');

      expect(service.effectiveTheme()).toBe('dark');
    });

    it('should return system theme when mode is system and system prefers light', () => {
      mockMediaQueryList.matches = false;
      recreateService();
      service.setTheme('system');

      expect(service.effectiveTheme()).toBe('light');
    });

    it('should return system theme when mode is system and system prefers dark', () => {
      mockMediaQueryList.matches = true;
      recreateService();

      expect(service.effectiveTheme()).toBe('dark');
    });
  });

  describe('System Theme Changes', () => {
    it('should update effective theme when system preference changes to dark', () => {
      recreateService();
      service.setTheme('system');
      expect(service.effectiveTheme()).toBe('light');

      // Simulate system theme change to dark
      const changeEvent = createMediaQueryListEvent(true);
      mediaQueryListeners.forEach((listener) => {
        listener(changeEvent);
      });

      expect(service.effectiveTheme()).toBe('dark');
    });

    it('should update effective theme when system preference changes to light', () => {
      mockMediaQueryList.matches = true;
      recreateService();
      service.setTheme('system');
      expect(service.effectiveTheme()).toBe('dark');

      // Simulate system theme change to light
      const changeEvent = createMediaQueryListEvent(false);
      mediaQueryListeners.forEach((listener) => {
        listener(changeEvent);
      });

      expect(service.effectiveTheme()).toBe('light');
    });

    it('should not affect explicit theme modes when system preference changes', () => {
      recreateService();
      service.setTheme('dark');
      expect(service.effectiveTheme()).toBe('dark');

      // Simulate system theme change
      const changeEvent = createMediaQueryListEvent(true);
      mediaQueryListeners.forEach((listener) => {
        listener(changeEvent);
      });

      // Should still be dark, not affected by system change
      expect(service.effectiveTheme()).toBe('dark');
    });
  });

  describe('Theme Application', () => {
    it('should apply light theme to document root', () => {
      recreateService();
      service.setTheme('light');
      spectator.flushEffects();

      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should apply dark theme to document root', () => {
      recreateService();
      service.setTheme('dark');
      spectator.flushEffects();

      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should remove old theme attribute before setting new one', () => {
      recreateService();
      const removeAttributeMock = document.documentElement.removeAttribute as ReturnType<typeof vi.fn>;
      const setAttributeMock = document.documentElement.setAttribute as ReturnType<typeof vi.fn>;

      service.setTheme('dark');
      spectator.flushEffects();

      expect(removeAttributeMock).toHaveBeenCalledWith('data-theme');
      expect(setAttributeMock).toHaveBeenCalledWith('data-theme', 'dark');

      // Verify that removeAttribute was called BEFORE setAttribute
      const removeCallOrder = removeAttributeMock.mock.invocationCallOrder[0];
      const setCallOrder = setAttributeMock.mock.invocationCallOrder[setAttributeMock.mock.calls.length - 1];
      expect(removeCallOrder).toBeLessThan(setCallOrder);
    });
  });

  describe('LocalStorage Error Handling', () => {
    it('should handle localStorage getItem errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      failingAdapter = {
        ...{ getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
        getItem: () => {
          throw new Error('Storage error');
        },
      };
      recreateService();

      expect(service.themeMode()).toBe('system'); // Should fall back to default
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle localStorage setItem errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      failingAdapter = {
        ...{ getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
        setItem: () => {
          throw new Error('Storage error');
        },
      };
      recreateService();

      service.setTheme('dark');

      expect(service.themeMode()).toBe('dark'); // Should still update in-memory
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should ignore invalid theme mode values from localStorage', () => {
      mockLocalStorage['lingo-tracker-theme'] = 'invalid-theme';
      recreateService();

      expect(service.themeMode()).toBe('system'); // Should fall back to default
    });
  });
});
