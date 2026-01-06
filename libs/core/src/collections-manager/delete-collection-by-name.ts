import { updateConfig } from '../lib/config/config-file-operations';
import { ErrorMessages } from '../lib/errors/error-messages';

export interface DeleteCollectionOptions {
  cwd?: string;
}

export function deleteCollectionByName(
  collectionName: string,
  options: DeleteCollectionOptions = {}
): { message: string } {
  updateConfig(
    (config) => {
      if (!config.collections || !config.collections[collectionName]) {
        throw new Error(ErrorMessages.collectionNotFound(collectionName));
      }

      delete config.collections[collectionName];

      return config;
    },
    options.cwd
  );

  return { message: `Collection "${collectionName}" deleted successfully` };
}
