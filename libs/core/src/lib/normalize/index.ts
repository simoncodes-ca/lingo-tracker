// The normalize module: one operation that repairs entries, metadata and empty folders across a collection.

export { type NormalizeFinding, type NormalizeOptions, type NormalizeResult, normalize } from './normalize';
export {
  type CollectionNormalizeResult,
  type NormalizeCollectionsOptions,
  type NormalizeCollectionsResult,
  normalizeCollections,
} from './normalize-collections';
