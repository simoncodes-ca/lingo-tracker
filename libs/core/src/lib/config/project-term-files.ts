/** Internal single read path for Project Terms collection and project snapshots. */

import { ProtectedTermsFileError } from '../errors/lingo-tracker-error';
import { readPreferredTerminologyFile } from './preferred-terminology-file';
import { readProtectedTermsFile } from './protected-terms-file';
import type { TermFile, TermFileRead } from './term-file';

/** A term file that could not be used as configured. */
export interface TermFileProblem {
  readonly file: 'protected-terms' | 'preferred-terminology';
  /** `error`: the file exists but cannot be used. `warning`: the config names a file that does not exist. */
  readonly severity: 'error' | 'warning';
  readonly filePath: string;
  readonly message: string;
}

function readProtectedScopes(protectedFiles: readonly TermFile[]) {
  const seen = new Map<string, TermFileRead<string>>();
  const reads = protectedFiles.map((file) => {
    const key = JSON.stringify([file.path, file.explicit, file.invalid]);
    const existing = seen.get(key);
    if (existing !== undefined) return existing;
    const read = readProtectedTermsFile(file);
    seen.set(key, read);
    return read;
  });
  return { reads, problems: [...seen.values()].flatMap((read) => problemsOf('protected-terms', read)) };
}

/** Stored-scope guard for pointer carry-over, through the same reader as project snapshots. */
export function readStoredProjectProtectedTerms(file: TermFile | undefined): readonly string[] {
  if (file === undefined) return [];
  const { reads, problems } = readProtectedScopes([file]);
  assertUsableProtectedFiles(problems);
  return reads[0]?.value ?? [];
}

export function readProjectTermFiles(protectedFiles: readonly TermFile[], preferredFile: TermFile) {
  const { reads, problems } = readProtectedScopes(protectedFiles);
  const preferred = readPreferredTerminologyFile(preferredFile);
  return {
    protectedFiles: reads,
    preferred,
    problems: [...problems, ...problemsOf('preferred-terminology', preferred)],
  };
}

/** Guard refusal is shared by collection, API, and selected-scope intents; callers supply order. */
export function assertUsableProtectedFiles(problems: readonly TermFileProblem[]): void {
  const broken = problems.find((problem) => problem.file === 'protected-terms' && problem.severity === 'error');
  if (broken) throw new ProtectedTermsFileError(broken.filePath, broken.message);
}

/**
 * A problem as one printable line. A broken file says the check it disabled was skipped
 * (`Preferred terminology checks skipped: <why>`); a missing named file is its own message.
 */
export function describeTermFileProblem(problem: TermFileProblem): string {
  if (problem.severity === 'warning') {
    return problem.message;
  }
  const check = problem.file === 'protected-terms' ? 'Protected terms checks' : 'Preferred terminology checks';
  return `${check} skipped: ${problem.message}`;
}

function problemsOf(file: TermFileProblem['file'], read: TermFileRead<unknown>): TermFileProblem[] {
  if (read.error !== undefined) {
    return [{ file, severity: 'error', filePath: read.filePath, message: read.error }];
  }
  if (read.warning !== undefined) {
    return [{ file, severity: 'warning', filePath: read.filePath, message: read.warning }];
  }
  return [];
}
