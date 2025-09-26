import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LingoTrackerConfig } from '@simoncodes-ca/common';
import { CONFIG_FILENAME } from '@simoncodes-ca/common';

@Injectable()
export class ConfigService {
  getConfig(): LingoTrackerConfig {
    const configPath = join(process.cwd(), CONFIG_FILENAME);
    let configContent: string;

    try {
      configContent = readFileSync(configPath, 'utf8');
    } catch {
      throw new NotFoundException('Configuration file not found');
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
