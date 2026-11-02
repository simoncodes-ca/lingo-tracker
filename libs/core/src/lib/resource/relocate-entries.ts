import type { Collection } from '../config/open-collection';
import { InvalidCollectionFolderError, InvalidResourceKeyError } from '../errors/lingo-tracker-error';
import { describeFolderProblem } from './collection-folders';
import { pruneEmptiedFolders } from './folder-pruning';
import type { MovePlan } from './move-plan';
import { resolveResolvedResourcePaths } from './resource-file-paths';
import {
  openResourceFolder,
  type ResourceFolder,
  type ResourceFolderEntry,
  saveResourceRelocation,
} from './resource-folder';
import { resolveCheckedResourceKey } from './resource-key';
import type { ResourceTreeEntry } from './resource-tree-types';

/**
 * Entry Relocation — the one way entries move between keys, within a collection or into another.
 * `editResource` (`moveTo`) and `executeMove` (key, pattern or folder) move through it.
 *
 * - **Batch**: every folder involved is opened once, and saved once, however many entries move
 *   in or out of it. A folder is saved only after every folder it sends entries to, and the saves
 *   stop at the first failed write. So after a failure each moved entry is at its destination, at
 *   its source, or in both places, but not lost. The exception is a cycle of folders that send
 *   entries to each other (a swap, `p.x` ↔ `q.x`): one of them has to be saved first, so a write
 *   that fails inside the cycle can lose the entries moving within it.
 * - **Lossless**: values, comment, tags, checksums and statuses (`verified`, `stale`) are carried as
 *   they are. Nothing is auto-translated.
 * - **Collision policy**: a destination key is taken when an entry that is not itself moving
 *   away holds it. A taken key is a collision (the entry stays where it is) unless `override`
 *   is set, which replaces the entry there. Two entries of one batch never move to the same key:
 *   the later one is a collision. Collisions are decided before anything changes, and a key that
 *   an entry of the same batch moves away from counts as free (so `a.*` can move to `a.b`).
 * - **Locale reconciliation**: an entry moved into another collection is fitted to its locales
 *   (`ResourceFolder.setEntry` with the destination's `targetLocales`): values of locales the
 *   destination does not have are dropped, and each missing destination locale is seeded as a
 *   `new` copy of the base. The two collections must share a base locale.
 */

/** One entry to move, by full key. */
export interface Relocation {
  readonly from: string;
  readonly to: string;
}

export interface RelocateEntriesOptions {
  /** Return saved empty folders for the containing Move Run to prune after all selections. */
  readonly deferPruning?: boolean;
  /** Replace an entry that holds a destination key. Default: false (the relocation is a collision). */
  readonly override?: boolean;
}

/** An entry that moved, as it is stored at its destination. */
export interface RelocatedEntry {
  readonly from: string;
  readonly to: string;
  readonly entry: ResourceTreeEntry;
}

export interface RelocationResult {
  readonly warnings?: string[];
  /** Saved empty folders returned to a containing Move Run for operation-end pruning. */
  readonly emptiedFolders?: readonly string[];
  /** The relocations done, in the order they were given. */
  readonly moved: RelocatedEntry[];
  /** The relocations not done because the destination key is taken. */
  readonly collisions: Relocation[];
  /** One message per relocation that failed (bad key, missing entry, unreadable folder), or for a failed write. */
  readonly errors: string[];
}

interface Slot {
  readonly folder: ResourceFolder;
  readonly entryKey: string;
  /** Folder path and entry key: two slots with the same id are the same entry. */
  readonly id: string;
}

interface Planned {
  readonly relocation: Relocation;
  readonly from: Slot;
  readonly to: Slot;
  readonly stored: ResourceFolderEntry;
}

/** Internal interruption data; Move Run restores the original thrown value after cleanup. */
export class InterruptedRelocation extends Error {
  constructor(
    readonly original: unknown,
    readonly emptiedFolders: readonly string[],
  ) {
    super('Entry relocation interrupted');
  }
}

/**
 * Moves entries from `source` to `destination` (the same collection, or another) by the rules above.
 * Never throws for one relocation; failures are reported in the result.
 */
export function relocateEntries(movePlan: MovePlan, options: RelocateEntriesOptions = {}): RelocationResult {
  const emptiedFolders: string[] = [];
  try {
    return performRelocation(movePlan, options, emptiedFolders);
  } catch (error) {
    if (options.deferPruning) throw new InterruptedRelocation(error, emptiedFolders);
    throw error;
  }
}

function performRelocation(
  movePlan: MovePlan,
  options: RelocateEntriesOptions,
  emptiedFolders: string[],
): RelocationResult {
  const override = options.override ?? false;
  const { source, destination, relocations, sameCollection } = movePlan;
  const errors: string[] = [];

  if (!sameCollection && source.baseLocale !== destination.baseLocale) {
    errors.push(
      `Cannot move resources from collection "${source.name}" (base locale "${source.baseLocale}") to "${destination.name}" (base locale "${destination.baseLocale}")`,
    );
    return { moved: [], collisions: [], errors };
  }

  const sourceFolders = openFolders(source);
  const destinationFolders = sameCollection ? sourceFolders : openFolders(destination);
  const slot = (collection: Collection, key: string): Slot => {
    const { folder, entryKey, folderPath } = (collection === source ? sourceFolders : destinationFolders).entryAt(key);
    return { folder, entryKey, id: `${folderPath}\u0000${entryKey}` };
  };

  // 1. Read every entry to move.
  const planned: Planned[] = [];
  const taken = new Set<string>();
  for (const relocation of relocations) {
    const item = plan(relocation, source, destination, slot);
    if (typeof item === 'string') {
      errors.push(item);
    } else if (taken.has(item.from.id)) {
      errors.push(`Resource listed twice in one move: ${relocation.from}`);
    } else {
      taken.add(item.from.id);
      planned.push(item);
    }
  }
  let pending = planned;

  // 2. Decide the collisions. An entry that stays frees nothing, which can make another
  //    relocation collide, so repeat until no new collision is found.
  const collided = new Set<Planned>();
  const leaving = new Set(taken);
  let changed = true;
  while (changed) {
    changed = false;
    const placed = new Set<string>();
    const kept: Planned[] = [];
    for (const item of pending) {
      const takenByBatch = placed.has(item.to.id);
      const takenOnDisk = item.to.folder.has(item.to.entryKey) && !leaving.has(item.to.id);
      if (takenByBatch || (takenOnDisk && !override)) {
        collided.add(item);
        leaving.delete(item.from.id);
        changed = true;
      } else {
        placed.add(item.to.id);
        kept.push(item);
      }
    }
    pending = kept;
  }
  const collisions = planned.filter((item) => collided.has(item)).map((item) => item.relocation);

  // 3. Take every entry out, then put each one in place.
  for (const { from } of pending) {
    from.folder.remove(from.entryKey);
  }
  const fit = sameCollection ? undefined : { targetLocales: destination.targetLocales };
  for (const { to, stored } of pending) {
    to.folder.setEntry(to.entryKey, stored.entry, stored.meta ?? {}, fit);
  }

  const pruneWarnings = (): string[] =>
    options.deferPruning
      ? []
      : pruneEmptiedFolders(source, emptiedFolders).problems.map((problem) => describeFolderProblem(problem));

  const moved: RelocatedEntry[] = [];
  const readMoved = (): RelocatedEntry[] => {
    for (const { relocation, to } of pending) {
      const entry = to.folder.treeEntry(to.entryKey);
      if (entry) moved.push({ from: relocation.from, to: relocation.to, entry });
    }
    return moved;
  };

  // 4. Save each folder once, after every folder it sends entries to.
  const failure = saveResourceRelocation(source, destination, saveOrder(pending), readMoved, (folder, saved) => {
    if (saved.emptied) emptiedFolders.push(folder.folderPath);
  });
  if (failure) {
    const error = failure.error;
    errors.push(`Failed to write the move: ${error instanceof Error ? error.message : String(error)}`);
    const warnings = pruneWarnings();
    return {
      moved: [],
      collisions,
      errors,
      ...(options.deferPruning ? { emptiedFolders } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  const warnings = pruneWarnings();
  return {
    moved,
    collisions,
    errors,
    ...(options.deferPruning ? { emptiedFolders } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * The folders of `pending` in post-order over "sends entries to": each folder comes after every
 * folder it sends entries to. A cycle is broken where the walk first meets it again.
 */
function saveOrder(pending: readonly Planned[]): ResourceFolder[] {
  const sendsTo = new Map<ResourceFolder, Set<ResourceFolder>>();
  for (const { from, to } of pending) {
    if (from.folder === to.folder) continue;
    const targets = sendsTo.get(from.folder) ?? new Set<ResourceFolder>();
    targets.add(to.folder);
    sendsTo.set(from.folder, targets);
  }

  const order: ResourceFolder[] = [];
  const seen = new Set<ResourceFolder>();
  const visit = (folder: ResourceFolder): void => {
    if (seen.has(folder)) return;
    seen.add(folder);
    for (const target of sendsTo.get(folder) ?? []) visit(target);
    order.push(folder);
  };
  for (const { from, to } of pending) {
    visit(to.folder);
    visit(from.folder);
  }
  return order;
}

/** The relocation's source and destination slots and the stored entry, or why it cannot move. */
function plan(
  relocation: Relocation,
  source: Collection,
  destination: Collection,
  slot: (collection: Collection, key: string) => Slot,
): Planned | string {
  const { from, to } = relocation;
  try {
    resolveCheckedResourceKey(from);
    resolveCheckedResourceKey(to);
  } catch (error) {
    if (error instanceof InvalidResourceKeyError) return error.message;
    throw error;
  }

  let fromSlot: Slot;
  try {
    fromSlot = slot(source, from);
  } catch (error) {
    if (error instanceof InvalidCollectionFolderError) throw error;
    return `Failed to read source file for key: ${from}: ${error instanceof Error ? error.message : String(error)}`;
  }
  const stored = fromSlot.folder.get(fromSlot.entryKey);
  if (!stored) {
    return `Source key not found: ${from}`;
  }

  let toSlot: Slot;
  try {
    toSlot = slot(destination, to);
  } catch (error) {
    if (error instanceof InvalidCollectionFolderError) throw error;
    return `Failed to read destination file for key: ${to}: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (toSlot.id === fromSlot.id) {
    return `Source and destination are the same key: ${from}`;
  }

  return { relocation, from: fromSlot, to: toSlot, stored };
}

export interface FolderEntryAddress {
  readonly folder: ResourceFolder;
  readonly entryKey: string;
  readonly folderPath: string;
}

/** A lazy open-once cache for one synchronous batch. Do not retain it across an await. */
export function openFolders(collection: Collection): { entryAt(key: string): FolderEntryAddress } {
  const folders = new Map<string, ResourceFolder>();
  return {
    entryAt(key) {
      const { folderPath, entryKey } = resolveResolvedResourcePaths({
        key,
        translationsFolder: collection.translationsFolder,
      });
      let folder = folders.get(folderPath);
      if (!folder) {
        folder = openResourceFolder(folderPath, collection);
        folders.set(folderPath, folder);
      }
      return { folder, entryKey, folderPath };
    },
  };
}
