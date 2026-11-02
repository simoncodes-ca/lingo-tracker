import {
  admitValue,
  honouredImportSourceStatus,
  icuParseOptionsFor,
  importStrategyPolicy,
  resolveImportStatus,
  type TranslationStatus,
} from '@simoncodes-ca/domain';
import type { ProjectTerms } from '../config/project-terms';
import type { FolderGroup } from '../resource/folder-grouping';
import { openUnreportedResourceFolder, type ResourceFolder } from '../resource/resource-folder';
import { type ImportSession, type ResolvedImportOptions, recordImportIssues } from './import-session';
import type { ImportChange, ImportedResource } from './types';

// ---------------------------------------------------------------------------
// Internal context shared across all handlers in one processResourceGroup call
// ---------------------------------------------------------------------------

interface GroupContext {
  readonly locale: string;
  readonly baseLocale: string;
  readonly options: ResolvedImportOptions;
  readonly folder: ResourceFolder;
  dataModified: boolean;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function applyCommentUpdate(ctx: GroupContext, entryKey: string, resource: ImportedResource): boolean {
  if (!ctx.options.updateComments || resource.comment === undefined) return false;
  // An empty comment in the import removes the stored comment.
  return ctx.folder.setDetails(entryKey, { comment: resource.comment || null });
}

function applyTagsUpdate(ctx: GroupContext, entryKey: string, resource: ImportedResource): boolean {
  if (!ctx.options.updateTags || resource.tags === undefined) return false;
  if (resource.tags.length === 0) return ctx.folder.setDetails(entryKey, { tags: null });

  // Tag order is not significant: an import with the same tags in another order is not a change.
  const currentTags = ctx.folder.get(entryKey)?.entry.tags ?? [];
  if (JSON.stringify([...currentTags].sort()) === JSON.stringify([...resource.tags].sort())) return false;

  return ctx.folder.setDetails(entryKey, { tags: resource.tags });
}

function applyDetailUpdates(ctx: GroupContext, entryKey: string, resource: ImportedResource): void {
  if (applyCommentUpdate(ctx, entryKey, resource)) ctx.dataModified = true;
  if (applyTagsUpdate(ctx, entryKey, resource)) ctx.dataModified = true;
}

/** Comment and tags for a resource created by the import (empty values are not stored). */
function createdDetails(resource: ImportedResource): { comment?: string; tags?: string[] } {
  return {
    comment: resource.comment || undefined,
    tags: resource.tags && resource.tags.length > 0 ? resource.tags : undefined,
  };
}

// ---------------------------------------------------------------------------
// Handler: new resource (does not exist in storage yet)
// ---------------------------------------------------------------------------

function handleNewResource(
  ctx: GroupContext,
  resource: ImportedResource,
  entryKey: string,
  isBaseLocaleImport: boolean,
): ImportChange {
  const { locale, options, folder } = ctx;

  if (isBaseLocaleImport) {
    folder.setBase(entryKey, resource.value);
    folder.setDetails(entryKey, createdDetails(resource));

    ctx.dataModified = true;
    return { key: resource.key, type: 'created', oldValue: '', newValue: resource.value };
  }

  if (!resource.baseValue) {
    return {
      key: resource.key,
      type: 'failed',
      reason: 'Cannot create resource: base value not provided (required for creation)',
    };
  }

  const createdStatus =
    honouredImportSourceStatus(options.strategy, options.preserveStatus, resource.status) ?? 'translated';

  folder.setBase(entryKey, resource.baseValue);
  folder.setTranslation(entryKey, locale, resource.value, createdStatus);
  folder.setDetails(entryKey, createdDetails(resource));

  ctx.dataModified = true;
  return { key: resource.key, type: 'created', oldValue: '', newValue: resource.value, newStatus: createdStatus };
}

// ---------------------------------------------------------------------------
// Handler: existing resource, base locale import
// ---------------------------------------------------------------------------

function handleBaseLocaleUpdate(ctx: GroupContext, resource: ImportedResource, entryKey: string): ImportChange {
  const oldValue = ctx.folder.get(entryKey)?.entry.source ?? '';
  const valueChanged = oldValue !== resource.value;

  // setBase applies the Staleness rule: when the base value changes, every translation becomes
  // 'stale' (or 'new' when it is an untranslated copy of the new base value).
  if (ctx.folder.setBase(entryKey, resource.value)) ctx.dataModified = true;

  applyDetailUpdates(ctx, entryKey, resource);

  return {
    key: resource.key,
    type: valueChanged ? 'value-changed' : 'updated',
    oldValue,
    newValue: resource.value,
  };
}

// ---------------------------------------------------------------------------
// Handler: existing resource, target locale update
// ---------------------------------------------------------------------------

function handleTargetLocaleUpdate(ctx: GroupContext, resource: ImportedResource, entryKey: string): ImportChange {
  const { locale, options, folder } = ctx;
  const entry = folder.get(entryKey)?.entry;

  const oldValue = (entry?.[locale] as string | undefined) ?? '';
  const oldStatus = folder.get(entryKey)?.meta?.[locale]?.status;
  const valueChanged = oldValue !== resource.value;

  // Strategy-specific handling for unchanged values.
  // `oldValue !== ''` distinguishes a genuinely unchanged existing value from a first-time
  // locale write: when `entry[locale]` is undefined, `oldValue` resolves to `''`, which
  // means first-time writes correctly fall through to the value-changed path below.
  if (!valueChanged && oldValue !== '') {
    return handleUnchangedTargetLocaleValue(ctx, resource, entryKey, oldValue, oldStatus);
  }

  // Value is new or first-time write for this locale — update entry and metadata.
  const newStatus = resolveImportStatus({
    strategy: options.strategy,
    oldStatus,
    incomingStatus: honouredImportSourceStatus(options.strategy, options.preserveStatus, resource.status),
    valueChanged: true,
    baseChecksumChanged: false,
  });

  folder.setTranslation(entryKey, locale, resource.value, newStatus);
  ctx.dataModified = true;

  applyDetailUpdates(ctx, entryKey, resource);

  return {
    key: resource.key,
    type: valueChanged ? 'value-changed' : 'updated',
    oldValue,
    newValue: resource.value,
    oldStatus,
    newStatus,
  };
}

function handleUnchangedTargetLocaleValue(
  ctx: GroupContext,
  resource: ImportedResource,
  entryKey: string,
  oldValue: string,
  oldStatus: TranslationStatus | undefined,
): ImportChange {
  const { locale, options, folder } = ctx;
  const result = folder.reconfirmTranslation(
    entryKey,
    locale,
    options.strategy,
    honouredImportSourceStatus(options.strategy, options.preserveStatus, resource.status),
  );
  if (result.changed) ctx.dataModified = true;

  return {
    key: resource.key,
    type: 'updated',
    oldValue,
    newValue: resource.value,
    oldStatus,
    newStatus: result.status,
  };
}

// ---------------------------------------------------------------------------
// Preferred terminology (base-locale imports only)
// ---------------------------------------------------------------------------

/**
 * Adds one warning per discouraged term in a base value this import wrote, or would
 * write in a dry run. Advisory: the value is imported regardless.
 */
function warnAboutPreferredTerminology(change: ImportChange, terms: ProjectTerms, warnings: string[]): void {
  if (change.newValue === undefined) return;
  if (change.type === 'failed' || change.type === 'skipped') return;

  for (const { message, reason } of terms.checkBaseValue(change.key, change.newValue).findings) {
    warnings.push(`Preferred terminology: key "${change.key}" — ${message}${reason ? `. ${reason}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Entry point (internal to the import module)
// ---------------------------------------------------------------------------

/**
 * Applies the resources of one folder to that folder, and records the outcome in the session.
 *
 * The folder's `resource_entries.json` and `tracker_meta.json` are loaded once and saved once
 * (only when something changed, and never in a dry run). For each resource:
 * 1. **Missing resource**: skipped unless `createMissing`; a target-locale creation needs a
 *    `baseValue`.
 * 2. **Base-locale import** (migration only): writes the base value; the Staleness rule updates
 *    every translation. Values written are checked against the preferred terminology.
 * 3. **Target-locale import**: warns on a `baseValue` mismatch (unless `validateBase` is false),
 *    fails an entry whose value violates its source's argument or protected-term contract, and
 *    otherwise writes the value with the status from `resolveImportStatus` (strategy, old status, source status).
 * 4. **Comment and tags**: updated when `updateComments` / `updateTags` are set.
 *
 * Appends one change per resource to `session.changes`; warnings, errors (value
 * violations) and written files go to the session too.
 */
export function processResourceGroup(session: ImportSession, group: FolderGroup<ImportedResource>): void {
  const { options, terms, isBaseLocaleImport, changes, warnings } = session;
  const { baseLocale } = session.collection;
  const resolvesReferences = importStrategyPolicy(options.strategy).resolvesReferences;

  let folder: ResourceFolder;
  try {
    // Import resource saves were unreported at HEAD.
    folder = openUnreportedResourceFolder(group.folderPath, {
      baseLocale,
      translationsFolder: session.collection.translationsFolder,
      runtime: session.collection.runtime,
    });
  } catch (error) {
    for (const { item: resource } of group.members) {
      changes.push({ key: resource.key, type: 'failed', reason: `Failed to read resource files: ${error}` });
    }
    return;
  }

  const ctx: GroupContext = { locale: options.locale, baseLocale, options, folder, dataModified: false };

  function failedValueCheck(source: string | undefined, resource: ImportedResource): boolean {
    // Value Admission remains the backstop after ICU auto-fix. Reference imports
    // retain their exception for unresolved placeholders.
    const admission = admitValue(
      source,
      resource.value,
      {
        name: 'import',
        referencesResolved: resolvesReferences,
        protectedTerms: terms.protectedTerms,
      },
      icuParseOptionsFor(session.collection.runtime),
    );
    if (admission.admitted === true) return false;

    const reason = admission.violations.map((violation) => violation.description).join('; ');
    recordImportIssues(session, { key: resource.key, type: 'failed', reason, error: `"${resource.key}" ${reason}` });
    return true;
  }

  for (const { item: resource, entryKey } of group.members) {
    const stored = folder.get(entryKey);

    if (!stored) {
      if (!options.createMissing) {
        changes.push({
          key: resource.key,
          type: 'skipped',
          reason: 'Resource not found (strategy does not allow creation)',
        });
        continue;
      }
      // This imported baseValue becomes the stored source when the resource is created.
      if (!isBaseLocaleImport && failedValueCheck(resource.baseValue, resource)) continue;
      const created = handleNewResource(ctx, resource, entryKey, isBaseLocaleImport);
      if (isBaseLocaleImport) warnAboutPreferredTerminology(created, terms, warnings);
      changes.push(created);
      continue;
    }

    if (isBaseLocaleImport) {
      const updated = handleBaseLocaleUpdate(ctx, resource, entryKey);
      warnAboutPreferredTerminology(updated, terms, warnings);
      changes.push(updated);
      continue;
    }

    // Validate baseValue mismatch before dispatching to target locale handler
    if (resource.baseValue && options.validateBase !== false) {
      const existingBase = stored.entry.source;
      if (existingBase !== resource.baseValue) {
        warnings.push(
          `Base value mismatch for "${resource.key}": import has "${resource.baseValue}", ` +
            `LingoTracker has "${existingBase}" - preserving LingoTracker value`,
        );
      }
    }

    if (failedValueCheck(stored.entry.source, resource)) continue;

    changes.push(handleTargetLocaleUpdate(ctx, resource, entryKey));
  }

  // Write files once for the entire group, but only when in-memory state was actually mutated.
  // Logging an 'updated' change (e.g. update strategy with unchanged value) does not imply a
  // disk write is needed — `dataModified` is the authoritative signal for that.
  if (ctx.dataModified) {
    for (const filePath of folder.save({ dryRun: options.dryRun }).written) {
      session.filesAffected.add(filePath);
      if (!options.dryRun) session.filesModified.add(filePath);
    }
  }
}
