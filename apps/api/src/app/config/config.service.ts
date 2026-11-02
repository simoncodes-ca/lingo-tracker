import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import {
  ConfigNotFoundError,
  ConfigParseError,
  InvalidConfigError,
  type LingoTrackerConfig,
  loadConfig,
  type OpenedProject,
} from '@simoncodes-ca/core';

@Injectable()
export class ConfigService {
  get projectRoot(): string {
    return process.cwd();
  }

  openProject(): OpenedProject {
    return { projectRoot: this.projectRoot, sourceConfig: this.getConfig() };
  }

  /** Reads once per call; read routes own their HTTP responses, including without a global filter. */
  getConfig(): LingoTrackerConfig {
    try {
      return loadConfig({ cwd: this.projectRoot });
    } catch (error) {
      if (error instanceof ConfigNotFoundError) throw new NotFoundException('Configuration file not found');
      if (error instanceof ConfigParseError)
        throw new InternalServerErrorException('Invalid configuration file format');
      throw new InvalidConfigError('Failed to read configuration file', { cause: error });
    }
  }
}
