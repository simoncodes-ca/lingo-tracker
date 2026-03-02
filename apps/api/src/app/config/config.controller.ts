import { Controller, Get } from '@nestjs/common';
import type { LingoTrackerConfigDto } from '@simoncodes-ca/data-transfer';
import { mapConfigToDto } from '../mappers/config.mapper';
import { ConfigService } from './config.service';

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getConfig(): LingoTrackerConfigDto {
    const config = this.configService.getConfig();
    return mapConfigToDto(config);
  }
}
