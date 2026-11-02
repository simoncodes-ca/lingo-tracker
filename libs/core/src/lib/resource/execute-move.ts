import { type Collection, type OpenedCollection, openProjectCollection } from '../config/open-collection';
import {
  CollectionNotFoundError,
  FolderNotFoundError,
  InvalidCollectionFolderError,
  ReadOnlyCollectionError,
} from '../errors/lingo-tracker-error';
import { describeFolderProblem } from './collection-folders';
import { fullKeyOf, sweepCollection, sweepKeys } from './collection-sweep';
import {
  folderAddressExists,
  inspectFolderAddress,
  resolveFolderAddress,
  validateFolderAddress,
} from './folder-address';
import { pruneEmptiedFolders } from './folder-pruning';
import { type MovePruneSource, summarizeMovePruning } from './move-cleanup';
import { movePatternPrefix, planMove, validateMoveInput } from './move-plan';
import { MoveReport, type MoveResult } from './move-report';
import { InterruptedRelocation, relocateEntries } from './relocate-entries';

/** Submitted addresses; patterns retain the trailing `*` syntax (including root `*`). */
export type MoveRequest = {
  readonly source: string;
  readonly destination: string;
  readonly override?: boolean;
  readonly toCollection?: string;
} & ({ readonly kind?: 'resource' } | { readonly kind: 'folder'; readonly nestUnderDestination?: boolean });

export type ExecuteMoveResult = MoveResult;

type Selection = Omit<MoveRequest, 'kind'> &
  ({ readonly kind: 'key' | 'pattern' } | { readonly kind: 'folder'; readonly nestUnderDestination?: boolean });
type FolderSelection = Extract<Selection, { kind: 'folder' }>;
interface CompletedMove {
  readonly report: ExecuteMoveResult;
  readonly emptiedFolders: readonly string[];
  readonly folderSource?: MovePruneSource;
}

type PreparedMove = { readonly destinationCollection: Collection } & (
  | { readonly kind: 'resource'; readonly selection: Exclude<Selection, { kind: 'folder' }> }
  | { readonly kind: 'folder'; readonly selection: FolderSelection; readonly plan: ReturnType<typeof prepareFolder> }
);

/** Synchronous move; selection/destination preconditions throw, operational failures enter the report. */
export function executeMove(collection: OpenedCollection, request: MoveRequest): ExecuteMoveResult {
  const selection = validateSelection(request);
  const prepared = prepareMove(collection, selection);
  return finishMoves(collection, [prepared], selection.kind === 'folder');
}

/** Preflight addresses, destinations and folder sources before writes; unavailable destinations are per-operation errors. */
export function executeMoves(collection: OpenedCollection, requests: readonly MoveRequest[]): ExecuteMoveResult {
  const selections = requests.map(validateSelection);
  const prepared = selections.map((selection): PreparedMove | { readonly error: string } => {
    try {
      return prepareMove(collection, selection);
    } catch (error) {
      if (error instanceof CollectionNotFoundError || error instanceof ReadOnlyCollectionError) {
        return { error: error.message };
      }
      throw error;
    }
  });
  return finishMoves(
    collection,
    prepared,
    selections.some(({ kind }) => kind === 'folder'),
  );
}

function finishMoves(
  collection: Collection,
  prepared: readonly (PreparedMove | { readonly error: string })[],
  includesFolder: boolean,
): ExecuteMoveResult {
  const report = new MoveReport();
  const cleanup: Pick<CompletedMove, 'emptiedFolders' | 'folderSource'>[] = [];
  try {
    for (const move of prepared) {
      if ('error' in move) report.fail(move.error);
      else {
        const result = executePreparedMove(collection, move);
        cleanup.push(result);
        report.merge(result.report);
      }
    }
  } catch (error) {
    if (error instanceof InterruptedRelocation) {
      cleanup.push({ emptiedFolders: error.emptiedFolders });
      throw error.original;
    }
    throw error;
  } finally {
    report.prune(
      summarizeMovePruning(
        pruneEmptiedFolders(
          collection,
          cleanup.flatMap(({ emptiedFolders }) => emptiedFolders),
        ),
        cleanup.flatMap(({ folderSource }) => (folderSource ? [folderSource] : [])),
      ),
    );
  }
  return includesFolder ? report.finish(true) : report.finish();
}

function validateSelection(request: MoveRequest): Selection {
  if (request.kind === 'folder') {
    validateFolderAddress(request.source, 'source folder path', false);
    validateFolderAddress(request.destination, 'destination folder path');
    return request;
  }
  const kind = validateMoveInput(request);
  return { ...request, kind };
}

function prepareMove(collection: OpenedCollection, selection: Selection): PreparedMove {
  const destinationCollection = resolveDestination(collection, selection.toCollection);
  if (selection.kind === 'folder') {
    return {
      kind: 'folder',
      selection,
      destinationCollection,
      plan: prepareFolder(collection, destinationCollection, selection),
    };
  }
  return { kind: 'resource', selection, destinationCollection };
}

function resolveDestination(source: OpenedCollection, name: string | undefined): Collection {
  if (!name) return source;
  try {
    return openProjectCollection(source, name, { writable: true });
  } catch (error) {
    if (error instanceof CollectionNotFoundError) throw new CollectionNotFoundError(name, 'destination');
    throw error;
  }
}

function executePreparedMove(collection: Collection, move: PreparedMove): CompletedMove {
  const report = new MoveReport();
  const { destinationCollection, selection } = move;
  if (move.kind === 'folder') return executeFolder(collection, move.selection, move.plan, report);

  const { source, destination, override = false } = selection;
  let plannedSelection: { kind: 'key'; key: string } | { kind: 'pattern'; prefix: string; keys: readonly string[] };
  if (selection.kind === 'pattern') {
    const prefix = movePatternPrefix(source);
    if (!folderAddressExists(collection.translationsFolder, prefix)) {
      report.warn(`No folder found for prefix ${prefix}. Nothing moved.`);
      return { report: report.finish(), emptiedFolders: [] };
    }
    const { keys, problems } = sweepKeys(collection, { startPath: prefix });
    for (const problem of problems) report.fail(describeFolderProblem(problem));
    plannedSelection = { kind: 'pattern', prefix, keys };
  } else {
    plannedSelection = { kind: 'key', key: source };
  }
  const plan = planMove({
    source: collection,
    destination: destinationCollection,
    selection: plannedSelection,
    destinationPath: destination,
  });
  const relocation = relocateEntries(plan, { override, deferPruning: true });
  report.merge(relocation);
  return { report: report.finish(), emptiedFolders: relocation.emptiedFolders ?? [] };
}

function prepareFolder(collection: Collection, destinationCollection: Collection, selection: FolderSelection) {
  const { source: sourceFolderPath, destination: destinationFolderPath, nestUnderDestination = true } = selection;

  const plan = planMove({
    source: collection,
    destination: destinationCollection,
    selection: { kind: 'folder', path: sourceFolderPath, nestUnderDestination },
    destinationPath: destinationFolderPath,
  });
  if (plan.kind === 'refused') {
    // Preserve no-op refusals before source inspection; descendant refusals still throw.
    if ('error' in plan) throw plan.error;
    return plan;
  }

  let isDirectory: boolean;
  try {
    isDirectory = inspectFolderAddress(collection.translationsFolder, sourceFolderPath).isDirectory;
    resolveFolderAddress(destinationCollection.translationsFolder, destinationFolderPath);
  } catch (error) {
    if (error instanceof InvalidCollectionFolderError) {
      throw new InvalidCollectionFolderError(error.problem, 'move', sourceFolderPath);
    }
    throw error;
  }
  if (!isDirectory) {
    throw new FolderNotFoundError(sourceFolderPath);
  }

  return plan;
}

function executeFolder(
  collection: Collection,
  selection: FolderSelection,
  plan: ReturnType<typeof prepareFolder>,
  report: MoveReport,
): CompletedMove {
  const { source: sourceFolderPath, override = false } = selection;
  if (plan.kind === 'refused') {
    report.warn(plan.warning);
    return { report: report.finish(true), emptiedFolders: [] };
  }

  // Extract all resource keys from the source folder tree
  const folders = [...sweepCollection(collection, { startPath: sourceFolderPath })];
  const resourceKeys = folders.flatMap((folder) =>
    folder.folder ? folder.folder.keys().map((key) => fullKeyOf(folder.folderPath, key)) : [],
  );
  const problems = folders.flatMap((folder) => (folder.problem ? [folder.problem] : []));
  const enumerationErrors = problems.map(
    (problem) => new InvalidCollectionFolderError(problem, 'move', sourceFolderPath).message,
  );

  // An unreadable folder would be deleted without its entries being copied; stop before any move/delete.
  if (enumerationErrors.length > 0) {
    for (const error of enumerationErrors) report.fail(error);
    return { report: report.finish(true), emptiedFolders: [] };
  }

  const empty = resourceKeys.length === 0;
  if (empty) report.warn('No resources found in source folder. Nothing to move.');

  // One Entry Relocation for the whole tree: each folder is read and written once.
  const relocation = empty
    ? { moved: [], collisions: [], errors: [], emptiedFolders: [] }
    : relocateEntries(plan.forKeys(resourceKeys), {
        override,
        deferPruning: true,
      });
  report.merge(relocation);

  // Keys that stayed in the source (collision without override, or an error); the source folder must be kept.
  const movedKeys = new Set(relocation.moved.map(({ from }) => from));
  const keptKeys = resourceKeys.filter((key) => !movedKeys.has(key));

  if (keptKeys.length > 0) {
    report.warn(`Source folder kept; resources not moved: ${keptKeys.join(', ')}`);
  }

  const cleaned = keptKeys.length === 0 && report.hasErrors === false;
  return {
    report: report.finish(true),
    // Include folders that were already empty, so folder moves retain their batch repair behaviour.
    emptiedFolders: [
      ...(relocation.emptiedFolders ?? []),
      ...(cleaned ? folders.map(({ absolutePath }) => absolutePath) : []),
    ],
    ...(cleaned ? { folderSource: { source: sourceFolderPath, empty } } : {}),
  };
}
