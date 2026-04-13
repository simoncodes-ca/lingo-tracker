/**
 * Standardized error messages for consistent error reporting across the application.
 */
export const ErrorMessages = {
  fileNotFound: (filePath: string) => `File not found: ${filePath}`,

  fileReadFailed: (filePath: string, reason?: string) =>
    `Failed to read file ${filePath}${reason ? `: ${reason}` : ''}`,

  fileWriteFailed: (filePath: string, reason?: string) =>
    `Failed to write file ${filePath}${reason ? `: ${reason}` : ''}`,

  jsonParseFailed: (filePath: string, reason?: string) =>
    `Failed to parse JSON file ${filePath}${reason ? `: ${reason}` : ''}`,

  directoryCreationFailed: (directoryPath: string, reason?: string) =>
    `Could not create directory '${directoryPath}'${reason ? `: ${reason}` : ''}`,

  configNotFound: () => 'LingoTracker configuration file (.lingo-tracker.json) not found',

  resourceNotFound: (key: string) => `Resource not found: ${key}`,

  collectionNotFound: (name: string) => `Collection "${name}" not found`,

  collectionAlreadyExists: (name: string) => `Collection "${name}" already exists`,

  localeAlreadyExists: (locale: string, collection: string) =>
    `Locale "${locale}" already exists in collection "${collection}"`,

  localeNotFound: (locale: string, collection: string) => `Locale "${locale}" not found in collection "${collection}"`,

  cannotModifyBaseLocale: (locale: string) => `Cannot add or remove the base locale "${locale}"`,

  invalidKey: (key: string, reason: string) => `Invalid resource key "${key}": ${reason}`,
} as const;
