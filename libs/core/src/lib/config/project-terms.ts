/** Project Terms owns the outcome policy for each intent. Reads are fresh per operation. */

import { effectiveProtectedTerms, findPreferredTermFindings, type PreferredTermRule } from '@simoncodes-ca/domain';
import type { Collection } from './open-collection';
import { assertUsableProtectedFiles, describeTermFileProblem, readProjectTermFiles } from './project-term-files';

/** A discouraged term in a base value, with the rule that flagged it. */
export interface TerminologyFinding {
  /** The full key of the resource whose base value was checked. */
  readonly key: string;
  /** The discouraged term, as spelled in the rule. */
  readonly discouraged: string;
  /** The suggested replacement, as spelled in the rule. */
  readonly preferred: string;
  /** Why the preferred term is preferred, when the rule says. */
  readonly reason?: string;
  /** The suggestion as one line, e.g. `consider "Investment" instead of "Expenditure"`. */
  readonly message: string;
}

/** The advisory outcome of checking a written base value against the preferred terminology. */
export interface TerminologyFindings {
  /** One finding per rule the value breaks, however often the term occurs. */
  readonly findings: readonly TerminologyFinding[];
  /** Rule-file problems that limited the check, as messages ready to print (see {@link describeTermFileProblem}). */
  readonly problems: readonly string[];
}

export interface ProjectTerms {
  /** The protected terms in force: the global list united with the collection's own, normalized and deduped. */
  readonly protectedTerms: readonly string[];
  /** The preferred-terminology rules, in file order. */
  readonly preferredTerminology: readonly PreferredTermRule[];
  /** Refuse broken protected files. Source imports warn about rule files; target guards warn about protected files. */
  forGuard(kind?: 'source' | 'target'): { readonly protectedTerms: readonly string[]; readonly warnings: string[] };
  /** Export notes: broken protected files are errors; missing named protected files are warnings. */
  forReport(): { readonly protectedTerms: readonly string[]; readonly errors: string[]; readonly warnings: string[] };
  /** Validation warns about protected files and missing rules; a broken rule file is a load error. */
  forValidation(): { readonly warnings: string[]; readonly loadError?: string };
  /**
   * Checks a base value stored under `key` against the preferred terminology. Advisory: the
   * value is stored either way. The rule-file problems ride along, so a caller that renders the
   * findings also tells the user when the check ran against no rules.
   */
  checkBaseValue(key: string, baseValue: string): TerminologyFindings;
}

/**
 * Reads the Project Terms of an opened collection. Reads every file once; nothing is cached, so
 * a long-lived process sees a hand edit or `git pull` on its next operation.
 */
export function readProjectTerms(collection: Pick<Collection, 'termFiles'>): ProjectTerms {
  const { termFiles } = collection;
  const { protectedFiles, preferred, problems } = readProjectTermFiles(
    [termFiles.protectedTerms, ...(termFiles.collectionProtectedTerms ? [termFiles.collectionProtectedTerms] : [])],
    termFiles.preferredTerminology,
  );
  const [global, own] = protectedFiles;
  const protectedTerms = effectiveProtectedTerms(global?.value ?? [], own?.value);
  const preferredTerminology = preferred.value;
  const terminologyProblems = problems
    .filter((problem) => problem.file === 'preferred-terminology')
    .map(describeTermFileProblem);

  return {
    protectedTerms,
    preferredTerminology,
    forGuard: (kind = 'target') => {
      assertUsableProtectedFiles(problems);
      return {
        protectedTerms,
        warnings:
          kind === 'source'
            ? terminologyProblems
            : problems.filter((problem) => problem.file === 'protected-terms').map(describeTermFileProblem),
      };
    },
    forReport: () => ({
      protectedTerms,
      errors: problems
        .filter((problem) => problem.file === 'protected-terms' && problem.severity === 'error')
        .map(describeTermFileProblem),
      warnings: problems
        .filter((problem) => problem.file === 'protected-terms' && problem.severity === 'warning')
        .map(describeTermFileProblem),
    }),
    forValidation: () => ({
      warnings: problems
        .filter((problem) => problem.file === 'protected-terms' || problem.severity === 'warning')
        .map(describeTermFileProblem),
      loadError: problems.find((problem) => problem.file === 'preferred-terminology' && problem.severity === 'error')
        ?.message,
    }),
    checkBaseValue: (key, baseValue) => ({
      findings: findPreferredTermFindings(baseValue, preferredTerminology).map(({ rule }) => ({
        key,
        discouraged: rule.discouraged,
        preferred: rule.preferred,
        ...(rule.reason ? { reason: rule.reason } : {}),
        message: describePreferredTermRule(rule),
      })),
      problems: terminologyProblems,
    }),
  };
}

/**
 * The suggestion as one line, e.g. `consider "Investment" instead of "Expenditure"`.
 * Every surface (add, edit, import, validate, the API) words it the same way.
 */
export function describePreferredTermRule(rule: PreferredTermRule): string {
  return `consider "${rule.preferred}" instead of "${rule.discouraged}"`;
}
