import {
  Injectable,
  Scope,
  Inject,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LingoTrackerConfig } from '@simoncodes-ca/core';
import { CONFIG_FILENAME } from '@simoncodes-ca/core';

@Injectable()
export class ConfigService {
  getConfig(): LingoTrackerConfig {
    const configPath = join(process.cwd(), CONFIG_FILENAME);
    let configContent: string;

    try {
      configContent = readFileSync(configPath, 'utf8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new NotFoundException('Configuration file not found');
      }
      throw new InternalServerErrorException('Failed to read configuration file');
    }

    try {
      return JSON.parse(configContent) as LingoTrackerConfig;
    } catch {
      throw new InternalServerErrorException(
        'Invalid configuration file format',
      );
    }
  }
}
