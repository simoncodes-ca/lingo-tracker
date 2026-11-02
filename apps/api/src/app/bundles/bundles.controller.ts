import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import {
  addBundleDefinition,
  deleteBundleDefinition,
  type OpenedProject,
  planBundle,
  updateBundleDefinition,
} from '@simoncodes-ca/core';
import type {
  BundleDryRunRequestDto,
  BundleDryRunResultDto,
  BundleGenerateJobDto,
  CreateBundleDto,
  GenerateBundleRequestDto,
  UpdateBundleDto,
} from '@simoncodes-ca/data-transfer';
import { RouteProject } from '../config/route-project';
import { mapBundlePlanToDto } from '../mappers/bundle.mapper';
import { bundleDryRunBody, createBundleBody, generateBundleBody, updateBundleBody } from '../validation/dto-schemas';
import { ValidBody } from '../validation/valid-body';
import { BundleJobService } from './bundle-job.service';

/**
 * Bundle definitions are checked by the domain Bundle Definition rules: core's add/update
 * operations normalise and validate them, and the dry run delegates the same rules to core.
 * Invalid, missing and duplicate bundles surface as typed core errors that
 * `LingoTrackerExceptionFilter` maps to 400 (with `errors`), 404 and 409.
 * A blank `name` on update is 400 (`InvalidNameError`).
 */
@Controller('bundles')
export class BundlesController {
  readonly #jobService: BundleJobService;

  constructor(jobService: BundleJobService) {
    this.#jobService = jobService;
  }

  /** Plans a bundle from the request body. The definition need not be saved. */
  @Post('dry-run')
  dryRun(
    @ValidBody(bundleDryRunBody) body: BundleDryRunRequestDto,
    @RouteProject() project: OpenedProject,
  ): BundleDryRunResultDto {
    const plan = planBundle({
      bundleKey: body.name,
      bundleDefinition: body.bundle,
      config: project.sourceConfig,
      ...(body.locales !== undefined && { locales: body.locales }),
      cwd: project.projectRoot,
    });
    return mapBundlePlanToDto(plan);
  }

  @Get('jobs/:jobId')
  getJob(@Param('jobId') jobId: string): BundleGenerateJobDto {
    return this.#jobService.getJob(jobId);
  }

  @Post()
  createBundle(
    @ValidBody(createBundleBody) body: CreateBundleDto,
    @RouteProject() project: OpenedProject,
  ): { message: string } {
    const definition = body.bundle;
    return addBundleDefinition(project, body.name, definition);
  }

  @Put(':name')
  updateBundle(
    @Param('name') name: string,
    @ValidBody(updateBundleBody) body: UpdateBundleDto,
    @RouteProject() project: OpenedProject,
  ): { message: string } {
    const definition = body.bundle;
    return updateBundleDefinition(project, name, definition, body.name === undefined ? {} : { newKey: body.name });
  }

  @Delete(':name')
  deleteBundle(@Param('name') name: string, @RouteProject() project: OpenedProject): { message: string } {
    return deleteBundleDefinition(project, name);
  }

  /** Starts a generation job for a saved bundle and answers 202 with the job snapshot. */
  @Post(':name/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  generateBundle(
    @RouteProject() project: OpenedProject,
    @Param('name') name: string,
    @ValidBody(generateBundleBody) body: GenerateBundleRequestDto | undefined,
  ): BundleGenerateJobDto {
    return this.#jobService.startJob({
      bundleName: name,
      project,
      ...(body?.locales && { locales: body.locales }),
    });
  }
}
