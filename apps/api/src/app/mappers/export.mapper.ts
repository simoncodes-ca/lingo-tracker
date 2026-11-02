import { relative, resolve } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  type Collection,
  type ExportRunOptions,
  type ExportRunResult,
  type OpenedProject,
  openProjectCollection,
  type PreparedExportRun,
} from '@simoncodes-ca/core';
import type { ExportJobResultDto, ExportPlanDto, ExportRequestDto } from '@simoncodes-ca/data-transfer';
import { exportOptionsPolicy } from '@simoncodes-ca/domain';
import { MAX_PLAN_MESSAGES } from './plan-limits';

/** Applies CLI defaults and opens the selected collections for reading. */
export function mapExportRequestToRunOptions(
  dto: ExportRequestDto,
  project: OpenedProject,
): { collections: Collection[]; options: ExportRunOptions } {
  const errors: string[] = [];
  if (!exportOptionsPolicy.isFormat(dto.format)) errors.push('format must be xliff or json.');
  const structure = dto.json?.structure;
  if (structure !== undefined && !exportOptionsPolicy.isJsonStructure(structure)) {
    errors.push('json.structure must be hierarchical or flat.');
  }
  if (errors.length > 0) {
    throw new BadRequestException({ statusCode: 400, message: 'Invalid export request', error: 'Bad Request', errors });
  }
  const names = [...new Set(dto.collections ?? Object.keys(project.sourceConfig.collections ?? {}))];
  if (names.length === 0) throw new BadRequestException('Select at least one collection.');
  return {
    collections: names.map((name) => openProjectCollection(project, name)),
    options: {
      format: dto.format,
      status: dto.statuses ?? [...exportOptionsPolicy.defaults.statuses],
      locales: dto.locales === undefined ? undefined : [...dto.locales],
      tags: dto.tags === undefined ? undefined : [...dto.tags],
      outputDirectory: dto.outputDirectory,
      filenamePattern: dto.filenamePattern,
      augmentProtectedTerms: (dto.protectedTermNotes ?? exportOptionsPolicy.defaults.protectNotes) !== false,
      exportFolder: project.sourceConfig.exportFolder,
      cwd: project.projectRoot,
      jsonStructure: structure ?? exportOptionsPolicy.defaults.structure,
      richJson: dto.json?.rich ?? exportOptionsPolicy.defaults.rich,
      includeBase: dto.json?.includeBase ?? exportOptionsPolicy.defaults.includeBase,
      basePropertyName: dto.json?.basePropertyName || undefined,
      includeStatus: dto.json?.includeStatus ?? exportOptionsPolicy.defaults.includeStatus,
      includeComment: dto.json?.includeComment ?? exportOptionsPolicy.defaults.includeComment,
      includeTags: dto.json?.includeTags ?? exportOptionsPolicy.defaults.includeTags,
    },
  };
}

/** Keeps the file plan complete, while bounding diagnostic lists in the preview. */
export function mapPreparedExportToPlanDto(prepared: PreparedExportRun, projectRoot: string): ExportPlanDto {
  return {
    format: prepared.format,
    outputDirectory: relative(projectRoot, prepared.outputDirectory),
    collections: [...prepared.collections],
    locales: [...prepared.locales],
    files: prepared.files.map((file) => ({
      locale: file.locale,
      path: relative(projectRoot, file.path),
      exists: file.exists,
      entriesCount: file.entriesCount,
    })),
    skippedLocales: prepared.skipped.map((skip) => ({ ...skip })),
    entriesTotal: prepared.entriesTotal,
    overwriteCount: prepared.files.filter((file) => file.exists).length,
    ...(prepared.exampleKey && { exampleKey: { ...prepared.exampleKey } }),
    warnings: prepared.warnings.slice(0, MAX_PLAN_MESSAGES),
    errors: prepared.errors.slice(0, MAX_PLAN_MESSAGES),
    hierarchicalConflicts: prepared.hierarchicalConflicts.slice(0, MAX_PLAN_MESSAGES),
    ...(prepared.outputProblem !== undefined && { outputProblem: prepared.outputProblem }),
  };
}

/** Core returns file names relative to its output directory. */
export function mapExportRunResultToJobResult(result: ExportRunResult, projectRoot: string): ExportJobResultDto {
  const filePath = (file: string) => relative(projectRoot, resolve(result.outputDirectory, file));
  return {
    filesWritten: result.filesCreated.map(filePath),
    entriesExported: result.resourcesExported,
    localeResults: result.localeResults.map((locale) => ({
      locale: locale.locale,
      outcome: locale.outcome,
      entriesExported: locale.resourcesExported,
      ...(locale.filesCreated[0] !== undefined && { file: filePath(locale.filesCreated[0]) }),
      ...(locale.error !== undefined && { error: locale.error }),
    })),
    warnings: [...result.warnings],
    errors: [...result.errors],
    outcome: result.outcome,
    outputDirectory: relative(projectRoot, result.outputDirectory),
    format: result.format,
  };
}
