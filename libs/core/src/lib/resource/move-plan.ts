import { resolve } from 'node:path';
import {
  folderPathLeaf,
  folderPathSegments,
  isDescendantFolderPath,
  joinFolderPath,
  parentFolderPath,
  rebaseFolderPath,
} from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { FolderMoveIntoDescendantError } from '../errors/lingo-tracker-error';
import type { Relocation } from './relocate-entries';
import { resolveCheckedResourceKey } from './resource-key';

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

type MoveRefusal = { readonly kind: 'refused' } & (
  | { readonly reason: 'descendant'; readonly error: FolderMoveIntoDescendantError }
  | { readonly reason: 'same-location' | 'already-there'; readonly warning: string }
);

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
      return joinFolderPath(folder, folderPathLeaf(key));
    });
  }
  if (selection.kind === 'pattern') {
    return entries(selection.keys, (from) => {
      return rebaseFolderPath(from, selection.prefix, destinationPath);
    });
  }

  const { path, nestUnderDestination = true } = selection;
  if (sameCollection && isDescendantFolderPath(path, destinationPath)) {
    return {
      kind: 'refused',
      reason: 'descendant',
      error: new FolderMoveIntoDescendantError(path, destinationPath),
    };
  }
  if (sameCollection && path === destinationPath) {
    return {
      kind: 'refused',
      reason: 'same-location',
      warning: 'Source and destination are the same. No move performed.',
    };
  }
  const nest = nestUnderDestination || destinationPath === '';
  const segments = folderPathSegments(path);
  if (sameCollection && nest && (parentFolderPath(path) ?? '') === destinationPath) {
    return {
      kind: 'refused',
      reason: 'already-there',
      warning: 'Folder is already at this location. No move performed.',
    };
  }
  const folderName = folderPathLeaf(path);
  const prefix =
    nest || segments.length !== folderPathSegments(destinationPath).length
      ? joinFolderPath(destinationPath, folderName)
      : destinationPath;
  return {
    kind: 'folder',
    forKeys: (keys) => entries(keys, (from) => rebaseFolderPath(from, path, path === '' ? destinationPath : prefix)),
  };
}

/** Retains the existing `prefix*`, `prefix.*`, and root `*` selection rules. */
export function movePatternPrefix(pattern: string): string {
  const prefix = pattern.slice(0, -1);
  return prefix.endsWith('.') ? prefix.slice(0, -1) : prefix;
}

/** Validate submitted addresses and infer resource selection without reading or changing folders. */
export function validateMoveInput({
  source,
  destination,
}: {
  readonly source: string;
  readonly destination: string;
}): 'key' | 'pattern' {
  const pattern = source.endsWith('*');
  const prefix = pattern ? movePatternPrefix(source) : source;
  if (pattern === false || prefix.length > 0) resolveCheckedResourceKey(prefix, undefined, source);
  // Only a pattern destination can name the collection root.
  if (pattern === false || destination.length > 0) resolveCheckedResourceKey(destination);
  return pattern ? 'pattern' : 'key';
}
