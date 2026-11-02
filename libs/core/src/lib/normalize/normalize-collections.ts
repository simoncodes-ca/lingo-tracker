import type { Collection } from '../config/open-collection';
import { ReadOnlyCollectionError } from '../errors/lingo-tracker-error';
import { describeFolderProblem } from '../resource/collection-folders';
import type { RunOutcome } from '../run-outcome';
import { type NormalizeOptions, type NormalizeResult, normalize } from './normalize';

const NUMERIC_FIELDS = [
  'entriesProcessed',
  'localesAdded',
  'valuesConverted',
  'tagsNormalized',
  'filesCreated',
  'filesUpdated',
  'foldersRemoved',
] as const;

export type CollectionNormalizeResult = Pick<
  NormalizeResult,
  (typeof NUMERIC_FIELDS)[number] | 'problems' | 'findings'
> & {
  collectionName: string;
};

export interface NormalizeCollectionsOptions extends NormalizeOptions {
  /** The CLI's --all selection skips read-only collections; a named selection refuses one. */
  readonly all?: boolean;
  readonly onEvent?: (
    event:
      | { kind: 'skip'; name: string }
      | { kind: 'start'; name: string }
      | { kind: 'result'; result: CollectionNormalizeResult }
      | { kind: 'error'; name: string; error: string },
  ) => void;
}

/** A refused selection has diagnostics only; a completed run carries its processed results. */
export type NormalizeCollectionsResult =
  | {
      readonly status: 'failed';
      readonly outcome: 'failed';
      readonly error: string;
      readonly details: readonly string[];
      readonly warnings: readonly string[];
    }
  | {
      readonly status: 'complete';
      readonly outcome: RunOutcome;
      readonly collections: CollectionNormalizeResult[];
      readonly totals: Record<(typeof NUMERIC_FIELDS)[number], number> & { collectionsProcessed: number };
      readonly warnings: readonly string[];
      readonly errors: readonly string[];
    };

/** Applies the CLI's named versus all read-only rule and totals a whole run. */
export async function normalizeCollections(
  collections: readonly Collection[],
  options: NormalizeCollectionsOptions = {},
): Promise<NormalizeCollectionsResult> {
  if (!options.all) {
    const readOnly = collections.find((collection) => collection.readOnly);
    if (readOnly) {
      return {
        status: 'failed',
        outcome: 'failed',
        error: new ReadOnlyCollectionError(readOnly.name).message,
        details: [],
        warnings: [],
      };
    }
  }

  const results: CollectionNormalizeResult[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  for (const collection of collections) {
    const { name } = collection;
    if (collection.readOnly) {
      warnings.push(`Skipping read-only collection: ${name}`);
      options.onEvent?.({ kind: 'skip', name });
      continue;
    }
    options.onEvent?.({ kind: 'start', name });
    let item: CollectionNormalizeResult;
    try {
      const result = await normalize(collection, { dryRun: options.dryRun ?? false });
      const { dryRun: _dryRun, ...report } = result;
      item = { collectionName: name, ...report };
    } catch (error) {
      const message = `Failed to normalize collection "${name}": ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      options.onEvent?.({ kind: 'error', name, error: message });
      continue;
    }
    warnings.push(...item.problems.map((problem) => describeFolderProblem(problem, { collectionName: name })));
    results.push(item);
    options.onEvent?.({ kind: 'result', result: item });
  }

  const totals = {
    ...(Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, 0])) as Record<
      (typeof NUMERIC_FIELDS)[number],
      number
    >),
    collectionsProcessed: results.length,
  };
  for (const result of results) {
    for (const field of NUMERIC_FIELDS) totals[field] += result[field];
  }
  return {
    status: 'complete',
    outcome: errors.length > 0 ? 'failed' : 'succeeded',
    collections: results,
    totals,
    errors,
    warnings,
  };
}
