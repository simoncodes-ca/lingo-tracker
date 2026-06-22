export const MAX_TAG_LENGTH = 50;

export function normalizeTag(input: string): string | null {
  let tag = input.trim().toLowerCase();
  tag = tag.replace(/\s+/g, '-');
  tag = tag.replace(/[^a-z0-9-]/g, '');
  tag = tag.replace(/-+/g, '-');
  tag = tag.replace(/^-+|-+$/g, '');
  if (tag.length > MAX_TAG_LENGTH) {
    tag = tag.slice(0, MAX_TAG_LENGTH).replace(/-+$/, '');
  }
  return tag.length > 0 ? tag : null;
}

export function normalizeTags(input: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    const normalized = normalizeTag(raw);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}
