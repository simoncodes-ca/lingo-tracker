/**
 * Own edits to the bundle map in `.lingo-tracker.json`, including collection references.
 *
 * Definition add and update normalise the definition and validate it (with the domain
 * Bundle Definition rules) against the opened project's config, so the check
 * and write see the same state. Key order in `config.bundles` is preserved.
 *
 * Failure order: a missing bundle (`BundleNotFoundError`), then every key and
 * definition problem (`InvalidNameError` for a blank rename target, otherwise
 * `InvalidBundleDefinitionError` with every definition problem), then a key
 * collision (`BundleAlreadyExistsError`).
 *
 * Existence is an own-property check (`findBundleDefinition`), so a key such as
 * `constructor` is an ordinary bundle name, never something on `Object.prototype`.
 */

import {
  type BundleDefinition,
  type CollectionBundleDefinition,
  checkBundleDefinition,
  findBundleDefinition,
} from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { guardedConfigWrite } from '../config/config-file-operations';
import { resolveRenameTarget } from '../config/entry-name';
import type { OpenedProject } from '../config/open-collection';
import {
  BundleAlreadyExistsError,
  BundleNotFoundError,
  CollectionRenameBundleConflictError,
  CollectionRequiredByBundleError,
  InvalidBundleDefinitionError,
} from '../errors/lingo-tracker-error';

export interface UpdateBundleDefinitionOptions {
  /** Rename the bundle to this key while updating it. */
  newKey?: string;
}

export function addBundleDefinition(
  project: OpenedProject,
  key: string,
  definition: BundleDefinition,
): { message: string } {
  const bundleKey = key?.trim() ?? '';

  const configWrite = guardedConfigWrite(project);
  const config = project.sourceConfig;
  const next = (() => {
    const cleaned = assertValid(definition, config, bundleKey);

    if (findBundleDefinition(config.bundles, bundleKey)) {
      throw new BundleAlreadyExistsError(bundleKey);
    }

    // `Object.fromEntries` defines own properties, so even `__proto__` is stored as a key.
    const next = { ...config };
    rewriteBundles(next, (entries) => [...entries, [bundleKey, cleaned]]);
    return next;
  })();
  configWrite.write(next);

  return { message: `Bundle "${bundleKey}" added successfully` };
}

export function updateBundleDefinition(
  project: OpenedProject,
  key: string,
  definition: BundleDefinition,
  options: UpdateBundleDefinitionOptions = {},
): { message: string } {
  const bundleKey = key.trim();

  const configWrite = guardedConfigWrite(project);
  const config = project.sourceConfig;
  const { next, targetKey, isRename } = (() => {
    const bundles = config.bundles ?? {};

    if (!findBundleDefinition(bundles, bundleKey)) {
      throw new BundleNotFoundError(bundleKey);
    }

    const { target: targetKey, isRename } = resolveRenameTarget(bundleKey, options.newKey);
    const cleaned = assertValid(definition, config, isRename ? targetKey : undefined);

    if (isRename && findBundleDefinition(bundles, targetKey)) {
      throw new BundleAlreadyExistsError(targetKey);
    }

    // Rebuild the record in the original order so a rename keeps its position.
    const next = { ...config };
    rewriteBundles(next, (entries) =>
      entries.map(([existingKey, existingDefinition]) =>
        existingKey === bundleKey ? [targetKey, cleaned] : [existingKey, existingDefinition],
      ),
    );

    return { next, targetKey, isRename };
  })();
  configWrite.write(next);

  return isRename
    ? { message: `Bundle "${bundleKey}" renamed to "${targetKey}" and updated successfully` }
    : { message: `Bundle "${bundleKey}" updated successfully` };
}

export function deleteBundleDefinition(project: OpenedProject, key: string): { message: string } {
  const bundleKey = key.trim();

  const configWrite = guardedConfigWrite(project);
  const config = project.sourceConfig;
  const next = (() => {
    const bundles = config.bundles ?? {};

    if (!findBundleDefinition(bundles, bundleKey)) {
      throw new BundleNotFoundError(bundleKey);
    }

    const result = { ...config };
    rewriteBundles(result, (entries) => entries.filter(([existingKey]) => existingKey !== bundleKey));
    // Drop the `bundles` key entirely when the last bundle goes, keeping the file minimal.
    if (Object.keys(result.bundles ?? {}).length === 0) delete result.bundles;
    return result;
  })();
  configWrite.write(next);

  return { message: `Bundle "${bundleKey}" deleted successfully` };
}

/** Runs the domain `checkBundleDefinition`; throws one `InvalidBundleDefinitionError` with every problem. */
function assertValid(definition: BundleDefinition, config: LingoTrackerConfig, key?: string): BundleDefinition {
  const check = checkBundleDefinition(definition, Object.keys(config.collections ?? {}), key);
  if (check.errors.length > 0) {
    throw new InvalidBundleDefinitionError(check.errors);
  }
  return check.definition;
}

type BundleEntry = [string, BundleDefinition];

/** The single rebuild path for edits to the config's bundle map. */
function rewriteBundles(config: LingoTrackerConfig, rewrite: (entries: BundleEntry[]) => BundleEntry[]): void {
  const entries = rewrite(Object.entries(config.bundles ?? {}));
  // `Object.fromEntries` defines own properties, including `__proto__`.
  config.bundles = Object.fromEntries(entries);
}

/** Update explicit bundle references in the in-memory config before its single write. */
export function renameBundleCollectionReferences(config: LingoTrackerConfig, oldName: string, newName: string): void {
  if (oldName === newName || config.bundles === undefined) return;
  rewriteBundles(config, (entries) => renameCollectionReferences(entries, oldName, newName));
}

/** Check every bundle before removing any reference from the in-memory config. */
export function removeBundleCollectionReferences(config: LingoTrackerConfig, name: string): void {
  if (config.bundles === undefined) return;
  rewriteBundles(config, (entries) => removeCollectionReferences(entries, name));
}

function renameCollectionReferences(entries: BundleEntry[], oldName: string, newName: string): BundleEntry[] {
  const blocked: string[] = [];
  const next = mapBundleCollections(entries, (collections, bundleName) => {
    if (collections.some((entry) => entry?.name === newName)) blocked.push(bundleName);
    return collections.map((entry) => (entry?.name === oldName ? { ...entry, name: newName } : entry));
  });
  if (blocked.length > 0) throw new CollectionRenameBundleConflictError(oldName, newName, blocked);
  return next;
}

function removeCollectionReferences(entries: BundleEntry[], name: string): BundleEntry[] {
  const blocked: string[] = [];
  const next = mapBundleCollections(entries, (collections, bundleName) => {
    const remaining = collections.filter((entry) => entry?.name !== name);
    if (collections.length > 0 && remaining.length === 0) blocked.push(bundleName);
    return remaining;
  });
  if (blocked.length > 0) throw new CollectionRequiredByBundleError(name, blocked);
  return next;
}

/** Preserve malformed lists and transform explicit lists without mutating source definitions. */
function mapBundleCollections(
  entries: BundleEntry[],
  transform: (collections: CollectionBundleDefinition[], bundleName: string) => CollectionBundleDefinition[],
): BundleEntry[] {
  return entries.map(([bundleName, bundle]) => [
    bundleName,
    Array.isArray(bundle?.collections) ? { ...bundle, collections: transform(bundle.collections, bundleName) } : bundle,
  ]);
}
