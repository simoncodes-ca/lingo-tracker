// Validate the internal catalogue when the public error surface is loaded.
import './error-codes';

export {
  mapTypedError,
  type ErrorRules,
  type ErrorView,
  type DomainErrorCode,
  type ErrorCode,
  type KnownProviderErrorCode,
  type ProviderErrorCode,
} from './error-codes';
// Core errors declare domain kinds and details; adapters own presentation.
export {
  ConfigNotFoundError,
  ConfigParseError,
  type ErrorKind,
  InvalidBaseValueError,
  InvalidConfigError,
  InvalidProjectTermsEditError,
  LingoTrackerError,
  ResourceAlreadyExistsError,
  TranslationError,
} from './lingo-tracker-error';
