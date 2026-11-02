import type { PreferredTermRule } from '@simoncodes-ca/domain';
import { readCollectionSet } from '../collection-set/collection-set';
import type { Collection } from '../config/open-collection';
import { type ProjectTerms, readProjectTerms } from '../config/project-terms';
import type { RunOutcome } from '../run-outcome';
import { generateValidationSummary } from './generate-validation-summary';
import type { ResourceValidationResult, ValidationOptions } from './types';
import { validateResources } from './validate-resources';

/** User choices for one validation of the opened collections. */
export interface ValidateRunOptions {
  readonly allowTranslated?: boolean;
  readonly skipLocales?: readonly string[];
  readonly skipIcu?: boolean;
  readonly skipRuntime?: boolean;
  readonly skipPlaceholders?: boolean;
  readonly skipProtectedTerms?: boolean;
  readonly requirePortablePlurals?: boolean;
}

/**
 * The printable outcome of one validation run. An empty scope is an in-band failure with
 * detail lines; a completed run carries the full validation result and its summary.
 * Warnings are separate so adapters can report them before either outcome.
 */
export type ValidateRunResult =
  | {
      readonly status: 'failed';
      readonly outcome: RunOutcome;
      readonly error: string;
      readonly details: readonly string[];
      readonly warnings: readonly string[];
    }
  | {
      readonly status: 'complete';
      readonly outcome: RunOutcome;
      readonly validation: ResourceValidationResult;
      readonly summary: string;
      readonly warnings: readonly string[];
    };

/**
 * Validates the opened collections for CI and returns the result ready for an adapter to print.
 *
 * The run resolves target and skipped locales, reads each collection's Project Terms, assembles
 * the status, ICU, placeholder, and terminology checks, then produces the summary. A collection
 * set with nothing to validate returns an in-band failure. Term-file and unknown-locale warnings
 * return alongside the outcome; no warning is printed by core.
 */
export function runValidate(collections: readonly Collection[], options: ValidateRunOptions = {}): ValidateRunResult {
  const scope = readCollectionSet(collections, { scope: 'validation', skippedLocales: options.skipLocales });
  const warnings = [...scope.warnings];
  if (scope.outcome === 'no-collections') {
    return {
      status: 'failed',
      outcome: 'failed',
      error: 'No collections found in configuration.',
      details: [],
      warnings: [],
    };
  }

  // Each collection is validated against its own target locales: its locales without its base locale.
  if (scope.outcome === 'no-targets') {
    return {
      status: 'failed',
      outcome: 'failed',
      error: 'No target locales found in configuration.',
      details: ["Target locales are each collection's locales except its base locale."],
      warnings: [],
    };
  }

  if (scope.outcome === 'all-skipped') {
    return {
      status: 'failed',
      outcome: 'failed',
      error: 'All target locales were skipped; nothing to validate.',
      details: [],
      warnings,
    };
  }

  // Read every collection's Project Terms. Collections share the global files, so report each
  // term-file problem once. A missing or broken protected-terms file only warns, and
  // then the protected-term check covers nothing. A named rule file that is missing also warns.
  const termsByCollection = new Map(collections.map((collection) => [collection, readProjectTerms(collection)]));
  const projectTerms = [...termsByCollection.values()];
  const views = projectTerms.map((terms) => terms.forValidation());
  warnings.push(...new Set(views.flatMap((view) => view.warnings)));
  const ruleFileError = views.find((view) => view.loadError !== undefined)?.loadError;
  const rules = terminologyRules(projectTerms);
  const compileValues = !options.skipIcu;
  const requirePortablePlurals = options.requirePortablePlurals ?? false;
  const validationOptions: ValidationOptions = {
    allowTranslated: options.allowTranslated ?? false,
    // Portability is a static parse, so an explicit request runs even alongside skipIcu.
    // Base values are checked alongside targets because they are copied into every translation slot.
    icu: compileValues || requirePortablePlurals ? { compileValues, requirePortablePlurals } : undefined,
    runtime: !options.skipRuntime,
    // A renamed placeholder renders empty; neither ICU compilation nor status catches it.
    placeholders: !options.skipPlaceholders,
    protectedTerms: !options.skipProtectedTerms,
    // Without rules or a load error, omit the check and its summary output entirely.
    terminology: rules.length > 0 || ruleFileError !== undefined ? { rules, loadError: ruleFileError } : undefined,
  };
  const validation = validateResources(collections, validationOptions, termsByCollection, scope);
  return {
    status: 'complete',
    outcome: validation.passed ? 'succeeded' : 'failed',
    validation,
    summary: generateValidationSummary(validation, validationOptions, scope.skippedLocales),
    warnings,
  };
}

/** Preferred terminology is one file for the project. The first collection with rules wins;
 * later rule lists are not checked for agreement. An empty first read cannot hide later rules. */
function terminologyRules(terms: readonly ProjectTerms[]): PreferredTermRule[] {
  return [...(terms.find((term) => term.preferredTerminology.length > 0)?.preferredTerminology ?? [])];
}
