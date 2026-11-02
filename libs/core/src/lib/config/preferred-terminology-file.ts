import { relative, resolve } from 'node:path';
import {
  normalizePreferredTermRules,
  type PreferredTermRule,
  sortPreferredTermRules,
  validatePreferredTermRules,
} from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { formatRuleErrors } from '../errors/format-rule-errors';
import {
  CoreOperationError,
  InvalidConfigError,
  InvalidProjectTermsEditError,
  PreferredTerminologyValidationError,
} from '../errors/lingo-tracker-error';
import {
  readTermFile,
  resolveTermFilePath,
  type TermFile,
  type TermFileKind,
  type TermFileRead,
  writeTermFile,
} from './term-file';

/**
 * Default location of the preferred-terminology file, resolved against the directory
 * holding `.lingo-tracker.json`. Used whenever the config has no explicit
 * `preferredTerminologyFile` pointer. There is one global file; collections cannot
 * override it.
 */
export const DEFAULT_PREFERRED_TERMINOLOGY_FILENAME = '.lingo-tracker-preferred-terminology.json';

/** Outcome of reading the preferred-terminology file. Never thrown; problems are reported in-band. */
export interface LoadPreferredTerminologyResult {
  /** Normalized rules in file order; empty when the file is absent or broken. */
  rules: PreferredTermRule[];
  /** Absolute path of the file, whether or not it exists yet. */
  filePath: string;
  /** Set when the file exists but cannot be used: unreadable, malformed JSON, wrong shape, or invalid rules. */
  error?: string;
  /** Set when an explicitly configured file does not exist. */
  warning?: string;
}

/** The preferred-terminology file: a bare JSON array of `{ discouraged, preferred, reason? }` rules, in file order. */
const PREFERRED_TERMINOLOGY: TermFileKind<PreferredTermRule> = {
  label: 'Preferred terminology file',
  items: 'rules',
  parse: (items, filePath) => {
    const errors = validatePreferredTermRules(items);
    return errors.length > 0
      ? { error: `Preferred terminology file has invalid rules: ${filePath} (${formatRuleErrors(errors)})` }
      : { value: normalizePreferredTermRules(items as PreferredTermRule[]) };
  },
  serialize: (rules) => sortPreferredTermRules(normalizePreferredTermRules(rules)),
};

/**
 * The preferred-terminology file: the config's `preferredTerminologyFile` pointer resolved
 * against `cwd` (the directory holding the config file), falling back to the default filename.
 * A pointer that is neither a string nor unset (`null` counts as unset) is reported through
 * `invalid`: `.lingo-tracker.json` is hand-edited and not schema-validated.
 */
export function resolvePreferredTerminologyFile(
  config: Pick<LingoTrackerConfig, 'preferredTerminologyFile'>,
  cwd: string = process.cwd(),
): TermFile {
  const invalid = invalidPointerError(config);
  if (invalid !== undefined) {
    return { path: resolve(cwd, DEFAULT_PREFERRED_TERMINOLOGY_FILENAME), explicit: false, invalid };
  }
  const pointer = config.preferredTerminologyFile ?? DEFAULT_PREFERRED_TERMINOLOGY_FILENAME;
  return { path: resolveTermFilePath(pointer, cwd), explicit: config.preferredTerminologyFile != null };
}

/**
 * Absolute path of the preferred-terminology file (see {@link resolvePreferredTerminologyFile}).
 *
 * @throws {InvalidConfigError} The pointer is neither a string nor unset.
 */
export function resolvePreferredTerminologyFilePath(
  config: Pick<LingoTrackerConfig, 'preferredTerminologyFile'>,
  cwd: string = process.cwd(),
): string {
  const file = resolvePreferredTerminologyFile(config, cwd);
  if (file.invalid !== undefined) {
    throw new InvalidConfigError(file.invalid);
  }
  return file.path;
}

/**
 * Reads the preferred-terminology file (see `readTermFile` for the missing-file and problem rules).
 *
 * Never throws. A non-string pointer, malformed JSON, a non-array payload, or any rule failing
 * validation sets `error` and returns no rules: terminology checks are advisory, so callers warn
 * and skip them rather than abort, except `validate`, which reports a broken file as a failure.
 */
export function loadPreferredTerminology(
  config: Pick<LingoTrackerConfig, 'preferredTerminologyFile'>,
  cwd: string = process.cwd(),
): LoadPreferredTerminologyResult {
  const { value, filePath, error, warning } = readTermFile(
    PREFERRED_TERMINOLOGY,
    resolvePreferredTerminologyFile(config, cwd),
  );
  return { rules: value, filePath, ...(error !== undefined && { error }), ...(warning !== undefined && { warning }) };
}

/** Reads the preferred-terminology file at a resolved location. Never throws. */
export function readPreferredTerminologyFile(file: TermFile): TermFileRead<PreferredTermRule> {
  return readTermFile(PREFERRED_TERMINOLOGY, file);
}

/**
 * Writes the preferred-terminology file: normalized, sorted by discouraged term, 2-space
 * JSON with a trailing newline. Sorting keeps an added rule to a small diff regardless
 * of where it lands. An empty `reason` is dropped rather than written as `""`.
 *
 * Throws `PreferredTerminologyValidationError` (with the per-row errors attached) when
 * the rules fail validation, and `ParentDirectoryMissingError` when the parent directory is missing;
 * in both cases the file is left untouched. The file is created when absent.
 */
export function writePreferredTerminology(filePath: string, rules: readonly PreferredTermRule[]): void {
  writePreferredTerminologyRules(() => filePath, rules, false);
}

export interface PreferredTerminologyEdit {
  readonly set?: readonly PreferredTermRule[];
  readonly upsert?: PreferredTermRule;
  readonly remove?: string;
}

export interface PreferredTerminologyEditResult extends LoadPreferredTerminologyResult {
  readonly action?: 'added' | 'updated' | 'removed';
  readonly changedRule?: PreferredTermRule;
}

/** Edits the project rule file; a failed validation leaves it untouched. */
export function editPreferredTerminology(
  config: Pick<LingoTrackerConfig, 'preferredTerminologyFile'>,
  edit: PreferredTerminologyEdit,
  cwd: string = process.cwd(),
  previous: LoadPreferredTerminologyResult | undefined,
): PreferredTerminologyEditResult {
  const replacement: unknown = edit.set;
  if (replacement !== undefined && !Array.isArray(replacement)) {
    throw new InvalidProjectTermsEditError(
      'Preferred terminology replacement must be an array of rules',
      'preferred-replacement-shape',
    );
  }
  const upsert: unknown = edit.upsert;
  if (
    upsert !== undefined &&
    (typeof upsert !== 'object' ||
      upsert === null ||
      !('discouraged' in upsert) ||
      typeof upsert.discouraged !== 'string' ||
      !('preferred' in upsert) ||
      typeof upsert.preferred !== 'string' ||
      ('reason' in upsert && upsert.reason !== undefined && typeof upsert.reason !== 'string'))
  ) {
    throw new InvalidProjectTermsEditError(
      'A preferred terminology upsert needs a rule with string terms',
      'preferred-upsert-shape',
    );
  }
  let loaded: LoadPreferredTerminologyResult | undefined;
  let next: PreferredTermRule[];
  let action: PreferredTerminologyEditResult['action'];
  let changedRule: PreferredTermRule | undefined;
  if (edit.set !== undefined) {
    next = [...edit.set];
  } else {
    if (previous === undefined)
      throw new CoreOperationError('Project Terms must read the rules before an incremental edit');
    loaded = previous;
    if (edit.upsert === undefined && edit.remove === undefined) return loaded;

    next = [...loaded.rules];
    if (edit.remove !== undefined) {
      const index = next.findIndex((rule) => sameTerm(rule.discouraged, edit.remove ?? ''));
      if (index === -1) {
        throw new CoreOperationError(
          `No preferred terminology rule for "${edit.remove.trim()}" (${displayTermPath(loaded.filePath, cwd)})`,
        );
      }
      const [removed] = next.splice(index, 1);
      changedRule = removed;
      action = 'removed';
    } else if (edit.upsert !== undefined) {
      // An upsert replaces the whole rule; an omitted reason clears the previous reason.
      const rule: PreferredTermRule = {
        discouraged: edit.upsert.discouraged.trim(),
        preferred: edit.upsert.preferred.trim(),
        ...(edit.upsert.reason?.trim() ? { reason: edit.upsert.reason.trim() } : {}),
      };
      const index = next.findIndex((existing) => sameTerm(existing.discouraged, rule.discouraged));
      if (index === -1) {
        next.push(rule);
        action = 'added';
      } else {
        next[index] = rule;
        action = 'updated';
      }
      changedRule = rule;
    }
  }

  const written = writePreferredTerminologyRules(() => resolvePreferredTerminologyFilePath(config, cwd), next, true);
  return loaded === undefined ? written : { ...loaded, ...written, action, changedRule };
}

/** Discouraged terms match after trimming and case folding. */
function sameTerm(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Renders a term-file path relative to the project root when it is inside it. */
export function displayTermPath(filePath: string, cwd: string): string {
  const rel = relative(cwd, filePath);
  return rel && !rel.startsWith('..') ? rel : filePath;
}

function writePreferredTerminologyRules(
  resolveFilePath: () => string,
  rules: readonly PreferredTermRule[],
  includeSubmittedRules: boolean,
): LoadPreferredTerminologyResult {
  // Validate before normalizing: rules may arrive from an untyped source (the API), and
  // normalizing trims fields that might not be strings. Validation trims on its own.
  const errors = validatePreferredTermRules(rules);
  if (errors.length > 0) {
    throw new PreferredTerminologyValidationError(errors, includeSubmittedRules ? rules : undefined);
  }
  const normalized = PREFERRED_TERMINOLOGY.serialize([...rules]);
  const filePath = resolveFilePath();
  writeTermFile(PREFERRED_TERMINOLOGY, filePath, normalized);
  return { rules: normalized, filePath };
}

/** Error message for a `preferredTerminologyFile` that is set but not a string; `undefined` when usable. */
function invalidPointerError(config: Pick<LingoTrackerConfig, 'preferredTerminologyFile'>): string | undefined {
  const pointer: unknown = config.preferredTerminologyFile;
  if (pointer === undefined || pointer === null || typeof pointer === 'string') {
    return undefined;
  }
  const type = Array.isArray(pointer) ? 'array' : typeof pointer;
  return `"preferredTerminologyFile" in .lingo-tracker.json must be a string path (got ${type})`;
}
