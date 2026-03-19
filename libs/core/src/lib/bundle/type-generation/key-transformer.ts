// ES2022 + TypeScript contextual keywords that cannot be used as bare identifiers in a const declaration.
const JS_RESERVED_WORDS = new Set([
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
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    return `"${name}" is not a valid JavaScript identifier: may only contain letters, digits, underscores, and dollar signs.`;
  }

  if (JS_RESERVED_WORDS.has(name)) {
    return `"${name}" is a JavaScript reserved word and cannot be used as an identifier.`;
  }

  return undefined;
}

/**
 * Derives a PascalCase type name from an arbitrary constant name.
 * Handles all common casing conventions as input.
 *
 * Examples:
 * - "MY_KEYS"       → "MyKeys"        (SCREAMING_SNAKE_CASE)
 * - "my_keys"       → "MyKeys"        (snake_case)
 * - "myKeys"        → "MyKeys"        (camelCase — capitalise first letter only)
 * - "MyKeys"        → "MyKeys"        (PascalCase — already correct)
 * - "MY_APP_TOKENS" → "MyAppTokens"   (SCREAMING_SNAKE_CASE multi-word)
 * - "TOKENS"        → "Tokens"        (single all-uppercase word)
 */
export function constantNameToTypeName(constantName: string): string {
  // If the name contains underscores, treat each segment as a word and capitalise it.
  if (constantName.includes('_')) {
    return constantName
      .split('_')
      .filter((segment) => segment.length > 0)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join('');
  }

  // A single all-uppercase word (no underscores) is title-cased rather than
  // left unchanged, so "TOKENS" → "Tokens" rather than staying "TOKENS".
  if (/^[A-Z]+$/.test(constantName)) {
    return constantName.charAt(0).toUpperCase() + constantName.slice(1).toLowerCase();
  }

  // A leading `$` is not a letter so `toUpperCase()` leaves it unchanged,
  // meaning `$myTokens` would not be PascalCased. Strip the prefix, apply
  // the same capitalisation logic to the remainder, then restore the `$`.
  if (constantName.startsWith('$')) {
    const withoutPrefix = constantName.slice(1);
    const pascalRemainder = withoutPrefix.charAt(0).toUpperCase() + withoutPrefix.slice(1);
    return '$' + pascalRemainder;
  }

  // No underscores and mixed/lower case: treat as camelCase or PascalCase —
  // just capitalise the first character.
  return constantName.charAt(0).toUpperCase() + constantName.slice(1);
}

/**
 * Converts a bundle key to a valid TypeScript constant name.
 * Format: SCREAMING_SNAKE_CASE + _TOKENS suffix
 *
 * Examples:
 * - "common" -> "COMMON_TOKENS"
 * - "core-ui" -> "CORE_UI_TOKENS"
 */
export function bundleKeyToConstantName(bundleKey: string): string {
  const upperSnakeCase = bundleKey.replace(/-/g, '_').toUpperCase();
  return `${upperSnakeCase}_TOKENS`;
}

/**
 * Converts a translation key segment to a valid TypeScript property name.
 *
 * When casing is 'upperCase' (default):
 * - Format: SCREAMING_SNAKE_CASE
 * - Replaces hyphens with underscores, uppercases the whole segment
 * - "buttons" -> "BUTTONS", "BUTTONS" -> "BUTTONS", "file-upload" -> "FILE_UPLOAD"
 *
 * When casing is 'camelCase':
 * - If the segment contains no hyphens, it is returned as-is to preserve
 *   the original casing: "agGrid" -> "agGrid", "addToLabel" -> "addToLabel"
 * - If the segment contains hyphens, hyphens are removed and only the first
 *   character of each subsequent part is uppercased; the tail of each part
 *   and the entire first part keep their original casing:
 *   "my-component" -> "myComponent", "my-XMLParser" -> "myXMLParser",
 *   "FILE-upload"  -> "FILEUpload"  (first part casing preserved as-is)
 */
export function segmentToPropertyName(segment: string, casing: 'upperCase' | 'camelCase' = 'upperCase'): string {
  if (casing === 'camelCase') {
    if (!segment.includes('-')) {
      return segment;
    }

    const parts = segment.split('-').filter((part) => part.length > 0);
    return parts.map((part, index) => (index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))).join('');
  }

  return segment.replace(/-/g, '_').toUpperCase();
}

/**
 * Splits a translation key into segments.
 *
 * Example:
 * - "common.buttons.ok" -> ["common", "buttons", "ok"]
 */
export function splitKeyIntoSegments(key: string): string[] {
  return key.split('.');
}
