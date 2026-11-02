/** An interpolation value; `{ token }` is translated before interpolation. */
export type TranslationParam = string | number | { readonly token: string };

export type TokenTranslator = (token: string, params?: Record<string, string | number>) => string;

/** Translates a token after resolving any parameter tokens to their text. */
export function translateToken(
  token: string,
  values: Readonly<Record<string, TranslationParam>> | undefined,
  translate: TokenTranslator,
): string {
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(values ?? {})) {
    params[name] = typeof value === 'object' ? translate(value.token) : value;
  }
  return translate(token, params);
}
