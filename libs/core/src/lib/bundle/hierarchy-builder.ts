import { buildKeyTree, type TokenCasing } from '@simoncodes-ca/domain';
import { segmentToPropertyName } from './type-generation/key-transformer';

/** Bundle adapter: JSON hierarchy plus optional generated-token hierarchy validation. */
export function buildBundleHierarchy(
  entries: Iterable<readonly [string, string]>,
  tokenCasing?: TokenCasing,
): { tree: Record<string, unknown>; conflicts: string[] } {
  const values = new Map(entries);
  const built = buildKeyTree(values);
  if (tokenCasing === undefined) return built;
  const tokens = buildKeyTree(values, {
    path: (key) =>
      key
        .split('.')
        .map((segment) => segmentToPropertyName(segment, tokenCasing))
        .join('.'),
  });
  return { tree: built.tree, conflicts: [...new Set([...built.conflicts, ...tokens.conflicts])].sort() };
}
