import { normalizeProtectedTerms } from '@simoncodes-ca/domain';
import { createConfigFileOperations, updateConfig } from '../lib/config/config-file-operations';
import { ErrorMessages } from '../lib/errors/error-messages';
import { updateCollection } from './update-collection';

export interface SetProtectedTermsOptions {
  cwd?: string;
}

/**
 * Sets the global protected-terms list and persists it without touching
 * `collections` or any other top-level field. An empty list drops the key.
 */
export function setGlobalProtectedTerms(terms: string[], options: SetProtectedTermsOptions = {}): { message: string } {
  const normalized = normalizeProtectedTerms(terms);

  updateConfig((config) => {
    if (normalized.length === 0) {
      delete config.protectedTerms;
    } else {
      config.protectedTerms = normalized;
    }
    return config;
  }, options.cwd);

  return { message: 'Global protected terms updated successfully' };
}

/**
 * Sets a collection's protected-terms list via the existing `updateCollection`
 * path, which minimalizes (only fields differing from global are stored). An
 * empty list drops the key. Throws if the collection does not exist.
 */
export async function setCollectionProtectedTerms(
  collectionName: string,
  terms: string[],
  options: SetProtectedTermsOptions = {},
): Promise<{ message: string }> {
  const config = createConfigFileOperations({ cwd: options.cwd }).read();
  const collection = config.collections?.[collectionName];

  if (!collection) {
    throw new Error(ErrorMessages.collectionNotFound(collectionName));
  }

  const normalized = normalizeProtectedTerms(terms);
  return updateCollection(
    collectionName,
    undefined,
    { ...collection, protectedTerms: normalized },
    { cwd: options.cwd },
  );
}
