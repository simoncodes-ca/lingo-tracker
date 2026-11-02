/** Prototype-safe dot-key conversion. Leaves are opaque, even when they are objects. */
export interface KeyTree<T> {
  [segment: string]: T | KeyTree<T>;
}

/**
 * Parent leaves win over descendants, regardless of input order. Exact duplicates use
 * the last value. Conflicts lists source keys with descendants or shared transformed paths, sorted.
 * Keys must already be validated by the caller. No values are inspected or mutated.
 */
export function buildKeyTree<T, L = T>(
  entries: Iterable<readonly [string, T]>,
  options?: {
    readonly leaf?: (value: T, key: string) => L;
    /** Transform the output path while retaining source keys in conflict diagnostics. */
    readonly path?: (key: string) => string;
  },
): { tree: KeyTree<L>; conflicts: string[] } {
  const values = new Map(entries);
  const paths = new Map<string, string>();
  const sources = new Map<string, string[]>();
  for (const key of values.keys()) {
    const path = options?.path?.(key) ?? key;
    paths.set(key, path);
    const keys = sources.get(path) ?? [];
    keys.push(key);
    sources.set(path, keys);
  }
  const conflicts = new Set<string>();
  const blocked = new Set<string>();
  for (const [path, keys] of sources) {
    if (keys.length > 1) {
      for (const key of keys) {
        conflicts.add(key);
        blocked.add(key);
      }
    }
    const parts = path.split('.');
    for (let i = 1; i < parts.length; i++) {
      const parents = sources.get(parts.slice(0, i).join('.'));
      if (parents) {
        for (const parent of parents) conflicts.add(parent);
        for (const key of keys) blocked.add(key);
      }
    }
  }
  const tree = Object.create(null) as KeyTree<L>;
  for (const [key, value] of values) {
    if (blocked.has(key)) continue;
    const parts = (paths.get(key) ?? key).split('.');
    let node = tree;
    for (const part of parts.slice(0, -1)) {
      if (Object.getOwnPropertyDescriptor(node, part) === undefined) {
        node[part] = Object.create(null) as KeyTree<L>;
      }
      node = node[part] as KeyTree<L>;
    }
    node[parts[parts.length - 1]] = options?.leaf ? options.leaf(value, key) : (value as unknown as L);
  }
  return { tree, conflicts: [...conflicts].sort() };
}

/** Visits own properties only; the caller defines opaque leaves. Arrays/null are skipped. */
export function flattenKeyTree<T>(
  tree: Record<string, unknown>,
  isLeaf: (value: unknown) => value is T,
  prefix?: string,
): Array<[string, T]> {
  const entries: Array<[string, T]> = [];
  for (const [segment, value] of Object.entries(tree)) {
    const key = prefix !== undefined ? `${prefix}.${segment}` : segment;
    if (isLeaf(value)) entries.push([key, value]);
    else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      entries.push(...flattenKeyTree(value as Record<string, unknown>, isLeaf, key));
    }
  }
  return entries;
}
