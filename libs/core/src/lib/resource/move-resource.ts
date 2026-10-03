import { resolveMutationSink } from './resource-mutation';
import { validateKey } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import type { RunOutcome } from '../run-outcome';
import { describeFolderProblem } from './collection-folders';
import { sweepKeys } from './collection-sweep';
import { folderAddressExists } from './folder-address';
import { type MoveOptions, type MoveOptionsWithConfig, resolveMoveDestination } from './move-destination';
import { withMoveOutcome } from './move-outcome';
import { type MoveSelection, planMove } from './move-plan';
import { type RelocationResult, relocateEntries } from './relocate-entries';

export interface MoveResourceParams {
  /** Full source key, or a prefix pattern ending with `*` (`common.buttons.*`). */
  readonly source: string;
  /** Full destination key; for a pattern, the prefix the matched keys move under (`''`: the collection root). */
  readonly destination: string;
  /** Replace an existing destination entry. Default: false (the key is skipped with a warning). */
  readonly override?: boolean;
  /** Plain destination collection name. Default: the source collection. */
  readonly toCollection?: string;
}

export interface MoveResourceResult {
  readonly outcome: RunOutcome;
  movedCount: number;
  warnings: string[];
  errors: string[];
}

/**
 * Moves resources from source to destination, within a collection or into another one, as one
 * Entry Relocation (`relocateEntries`: lossless, one save per folder, locales fitted to the
 * destination collection). Supports single key move and wildcard pattern move (ending with *).
 * Per-key failures are reported in the result, not thrown.
 */
export function moveResource(
  collection: Collection,
  params: MoveResourceParams,
  options: MoveOptionsWithConfig,
): Promise<MoveResourceResult>;
export function moveResource(
  collection: Collection,
  params: MoveResourceParams & { readonly toCollection?: undefined },
  options?: MoveOptions,
): Promise<MoveResourceResult>;
export async function moveResource(
  collection: Collection,
  params: MoveResourceParams,
  options: MoveOptions = {},
): Promise<MoveResourceResult> {
  const { source, destination, override = false } = params;
  const destinationCollection = resolveMoveDestination(collection, params.toCollection, options);
  const result: Omit<MoveResourceResult, 'outcome'> = { movedCount: 0, warnings: [], errors: [] };

  let selection: Exclude<MoveSelection, { readonly kind: 'folder' }>;
  if (source.endsWith('*')) {
    const expanded = expandPattern(collection, source, result);
    if (!expanded) return withMoveOutcome(result);
    selection = expanded;
  } else {
    selection = { kind: 'key', key: source };
  }

  const plan = planMove({
    source: collection,
    destination: destinationCollection,
    selection,
    destinationPath: destination,
  });
  const relocation = relocateEntries(plan, {
    override,
    onMutation: resolveMutationSink(collection, options),
  });
  return withMoveOutcome(mergeRelocation(result, relocation));
}

/** Adds a relocation's outcome to a move result: collisions become warnings. */
export function mergeRelocation<T extends Omit<MoveResourceResult, 'outcome'>>(
  result: T,
  relocation: RelocationResult,
): T {
  result.movedCount += relocation.moved.length;
  result.warnings.push(...relocation.collisions.map(({ to }) => collisionWarning(to)));
  result.errors.push(...relocation.errors);
  return result;
}

function collisionWarning(destinationKey: string): string {
  return `Destination key already exists: ${destinationKey}. Use override option to force move.`;
}

/**
 * Select every key the Collection Sweep finds under a `prefix.*` pattern.
 * `undefined` (with the reason in `result`) when nothing can move.
 */
function expandPattern(
  collection: Collection,
  pattern: string,
  result: Omit<MoveResourceResult, 'outcome'>,
): Extract<MoveSelection, { readonly kind: 'pattern' }> | undefined {
  const prefix = pattern.slice(0, -1); // remove '*'
  const cleanPrefix = prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;

  if (cleanPrefix.length > 0) {
    try {
      validateKey(cleanPrefix);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  if (!folderAddressExists(collection.translationsFolder, cleanPrefix)) {
    result.warnings.push(`No folder found for prefix ${cleanPrefix}. Nothing moved.`);
    return undefined;
  }

  const { keys, problems } = sweepKeys(collection, { startPath: cleanPrefix });
  result.errors.push(...problems.map((problem) => describeFolderProblem(problem)));

  return { kind: 'pattern', prefix: cleanPrefix, keys };
}
