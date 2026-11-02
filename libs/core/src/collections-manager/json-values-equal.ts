/** Compare acyclic JSON-shaped values; object keys with undefined values count as absent. */
export function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) {
      if (!jsonValuesEqual(left[index], right[index])) return false;
    }
    return true;
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  const rightKeySet = new Set(rightKeys);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => rightKeySet.has(key) && jsonValuesEqual(left[key], right[key]))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
