/** The app runtimes supported at the import and bundle boundaries. */
export const APP_RUNTIMES = ['transloco-messageformat', 'transloco'] as const;

export type AppRuntime = (typeof APP_RUNTIMES)[number];

export const DEFAULT_APP_RUNTIME: AppRuntime = 'transloco-messageformat';

/** Checks an untrusted value against the supported runtimes. */
export function isAppRuntime(value: unknown): value is AppRuntime {
  return typeof value === 'string' && (APP_RUNTIMES as readonly string[]).includes(value);
}
