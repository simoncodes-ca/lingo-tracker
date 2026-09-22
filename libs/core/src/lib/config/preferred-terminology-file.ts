import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import {
  normalizePreferredTermRules,
  type PreferredTermRule,
  type PreferredTermRuleError,
  sortPreferredTermRules,
  validatePreferredTermRules,
} from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';

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
  /** Set when the file exists but cannot be used: malformed JSON, wrong shape, or invalid rules. */
  error?: string;
  /** Set when an explicitly configured file does not exist. */
  warning?: string;
}

/** Thrown by `writePreferredTerminology` when the rule list fails validation. The file is left untouched. */
export class PreferredTerminologyValidationError extends Error {
  readonly errors: PreferredTermRuleError[];

  constructor(errors: PreferredTermRuleError[]) {
    super(`Invalid preferred terminology rules: ${formatRuleErrors(errors)}`);
    this.name = 'PreferredTerminologyValidationError';
    this.errors = errors;
  }
}

/** File identity recorded alongside cached rules; a change in either field means the file was edited. */
interface FileStamp {
  mtimeMs: number;
  size: number;
}

interface CacheEntry {
  rules: PreferredTermRule[];
  stamp: FileStamp;
}

/**
 * In-process cache keyed by absolute file path. Only successful loads are cached, and
 * writes refresh it. Each hit is revalidated against the file's `mtimeMs` and `size`, so
 * a long-lived process (the API server) picks up hand edits, `git pull`, or deletion on
 * the next load instead of serving stale rules until restart.
 */
const cache = new Map<string, CacheEntry>();

/** Drops every cached preferred-terminology file. Exported for tests and for callers that write out-of-band. */
export function clearPreferredTerminologyCache(): void {
  cache.clear();
}

/**
 * Absolute path of the preferred-terminology file: the config's
 * `preferredTerminologyFile` pointer resolved against `cwd` (the directory holding the
 * config file), falling back to the default filename. Absolute pointers are used as-is.
 */
export function resolvePreferredTerminologyFilePath(
  config: Pick<LingoTrackerConfig, 'preferredTerminologyFile'>,
  cwd: string = process.cwd(),
): string {
  const pointer = config.preferredTerminologyFile ?? DEFAULT_PREFERRED_TERMINOLOGY_FILENAME;
  return isAbsolute(pointer) ? pointer : resolve(cwd, pointer);
}

/**
 * Reads the preferred-terminology file: a bare JSON array of `{ discouraged, preferred,
 * reason? }` rules, normalized and kept in file order.
 *
 * Never throws. A missing file at the default path reads as an empty list — the normal
 * state before any rule has been added. A missing file at an explicit pointer also
 * reads as empty but sets `warning`, since a pointer at nothing is usually a typo.
 * Malformed JSON, a non-array payload, or any rule failing validation sets `error` and
 * returns no rules: terminology checks are advisory, so callers warn and skip them
 * rather than abort, except `validate`, which reports a broken file as a failure.
 */
export function loadPreferredTerminology(
  config: Pick<LingoTrackerConfig, 'preferredTerminologyFile'>,
  cwd: string = process.cwd(),
): LoadPreferredTerminologyResult {
  const filePath = resolvePreferredTerminologyFilePath(config, cwd);

  const stamp = readStamp(filePath);
  const cached = cache.get(filePath);
  if (cached) {
    if (stamp && sameStamp(cached.stamp, stamp)) {
      return { rules: cloneRules(cached.rules), filePath };
    }
    cache.delete(filePath);
  }

  if (!stamp) {
    if (config.preferredTerminologyFile !== undefined) {
      return {
        rules: [],
        filePath,
        warning: `Preferred terminology file not found: ${filePath}. Treating as an empty list.`,
      };
    }
    return { rules: [], filePath };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { rules: [], filePath, error: `Preferred terminology file is not valid JSON: ${filePath} (${detail})` };
  }

  if (!Array.isArray(parsed)) {
    return {
      rules: [],
      filePath,
      error: `Preferred terminology file must contain a JSON array of rules: ${filePath}`,
    };
  }

  const errors = validatePreferredTermRules(parsed);
  if (errors.length > 0) {
    return {
      rules: [],
      filePath,
      error: `Preferred terminology file has invalid rules: ${filePath} (${formatRuleErrors(errors)})`,
    };
  }

  const rules = normalizePreferredTermRules(parsed as PreferredTermRule[]);
  cache.set(filePath, { rules, stamp });
  return { rules: cloneRules(rules), filePath };
}

/**
 * Writes the preferred-terminology file: normalized, sorted by discouraged term, 2-space
 * JSON with a trailing newline. Sorting keeps an added rule to a small diff regardless
 * of where it lands. An empty `reason` is dropped rather than written as `""`.
 *
 * Throws `PreferredTerminologyValidationError` (with the per-row errors attached) when
 * the rules fail validation, and a plain `Error` when the parent directory is missing;
 * in both cases the file is left untouched. The file is created when absent.
 */
export function writePreferredTerminology(filePath: string, rules: readonly PreferredTermRule[]): void {
  // Validate before normalizing: rules may arrive from an untyped source (the API), and
  // normalizing trims fields that might not be strings. Validation trims on its own.
  const errors = validatePreferredTermRules(rules);
  if (errors.length > 0) {
    throw new PreferredTerminologyValidationError(errors);
  }

  const parent = dirname(filePath);
  if (!existsSync(parent)) {
    throw new Error(`Cannot write preferred terminology file — directory does not exist: ${parent}`);
  }

  const sorted = sortPreferredTermRules(normalizePreferredTermRules(rules));
  writeFileSync(filePath, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
  const stamp = readStamp(filePath);
  if (stamp) {
    cache.set(filePath, { rules: sorted, stamp });
  } else {
    cache.delete(filePath);
  }
}

/** One `row N field: message` entry per error, rows 1-based, joined into a single line. */
function formatRuleErrors(errors: readonly PreferredTermRuleError[]): string {
  return errors.map((error) => `row ${error.index + 1} ${error.field}: ${error.message}`).join('; ');
}

/** `mtimeMs` and `size` of the file, or `undefined` when it does not exist. */
function readStamp(filePath: string): FileStamp | undefined {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  return stats ? { mtimeMs: stats.mtimeMs, size: stats.size } : undefined;
}

function sameStamp(a: FileStamp, b: FileStamp): boolean {
  return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

/** Copies rules so a caller mutating the result cannot poison the cache. */
function cloneRules(rules: readonly PreferredTermRule[]): PreferredTermRule[] {
  return rules.map((rule) => ({ ...rule }));
}
