import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG_FILENAME } from '../constants';
import { LingoTrackerConfig } from '../config/lingo-tracker-config';
import { readFileSync } from 'node:fs';

export interface DeleteCollectionOptions {
  cwd?: string;
}

export function deleteCollectionByName(
  collectionName: string,
  options: DeleteCollectionOptions = {}
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

  if (!config.collections || !config.collections[collectionName]) {
    throw new Error(`Collection "${collectionName}" not found`);
  }

  delete config.collections[collectionName];

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    throw new Error('Failed to write configuration file');
  }

  return { message: `Collection "${collectionName}" deleted successfully` };
}
