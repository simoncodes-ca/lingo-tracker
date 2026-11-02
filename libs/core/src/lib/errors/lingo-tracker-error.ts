import { type PreferredTermRule, type PreferredTermRuleError, TRANSLATION_STATUSES } from '@simoncodes-ca/domain';
import type { CollectionFolderProblem } from '../resource/collection-folders';
import type { ProviderErrorCode } from './error-codes';
import { defineError, LingoTrackerError } from './error-definition';
import { ErrorMessages, type FolderPathPart } from './error-messages';
import { formatRuleErrors } from './format-rule-errors';

export { type ErrorKind, LingoTrackerError } from './error-definition';

/** A source file could not be detected, read, or parsed before an import writes resources. */
export class ImportSourceError extends LingoTrackerError {
  static readonly code = 'IMPORT_SOURCE_ERROR' as const;
  declare readonly code: typeof ImportSourceError.code;
  readonly kind = 'internal' as const;
  /** `format` keeps the CLI's format-detection message free of the `Import failed:` prefix. */
  readonly stage: 'format' | 'source';
  constructor(message: string, options?: { readonly cause?: unknown; readonly stage?: 'format' | 'source' }) {
    super(message, ImportSourceError.code, options);
    this.stage = options?.stage ?? 'source';
  }
}

/**
 * `.lingo-tracker.json` cannot be used: a required field is missing or has the wrong shape, a
 * file pointer in it is not a string, or the file cannot be read or written. The message is
 * fixed text that names only `.lingo-tracker.json` and, for a shape problem, the field; it never
 * holds a path or an I/O detail, so an adapter can show it as is. An I/O failure is in `cause`.
 */
export class InvalidConfigError extends LingoTrackerError {
  static readonly code = 'INVALID_CONFIG' as const;
  declare readonly code: typeof InvalidConfigError.code;
  readonly kind = 'internal' as const;
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, InvalidConfigError.code, options);
  }
}

export type ProtectedTermsEditProblem =
  | 'protected-conflict'
  | 'protected-missing'
  | 'protected-file-path'
  | 'protected-replacement-conflict';

export type PreferredTerminologyEditProblem =
  | 'preferred-missing'
  | 'preferred-conflict'
  | 'preferred-remove-shape'
  | 'preferred-replacement-shape'
  | 'preferred-upsert-shape'
  | 'preferred-orphan-flags'
  | 'preferred-incomplete-flags';

export type CollectionTagEditProblem = 'tag-conflict' | 'tag-missing';

/** An address names a folder outside the collection policy, or one that cannot be accessed. */
export class InvalidCollectionFolderError extends LingoTrackerError {
  static readonly code = 'INVALID_COLLECTION_FOLDER' as const;
  declare readonly code: typeof InvalidCollectionFolderError.code;
  readonly kind = 'invalid' as const;
  constructor(
    readonly problem: CollectionFolderProblem,
    operation: 'access' | 'delete' | 'move' = 'access',
    targetPath = problem.folderPath,
  ) {
    const reason =
      targetPath === problem.folderPath ? problem.message : `Folder '${problem.folderPath}': ${problem.message}`;
    super(`Cannot ${operation} folder '${targetPath || '(root)'}': ${reason}`, InvalidCollectionFolderError.code);
  }
}

// --- Translation -------------------------------------------------------------

/**
 * A provider failure. `retryable` indicates whether retrying can help.
 * The provider code taxonomy remains independent of the adapter-facing kind.
 */
export class TranslationError extends LingoTrackerError {
  declare readonly code: ProviderErrorCode;
  readonly kind = 'upstream' as const;
  readonly retryable: boolean;
  readonly providerErrorCode: string | undefined;

  /** `code` names the failure kind, e.g. `MISSING_API_KEY`, `RATE_LIMIT`, `INVALID_REQUEST`. */
  constructor(message: string, code: ProviderErrorCode, retryable: boolean, providerErrorCode?: string) {
    super(message, code);
    this.retryable = retryable;
    this.providerErrorCode = providerErrorCode;
  }
}

/** A core operation failed with a CLI-visible message that the API has historically hidden. */
export class CoreOperationError extends LingoTrackerError {
  static readonly code = 'CORE_OPERATION_ERROR' as const;
  declare readonly code: typeof CoreOperationError.code;
  readonly kind = 'internal' as const;
  override readonly exposeMessage = false;

  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, CoreOperationError.code, options);
    // Some import summaries stringify a caught error; retain the old `Error: ...` text.
    this.name = 'Error';
  }
}

/** A bundle or token hierarchy cannot represent both a leaf and its descendants. */
export class BundleHierarchicalConflictError extends LingoTrackerError {
  static readonly code = 'BUNDLE_HIERARCHICAL_CONFLICT' as const;
  declare readonly code: typeof BundleHierarchicalConflictError.code;
  readonly kind = 'invalid' as const;
  constructor(
    readonly bundleKey: string,
    readonly conflicts: readonly string[],
  ) {
    super(
      `Hierarchical conflicts in bundle '${bundleKey}': ${conflicts.join(', ')}. ` +
        `Remove the entry or its children from bundle '${bundleKey}'; for token collisions, rename one of the keys.`,
      BundleHierarchicalConflictError.code,
    );
  }
}

/** An import strategy cannot write to the collection's base locale. */
// Before kind mapping this class used the typed fallback: 500 with its message.
export class InvalidImportLocaleError extends defineError(
  'INVALID_IMPORT_LOCALE',
  'internal',
  (baseLocale: string, strategy: string) => ({
    message:
      `Cannot import into base locale "${baseLocale}" with strategy "${strategy}". ` +
      'Only "migration" strategy supports base locale imports.',
  }),
) {}

/** A whole-collection run requiring one source language found different base locales. */
export class CollectionBaseLocaleMismatchError extends defineError(
  'COLLECTION_BASE_LOCALE_MISMATCH',
  'invalid',
  (collections: readonly { name: string; baseLocale: string }[]) => ({
    message: ErrorMessages.collectionBaseLocaleMismatch(collections),
    collections,
  }),
) {}

/** A glossary needs at least one opened collection. */
export class GlossaryNoCollectionsError extends defineError('GLOSSARY_NO_COLLECTIONS', 'internal', () => ({
  message: ErrorMessages.glossaryNoCollections(),
})) {}

/** The requested glossary extraction mode is unavailable. */
export class GlossaryExtractorError extends defineError('GLOSSARY_EXTRACTOR_ERROR', 'internal', (mode: string) => ({
  message: ErrorMessages.glossaryExtractorUnavailable(mode),
  mode,
})) {}

// --- Config ------------------------------------------------------------------

/** `.lingo-tracker.json` does not exist in the directory that was searched. */
export class ConfigNotFoundError extends defineError('CONFIG_NOT_FOUND', 'internal', (configPath: string) => ({
  message: `${ErrorMessages.configNotFound()}: ${configPath}`,
  configPath,
})) {}

/** `.lingo-tracker.json` exists but is not a JSON object. `reason` is the parser's message. */
export class ConfigParseError extends defineError(
  'CONFIG_PARSE_FAILED',
  'internal',
  (configPath: string, reason: string) => ({
    message: ErrorMessages.jsonParseFailed(configPath, reason),
    configPath,
    reason,
  }),
) {}

/** A config writer's source snapshot no longer matches the file on disk. */
export class ConfigChangedError extends defineError('CONFIG_CHANGED', 'conflict', () => ({
  message: 'The configuration file changed after it was read; run the command again',
})) {}

/**
 * A protected-terms file exists but cannot be used: it is not valid JSON, or not a JSON array of
 * strings. A corrupt list is an error, not an empty list, so it never protects nothing silently.
 */
export class ProtectedTermsFileError extends defineError(
  'INVALID_PROTECTED_TERMS_FILE',
  'internal',
  (filePath: string, message: string) => ({
    message,
    filePath,
  }),
) {}

/** A Project Terms edit has missing or conflicting options. */
export class InvalidProjectTermsEditError extends defineError(
  'INVALID_PROJECT_TERMS_EDIT',
  'invalid',
  (message: string, problem: ProtectedTermsEditProblem | PreferredTerminologyEditProblem) => ({
    message,
    problem,
  }),
) {}

// --- Collections -------------------------------------------------------------

/** The config has no collection with this name. */
export class CollectionNotFoundError extends defineError(
  'COLLECTION_NOT_FOUND',
  'not-found',
  (collectionName: string, role: 'source' | 'destination' = 'source') => ({
    message:
      role === 'destination'
        ? `Destination collection "${collectionName}" not found`
        : ErrorMessages.collectionNotFound(collectionName),
    collectionName,
  }),
) {}

/** A collection with this name is already registered (add, or rename onto it). */
export class CollectionAlreadyExistsError extends defineError(
  'COLLECTION_ALREADY_EXISTS',
  'conflict',
  (collectionName: string) => ({
    message: ErrorMessages.collectionAlreadyExists(collectionName),
    collectionName,
  }),
) {}

/** Removing this collection would leave one or more bundles empty. */
export class CollectionRequiredByBundleError extends defineError(
  'COLLECTION_REQUIRED_BY_BUNDLE',
  'conflict',
  (collectionName: string, bundleNames: readonly string[]) => ({
    message: ErrorMessages.collectionRequiredByBundles(collectionName, bundleNames),
    collectionName,
    bundleNames,
  }),
) {}

/** A rename target already appears in explicit bundle references. */
export class CollectionRenameBundleConflictError extends defineError(
  'COLLECTION_RENAME_BUNDLE_CONFLICT',
  'conflict',
  (collectionName: string, newCollectionName: string, bundleNames: readonly string[]) => ({
    message: ErrorMessages.collectionRenameBundleConflict(collectionName, newCollectionName, bundleNames),
    collectionName,
    newCollectionName,
    bundleNames,
  }),
) {}

/** A mutating operation was asked of a collection flagged `readOnly`. */
export class ReadOnlyCollectionError extends defineError(
  'COLLECTION_READ_ONLY',
  'forbidden',
  (collectionName: string) => ({
    message: ErrorMessages.collectionReadOnly(collectionName),
    collectionName,
  }),
) {}

/** A collection record cannot be stored as given (for example a blank `translationsFolder`). */
export class InvalidCollectionError extends defineError(
  'INVALID_COLLECTION',
  'invalid',
  (
    message: string,
    options?: { readonly field?: string; readonly problem?: CollectionTagEditProblem },
  ): { message: string; field?: string; problem?: CollectionTagEditProblem } => ({
    message,
    /** The field with a shape error, when validation identifies one. */
    field: options?.field,
    problem: options?.problem,
  }),
) {}

/** A supplied rename target is blank after trimming. */
export class InvalidNameError extends defineError('INVALID_NAME', 'invalid', () => ({
  message: ErrorMessages.nameRequired(),
})) {}

/** Terms were given for a collection that has no `protectedTermsFile` pointer to write them to. */
export class ProtectedTermsFileNotSetError extends defineError(
  'PROTECTED_TERMS_FILE_NOT_SET',
  'invalid',
  (collectionName: string) => ({
    message: ErrorMessages.protectedTermsFileNotSet(collectionName),
    collectionName,
  }),
) {}

/** A terminology file cannot be written because its parent directory does not exist. */
export class ParentDirectoryMissingError extends defineError(
  'PARENT_DIRECTORY_MISSING',
  'invalid',
  (what: string, filePath: string, directory: string) => ({
    message: ErrorMessages.parentDirectoryMissing(what, directory),
    filePath,
    directory,
  }),
) {}

// --- Locales -----------------------------------------------------------------

/** An export base property name is empty or collides with a rich JSON field. */
export class InvalidExportBasePropertyNameError extends defineError(
  'INVALID_EXPORT_BASE_PROPERTY_NAME',
  'invalid',
  (message: string) => ({ message }),
) {}

/** A caller supplied a translation status outside the domain status list. */
export class InvalidTranslationStatusError extends defineError(
  'INVALID_TRANSLATION_STATUS',
  'invalid',
  (status: unknown) => ({
    message: `Invalid translation status "${String(status)}". Valid statuses: ${TRANSLATION_STATUSES.join(', ')}`,
  }),
) {}

/** The locale string is malformed. The message is the domain validator's text. */
export class InvalidLocaleError extends defineError('INVALID_LOCALE', 'invalid', (locale: string, message: string) => ({
  message,
  locale,
})) {}

/** The collection does not list this locale. */
export class LocaleNotFoundError extends defineError(
  'LOCALE_NOT_FOUND',
  'invalid',
  (locale: string, collectionName: string) => ({
    message: ErrorMessages.localeNotFound(locale, collectionName),
    locale,
    collectionName,
  }),
) {}

/** The collection already lists this locale. */
export class LocaleAlreadyExistsError extends defineError(
  'LOCALE_ALREADY_EXISTS',
  'invalid',
  (locale: string, collectionName: string) => ({
    message: ErrorMessages.localeAlreadyExists(locale, collectionName),
    locale,
    collectionName,
  }),
) {}

/** The base locale cannot be added to or removed from a collection. */
export class BaseLocaleImmutableError extends defineError('BASE_LOCALE_IMMUTABLE', 'invalid', (locale: string) => ({
  message: ErrorMessages.cannotModifyBaseLocale(locale),
  locale,
})) {}

// --- Resources and folders ---------------------------------------------------

/** A supplied value wraps a placeholder in literal braces. Details contain every diagnostic. */
export class BracedPlaceholderError extends defineError(
  'BRACED_PLACEHOLDER',
  'invalid',
  (locale: string, descriptions: readonly string[]) => ({
    message: `Value for locale "${locale}" is not valid: ${descriptions[0]}`,
    locale,
    details: descriptions,
  }),
) {}

/** The resource key (or its target folder) is malformed. The message is the domain validator's text. */
export class InvalidResourceKeyError extends defineError(
  'INVALID_RESOURCE_KEY',
  'invalid',
  (key: string, message: string) => ({
    message,
    key,
  }),
) {}

/** The supplied base value is empty or contains only whitespace. */
export class InvalidBaseValueError extends defineError('INVALID_BASE_VALUE', 'invalid', (key: string) => ({
  message: 'Base value must not be empty.',
  key,
})) {}

/** No resource exists at this (resolved) key. */
export class ResourceNotFoundError extends defineError('RESOURCE_NOT_FOUND', 'not-found', (key: string) => ({
  message: ErrorMessages.resourceNotFound(key),
  key,
})) {}

/** A resource already exists at this (resolved) key, and the operation does not overwrite it. */
export class ResourceAlreadyExistsError extends defineError('RESOURCE_ALREADY_EXISTS', 'conflict', (key: string) => ({
  message: ErrorMessages.resourceAlreadyExists(key),
  key,
})) {}

/** No folder exists at this dot-delimited path (or the path is not a directory). */
export class FolderNotFoundError extends defineError('FOLDER_NOT_FOUND', 'not-found', (folderPath: string) => ({
  message: ErrorMessages.folderNotFound(folderPath),
  folderPath,
})) {}

/** A folder move names a destination inside the folder being moved. */
export class FolderMoveIntoDescendantError extends defineError(
  'FOLDER_MOVE_INTO_DESCENDANT',
  'invalid',
  (sourceFolderPath: string, destinationFolderPath: string) => ({
    message: ErrorMessages.folderMoveIntoDescendant(sourceFolderPath, destinationFolderPath),
    sourceFolderPath,
    destinationFolderPath,
  }),
) {}

/** A segment of a dot-delimited folder path is malformed. */
export class InvalidFolderPathError extends defineError(
  'INVALID_FOLDER_PATH',
  'invalid',
  (part: FolderPathPart, segment: string) => ({
    message: ErrorMessages.invalidFolderSegment(part, segment),
    part,
    segment,
  }),
) {}

/** An auto-translate operation was asked of a collection whose translation config is missing or disabled. */
export class AutoTranslationDisabledError extends defineError(
  'AUTO_TRANSLATION_DISABLED',
  'unavailable',
  (collectionName: string) => ({
    message: ErrorMessages.autoTranslationDisabled(collectionName),
    collectionName,
  }),
) {}

/** An enabled collection has no target locales for a locale run. */
export class NoTranslationTargetLocalesError extends defineError(
  'NO_TRANSLATION_TARGET_LOCALES',
  'invalid',
  (baseLocale: string) => ({
    message: `No target locales configured. Add locales other than the base locale "${baseLocale}".`,
  }),
) {}

/** A collection's base locale is not a translation target. */
export class CannotTranslateBaseLocaleError extends defineError(
  'CANNOT_TRANSLATE_BASE_LOCALE',
  'invalid',
  (locale: string) => ({
    message: ErrorMessages.cannotTranslateBaseLocale(locale),
    locale,
  }),
) {}

/** The requested translation target is not configured for this collection. */
export class TranslationLocaleNotConfiguredError extends defineError(
  'TRANSLATION_LOCALE_NOT_CONFIGURED',
  'invalid',
  (
    locale: string,
    availableLocales: readonly string[],
  ): { message: string; locale: string; availableLocales: readonly string[] } => ({
    message: ErrorMessages.translationLocaleNotConfigured(locale, availableLocales),
    locale,
    availableLocales: [...availableLocales],
  }),
) {}

// --- Bundles -----------------------------------------------------------------

/** A constant-name override was supplied for more than one bundle. */
export class MultipleBundleConstantNameError extends defineError('MULTIPLE_BUNDLE_CONSTANT_NAME', 'internal', () => ({
  message: 'A token constant name override needs exactly one bundle.',
})) {}

/** The config has no bundle with this name. */
export class BundleNotFoundError extends defineError('BUNDLE_NOT_FOUND', 'not-found', (bundleName: string) => ({
  message: ErrorMessages.bundleNotFound(bundleName),
  bundleName,
})) {}

/** A bundle generation locale filter is malformed or names unconfigured project locales. */
export class InvalidBundleLocalesError extends defineError('INVALID_BUNDLE_LOCALES', 'invalid', (message: string) => ({
  message,
})) {}

/** A bundle with this name already exists (add, or rename onto it). */
export class BundleAlreadyExistsError extends defineError(
  'BUNDLE_ALREADY_EXISTS',
  'conflict',
  (bundleName: string) => ({
    message: ErrorMessages.bundleAlreadyExists(bundleName),
    bundleName,
  }),
) {}

/** A bundle key or definition failed validation. `errors` holds every problem found. */
export class InvalidBundleDefinitionError extends defineError(
  'INVALID_BUNDLE_DEFINITION',
  'invalid',
  (errors: readonly string[]) => ({
    message: ErrorMessages.invalidBundleDefinition(errors),
    errors,
    details: errors,
  }),
) {}

/** Invalid preferred-terminology rules. Validation leaves the file untouched. */
export class PreferredTerminologyValidationError extends defineError(
  'INVALID_PREFERRED_TERMINOLOGY',
  'invalid',
  (
    errors: PreferredTermRuleError[],
    submittedRules?: readonly PreferredTermRule[],
  ): {
    message: string;
    errors: PreferredTermRuleError[];
    details: readonly PreferredTermRuleError[];
    submittedRules?: readonly PreferredTermRule[];
  } => ({
    message: `Invalid preferred terminology rules: ${formatRuleErrors(errors)}`,
    errors,
    details: errors,
    submittedRules,
  }),
) {}

/** TranslationError is registered separately because its provider-code taxonomy stays open. */
export const PROVIDER_ERROR_CATALOGUE = {
  error: TranslationError,
  codes: [
    'AUTH_ERROR',
    'INVALID_REQUEST',
    'INVALID_REQUEST_TIMEOUT',
    'INVALID_RESPONSE',
    'MISSING_API_KEY',
    'RATE_LIMIT',
    'SERVER_ERROR',
    'TIMEOUT',
    'UNKNOWN_PROVIDER',
  ] as const,
} as const;
