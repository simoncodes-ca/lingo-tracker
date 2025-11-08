import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG_FILENAME } from '../constants';
import { LingoTrackerConfig } from '../config/lingo-tracker-config';
import { LingoTrackerCollection } from '../config/lingo-tracker-collection';

export interface AddCollectionOptions {
  cwd?: string;
}

export function addCollection(
  collectionName: string,
  collection: LingoTrackerCollection,
  options: AddCollectionOptions = {}
): { message: string } {
  const cwd = options.cwd || process.cwd();
  const configPath = resolve(cwd, CONFIG_FILENAME);

  let config: LingoTrackerConfig;
  try {
    const fileContent = readFileSync(configPath, 'utf8');
    config = JSON.parse(fileContent);
  } catch {
    throw new Error('Failed to read or parse configuration file');
  }

  if (!collection || !collection.translationsFolder || !collection.translationsFolder.trim()) {
    throw new Error('translationsFolder is required');
  }

  if (!config.collections) {
    config.collections = {} as LingoTrackerConfig['collections'];
  }

  if (config.collections[collectionName]) {
    throw new Error(`Collection "${collectionName}" already exists`);
  }

  const trimmedTranslationsFolder = collection.translationsFolder.trim();

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

  if (
    collection.subfolderSplitThreshold !== undefined &&
    collection.subfolderSplitThreshold !== config.subfolderSplitThreshold
  ) {
    minimalCollection.subfolderSplitThreshold = collection.subfolderSplitThreshold;
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

  const updatedConfig: LingoTrackerConfig = {
    ...config,
    collections: {
      ...(config.collections || {}),
      [collectionName]: minimalCollection,
    },
  };

  try {
    writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
  } catch {
    throw new Error('Failed to write configuration file');
  }

  return { message: `Collection "${collectionName}" added successfully` };
}


