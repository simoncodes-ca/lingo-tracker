export type ErrorKind = 'not-found' | 'conflict' | 'invalid' | 'forbidden' | 'unavailable' | 'upstream' | 'internal';

/**
 * Base class for errors LingoTracker raises on purpose. Each subclass declares a
 * kind for adapter mapping; `code` identifies the specific failure.
 *
 * `code` is stable and machine-readable (for example `RESOURCE_NOT_FOUND`); the message
 * is for people and may change.
 */
export abstract class LingoTrackerError extends Error {
  abstract readonly kind: ErrorKind;
  readonly exposeMessage: boolean = true;
  readonly code: string;
  /** Typed view of the instance payload; `ErrorView` narrows it by code. */
  get facts(): this {
    return this;
  }
  /** The underlying error, when this one wraps it. Not part of the message, so it never reaches a client. */
  override readonly cause?: unknown;

  /** Additional domain validation problems, when the error has a list. */
  readonly details?: readonly unknown[];

  constructor(message: string, code: string, options?: { readonly cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (options && 'cause' in options) {
      this.cause = options.cause;
    }
  }
}

/** Payload facts may add fields, but must not replace the base error's identity or policy. */
type SafePayload<Payload> = {
  readonly [Key in Extract<keyof Payload, Exclude<keyof LingoTrackerError, 'message' | 'details'>>]: never;
};

/** Build a constructor while inferring its arguments and readonly payload from one definition. */
export function defineError<
  const Code extends string,
  const Kind extends ErrorKind,
  Args extends unknown[],
  Payload extends { message: string; details?: LingoTrackerError['details'] },
>(code: Code, kind: Kind, payload: (...args: Args) => Payload & SafePayload<NoInfer<Payload>>) {
  class CatalogueError extends LingoTrackerError {
    static readonly code = code;
    declare readonly code: Code;
    readonly kind = kind;
    constructor(...args: Args) {
      const { message, ...fields } = payload(...args);
      super(message, code);
      Object.assign(this, fields);
    }
  }
  // Object.assign above installs the inferred payload on each instance.
  return CatalogueError as unknown as {
    new (...args: Args): CatalogueError & Readonly<Omit<Payload, 'message'>>;
    readonly code: Code;
  };
}
