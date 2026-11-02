import {
  type PreferredTermRule,
  mergeListEdit,
  normalizeProtectedTerms,
  validateListEdit,
  validatePreferredTermRules,
} from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import {
  CollectionNotFoundError,
  CoreOperationError,
  InvalidCollectionError,
  InvalidProjectTermsEditError,
  type LingoTrackerError,
  PreferredTerminologyValidationError,
} from '../errors/lingo-tracker-error';
import { patchCollectionEntry } from './collection-entry';
import { guardedConfigWrite } from './config-file-operations';
import type { CompanionFileWrite, ConfigWriteOutcome } from './config-write-transaction';
import type { OpenedProject } from './open-collection';
import {
  editPreferredTerminology,
  type LoadPreferredTerminologyResult,
  type PreferredTerminologyEdit,
  type PreferredTerminologyEditResult,
  resolvePreferredTerminologyFilePath,
} from './preferred-terminology-file';
import { readStoredProjectProtectedTerms } from './project-term-files';
import { readProjectTermsView } from './project-terms-view';
import {
  assertWritableProtectedTermsPath,
  resolveCollectionProtectedTermsFilePath,
  resolveGlobalProtectedTermsFile,
  resolveGlobalProtectedTermsFilePath,
  resolveProtectedTermsFilePath,
  resolveWritableCollectionProtectedTermsPath,
  writeProtectedTermsFile,
} from './protected-terms-file';
import {
  assertProtectedTerms,
  type ProtectedTermsEdit,
  type ProtectedTermsEditResult,
  type ProtectedTermsView,
} from './protected-terms-request';
import { assertWritableTermFilePath } from './term-file';

/** Replacements and incremental edits both write the explicitly selected scope. */
export type ProtectedTermsChange =
  | { readonly kind: 'replace'; readonly replace: readonly string[]; readonly edit?: never }
  | { readonly kind: 'edit'; readonly edit: ProtectedTermsEdit; readonly replace?: never }
  | { readonly kind: 'view'; readonly edit?: never; readonly replace?: never };

export interface ProjectTermsUpdate {
  readonly protectedTerms?: {
    readonly target: { readonly collection?: string };
    readonly change: ProtectedTermsChange;
    readonly list?: boolean;
    readonly file?: string;
  };
  readonly preferredTerminology?: { readonly list?: boolean } & (
    | (PreferredTerminologyEdit & { readonly rule?: never })
    | (Omit<PreferredTerminologyEdit, 'upsert'> & {
        readonly rule: Partial<PreferredTermRule>;
        readonly upsert?: never;
      })
  );
}

export interface ProjectTermsUpdateView {
  readonly lists: { readonly protectedTerms: boolean; readonly preferredTerminology: boolean };
  readonly protectedTerms?: ProtectedTermsView;
  readonly preferredTerminology?: Omit<LoadPreferredTerminologyResult, 'error'>;
  /** Load failure retained in the view, including failed list-only requests. */
  readonly preferredTerminologyError?: LingoTrackerError;
  readonly protectedTermsFileChange?: { readonly message: string; readonly filePath?: string };
}

interface ProjectTermsUpdatePlan {
  readonly view: ProjectTermsUpdateView;
  /** Format the preview before writes; application failures return the original error in-band. */
  report(onPreview?: (preview: ProjectTermsUpdateView) => void): ProjectTermsUpdateReport;
}

/** Completed update with its pre-write display and original error, if application failed. */
interface ProjectTermsUpdateReport extends ProjectTermsUpdateView {
  /** An applied list edit; `cleared` means its written list is empty, even when already empty. */
  readonly protectedTermsResult?: ProtectedTermsEditResult & { readonly action: 'updated' | 'cleared' };
  /**
   * Empty replacements are `cleared` for both term kinds; preferred non-empty replacements are `set`.
   * Single-rule `added`/`updated`/`removed` mean requested and applied, not a change in list contents.
   * A single-rule removal remains `removed` when it removes the last rule.
   */
  readonly preferredTerminologyResult?: Omit<PreferredTerminologyEditResult, 'error' | 'action'> & {
    readonly action: 'added' | 'updated' | 'removed' | 'set' | 'cleared';
  };
  readonly status: 'succeeded' | 'failed';
  /** True only when every attempted write was successfully restored. */
  readonly reverted: boolean;
  readonly error?: unknown;
}

/** One decision: diagnostics for refusal, preview and written values for completion. */
export type ProjectTermsUpdateOutcome =
  | {
      readonly status: 'refused';
      readonly error: unknown;
    }
  | {
      readonly status: 'failed';
      readonly error: unknown;
      readonly reverted: boolean;
      readonly view: ProjectTermsUpdateView;
    }
  | { readonly status: 'listed'; readonly view: ProjectTermsUpdateView }
  | {
      readonly status: 'changed';
      readonly view: ProjectTermsUpdateView;
      readonly written: Pick<
        ProjectTermsUpdateReport,
        'protectedTermsResult' | 'preferredTerminologyResult' | 'protectedTermsFileChange'
      >;
    };

export interface ProjectTermsUpdateOptions {
  readonly onPreview?: (view: ProjectTermsUpdateView) => void;
}

/** Admit submitted rule fields in the same order as structured edit contradictions. */
function resolveProjectTermsUpdate(update: ProjectTermsUpdate): ProjectTermsUpdate {
  const request = update.preferredTerminology;
  const rule = request?.rule;
  if (request === undefined || rule === undefined) return update;
  if (request.upsert !== undefined)
    throw new InvalidProjectTermsEditError(
      'Only one preferred terminology edit can be applied at a time',
      'preferred-conflict',
    );
  if (rule.discouraged !== undefined && request.remove !== undefined && rule.preferred === undefined) {
    throw new InvalidProjectTermsEditError(
      'Only one preferred terminology edit can be applied at a time',
      'preferred-conflict',
    );
  }
  if (
    rule.discouraged === undefined &&
    (rule.preferred !== undefined || rule.reason !== undefined) &&
    (request.remove !== undefined || request.list === true)
  ) {
    throw new InvalidProjectTermsEditError(
      'Preferred terminology rule fields need a discouraged term',
      'preferred-orphan-flags',
    );
  }
  if (rule.discouraged !== undefined && rule.preferred === undefined) {
    throw new InvalidProjectTermsEditError(
      'A preferred terminology upsert needs a preferred term',
      'preferred-incomplete-flags',
    );
  }
  const { rule: _rule, ...edit } = request;
  return {
    ...update,
    preferredTerminology: {
      ...edit,
      ...(rule.discouraged !== undefined &&
        rule.preferred !== undefined && {
          upsert: { discouraged: rule.discouraged, preferred: rule.preferred, reason: rule.reason },
        }),
    },
  };
}

interface ValidatedEdit {
  readonly replacing: boolean;
  readonly hasProtectedEdit: boolean;
  readonly hasPreferredEdit: boolean;
}

interface ResolvedProjectTermsUpdate {
  readonly pointer?: PointerChange;
  readonly nextConfig: LingoTrackerConfig;
  readonly view: ProjectTermsUpdateView;
  readonly preferredPath?: string;
  readonly preferredSnapshot?: LoadPreferredTerminologyResult;
  readonly protectedPath?: string;
}

/** Checks edit combinations and submitted values once, before a pointer or term file changes. */
function validateProjectTermsUpdate(update: ProjectTermsUpdate): ValidatedEdit {
  const protectedRequest = update.protectedTerms;
  const preferredRequest = update.preferredTerminology;
  const protectedEdit = protectedRequest?.change.edit;
  const replacing = protectedRequest !== undefined && protectedRequest.change.kind === 'replace';
  let hasProtectedEdit = false;

  if (protectedRequest !== undefined) {
    if (protectedRequest.file !== undefined && typeof protectedRequest.file !== 'string') {
      throw new InvalidProjectTermsEditError('Protected terms file path must be a string', 'protected-file-path');
    }
    hasProtectedEdit = validateListEdit(protectedEdit ?? {}, {
      shape: () => new InvalidCollectionError('protectedTerms must be an array of strings'),
      conflict: () =>
        new InvalidProjectTermsEditError(
          'A replacement list cannot be combined with additions or removals',
          'protected-conflict',
        ),
      combinationsFirst: true,
      ...(!replacing &&
        !protectedRequest.list &&
        protectedRequest.file === undefined && {
          missing: () =>
            new InvalidProjectTermsEditError(
              'A protected terms update needs a list edit, list view, or file path',
              'protected-missing',
            ),
        }),
    });
    if (replacing) assertProtectedTerms(protectedRequest.change.replace);
    if (replacing && hasProtectedEdit) {
      throw new InvalidProjectTermsEditError(
        'A replacement list cannot be combined with another list edit',
        'protected-replacement-conflict',
      );
    }
  }

  const hasPreferredEdit =
    preferredRequest?.set !== undefined ||
    preferredRequest?.upsert !== undefined ||
    preferredRequest?.remove !== undefined;
  if (preferredRequest !== undefined) {
    if (!hasPreferredEdit && !preferredRequest.list) {
      throw new InvalidProjectTermsEditError(
        'A preferred terminology update needs a rule edit or list view',
        'preferred-missing',
      );
    }
    if (preferredRequest.remove !== undefined && typeof preferredRequest.remove !== 'string') {
      throw new InvalidProjectTermsEditError('A rule to remove must name a discouraged term', 'preferred-remove-shape');
    }
    if (
      Number(preferredRequest.set !== undefined) +
        Number(preferredRequest.upsert !== undefined) +
        Number(preferredRequest.remove !== undefined) >
      1
    ) {
      throw new InvalidProjectTermsEditError(
        'Only one preferred terminology edit can be applied at a time',
        'preferred-conflict',
      );
    }
    if (preferredRequest.set !== undefined) {
      if (!Array.isArray(preferredRequest.set)) {
        throw new InvalidProjectTermsEditError(
          'Preferred terminology replacement must be an array of rules',
          'preferred-replacement-shape',
        );
      }
      const errors = validatePreferredTermRules(preferredRequest.set);
      if (errors.length > 0) throw new PreferredTerminologyValidationError(errors, preferredRequest.set);
    }
  }
  return { replacing, hasProtectedEdit, hasPreferredEdit };
}

interface PointerChange {
  readonly destination?: string;
  readonly carried: readonly string[];
  readonly message: string;
}

/** Resolve a pointer change independently from the list change. */
function planProtectedTermsPointer(
  project: OpenedProject,
  request: NonNullable<ProjectTermsUpdate['protectedTerms']>,
  protectedTerms: ProtectedTermsView | undefined,
) {
  const { sourceConfig: currentConfig, projectRoot: cwd } = project;
  let nextConfig = currentConfig;
  let pointerChange: PointerChange | undefined;
  let protectedTermsFileChange: ProjectTermsUpdateView['protectedTermsFileChange'];
  if (request.file !== undefined) {
    const pointer = request.file.trim() || undefined;
    const collectionName = request.target.collection;
    if (collectionName && !Object.keys(currentConfig.collections ?? {}).includes(collectionName)) {
      throw new CollectionNotFoundError(collectionName);
    }
    let filePath: string | undefined;
    if (collectionName) {
      if (pointer !== undefined) filePath = resolveProtectedTermsFilePath(pointer, cwd);
    } else {
      filePath = resolveGlobalProtectedTermsFilePath({ ...currentConfig, protectedTermsFile: pointer }, cwd);
    }
    if (filePath !== undefined) assertWritableProtectedTermsPath(filePath);
    const oldCollectionPath = collectionName
      ? resolveCollectionProtectedTermsFilePath(currentConfig.collections[collectionName], cwd)
      : undefined;
    const carried =
      protectedTerms?.storedTerms ??
      readStoredProjectProtectedTerms(
        collectionName
          ? oldCollectionPath === undefined
            ? undefined
            : { path: oldCollectionPath, explicit: true }
          : resolveGlobalProtectedTermsFile(currentConfig, cwd),
      );
    let message = `Global protected terms file set to ${filePath}`;
    if (collectionName) {
      message =
        filePath === undefined
          ? `Collection "${collectionName}" protected terms file cleared`
          : `Collection "${collectionName}" protected terms file set to ${filePath}`;
    }
    protectedTermsFileChange = { message, filePath };
    pointerChange = {
      destination: filePath,
      carried,
      message: protectedTermsFileChange.message,
    };
    if (collectionName) {
      nextConfig = patchCollectionEntry(currentConfig, collectionName, { protectedTermsFile: pointer ?? '' });
    } else {
      nextConfig = { ...currentConfig, protectedTermsFile: pointer };
      if (pointer === undefined) delete nextConfig.protectedTermsFile;
    }
    if (protectedTerms !== undefined) {
      const collectionTerms = collectionName && filePath === undefined ? [] : protectedTerms.collectionTerms;
      const previousPath = collectionName ? protectedTerms.collectionFilePath : protectedTerms.globalFilePath;
      protectedTerms = {
        ...protectedTerms,
        globalFilePath: collectionName ? protectedTerms.globalFilePath : (filePath ?? protectedTerms.globalFilePath),
        collectionFilePath: collectionName ? filePath : protectedTerms.collectionFilePath,
        collectionTerms,
        effectiveTerms: normalizeProtectedTerms([...protectedTerms.globalTerms, ...collectionTerms]),
        storedTerms: collectionName ? [...collectionTerms] : protectedTerms.storedTerms,
        warnings: protectedTerms.warnings.filter(
          (warning) => previousPath === undefined || !warning.includes(previousPath),
        ),
      };
    }
  }
  return { nextConfig, pointerChange, protectedTermsFileChange, protectedTerms };
}

function createProjectTermsUpdatePlan(project: OpenedProject, update: ProjectTermsUpdate): ProjectTermsUpdatePlan {
  update = resolveProjectTermsUpdate(update);
  const validated = validateProjectTermsUpdate(update);
  const { projectRoot: cwd, sourceConfig: currentConfig } = project;
  const protectedRequest = update.protectedTerms;
  const { replacing } = validated;
  const preferredRequest = update.preferredTerminology;
  const collectionName = protectedRequest?.target.collection;
  if (
    protectedRequest !== undefined &&
    !replacing &&
    collectionName &&
    currentConfig.collections[collectionName] === undefined
  ) {
    throw new CollectionNotFoundError(collectionName);
  }
  const needsProtectedView = protectedRequest !== undefined && !replacing;
  const needsPreferredView = preferredRequest !== undefined && preferredRequest.set === undefined;
  const snapshot = needsProtectedView || needsPreferredView ? readProjectTermsView(project) : undefined;
  let protectedTerms: ProtectedTermsView | undefined;
  if (needsProtectedView && protectedRequest !== undefined && snapshot !== undefined) {
    protectedTerms = snapshot.forTarget(protectedRequest.target);
  }
  const preferredTerminology =
    preferredRequest !== undefined && preferredRequest.set === undefined ? snapshot?.preferredTerminology : undefined;
  const pointerPlan =
    protectedRequest === undefined
      ? { nextConfig: currentConfig, protectedTerms, pointerChange: undefined, protectedTermsFileChange: undefined }
      : planProtectedTermsPointer(project, protectedRequest, protectedTerms);
  const { nextConfig, pointerChange, protectedTermsFileChange } = pointerPlan;
  protectedTerms = pointerPlan.protectedTerms;
  const preferredPath = validated.hasPreferredEdit ? resolvePreferredTerminologyFilePath(nextConfig, cwd) : undefined;
  if (preferredPath !== undefined) assertWritableTermFilePath('preferred terminology file', preferredPath);
  let protectedPath: string | undefined;
  if (replacing || validated.hasProtectedEdit) {
    if (collectionName) {
      const collection = nextConfig.collections[collectionName];
      if (collection === undefined) throw new CollectionNotFoundError(collectionName);
      protectedPath = resolveWritableCollectionProtectedTermsPath(collectionName, collection, cwd);
    } else {
      protectedPath = resolveGlobalProtectedTermsFilePath(nextConfig, cwd);
    }
  }
  if (protectedPath !== undefined) assertWritableProtectedTermsPath(protectedPath);
  const view = {
    protectedTerms,
    preferredTerminology:
      preferredTerminology === undefined
        ? undefined
        : {
            rules: preferredTerminology.rules,
            filePath: preferredTerminology.filePath,
            warning: preferredTerminology.warning,
          },
    preferredTerminologyError:
      preferredTerminology?.error === undefined ? undefined : new CoreOperationError(preferredTerminology.error),
    protectedTermsFileChange,
    lists: { protectedTerms: protectedRequest?.list === true, preferredTerminology: preferredRequest?.list === true },
  };
  const resolved: ResolvedProjectTermsUpdate = {
    pointer: pointerChange,
    nextConfig,
    view,
    preferredPath,
    preferredSnapshot: preferredTerminology,
    protectedPath,
  };
  return {
    view,
    report: (onPreview) => {
      let reverted = false;
      try {
        onPreview?.(view);
        if (
          (preferredRequest?.upsert !== undefined || preferredRequest?.remove !== undefined) &&
          view.preferredTerminologyError !== undefined
        ) {
          throw view.preferredTerminologyError;
        }
        const result = applyProjectTermsUpdate(project, update, resolved, (outcome) => {
          reverted = outcome.status === 'failed' && outcome.reverted;
        });
        return {
          ...view,
          ...result,
          status: 'succeeded',
          reverted: false,
        };
      } catch (error) {
        return {
          ...view,
          error,
          status: 'failed',
          reverted,
        };
      }
    },
  };
}

/** Apply a validated plan, restoring changed files and pointers after a failure. */
function applyProjectTermsUpdate(
  project: OpenedProject,
  update: ProjectTermsUpdate,
  resolved: ResolvedProjectTermsUpdate,
  onOutcome: (outcome: ConfigWriteOutcome) => void,
): Pick<ProjectTermsUpdateReport, 'protectedTermsResult' | 'preferredTerminologyResult'> {
  const { projectRoot: cwd } = project;
  const configWrite = guardedConfigWrite(project);
  configWrite.assertUnchanged();
  const { pointer, preferredPath, protectedPath, view } = resolved;
  const writes: CompanionFileWrite[] = [];
  if (pointer?.destination !== undefined) {
    const destination = pointer.destination;
    writes.push({ path: destination, write: () => writeProtectedTermsFile(destination, [...pointer.carried]) });
  }
  let preferredTerminologyResult: ProjectTermsUpdateReport['preferredTerminologyResult'];
  const preferredRequest = update.preferredTerminology;
  if (preferredPath !== undefined && preferredRequest !== undefined) {
    writes.push({
      path: preferredPath,
      write: () => {
        const written = editPreferredTerminology(
          resolved.nextConfig,
          preferredRequest,
          cwd,
          resolved.preferredSnapshot,
        );
        preferredTerminologyResult = {
          rules: written.rules,
          filePath: written.filePath,
          warning: written.warning,
          changedRule: written.changedRule,
          action: written.action ?? (written.rules.length === 0 ? 'cleared' : 'set'),
        };
      },
    });
  }
  let protectedTermsResult: ProjectTermsUpdateReport['protectedTermsResult'];
  const protectedRequest = update.protectedTerms;
  if (protectedPath !== undefined && protectedRequest !== undefined) {
    const change = protectedRequest.change;
    let terms: string[] | undefined;
    switch (change.kind) {
      case 'replace':
        terms = normalizeProtectedTerms([...change.replace]);
        break;
      case 'edit':
        if (view.protectedTerms !== undefined) {
          terms = mergeListEdit(view.protectedTerms.storedTerms, change.edit, normalizeProtectedTerms);
        }
        break;
      case 'view':
        break;
    }
    if (terms !== undefined) {
      const nextTerms = terms;
      writes.push({
        path: protectedPath,
        write: () => {
          writeProtectedTermsFile(protectedPath, nextTerms);
          protectedTermsResult = {
            terms: nextTerms,
            filePath: protectedPath,
            action: nextTerms.length === 0 ? 'cleared' : 'updated',
          };
        },
      });
    }
  }
  configWrite.transaction(pointer === undefined ? undefined : resolved.nextConfig, writes, onOutcome);
  return { protectedTermsResult, preferredTerminologyResult };
}

/** Validate, preview and apply one Project Terms request, returning one outcome. */
export function updateProjectTerms(
  project: OpenedProject,
  update: ProjectTermsUpdate,
  options: ProjectTermsUpdateOptions = {},
): ProjectTermsUpdateOutcome {
  let plan: ProjectTermsUpdatePlan;
  try {
    plan = createProjectTermsUpdatePlan(project, update);
  } catch (error) {
    return { status: 'refused', error };
  }
  const report = plan.report(options.onPreview);
  if (report.status === 'failed') {
    return { status: 'failed', error: report.error, reverted: report.reverted, view: plan.view };
  }
  if (
    report.preferredTerminologyError !== undefined &&
    report.protectedTermsResult === undefined &&
    report.protectedTermsFileChange === undefined
  ) {
    return {
      status: 'failed',
      error: report.preferredTerminologyError,
      reverted: false,
      view: plan.view,
    };
  }
  if (
    report.protectedTermsResult === undefined &&
    report.preferredTerminologyResult === undefined &&
    report.protectedTermsFileChange === undefined
  ) {
    return { status: 'listed', view: plan.view };
  }
  return {
    status: 'changed',
    view: plan.view,
    written: {
      protectedTermsResult: report.protectedTermsResult,
      preferredTerminologyResult: report.preferredTerminologyResult,
      protectedTermsFileChange: report.protectedTermsFileChange,
    },
  };
}
