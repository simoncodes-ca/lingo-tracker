// Collection and locale operations: each edits .lingo-tracker.json (and, for locales, the resource tree).

export { type AddCollectionOptions, addCollection } from './add-collection';
export {
  type AddLocaleToCollectionResult,
  addLocaleToCollection,
} from './add-locale-to-collection';
export { deleteCollection } from './delete-collection';
export { type CollectionTagEdit, editCollectionTags } from './edit-collection-tags';
export {
  type RemoveLocaleFromCollectionResult,
  removeLocaleFromCollection,
} from './remove-locale-from-collection';
export { type UpdateCollectionOptions, updateCollection } from './update-collection';
