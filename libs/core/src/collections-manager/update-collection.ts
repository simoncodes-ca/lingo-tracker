import type { LingoTrackerCollection } from '../config/lingo-tracker-collection';
import { createConfigFileOperations, updateConfig } from '../lib/config/config-file-operations';
import { ErrorMessages } from '../lib/errors/error-messages';
import { addLocaleToCollection } from './add-locale-to-collection';
import { removeLocaleFromCollection } from './remove-locale-from-collection';

export interface UpdateCollectionOptions {
  cwd?: string;
}

export async function updateCollection(
  collectionName: string,
  newCollectionName: string | undefined,
  collection: LingoTrackerCollection,
  options: UpdateCollectionOptions = {},
): Promise<{ message: string }> {
  if (!collection || !collection.translationsFolder || !collection.translationsFolder.trim()) {
    throw new Error('translationsFolder is required');
  }

  const { cwd } = options;
  const newLocales = collection.locales;

  // Only diff when caller provides an explicit, non-empty locales array.
  // An empty/undefined list means "inherit from global" — no translation files are touched.
  if (newLocales !== undefined && newLocales.length > 0) {
    // Read config here only to diff existing vs new locales; updateConfig below will re-read the already-mutated file.
    const config = createConfigFileOperations({ cwd }).read();
    const existingCollection = config.collections?.[collectionName];

    if (!existingCollection) {
      throw new Error(ErrorMessages.collectionNotFound(collectionName));
    }

    const existingLocales = existingCollection.locales ?? config.locales ?? [];
    const baseLocale = existingCollection.baseLocale ?? config.baseLocale;

    const addedLocales = newLocales.filter((l) => !existingLocales.includes(l));
    // Never try to remove the base locale — it can only be set at create time.
    const removedLocales = existingLocales.filter((l) => !newLocales.includes(l) && l !== baseLocale);

    for (const locale of removedLocales) {
      await removeLocaleFromCollection(collectionName, locale, { cwd });
    }

    for (const locale of addedLocales) {
      await addLocaleToCollection(collectionName, locale, { cwd });
    }
  }

  const trimmedTranslationsFolder = collection.translationsFolder.trim();
  const targetName = newCollectionName || collectionName;
  const isRename = newCollectionName && newCollectionName !== collectionName;

  updateConfig((config) => {
    if (!config.collections || !config.collections[collectionName]) {
      throw new Error(ErrorMessages.collectionNotFound(collectionName));
    }

    if (isRename && config.collections[targetName]) {
      throw new Error(ErrorMessages.collectionAlreadyExists(targetName));
    }

    const minimalCollection: LingoTrackerCollection = {
      translationsFolder: trimmedTranslationsFolder,
    };

    if (collection.exportFolder !== undefined && collection.exportFolder !== config.exportFolder) {
      minimalCollection.exportFolder = collection.exportFolder;
    }

    if (collection.importFolder !== undefined && collection.importFolder !== config.importFolder) {
      minimalCollection.importFolder = collection.importFolder;
    }

    if (collection.baseLocale !== undefined && collection.baseLocale !== config.baseLocale) {
      minimalCollection.baseLocale = collection.baseLocale;
    }

    if (collection.locales !== undefined && JSON.stringify(collection.locales) !== JSON.stringify(config.locales)) {
      minimalCollection.locales = collection.locales;
    }

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
  }, cwd);

  if (isRename) {
    return {
      message: `Collection "${collectionName}" renamed to "${targetName}" and updated successfully`,
    };
  }
  return { message: `Collection "${collectionName}" updated successfully` };
}
