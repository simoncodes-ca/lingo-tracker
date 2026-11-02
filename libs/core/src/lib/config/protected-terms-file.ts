import { normalizeProtectedTerms } from '@simoncodes-ca/domain';
import type { LingoTrackerCollection } from '../../config/lingo-tracker-collection';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { ProtectedTermsFileError, ProtectedTermsFileNotSetError } from '../errors/lingo-tracker-error';
import {
  assertWritableTermFilePath,
  readTermFile,
  resolveTermFilePath,
  type TermFile,
  type TermFileKind,
  type TermFileRead,
  writeTermFile,
} from './term-file';

/**
 * Default location of the global protected-terms file, resolved against the
 * directory holding `.lingo-tracker.json`. Used whenever the global config has
 * no explicit `protectedTermsFile` pointer. Collections have no default — a
 * collection only contributes terms when it names a file of its own.
 */
export const DEFAULT_PROTECTED_TERMS_FILENAME = '.lingo-tracker-protected-terms.json';

/** A protected-terms file: a bare JSON array of strings, normalized and deduped. */
const PROTECTED_TERMS: TermFileKind<string> = {
  label: 'Protected terms file',
  items: 'strings',
  parse: (items, filePath) =>
    items.every((term): term is string => typeof term === 'string')
      ? { value: normalizeProtectedTerms([...items]) }
      : { error: `Protected terms file must contain only strings: ${filePath}` },
  serialize: (terms) => normalizeProtectedTerms(terms).sort((a, b) => a.localeCompare(b)),
};

/**
 * Resolves a `protectedTermsFile` pointer against `cwd` (the directory holding the
 * config file). Absolute pointers are used as-is.
 */
export function resolveProtectedTermsFilePath(pointer: string, cwd: string = process.cwd()): string {
  return resolveTermFilePath(pointer, cwd);
}

/** The global protected-terms file: the config pointer, else the default file beside the config. */
export function resolveGlobalProtectedTermsFile(config: LingoTrackerConfig, cwd: string = process.cwd()): TermFile {
  return {
    path: resolveProtectedTermsFilePath(config.protectedTermsFile ?? DEFAULT_PROTECTED_TERMS_FILENAME, cwd),
    explicit: config.protectedTermsFile !== undefined,
  };
}

/** Absolute path of the global protected-terms file, falling back to the default filename. */
export function resolveGlobalProtectedTermsFilePath(config: LingoTrackerConfig, cwd: string = process.cwd()): string {
  return resolveGlobalProtectedTermsFile(config, cwd).path;
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
 * Reads a protected-terms file. Never throws: a missing file reads as an empty list (with a
 * `warning` when the config names it), a malformed one as an empty list with an `error`.
 * See `readTermFile`.
 */
export function readProtectedTermsFile(file: TermFile): TermFileRead<string> {
  return readTermFile(PROTECTED_TERMS, file);
}

/** The stored list of one protected-terms file, as the file holds it. */
export interface StoredProtectedTerms {
  readonly terms: string[];
  /** Set when the config names the file and it does not exist (the list reads as empty). */
  readonly warning?: string;
}

/**
 * The terms of a protected-terms file, for callers that go on to write it or show it as
 * the stored list. A missing file is an empty list; when the config names it, with a `warning`.
 *
 * @throws {ProtectedTermsFileError} The file exists but is not a JSON array of strings.
 */
export function requireProtectedTermsFile(file: TermFile): StoredProtectedTerms {
  const read = readProtectedTermsFile(file);
  if (read.error !== undefined) {
    throw new ProtectedTermsFileError(read.filePath, read.error);
  }
  return read.warning === undefined ? { terms: read.value } : { terms: read.value, warning: read.warning };
}

/**
 * Throws unless `filePath` is somewhere a terms file could be written. Callers that
 * also mutate the config check this first, so a bad path fails before the pointer is
 * stored and can never leave the config aimed at a file that cannot exist.
 */
export function assertWritableProtectedTermsPath(filePath: string): void {
  assertWritableTermFilePath('protected terms file', filePath);
}

/** Resolves a collection's required terms destination and checks its parent before a write. */
export function resolveWritableCollectionProtectedTermsPath(
  collectionName: string,
  collection: Pick<LingoTrackerCollection, 'protectedTermsFile'>,
  cwd: string = process.cwd(),
): string {
  const filePath = resolveCollectionProtectedTermsFilePath(collection, cwd);
  if (!filePath) throw new ProtectedTermsFileNotSetError(collectionName);
  assertWritableProtectedTermsPath(filePath);
  return filePath;
}

/**
 * Writes a protected-terms file: normalized, sorted, one term per line, with a
 * trailing newline. Sorting keeps an added term to a one-line diff regardless of
 * where it lands — order carries no meaning in a list that is unioned and deduped.
 * The file is created when absent; a missing parent directory is an error.
 */
export function writeProtectedTermsFile(filePath: string, terms: string[]): void {
  writeTermFile(PROTECTED_TERMS, filePath, terms);
}

/**
 * Terms from the global file, and a `warning` when the config names a file that does not exist.
 * @throws {ProtectedTermsFileError} The file is not a JSON array of strings.
 */
export function readGlobalProtectedTerms(
  config: LingoTrackerConfig,
  cwd: string = process.cwd(),
): StoredProtectedTerms {
  return requireProtectedTermsFile(resolveGlobalProtectedTermsFile(config, cwd));
}

/**
 * Terms from a collection's own file, or an empty list when it names none; a `warning` when
 * the file it names does not exist.
 * @throws {ProtectedTermsFileError} The file is not a JSON array of strings.
 */
export function readCollectionProtectedTerms(
  collection: Pick<LingoTrackerCollection, 'protectedTermsFile'>,
  cwd: string = process.cwd(),
): StoredProtectedTerms {
  const path = resolveCollectionProtectedTermsFilePath(collection, cwd);
  return path === undefined ? { terms: [] } : requireProtectedTermsFile({ path, explicit: true });
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
