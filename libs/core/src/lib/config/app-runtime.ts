import { type AppRuntime, DEFAULT_APP_RUNTIME } from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';

/** Resolves the project's global runtime without changing its config snapshot. */
export function appRuntimeOf(config: Pick<LingoTrackerConfig, 'runtime'>): AppRuntime {
  return config.runtime ?? DEFAULT_APP_RUNTIME;
}
