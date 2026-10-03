import { importStrategyPolicy, resolveAllReferences } from '@simoncodes-ca/domain';
import type { Collection } from '../config/open-collection';
import { groupByFolder } from '../resource/folder-batch';
import { assertTranslationStatus } from '../resource/translation-status-input';
import { applyICUAutoFixToResources } from './apply-icu-auto-fix';
import { openImportSession, sessionResult } from './import-session';
import { validateImportResources } from './import-validation';
import { loadBaseLocaleValues } from './load-base-locale-values';
import { normalizeTranslocoSyntaxInResources } from './normalize-transloco-syntax';
import { processResourceGroup } from './process-resource-group';
import type { ImportedResource, ImportResult, ImportRunOptions } from './types';

/**
 * Imports resources into a collection for one locale, and reports what changed.
 *
 * The resources come from a format adapter (`parseJsonImport`, `parseXliffImport`) or any other
 * source. The run:
 * 1. Applies the strategy defaults, and refuses a base-locale import unless the strategy is `migration`.
 * 2. Resolves Transloco references (`{{t('key')}}`, `{{key}}`) between the resources (`migration` only).
 * 3. Converts Transloco `{{ name }}` placeholders to ICU `{name}`.
 * 4. Repairs placeholders that differ from the stored base value (ICU auto-fix).
 * 5. Drops invalid resources: bad keys, hierarchical conflicts, empty values. Duplicate keys warn.
 * 6. Applies the resources one folder at a time, with the strategy's rules for creation,
 *    status, comments, tags, protected terms, and preferred terminology (the collection's
 *    Project Terms, read once per run; a rule-file problem is reported in `warnings`).
 *
 * Nothing is written in a dry run; the result says what would change.
 *
 * @throws {InvalidImportLocaleError} The locale is the collection's base locale and the strategy is not `migration`.
 * @throws {ProtectedTermsFileError} A protected-terms file exists but is not a JSON array of strings.
 */
export function importResources(
  collection: Collection,
  resources: readonly ImportedResource[],
  options: ImportRunOptions,
): ImportResult {
  for (const resource of resources) {
    if (resource.status !== undefined) assertTranslationStatus(resource.status);
  }
  const session = openImportSession(collection, options);
  const { strategy, dryRun, verbose, onProgress } = session.options;

  let prepared = [...resources];
  if (importStrategyPolicy(strategy).resolvesReferences) {
    onProgress?.('Resolving Transloco-style references...');
    prepared = resolveAllReferences(prepared, true, session.warnings);
  }

  // Before any ICU parsing or auto-fixing, so later steps see one placeholder syntax.
  prepared = normalizeTranslocoSyntaxInResources(prepared);

  if (verbose) onProgress?.('Checking for ICU placeholder issues...');
  const baseValues = loadBaseLocaleValues(prepared, collection);
  const autoFix = applyICUAutoFixToResources({
    resources: prepared,
    getBaseValue: (key) => baseValues.get(key),
    verbose,
    onProgress: verbose ? onProgress : undefined,
  });
  session.icuAutoFixes.push(...autoFix.autoFixes);
  session.icuAutoFixErrors.push(...autoFix.autoFixErrors);

  const validation = validateImportResources(autoFix.resources, { skipEmptyValues: true, warnOnLongKeys: true });
  session.warnings.push(...validation.warnings);
  session.errors.push(...validation.errors);
  session.changes.push(...validation.failedChanges);

  for (const group of groupByFolder(collection, validation.validResources, (resource) => resource.key)) {
    if (verbose) {
      for (const { item: resource } of group.members) onProgress?.(`Processing: ${resource.key}`);
    }
    processResourceGroup(session, group);
  }

  const result = sessionResult(session);
  onProgress?.(
    dryRun
      ? `Dry run complete: would import ${result.resourcesUpdated} resources`
      : `Import complete: ${result.resourcesUpdated} resources imported`,
  );
  return result;
}
