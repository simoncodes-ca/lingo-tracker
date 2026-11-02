/**
 * Pure Folder Address arithmetic. '' is the root and has no segments.
 * Non-root paths keep empty segments verbatim. Paths with empty segments are
 * malformed and rejected by key/folder validation, never silently collapsed. Arithmetic does
 * not trim whitespace or validate input.
 */
export function folderPathSegments(path: string): string[] {
  return path === '' ? [] : path.split('.');
}

/** Builds an address from segments without filtering or validating them. */
export function folderPathFromSegments(segments: readonly string[]): string {
  return segments.join('.');
}

/** Parent address, or null at the root/top-level boundary. */
export function parentFolderPath(path: string): string | null {
  const segments = folderPathSegments(path);
  return segments.length < 2 ? null : folderPathFromSegments(segments.slice(0, -1));
}

/** Last segment; the root has an empty name. */
export function folderPathLeaf(path: string): string {
  return folderPathSegments(path).at(-1) ?? '';
}

/** Strict ancestors, outermost first; excludes both the root and the path itself. */
export function collectAncestorPaths(path: string): string[] {
  const segments = folderPathSegments(path);
  const ancestors: string[] = [];
  for (let length = 1; length < segments.length; length++) {
    const ancestor = folderPathFromSegments(segments.slice(0, length));
    // A malformed leading dot can produce the root; strict ancestors exclude it
    // so Tracker never adds a root address to its folder expansion paths.
    if (ancestor !== '') ancestors.push(ancestor);
  }
  return ancestors;
}

/** Whether destination is strictly below source; segment boundaries matter. */
export function isDescendantFolderPath(source: string, destination: string): boolean {
  return source === '' ? destination !== '' : destination.startsWith(`${source}.`);
}

/** Whether path is the source folder itself or one of its descendants. */
export function isFolderPathUnder(source: string, path: string): boolean {
  return source === path || isDescendantFolderPath(source, path);
}

/** Joins a folder and a key additively; an empty folder names the root. */
export function joinFolderPath(folderPath: string, key: string): string {
  return folderPath === '' ? key : `${folderPath}.${key}`;
}

/** Replaces a source prefix, including the source itself; unrelated paths stay unchanged. */
export function rebaseFolderPath(path: string, source: string, destination: string): string {
  if (path === source) return destination;
  if (isDescendantFolderPath(source, path) === false) return path;
  const suffix = source === '' ? path : path.slice(source.length + 1);
  return joinFolderPath(destination, suffix);
}
