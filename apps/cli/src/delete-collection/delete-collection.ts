import { deleteCollectionByName } from '@simoncodes-ca/core';
import { loadConfiguration, promptForCollection } from '../utils';

export interface DeleteCollectionOptions {
  collectionName?: string;
}

export async function deleteCollectionCommand(options: DeleteCollectionOptions): Promise<void> {
  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  const collectionName = await promptForCollection(config, options.collectionName);
  if (!collectionName) return;
  
  try {
    const result = deleteCollectionByName(collectionName, { cwd });
    console.log(result.message);
  } catch (e: unknown) {
    console.log(`❌ ${e instanceof Error ? e.message : 'Failed to delete collection'}`);
  }
}
