/** A list edit before caller-specific normalization. */
export interface ListEdit {
  readonly add?: readonly string[];
  readonly remove?: readonly string[];
  readonly set?: readonly string[];
}

export type ListEditProblem = 'conflict' | 'missing';

/** Check untyped arrays once; callers supply their domain error and wording. */
export function assertStringArray(values: unknown, invalid: () => Error): asserts values is string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) throw invalid();
}

/** Validate list shape and combinations, preserving the caller's refusal precedence. */
export function validateListEdit(
  edit: ListEdit,
  errors: { shape: () => Error; conflict: () => Error; missing?: () => Error; combinationsFirst?: boolean },
): boolean {
  const problem = listEditProblem(edit);
  if (errors.combinationsFirst && problem === 'conflict') throw errors.conflict();
  if (errors.combinationsFirst && problem === 'missing' && errors.missing !== undefined) throw errors.missing();
  for (const values of [edit.add, edit.remove, edit.set]) {
    if (values !== undefined) assertStringArray(values, errors.shape);
  }
  if (problem === 'conflict') throw errors.conflict();
  if (problem === 'missing' && errors.missing !== undefined) throw errors.missing();
  return problem !== 'missing';
}

export function listEditProblem(edit: ListEdit): ListEditProblem | undefined {
  const hasAdd = (edit.add ?? []).length > 0;
  const hasRemove = (edit.remove ?? []).length > 0;
  if (edit.set !== undefined && (hasAdd || hasRemove)) return 'conflict';
  if (edit.set === undefined && !hasAdd && !hasRemove) return 'missing';
  return undefined;
}

/** Merge a checked edit; the caller supplies its own normalization. */
export function mergeListEdit(
  current: readonly string[],
  edit: ListEdit,
  normalize: (values: string[]) => string[],
): string[] {
  if (edit.set !== undefined) return normalize([...edit.set]);
  const result = [...current];
  for (const value of normalize([...(edit.add ?? [])])) {
    if (!result.includes(value)) result.push(value);
  }
  const removed = normalize([...(edit.remove ?? [])]);
  return result.filter((value) => !removed.includes(value));
}
