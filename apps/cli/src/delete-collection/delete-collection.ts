import { resolve } from 'node:path';
import prompts from 'prompts';
import { readFileSync, existsSync } from 'node:fs';
import { CONFIG_FILENAME, deleteCollectionByName } from '@simoncodes-ca/core';
type LingoTrackerConfig = { collections?: Record<string, unknown> };

export interface DeleteCollectionOptions {
  collectionName?: string;
}

export async function deleteCollectionCommand(options: DeleteCollectionOptions): Promise<void> {
  const cwd = process.env.INIT_CWD || process.cwd();
  const configPath = resolve(cwd, CONFIG_FILENAME);

  // Check if config exists
  if (!existsSync(configPath)) {
    console.log('❌ No Lingo Tracker configuration found. Run `lingo-tracker init` first.');
    return;
  }

  let existingConfig: LingoTrackerConfig;
  try {
    existingConfig = JSON.parse(readFileSync(configPath, 'utf8')) as LingoTrackerConfig;
  } catch {
    console.log('❌ Invalid configuration file format.');
    return;
  }

  let collectionName = options.collectionName;

  // If no collection name provided, prompt user to select one
  if (!collectionName) {
    const availableCollections = Object.keys(existingConfig.collections || {});
    
    if (availableCollections.length === 0) {
      console.log('❌ No collections available to delete.');
      return;
    }

    if (availableCollections.length === 1) {
      collectionName = availableCollections[0];
      console.log(`Only one collection found: "${collectionName}"`);
    } else {
      const response = await prompts({
        type: 'select',
        name: 'collectionName',
        message: 'Select collection to delete:',
        choices: availableCollections.map(name => ({
          title: name,
          value: name
        }))
      }, {
        onCancel: () => {
          throw new Error('Delete collection cancelled');
        }
      });
      collectionName = response.collectionName;
    }
  }

  if (!collectionName) {
    console.log('❌ No collection name provided.');
    return;
  }

  if (!existingConfig.collections || !existingConfig.collections[collectionName]) {
    console.log(`❌ Collection "${collectionName}" not found.`);
    return;
  }
  
  try {
    const result = deleteCollectionByName(collectionName, { cwd });
    console.log(result.message);
  } catch (e: unknown) {
    console.log(`❌ ${e instanceof Error ? e.message : 'Failed to delete collection'}`);
  }
}
