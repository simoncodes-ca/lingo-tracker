/**
 * Determines whether a folder path points inside a `node_modules` directory.
 *
 * Uses path-segment equality (not a substring match) so that paths like
 * `my-node_modules-backup` are NOT treated as vendored. Handles both POSIX
 * and Windows separators. This is a pure, browser-safe check — it does not
 * touch the filesystem.
 *
 * @example
 * isUnderNodeModules('node_modules/@scope/lib/i18n') // true
 * isUnderNodeModules('libs/node_modules/x')          // true
 * isUnderNodeModules('src/my-node_modules-x')        // false
 */
export function isUnderNodeModules(folderPath: string): boolean {
  return folderPath.split(/[/\\]+/).some((segment) => segment === 'node_modules');
}
