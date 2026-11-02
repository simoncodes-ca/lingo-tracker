import { existsSync, lstatSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { folderPathFromSegments, folderPathSegments, isValidSegment } from '@simoncodes-ca/domain';
import type { FolderPathPart } from '../errors/error-messages';
import { InvalidCollectionFolderError, InvalidFolderPathError } from '../errors/lingo-tracker-error';
import { hasFsErrorCode } from '../file-io/fs-error';
import type { CollectionFolderProblem } from './collection-folders';

/** A dot-delimited folder address. The empty address names the collection root. */
export function validateFolderAddress(address: string, part: FolderPathPart, allowRoot = true): string[] {
  if (address === '' && allowRoot === false) throw new InvalidFolderPathError(part, '');
  const segments = folderPathSegments(address);
  for (const segment of segments) {
    if (!isValidSegment(segment)) throw new InvalidFolderPathError(part, segment);
  }
  return segments;
}

/** Resolve a folder address beneath a collection's translations folder. */
export function resolveFolderAddress(translationsFolder: string, address: string, cwd = process.cwd()): string {
  const segments = folderPathSegments(address);
  const root = resolve(cwd, translationsFolder);
  const absolutePath = resolve(root, ...segments);
  assertCollectionFolderPath(root, absolutePath);
  return absolutePath;
}

/** Whether the addressed path exists (a file also counts as existing). */
export function folderAddressExists(translationsFolder: string, address: string, cwd = process.cwd()): boolean {
  return existsSync(resolveFolderAddress(translationsFolder, address, cwd));
}

/** Resolve an address once and check whether it names an existing directory. */
export function inspectFolderAddress(
  translationsFolder: string,
  address: string,
): { readonly absolutePath: string; readonly isDirectory: boolean } {
  const absolutePath = resolveFolderAddress(translationsFolder, address);
  return { absolutePath, isDirectory: existsSync(absolutePath) && statSync(absolutePath).isDirectory() };
}

/** Checks collection-relative segments without following a symbolic link. Missing paths may be created. */
export function checkCollectionFolderPath(
  translationsFolder: string,
  folderPath: string,
): CollectionFolderProblem | undefined {
  const root = resolve(translationsFolder);
  const relativePath = relative(root, resolve(folderPath));
  const segments = relativePath.split(sep).filter(Boolean);
  if (segments[0] === '..' || isAbsolute(relativePath)) {
    return {
      kind: 'unreadable',
      // An outside path has no collection address; use a relative filesystem label.
      folderPath: relativePath.split(sep).join('/'),
      absolutePath: resolve(folderPath),
      message: 'This folder is outside the collection',
    };
  }
  for (let length = 1; length <= segments.length; length++) {
    const absolutePath = join(root, ...segments.slice(0, length));
    const folderPath = folderPathFromSegments(segments.slice(0, length));
    const problem = (message: string): CollectionFolderProblem => ({
      kind: 'unreadable',
      folderPath,
      absolutePath,
      message,
    });
    try {
      if (lstatSync(absolutePath).isSymbolicLink()) {
        return problem('This folder is a symbolic link and is not part of the collection');
      }
    } catch (error) {
      if (hasFsErrorCode(error, 'ENOENT')) return undefined;
      return problem(error instanceof Error ? error.message : String(error));
    }
  }
  return undefined;
}

/** Refuses a collection folder before a direct read or write. */
export function assertCollectionFolderPath(translationsFolder: string, absolutePath: string): void {
  const problem = checkCollectionFolderPath(translationsFolder, absolutePath);
  if (problem) throw new InvalidCollectionFolderError(problem);
}
