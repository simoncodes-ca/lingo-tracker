/** Whether a valid dot-delimited folder path is strictly below another ('' names the root). */
export function isDescendantFolderPath(source: string, destination: string): boolean {
  return source === '' ? destination !== '' : destination.startsWith(`${source}.`);
}
