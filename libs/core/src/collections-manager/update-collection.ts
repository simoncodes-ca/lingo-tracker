import { LingoTrackerCollection } from '../config/lingo-tracker-collection';
import { updateConfig } from '../lib/config/config-file-operations';
import { ErrorMessages } from '../lib/errors/error-messages';

export interface UpdateCollectionOptions {
  cwd?: string;
}

export function updateCollection(
  collectionName: string,
  newCollectionName: string | undefined,
  collection: LingoTrackerCollection,
  options: UpdateCollectionOptions = {}
): { message: string } {
  if (!collection || !collection.translationsFolder || !collection.translationsFolder.trim()) {
    throw new Error('translationsFolder is required');
  }

  const trimmedTranslationsFolder = collection.translationsFolder.trim();
  const targetName = newCollectionName || collectionName;
  const isRename = newCollectionName && newCollectionName !== collectionName;

  updateConfig(
    (config) => {
      if (!config.collections || !config.collections[collectionName]) {
        throw new Error(ErrorMessages.collectionNotFound(collectionName));
      }

      // Check if target name conflicts with existing collection (when renaming)
      if (isRename && config.collections[targetName]) {
        throw new Error(ErrorMessages.collectionAlreadyExists(targetName));
      }

      const minimalCollection: LingoTrackerCollection = {
        translationsFolder: trimmedTranslationsFolder,
      };

      // Append only properties that are explicitly different from the root config
      if (collection.exportFolder !== undefined && collection.exportFolder !== config.exportFolder) {
        minimalCollection.exportFolder = collection.exportFolder;
      }

      if (collection.importFolder !== undefined && collection.importFolder !== config.importFolder) {
        minimalCollection.importFolder = collection.importFolder;
      }

      if (collection.baseLocale !== undefined && collection.baseLocale !== config.baseLocale) {
        minimalCollection.baseLocale = collection.baseLocale;
      }

      if (
        collection.locales !== undefined &&
        JSON.stringify(collection.locales) !== JSON.stringify(config.locales)
      ) {
        minimalCollection.locales = collection.locales;
      }

      // Remove old collection if renaming
      if (isRename) {
        delete config.collections[collectionName];
      }

      return {
        ...config,
        collections: {
          ...config.collections,
          [targetName]: minimalCollection,
        },
      };
    },
    options.cwd
  );

  if (isRename) {
    return { message: `Collection "${collectionName}" renamed to "${targetName}" and updated successfully` };
  }
  return { message: `Collection "${collectionName}" updated successfully` };
}
