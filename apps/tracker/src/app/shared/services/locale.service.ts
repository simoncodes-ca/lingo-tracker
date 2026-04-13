import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';

export type LocaleCode = 'en' | 'es' | 'fr-ca' | 'ru' | 'ja' | 'de';

export interface LocaleOption {
  readonly code: LocaleCode;
  readonly displayName: string;
}

const LOCALE_STORAGE_KEY = 'lingo-tracker-locale';
const DEFAULT_LOCALE: LocaleCode = 'en';

const AVAILABLE_LOCALES: readonly LocaleOption[] = [
  { code: 'en', displayName: 'English' },
  { code: 'es', displayName: 'Español' },
  { code: 'fr-ca', displayName: 'Français (CA)' },
  { code: 'ru', displayName: 'Русский' },
  { code: 'ja', displayName: '日本語' },
  { code: 'de', displayName: 'Deutsch' },
] as const;

const VALID_LOCALE_CODES = new Set<string>(AVAILABLE_LOCALES.map((l) => l.code));

@Injectable({
  providedIn: 'root',
})
export class LocaleService {
  readonly #platformId = inject(PLATFORM_ID);
  readonly #isBrowser = isPlatformBrowser(this.#platformId);
  readonly #transloco = inject(TranslocoService);

  readonly currentLocale = signal<LocaleCode>(DEFAULT_LOCALE);
  readonly availableLocales: readonly LocaleOption[] = AVAILABLE_LOCALES;

  constructor() {
    if (this.#isBrowser) {
      this.#loadLocalePreference();
    }
  }

  setLocale(code: LocaleCode): void {
    this.currentLocale.set(code);
    this.#transloco.setActiveLang(code);
    this.#saveLocalePreference(code);
  }

  #loadLocalePreference(): void {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      const locale = stored && this.#isValidLocale(stored) ? stored : DEFAULT_LOCALE;
      this.currentLocale.set(locale);
      this.#transloco.setActiveLang(locale);
    } catch (error) {
      console.error('Failed to load locale preference:', error);
      this.#transloco.setActiveLang(DEFAULT_LOCALE);
    }
  }

  #saveLocalePreference(code: LocaleCode): void {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, code);
    } catch (error) {
      console.error('Failed to save locale preference:', error);
    }
  }

  #isValidLocale(value: string): value is LocaleCode {
    return VALID_LOCALE_CODES.has(value);
  }
}
