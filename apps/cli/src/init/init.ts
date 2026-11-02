import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG_FILENAME, initProject } from '@simoncodes-ca/core';
import { DEFAULT_APP_RUNTIME, isAppRuntime } from '@simoncodes-ca/domain';
import { CommandOutput } from '../runner/command-output';
import { type Answers, defineCommand, requireOptions } from '../runner/command-runner';
import type { InitOptions } from '../types/init-options.js';
import { ConsoleFormatter } from '../utils';
import { detectRuntime } from './detect-runtime';
import { INIT_FLAGS } from './init-flags';

export const initCommand = defineCommand<InitCommandOptions>()({
  flags: INIT_FLAGS,
  name: 'Initialization',
  // Writes `.lingo-tracker.json`, so there is none to load yet.
  collection: 'none',
  config: false,
  preflight: ({ options }) => ({ explicitRuntime: options.runtime !== undefined }),
  // No `required`: the name and folder are only needed when there is a config to write.
  run: ({ cwd, answers, interactive, preflight }) => writeConfig(cwd, answers, interactive, preflight.explicitRuntime),
});

function writeConfig(
  cwd: string,
  result: Answers<InitCommandOptions>,
  interactive: boolean,
  explicitRuntime: boolean,
): void {
  const configPath = resolve(cwd, CONFIG_FILENAME);

  if (existsSync(configPath)) {
    ConsoleFormatter.info('Lingo Tracker is already initialized in this folder. Nothing to do.');
    return;
  }

  requireOptions(result, ['collectionName', 'translationsFolder'], interactive, INIT_FLAGS);
  const detectedRuntime = !interactive && result.runtime === undefined ? detectRuntime(cwd) : undefined;
  const runtime = result.runtime ?? detectedRuntime ?? DEFAULT_APP_RUNTIME;
  if (!isAppRuntime(runtime)) {
    throw new Error(`--runtime must be one of: ${INIT_FLAGS.runtime.choices.join(', ')}`);
  }
  if (detectedRuntime !== undefined) {
    ConsoleFormatter.info(`Detected runtime: ${detectedRuntime} (from package.json)`);
  }
  initProject(cwd, {
    ...result,
    runtime: runtime !== DEFAULT_APP_RUNTIME || explicitRuntime ? runtime : undefined,
  });
  CommandOutput.log(`Created ${CONFIG_FILENAME} in ${cwd}`);
}

export type InitCommandOptions = Omit<InitOptions, 'readOnly'>;
