import { updateCollection } from '@simoncodes-ca/core';
import { normalizeTags } from '@simoncodes-ca/domain';
import { loadConfiguration, ConsoleFormatter } from '../utils';

export interface EditCollectionOptions {
  addTag?: string[];
  removeTag?: string[];
  setTags?: string;
}

export async function editCollectionCommand(collectionName: string, options: EditCollectionOptions): Promise<void> {
  const hasAdd = options.addTag && options.addTag.length > 0;
  const hasRemove = options.removeTag && options.removeTag.length > 0;
  const hasSet = options.setTags !== undefined;

  if (hasSet && (hasAdd || hasRemove)) {
    ConsoleFormatter.error('--set-tags cannot be combined with --add-tag or --remove-tag');
    process.exit(1);
    return;
  }

  if (!hasAdd && !hasRemove && !hasSet) {
    ConsoleFormatter.error('Provide at least one of --add-tag, --remove-tag, or --set-tags');
    process.exit(1);
    return;
  }

  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  const collection = config.collections?.[collectionName];
  if (!collection) {
    ConsoleFormatter.error(`Collection "${collectionName}" not found`);
    process.exit(1);
    return;
  }

  let currentTags = [...(collection.tags ?? [])];

  if (hasSet) {
    currentTags = normalizeTags(
      (options.setTags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    );
  } else {
    if (hasAdd) {
      const toAdd = normalizeTags(options.addTag ?? []);
      for (const tag of toAdd) {
        if (!currentTags.includes(tag)) {
          currentTags.push(tag);
        }
      }
    }
    if (hasRemove) {
      const toRemove = normalizeTags(options.removeTag ?? []);
      currentTags = currentTags.filter((t) => !toRemove.includes(t));
    }
  }

  await updateCollection(collectionName, undefined, { ...collection, tags: currentTags }, { cwd });

  if (currentTags.length === 0) {
    ConsoleFormatter.success(`Collection "${collectionName}" tags cleared`);
  } else {
    ConsoleFormatter.success(`Collection "${collectionName}" tags updated: ${currentTags.join(', ')}`);
  }
}
