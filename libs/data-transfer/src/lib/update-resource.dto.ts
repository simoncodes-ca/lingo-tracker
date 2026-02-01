export interface LocaleUpdateDto {
  value: string;
}

export interface UpdateResourceDto {
  key: string;
  targetFolder?: string;
  baseValue?: string;
  comment?: string;
  tags?: string[];
  locales?: Record<string, LocaleUpdateDto>;
}
