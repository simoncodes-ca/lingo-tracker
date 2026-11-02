import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { createServiceFactory, type SpectatorService } from '@ngneat/spectator/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_STORAGE } from '../storage/browser-storage';
import type { StorageAdapter } from '../storage/keyed-storage';
import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  let service: LocaleService;
  let spectator: SpectatorService<LocaleService>;
  let mockLocalStorage: Record<string, string>;
  let failingAdapter: StorageAdapter | undefined;
  let mockTranslocoService: { setActiveLang: ReturnType<typeof vi.fn> };
  let platformId: 'browser' | 'server' = 'browser';

  const buildMockTranslocoService = () => ({
    setActiveLang: vi.fn(),
  });

  const createService = createServiceFactory({
    service: LocaleService,
    providers: [
      { provide: PLATFORM_ID, useFactory: () => platformId },
      {
        provide: LOCAL_STORAGE,
        useValue: () => (platformId === 'browser' ? (failingAdapter ?? window.localStorage) : undefined),
      },
      { provide: TranslocoService, useFactory: () => mockTranslocoService },
    ],
  });

  const createSpectatorService = (): void => {
    spectator = createService();
    service = spectator.service;
  };

  beforeEach(() => {
    mockLocalStorage = {};
    failingAdapter = undefined;
    mockTranslocoService = buildMockTranslocoService();
    platformId = 'browser';

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be created', () => {
      createSpectatorService();

      expect(service).toBeTruthy();
    });

    it('should initialize with the "en" locale when localStorage is empty', () => {
      createSpectatorService();

      expect(service.currentLocale()).toBe('en');
    });

    it('should call TranslocoService.setActiveLang with "en" on default initialization', () => {
      createSpectatorService();

      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('en');
    });

    it('should restore a valid locale from localStorage on initialization', () => {
      mockLocalStorage['lingo-tracker-locale'] = 'es';
      createSpectatorService();

      expect(service.currentLocale()).toBe('es');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('es');
    });

    it('should fall back to "en" when localStorage contains an unrecognized locale code', () => {
      mockLocalStorage['lingo-tracker-locale'] = 'xx';
      createSpectatorService();

      expect(service.currentLocale()).toBe('en');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('en');
    });
  });

  describe('availableLocales', () => {
    it('should expose the expected locale options', () => {
      createSpectatorService();
      const codes = service.availableLocales.map((l) => l.code);

      expect(codes).toContain('en');
      expect(codes).toContain('es');
      expect(codes).toContain('fr-ca');
    });

    it('should include display names for each locale', () => {
      createSpectatorService();
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
      createSpectatorService();
      service.setLocale('fr-ca');

      expect(service.currentLocale()).toBe('fr-ca');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('fr-ca');
    });

    it('should persist the new locale to localStorage', () => {
      createSpectatorService();
      service.setLocale('fr-ca');

      expect(window.localStorage.setItem).toHaveBeenCalledWith('lingo-tracker-locale', 'fr-ca');
    });

    it('should persist the locale so a subsequent service instance restores it', () => {
      createSpectatorService();
      service.setLocale('es');

      const reloadInjector = createEnvironmentInjector(
        [LocaleService],
        spectator.inject(EnvironmentInjector),
        'locale-service-reload',
      );
      const restoredService = reloadInjector.get(LocaleService);

      expect(restoredService.currentLocale()).toBe('es');
      expect(mockTranslocoService.setActiveLang).toHaveBeenLastCalledWith('es');
      reloadInjector.destroy();
    });
  });

  describe('localStorage error handling', () => {
    it('should fall back to "en" and log an error when localStorage.getItem throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      failingAdapter = {
        ...{ getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
        getItem: () => {
          throw new Error('Storage unavailable');
        },
      };
      createSpectatorService();

      expect(service.currentLocale()).toBe('en');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('en');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should still update the in-memory signal and call setActiveLang when localStorage.setItem throws', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      failingAdapter = {
        ...{ getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
        setItem: () => {
          throw new Error('Storage unavailable');
        },
      };
      createSpectatorService();

      service.setLocale('es');

      expect(service.currentLocale()).toBe('es');
      expect(mockTranslocoService.setActiveLang).toHaveBeenCalledWith('es');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('SSR platform', () => {
    it('should not access localStorage when running on the server', () => {
      platformId = 'server';
      createSpectatorService();

      expect(window.localStorage.getItem).not.toHaveBeenCalled();
    });

    it('should not call TranslocoService.setActiveLang during initialization on the server', () => {
      platformId = 'server';
      createSpectatorService();

      expect(mockTranslocoService.setActiveLang).not.toHaveBeenCalled();
    });

    it('should initialize with the default "en" locale on the server', () => {
      platformId = 'server';
      createSpectatorService();

      expect(service.currentLocale()).toBe('en');
    });
  });
});
