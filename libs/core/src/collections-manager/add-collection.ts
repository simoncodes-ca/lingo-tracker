import { LingoTrackerCollection } from '../config/lingo-tracker-collection';
import { updateConfig } from '../lib/config/config-file-operations';
import { ErrorMessages } from '../lib/errors/error-messages';

export interface AddCollectionOptions {
  cwd?: string;
}

export function addCollection(
  collectionName: string,
  collection: LingoTrackerCollection,
  options: AddCollectionOptions = {}
): { message: string } {
  if (!collection || !collection.translationsFolder || !collection.translationsFolder.trim()) {
    throw new Error('translationsFolder is required');
  }

  const trimmedTranslationsFolder = collection.translationsFolder.trim();

  updateConfig(
    (config) => {
      if (!config.collections) {
        config.collections = {};
      }

      if (config.collections[collectionName]) {
        throw new Error(ErrorMessages.collectionAlreadyExists(collectionName));
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

      return {
        ...config,
        collections: {
          ...config.collections,
          [collectionName]: minimalCollection,
        },
      };
    },
    options.cwd
  );

  return { message: `Collection "${collectionName}" added successfully` };
}


