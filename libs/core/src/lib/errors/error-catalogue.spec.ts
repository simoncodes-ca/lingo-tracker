import { describe, expect, expectTypeOf, it } from 'vitest';
import { createErrorCatalogue } from './error-catalogue';
import { mapTypedError, type ErrorRules } from './error-codes';
import { ConfigParseError, ImportSourceError, TranslationError } from './lingo-tracker-error';
import { defineError, LingoTrackerError } from './error-definition';

class FirstError extends defineError('FIRST', 'invalid', () => ({ message: 'first' })) {}
class SecondError extends defineError('SECOND', 'conflict', () => ({ message: 'second' })) {}

describe('error catalogue registration', () => {
  it('registers typed-error constructors and skips unrelated exports', () => {
    class OrdinaryError extends Error {
      static readonly code = 'ORDINARY';
    }
    const object = { code: 'OBJECT' };
    const catalogue = createErrorCatalogue({ FirstError, SecondError, OrdinaryError, object });
    expect(Object.keys(catalogue)).toEqual(['FirstError', 'SecondError']);
    expect(catalogue.FirstError).toBe(FirstError);
    expectTypeOf<keyof typeof catalogue>().toEqualTypeOf<'FirstError' | 'SecondError'>();
  });

  it('rejects every non-exempt subclass with a missing, instance-only or non-string static code', () => {
    class MissingCodeError extends LingoTrackerError {
      readonly kind = 'invalid' as const;
    }
    class InstanceCodeError extends LingoTrackerError {
      override readonly code = 'INSTANCE';
      readonly kind = 'invalid' as const;
    }
    class NonStringCodeError extends LingoTrackerError {
      static readonly code = 42;
      readonly kind = 'invalid' as const;
    }
    expect(() => {
      // @ts-expect-error Every non-exempt subclass needs a static string literal code.
      createErrorCatalogue({ FirstError, MissingCodeError });
    }).toThrow('Error subclass MissingCodeError must declare a static string code');
    expect(() => {
      // @ts-expect-error Instance codes cannot register a constructor.
      createErrorCatalogue({ FirstError, InstanceCodeError });
    }).toThrow('Error subclass InstanceCodeError must declare a static string code');
    expect(() => {
      // @ts-expect-error A numeric static code cannot enter ErrorCode.
      createErrorCatalogue({ FirstError, NonStringCodeError });
    }).toThrow('Error subclass NonStringCodeError must declare a static string code');
  });

  it('exempts only the explicitly listed constructors at runtime and in the catalogue type', () => {
    abstract class AbstractError extends LingoTrackerError {}
    const catalogue = createErrorCatalogue({ FirstError, AbstractError, LingoTrackerError }, [
      'AbstractError',
      'LingoTrackerError',
    ]);
    expect(Object.keys(catalogue)).toEqual(['FirstError']);
    expectTypeOf<keyof typeof catalogue>().toEqualTypeOf<'FirstError'>();
    expect(() => {
      // @ts-expect-error An abstract subclass is not exempt merely because it is abstract.
      createErrorCatalogue({ AbstractError });
    }).toThrow('Error subclass AbstractError must declare a static string code');
    expect(() => {
      // @ts-expect-error The base constructor also needs an explicit exemption.
      createErrorCatalogue({ LingoTrackerError });
    }).toThrow('Error subclass LingoTrackerError must declare a static string code');
  });

  it('rejects duplicate codes before building the catalogue', () => {
    class DuplicateError extends defineError('FIRST', 'conflict', () => ({ message: 'duplicate' })) {}
    expect(() => createErrorCatalogue({ FirstError, DuplicateError })).toThrow(
      'Duplicate error code "FIRST" registered by DuplicateError',
    );
  });

  it('requires literal codes while keeping the code union closed', () => {
    class WidenedError extends LingoTrackerError {
      static code = 'WIDENED';
      readonly kind = 'invalid' as const;
    }
    // @ts-expect-error A string code would disable exhaustive adapter checks.
    createErrorCatalogue({ FirstError, WidenedError });
    const catalogue = createErrorCatalogue({ FirstError, SecondError });
    type Codes = (typeof catalogue)[keyof typeof catalogue]['code'];
    expect(Object.keys(catalogue)).toEqual(['FirstError', 'SecondError']);
    expectTypeOf<Codes>().toEqualTypeOf<'FIRST' | 'SECOND'>();
  });
});

describe('error definition payloads', () => {
  it('infers constructor arguments and readonly fields without replacing the base message', () => {
    class PayloadError extends defineError('PAYLOAD', 'invalid', (key: string, details: readonly string[]) => ({
      message: `Invalid ${key}`,
      key,
      details,
    })) {}
    const details = ['first'];
    const error = new PayloadError('resource', details);
    expect(error).toMatchObject({
      code: 'PAYLOAD',
      kind: 'invalid',
      name: 'PayloadError',
      message: 'Invalid resource',
    });
    expect(error.details).toBe(details);
    expectTypeOf(error.key).toEqualTypeOf<string>();
    expectTypeOf<ConstructorParameters<typeof PayloadError>>().toEqualTypeOf<[string, readonly string[]]>();
    expect(Object.getOwnPropertyDescriptor(error, 'message')?.enumerable).toBe(false);
  });

  it('rejects reserved payload fields and invalid message or details types', () => {
    // @ts-expect-error The definition owns code.
    defineError('CODE', 'invalid', () => ({ message: 'invalid', code: 'OTHER' }));
    // @ts-expect-error The definition owns kind.
    defineError('CODE', 'invalid', () => ({ message: 'invalid', kind: 'internal' }));
    // @ts-expect-error The base constructor owns name.
    defineError('CODE', 'invalid', () => ({ message: 'invalid', name: 'OtherError' }));
    // @ts-expect-error Cause handling belongs to a handwritten constructor.
    defineError('CODE', 'invalid', () => ({ message: 'invalid', cause: new Error('cause') }));
    // @ts-expect-error The base error owns exposure policy.
    defineError('CODE', 'invalid', () => ({ message: 'invalid', exposeMessage: false }));
    // @ts-expect-error Message must be text for the base constructor.
    defineError('CODE', 'invalid', () => ({ message: 42 }));
    // @ts-expect-error Details must match the base error's validation list.
    defineError('CODE', 'invalid', () => ({ message: 'invalid', details: 'not a list' }));
  });
});

describe('catalogue facts', () => {
  it('shares one payload with facts', () => {
    const error = new ConfigParseError('config', 'bad JSON');
    expect(error.facts).toBe(error);
    expect(error.facts.reason).toBe('bad JSON');
  });

  it('narrows facts for each code without exposing subclass fields to rules', () => {
    const rules = {
      CONFIG_PARSE_FAILED: (error) => {
        expectTypeOf(error.facts.reason).toEqualTypeOf<string | undefined>();
        // @ts-expect-error Stage belongs to import-source errors, not config parse errors.
        void error.facts.stage;
        // @ts-expect-error Adapters receive facts, not subclass fields.
        void error.reason;
        return error.facts.reason ?? error.message;
      },
      IMPORT_SOURCE_ERROR: (error) => {
        expectTypeOf(error.facts.stage).toEqualTypeOf<'format' | 'source' | undefined>();
        return error.facts.stage ?? error.message;
      },
      RATE_LIMIT: (error) => {
        expectTypeOf(error.facts.retryable).toEqualTypeOf<boolean | undefined>();
        return String(error.facts.retryable);
      },
    } satisfies ErrorRules<string>;
    expect(mapTypedError(new ConfigParseError('config', 'bad JSON'), rules, undefined)).toBe('bad JSON');
    expect(mapTypedError(new ImportSourceError('bad format', { stage: 'format' }), rules, undefined)).toBe('format');
    expect(mapTypedError(new TranslationError('slow down', 'RATE_LIMIT', true), rules, undefined)).toBe('true');
    expect(mapTypedError(new TranslationError('new', 'FUTURE_PROVIDER', false), rules, undefined)).toBeUndefined();
  });
});
