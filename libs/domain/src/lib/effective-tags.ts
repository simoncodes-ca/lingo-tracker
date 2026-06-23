import { normalizeTags } from './normalize-tags';

export function effectiveTags(collectionTags: string[] | undefined, resourceTags: string[] | undefined): string[] {
  return normalizeTags([...(collectionTags ?? []), ...(resourceTags ?? [])]);
}
