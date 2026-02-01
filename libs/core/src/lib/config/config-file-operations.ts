import { resolve } from 'node:path';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { CONFIG_FILENAME } from '../../constants';
import { readLingoConfig, writeJsonFile } from '../file-io/json-file-operations';

export interface ConfigFileOperations {
  /** Read the configuration file */
  read(): LingoTrackerConfig;
  /** Write the configuration file */
  write(config: LingoTrackerConfig): void;
  /** Update configuration with a partial modification */
  update(updater: (config: LingoTrackerConfig) => LingoTrackerConfig): LingoTrackerConfig;
}

export interface ConfigFileParams {
  /** Current working directory (default: process.cwd()) */
  readonly cwd?: string;
  /** Validate config after reading (default: true) */
  readonly validate?: boolean;
}

/**
 * Creates a configuration file operations object.
 * Provides a clean interface for reading and writing config files.
 */
export function createConfigFileOperations(params: ConfigFileParams = {}): ConfigFileOperations {
  const cwd = params.cwd ?? process.cwd();
  const validate = params.validate ?? true;
  const configPath = resolve(cwd, CONFIG_FILENAME);

  return {
    read(): LingoTrackerConfig {
      let config: LingoTrackerConfig;

      try {
        config = readLingoConfig(configPath);
      } catch (_error) {
        throw new Error('Failed to read or parse configuration file');
      }

      if (validate) {
        validateConfig(config);
      }

      return config;
    },

    write(config: LingoTrackerConfig): void {
      if (validate) {
        validateConfig(config);
      }

      try {
        writeJsonFile({
          filePath: configPath,
          data: config,
          pretty: true,
        });
      } catch (_error) {
        throw new Error('Failed to write configuration file');
      }
    },

    update(updater: (config: LingoTrackerConfig) => LingoTrackerConfig): LingoTrackerConfig {
      const currentConfig = this.read();
      const updatedConfig = updater(currentConfig);
      this.write(updatedConfig);
      return updatedConfig;
    },
  };
}

/**
 * Validates a LingoTrackerConfig structure.
 * Throws if config is invalid.
 */
function validateConfig(config: LingoTrackerConfig): void {
  if (!config.baseLocale) {
    throw new Error('Configuration missing required field: baseLocale');
  }

  if (!Array.isArray(config.locales)) {
    throw new Error('Configuration field "locales" must be an array');
  }

  if (!config.collections || typeof config.collections !== 'object') {
    throw new Error('Configuration field "collections" must be an object');
  }
}

/**
 * Helper function for atomic config updates.
 */
export function updateConfig(
  updater: (config: LingoTrackerConfig) => LingoTrackerConfig,
  cwd?: string,
): LingoTrackerConfig {
  return createConfigFileOperations({ cwd }).update(updater);
}
