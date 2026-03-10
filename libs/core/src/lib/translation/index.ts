export type {
  TranslateRequest,
  TranslateResult,
  ProviderCapabilities,
  TranslationProvider,
} from './translation-provider';
export { TranslationError } from './translation-provider';
export { GoogleTranslateV2Provider } from './google-translate-v2.provider';
export { createTranslationProvider } from './translation-provider-factory';
export { TranslationOrchestrator } from './translation-orchestrator';
export type { TranslateTextResult } from './translation-orchestrator';
export { classifyICUContent } from './icu-classifier';
export type { ICUClassification } from './icu-classifier';
export { protectPlaceholders, restorePlaceholders } from './placeholder-protector';
export type { ExtractedPlaceholder, ProtectedText, RestoreResult } from './placeholder-protector';
export { autoTranslateResource } from './auto-translate-resources';
export type { AutoTranslateParams, AutoTranslatedEntry, AutoTranslateResult } from './auto-translate-resources';
export { translateExistingResource } from './translate-existing-resource';
export type { TranslateExistingResourceOptions, TranslateExistingResourceResult } from './translate-existing-resource';
