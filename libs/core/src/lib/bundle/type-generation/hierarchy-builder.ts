import { buildKeyTree, type KeyTree, type TokenCasing } from '@simoncodes-ca/domain';
import { BundleHierarchicalConflictError } from '../../errors/internal';
import { constantNameToTypeName, segmentToPropertyName } from './key-transformer';

export interface TypeHierarchyNode {
  children: Record<string, TypeHierarchyNode>;
  value?: string;
}

/**
 * Builds a nested object structure from a flat list of translation keys.
 *
 * Example (upperCase casing):
 * Input: ["common.buttons.ok", "common.buttons.cancel"]
 * Output:
 * {
 *   children: {
 *     COMMON: {
 *       children: {
 *         BUTTONS: {
 *           children: {
 *             OK: { children: {}, value: "common.buttons.ok" },
 *             CANCEL: { children: {}, value: "common.buttons.cancel" }
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */
export function buildTypeHierarchy(
  keys: string[],
  casing: TokenCasing = 'upperCase',
  bundleKey = 'types',
): TypeHierarchyNode {
  const built = buildKeyTree(
    keys.map((key) => [key, key] as const),
    {
      path: (key) =>
        key
          .split('.')
          .map((segment) => segmentToPropertyName(segment, casing))
          .join('.'),
    },
  );
  if (built.conflicts.length > 0) throw new BundleHierarchicalConflictError(bundleKey, built.conflicts);
  return toTypeNode(built.tree);
}

function toTypeNode(tree: KeyTree<string>): TypeHierarchyNode {
  const children = Object.create(null) as Record<string, TypeHierarchyNode>;
  for (const [key, value] of Object.entries(tree)) {
    children[key] =
      typeof value === 'string'
        ? { children: Object.create(null) as Record<string, TypeHierarchyNode>, value }
        : toTypeNode(value);
  }
  return { children };
}

/**
 * Serializes a type hierarchy into a formatted TypeScript code string.
 *
 * Example Output:
 * export const COMMON_TOKENS = {
 *   BUTTONS: {
 *     OK: 'common.buttons.ok',
 *   },
 * } as const;
 *
 * export type CommonTokens = typeof COMMON_TOKENS;
 */
export function serializeHierarchy(node: TypeHierarchyNode, constantName: string, bundleKey = 'types'): string {
  const lines: string[] = [];

  // Generate the constant object
  lines.push(`export const ${constantName} = {`);
  lines.push(serializeNode(node, 1, bundleKey));
  lines.push(`} as const;`);
  lines.push('');

  // Derive PascalCase type name from the constant name.
  // Handles SCREAMING_SNAKE_CASE, camelCase, PascalCase, and snake_case inputs.
  // e.g. COMMON_TOKENS → CommonTokens, myKeys → MyKeys
  const typeName = constantNameToTypeName(constantName);

  lines.push(`export type ${typeName} = typeof ${constantName};`);

  return lines.join('\n');
}

function serializeNode(node: TypeHierarchyNode, indentLevel: number, bundleKey: string): string {
  const indent = '  '.repeat(indentLevel);
  const lines: string[] = [];

  const entries = Object.entries(node.children);

  // Sort entries alphabetically for deterministic output
  entries.sort(([a], [b]) => a.localeCompare(b));

  for (const [key, childNode] of entries) {
    // If it's a leaf node (has value), output key: value
    if (childNode.value) {
      if (Object.keys(childNode.children).length > 0) {
        throw new BundleHierarchicalConflictError(bundleKey, [childNode.value]);
      }
      lines.push(`${indent}${key}: '${childNode.value}',`);
    } else {
      // It's a parent node
      lines.push(`${indent}${key}: {`);
      lines.push(serializeNode(childNode, indentLevel + 1, bundleKey));
      lines.push(`${indent}},`);
    }
  }

  return lines.join('\n');
}
