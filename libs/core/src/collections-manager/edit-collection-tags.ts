import { type ListEdit, mergeListEdit, normalizeTags, validateListEdit } from '@simoncodes-ca/domain';
import type { OpenedCollection } from '../lib/config/open-collection';
import { ErrorMessages } from '../lib/errors/error-messages';
import { InvalidCollectionError } from '../lib/errors/lingo-tracker-error';
import { changeCollection } from './collection-change';

export type CollectionTagEdit = ListEdit;

/**
 * Edits the opened registration's tags through Collection Change and returns normalized tags.
 * Read-only registrations allow tag edits. Invalid edits and stale snapshots reject before writes
 * or mutation notifications; a changed record follows Collection Change's reindex rule.
 */
export async function editCollectionTags(collection: OpenedCollection, edit: CollectionTagEdit): Promise<string[]> {
  validateListEdit(edit, {
    shape: () => new InvalidCollectionError('Tag edit lists must be arrays of strings'),
    conflict: () => new InvalidCollectionError(ErrorMessages.collectionTagEditConflict(), { problem: 'tag-conflict' }),
    missing: () => new InvalidCollectionError(ErrorMessages.collectionTagEditMissing(), { problem: 'tag-missing' }),
  });

  const storedTags = normalizeTags(collection.config.tags ?? []);
  const tags = mergeListEdit(storedTags, edit, normalizeTags);
  await changeCollection(collection, { patch: { tags } });
  return tags;
}
