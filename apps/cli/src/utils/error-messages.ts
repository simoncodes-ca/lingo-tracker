/**
 * Standardized error messages for consistent CLI user experience.
 *
 * Centralizes all error message definitions to ensure:
 * - Consistent wording and formatting across commands
 * - Uniform use of backticks vs quotes
 * - Consistent suggestions for resolving issues
 * - Single place to update messages
 * - Easier to maintain documentation
 *
 * @example
 * ```typescript
 * import { ErrorMessages } from './error-messages';
 *
 * console.log(ErrorMessages.CONFIG_NOT_FOUND);
 * console.log(ErrorMessages.COLLECTION_NOT_FOUND('main'));
 * console.log(ErrorMessages.MISSING_OPTIONS(['collection', 'key']));
 * ```
 */

export const ErrorMessages = {
  // Configuration Errors
  /**
   * Error when .lingo-tracker.json file is not found
   */
  CONFIG_NOT_FOUND:
    '❌ No Lingo Tracker configuration found. Run `lingo-tracker init` first.',

  /**
   * Error when configuration file has invalid format
   */
  CONFIG_INVALID: '❌ Invalid configuration file format.',

  /**
   * Error when configuration file cannot be parsed
   * @param error - Detailed error message from parser
   */
  CONFIG_PARSE_FAILED: (error: string) => `❌ Failed to parse configuration file: ${error}`,

  // Collection Errors
  /**
   * Error when specified collection does not exist
   * @param name - Name of the collection that was not found
   */
  COLLECTION_NOT_FOUND: (name: string) => `❌ Collection "${name}" not found.`,

  /**
   * Error when no collections exist in configuration
   */
  NO_COLLECTIONS: '❌ No collections found. Run `lingo-tracker add-collection` first.',

  /**
   * Error when trying to create a collection that already exists
   * @param name - Name of the existing collection
   */
  COLLECTION_EXISTS: (name: string) => `❌ Collection "${name}" already exists.`,

  /**
   * Error when no collections are available for an operation
   */
  NO_COLLECTIONS_AVAILABLE: '❌ No collections available.',

  // Option Errors
  /**
   * Error when a single required option is missing
   * @param option - Name of the missing option (without -- prefix)
   */
  MISSING_OPTION: (option: string) => `❌ Missing required option: --${option}`,

  /**
   * Error when multiple required options are missing
   * @param options - Array of missing option names (without -- prefix)
   */
  MISSING_OPTIONS: (options: string[]) =>
    `❌ Missing required options: ${options.map((o) => `--${o}`).join(', ')}`,

  /**
   * Error when required option is missing in non-interactive mode
   * @param options - Array of missing option names (without -- prefix)
   */
  MISSING_OPTIONS_NON_INTERACTIVE: (options: string[]) =>
    `❌ Missing required options in non-interactive mode: ${options.map((o) => `--${o}`).join(', ')}`,

  // Operation Errors
  /**
   * Error when user cancels an operation
   * @param operation - Name of the operation that was cancelled
   */
  OPERATION_CANCELLED: (operation: string) => `❌ ${operation} cancelled.`,

  /**
   * Generic error for failed operations
   * @param operation - Name of the operation that failed
   * @param reason - Optional reason for failure
   */
  OPERATION_FAILED: (operation: string, reason?: string) =>
    reason ? `❌ ${operation} failed: ${reason}` : `❌ ${operation} failed.`,

  // Resource Errors
  /**
   * Error when specified resource key is not found
   * @param key - Resource key that was not found
   */
  RESOURCE_NOT_FOUND: (key: string) => `❌ Resource key "${key}" not found.`,

  /**
   * Error when resource key already exists
   * @param key - Resource key that already exists
   */
  RESOURCE_EXISTS: (key: string) => `❌ Resource key "${key}" already exists.`,

  /**
   * Error when resource key format is invalid
   */
  INVALID_RESOURCE_KEY: '❌ Invalid resource key format.',

  // Locale Errors
  /**
   * Error when specified locale is not found in configuration
   * @param locale - Locale code that was not found
   */
  LOCALE_NOT_FOUND: (locale: string) => `❌ Locale "${locale}" not found in configuration.`,

  /**
   * Error when no locales are configured
   */
  NO_LOCALES_CONFIGURED: '❌ No locales configured.',

  // File System Errors
  /**
   * Error when a required file is not found
   * @param filePath - Path to the missing file
   */
  FILE_NOT_FOUND: (filePath: string) => `❌ File not found: ${filePath}`,

  /**
   * Error when a required directory is not found
   * @param dirPath - Path to the missing directory
   */
  DIRECTORY_NOT_FOUND: (dirPath: string) => `❌ Directory not found: ${dirPath}`,

  /**
   * Error when file read operation fails
   * @param filePath - Path to the file that couldn't be read
   * @param reason - Optional reason for failure
   */
  FILE_READ_FAILED: (filePath: string, reason?: string) =>
    reason
      ? `❌ Failed to read file ${filePath}: ${reason}`
      : `❌ Failed to read file: ${filePath}`,

  /**
   * Error when file write operation fails
   * @param filePath - Path to the file that couldn't be written
   * @param reason - Optional reason for failure
   */
  FILE_WRITE_FAILED: (filePath: string, reason?: string) =>
    reason
      ? `❌ Failed to write file ${filePath}: ${reason}`
      : `❌ Failed to write file: ${filePath}`,
} as const;
