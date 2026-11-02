/**
 * Controls the casing of generated TypeScript token property keys.
 * - 'upperCase': SCREAMING_SNAKE_CASE (e.g. FILE_UPLOAD) — default, fully backward compatible
 * - 'camelCase': camelCase (e.g. fileUpload)
 *
 * Note: The const name (e.g. TRACKER_TOKENS) and type name (e.g. TrackerTokens)
 * are always SCREAMING_SNAKE_CASE and PascalCase respectively, regardless of this setting.
 */
export type TokenCasing = 'upperCase' | 'camelCase';
