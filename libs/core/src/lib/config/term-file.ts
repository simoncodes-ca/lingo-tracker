/**
 * Term file — the one way core reads and writes a project's term lists: the protected-terms
 * files and the preferred-terminology file. Both are a bare JSON array beside `.lingo-tracker.json`,
 * named by a config pointer with a default filename. This module owns what they share: pointer
 * resolution, the missing-file rule, the read (problems reported, never thrown), and the write
 * (2-space JSON, trailing newline, typed errors). A {@link TermFileKind} supplies what differs:
 * how the array's items are validated and normalized, and how a value is serialized.
 *
 * There is no cache. Each reader reads once per operation (the Translator when it opens, an
 * import or export run, one add or edit), and the files are a few hundred bytes, so a read costs
 * about what a stat would; a cache validated by stat would save nothing, and the unvalidated one
 * this replaced served stale terms to the API after a hand edit or `git pull`.
 *
 * @module term-file
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { ParentDirectoryMissingError } from '../errors/lingo-tracker-error';
import { hasFsErrorCode } from '../file-io/fs-error';

/** A term file's resolved location, and whether the config names it. */
export interface TermFile {
  /** Absolute path, whether or not the file exists yet. */
  readonly path: string;
  /** True when the config names the file; a missing named file is a problem, a missing default is not. */
  readonly explicit: boolean;
  /** Why the config pointer cannot be used, when it cannot (a non-string value). The file is not read. */
  readonly invalid?: string;
}

/** What a kind of term file holds (a JSON array of `T`), and how it is checked and written. */
export interface TermFileKind<T> {
  /** Starts the messages, e.g. `Protected terms file`. */
  readonly label: string;
  /** What the JSON array must hold, e.g. `strings`, for the wrong-shape message. */
  readonly items: string;
  /** Checks and normalizes the parsed array; a message when it cannot be used. */
  readonly parse: (items: readonly unknown[], filePath: string) => { readonly value: T[] } | { readonly error: string };
  /** The value as written: normalized and sorted, so an added entry is a small diff. */
  readonly serialize: (value: T[]) => T[];
}

/** Outcome of reading a term file. Never thrown; problems are reported in-band. */
export interface TermFileRead<T> {
  /** The file's contents, or `[]` when it is absent or unusable. */
  readonly value: T[];
  readonly filePath: string;
  /** Set when the file exists but cannot be used: unreadable, malformed JSON, the wrong shape, or invalid items. */
  readonly error?: string;
  /** Set when a file the config names does not exist. */
  readonly warning?: string;
}

/**
 * Resolves a config pointer against `cwd` (the directory holding `.lingo-tracker.json`).
 * An absolute pointer is used as it stands.
 */
export function resolveTermFilePath(pointer: string, cwd: string = process.cwd()): string {
  return isAbsolute(pointer) ? pointer : resolve(cwd, pointer);
}

/**
 * Reads a term file.
 *
 * A missing file reads as `[]`: the normal state before the first entry is
 * added. When the config names the file, its absence is also reported as a `warning`, since a
 * pointer at nothing is usually a typo. A file that exists but cannot be used (unreadable,
 * not valid JSON, not an array, or items the kind rejects) reads as empty with an `error`.
 * Nothing is thrown: the checks these lists feed are advisory or guarded elsewhere, so every
 * caller decides what a problem means for it.
 */
export function readTermFile<T>(kind: TermFileKind<T>, file: TermFile): TermFileRead<T> {
  const { path: filePath } = file;
  if (file.invalid !== undefined) {
    return { value: [], filePath, error: file.invalid };
  }

  let contents: string;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (hasFsErrorCode(error, 'ENOENT')) {
      return file.explicit
        ? { value: [], filePath, warning: `${kind.label} not found: ${filePath}. Treating as an empty list.` }
        : { value: [], filePath };
    }
    // EISDIR, ENOTDIR, EACCES, ...: a pointer at something that is not a readable file.
    return { value: [], filePath, error: `${kind.label} cannot be read: ${filePath} (${detail(error)})` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    return { value: [], filePath, error: `${kind.label} is not valid JSON: ${filePath} (${detail(error)})` };
  }
  if (!Array.isArray(parsed)) {
    return {
      value: [],
      filePath,
      error: `${kind.label} must contain a JSON array of ${kind.items}: ${filePath}`,
    };
  }

  const result = kind.parse(parsed, filePath);
  return 'error' in result ? { value: [], filePath, error: result.error } : { value: result.value, filePath };
}

/**
 * Throws unless `filePath` is somewhere a term file could be written. Callers that also change
 * the config check this first, so a bad path fails before the pointer is stored.
 *
 * @throws {ParentDirectoryMissingError} The parent directory does not exist.
 */
export function assertWritableTermFilePath(label: string, filePath: string): void {
  const parent = dirname(filePath);
  if (!existsSync(parent)) {
    throw new ParentDirectoryMissingError(label, filePath, parent);
  }
}

/**
 * Writes a term file: the serialized value as 2-space JSON with a trailing newline. The file is
 * created when absent. Validation of the value is the kind-specific writer's job, before this.
 *
 * @throws {ParentDirectoryMissingError} The parent directory does not exist.
 */
export function writeTermFile<T>(kind: TermFileKind<T>, filePath: string, value: T[]): void {
  assertWritableTermFilePath(kind.label.toLowerCase(), filePath);
  writeFileSync(filePath, `${JSON.stringify(kind.serialize(value), null, 2)}\n`, 'utf8');
}

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
