import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { APP_RUNTIMES, isAppRuntime, normalizeTags } from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { CONFIG_FILENAME } from '../../constants';
import { ErrorMessages } from '../errors/error-messages';
import {
  ConfigChangedError,
  ConfigNotFoundError,
  ConfigParseError,
  CoreOperationError,
  InvalidConfigError,
  LingoTrackerError,
} from '../errors/lingo-tracker-error';
import { hasFsErrorCode } from '../file-io/fs-error';
import {
  type CompanionFileWrite,
  type ConfigWriteOutcome,
  runConfigWriteTransaction,
} from './config-write-transaction';
import type { OpenedProject } from './open-collection';

const readVersions = new WeakMap<LingoTrackerConfig, string>();

function configContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Read exact bytes and their version without parsing so guards detect malformed external edits. */
function readConfigContent(configPath: string): { content: string; version: string } | undefined {
  try {
    const content = readFileSync(configPath, 'utf8');
    return { content, version: configContentHash(content) };
  } catch (error) {
    if (hasFsErrorCode(error, 'ENOENT') || hasFsErrorCode(error, 'ENOTDIR')) return undefined;
    throw error;
  }
}

export interface LoadConfigOptions {
  /** Directory that holds `.lingo-tracker.json`. Default: `process.cwd()`. */
  readonly cwd?: string;
}

/**
 * Reads and parses `.lingo-tracker.json`. This is the only config reader: the CLI, the
 * API, and core's own config writers all go through it.
 *
 * The result is the file as written. It is not validated and no fallbacks are applied;
 * call {@link openCollection} to get a collection's effective settings.
 *
 * @throws {ConfigNotFoundError} The file does not exist.
 * @throws {ConfigParseError} The file is not valid JSON, or not a JSON object.
 * Other I/O failures (for example, permission denied) propagate unchanged.
 */
export function loadConfig(options: LoadConfigOptions = {}): LingoTrackerConfig {
  const configPath = resolve(options.cwd ?? process.cwd(), CONFIG_FILENAME);

  const file = readConfigContent(configPath);
  if (file === undefined) throw new ConfigNotFoundError(configPath);

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch (error) {
    throw new ConfigParseError(configPath, error instanceof Error ? error.message : String(error));
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigParseError(configPath, 'the configuration must be a JSON object');
  }

  const config = parsed as LingoTrackerConfig;
  readVersions.set(config, file.version);
  return config;
}

export interface ConfigFileOperations {
  /** Read the configuration file */
  read(): LingoTrackerConfig;
  /** Write the configuration file */
  write(config: LingoTrackerConfig): void;
  /** Write config and companions; observe the explicit restore outcome, then throw the original failure. */
  transaction(
    config: LingoTrackerConfig | undefined,
    companions: readonly CompanionFileWrite[],
    onOutcome?: (outcome: ConfigWriteOutcome) => void,
  ): void;
  /** Refuse a write based on a config snapshot if the file has changed since that read. */
  assertUnchanged(): void;
  /** Create the file only if absent, using the same validation and serialization as write. */
  create(config: LingoTrackerConfig): void;
  /** Update configuration with a partial modification */
  update(updater: (config: LingoTrackerConfig) => LingoTrackerConfig): LingoTrackerConfig;
}

export interface ConfigFileParams {
  /** Current working directory (default: process.cwd()) */
  readonly cwd?: string;
  /** Validate config after reading (default: true) */
  readonly validate?: boolean;
  /** A config returned by `loadConfig`; its original file hash becomes this handle's baseline. */
  readonly snapshot?: LingoTrackerConfig;
}

/**
 * Creates a configuration file operations object.
 * Provides a clean interface for reading and writing config files.
 *
 * Every failure is a typed error: `loadConfig`'s own `ConfigNotFoundError` and
 * `ConfigParseError` pass through, and everything else is an `InvalidConfigError` with a fixed
 * message: `Could not read .lingo-tracker.json` or `Could not write .lingo-tracker.json` for an
 * I/O failure (the fs error is its `cause`), or the field at fault for a required field that is
 * missing or of the wrong shape.
 */
export function createConfigFileOperations(params: ConfigFileParams = {}): ConfigFileOperations {
  const cwd = params.cwd ?? process.cwd();
  const validate = params.validate ?? true;
  const configPath = resolve(cwd, CONFIG_FILENAME);
  let expectedVersion = params.snapshot === undefined ? undefined : readVersions.get(params.snapshot);

  const assertUnchanged = (): void => {
    if (expectedVersion === undefined) return;
    let current: ReturnType<typeof readConfigContent>;
    try {
      current = readConfigContent(configPath);
    } catch (error) {
      throw new InvalidConfigError(`Could not read ${CONFIG_FILENAME}`, { cause: error });
    }
    if (current?.version !== expectedVersion) throw new ConfigChangedError();
  };

  const writeConfig = (config: LingoTrackerConfig, createOnly: boolean, onWriteStarted?: () => void): void => {
    if (validate) validateConfig(config);
    assertUnchanged();
    try {
      onWriteStarted?.();
      // Serialize once: the new baseline must describe exactly the string passed to fs.
      const content = JSON.stringify(config, null, 2);
      writeFileSync(configPath, content, createOnly ? { encoding: 'utf8', flag: 'wx' } : 'utf8');
      expectedVersion = configContentHash(content);
    } catch (error) {
      if (createOnly && hasFsErrorCode(error, 'EEXIST')) {
        throw new InvalidConfigError(ErrorMessages.configAlreadyExists());
      }
      const reason = error instanceof Error ? error.message : String(error);
      const cause = new CoreOperationError(ErrorMessages.fileWriteFailed(configPath, reason));
      throw new InvalidConfigError(`Could not write ${CONFIG_FILENAME}`, { cause });
    }
  };

  return {
    read(): LingoTrackerConfig {
      let config: LingoTrackerConfig;

      try {
        config = loadConfig({ cwd });
      } catch (error) {
        if (error instanceof LingoTrackerError) throw error;
        throw new InvalidConfigError(`Could not read ${CONFIG_FILENAME}`, { cause: error });
      }

      expectedVersion = readVersions.get(config);

      if (validate) {
        prepareConfigSnapshot(config);
      } else {
        normalizeCollectionTags(config);
      }
      return config;
    },

    write(config: LingoTrackerConfig): void {
      writeConfig(config, false);
    },

    transaction(config, companions, onOutcome): void {
      assertUnchanged();
      const previousVersion = expectedVersion;
      let configWriteStarted = false;
      let configWritten = false;
      try {
        const outcome = runConfigWriteTransaction(
          [
            ...(config === undefined
              ? []
              : [
                  {
                    path: configPath,
                    write: () => {
                      writeConfig(config, false, () => {
                        configWriteStarted = true;
                      });
                      configWritten = true;
                    },
                  },
                ]),
            ...companions,
          ],
          (path) => {
            // Do not overwrite another writer's config while restoring our transaction.
            if (path === configPath) {
              if (!configWriteStarted) return false;
              // Failed writes can leave partial bytes that differ from the baseline.
              // Check for concurrent edits only after our write completed successfully.
              if (configWritten) assertUnchanged();
            }
            return true;
          },
        );
        onOutcome?.(outcome);
        if (outcome.status === 'failed') throw outcome.error;
      } catch (error) {
        expectedVersion = previousVersion;
        throw error;
      }
    },

    assertUnchanged,

    create(config: LingoTrackerConfig): void {
      writeConfig(config, true);
    },

    update(updater: (config: LingoTrackerConfig) => LingoTrackerConfig): LingoTrackerConfig {
      const currentConfig = this.read();
      const updatedConfig = updater(currentConfig);
      this.write(updatedConfig);
      return updatedConfig;
    },
  };
}

/** Apply the same preflight checks and tag normalization as a config-file read, without another read. */
function prepareConfigSnapshot(config: LingoTrackerConfig): void {
  validateConfig(config);
  normalizeCollectionTags(config);
}

/**
 * Validates a LingoTrackerConfig structure.
 * Throws `InvalidConfigError` naming the field when the config is invalid.
 */
function validateConfig(config: LingoTrackerConfig): void {
  if (!config.baseLocale) {
    throw new InvalidConfigError(`${CONFIG_FILENAME} is missing the required field "baseLocale"`);
  }

  if (!Array.isArray(config.locales)) {
    throw new InvalidConfigError(`"locales" in ${CONFIG_FILENAME} must be an array`);
  }

  if (!config.collections || typeof config.collections !== 'object') {
    throw new InvalidConfigError(`"collections" in ${CONFIG_FILENAME} must be an object`);
  }

  if ('runtime' in config && !isAppRuntime(config.runtime)) {
    throw new InvalidConfigError(`runtime must be one of: ${APP_RUNTIMES.join(', ')}`);
  }
}

function normalizeCollectionTags(config: LingoTrackerConfig): void {
  if (!config.collections) return;
  for (const collection of Object.values(config.collections)) {
    if (collection.tags !== undefined) {
      collection.tags = normalizeTags(collection.tags);
      if (collection.tags.length === 0) {
        delete collection.tags;
      }
    }
  }
}

/** The guarded write handle of an opened project or collection. */
export function guardedConfigWrite(source: OpenedProject): ConfigFileOperations {
  prepareConfigSnapshot(source.sourceConfig);
  return createConfigFileOperations({ cwd: source.projectRoot, snapshot: source.sourceConfig });
}
