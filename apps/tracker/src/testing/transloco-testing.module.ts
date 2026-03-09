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
        'browser.translationEditor.editTitle': 'Edit Translation',
        'browser.translationEditor.createTitle': 'Create Translation',
        'browser.translationEditor.editSubtitle': 'Update translation values and metadata',
        'browser.translationEditor.createSubtitle': 'Add a new translation entry to your collection',
        'browser.translationEditor.updateButton': 'Update Translation',
        'browser.translationEditor.saveButton': 'Save Translation',
        'browser.translationEditor.keyRequired': 'Translation key is required',
        'browser.translationEditor.keyPatternError': 'Only letters, numbers, underscores, and hyphens allowed',
        'browser.translationEditor.keyCopied': 'Similar resource key copied',
        'browser.translationEditor.copyFailed': 'Failed to copy',
        'browser.translationEditor.commentConfirm.title': 'No Comment Added',
        'browser.translationEditor.commentConfirm.message':
          'Comments help other translators understand context. Are you sure you want to save without a comment?',
        'browser.translationEditor.commentConfirm.saveAnyway': 'Save Anyway',
        'browser.translationEditor.commentConfirm.addComment': 'Add Comment',
        'browser.translationEditor.conflict.title': 'Translation Key Already Exists',
        'browser.translationEditor.conflict.messageX':
          'The translation key "{{ key }}" already exists in this collection. Would you like to edit the existing translation or choose a different key?',
        'browser.translationEditor.conflict.editExisting': 'Edit Existing',
        'browser.translationEditor.conflict.chooseDifferentKey': 'Choose Different Key',
        'browser.translationEditor.error.missingResource': 'Cannot update: resource data is missing',
        'browser.translationEditor.error.keyRenamingNotSupported':
          'Key renaming is not yet supported. Please use the same key or create a new resource.',
        'browser.translationEditor.error.notFound': 'Resource not found. It may have been deleted.',
        'browser.translationEditor.error.invalidRequest': 'Invalid request',
        'browser.translationEditor.error.createFailed': 'Failed to create translation',
        'browser.translationEditor.error.updateFailed': 'Failed to update translation',
        'browser.translationEditor.error.unexpected': 'An unexpected error occurred',
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
