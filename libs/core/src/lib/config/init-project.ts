import { resolve } from 'node:path';
import type { AppRuntime, BundleDefinition, TokenCasing } from '@simoncodes-ca/domain';
import { DEFAULT_BUNDLE_DIST, DEFAULT_BUNDLE_NAME } from '@simoncodes-ca/domain';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import type { TranslationConfig } from '../../config/translation-config';
import { CONFIG_FILENAME, DEFAULT_CONFIG } from '../../constants';
import { toCollectionEntry } from './collection-entry';
import { initConfig } from './init-config';

export { DEFAULT_BUNDLE_DIST, DEFAULT_BUNDLE_NAME, DEFAULT_TYPE_DIST_FILE } from '@simoncodes-ca/domain';

/** Plain project setup values, independent of flags or prompts. */
export interface InitProjectAnswers {
  collectionName: string;
  translationsFolder: string;
  exportFolder?: string;
  importFolder?: string;
  baseLocale?: string;
  locales?: string[];
  runtime?: AppRuntime;
  setupBundle?: boolean;
  bundleDist?: string;
  bundleName?: string;
  tokenCasing?: TokenCasing;
  typeDistFile?: string;
  tokenConstantName?: string;
  enableAutoTranslation?: boolean;
  translationProvider?: string;
  translationApiKeyEnv?: string;
}

export interface InitProjectResult {
  config: LingoTrackerConfig;
  configPath: string;
}

/** Assemble, validate and exclusively create the initial project config. */
export function initProject(cwd: string, input: InitProjectAnswers): InitProjectResult {
  const answers = resolveAnswers(input);
  const config: LingoTrackerConfig = {
    exportFolder: answers.exportFolder,
    importFolder: answers.importFolder,
    baseLocale: answers.baseLocale,
    locales: answers.locales,
    collections: {},
    bundles: { main: buildBundleDefinition(answers) },
    ...(input.runtime !== undefined && { runtime: input.runtime }),
    ...(answers.translation !== undefined && { translation: answers.translation }),
  };
  config.collections = {
    [answers.collectionName]: toCollectionEntry(config, { translationsFolder: answers.translationsFolder }),
  };
  initConfig(config, { cwd });
  return { config, configPath: resolve(cwd, CONFIG_FILENAME) };
}

type BundleAnswers = {
  setupBundle: boolean;
  bundleDist: string;
  bundleName: string;
  tokenCasing: TokenCasing | undefined;
  typeDistFile: string | undefined;
  tokenConstantName: string | undefined;
};

type InitAnswers = {
  collectionName: string;
  translationsFolder: string;
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  translation: TranslationConfig | undefined;
} & BundleAnswers;

function buildBundleDefinition(bundleAnswers: BundleAnswers): BundleDefinition {
  if (!bundleAnswers.setupBundle) {
    return {
      bundleName: DEFAULT_BUNDLE_NAME,
      dist: DEFAULT_BUNDLE_DIST,
      collections: 'All',
    };
  }

  return {
    bundleName: bundleAnswers.bundleName,
    dist: bundleAnswers.bundleDist,
    collections: 'All',
    ...(bundleAnswers.tokenCasing ? { tokenCasing: bundleAnswers.tokenCasing } : {}),
    ...(bundleAnswers.typeDistFile ? { typeDistFile: bundleAnswers.typeDistFile } : {}),
    ...(bundleAnswers.tokenConstantName ? { tokenConstantName: bundleAnswers.tokenConstantName } : {}),
  };
}

/** Setup values with built-in defaults. */
function resolveAnswers(answers: InitProjectAnswers): InitAnswers {
  const translation: TranslationConfig | undefined = answers.enableAutoTranslation
    ? {
        enabled: true,
        provider: answers.translationProvider ?? 'google-translate',
        apiKeyEnv: answers.translationApiKeyEnv ?? 'GOOGLE_TRANSLATE_API_KEY',
      }
    : undefined;

  // Supplied bundle choices imply customization unless explicitly disabled.
  const hasBundleFlags =
    answers.bundleDist ||
    answers.bundleName ||
    answers.tokenCasing ||
    answers.typeDistFile ||
    answers.tokenConstantName;
  const setupBundle = Boolean(answers.setupBundle ?? hasBundleFlags);

  return {
    collectionName: answers.collectionName,
    translationsFolder: answers.translationsFolder,
    exportFolder: answers.exportFolder ?? DEFAULT_CONFIG.exportFolder,
    importFolder: answers.importFolder ?? DEFAULT_CONFIG.importFolder,
    baseLocale: answers.baseLocale ?? DEFAULT_CONFIG.baseLocale,
    locales: (answers.locales ?? DEFAULT_CONFIG.locales).map((l) => l.trim()).filter((l) => l.length > 0),
    translation,
    setupBundle,
    bundleDist: nonEmptyString(answers.bundleDist) ?? DEFAULT_BUNDLE_DIST,
    bundleName: nonEmptyString(answers.bundleName) ?? DEFAULT_BUNDLE_NAME,
    tokenCasing: answers.tokenCasing,
    typeDistFile: nonEmptyString(answers.typeDistFile),
    tokenConstantName: nonEmptyString(answers.tokenConstantName),
  };
}

function nonEmptyString(value: string | undefined): string | undefined {
  return value !== undefined && value.trim().length > 0 ? value : undefined;
}
