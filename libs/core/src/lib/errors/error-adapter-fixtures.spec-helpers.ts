import { ERROR_CATALOGUE, type ErrorCode, PROVIDER_ERROR_CODES } from './error-codes';
import { LingoTrackerError, TranslationError } from './lingo-tracker-error';

/** Test fixtures for adapter contracts; ordinary constructors share sample string arguments. */
export function errorAdapterFixtures(): LingoTrackerError[] {
  const args: Readonly<Partial<Record<ErrorCode, readonly unknown[]>>> = {
    IMPORT_SOURCE_ERROR: ['Sample failure'],
    INVALID_CONFIG: ['Sample failure'],
    CORE_OPERATION_ERROR: ['Sample failure'],
    INVALID_COLLECTION: ['Sample failure', { field: 'name', problem: 'tag-conflict' }],
    BRACED_PLACEHOLDER: ['en', ['first', 'second']],
    BUNDLE_HIERARCHICAL_CONFLICT: ['main', ['a.b']],
    COLLECTION_REQUIRED_BY_BUNDLE: ['main', ['web']],
    COLLECTION_RENAME_BUNDLE_CONFLICT: ['main', 'next', ['web']],
    COLLECTION_BASE_LOCALE_MISMATCH: [
      [
        { name: 'main', baseLocale: 'en' },
        { name: 'other', baseLocale: 'fr' },
      ],
    ],
    INVALID_BUNDLE_DEFINITION: [['first', 'second']],
    INVALID_PREFERRED_TERMINOLOGY: [
      [{ index: 0, field: 'preferred', code: 'empty', message: 'required' }],
      [{ discouraged: 'old', preferred: '' }],
    ],
    INVALID_COLLECTION_FOLDER: [{ kind: 'unreadable', folderPath: 'a', absolutePath: '/project/a', message: 'denied' }],
    TRANSLATION_LOCALE_NOT_CONFIGURED: ['ja', ['en', 'fr']],
    GLOSSARY_EXTRACTOR_ERROR: ['ai'],
    INVALID_PROJECT_TERMS_EDIT: ['Sample failure', 'protected-missing'],
  };
  return [
    ...Object.values(ERROR_CATALOGUE).map((ErrorClass) => {
      const error: unknown = Reflect.construct(ErrorClass, args[ErrorClass.code] ?? ['sample', 'sample', 'sample']);
      if (!(error instanceof LingoTrackerError)) throw new Error(`Invalid fixture for ${ErrorClass.code}`);
      return error;
    }),
    ...PROVIDER_ERROR_CODES.map((code) => new TranslationError('Provider said no', code, false)),
  ];
}
