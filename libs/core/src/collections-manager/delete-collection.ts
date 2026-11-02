import type { LingoTrackerConfig } from '../config/lingo-tracker-config';
import { removeBundleCollectionReferences } from '../lib/bundle/bundle-definition-operations';
import { guardedConfigWrite } from '../lib/config/config-file-operations';
import type { OpenedCollection } from '../lib/config/open-collection';
import { reindexResourceCollection } from '../lib/resource/resource-folder';

/** Unregister a collection and its explicit bundle references in one guarded config write. */
export function deleteCollection(collection: OpenedCollection): { message: string } {
  const { sourceConfig: config, name } = collection;
  const configWrite = guardedConfigWrite(collection);
  const next: LingoTrackerConfig = { ...config, collections: { ...config.collections } };
  removeBundleCollectionReferences(next, name);
  delete next.collections[name];
  configWrite.write(next);
  if (typeof collection.config.translationsFolder === 'string') {
    reindexResourceCollection(collection);
  }
  return { message: `Collection "${name}" deleted successfully` };
}
