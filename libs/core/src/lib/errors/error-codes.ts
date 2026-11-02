import { createErrorCatalogue } from './error-catalogue';
import * as definitions from './lingo-tracker-error';

// The abstract base has no domain code; TranslationError uses PROVIDER_ERROR_CATALOGUE instead.
const CATALOGUE_EXEMPTIONS = ['LingoTrackerError', 'TranslationError'] as const;

/** Every exported typed-error subclass registers unless it is explicitly exempt. */
export const ERROR_CATALOGUE = createErrorCatalogue(definitions, CATALOGUE_EXEMPTIONS);

type Catalogue = typeof ERROR_CATALOGUE;

type DomainCodes = { readonly [Name in keyof Catalogue as Catalogue[Name]['code']]: Catalogue[Name]['code'] };

/** The catalogue is the only source of domain code strings. */
export const ERROR_CODES = Object.fromEntries(
  Object.values(ERROR_CATALOGUE).map((ErrorClass) => [ErrorClass.code, ErrorClass.code]),
) as DomainCodes;

export type DomainErrorCode = keyof typeof ERROR_CODES;

/** Codes core's providers raise today; the taxonomy stays open (see ProviderErrorCode). */
export const PROVIDER_ERROR_CODES = definitions.PROVIDER_ERROR_CATALOGUE.codes;

export type KnownProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];
export type ProviderErrorCode = KnownProviderErrorCode | (string & {});

/** Valid keys for adapter override tables. */
export type ErrorCode = DomainErrorCode | KnownProviderErrorCode;

/** Optional facts also support runtime subclasses that reuse a catalogue code. */
type Facts<Error> = Partial<Readonly<Omit<Error, Exclude<keyof definitions.LingoTrackerError, 'details'>>>>;
type ErrorFactsByCode = {
  readonly [Name in keyof Catalogue as Catalogue[Name]['code']]: Facts<InstanceType<Catalogue[Name]>>;
} & { readonly [Code in KnownProviderErrorCode]: Facts<definitions.TranslationError> };

export type ErrorView<Code extends string> = Pick<definitions.LingoTrackerError, 'kind' | 'message'> & {
  readonly code: Code;
  readonly facts: Pick<definitions.LingoTrackerError, 'details'> &
    (Code extends keyof ErrorFactsByCode ? ErrorFactsByCode[Code] : object);
};

/** `Result` must not be a function type. */
export type ErrorRules<Result, Context = void, ExtraCode extends string = never> = {
  readonly [Code in ErrorCode | ExtraCode]?: Result | ((error: ErrorView<Code>, context: Context) => Result);
};

/** The own-property lookup is the boundary between open runtime codes and typed rules. */
export function mapTypedError<Result, Context = void, ExtraCode extends string = never>(
  error: definitions.LingoTrackerError,
  rules: ErrorRules<Result, Context, ExtraCode>,
  context: Context,
): Result | undefined {
  const rule: unknown = Object.getOwnPropertyDescriptor(rules, error.code)?.value;
  return (typeof rule === 'function' ? rule(error, context) : rule) as Result | undefined;
}
