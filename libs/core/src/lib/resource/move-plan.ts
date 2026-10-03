import { resolve } from 'node:path';
import { isDescendantFolderPath } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { FolderMoveIntoDescendantError } from '../errors/lingo-tracker-error';
import type { Relocation } from './relocate-entries';

export type MoveSelection =
  | { readonly kind: 'key'; readonly key: string }
  | { readonly kind: 'pattern'; readonly prefix: string; readonly keys: readonly string[] }
  | { readonly kind: 'folder'; readonly path: string; readonly nestUnderDestination?: boolean }
  | { readonly kind: 'entry'; readonly key: string };

/** An Entry Relocation bound to the collections used to decide the move. */
export interface MovePlan {
  readonly kind: 'entries';
  readonly source: Collection;
  readonly destination: Collection;
  readonly sameCollection: boolean;
  readonly relocations: readonly Relocation[];
}

interface FolderPlan {
  readonly kind: 'folder';
  /** Bind enumerated keys to the collections and mapping already decided. */
  readonly forKeys: (keys: readonly string[]) => MovePlan;
}

interface MoveRefusal {
  readonly kind: 'refused';
  readonly reason: 'descendant' | 'same-location' | 'already-there';
  /** Return the existing warning, or throw the existing typed descendant error. */
  readonly warning: () => string;
}

interface MoveRequest<S extends MoveSelection> {
  readonly source: Collection;
  readonly destination: Collection;
  readonly selection: S;
  readonly destinationPath: string;
}

type PlanFor<S extends MoveSelection> = S extends { readonly kind: 'folder' } ? FolderPlan | MoveRefusal : MovePlan;

/** Decide move refusals and destination keys without touching the filesystem. */
export function planMove<S extends MoveSelection>(request: MoveRequest<S>): PlanFor<S> {
  // The selection discriminant determines the result: only folders can be refused or need keys later.
  return decideMove(request) as PlanFor<S>;
}

function decideMove({
  source,
  destination,
  selection,
  destinationPath,
}: MoveRequest<MoveSelection>): MovePlan | FolderPlan | MoveRefusal {
  const sameCollection = resolve(source.translationsFolder) === resolve(destination.translationsFolder);
  const entries = (keys: readonly string[], destinationKey: (key: string) => string): MovePlan => ({
    kind: 'entries',
    source,
    destination,
    sameCollection,
    relocations: keys.map((from) => ({ from, to: destinationKey(from) })),
  });

  if (selection.kind === 'key') {
    return entries([selection.key], () => destinationPath);
  }
  if (selection.kind === 'entry') {
    // A blank moveTo has always named the collection root.
    const folder = destinationPath.trim() ? destinationPath : '';
    return entries([selection.key], (key) => {
      const leaf = key.slice(key.lastIndexOf('.') + 1);
      return folder ? `${folder}.${leaf}` : leaf;
    });
  }
  if (selection.kind === 'pattern') {
    return entries(selection.keys, (from) => {
      const suffix = selection.prefix ? from.slice(selection.prefix.length + 1) : from;
      return destinationPath ? `${destinationPath}.${suffix}` : suffix;
    });
  }

  const { path, nestUnderDestination = true } = selection;
  if (sameCollection && isDescendantFolderPath(path, destinationPath)) {
    return {
      kind: 'refused',
      reason: 'descendant',
      warning: () => {
        throw new FolderMoveIntoDescendantError(path, destinationPath);
      },
    };
  }
  if (sameCollection && path === destinationPath) {
    return {
      kind: 'refused',
      reason: 'same-location',
      warning: () => 'Source and destination are the same. No move performed.',
    };
  }
  const nest = nestUnderDestination || destinationPath === '';
  const segments = path.split('.');
  if (sameCollection && nest && segments.slice(0, -1).join('.') === destinationPath) {
    return {
      kind: 'refused',
      reason: 'already-there',
      warning: () => 'Folder is already at this location. No move performed.',
    };
  }
  const folderName = segments[segments.length - 1];
  const prefix =
    nest || segments.length !== destinationPath.split('.').length
      ? destinationPath
        ? `${destinationPath}.${folderName}`
        : folderName
      : destinationPath;
  return { kind: 'folder', forKeys: (keys) => entries(keys, (from) => `${prefix}${from.slice(path.length)}`) };
}
