import { Body, Controller, Get, HttpException, HttpStatus, Put } from '@nestjs/common';
import { resolveProtectedTermsForConfig, setGlobalProtectedTerms } from '@simoncodes-ca/core';
import type { LingoTrackerConfigDto, UpdateConfigDto } from '@simoncodes-ca/data-transfer';
import { mapConfigToDto, mapDtoToConfigUpdate } from '../mappers/config.mapper';
import { ConfigService } from './config.service';

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getConfig(): LingoTrackerConfigDto {
    const config = this.configService.getConfig();
    return mapConfigToDto(config, resolveProtectedTermsForConfig(config));
  }

  /**
   * Updates supported top-level config fields. Only the fields carried by
   * `UpdateConfigDto` are writable — `collections`, `locales`, and `baseLocale`
   * are never touched by this endpoint.
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
      const update = mapDtoToConfigUpdate(dto ?? {});
      const terms = update.protectedTerms;
      if (terms !== undefined) {
        setGlobalProtectedTerms(terms);
      }
      return { message: 'Configuration updated successfully' };
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Error updating configuration';
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }
}
