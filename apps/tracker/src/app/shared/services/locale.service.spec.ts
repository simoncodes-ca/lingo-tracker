import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranslocoService } from '@jsverse/transloco';
import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  let service: LocaleService;
  let mockLocalStorage: Record<string, string>;
  let mockTranslocoService: { setActiveLang: ReturnType<typeof vi.fn> };

  const buildMockTranslocoService = () => ({
    setActiveLang: vi.fn(),
  });

  const recreateService = (platformId: string = 'browser'): void => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        LocaleService,
        { provide: PLATFORM_ID, useValue: platformId },
        { provide: TranslocoService, useValue: mockTranslocoService },
      ],
    });
    service = TestBed.inject(LocaleService);
  };

  beforeEach(() => {
    mockLocalStorage = {};
    mockTranslocoService = buildMockTranslocoService();

    const localStorageMock = {
      getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
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

    TestBed.configureTestingModule({
      providers: [
        LocaleService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: TranslocoService, useValue: mockTranslocoService },
      ],
    });

    service = TestBed.inject(LocaleService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with the "en" locale when localStorage is empty', () => {
      expect(service.currentLocale()).toBe('en');
    });

    it('should call TranslocoService.setActiveLang with "en" on default initialization', () => {
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('en');
    });

    it('should restore a valid locale from localStorage on initialization', () => {
      mockLocalStorage['lingo-tracker-locale'] = 'es';

      recreateService();

      expect(service.currentLocale()).toBe('es');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('es');
    });

    it('should fall back to "en" when localStorage contains an unrecognized locale code', () => {
      mockLocalStorage['lingo-tracker-locale'] = 'xx';

      recreateService();

      expect(service.currentLocale()).toBe('en');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('en');
    });
  });

  describe('availableLocales', () => {
    it('should expose the expected locale options', () => {
      const codes = service.availableLocales.map((l) => l.code);

      expect(codes).toContain('en');
      expect(codes).toContain('es');
      expect(codes).toContain('fr-ca');
    });

    it('should include display names for each locale', () => {
      const english = service.availableLocales.find((l) => l.code === 'en');
      const spanish = service.availableLocales.find((l) => l.code === 'es');
      const frenchCanadian = service.availableLocales.find((l) => l.code === 'fr-ca');

      expect(english?.displayName).toBe('English');
      expect(spanish?.displayName).toBe('Español');
      expect(frenchCanadian?.displayName).toBe('Français (CA)');
    });
  });

  describe('setLocale', () => {
    it('should update the currentLocale signal and call TranslocoService.setActiveLang', () => {
      service.setLocale('fr-ca');

      expect(service.currentLocale()).toBe('fr-ca');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('fr-ca');
    });

    it('should persist the new locale to localStorage', () => {
      service.setLocale('fr-ca');

      expect(window.localStorage.setItem).toHaveBeenCalledWith('lingo-tracker-locale', 'fr-ca');
    });

    it('should persist the locale so a subsequent service instance restores it', () => {
      service.setLocale('es');

      recreateService();

      expect(service.currentLocale()).toBe('es');
    });
  });

  describe('localStorage error handling', () => {
    it('should fall back to "en" and log an error when localStorage.getItem throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      window.localStorage.getItem = vi.fn(() => {
        throw new Error('Storage unavailable');
      });

      recreateService();

      expect(service.currentLocale()).toBe('en');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('en');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should still update the in-memory signal and call setActiveLang when localStorage.setItem throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      window.localStorage.setItem = vi.fn(() => {
        throw new Error('Storage unavailable');
      });

      service.setLocale('es');

      expect(service.currentLocale()).toBe('es');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('es');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('SSR platform', () => {
    it('should not access localStorage when running on the server', () => {
      recreateService('server');
      vi.clearAllMocks();

      expect(window.localStorage.getItem).not.toHaveBeenCalled();
    });

    it('should not call TranslocoService.setActiveLang during initialization on the server', () => {
      // Rebuild mockTranslocoService fresh so its call count starts at zero after recreateService
      mockTranslocoService = buildMockTranslocoService();
      recreateService('server');

      expect(mockTranslocoService.setActiveLang).not.toHaveBeenCalled();
    });

    it('should initialize with the default "en" locale on the server', () => {
      recreateService('server');

      expect(service.currentLocale()).toBe('en');
    });
  });
});
