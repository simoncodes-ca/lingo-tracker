/**
 * Writable top-level configuration fields for `PUT /api/config`.
 *
 * Only fields listed here can be updated through this endpoint. Deliberately excludes
 * `collections`, `locales`, and `baseLocale` (which carry backfill side effects). Add other
 * safe top-level globals here as they become controllable via the UI.
 */
export interface UpdateConfigDto {
  /** Global protected terms (terms kept verbatim and never translated). */
  protectedTerms?: string[];
}
