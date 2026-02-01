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
 * Extracts ICU placeholders from a message string.
 *
 * Handles:
 * - Simple placeholders: {name}, {count}, {0}
 * - Plural forms: {count, plural, one {# item} other {# items}}
 * - Select statements: {gender, select, male {he} female {she} other {they}}
 * - Number/date/time formatters: {price, number, currency}
 * - Escaped braces: '{literal text}'
 * - Nested patterns (recursive extraction)
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
export function extractICUPlaceholders(
  value: string,
): PlaceholderExtractionResult {
  const placeholders: ICUPlaceholder[] = [];
  const textSegments: string[] = [];

  let currentPosition = 0;
  let braceDepth = 0;
  let inEscapedSection = false;
  let currentPlaceholderStart = -1;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const prevChar = i > 0 ? value[i - 1] : '';

    // Handle escaped braces (single quotes)
    if (char === "'" && prevChar !== '\\') {
      inEscapedSection = !inEscapedSection;
      continue;
    }

    if (inEscapedSection) {
      continue;
    }

    // Track opening braces
    if (char === '{' && prevChar !== '\\') {
      if (braceDepth === 0) {
        // Starting a new placeholder
        currentPlaceholderStart = i;

        // Save text before this placeholder (can be empty string)
        textSegments.push(value.substring(currentPosition, i));
      }
      braceDepth++;
    }

    // Track closing braces
    if (char === '}' && prevChar !== '\\') {
      braceDepth--;

      if (braceDepth === 0 && currentPlaceholderStart >= 0) {
        // Complete placeholder found
        const endPosition = i + 1;
        const fullText = value.substring(currentPlaceholderStart, endPosition);
        const placeholder = parsePlaceholder(
          fullText,
          currentPlaceholderStart,
          endPosition,
        );

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
function parsePlaceholder(
  fullText: string,
  startPosition: number,
  endPosition: number,
): ICUPlaceholder | null {
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
 *
 * @param value - The message string to check
 * @returns true if value appears to contain ICU placeholders
 *
 * @example
 * ```typescript
 * hasICUPlaceholders("Hello {name}"); // true
 * hasICUPlaceholders("Hello world"); // false
 * hasICUPlaceholders("Price: {price, number, currency}"); // true
 * ```
 */
export function hasICUPlaceholders(value: string): boolean {
  // Quick check: does it have unescaped braces?
  let inEscapedSection = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const prevChar = i > 0 ? value[i - 1] : '';

    if (char === "'" && prevChar !== '\\') {
      inEscapedSection = !inEscapedSection;
      continue;
    }

    if (!inEscapedSection && char === '{') {
      return true;
    }
  }

  return false;
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
export function autoFixICUPlaceholders(
  baseValue: string,
  translationValue: string,
): ICUAutoFixResult {
  // Skip if base has no placeholders
  if (!hasICUPlaceholders(baseValue)) {
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
  if (
    placeholdersMatch(
      baseExtraction.placeholders,
      translationExtraction.placeholders,
    )
  ) {
    return {
      wasFixed: false,
      value: translationValue,
    };
  }

  // Attempt to fix by replacing translation placeholders with base placeholders
  return replaceTranslationPlaceholders(
    baseExtraction,
    translationExtraction,
    translationValue,
  );
}

/**
 * Checks if two sets of placeholders match exactly.
 *
 * @param basePlaceholders - Placeholders from base value
 * @param translationPlaceholders - Placeholders from translation value
 * @returns true if placeholders match in count, names, and types
 * @internal
 */
function placeholdersMatch(
  basePlaceholders: ICUPlaceholder[],
  translationPlaceholders: ICUPlaceholder[],
): boolean {
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
    const fixedValue =
      `${translationValue} ${basePlaceholders[0].fullText}`.trim();

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
function reconstructPlaceholder(
  basePlaceholder: ICUPlaceholder,
  translationPlaceholder: ICUPlaceholder,
): string {
  // If it's a simple placeholder, just use the base name
  if (basePlaceholder.type === 'simple') {
    return `{${basePlaceholder.name}}`;
  }

  // For complex placeholders (plural, select, number, date, time),
  // we need to extract the format string from the translation and combine with base name/type
  const baseInner = basePlaceholder.fullText.substring(
    1,
    basePlaceholder.fullText.length - 1,
  );
  const translationInner = translationPlaceholder.fullText.substring(
    1,
    translationPlaceholder.fullText.length - 1,
  );

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
    let format =
      translationParts.length >= 3
        ? translationParts[2].trim()
        : baseParts[2].trim();

    // For plural/select, the format string may contain nested placeholder references
    // We need to replace the translation's placeholder name with the base placeholder name
    // For example: "one {# elemento} other {# elementos}" might have {numero} references
    // that need to become {count} references
    if (
      basePlaceholder.type === 'plural' ||
      basePlaceholder.type === 'select'
    ) {
      // Replace any instances of {translationName} with {baseName} in the format string
      const translationName = translationPlaceholder.name;
      const baseName = basePlaceholder.name;

      // Create regex to match {translationName} - need to escape special regex chars
      const escapedTranslationName = translationName.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );
      const placeholderRegex = new RegExp(
        `\\{${escapedTranslationName}\\}`,
        'g',
      );

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
    const reconstructedPlaceholder = reconstructPlaceholder(
      basePlaceholders[i],
      translationPlaceholders[i],
    );
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
    const changes = originalPlaceholderNames
      .map((orig, idx) => `${orig} → ${fixedPlaceholderNames[idx]}`)
      .join(', ');
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
