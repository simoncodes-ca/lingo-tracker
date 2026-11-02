import { DEFAULT_IMPORT_STRATEGY, importStrategyPolicy } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { type ProjectTerms, readProjectTerms } from '../config/project-terms';
import { assertImportableLocale } from './assert-importable-locale';
import { calculateImportStatistics, calculateStatusTransitions } from './import-statistics';
import type {
  ICUAutoFix,
  ICUAutoFixError,
  ImportChange,
  ImportResult,
  ImportRunOptions,
  ImportStrategy,
} from './types';

/** Import options with the strategy and its defaults filled in. */
export type ResolvedImportOptions = ImportRunOptions & {
  readonly strategy: ImportStrategy;
  readonly createMissing: boolean;
  readonly updateComments: boolean;
  readonly updateTags: boolean;
};

/** A rejected resource, or an empty value skipped by validation. */
export interface ImportIssue {
  readonly key: string;
  readonly type: 'failed' | 'skipped';
  readonly reason: string;
  /** Absent for skips and repeated hierarchical conflicts, which share one diagnostic. */
  readonly error?: string;
  /**
   * Diagnostic rank within this batch (lower first, stable for ties; defaults to zero).
   * Validation changes follow input order, but its diagnostics put conflicts first in key-tree
   * order. One issue list cannot express both orders without this separate diagnostic rank.
   */
  readonly diagnosticOrder?: number;
}

/**
 * Records each rejection through one channel. Changes retain issue order; diagnostics use
 * their explicit order when validation's conflict-first order differs from resource order.
 * Empty-value skips carry no error and retain their position among validation changes.
 */
export function recordImportIssues(session: ImportSession, issueOrIssues: ImportIssue | readonly ImportIssue[]): void {
  const issues = 'key' in issueOrIssues ? [issueOrIssues] : issueOrIssues;
  for (const { key, type, reason } of issues) session.changes.push({ key, type, reason });
  for (const issue of [...issues].sort((left, right) => (left.diagnosticOrder ?? 0) - (right.diagnosticOrder ?? 0))) {
    if (issue.error !== undefined) session.errors.push(issue.error);
  }
}

/**
 * The state of one import run. Every step of {@link importResources} reads the settings from
 * here and appends its findings here, so no step passes accumulators to the next.
 */
export interface ImportSession {
  readonly collection: Collection;
  readonly options: ResolvedImportOptions;
  /** The collection's Project Terms, read once for the run. */
  readonly terms: ProjectTerms;
  /** The import writes base values (`source`), not translations. Only the `migration` strategy allows it. */
  readonly isBaseLocaleImport: boolean;
  readonly changes: ImportChange[];
  readonly warnings: string[];
  readonly errors: string[];
  readonly filesAffected: Set<string>;
  readonly filesModified: Set<string>;
  readonly icuAutoFixes: ICUAutoFix[];
  readonly icuAutoFixErrors: ICUAutoFixError[];
}

/**
 * Starts an import run: applies the strategy defaults (`createMissing`, `updateComments`,
 * `updateTags`; explicit options win only for migration), refuses a base-locale import unless the strategy is
 * `migration`, and reads the collection's Project Terms. A protected-terms file that cannot be
 * used stops the run before anything is written; a preferred-terminology problem only limits the
 * advisory check, so it opens the run's warnings (on a base-locale import, the only kind that
 * checks), as does a named protected-terms file that does not exist (on a target-locale import).
 *
 * @throws {InvalidImportLocaleError} The target locale is the collection's base locale and the strategy is not `migration`.
 * @throws {ProtectedTermsFileError} A protected-terms file exists but is not a JSON array of strings.
 */
export function openImportSession(collection: Collection, options: ImportRunOptions): ImportSession {
  const strategy = options.strategy ?? DEFAULT_IMPORT_STRATEGY;
  const { defaults, honoursOptionOverrides } = importStrategyPolicy(strategy);
  const isBaseLocaleImport = options.locale === collection.baseLocale;

  assertImportableLocale(collection, options.locale, strategy);

  const terms = readProjectTerms(collection);
  const { warnings } = terms.forGuard(isBaseLocaleImport ? 'source' : 'target');

  return {
    collection,
    terms,
    options: {
      ...options,
      strategy,
      createMissing: honoursOptionOverrides
        ? (options.createMissing ?? defaults.createMissing)
        : defaults.createMissing,
      updateComments: honoursOptionOverrides
        ? (options.updateComments ?? defaults.updateComments)
        : defaults.updateComments,
      updateTags: honoursOptionOverrides ? (options.updateTags ?? defaults.updateTags) : defaults.updateTags,
    },
    isBaseLocaleImport,
    changes: [],
    warnings,
    errors: [],
    filesModified: new Set(),
    filesAffected: new Set(),
    icuAutoFixes: [],
    icuAutoFixErrors: [],
  };
}

/** The result of a finished import run: counts and status transitions derived from its changes. */
export function sessionResult(session: ImportSession): ImportResult {
  const statistics = calculateImportStatistics(session.changes);

  return {
    strategy: session.options.strategy,
    locale: session.options.locale,
    collection: session.collection.name,
    ...statistics,
    changes: session.changes,
    statusTransitions: calculateStatusTransitions(session.changes),
    filesModified: Array.from(session.filesModified),
    filesAffected: Array.from(session.filesAffected),
    warnings: session.warnings,
    errors: session.errors,
    icuAutoFixes: session.icuAutoFixes,
    icuAutoFixErrors: session.icuAutoFixErrors,
    dryRun: session.options.dryRun ?? false,
  };
}
