import { isPlatformBrowser } from '@angular/common';
import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { LOCAL_STORAGE } from '../storage/browser-storage';
import { KeyedStorage, raw } from '../storage/keyed-storage';

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

  private readonly storage = new KeyedStorage<LocaleCode>(
    inject(LOCAL_STORAGE),
    LOCALE_STORAGE_KEY,
    raw<LocaleCode>((value) => (this.#isValidLocale(value) ? value : undefined)),
  );

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
    const locale = this.storage.read() ?? DEFAULT_LOCALE;
    this.currentLocale.set(locale);
    this.#transloco.setActiveLang(locale);
  }

  #saveLocalePreference(code: LocaleCode): void {
    this.storage.write(code);
  }

  #isValidLocale(value: string): value is LocaleCode {
    return VALID_LOCALE_CODES.has(value);
  }
}
