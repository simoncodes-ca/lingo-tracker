import { InvalidNameError } from '../errors/lingo-tracker-error';

/** Trims `requested`; undefined means no rename. Blank or whitespace throws InvalidNameError. */
export function resolveRenameTarget(
  current: string,
  requested: string | undefined,
): { target: string; isRename: boolean } {
  const target = requested === undefined ? current : requested.trim();
  if (requested !== undefined && target === '') {
    throw new InvalidNameError();
  }
  return { target, isRename: target !== current };
}
