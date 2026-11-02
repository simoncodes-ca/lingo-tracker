import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { createConfigFileOperations } from './config-file-operations';

/** Validates and creates a config, refusing to replace an existing file. */
export function initConfig(config: LingoTrackerConfig, options: { cwd?: string } = {}): void {
  createConfigFileOperations(options).create(config);
}
