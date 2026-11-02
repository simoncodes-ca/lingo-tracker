import { normalizeTag } from '@simoncodes-ca/domain';

/** Return the same list for an empty or duplicate normalized tag. */
export function addTagToList(tags: readonly string[], raw: string): readonly string[] {
  const tag = normalizeTag(raw);
  return tag && !tags.includes(tag) ? [...tags, tag] : tags;
}

/** Remove every matching own tag; inherited resource tags cannot be removed. */
export function removeTagFromList(
  tags: readonly string[],
  tag: string,
  options: { inherited?: readonly string[] } = {},
): readonly string[] {
  return options.inherited?.includes(tag) ? tags : tags.filter((existing) => existing !== tag);
}
