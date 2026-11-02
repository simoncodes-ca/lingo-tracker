import { isFolderPathUnder } from '@simoncodes-ca/domain';
import { describeFolderProblem } from './collection-folders';
import type { PruneResult } from './folder-pruning';

/** A completed folder move eligible for cleanup, in execution order. */
export interface MovePruneSource {
  readonly source: string;
  readonly empty: boolean;
}

/** Report-ready cleanup: diagnostics have already been classified and ordered. */
export interface MovePruneResult {
  readonly foldersDeleted: number;
  readonly warnings: string[];
  readonly errors: string[];
}

/** Classify cleanup for Move Run, preserving source diagnostics before general problems. */
export function summarizeMovePruning(result: PruneResult, sources: readonly MovePruneSource[]): MovePruneResult {
  const summary: MovePruneResult = { foldersDeleted: 0, warnings: [], errors: [] };
  let foldersDeleted = 0;
  const failedEmptySources = sources.filter(({ source, empty }) => empty && !result.removed.includes(source));
  for (const { source, empty } of sources) {
    if (result.removed.includes(source)) {
      foldersDeleted++;
      continue;
    }
    const kept = result.kept.filter(({ folderPath }) => isFolderPathUnder(source, folderPath));
    const resources = kept.filter(({ reason }) => reason === 'entries').flatMap(({ entries }) => entries ?? []);
    if (resources.length > 0)
      summary.warnings.push(`Source folder kept: it has resources again: ${resources.join(', ')}`);
    const problems = empty ? result.problems.filter(({ folderPath }) => isFolderPathUnder(source, folderPath)) : [];
    if (problems.length > 0) {
      const failure = movePruningFailure(problems.map((problem) => describeFolderProblem(problem)).join(', '), empty);
      summary.warnings.push(...failure.warnings);
      summary.errors.push(...failure.errors);
      continue;
    }
    const leftovers = kept.filter(({ reason }) => reason === 'content').flatMap(({ entries }) => entries ?? []);
    if (leftovers.length > 0)
      summary.warnings.push(
        `Source folder kept: holds content that is not part of the collection: ${leftovers.join(', ')}`,
      );
  }
  for (const problem of result.problems) {
    if (!failedEmptySources.some(({ source }) => isFolderPathUnder(source, problem.folderPath))) {
      summary.warnings.push(describeFolderProblem(problem));
    }
  }
  return { ...summary, foldersDeleted };
}

function movePruningFailure(error: unknown, empty: boolean): MovePruneResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    foldersDeleted: 0,
    warnings: empty ? [] : [`Resources moved but failed to delete source folder: ${message}`],
    errors: empty ? [`Failed to delete empty source folder: ${message}`] : [],
  };
}
