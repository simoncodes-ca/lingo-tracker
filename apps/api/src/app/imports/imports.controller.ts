import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import type { OpenedProject } from '@simoncodes-ca/core';
import type {
  ImportJobDto,
  ImportPlanDto,
  ImportRequestDto,
  ImportSourceListingDto,
} from '@simoncodes-ca/data-transfer';
import type { Response } from 'express';
import { RouteProject } from '../config/route-project';
import {
  type ImportSourcesQuery,
  type ImportUploadQuery,
  importRequestBody,
  importSourcesQuery,
  importUploadQuery,
} from '../validation/dto-schemas';
import { ValidBody, ValidQuery } from '../validation/valid-body';
import { ImportJobService } from './import-job.service';
import { ImportSourceService } from './import-source.service';
import { ImportUploadInterceptor } from './import-upload.interceptor';
import { ImportUploadService, type UploadedImportFile } from './import-upload.service';

@Controller('imports')
export class ImportsController {
  readonly #jobs: ImportJobService;
  readonly #sources: ImportSourceService;

  constructor(
    jobs: ImportJobService,
    sources: ImportSourceService,
    private readonly uploads: ImportUploadService,
  ) {
    this.#jobs = jobs;
    this.#sources = sources;
  }

  @Get('sources')
  listSources(
    @ValidQuery(importSourcesQuery) query: ImportSourcesQuery,
    @RouteProject() project: OpenedProject,
  ): ImportSourceListingDto {
    return this.#sources.listSources(project, query);
  }

  @Post('sources')
  @UseInterceptors(ImportUploadInterceptor)
  upload(
    @ValidQuery(importUploadQuery) query: ImportUploadQuery,
    @UploadedFiles() files: UploadedImportFile[] | undefined,
    @RouteProject() project: OpenedProject,
  ): ImportSourceListingDto {
    return this.uploads.upload(project, query, files);
  }

  @Post('dry-run')
  dryRun(
    @ValidBody(importRequestBody) body: ImportRequestDto,
    @RouteProject() project: OpenedProject,
  ): Promise<ImportPlanDto> {
    return this.#jobs.dryRun({ project, request: body });
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  start(@ValidBody(importRequestBody) body: ImportRequestDto, @RouteProject() project: OpenedProject): ImportJobDto {
    return this.#jobs.startJob({ project, request: body });
  }

  @Get('jobs/:jobId')
  getJob(@Param('jobId') id: string): ImportJobDto {
    return this.#jobs.getJob(id);
  }

  @Get('jobs/:jobId/summary')
  getSummary(@Param('jobId') id: string, @Res({ passthrough: true }) response: Response): string {
    const summary = this.#jobs.getSummary(id);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    response.type('text/markdown');
    response.setHeader('Content-Disposition', `attachment; filename="lingo-tracker-import-summary-${timestamp}.md"`);
    return summary;
  }
}
