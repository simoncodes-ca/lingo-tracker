import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { OpenedProject } from '@simoncodes-ca/core';
import type { ExportJobDto, ExportPlanDto, ExportRequestDto } from '@simoncodes-ca/data-transfer';
import { RouteProject } from '../config/route-project';
import { exportRequestBody } from '../validation/dto-schemas';
import { ValidBody } from '../validation/valid-body';
import { ExportJobService } from './export-job.service';

@Controller('exports')
export class ExportsController {
  readonly #jobs: ExportJobService;

  constructor(jobs: ExportJobService) {
    this.#jobs = jobs;
  }

  @Post('dry-run')
  dryRun(@ValidBody(exportRequestBody) body: ExportRequestDto, @RouteProject() project: OpenedProject): ExportPlanDto {
    return this.#jobs.dryRun({ project, request: body });
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  start(@ValidBody(exportRequestBody) body: ExportRequestDto, @RouteProject() project: OpenedProject): ExportJobDto {
    return this.#jobs.startJob({ project, request: body });
  }

  @Get('jobs/:jobId')
  getJob(@Param('jobId') jobId: string): ExportJobDto {
    return this.#jobs.getJob(jobId);
  }
}
