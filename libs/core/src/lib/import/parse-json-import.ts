import { existsSync, readFileSync } from 'node:fs';
import { isTranslationStatus } from '@simoncodes-ca/domain';
import { CoreOperationError } from '../errors/lingo-tracker-error';
import type { ImportedResource, ImportParseOptions, ParsedImport } from './types';

/**
 * Detects whether the JSON structure is flat or hierarchical.
 *
 * A flat structure uses dot-delimited keys at the root level (e.g., `{"common.ok": "OK"}`).
 * A hierarchical structure uses nested objects (e.g., `{common: {ok: "OK"}}`).
 *
 * Detection logic: If all root-level keys contain dots, the structure is considered flat.
 * Otherwise, it's hierarchical.
 *
 * @param data - The parsed JSON object to analyze
 * @returns 'flat' if all root keys contain dots, 'hierarchical' otherwise
 *
 * @example
 * ```typescript
 * // Flat structure
 * detectJsonStructure({"common.ok": "OK", "common.cancel": "Cancel"}); // 'flat'
 *
 * // Hierarchical structure
 * detectJsonStructure({common: {ok: "OK", cancel: "Cancel"}}); // 'hierarchical'
 *
 * // Mixed (treated as hierarchical)
 * detectJsonStructure({common: {ok: "OK"}, "other.key": "Value"}); // 'hierarchical'
 * ```
 */
export function detectJsonStructure(data: Record<string, unknown>): 'flat' | 'hierarchical' {
  const keys = Object.keys(data);

  // If all keys at root level contain dots, it's flat
  const allKeysHaveDots = keys.every((key) => key.includes('.'));

  if (allKeysHaveDots && keys.length > 0) {
    return 'flat';
  }

  return 'hierarchical';
}

const RICH_KEYS = new Set(['value', 'baseValue', 'comment', 'status', 'tags']);

/** A rich object has a string value and only schema keys; metadata is checked separately. */
function isRichObject(obj: Record<string, unknown>): boolean {
  return (
    Object.hasOwn(obj, 'value') &&
    typeof obj['value'] === 'string' &&
    Object.keys(obj).every((key) => RICH_KEYS.has(key))
  );
}

/** Explain ambiguous metadata without rejecting a namespace that contains a value key. */
function richMetadataIssue(obj: Record<string, unknown>): string | undefined {
  if (!isRichObject(obj)) return undefined;

  const status = obj['status'];
  if (status !== undefined && status !== null && status !== '' && !isTranslationStatus(status)) {
    return 'object looks like rich-format metadata but "status" is not a valid status';
  }
  for (const field of ['comment', 'baseValue']) {
    if (Object.hasOwn(obj, field) && typeof obj[field] !== 'string') {
      return `object looks like rich-format metadata but "${field}" is not a string`;
    }
  }
  if (Object.hasOwn(obj, 'tags') && !Array.isArray(obj['tags'])) {
    return 'object looks like rich-format metadata but "tags" is not an array';
  }
  return undefined;
}

/**
 * Extracts resource from a rich format object
 */
function extractRichResource(key: string, obj: Record<string, unknown>): ImportedResource {
  const resource: ImportedResource = {
    key,
    value: obj['value'] as string,
  };

  if (obj['comment'] && typeof obj['comment'] === 'string') {
    resource.comment = obj['comment'];
  }

  if (obj['baseValue'] && typeof obj['baseValue'] === 'string') {
    resource.baseValue = obj['baseValue'];
  }

  const status = obj['status'];
  if (isTranslationStatus(status)) {
    resource.status = status;
  }

  if (Array.isArray(obj['tags'])) {
    resource.tags = obj['tags'].filter((tag) => typeof tag === 'string') as string[];
  }

  return resource;
}

const MAX_NAMED_SKIPPED_KEYS = 5;

/** One warning for all skipped values; the import summary lists each key with its reason. */
function skippedValuesWarning(keys: string[]): string {
  const named = keys.slice(0, MAX_NAMED_SKIPPED_KEYS).join(', ');
  const rest = keys.length - MAX_NAMED_SKIPPED_KEYS;
  const list = rest > 0 ? `${named} and ${rest} more` : named;
  const noun = keys.length === 1 ? 'value' : 'values';
  return `Skipped ${keys.length} JSON ${noun} that cannot be imported: ${list}. See Skipped Resources in the import summary for the reasons.`;
}

function extractJsonResources(
  data: Record<string, unknown>,
  structure: 'flat' | 'hierarchical',
  prefix = '',
): ParsedImport {
  const parsed: ParsedImport = { resources: [], skipped: [], warnings: [] };

  const visit = (entries: Record<string, unknown>, parent: string): void => {
    for (const [name, value] of Object.entries(entries)) {
      const key = parent ? `${parent}.${name}` : name;
      if (typeof value === 'string') {
        parsed.resources.push({ key, value });
        continue;
      }

      let reason: string | undefined;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        reason = richMetadataIssue(obj);
        if (isRichObject(obj) && reason === undefined) {
          parsed.resources.push(extractRichResource(key, obj));
          continue;
        }
        if (structure === 'hierarchical') {
          if (reason) parsed.warnings.push(`"${key}": ${reason}; imported as nested keys`);
          visit(obj, key);
          continue;
        }
        reason ??= 'Object is not a rich resource; nested objects are not supported in flat JSON';
      }

      const valueType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      reason ??= `Unsupported JSON value type: ${valueType}`;
      parsed.skipped.push({ key, reason });
    }
  };

  visit(data, prefix);
  if (parsed.skipped.length > 0) parsed.warnings.push(skippedValuesWarning(parsed.skipped.map(({ key }) => key)));
  return parsed;
}

/**
 * Extracts translation resources from a flat JSON structure.
 *
 * Flat structures use dot-delimited keys at the root level. Each key maps to either:
 * - A simple string value (e.g., `"common.ok": "OK"`)
 * - A rich object with additional metadata (e.g., `"common.ok": {value: "OK", comment: "Button text"}`)
 *
 * Rich format objects must have a string `value`, no keys outside the schema, and valid metadata:
 * - `comment` - Developer notes or context
 * - `baseValue` - Source locale reference value
 * - `status` - Translation status (new, translated, verified, stale)
 * - `tags` - Array of categorization tags
 *
 * Other values are omitted; `parseJsonImport` reports them as skipped and adds one warning that lists their keys.
 *
 * @param data - The flat JSON object to extract resources from
 * @returns Array of imported resources with keys and values
 *
 * @example
 * ```typescript
 * // Simple flat format
 * const simple = {
 *   "common.ok": "OK",
 *   "common.cancel": "Cancel"
 * };
 * extractFromFlat(simple);
 * // Returns: [{key: "common.ok", value: "OK"}, {key: "common.cancel", value: "Cancel"}]
 *
 * // Rich format with metadata
 * const rich = {
 *   "common.submit": {
 *     value: "Submit",
 *     comment: "Form submission button",
 *     baseValue: "Submit",
 *     status: "translated",
 *     tags: ["forms", "buttons"]
 *   }
 * };
 * extractFromFlat(rich);
 * // Returns: [{key: "common.submit", value: "Submit", comment: "Form...", ...}]
 * ```
 */
export function extractFromFlat(data: Record<string, unknown>): ImportedResource[] {
  return extractJsonResources(data, 'flat').resources;
}

/**
 * Recursively extracts translation resources from a hierarchical JSON structure.
 *
 * Hierarchical structures use nested objects to organize translations by namespace.
 * The function traverses the object tree and constructs dot-delimited keys from the path.
 *
 * Leaf nodes can be either:
 * - Simple string values (e.g., `{common: {ok: "OK"}}` → key: "common.ok")
 * - Rich objects with metadata (e.g., `{common: {ok: {value: "OK", comment: "..."}}}`)
 *
 * Objects outside the rich schema or with invalid metadata are recursed into as namespaces.
 * Arrays, null values, and other non-string types are omitted; `parseJsonImport` reports
 * skipped values and warns about ambiguous metadata.
 *
 * @param data - The hierarchical JSON object to extract resources from
 * @param prefix - Internal parameter for recursion; the current key path (default: no prefix)
 * @returns Array of imported resources with fully-qualified dot-delimited keys
 *
 * @example
 * ```typescript
 * // Simple hierarchical format
 * const simple = {
 *   common: {
 *     buttons: {
 *       ok: "OK",
 *       cancel: "Cancel"
 *     }
 *   }
 * };
 * extractFromHierarchical(simple);
 * // Returns: [
 * //   {key: "common.buttons.ok", value: "OK"},
 * //   {key: "common.buttons.cancel", value: "Cancel"}
 * // ]
 *
 * // Mixed with rich format
 * const mixed = {
 *   common: {
 *     ok: "OK",
 *     submit: {
 *       value: "Submit",
 *       comment: "Form submission",
 *       tags: ["forms"]
 *     }
 *   }
 * };
 * extractFromHierarchical(mixed);
 * // Returns: [
 * //   {key: "common.ok", value: "OK"},
 * //   {key: "common.submit", value: "Submit", comment: "Form submission", tags: ["forms"]}
 * // ]
 * ```
 */
export function extractFromHierarchical(data: Record<string, unknown>, prefix?: string): ImportedResource[] {
  return extractJsonResources(data, 'hierarchical', prefix).resources;
}

/**
 * Reads a JSON import file and returns resources, skipped values, and warnings for {@link importResources}.
 *
 * Accepts a flat (`{"common.ok": "OK"}`) or hierarchical (`{common: {ok: "OK"}}`) structure,
 * detected with {@link detectJsonStructure}. A leaf is a string or a rich object with a string
 * `value` and only the optional schema keys `baseValue`, `comment`, `status`, and `tags`.
 * Invalid rich metadata falls back to nested keys with a warning, or is skipped in flat files.
 * Arrays and other non-string values are skipped; one warning names the first five full keys.
 *
 * @param filePath - Path of the JSON file (relative paths resolve against the working directory)
 * @throws {Error} The file does not exist, or it is not valid JSON.
 */
export function parseJsonImport(filePath: string, options: ImportParseOptions = {}): ParsedImport {
  const { onProgress } = options;
  if (!existsSync(filePath)) {
    throw new CoreOperationError(`Source file not found: ${filePath}`);
  }

  onProgress?.(`Reading JSON file: ${filePath}`);

  let jsonData: Record<string, unknown>;
  try {
    jsonData = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new CoreOperationError(`Failed to parse JSON file: ${error}`);
  }

  const structure = detectJsonStructure(jsonData);
  onProgress?.(`Detected ${structure} JSON structure`);

  const parsed = extractJsonResources(jsonData, structure);
  onProgress?.(`Extracted ${parsed.resources.length} resources from JSON`);
  return parsed;
}
