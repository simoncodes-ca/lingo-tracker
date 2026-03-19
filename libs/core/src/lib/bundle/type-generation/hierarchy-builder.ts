import { segmentToPropertyName, splitKeyIntoSegments, constantNameToTypeName } from './key-transformer';
import type { TokenCasing } from '../../../config/bundle-definition';

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
export function buildTypeHierarchy(keys: string[], casing: TokenCasing = 'upperCase'): TypeHierarchyNode {
  const root: TypeHierarchyNode = { children: {} };

  for (const key of keys) {
    const segments = splitKeyIntoSegments(key);
    let currentNode = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const propertyName = segmentToPropertyName(segment, casing);

      if (!currentNode.children[propertyName]) {
        currentNode.children[propertyName] = { children: {} };
      }

      currentNode = currentNode.children[propertyName];

      // If this is the last segment, set the value
      if (i === segments.length - 1) {
        currentNode.value = key;
      }
    }
  }

  return root;
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
export function serializeHierarchy(node: TypeHierarchyNode, constantName: string): string {
  const lines: string[] = [];

  // Generate the constant object
  lines.push(`export const ${constantName} = {`);
  lines.push(serializeNode(node, 1));
  lines.push(`} as const;`);
  lines.push('');

  // Derive PascalCase type name from the constant name.
  // Handles SCREAMING_SNAKE_CASE, camelCase, PascalCase, and snake_case inputs.
  // e.g. COMMON_TOKENS → CommonTokens, myKeys → MyKeys
  const typeName = constantNameToTypeName(constantName);

  lines.push(`export type ${typeName} = typeof ${constantName};`);

  return lines.join('\n');
}

function serializeNode(node: TypeHierarchyNode, indentLevel: number): string {
  const indent = '  '.repeat(indentLevel);
  const lines: string[] = [];

  const entries = Object.entries(node.children);

  // Sort entries alphabetically for deterministic output
  entries.sort(([a], [b]) => a.localeCompare(b));

  for (const [key, childNode] of entries) {
    // If it's a leaf node (has value), output key: value
    if (childNode.value) {
      // Check if it also has children (mixed node)
      if (Object.keys(childNode.children).length > 0) {
        // This is a tricky case: a key is both a value and a parent.
        // TypeScript objects can't easily represent this directly if we want strict typing for the value.
        // However, in i18n bundles, usually a key is EITHER a leaf OR a parent.
        // If it happens, we prioritize the children structure but we might lose the direct value access
        // or we need a special property like `_value`.
        // For this implementation, we will treat it as an object and ignore the leaf value at this level
        // because standard i18n libraries usually expect keys to be leaves.
        // But to be safe and follow the spec "Leaf values are the original translation key strings",
        // we'll recurse.

        lines.push(`${indent}${key}: {`);
        lines.push(serializeNode(childNode, indentLevel + 1));
        lines.push(`${indent}},`);
      } else {
        lines.push(`${indent}${key}: '${childNode.value}',`);
      }
    } else {
      // It's a parent node
      lines.push(`${indent}${key}: {`);
      lines.push(serializeNode(childNode, indentLevel + 1));
      lines.push(`${indent}},`);
    }
  }

  return lines.join('\n');
}
