/** Test-only adapter fixtures and internal modules; excluded from the public barrel. */
export { errorAdapterFixtures } from './lib/errors/error-adapter-fixtures.spec-helpers';
export { ERROR_CODES, PROVIDER_ERROR_CODES } from './lib/errors/error-codes';
export { InvalidCollectionError } from './lib/errors/lingo-tracker-error';
export * as internalErrors from './lib/errors/lingo-tracker-error';
export * as translationProviderFactory from './lib/machine-translation/translation-provider-factory';
