import { assertStringArray, type ListEdit } from '@simoncodes-ca/domain';
import { InvalidCollectionError } from '../errors/lingo-tracker-error';

/** Rejects an untyped request before it can change a term file or a collection entry. */
export function assertProtectedTerms(terms: unknown): asserts terms is string[] {
  assertStringArray(terms, () => new InvalidCollectionError('protectedTerms must be an array of strings'));
}
export type ProtectedTermsEdit = ListEdit;

export interface ProtectedTermsView {
  readonly globalTerms: string[];
  readonly collectionTerms: string[];
  readonly effectiveTerms: string[];
  readonly globalFilePath: string;
  readonly collectionFilePath?: string;
  readonly warnings: string[];
  readonly storedTerms: string[];
}

export interface ProtectedTermsEditResult {
  readonly terms: string[];
  readonly filePath: string;
}
