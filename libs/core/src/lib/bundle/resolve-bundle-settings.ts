import {
  type AppRuntime,
  type BundleDefinition,
  bundleKeyToConstantName,
  type TokenCasing,
} from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { appRuntimeOf } from '../config/app-runtime';

export interface BundleSettingsOverrides {
  readonly tokenCasing?: TokenCasing;
  readonly tokenConstantName?: string;
  readonly transformICUToTransloco?: boolean;
}

export interface BundleSettings {
  readonly runtime: AppRuntime;
  readonly tokenCasing: TokenCasing;
  readonly tokenConstantName: string;
  readonly transformICUToTransloco: boolean;
}

/** One precedence rule for generation and planning. */
export function resolveBundleSettings(
  bundleKey: string,
  config: Pick<LingoTrackerConfig, 'tokenCasing' | 'transformICUToTransloco' | 'runtime'>,
  definition: BundleDefinition,
  overrides: BundleSettingsOverrides = {},
): BundleSettings {
  return {
    runtime: appRuntimeOf(config),
    tokenCasing: overrides.tokenCasing ?? definition.tokenCasing ?? config.tokenCasing ?? 'upperCase',
    tokenConstantName:
      overrides.tokenConstantName ?? definition.tokenConstantName ?? bundleKeyToConstantName(bundleKey),
    transformICUToTransloco:
      overrides.transformICUToTransloco ?? definition.transformICUToTransloco ?? config.transformICUToTransloco ?? true,
  };
}
