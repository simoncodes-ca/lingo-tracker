import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let mockLocalStorage: Record<string, string>;
  let mockMediaQueryList: MediaQueryList;
  let mediaQueryListeners: Array<(event: MediaQueryListEvent) => void>;

  /**
   * Helper function to recreate the ThemeService with fresh TestBed configuration.
   * Reduces boilerplate for tests that need to reinitialize the service.
   */
  const recreateService = (): void => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ThemeService, { provide: PLATFORM_ID, useValue: 'browser' }],
    });
    service = TestBed.inject(ThemeService);
  };

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
    } as unknown as MediaQueryList;

    window.matchMedia = vi.fn(() => mockMediaQueryList);

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

    TestBed.configureTestingModule({
      providers: [ThemeService, { provide: PLATFORM_ID, useValue: 'browser' }],
    });

    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with system theme mode by default', () => {
      expect(service.themeMode()).toBe('system');
    });

    it('should set up media query listener on initialization', () => {
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
      expect(mockMediaQueryList.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should load theme preference from localStorage on init', () => {
      mockLocalStorage['lingo-tracker-theme'] = 'dark';

      // Recreate service to trigger initialization
      recreateService();

      expect(service.themeMode()).toBe('dark');
    });

    it('should apply theme on initialization', () => {
      // Clear mocks and recreate service to ensure we're only testing this initialization
      vi.clearAllMocks();
      recreateService();
      TestBed.flushEffects(); // Flush effects to ensure theme application runs

      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  describe('Theme Mode Management', () => {
    it('should set theme mode to light', () => {
      service.setTheme('light');

      expect(service.themeMode()).toBe('light');
      expect(mockLocalStorage['lingo-tracker-theme']).toBe('light');
    });

    it('should set theme mode to dark', () => {
      service.setTheme('dark');

      expect(service.themeMode()).toBe('dark');
      expect(mockLocalStorage['lingo-tracker-theme']).toBe('dark');
    });

    it('should set theme mode to system', () => {
      service.setTheme('system');

      expect(service.themeMode()).toBe('system');
      expect(mockLocalStorage['lingo-tracker-theme']).toBe('system');
    });

    it('should persist theme preference to localStorage', () => {
      service.setTheme('dark');

      expect(window.localStorage.setItem).toHaveBeenCalledWith('lingo-tracker-theme', 'dark');
    });
  });

  describe('Effective Theme Computation', () => {
    it('should return light when theme mode is light', () => {
      service.setTheme('light');

      expect(service.effectiveTheme()).toBe('light');
    });

    it('should return dark when theme mode is dark', () => {
      service.setTheme('dark');

      expect(service.effectiveTheme()).toBe('dark');
    });

    it('should return system theme when mode is system and system prefers light', () => {
      mockMediaQueryList.matches = false;
      service.setTheme('system');

      expect(service.effectiveTheme()).toBe('light');
    });

    it('should return system theme when mode is system and system prefers dark', () => {
      mockMediaQueryList.matches = true;
      // Trigger the system theme detection
      recreateService();

      expect(service.effectiveTheme()).toBe('dark');
    });
  });

  describe('System Theme Changes', () => {
    it('should update effective theme when system preference changes to dark', () => {
      service.setTheme('system');
      expect(service.effectiveTheme()).toBe('light');

      // Simulate system theme change to dark
      const changeEvent = createMediaQueryListEvent(true);
      mediaQueryListeners.forEach((listener) => listener(changeEvent));

      expect(service.effectiveTheme()).toBe('dark');
    });

    it('should update effective theme when system preference changes to light', () => {
      mockMediaQueryList.matches = true;
      recreateService();
      service.setTheme('system');
      expect(service.effectiveTheme()).toBe('dark');

      // Simulate system theme change to light
      const changeEvent = createMediaQueryListEvent(false);
      mediaQueryListeners.forEach((listener) => listener(changeEvent));

      expect(service.effectiveTheme()).toBe('light');
    });

    it('should not affect explicit theme modes when system preference changes', () => {
      service.setTheme('dark');
      expect(service.effectiveTheme()).toBe('dark');

      // Simulate system theme change
      const changeEvent = createMediaQueryListEvent(true);
      mediaQueryListeners.forEach((listener) => listener(changeEvent));

      // Should still be dark, not affected by system change
      expect(service.effectiveTheme()).toBe('dark');
    });
  });

  describe('Theme Application', () => {
    it('should apply light theme to document root', () => {
      service.setTheme('light');
      TestBed.flushEffects();

      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('should apply dark theme to document root', () => {
      service.setTheme('dark');
      TestBed.flushEffects();

      expect(document.documentElement.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('should remove old theme attribute before setting new one', () => {
      const removeAttributeMock = document.documentElement.removeAttribute as ReturnType<typeof vi.fn>;
      const setAttributeMock = document.documentElement.setAttribute as ReturnType<typeof vi.fn>;

      service.setTheme('dark');
      TestBed.flushEffects();

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
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(undefined);
      window.localStorage.getItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      recreateService();

      expect(service.themeMode()).toBe('system'); // Should fall back to default
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should handle localStorage setItem errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(undefined);
      window.localStorage.setItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      service.setTheme('dark');

      expect(service.themeMode()).toBe('dark'); // Should still update in-memory
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should ignore invalid theme mode values from localStorage', () => {
      mockLocalStorage['lingo-tracker-theme'] = 'invalid-theme';

      recreateService();

      expect(service.themeMode()).toBe('system'); // Should fall back to default
    });
  });
});
