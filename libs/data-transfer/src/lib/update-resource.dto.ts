import type { TranslationStatus } from './translation-status';

export interface LocaleUpdateDto {
  value: string;
  status: TranslationStatus;
}

export interface UpdateResourceDto {
  key: string;
  targetFolder?: string;
  baseValue?: string;
  comment?: string;
  tags?: string[];
  locales?: Record<string, LocaleUpdateDto>;
}
