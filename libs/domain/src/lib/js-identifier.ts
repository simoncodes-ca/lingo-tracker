/**
 * Browser-safe JavaScript identifier rules.
 *
 * Core (type generation, bundle definition validation) and the Tracker UI's
 * bundle form validate the token constant name with these rules, so the
 * client-side check can never drift from the server-side one.
 */

/** Matches an ASCII-only JavaScript identifier. Unicode letters are not permitted. */
export const JS_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** ES2022 + TypeScript contextual keywords that cannot be used as bare identifiers in a const declaration. */
const JS_RESERVED_WORDS: ReadonlySet<string> = new Set([
  // ES2022 reserved words
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'enum',
  'await',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  // TypeScript contextual keywords
  'abstract',
  'as',
  'asserts',
  'async',
  'declare',
  'from',
  'global',
  'infer',
  'is',
  'keyof',
  'module',
  'namespace',
  'never',
  'of',
  'out',
  'override',
  'readonly',
  'require',
  'satisfies',
  'symbol',
  'type',
  'unique',
  'unknown',
  'using',
  // Globals that should not be shadowed
  'undefined',
  'Infinity',
  'NaN',
]);

/** True when `name` is a reserved word that cannot be declared as a bare identifier. */
export function isJavaScriptReservedWord(name: string): boolean {
  return JS_RESERVED_WORDS.has(name);
}

/**
 * True when `name` is a legal, non-reserved ASCII JavaScript identifier.
 *
 * Accepts any casing: camelCase, PascalCase, SCREAMING_SNAKE_CASE, snake_case.
 * Valid: `MY_KEYS`, `myKeys`, `_internal`. Invalid: `1bad`, `my-key`, `class`.
 */
export function isValidJavaScriptIdentifier(name: string): boolean {
  return name.length > 0 && JS_IDENTIFIER_PATTERN.test(name) && !isJavaScriptReservedWord(name);
}

/**
 * Validates that a string is a legal JavaScript identifier.
 * Returns `undefined` when valid, or an error message string when invalid.
 *
 * Only ASCII identifiers are accepted: letters A-Z and a-z, digits 0-9,
 * underscore `_`, and dollar sign `$`. Unicode letters are not permitted.
 *
 * Accepts any casing: camelCase, PascalCase, SCREAMING_SNAKE_CASE, snake_case.
 *
 * Examples of valid identifiers: `MY_KEYS`, `myKeys`, `MyKeys`, `_internal`
 * Examples of invalid identifiers: `1bad`, `my-key`, `my key`, `class`
 */
export function validateJavaScriptIdentifier(name: string): string | undefined {
  if (name.length === 0) {
    return 'Identifier must not be empty.';
  }

  // Must start with a letter, underscore, or dollar sign
  if (!/^[A-Za-z_$]/.test(name)) {
    return `"${name}" is not a valid JavaScript identifier: must start with a letter, underscore, or dollar sign.`;
  }

  // Remaining characters: letters, digits, underscore, dollar sign
  if (!JS_IDENTIFIER_PATTERN.test(name)) {
    return `"${name}" is not a valid JavaScript identifier: may only contain letters, digits, underscores, and dollar signs.`;
  }

  if (isJavaScriptReservedWord(name)) {
    return `"${name}" is a JavaScript reserved word and cannot be used as an identifier.`;
  }

  return undefined;
}
