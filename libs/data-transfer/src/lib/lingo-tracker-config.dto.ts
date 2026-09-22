import type { BundleDefinitionDto, TokenCasingDto } from './bundle-definition.dto';
import type { LingoTrackerCollectionDto } from './lingo-tracker-collection.dto';
import type { PreferredTermRuleDto } from './preferred-term-rule.dto';
import type { TranslationConfigDto } from './translation-config.dto';

export interface LingoTrackerConfigDto {
  exportFolder: string;
  importFolder: string;
  baseLocale: string;
  locales: string[];
  collections: Record<string, LingoTrackerCollectionDto>;
  /** Bundle definitions keyed by bundle name. */
  bundles?: Record<string, BundleDefinitionDto>;
  /** Project-wide default token casing for generated type files. Bundles may override it. */
  tokenCasing?: TokenCasingDto;
  /** Project-wide default for ICU → Transloco conversion at bundle time (core default: true). */
  transformICUToTransloco?: boolean;
  translation?: TranslationConfigDto;
  /** Resolved global protected terms, read from the protected-terms file. Read-only. */
  protectedTerms?: string[];
  /** Path of the file the global protected terms are stored in. Read-only; shown in the UI. */
  protectedTermsFilePath?: string;
  /** Rules from the preferred-terminology file, in file order. Omitted when there are none. */
  preferredTerminology?: PreferredTermRuleDto[];
  /** Path of the preferred-terminology file, whether or not it exists yet. Read-only; shown in the UI. */
  preferredTerminologyFilePath?: string;
  /**
   * Set when the preferred-terminology file exists but cannot be used (malformed JSON, wrong
   * shape, invalid rules). `preferredTerminology` is then omitted and terminology checks skip.
   */
  preferredTerminologyError?: string;
  /**
   * Set when an explicitly configured preferred-terminology file does not exist. The list reads
   * as empty and checks still run; saving creates the file.
   */
  preferredTerminologyWarning?: string;
  /** Basename of the served workspace folder. Read-only; shown as the home page title. */
  projectName?: string;
}
