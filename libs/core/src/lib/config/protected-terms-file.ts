import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { effectiveProtectedTerms, normalizeProtectedTerms } from '@simoncodes-ca/domain';
import type { LingoTrackerCollection } from '../../config/lingo-tracker-collection';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';

/**
 * Default location of the global protected-terms file, resolved against the
 * directory holding `.lingo-tracker.json`. Used whenever the global config has
 * no explicit `protectedTermsFile` pointer. Collections have no default — a
 * collection only contributes terms when it names a file of its own.
 */
export const DEFAULT_PROTECTED_TERMS_FILENAME = '.lingo-tracker-protected-terms.json';

/** In-process cache keyed by absolute file path; cleared whenever a file is written. */
const cache = new Map<string, string[]>();

/** Drops every cached protected-terms file. Exported for tests and for callers that write out-of-band. */
export function clearProtectedTermsFileCache(): void {
  cache.clear();
}

/**
 * Resolves a `protectedTermsFile` pointer against `cwd` (the directory holding the
 * config file). Absolute pointers are used as-is.
 */
export function resolveProtectedTermsFilePath(pointer: string, cwd: string = process.cwd()): string {
  return isAbsolute(pointer) ? pointer : resolve(cwd, pointer);
}

/** Absolute path of the global protected-terms file, falling back to the default filename. */
export function resolveGlobalProtectedTermsFilePath(config: LingoTrackerConfig, cwd: string = process.cwd()): string {
  return resolveProtectedTermsFilePath(config.protectedTermsFile ?? DEFAULT_PROTECTED_TERMS_FILENAME, cwd);
}

/**
 * Absolute path of a collection's protected-terms file, or `undefined` when the
 * collection names none. Unlike the global list there is no default path, so a
 * collection without a pointer simply contributes nothing.
 */
export function resolveCollectionProtectedTermsFilePath(
  collection: Pick<LingoTrackerCollection, 'protectedTermsFile'>,
  cwd: string = process.cwd(),
): string | undefined {
  return collection.protectedTermsFile ? resolveProtectedTermsFilePath(collection.protectedTermsFile, cwd) : undefined;
}

/**
 * Reads a protected-terms file: a bare JSON array of strings, normalized and deduped.
 *
 * A missing file reads as an empty list — the normal state before any term has been
 * added. When the path came from an explicit pointer rather than the default, the
 * absence is also warned about, since a pointer at nothing is usually a typo.
 * Malformed JSON, a non-array payload, or a non-string element throws: silently
 * treating a corrupt file as "no protected terms" would let bad translations
 * through import unnoticed.
 */
export function readProtectedTermsFile(filePath: string, options: { explicit?: boolean } = {}): string[] {
  const cached = cache.get(filePath);
  if (cached) {
    return [...cached];
  }

  if (!existsSync(filePath)) {
    if (options.explicit) {
      console.warn(`Protected terms file not found: ${filePath}. Treating as an empty list.`);
    }
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Protected terms file is not valid JSON: ${filePath} (${detail})`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Protected terms file must contain a JSON array of strings: ${filePath}`);
  }
  if (parsed.some((term) => typeof term !== 'string')) {
    throw new Error(`Protected terms file must contain only strings: ${filePath}`);
  }

  const terms = normalizeProtectedTerms(parsed as string[]);
  cache.set(filePath, terms);
  return [...terms];
}

/**
 * Throws unless `filePath` is somewhere a terms file could be written. Callers that
 * also mutate the config check this first, so a bad path fails before the pointer is
 * stored and can never leave the config aimed at a file that cannot exist.
 */
export function assertWritableProtectedTermsPath(filePath: string): void {
  const parent = dirname(filePath);
  if (!existsSync(parent)) {
    throw new Error(`Cannot write protected terms file — directory does not exist: ${parent}`);
  }
}

/**
 * Writes a protected-terms file: normalized, sorted, one term per line, with a
 * trailing newline. Sorting keeps an added term to a one-line diff regardless of
 * where it lands — order carries no meaning in a list that is unioned and deduped.
 * The file is created when absent; a missing parent directory is an error.
 */
export function writeProtectedTermsFile(filePath: string, terms: string[]): void {
  assertWritableProtectedTermsPath(filePath);

  const normalized = normalizeProtectedTerms(terms).sort((a, b) => a.localeCompare(b));
  writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  cache.set(filePath, normalized);
}

/** Terms from the global file. */
export function readGlobalProtectedTerms(config: LingoTrackerConfig, cwd: string = process.cwd()): string[] {
  return readProtectedTermsFile(resolveGlobalProtectedTermsFilePath(config, cwd), {
    explicit: config.protectedTermsFile !== undefined,
  });
}

/** Terms from a collection's own file, or an empty list when it names none. */
export function readCollectionProtectedTerms(
  collection: Pick<LingoTrackerCollection, 'protectedTermsFile'>,
  cwd: string = process.cwd(),
): string[] {
  const filePath = resolveCollectionProtectedTermsFilePath(collection, cwd);
  return filePath ? readProtectedTermsFile(filePath, { explicit: true }) : [];
}

/**
 * Union of the global file and a collection's file — the terms actually in force
 * for that collection. Pass no collection for the global list alone.
 */
export function readEffectiveProtectedTerms(
  config: LingoTrackerConfig,
  collection?: Pick<LingoTrackerCollection, 'protectedTermsFile'>,
  cwd: string = process.cwd(),
): string[] {
  return effectiveProtectedTerms(
    readGlobalProtectedTerms(config, cwd),
    collection ? readCollectionProtectedTerms(collection, cwd) : undefined,
  );
}

/** Resolved protected terms for a whole config — what each scope's file actually contains. */
export interface ResolvedProtectedTerms {
  /** Terms in the global file. */
  globalTerms: string[];
  /** Absolute path of the global file, whether or not it exists yet. */
  globalFilePath: string;
  /** Per-collection terms and file path, keyed by collection name. `filePath` is absent when unconfigured. */
  collections: Record<string, { terms: string[]; filePath?: string }>;
}

/**
 * Reads every protected-terms file referenced by a config in one pass. Intended for
 * read-only consumers such as the API, which need both the terms and the paths they
 * came from. A file that fails to parse throws, exactly as a direct read would.
 */
export function resolveProtectedTermsForConfig(
  config: LingoTrackerConfig,
  cwd: string = process.cwd(),
): ResolvedProtectedTerms {
  const collections: ResolvedProtectedTerms['collections'] = {};
  for (const [name, collection] of Object.entries(config.collections ?? {})) {
    collections[name] = {
      terms: readCollectionProtectedTerms(collection, cwd),
      filePath: resolveCollectionProtectedTermsFilePath(collection, cwd),
    };
  }

  return {
    globalTerms: readGlobalProtectedTerms(config, cwd),
    globalFilePath: resolveGlobalProtectedTermsFilePath(config, cwd),
    collections,
  };
}
