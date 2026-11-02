import { relative, resolve } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  assertImportableLocale,
  type Collection,
  type OpenedProject,
  openProjectCollection,
  type RunImportOptions,
  type RunImportResult,
  summarizeImportRuns,
} from '@simoncodes-ca/core';
import type {
  ImportFileRequestDto,
  ImportJobResultDto,
  ImportPlanDto,
  ImportPlanFileDto,
  ImportRequestDto,
} from '@simoncodes-ca/data-transfer';
import { DEFAULT_IMPORT_STRATEGY, importStrategyPolicy, isImportStrategy } from '@simoncodes-ca/domain';
import { MAX_PLAN_MESSAGES } from './plan-limits';

/** A source failure has no core result, but still occupies its ordered file slot. */
export interface ImportFileRun {
  readonly file: ImportFileRequestDto;
  readonly format: 'json' | 'xliff';
  readonly run?: RunImportResult;
  readonly sourceProblem?: string;
  readonly large?: boolean;
}

/** Applies CLI defaults and validates every locale before any file is parsed. */
export function mapImportRequestToRunOptions(
  dto: ImportRequestDto,
  project: OpenedProject,
): { collection: Collection; options: RunImportOptions[] } {
  const errors: string[] = [];
  const strategy = dto.strategy ?? DEFAULT_IMPORT_STRATEGY;
  if (!isImportStrategy(strategy))
    errors.push('strategy must be translation-service, verification, migration or update.');
  dto.files.forEach((file, index) => {
    if (file.format !== undefined && file.format !== 'json' && file.format !== 'xliff')
      errors.push(`files[${index}].format must be xliff or json.`);
  });
  if (dto.files.length === 0) errors.push('files must be a non-empty array.');
  if (errors.length)
    throw new BadRequestException({ statusCode: 400, message: 'Invalid import request', error: 'Bad Request', errors });
  const collection = openProjectCollection(project, dto.collection, { writable: true });
  for (const file of dto.files) {
    if (file.locale !== collection.baseLocale && !collection.locales.includes(file.locale)) {
      errors.push(`File "${file.path}" locale "${file.locale}" is not configured for collection "${collection.name}".`);
    }
  }
  if (errors.length)
    throw new BadRequestException({ statusCode: 400, message: 'Invalid import request', error: 'Bad Request', errors });
  const defaults = importStrategyPolicy(strategy).defaults;
  const options: RunImportOptions[] = dto.files.map((file) => ({
    source: resolve(project.projectRoot, file.path),
    locale: file.locale,
    format: file.format,
    strategy,
    createMissing: dto.createMissing ?? defaults.createMissing,
    updateComments: dto.updateComments ?? defaults.updateComments,
    updateTags: dto.updateTags ?? defaults.updateTags,
    preserveStatus: dto.preserveStatus ?? false,
    validateBase: dto.validateBase ?? true,
    cwd: project.projectRoot,
  }));
  for (const option of options) assertImportableLocale(collection, option.locale, strategy);
  return { collection, options };
}

export function mapImportResultToPlanFile(file: ImportFileRun): ImportPlanFileDto {
  const result = file.run?.result;
  return {
    path: file.file.path,
    locale: file.file.locale,
    format: file.format,
    entries: file.run?.entriesParsed ?? 0,
    imported: result?.resourcesImported ?? 0,
    created: result?.resourcesCreated ?? 0,
    updated: result?.resourcesUpdated ?? 0,
    skipped: result?.resourcesSkipped ?? 0,
    failed: result?.resourcesFailed ?? 0,
    changed: new Set(result?.filesAffected ?? []).size,
    statusTransitions: result?.statusTransitions.map((t) => ({ ...t })) ?? [],
    warnings: result?.warnings.slice(0, MAX_PLAN_MESSAGES) ?? [],
    errors: (file.sourceProblem === undefined ? (result?.errors ?? []) : [file.sourceProblem]).slice(
      0,
      MAX_PLAN_MESSAGES,
    ),
    ...(file.sourceProblem !== undefined && { sourceProblem: file.sourceProblem }),
  };
}

export function mapImportRunToPlan(request: ImportRequestDto, runs: readonly ImportFileRun[]): ImportPlanDto {
  const { totals } = summarizeImportRuns(runs.flatMap(({ run }) => (run ? [run] : [])));
  return buildImportPlan(request, runs, totals);
}

function buildImportPlan(
  request: ImportRequestDto,
  runs: readonly ImportFileRun[],
  totals: ImportPlanDto['totals'],
): ImportPlanDto {
  const files = runs.map(mapImportResultToPlanFile);
  const statusTransitions: ImportPlanDto['statusTransitions'][number][] = [];
  for (const file of files)
    for (const transition of file.statusTransitions) {
      const found = statusTransitions.find((t) => t.from === transition.from && t.to === transition.to);
      if (found) found.count += transition.count;
      else statusTransitions.push({ ...transition });
    }
  const issues = runs.flatMap(
    ({ file, run }) =>
      run?.result.changes.flatMap((change) =>
        change.type === 'failed' || change.type === 'skipped'
          ? [{ path: file.path, locale: file.locale, key: change.key, type: change.type, reason: change.reason ?? '' }]
          : [],
      ) ?? [],
  );
  // Stable sort preserves diagnostic order within each severity before the shared cap.
  issues.sort((left, right) => Number(left.type === 'skipped') - Number(right.type === 'skipped'));
  const icuAutoFixes = runs.flatMap(({ file, run }) =>
    [...(run?.result.icuAutoFixes ?? [])]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(({ key, originalValue, fixedValue, description }) => ({
        path: file.path,
        locale: file.locale,
        key,
        originalValue,
        fixedValue,
        description,
      })),
  );
  const warnings = runs.flatMap(({ run }) => run?.result.warnings ?? []);
  const errors = runs.flatMap(({ run, sourceProblem }) =>
    sourceProblem === undefined ? (run?.result.errors ?? []) : [sourceProblem],
  );
  return {
    collection: request.collection,
    strategy: request.strategy ?? DEFAULT_IMPORT_STRATEGY,
    files,
    totals,
    statusTransitions,
    issues: issues.slice(0, MAX_PLAN_MESSAGES),
    icuAutoFixes: icuAutoFixes.slice(0, MAX_PLAN_MESSAGES),
    warnings: warnings.slice(0, MAX_PLAN_MESSAGES),
    errors: errors.slice(0, MAX_PLAN_MESSAGES),
    largeFiles: runs.filter((file) => file.large).map((file) => file.file.path),
    truncated: {
      issues: Math.max(0, issues.length - MAX_PLAN_MESSAGES),
      icuAutoFixes: Math.max(0, icuAutoFixes.length - MAX_PLAN_MESSAGES),
      warnings: Math.max(0, warnings.length - MAX_PLAN_MESSAGES),
      errors: Math.max(0, errors.length - MAX_PLAN_MESSAGES),
    },
  };
}

export function mapImportRunToJobResult(
  request: ImportRequestDto,
  runs: readonly ImportFileRun[],
  projectRoot: string,
): ImportJobResultDto {
  const summary = summarizeImportRuns(runs.flatMap(({ run }) => (run ? [run] : [])));
  const plan = buildImportPlan(request, runs, summary.totals);
  const files = runs.map((file) => ({
    ...mapImportResultToPlanFile(file),
    outcome:
      file.sourceProblem !== undefined || file.run?.outcome === 'failed' ? ('failed' as const) : ('imported' as const),
    filesModified: [
      ...new Set(file.run?.result.filesModified.map((path) => relative(projectRoot, resolve(projectRoot, path))) ?? []),
    ],
  }));
  return {
    collection: plan.collection,
    strategy: plan.strategy,
    files,
    totals: plan.totals,
    statusTransitions: plan.statusTransitions,
    icuAutoFixes: plan.icuAutoFixes,
    issues: plan.issues,
    warnings: plan.warnings,
    errors: plan.errors,
    truncated: plan.truncated,
    filesModified: [...new Set(files.flatMap((file) => file.filesModified))],
    outcome: runs.some((file) => file.sourceProblem !== undefined) ? 'failed' : summary.outcome,
  };
}
