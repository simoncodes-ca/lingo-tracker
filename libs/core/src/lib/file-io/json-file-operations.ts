import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ResourceEntries } from '../../resource/resource-entry';
import { TrackerMetadata } from '../../resource/tracker-metadata';
import { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { ErrorMessages } from '../errors/error-messages';

export interface JsonFileReadOptions<T> {
  /** Path to the JSON file */
  readonly filePath: string;
  /** Default value to return if file doesn't exist (makes existence optional) */
  readonly defaultValue?: T;
  /** Custom error message prefix */
  readonly errorContext?: string;
}

export interface JsonFileWriteOptions {
  /** Path to the JSON file */
  readonly filePath: string;
  /** Data to write (will be JSON.stringify'd) */
  readonly data: unknown;
  /** Pretty print with indentation (default: true) */
  readonly pretty?: boolean;
  /** Create parent directories if they don't exist (default: false) */
  readonly ensureDirectory?: boolean;
}

/**
 * Reads and parses a JSON file with standardized error handling.
 *
 * @param options - Read configuration
 * @returns Parsed JSON data
 * @throws Error if file doesn't exist (unless defaultValue provided) or parsing fails
 *
 * @example
 * ```typescript
 * // Load with default value if file doesn't exist
 * const config = readJsonFile({
 *   filePath: '/path/to/config.json',
 *   defaultValue: {},
 *   errorContext: 'Loading configuration'
 * });
 *
 * // Load required file (throws if missing)
 * const metadata = readJsonFile<TrackerMetadata>({
 *   filePath: metaPath,
 *   errorContext: 'Loading tracker metadata'
 * });
 * ```
 */
export function readJsonFile<T>(options: JsonFileReadOptions<T>): T {
  const { filePath, defaultValue, errorContext } = options;

  if (!existsSync(filePath)) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    const context = errorContext ? `${errorContext}: ` : '';
    throw new Error(`${context}${ErrorMessages.fileNotFound(filePath)}`);
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    const context = errorContext ? `${errorContext}: ` : '';
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`${context}${ErrorMessages.jsonParseFailed(filePath, errorMessage)}`);
  }
}

/**
 * Writes data to a JSON file with standardized formatting and error handling.
 *
 * @param options - Write configuration
 * @throws Error if write fails
 *
 * @example
 * ```typescript
 * writeJsonFile({
 *   filePath: '/path/to/data.json',
 *   data: { key: 'value' },
 *   pretty: true,
 *   ensureDirectory: true
 * });
 * ```
 */
export function writeJsonFile(options: JsonFileWriteOptions): void {
  const { filePath, data, pretty = true, ensureDirectory = false } = options;

  if (ensureDirectory) {
    const directory = dirname(filePath);
    if (!existsSync(directory)) {
      mkdirSync(directory, { recursive: true });
    }
  }

  try {
    const content = pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    writeFileSync(filePath, content, 'utf8');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(ErrorMessages.fileWriteFailed(filePath, errorMessage));
  }
}

/**
 * Type-safe helper for reading resource entries files.
 */
export function readResourceEntries(
  filePath: string,
  defaultValue?: ResourceEntries
): ResourceEntries {
  return readJsonFile<ResourceEntries>({
    filePath,
    defaultValue,
    errorContext: 'Reading resource entries'
  });
}

/**
 * Type-safe helper for reading tracker metadata files.
 */
export function readTrackerMetadata(
  filePath: string,
  defaultValue?: TrackerMetadata
): TrackerMetadata {
  return readJsonFile<TrackerMetadata>({
    filePath,
    defaultValue,
    errorContext: 'Reading tracker metadata'
  });
}

/**
 * Type-safe helper for reading configuration files.
 */
export function readLingoConfig(filePath: string): LingoTrackerConfig {
  return readJsonFile<LingoTrackerConfig>({
    filePath,
    errorContext: 'Reading LingoTracker configuration'
  });
}
