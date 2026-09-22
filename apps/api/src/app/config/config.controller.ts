import { basename } from 'node:path';
import { Body, Controller, Get, HttpException, HttpStatus, Put } from '@nestjs/common';
import {
  loadPreferredTerminology,
  PreferredTerminologyValidationError,
  resolvePreferredTerminologyFilePath,
  resolveProtectedTermsForConfig,
  setGlobalProtectedTerms,
  writePreferredTerminology,
} from '@simoncodes-ca/core';
import type {
  LingoTrackerConfigDto,
  PreferredTermRuleErrorDto,
  PreferredTermRulesErrorResponseDto,
  UpdateConfigDto,
} from '@simoncodes-ca/data-transfer';
import { validatePreferredTermRules } from '@simoncodes-ca/domain';
import { mapConfigToDto, mapDtoToConfigUpdate } from '../mappers/config.mapper';
import { ConfigService } from './config.service';

const INVALID_RULES_MESSAGE = 'Invalid preferred terminology rules';

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getConfig(): LingoTrackerConfigDto {
    const config = this.configService.getConfig();
    const cwd = process.cwd();
    return mapConfigToDto(
      config,
      resolveProtectedTermsForConfig(config),
      basename(cwd),
      loadPreferredTerminology(config, cwd),
    );
  }

  /**
   * Updates supported top-level config fields. Only the fields carried by
   * `UpdateConfigDto` are writable — `collections`, `locales`, and `baseLocale`
   * are never touched by this endpoint.
   *
   * Every submitted field is validated before anything is written, so a bad
   * preferred-terminology list never lands alongside a half-applied protected-terms
   * change. Invalid rules answer 400 with `{ message, errors }`, `errors` indexed by
   * row of the submitted list.
   */
  @Put()
  updateConfig(@Body() dto: UpdateConfigDto): { message: string } {
    try {
      const protectedTerms = dto?.protectedTerms;
      if (
        protectedTerms !== undefined &&
        (!Array.isArray(protectedTerms) || protectedTerms.some((t) => typeof t !== 'string'))
      ) {
        throw new HttpException('protectedTerms must be an array of strings', HttpStatus.BAD_REQUEST);
      }

      const preferredTerminology: unknown = dto?.preferredTerminology;
      if (preferredTerminology !== undefined) {
        if (!Array.isArray(preferredTerminology)) {
          throw new HttpException('preferredTerminology must be an array of rules', HttpStatus.BAD_REQUEST);
        }
        const ruleErrors = validatePreferredTermRules(preferredTerminology);
        if (ruleErrors.length > 0) {
          throw invalidRulesException(ruleErrors);
        }
      }

      const update = mapDtoToConfigUpdate(dto ?? {});
      if (update.preferredTerminology !== undefined) {
        const filePath = resolvePreferredTerminologyFilePath(this.configService.getConfig(), process.cwd());
        writePreferredTerminology(filePath, update.preferredTerminology);
      }
      if (update.protectedTerms !== undefined) {
        setGlobalProtectedTerms(update.protectedTerms);
      }
      return { message: 'Configuration updated successfully' };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof PreferredTerminologyValidationError) {
        throw invalidRulesException(error.errors);
      }
      const errorMessage = error instanceof Error ? error.message : 'Error updating configuration';
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }
}

function invalidRulesException(errors: PreferredTermRuleErrorDto[]): HttpException {
  const body: PreferredTermRulesErrorResponseDto = { message: INVALID_RULES_MESSAGE, errors };
  return new HttpException(body, HttpStatus.BAD_REQUEST);
}
