/** Optional entry comment and tags. */
export interface EntryChange {
  readonly comment?: string;
  readonly tags?: string[];
}

/**
 * Entry Change: absent values leave details alone; non-empty values set them.
 * On edit, an empty comment clears it and an empty tags list removes tags.
 * On add, empty values mean no details. Values are not trimmed or normalized here.
 */
export function entryChange(intent: 'add' | 'edit', input: EntryChange): EntryChange {
  return {
    comment: intent === 'edit' ? input.comment : input.comment || undefined,
    tags: intent === 'edit' ? input.tags : input.tags?.length ? input.tags : undefined,
  };
}
