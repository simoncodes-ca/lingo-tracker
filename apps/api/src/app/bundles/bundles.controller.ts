import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { addBundleDefinition, deleteBundleDefinition, planBundle, updateBundleDefinition } from '@simoncodes-ca/core';
import type {
  BundleDryRunRequestDto,
  BundleDryRunResultDto,
  BundleGenerateJobDto,
  CreateBundleDto,
  GenerateBundleRequestDto,
  UpdateBundleDto,
} from '@simoncodes-ca/data-transfer';
import { ConfigService } from '../config/config.service';
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
  readonly #configService: ConfigService;
  readonly #jobService: BundleJobService;

  constructor(configService: ConfigService, jobService: BundleJobService) {
    this.#configService = configService;
    this.#jobService = jobService;
  }

  /** Plans a bundle from the request body. The definition need not be saved. */
  @Post('dry-run')
  dryRun(@ValidBody(bundleDryRunBody) body: BundleDryRunRequestDto): BundleDryRunResultDto {
    const project = this.#configService.openProject();
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
  createBundle(@ValidBody(createBundleBody) body: CreateBundleDto): { message: string } {
    const definition = body.bundle;
    return addBundleDefinition(this.#configService.openProject(), body.name, definition);
  }

  @Put(':name')
  updateBundle(@Param('name') name: string, @ValidBody(updateBundleBody) body: UpdateBundleDto): { message: string } {
    const definition = body.bundle;
    return updateBundleDefinition(
      this.#configService.openProject(),
      name,
      definition,
      body.name === undefined ? {} : { newKey: body.name },
    );
  }

  @Delete(':name')
  deleteBundle(@Param('name') name: string): { message: string } {
    return deleteBundleDefinition(this.#configService.openProject(), name);
  }

  /** Starts a generation job for a saved bundle and answers 202 with the job snapshot. */
  @Post(':name/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  generateBundle(
    @Param('name') name: string,
    @ValidBody(generateBundleBody) body: GenerateBundleRequestDto | undefined,
  ): BundleGenerateJobDto {
    const project = this.#configService.openProject();

    return this.#jobService.startJob({
      bundleName: name,
      project,
      ...(body?.locales && { locales: body.locales }),
    });
  }
}
