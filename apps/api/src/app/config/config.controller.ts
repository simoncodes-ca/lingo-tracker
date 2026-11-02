import { Controller, Get, Put } from '@nestjs/common';
import { type OpenedProject, readProjectTermsView, updateProjectTerms } from '@simoncodes-ca/core';
import type { LingoTrackerConfigDto, UpdateConfigDto } from '@simoncodes-ca/data-transfer';
import { mapConfigToDto } from '../mappers/config.mapper';
import { updateConfigBody } from '../validation/dto-schemas';
import { ValidBody } from '../validation/valid-body';
import { RouteProject } from './route-project';

@Controller('config')
export class ConfigController {
  @Get()
  getConfig(@RouteProject() project: OpenedProject): LingoTrackerConfigDto {
    const snapshot = readProjectTermsView(project);
    return mapConfigToDto(snapshot.forConfig());
  }

  /**
   * Updates supported top-level config fields. Only the fields carried by
   * `UpdateConfigDto` are writable — `collections`, `locales`, and `baseLocale`
   * are never touched by this endpoint.
   *
   * Every submitted field is validated before anything is written, so a bad
   * preferred-terminology list never lands alongside a half-applied protected-terms
   * change. Invalid rules throw `PreferredTerminologyValidationError`, which the global
   * exception filter answers with 400 and `{ message, errors }`, `errors` indexed by row
   * of the submitted list. Other core errors (a missing directory, for example) reach the
   * filter too.
   */
  @Put()
  updateConfig(
    @ValidBody(updateConfigBody) dto: UpdateConfigDto | undefined,
    @RouteProject() project: OpenedProject,
  ): { message: string } {
    const update = dto ?? {};
    if (update.protectedTerms === undefined && update.preferredTerminology === undefined) {
      return { message: 'Configuration updated successfully' };
    }
    const outcome = updateProjectTerms(project, {
      ...(update.protectedTerms !== undefined && {
        protectedTerms: { target: {}, change: { kind: 'replace', replace: update.protectedTerms } },
      }),
      ...(update.preferredTerminology !== undefined && {
        preferredTerminology: { set: update.preferredTerminology },
      }),
    });
    if (outcome.status === 'failed' || outcome.status === 'refused') throw outcome.error;
    return { message: 'Configuration updated successfully' };
  }
}
