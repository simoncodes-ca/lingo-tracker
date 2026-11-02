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

  resourceAlreadyExists: (key: string) => `Resource already exists: ${key}`,

  folderNotFound: (folderPath: string) => `Folder not found: ${folderPath}`,

  folderMoveIntoDescendant: (source: string, destination: string) =>
    `Cannot move folder "${source}" into its own descendant "${destination}"`,

  autoTranslationDisabled: (collection: string) => `Auto-translation is not enabled for collection "${collection}"`,

  nameRequired: () => 'name must be a non-empty string',

  collectionNotFound: (name: string) => `Collection "${name}" not found`,

  collectionReadOnly: (name: string) => `Collection "${name}" is read-only. Its resources cannot be modified.`,

  collectionAlreadyExists: (name: string) => `Collection "${name}" already exists`,

  collectionRequiredByBundles: (name: string, bundles: readonly string[]) =>
    `Collection "${name}" is the only collection of bundle(s) ${bundles.map((bundle) => `"${bundle}"`).join(', ')}. Remove it from those bundles or delete them first.`,

  collectionRenameBundleConflict: (oldName: string, newName: string, bundles: readonly string[]) =>
    `Cannot rename collection "${oldName}" to "${newName}": bundle(s) ${bundles.map((bundle) => `"${bundle}"`).join(', ')} already reference "${newName}". Remove those references first.`,

  collectionTagEditConflict: () => 'A replacement list cannot be combined with additions or removals',

  collectionTagEditMissing: () => 'A tag edit needs a replacement, addition, or removal',

  configAlreadyExists: () => '.lingo-tracker.json already exists',

  protectedTermsFileNotSet: (name: string) =>
    `Collection "${name}" has no protected terms file. Set a file path first.`,

  parentDirectoryMissing: (what: string, directory: string) =>
    `Cannot write ${what} — directory does not exist: ${directory}`,

  localeAlreadyExists: (locale: string, collection: string) =>
    `Locale "${locale}" already exists in collection "${collection}"`,

  localeNotFound: (locale: string, collection: string) => `Locale "${locale}" not found in collection "${collection}"`,

  cannotModifyBaseLocale: (locale: string) => `Cannot add or remove the base locale "${locale}"`,

  cannotTranslateBaseLocale: (locale: string) => `Cannot translate to the base locale "${locale}".`,

  translationLocaleNotConfigured: (locale: string, availableLocales: readonly string[]) =>
    `Locale "${locale}" is not configured. Available locales: ${availableLocales.join(', ')}`,

  invalidKey: (key: string, reason: string) => `Invalid resource key "${key}": ${reason}`,

  bundleNotFound: (name: string) => `Bundle "${name}" not found`,

  bundleAlreadyExists: (name: string) => `Bundle "${name}" already exists`,

  invalidBundleDefinition: (errors: readonly string[]) => `Invalid bundle definition: ${errors.join('; ')}`,

  invalidFolderSegment: (part: FolderPathPart, segment: string) =>
    `Invalid ${part} segment "${segment}". Segments must match pattern [A-Za-z0-9_-]+`,

  collectionBaseLocaleMismatch: (collections: readonly { name: string; baseLocale: string }[]) => {
    const listed = collections.map((collection) => `${collection.name}: ${collection.baseLocale}`).join(', ');
    return `Cannot combine collections with different base locales (${listed}). Run them separately.`;
  },

  glossaryNoCollections: () => 'Cannot build a glossary without collections.',

  glossaryExtractorUnavailable: (mode: string) =>
    mode === 'ai'
      ? 'The "ai" extractor is not yet implemented; use the "ngram" extractor (the default).'
      : `Unknown extractor "${mode}". Supported: ngram.`,
} as const;

/** Which part of a folder operation's input a malformed segment came from. */
export type FolderPathPart =
  | 'folder name'
  | 'parent path'
  | 'folder path'
  | 'source folder path'
  | 'destination folder path';
