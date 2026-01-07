import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_FILENAME, LingoTrackerConfig } from '@simoncodes-ca/core';

/**
 * Gets the current working directory, respecting INIT_CWD for pnpm compatibility.
 *
 * This utility centralizes the directory resolution logic used across CLI commands.
 * The INIT_CWD environment variable is set by pnpm and contains the directory where
 * the command was originally invoked, before pnpm changed to the package directory.
 *
 * @returns Absolute path to the current working directory
 *
 * @example
 * ```typescript
 * const cwd = getCwd();
 * const configPath = path.join(cwd, '.lingo-tracker.json');
 * ```
 */
export function getCwd(): string {
  return process.env.INIT_CWD || process.cwd();
}

/**
 * Result returned from successful configuration loading.
 */
export interface ConfigLoadResult {
  /**
   * The parsed LingoTracker configuration object.
   */
  config: LingoTrackerConfig;

  /**
   * Absolute path to the configuration file.
   */
  configPath: string;

  /**
   * Current working directory where configuration was loaded from.
   * Respects INIT_CWD environment variable for pnpm compatibility.
   */
  cwd: string;
}

/**
 * Options for configuration loading behavior.
 */
export interface ConfigLoadOptions {
  /**
   * When true (default), exits the process with code 1 on errors.
   * When false, returns null on errors instead of exiting.
   */
  exitOnError?: boolean;
}

/**
 * Loads and parses the LingoTracker configuration file (.lingo-tracker.json).
 *
 * This utility centralizes configuration loading logic used across CLI commands,
 * eliminating duplication and ensuring consistent error handling and messaging.
 *
 * **Directory Resolution:**
 * - Respects INIT_CWD environment variable (pnpm compatibility)
 * - Falls back to process.cwd() if INIT_CWD not set
 *
 * **Error Handling:**
 * - File not found: Displays helpful message suggesting to run `lingo-tracker init`
 * - Parse errors: Shows specific JSON parsing error message
 * - Behavior controlled by `exitOnError` option (default: exit process)
 *
 * @param options - Configuration loading options
 * @returns Configuration result on success, null on error (when exitOnError is false)
 *
 * @example
 * ```typescript
 * // Default behavior - exits on error
 * const loaded = loadConfiguration();
 * if (!loaded) return; // TypeScript guard (never reached in practice)
 * const { config, cwd } = loaded;
 * ```
 *
 * @example
 * ```typescript
 * // Custom error handling - returns null on error
 * const loaded = loadConfiguration({ exitOnError: false });
 * if (!loaded) {
 *   // Handle error gracefully
 *   return;
 * }
 * const { config, cwd } = loaded;
 * ```
 */
export function loadConfiguration(options?: ConfigLoadOptions): ConfigLoadResult | null {
  const exitOnError = options?.exitOnError ?? true;

  const cwd = getCwd();
  const configPath = path.join(cwd, CONFIG_FILENAME);

  let config: LingoTrackerConfig;
  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(fileContent);
    } else {
      console.error(`❌ Configuration file ${CONFIG_FILENAME} not found.`);
      console.error('Run "lingo-tracker init" to initialize a project.');

      if (exitOnError) {
        process.exit(1);
      }
      return null;
    }
  } catch (error) {
    console.error(`❌ Failed to parse configuration file: ${(error as Error).message}`);

    if (exitOnError) {
      process.exit(1);
    }
    return null;
  }

  return {
    config,
    configPath,
    cwd,
  };
}
