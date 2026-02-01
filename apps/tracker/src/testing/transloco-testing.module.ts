import { TranslocoTestingModule, type TranslocoTestingOptions } from '@jsverse/transloco';

/**
 * Creates a configured TranslocoTestingModule for unit tests.
 *
 * This helper provides a consistent Transloco setup across all test specs,
 * including all required providers (TRANSLOCO_TRANSPILER, etc.) and preloaded translations.
 *
 * @param options - Optional Transloco testing configuration overrides
 * @returns Configured TranslocoTestingModule
 */
export function getTranslocoTestingModule(options: TranslocoTestingOptions = {}) {
  return TranslocoTestingModule.forRoot({
    langs: {
      en: {
        'browser.searchTranslations': 'Search (min 3 characters)...',
        'browser.clearSearch': 'Clear search',
        'browser.noResults': 'No results found',
        'browser.clickToLoad': 'click to load',
        'browser.filterFolders': 'Filter folders...',
        'browser.loadingTranslations': 'Loading translations...',
      },
    },
    translocoConfig: {
      availableLangs: ['en'],
      defaultLang: 'en',
    },
    preloadLangs: true,
    ...options,
  });
}
