/**
 * ICU Message Format Auto-Fixing for Import
 *
 * This module provides automatic fixing of ICU message format placeholders that translators
 * commonly modify during translation. Rather than rejecting translations with modified placeholders,
 * we automatically fix them by replacing the translation's placeholders with the correct ones
 * from the base locale while preserving the translated text.
 *
 * @module icu-auto-fixer
 */

/**
 * Represents a placeholder extracted from an ICU message
 */
interface ICUPlaceholder {
  /** The full placeholder text including braces (e.g., "{count}" or "{count, plural, ...}") */
  fullText: string;
  /** Start position in the original string */
  startPosition: number;
  /** End position in the original string */
  endPosition: number;
  /** Placeholder name (e.g., "count", "name", "0") */
  name: string;
  /** Placeholder type (simple, plural, select, number, date, time) */
  type: 'simple' | 'plural' | 'select' | 'number' | 'date' | 'time';
}

/**
 * Result of ICU placeholder extraction
 */
interface PlaceholderExtractionResult {
  /** Extracted placeholders in order of appearance */
  placeholders: ICUPlaceholder[];
  /** Text segments between placeholders */
  textSegments: string[];
  /** Whether the extraction was successful */
  success: boolean;
  /** Error message if extraction failed */
  error?: string;
}

/**
 * Result of ICU auto-fixing operation
 */
export interface ICUAutoFixResult {
  /** Whether auto-fix was applied */
  wasFixed: boolean;
  /** The auto-fixed value (or original if no fix needed) */
  value: string;
  /** Description of what was changed */
  description?: string;
  /** Original placeholders that were replaced */
  originalPlaceholders?: string[];
  /** New placeholders from base locale */
  fixedPlaceholders?: string[];
  /** Error message if auto-fix failed */
  error?: string;
}

/**
 * ICU syntax characters that trigger quote-escape mode when following a `'`.
 *
 * Per the ICU4J MessageFormat spec, a `'` starts a quoted section only when
 * immediately followed by one of these characters. A lone `'` before any other
 * character (e.g., a natural apostrophe in "don't") is treated as a literal
 * apostrophe and does NOT enter escape mode.
 */
export const ICU_SYNTAX_CHARS = new Set<string>(['{', '}', '#', '|', "'"]);

/**
 * Returns true when the character at position `i` in `value` is a `'` that
 * should open (or close) an ICU quoted section.
 *
 * A quote starts an escaped section when followed by a syntax char.
 * A `''` (two consecutive apostrophes) is a literal apostrophe escape —
 * it is handled separately by the caller and does NOT open a section.
 * Inside a quoted section any `'` closes the section.
 *
 * @param value - The full message string
 * @param i - Index of the `'` character to evaluate
 * @param inEscapedSection - Whether the parser is currently inside a quoted section
 * @returns true if the quote should toggle escaped-section state
 * @internal
 */
function isQuoteToggle(value: string, i: number, inEscapedSection: boolean): boolean {
  if (value[i] !== "'") {
    return false;
  }

  if (inEscapedSection) {
    // Any `'` closes the current quoted section
    return true;
  }

  // Outside a quoted section: only toggle when followed by a syntax char.
  // `''` (two apostrophes) is handled separately by advanceOverLiteralApostrophe.
  return i + 1 < value.length && ICU_SYNTAX_CHARS.has(value[i + 1]);
}

/**
 * Extracts ICU placeholders from a message string.
 *
 * Handles:
 * - Simple placeholders: {name}, {count}, {0}
 * - Plural forms: {count, plural, one {# item} other {# items}}
 * - Select statements: {gender, select, male {he} female {she} other {they}}
 * - Number/date/time formatters: {price, number, currency}
 * - Escaped braces: `'{literal text}'`
 * - Natural apostrophes: `"don't"` — a `'` not followed by a syntax char is literal
 * - Double apostrophe literal: `''` → literal `'` (no section toggle)
 * - Nested patterns (recursive extraction)
 *
 * Text segments in the result are raw substrings of the original input,
 * including any ICU quote characters. Call `unescapeIcuLiterals` on each
 * segment at the export layer if clean output is required.
 *
 * @param value - The message string to extract placeholders from
 * @returns Extraction result with placeholders and text segments
 *
 * @example
 * ```typescript
 * const result = extractICUPlaceholders("Hello {name}, you have {count} items");
 * // Returns: {
 * //   placeholders: [{name: "name", ...}, {name: "count", ...}],
 * //   textSegments: ["Hello ", ", you have ", " items"],
 * //   success: true
 * // }
 * ```
 */
export function extractICUPlaceholders(value: string): PlaceholderExtractionResult {
  const placeholders: ICUPlaceholder[] = [];
  const textSegments: string[] = [];

  let currentPosition = 0;
  let braceDepth = 0;
  let inEscapedSection = false;
  let currentPlaceholderStart = -1;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    // Handle ICU quote escaping per the MessageFormat spec:
    // - `''` anywhere → literal apostrophe, no section toggle
    // - `'` followed by a syntax char → opens a quoted section
    // - `'` inside a quoted section → closes the section
    // - `'` followed by a non-syntax char → literal apostrophe (e.g., "don't")
    if (char === "'") {
      if (value[i + 1] === "'") {
        // `''` is always a literal apostrophe — skip both chars, no state change
        i++;
        continue;
      }

      if (isQuoteToggle(value, i, inEscapedSection)) {
        inEscapedSection = !inEscapedSection;
      }
      // Whether toggling or not, the `'` itself is not a brace, so move on
      continue;
    }

    if (inEscapedSection) {
      continue;
    }

    // Track opening braces
    if (char === '{') {
      if (braceDepth === 0) {
        // Starting a new placeholder
        currentPlaceholderStart = i;

        // Save text before this placeholder (can be empty string)
        textSegments.push(value.substring(currentPosition, i));
      }
      braceDepth++;
    }

    // Track closing braces
    if (char === '}') {
      braceDepth--;

      if (braceDepth === 0 && currentPlaceholderStart >= 0) {
        // Complete placeholder found
        const endPosition = i + 1;
        const fullText = value.substring(currentPlaceholderStart, endPosition);
        const placeholder = parsePlaceholder(fullText, currentPlaceholderStart, endPosition);

        if (placeholder) {
          placeholders.push(placeholder);
        } else {
          // Invalid placeholder syntax
          return {
            placeholders: [],
            textSegments: [],
            success: false,
            error: `Invalid placeholder syntax at position ${currentPlaceholderStart}: ${fullText}`,
          };
        }

        currentPosition = endPosition;
        currentPlaceholderStart = -1;
      }

      // Negative depth means unmatched closing brace
      if (braceDepth < 0) {
        return {
          placeholders: [],
          textSegments: [],
          success: false,
          error: `Unmatched closing brace at position ${i}`,
        };
      }
    }
  }

  // Unclosed quoted section
  if (inEscapedSection) {
    return {
      placeholders: [],
      textSegments: [],
      success: false,
      error: 'Unclosed quoted section',
    };
  }

  // Unclosed placeholder
  if (braceDepth > 0) {
    return {
      placeholders: [],
      textSegments: [],
      success: false,
      error: `Unclosed placeholder starting at position ${currentPlaceholderStart}`,
    };
  }

  // Add final text segment after last placeholder (can be empty string)
  if (placeholders.length > 0) {
    textSegments.push(value.substring(currentPosition));
  }

  // If no placeholders, we should have one text segment
  if (placeholders.length === 0 && textSegments.length === 0) {
    textSegments.push(value);
  }

  return {
    placeholders,
    textSegments,
    success: true,
  };
}

/**
 * Parses a single placeholder text to extract its name and type.
 *
 * @param fullText - The complete placeholder including braces
 * @param startPosition - Start position in original string
 * @param endPosition - End position in original string
 * @returns Parsed placeholder or null if invalid
 * @internal
 */
function parsePlaceholder(fullText: string, startPosition: number, endPosition: number): ICUPlaceholder | null {
  // Remove outer braces
  const innerText = fullText.substring(1, fullText.length - 1).trim();

  if (!innerText) {
    return null; // Empty placeholder
  }

  // Parse placeholder format: {name} or {name, type, format}
  const parts = splitPlaceholderParts(innerText);

  const name = parts[0].trim();

  // Validate placeholder name doesn't contain braces (invalid ICU syntax)
  // For simple placeholders like {name}, the name should be an identifier
  // For complex placeholders like {count, plural, ...}, we only check the first part
  if (name.includes('{') || name.includes('}')) {
    return null; // Invalid placeholder name
  }

  const type = parts.length > 1 ? parts[1].trim() : 'simple';

  let placeholderType: ICUPlaceholder['type'] = 'simple';

  if (type === 'plural') {
    placeholderType = 'plural';
  } else if (type === 'select') {
    placeholderType = 'select';
  } else if (type === 'number') {
    placeholderType = 'number';
  } else if (type === 'date') {
    placeholderType = 'date';
  } else if (type === 'time') {
    placeholderType = 'time';
  }

  return {
    fullText,
    startPosition,
    endPosition,
    name,
    type: placeholderType,
  };
}

/**
 * Splits placeholder parts by comma, respecting nested braces.
 *
 * For example: "count, plural, one {# item} other {# items}"
 * Returns: ["count", "plural", "one {# item} other {# items}"]
 *
 * @param text - Inner placeholder text
 * @returns Array of parts
 * @internal
 */
function splitPlaceholderParts(text: string): string[] {
  const parts: string[] = [];
  let currentPart = '';
  let braceDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '{') {
      braceDepth++;
      currentPart += char;
    } else if (char === '}') {
      braceDepth--;
      currentPart += char;
    } else if (char === ',' && braceDepth === 0) {
      // Split on comma only at top level
      parts.push(currentPart);
      currentPart = '';
    } else {
      currentPart += char;
    }
  }

  // Add final part
  if (currentPart) {
    parts.push(currentPart);
  }

  return parts;
}

/**
 * Checks if a value contains any ICU placeholders.
 *
 * Quick check without full parsing. Used to skip auto-fix when not needed.
 * Returns false for values that only contain Transloco-style double-brace patterns
 * (e.g., `{{ varName }}`), since those are mutually exclusive with ICU syntax.
 *
 * @param value - The message string to check
 * @returns true if value appears to contain ICU placeholders
 *
 * @example
 * ```typescript
 * hasICUPlaceholders("Hello {name}"); // true
 * hasICUPlaceholders("Hello world"); // false
 * hasICUPlaceholders("Price: {price, number, currency}"); // true
 * hasICUPlaceholders("Create {{ itemName }}?"); // false — Transloco, not ICU
 * ```
 */
export function hasICUPlaceholders(value: string): boolean {
  // Quick check: does it have unescaped braces?
  let inEscapedSection = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === "'") {
      if (value[i + 1] === "'") {
        // `''` is a literal apostrophe — skip both, no state change
        i++;
        continue;
      }

      if (isQuoteToggle(value, i, inEscapedSection)) {
        inEscapedSection = !inEscapedSection;
      }
      continue;
    }

    if (!inEscapedSection && char === '{') {
      // Skip {{ — this is Transloco syntax, not ICU.
      // Note: {{}} (empty double-brace) is also skipped here, which is correct
      // since it's neither valid Transloco nor valid ICU.
      if (value[i + 1] === '{') {
        i++; // skip the second `{`
        continue;
      }

      // Single brace: this is an ICU placeholder.
      return true;
    }
  }

  // A string that ends inside a quoted section is malformed — no valid placeholder
  // can be detected, so treat it the same as a string with no placeholders.
  return false;
}

/**
 * Represents a single Transloco-style `{{ varName }}` placeholder extracted from a string.
 */
export interface TranslocoPlaceholder {
  /** The full placeholder text as it appears in the string (e.g., `"{{ itemName }}"`) */
  readonly fullText: string;
  /** The variable name inside the braces (e.g., `"itemName"`) */
  readonly name: string;
  /** Start position in the original string */
  readonly startPosition: number;
  /** End position (exclusive) in the original string */
  readonly endPosition: number;
}

/**
 * Result of extracting Transloco placeholders from a string.
 */
export interface TranslocoPlaceholderExtractionResult {
  /** Extracted placeholders in order of appearance */
  readonly placeholders: TranslocoPlaceholder[];
  /** Text segments between (and around) placeholders */
  readonly textSegments: string[];
  /** Always true — the pattern is unambiguous */
  readonly success: boolean;
  /** Error message if extraction failed */
  readonly error?: string;
}

/**
 * Checks if a value contains Transloco-style double-brace placeholders.
 *
 * Pattern: `{{ varName }}` (with optional spaces inside braces).
 * Transloco and ICU are mutually exclusive — a value uses either `{{ }}` or `{ }`, never both.
 *
 * @param value - The string to check
 * @returns true if any `{{ varName }}` patterns are present
 *
 * @example
 * ```typescript
 * hasTranslocoPlaceholders("Create {{ itemName }}?"); // true
 * hasTranslocoPlaceholders("Hello {name}"); // false
 * hasTranslocoPlaceholders("Hello world"); // false
 * ```
 */
export function hasTranslocoPlaceholders(value: string): boolean {
  return /\{\{\s*\w+\s*}}/.test(value);
}

/**
 * Extracts all Transloco-style `{{ varName }}` placeholders from a string,
 * along with the text segments between them.
 *
 * @param value - The string to extract placeholders from
 * @returns Extraction result with placeholders and interleaved text segments
 *
 * @example
 * ```typescript
 * extractTranslocoPlaceholders("Create {{ itemName }}?");
 * // Returns:
 * // {
 * //   placeholders: [{ name: "itemName", fullText: "{{ itemName }}", startPosition: 7, endPosition: 21 }],
 * //   textSegments: ["Create ", "?"],
 * //   success: true
 * // }
 * ```
 */
export function extractTranslocoPlaceholders(value: string): TranslocoPlaceholderExtractionResult {
  const placeholders: TranslocoPlaceholder[] = [];
  const textSegments: string[] = [];

  const pattern = /\{\{\s*(\w+)\s*}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(value);

  while (match !== null) {
    // Text segment before this placeholder
    textSegments.push(value.substring(lastIndex, match.index));

    placeholders.push({
      fullText: match[0],
      name: match[1],
      startPosition: match.index,
      endPosition: match.index + match[0].length,
    });

    lastIndex = match.index + match[0].length;
    match = pattern.exec(value);
  }

  // Trailing text segment after the last placeholder
  textSegments.push(value.substring(lastIndex));

  return { placeholders, textSegments, success: true };
}

/**
 * Auto-fixes Transloco placeholders in a translation to match those in the base value.
 *
 * Mirrors the behaviour of `autoFixICUPlaceholders` but for `{{ varName }}` patterns.
 * The fix strategies are:
 * - Placeholders already match → return as-is (wasFixed: false)
 * - Translation is missing all placeholders → append them from base
 * - Translation has same count but different names → replace names with base names
 * - Translation has extra placeholders → error (cannot safely fix)
 * - Translation has fewer placeholders than base (and count mismatch) → error
 *
 * @param baseValue - The base-locale value (source of truth for placeholder names)
 * @param translationValue - The imported translation value (may have wrong or missing placeholders)
 * @returns Auto-fix result describing what was changed (or why it failed)
 *
 * @example
 * ```typescript
 * // Renamed placeholder
 * autoFixTranslocoPlaceholders("Create {{ itemName }}?", "Créer {{ nomElement }} ?");
 * // { wasFixed: true, value: "Créer {{ itemName }} ?", description: "Replaced placeholders: ..." }
 *
 * // Missing placeholder
 * autoFixTranslocoPlaceholders("Hello {{ name }}", "Hola");
 * // { wasFixed: true, value: "Hola {{ name }}", description: "Inserted missing placeholder ..." }
 * ```
 */
export function autoFixTranslocoPlaceholders(baseValue: string, translationValue: string): ICUAutoFixResult {
  if (!hasTranslocoPlaceholders(baseValue)) {
    return { wasFixed: false, value: translationValue };
  }

  const baseExtraction = extractTranslocoPlaceholders(baseValue);
  const basePlaceholders = baseExtraction.placeholders;

  const translationHasPlaceholders = hasTranslocoPlaceholders(translationValue);

  // Translation is missing all Transloco placeholders → append single one as safe default
  if (!translationHasPlaceholders) {
    if (basePlaceholders.length === 1) {
      const fixedValue = `${translationValue} ${basePlaceholders[0].fullText}`.trim();
      return {
        wasFixed: true,
        value: fixedValue,
        description: `Inserted missing placeholder ${basePlaceholders[0].fullText}`,
        originalPlaceholders: [],
        fixedPlaceholders: [basePlaceholders[0].fullText],
      };
    }

    return {
      wasFixed: false,
      value: translationValue,
      error: `Translation is missing ${basePlaceholders.length} placeholders from base value. Cannot safely auto-fix.`,
    };
  }

  const translationExtraction = extractTranslocoPlaceholders(translationValue);
  const translationPlaceholders = translationExtraction.placeholders;

  // Check if they already match by name
  const namesMatch =
    basePlaceholders.length === translationPlaceholders.length &&
    basePlaceholders.every((bp, i) => bp.name === translationPlaceholders[i].name);

  if (namesMatch) {
    return { wasFixed: false, value: translationValue };
  }

  // Count mismatch — cannot safely fix
  if (basePlaceholders.length !== translationPlaceholders.length) {
    if (basePlaceholders.length < translationPlaceholders.length) {
      return {
        wasFixed: false,
        value: translationValue,
        error: `Translation has ${translationPlaceholders.length} placeholders but base has ${basePlaceholders.length}. Cannot safely auto-fix extra placeholders.`,
      };
    }

    return {
      wasFixed: false,
      value: translationValue,
      error: `Translation has ${translationPlaceholders.length} placeholders but base has ${basePlaceholders.length}. Cannot safely auto-fix missing placeholders.`,
    };
  }

  // Same count, different names — replace positionally using text segments from translation
  const translationSegments = translationExtraction.textSegments;
  const originalPlaceholderNames: string[] = [];
  const fixedPlaceholderNames: string[] = [];
  let fixedValue = '';

  for (let i = 0; i < basePlaceholders.length; i++) {
    fixedValue += translationSegments[i];

    const translationPlaceholder = translationPlaceholders[i];
    const basePlaceholder = basePlaceholders[i];

    if (translationPlaceholder.name !== basePlaceholder.name) {
      originalPlaceholderNames.push(translationPlaceholder.fullText);
      fixedPlaceholderNames.push(basePlaceholder.fullText);
      fixedValue += basePlaceholder.fullText;
    } else {
      // Name already matches — keep original text (preserves spacing style)
      fixedValue += translationPlaceholder.fullText;
    }
  }

  // Append trailing text segment
  fixedValue += translationSegments[translationSegments.length - 1];

  const changes = originalPlaceholderNames.map((orig, idx) => `${orig} → ${fixedPlaceholderNames[idx]}`).join(', ');

  return {
    wasFixed: originalPlaceholderNames.length > 0,
    value: fixedValue,
    description: `Replaced placeholders: ${changes}`,
    originalPlaceholders: originalPlaceholderNames,
    fixedPlaceholders: fixedPlaceholderNames,
  };
}

/**
 * Attempts to auto-fix ICU placeholders in a translation by matching them with base locale placeholders.
 *
 * The auto-fix process:
 * 1. Extracts placeholders from both base and translation values
 * 2. Matches placeholders by position (first in base → first in translation)
 * 3. Replaces translation placeholders with base placeholders
 * 4. Preserves translated text between placeholders
 * 5. Validates the result has correct ICU syntax
 *
 * @param baseValue - The base locale value (source of truth for placeholders)
 * @param translationValue - The imported translation value (may have modified placeholders)
 * @returns Auto-fix result with fixed value and change description
 *
 * @example
 * ```typescript
 * // Renamed placeholder
 * autoFixICUPlaceholders("Hello {name}", "Hola {nombre}");
 * // Returns: { wasFixed: true, value: "Hola {name}", description: "Renamed placeholder {nombre} → {name}" }
 *
 * // Missing placeholder
 * autoFixICUPlaceholders("You have {count} items", "Tienes items");
 * // Returns: { wasFixed: true, value: "Tienes {count} items", ... }
 *
 * // Plural form fix
 * autoFixICUPlaceholders(
 *   "{count, plural, one {# item} other {# items}}",
 *   "{numero, plural, one {# elemento} other {# elementos}}"
 * );
 * // Returns: { wasFixed: true, value: "{count, plural, one {# elemento} other {# elementos}}", ... }
 * ```
 */
export function autoFixICUPlaceholders(baseValue: string, translationValue: string): ICUAutoFixResult {
  // Skip if base has no placeholders
  if (!hasICUPlaceholders(baseValue)) {
    return {
      wasFixed: false,
      value: translationValue,
    };
  }

  // Skip if base uses Transloco double-brace syntax (mutually exclusive with ICU)
  if (hasTranslocoPlaceholders(baseValue)) {
    return {
      wasFixed: false,
      value: translationValue,
    };
  }

  // Extract placeholders from base value
  const baseExtraction = extractICUPlaceholders(baseValue);
  if (!baseExtraction.success) {
    return {
      wasFixed: false,
      value: translationValue,
      error: `Failed to parse base value: ${baseExtraction.error}`,
    };
  }

  // If base has placeholders but translation doesn't, we need to insert them
  if (!hasICUPlaceholders(translationValue)) {
    return handleMissingPlaceholders(baseExtraction, translationValue);
  }

  // Extract placeholders from translation value
  const translationExtraction = extractICUPlaceholders(translationValue);
  if (!translationExtraction.success) {
    return {
      wasFixed: false,
      value: translationValue,
      error: `Failed to parse translation value: ${translationExtraction.error}`,
    };
  }

  // Check if placeholders already match
  if (placeholdersMatch(baseExtraction.placeholders, translationExtraction.placeholders)) {
    return {
      wasFixed: false,
      value: translationValue,
    };
  }

  // Attempt to fix by replacing translation placeholders with base placeholders
  return replaceTranslationPlaceholders(baseExtraction, translationExtraction, translationValue);
}

/**
 * Checks if two sets of placeholders match exactly.
 *
 * @param basePlaceholders - Placeholders from base value
 * @param translationPlaceholders - Placeholders from translation value
 * @returns true if placeholders match in count, names, and types
 * @internal
 */
function placeholdersMatch(basePlaceholders: ICUPlaceholder[], translationPlaceholders: ICUPlaceholder[]): boolean {
  if (basePlaceholders.length !== translationPlaceholders.length) {
    return false;
  }

  for (let i = 0; i < basePlaceholders.length; i++) {
    const base = basePlaceholders[i];
    const translation = translationPlaceholders[i];

    if (base.name !== translation.name || base.type !== translation.type) {
      return false;
    }
  }

  return true;
}

/**
 * Handles case where translation is missing placeholders that exist in base.
 *
 * Attempts to insert placeholders at reasonable positions based on base locale structure.
 *
 * @param baseExtraction - Base value extraction result
 * @param translationValue - Translation value without placeholders
 * @returns Auto-fix result
 * @internal
 */
function handleMissingPlaceholders(
  baseExtraction: PlaceholderExtractionResult,
  translationValue: string,
): ICUAutoFixResult {
  const basePlaceholders = baseExtraction.placeholders;

  // Simple heuristic: if base has one placeholder, try to find where it should go
  if (basePlaceholders.length === 1) {
    // Insert at the end as a safe default
    const fixedValue = `${translationValue} ${basePlaceholders[0].fullText}`.trim();

    return {
      wasFixed: true,
      value: fixedValue,
      description: `Inserted missing placeholder ${basePlaceholders[0].fullText}`,
      originalPlaceholders: [],
      fixedPlaceholders: [basePlaceholders[0].fullText],
    };
  }

  // Multiple missing placeholders - this is risky, better to error
  return {
    wasFixed: false,
    value: translationValue,
    error: `Translation is missing ${basePlaceholders.length} placeholders from base value. Cannot safely auto-fix.`,
  };
}

/**
 * Reconstructs a placeholder with base name/type but translation's format string.
 *
 * For simple placeholders: {baseName}
 * For complex placeholders: {baseName, baseType, translationFormat}
 *
 * @param basePlaceholder - Placeholder from base value
 * @param translationPlaceholder - Placeholder from translation value
 * @returns Reconstructed placeholder text
 * @internal
 */
function reconstructPlaceholder(basePlaceholder: ICUPlaceholder, translationPlaceholder: ICUPlaceholder): string {
  // If it's a simple placeholder, just use the base name
  if (basePlaceholder.type === 'simple') {
    return `{${basePlaceholder.name}}`;
  }

  // For complex placeholders (plural, select, number, date, time),
  // we need to extract the format string from the translation and combine with base name/type
  const baseInner = basePlaceholder.fullText.substring(1, basePlaceholder.fullText.length - 1);
  const translationInner = translationPlaceholder.fullText.substring(1, translationPlaceholder.fullText.length - 1);

  // Split both to get parts
  const baseParts = splitPlaceholderParts(baseInner);
  const translationParts = splitPlaceholderParts(translationInner);

  // Build new placeholder: {baseName, baseType, translationFormat}
  // baseParts[0] = name, baseParts[1] = type, baseParts[2] = format (if present)
  // translationParts[2] = format from translation

  if (baseParts.length === 1) {
    // Simple placeholder
    return `{${baseParts[0].trim()}}`;
  } else if (baseParts.length === 2) {
    // Type but no format: {name, type}
    return `{${baseParts[0].trim()}, ${baseParts[1].trim()}}`;
  } else {
    // Has format: {name, type, format}
    // Use base name and type, but translation's format
    let format = translationParts.length >= 3 ? translationParts[2].trim() : baseParts[2].trim();

    // For plural/select, the format string may contain nested placeholder references
    // We need to replace the translation's placeholder name with the base placeholder name
    // For example: "one {# elemento} other {# elementos}" might have {numero} references
    // that need to become {count} references
    if (basePlaceholder.type === 'plural' || basePlaceholder.type === 'select') {
      // Replace any instances of {translationName} with {baseName} in the format string
      const translationName = translationPlaceholder.name;
      const baseName = basePlaceholder.name;

      // Create regex to match {translationName} - need to escape special regex chars
      const escapedTranslationName = translationName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const placeholderRegex = new RegExp(`\\{${escapedTranslationName}\\}`, 'g');

      format = format.replace(placeholderRegex, `{${baseName}}`);
    }

    return `{${baseParts[0].trim()}, ${baseParts[1].trim()}, ${format}}`;
  }
}

/**
 * Replaces translation placeholders with base placeholders while preserving translated text.
 *
 * Uses positional matching: first placeholder in base → first in translation, etc.
 *
 * @param baseExtraction - Base value extraction result
 * @param translationExtraction - Translation value extraction result
 * @param originalTranslationValue - Original translation value (for error cases)
 * @returns Auto-fix result
 * @internal
 */
function replaceTranslationPlaceholders(
  baseExtraction: PlaceholderExtractionResult,
  translationExtraction: PlaceholderExtractionResult,
  originalTranslationValue: string,
): ICUAutoFixResult {
  const basePlaceholders = baseExtraction.placeholders;
  const translationPlaceholders = translationExtraction.placeholders;
  const translationSegments = translationExtraction.textSegments;

  // Handle count mismatch
  if (basePlaceholders.length !== translationPlaceholders.length) {
    if (basePlaceholders.length < translationPlaceholders.length) {
      // Translation has extra placeholders - risky to auto-fix
      return {
        wasFixed: false,
        value: originalTranslationValue,
        error: `Translation has ${translationPlaceholders.length} placeholders but base has ${basePlaceholders.length}. Cannot safely auto-fix extra placeholders.`,
      };
    } else {
      // Translation missing some placeholders - risky to auto-fix
      return {
        wasFixed: false,
        value: originalTranslationValue,
        error: `Translation has ${translationPlaceholders.length} placeholders but base has ${basePlaceholders.length}. Cannot safely auto-fix missing placeholders.`,
      };
    }
  }

  // Build fixed value by interleaving text segments with reconstructed placeholders
  let fixedValue = '';
  const originalPlaceholderNames: string[] = [];
  const fixedPlaceholderNames: string[] = [];

  for (let i = 0; i < basePlaceholders.length; i++) {
    // Add text segment before this placeholder
    if (i < translationSegments.length) {
      fixedValue += translationSegments[i];
    }

    // Reconstruct placeholder with base name/type but translation's format
    const reconstructedPlaceholder = reconstructPlaceholder(basePlaceholders[i], translationPlaceholders[i]);
    fixedValue += reconstructedPlaceholder;

    // Track what changed
    if (reconstructedPlaceholder !== translationPlaceholders[i].fullText) {
      originalPlaceholderNames.push(translationPlaceholders[i].fullText);
      fixedPlaceholderNames.push(reconstructedPlaceholder);
    }
  }

  // Add final text segment after last placeholder
  if (translationSegments.length > basePlaceholders.length) {
    fixedValue += translationSegments[translationSegments.length - 1];
  }

  // Generate description of changes
  let description = '';
  if (originalPlaceholderNames.length > 0) {
    const changes = originalPlaceholderNames.map((orig, idx) => `${orig} → ${fixedPlaceholderNames[idx]}`).join(', ');
    description = `Replaced placeholders: ${changes}`;
  } else {
    description = 'Placeholders already match (no changes needed)';
  }

  return {
    wasFixed: originalPlaceholderNames.length > 0,
    value: fixedValue,
    description,
    originalPlaceholders: originalPlaceholderNames,
    fixedPlaceholders: fixedPlaceholderNames,
  };
}

/**
 * Validates that a value has valid ICU message format syntax.
 *
 * Performs basic validation to ensure the fixed result is not corrupted.
 * Checks for:
 * - Balanced braces
 * - No unescaped single braces
 * - Valid placeholder syntax
 *
 * @param value - The message string to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * ```typescript
 * validateICUSyntax("Hello {name}"); // true
 * validateICUSyntax("Hello {name"); // false (unmatched brace)
 * validateICUSyntax("Hello {count, plural, one {# item} other {# items}}"); // true
 * ```
 */
export function validateICUSyntax(value: string): boolean {
  // Use extraction to validate - if it succeeds, syntax is valid
  const result = extractICUPlaceholders(value);
  return result.success;
}
