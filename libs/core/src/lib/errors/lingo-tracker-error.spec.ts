import { describe, expect, it } from 'vitest';
import { ERROR_CATALOGUE, ERROR_CODES, PROVIDER_ERROR_CODES } from './error-codes';
import { ErrorMessages } from './error-messages';
import * as errorClasses from './internal';
import {
  AutoTranslationDisabledError,
  BaseLocaleImmutableError,
  BracedPlaceholderError,
  BundleAlreadyExistsError,
  BundleHierarchicalConflictError,
  BundleNotFoundError,
  CannotTranslateBaseLocaleError,
  CollectionAlreadyExistsError,
  CollectionBaseLocaleMismatchError,
  CollectionNotFoundError,
  CollectionRenameBundleConflictError,
  CollectionRequiredByBundleError,
  ConfigChangedError,
  ConfigNotFoundError,
  ConfigParseError,
  CoreOperationError,
  FolderMoveIntoDescendantError,
  FolderNotFoundError,
  GlossaryExtractorError,
  GlossaryNoCollectionsError,
  ImportSourceError,
  InvalidBaseValueError,
  InvalidBundleDefinitionError,
  InvalidBundleLocalesError,
  InvalidCollectionError,
  InvalidCollectionFolderError,
  InvalidConfigError,
  InvalidExportBasePropertyNameError,
  InvalidFolderPathError,
  InvalidImportLocaleError,
  InvalidLocaleError,
  InvalidNameError,
  InvalidProjectTermsEditError,
  InvalidResourceKeyError,
  InvalidTranslationStatusError,
  LingoTrackerError,
  LocaleAlreadyExistsError,
  LocaleNotFoundError,
  MultipleBundleConstantNameError,
  NoTranslationTargetLocalesError,
  ParentDirectoryMissingError,
  PreferredTerminologyValidationError,
  ProtectedTermsFileError,
  ProtectedTermsFileNotSetError,
  ReadOnlyCollectionError,
  ResourceAlreadyExistsError,
  ResourceNotFoundError,
  TranslationError,
  TranslationLocaleNotConfiguredError,
} from './lingo-tracker-error';

describe('LingoTrackerError subclasses', () => {
  it('keeps the string form of a former plain error for CLI summaries', () => {
    const error = new CoreOperationError('Failed to read file');
    expect(error.kind).toBe('internal');
    expect(error.exposeMessage).toBe(false);
    expect(String(error)).toBe('Error: Failed to read file');
  });

  const cases: ReadonlyArray<{ error: LingoTrackerError; name: string; code: string; message: string }> = [
    {
      error: new InvalidExportBasePropertyNameError('basePropertyName cannot be empty'),
      name: 'InvalidExportBasePropertyNameError',
      code: 'INVALID_EXPORT_BASE_PROPERTY_NAME',
      message: 'basePropertyName cannot be empty',
    },
    {
      error: new BracedPlaceholderError('en', ['braced']),
      name: 'BracedPlaceholderError',
      code: 'BRACED_PLACEHOLDER',
      message: 'Value for locale "en" is not valid: braced',
    },
    {
      error: new BundleHierarchicalConflictError('main', ['a.b']),
      name: 'BundleHierarchicalConflictError',
      code: 'BUNDLE_HIERARCHICAL_CONFLICT',
      message:
        "Hierarchical conflicts in bundle 'main': a.b. Remove the entry or its children from bundle 'main'; for token collisions, rename one of the keys.",
    },
    {
      error: new ConfigNotFoundError('/w/.lingo-tracker.json'),
      name: 'ConfigNotFoundError',
      code: 'CONFIG_NOT_FOUND',
      message: `${ErrorMessages.configNotFound()}: /w/.lingo-tracker.json`,
    },
    {
      error: new ConfigParseError('/w/.lingo-tracker.json', 'Unexpected token'),
      name: 'ConfigParseError',
      code: 'CONFIG_PARSE_FAILED',
      message: ErrorMessages.jsonParseFailed('/w/.lingo-tracker.json', 'Unexpected token'),
    },
    {
      error: new CollectionNotFoundError('app'),
      name: 'CollectionNotFoundError',
      code: 'COLLECTION_NOT_FOUND',
      message: ErrorMessages.collectionNotFound('app'),
    },
    {
      error: new CollectionAlreadyExistsError('app'),
      name: 'CollectionAlreadyExistsError',
      code: 'COLLECTION_ALREADY_EXISTS',
      message: ErrorMessages.collectionAlreadyExists('app'),
    },
    {
      error: new CollectionRequiredByBundleError('app', ['main', 'other']),
      name: 'CollectionRequiredByBundleError',
      code: 'COLLECTION_REQUIRED_BY_BUNDLE',
      message: ErrorMessages.collectionRequiredByBundles('app', ['main', 'other']),
    },
    {
      error: new CollectionRenameBundleConflictError('app', 'legacy', ['main', 'other']),
      name: 'CollectionRenameBundleConflictError',
      code: 'COLLECTION_RENAME_BUNDLE_CONFLICT',
      message: ErrorMessages.collectionRenameBundleConflict('app', 'legacy', ['main', 'other']),
    },
    {
      error: new ReadOnlyCollectionError('vendor'),
      name: 'ReadOnlyCollectionError',
      code: 'COLLECTION_READ_ONLY',
      message: ErrorMessages.collectionReadOnly('vendor'),
    },
    {
      error: new InvalidCollectionError('translationsFolder is required'),
      name: 'InvalidCollectionError',
      code: 'INVALID_COLLECTION',
      message: 'translationsFolder is required',
    },
    {
      error: new InvalidProjectTermsEditError(
        'Only one preferred terminology edit can be applied at a time',
        'preferred-conflict',
      ),
      name: 'InvalidProjectTermsEditError',
      code: 'INVALID_PROJECT_TERMS_EDIT',
      message: 'Only one preferred terminology edit can be applied at a time',
    },
    {
      error: new ProtectedTermsFileNotSetError('app'),
      name: 'ProtectedTermsFileNotSetError',
      code: 'PROTECTED_TERMS_FILE_NOT_SET',
      message: ErrorMessages.protectedTermsFileNotSet('app'),
    },
    {
      error: new ParentDirectoryMissingError('protected terms file', '/p/terms.json', '/p'),
      name: 'ParentDirectoryMissingError',
      code: 'PARENT_DIRECTORY_MISSING',
      message: 'Cannot write protected terms file — directory does not exist: /p',
    },
    {
      error: new InvalidLocaleError('x!', 'Invalid locale format: "x!"'),
      name: 'InvalidLocaleError',
      code: 'INVALID_LOCALE',
      message: 'Invalid locale format: "x!"',
    },
    {
      error: new LocaleNotFoundError('ja', 'app'),
      name: 'LocaleNotFoundError',
      code: 'LOCALE_NOT_FOUND',
      message: ErrorMessages.localeNotFound('ja', 'app'),
    },
    {
      error: new LocaleAlreadyExistsError('fr', 'app'),
      name: 'LocaleAlreadyExistsError',
      code: 'LOCALE_ALREADY_EXISTS',
      message: ErrorMessages.localeAlreadyExists('fr', 'app'),
    },
    {
      error: new BaseLocaleImmutableError('en'),
      name: 'BaseLocaleImmutableError',
      code: 'BASE_LOCALE_IMMUTABLE',
      message: ErrorMessages.cannotModifyBaseLocale('en'),
    },
    {
      error: new InvalidResourceKeyError('a..b', 'Key validation: Invalid key format "a..b"'),
      name: 'InvalidResourceKeyError',
      code: 'INVALID_RESOURCE_KEY',
      message: 'Key validation: Invalid key format "a..b"',
    },
    {
      error: new InvalidBaseValueError('common.ok'),
      name: 'InvalidBaseValueError',
      code: 'INVALID_BASE_VALUE',
      message: 'Base value must not be empty.',
    },
    {
      error: new InvalidTranslationStatusError('verifed'),
      name: 'InvalidTranslationStatusError',
      code: 'INVALID_TRANSLATION_STATUS',
      message: 'Invalid translation status "verifed". Valid statuses: new, translated, stale, verified',
    },
    {
      error: new ResourceNotFoundError('common.ok'),
      name: 'ResourceNotFoundError',
      code: 'RESOURCE_NOT_FOUND',
      message: ErrorMessages.resourceNotFound('common.ok'),
    },
    {
      error: new ResourceAlreadyExistsError('common.ok'),
      name: 'ResourceAlreadyExistsError',
      code: 'RESOURCE_ALREADY_EXISTS',
      message: ErrorMessages.resourceAlreadyExists('common.ok'),
    },
    {
      error: new InvalidCollectionFolderError({
        kind: 'unreadable',
        folderPath: 'link',
        absolutePath: '/translations/link',
        message: 'This folder is a symbolic link and is not part of the collection',
      }),
      name: 'InvalidCollectionFolderError',
      code: 'INVALID_COLLECTION_FOLDER',
      message: "Cannot access folder 'link': This folder is a symbolic link and is not part of the collection",
    },
    {
      error: new FolderNotFoundError('apps.common'),
      name: 'FolderNotFoundError',
      code: 'FOLDER_NOT_FOUND',
      message: ErrorMessages.folderNotFound('apps.common'),
    },
    {
      error: new FolderMoveIntoDescendantError('apps', 'apps.common'),
      name: 'FolderMoveIntoDescendantError',
      code: 'FOLDER_MOVE_INTO_DESCENDANT',
      message: ErrorMessages.folderMoveIntoDescendant('apps', 'apps.common'),
    },
    {
      error: new InvalidFolderPathError('folder name', 'a b'),
      name: 'InvalidFolderPathError',
      code: 'INVALID_FOLDER_PATH',
      message: 'Invalid folder name segment "a b". Segments must match pattern [A-Za-z0-9_-]+',
    },
    {
      error: new BundleNotFoundError('main'),
      name: 'BundleNotFoundError',
      code: 'BUNDLE_NOT_FOUND',
      message: ErrorMessages.bundleNotFound('main'),
    },
    {
      error: new NoTranslationTargetLocalesError('en'),
      name: 'NoTranslationTargetLocalesError',
      code: 'NO_TRANSLATION_TARGET_LOCALES',
      message: 'No target locales configured. Add locales other than the base locale "en".',
    },
    {
      error: new AutoTranslationDisabledError('main'),
      name: 'AutoTranslationDisabledError',
      code: 'AUTO_TRANSLATION_DISABLED',
      message: ErrorMessages.autoTranslationDisabled('main'),
    },
    {
      error: new BundleAlreadyExistsError('main'),
      name: 'BundleAlreadyExistsError',
      code: 'BUNDLE_ALREADY_EXISTS',
      message: ErrorMessages.bundleAlreadyExists('main'),
    },
    {
      error: new InvalidNameError(),
      name: 'InvalidNameError',
      code: 'INVALID_NAME',
      message: 'name must be a non-empty string',
    },
    {
      error: new InvalidBundleDefinitionError(['a', 'b']),
      name: 'InvalidBundleDefinitionError',
      code: 'INVALID_BUNDLE_DEFINITION',
      message: ErrorMessages.invalidBundleDefinition(['a', 'b']),
    },
    {
      error: new TranslationError('Rate limit exceeded', 'RATE_LIMIT', true),
      name: 'TranslationError',
      code: 'RATE_LIMIT',
      message: 'Rate limit exceeded',
    },
    {
      error: new PreferredTerminologyValidationError([]),
      name: 'PreferredTerminologyValidationError',
      code: 'INVALID_PREFERRED_TERMINOLOGY',
      message: 'Invalid preferred terminology rules: ',
    },
  ];

  const additional = [
    new ImportSourceError('source failed'),
    new InvalidImportLocaleError('en', 'translation-service'),
    new CollectionBaseLocaleMismatchError([
      { name: 'a', baseLocale: 'en' },
      { name: 'b', baseLocale: 'fr' },
    ]),
    new GlossaryNoCollectionsError(),
    new GlossaryExtractorError('unknown'),
    new ProtectedTermsFileError('/p/terms.json', 'bad terms'),
    new InvalidConfigError('bad config'),
    new ConfigChangedError(),
    new CannotTranslateBaseLocaleError('en'),
    new TranslationLocaleNotConfiguredError('ja', ['en']),
    new MultipleBundleConstantNameError(),
    new InvalidBundleLocalesError('bad locale'),
    new CoreOperationError('operation failed'),
  ];

  it('carries the resource key for an invalid base value', () => {
    expect(new InvalidBaseValueError('common.ok')).toMatchObject({ key: 'common.ok' });
  });

  it('covers every declared domain code with a known subclass code', () => {
    const instances = [...cases.map(({ error }) => error), ...additional];
    const domainCodes: readonly string[] = Object.keys(ERROR_CODES);
    const knownCodes: readonly string[] = [...domainCodes, ...PROVIDER_ERROR_CODES];
    for (const error of instances) {
      expect(knownCodes).toContain(error.code);
    }
    const producedDomainCodes = [
      ...new Set(instances.map((error) => error.code).filter((code) => domainCodes.includes(code))),
    ].sort();
    expect(producedDomainCodes).toEqual([...domainCodes].sort());
  });

  it('requires a kind on every error class in the core errors module', () => {
    const instances = [...cases.map(({ error }) => error), ...additional];
    const defined = Object.entries(errorClasses)
      .filter(([, value]) => typeof value === 'function' && value.prototype instanceof LingoTrackerError)
      .map(([name]) => name)
      .sort();
    expect(instances.map((error) => error.constructor.name).sort()).toEqual(defined);
    for (const error of instances) {
      expect(error.kind).toMatch(/^(not-found|conflict|invalid|forbidden|unavailable|upstream|internal)$/);
    }
  });

  it('reserves the upstream kind for TranslationError, including future provider codes', () => {
    const instances = [...cases.map(({ error }) => error), ...additional];
    for (const [name, ErrorClass] of Object.entries(errorClasses)) {
      if (typeof ErrorClass === 'function' && ErrorClass.prototype instanceof LingoTrackerError) {
        const instance = instances.find((error): boolean => error.constructor === ErrorClass);
        expect(instance, `Missing fixture for exported error ${name}`).toBeDefined();
        expect(instance?.kind === 'upstream', `${name} upstream kind`).toBe(ErrorClass === TranslationError);
      }
    }
    expect(new TranslationError('Unknown provider failure', 'FUTURE_PROVIDER_CODE', false).kind).toBe('upstream');
  });

  it('exposes validation details through the same lists used by existing callers', () => {
    const bundle = new InvalidBundleDefinitionError(['first', 'second']);
    const terminology = new PreferredTerminologyValidationError([
      { index: 0, field: 'preferred', code: 'empty', message: 'empty' },
    ]);
    expect(bundle.details).toBe(bundle.errors);
    expect(terminology.details).toBe(terminology.errors);
    expect(new ResourceNotFoundError('common.ok').details).toBeUndefined();
    expect(terminology.message).toBe('Invalid preferred terminology rules: row 1 preferred: empty');
  });

  it.each(cases)(
    '$name has its name, code and message, and is a LingoTrackerError',
    ({ error, name, code, message }) => {
      expect(error).toBeInstanceOf(LingoTrackerError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    },
  );

  it('keeps each catalogue constructor, kind, code, message and name compatible with its exported class', () => {
    const expectedMessages = new Map(cases.map(({ name, message }) => [name, message]));
    const additionalMessages = {
      ImportSourceError: 'source failed',
      InvalidImportLocaleError:
        'Cannot import into base locale "en" with strategy "translation-service". Only "migration" strategy supports base locale imports.',
      CollectionBaseLocaleMismatchError:
        'Cannot combine collections with different base locales (a: en, b: fr). Run them separately.',
      GlossaryNoCollectionsError: 'Cannot build a glossary without collections.',
      GlossaryExtractorError: 'Unknown extractor "unknown". Supported: ngram.',
      ProtectedTermsFileError: 'bad terms',
      InvalidConfigError: 'bad config',
      ConfigChangedError: 'The configuration file changed after it was read; run the command again',
      CannotTranslateBaseLocaleError: 'Cannot translate to the base locale "en".',
      TranslationLocaleNotConfiguredError: 'Locale "ja" is not configured. Available locales: en',
      MultipleBundleConstantNameError: 'A token constant name override needs exactly one bundle.',
      InvalidBundleLocalesError: 'bad locale',
      CoreOperationError: 'operation failed',
    };
    for (const [name, message] of Object.entries(additionalMessages)) {
      expectedMessages.set(name, message);
    }
    const instances = [...cases.map(({ error }) => error), ...additional];
    const expectedKinds = {
      ImportSourceError: 'internal',
      InvalidImportLocaleError: 'internal',
      CollectionBaseLocaleMismatchError: 'invalid',
      GlossaryNoCollectionsError: 'internal',
      GlossaryExtractorError: 'internal',
      ConfigNotFoundError: 'internal',
      ConfigParseError: 'internal',
      ConfigChangedError: 'conflict',
      InvalidConfigError: 'internal',
      ProtectedTermsFileError: 'internal',
      InvalidProjectTermsEditError: 'invalid',
      CollectionNotFoundError: 'not-found',
      CollectionAlreadyExistsError: 'conflict',
      CollectionRequiredByBundleError: 'conflict',
      CollectionRenameBundleConflictError: 'conflict',
      ReadOnlyCollectionError: 'forbidden',
      InvalidCollectionError: 'invalid',
      InvalidNameError: 'invalid',
      ProtectedTermsFileNotSetError: 'invalid',
      ParentDirectoryMissingError: 'invalid',
      InvalidTranslationStatusError: 'invalid',
      InvalidExportBasePropertyNameError: 'invalid',
      InvalidLocaleError: 'invalid',
      LocaleNotFoundError: 'invalid',
      LocaleAlreadyExistsError: 'invalid',
      BaseLocaleImmutableError: 'invalid',
      BracedPlaceholderError: 'invalid',
      InvalidResourceKeyError: 'invalid',
      InvalidBaseValueError: 'invalid',
      ResourceNotFoundError: 'not-found',
      ResourceAlreadyExistsError: 'conflict',
      FolderNotFoundError: 'not-found',
      InvalidCollectionFolderError: 'invalid',
      FolderMoveIntoDescendantError: 'invalid',
      InvalidFolderPathError: 'invalid',
      AutoTranslationDisabledError: 'unavailable',
      NoTranslationTargetLocalesError: 'invalid',
      CannotTranslateBaseLocaleError: 'invalid',
      TranslationLocaleNotConfiguredError: 'invalid',
      MultipleBundleConstantNameError: 'internal',
      BundleNotFoundError: 'not-found',
      InvalidBundleLocalesError: 'invalid',
      BundleAlreadyExistsError: 'conflict',
      InvalidBundleDefinitionError: 'invalid',
      PreferredTerminologyValidationError: 'invalid',
      CoreOperationError: 'internal',
      BundleHierarchicalConflictError: 'invalid',
    } as const;
    expect(Object.keys(ERROR_CATALOGUE).sort()).toEqual(Object.keys(expectedKinds).sort());
    expect(new Set(Object.values(ERROR_CATALOGUE).map((ErrorClass) => ErrorClass.code)).size).toBe(
      Object.keys(ERROR_CATALOGUE).length,
    );
    for (const [name, ErrorClass] of Object.entries(ERROR_CATALOGUE)) {
      const error = instances.find((instance): boolean => instance.constructor === ErrorClass);
      expect(error, `Missing fixture for ${name}`).toBeDefined();
      expect(ErrorClass.name).toBe(name);
      expect(error?.name).toBe(name === 'CoreOperationError' ? 'Error' : name);
      expect(error?.code).toBe(ErrorClass.code);
      expect(expectedMessages.has(name)).toBe(true);
      expect(error?.message).toBe(expectedMessages.get(name));
      expect(error?.kind).toBe(expectedKinds[name as keyof typeof expectedKinds]);
      expect(error).toBeInstanceOf(LingoTrackerError);
      expect(error).toBeInstanceOf(ErrorClass);
    }
  });

  it('keeps default arguments, copied and shared payloads, causes and subclass identity', () => {
    const cause = new Error('underlying failure');
    expect(new ImportSourceError('import', { cause })).toMatchObject({ cause, stage: 'source' });
    expect(new ImportSourceError('format', { cause, stage: 'format' })).toMatchObject({ cause, stage: 'format' });
    expect(new InvalidConfigError('config', { cause }).cause).toBe(cause);
    expect(new CoreOperationError('operation', { cause }).cause).toBe(cause);
    expect(new CollectionNotFoundError('app', 'destination').message).toBe('Destination collection "app" not found');
    expect(new InvalidCollectionError('invalid')).toMatchObject({ field: undefined, problem: undefined });
    expect(new InvalidCollectionError('invalid', { field: 'tags', problem: 'tag-conflict' })).toMatchObject({
      field: 'tags',
      problem: 'tag-conflict',
    });
    const locales = ['en', 'fr'];
    const error = new TranslationLocaleNotConfiguredError('ja', locales);
    expect(error.availableLocales).toEqual(locales);
    expect(error.availableLocales).not.toBe(locales);
    const rules = [{ discouraged: 'term', preferred: 'translation' }];
    expect(new PreferredTerminologyValidationError([], rules).submittedRules).toBe(rules);
    class CustomResourceError extends ResourceNotFoundError {}
    const custom = new CustomResourceError('common.ok');
    expect(custom).toBeInstanceOf(ResourceNotFoundError);
    expect(custom.name).toBe('CustomResourceError');
  });

  it('keeps the typed payload of each error', () => {
    expect(new ResourceNotFoundError('common.ok').key).toBe('common.ok');
    expect(new LocaleNotFoundError('ja', 'app')).toMatchObject({ locale: 'ja', collectionName: 'app' });
    expect(new InvalidFolderPathError('parent path', 'x y')).toMatchObject({ part: 'parent path', segment: 'x y' });
    expect(new InvalidBundleDefinitionError(['a']).errors).toEqual(['a']);
    expect(new BundleHierarchicalConflictError('main', ['a.b']).conflicts).toEqual(['a.b']);
  });
});
