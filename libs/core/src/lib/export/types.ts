import type { TranslationStatus } from '../../resource/translation-status';

export type ExportFormat = 'xliff' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  collections?: string[]; // If undefined, all collections
  locales?: string[]; // If undefined, all target locales
  status?: TranslationStatus[]; // Default: ['new', 'stale']
  tags?: string[]; // Default: undefined (no tag filtering)
  outputDirectory: string;
  filenamePattern?: string;
  dryRun?: boolean;
  verbose?: boolean;

  // JSON specific options
  jsonStructure?: 'flat' | 'hierarchical';
  richJson?: boolean;
  includeBase?: boolean;
  includeStatus?: boolean;
  includeComment?: boolean;
  includeTags?: boolean;

  // Callbacks
  onProgress?: (message: string) => void;
}

export interface FilteredResource {
  key: string;
  value: string; // The translation value (or empty string if missing)
  baseValue: string;
  comment?: string;
  status: TranslationStatus;
  tags?: string[];
  collection: string; // Source collection
  locale: string; // Target locale
}

export interface ExportResult {
  format: ExportFormat;
  filesCreated: string[];
  resourcesExported: number;
  warnings: string[];
  errors: string[];
  collections: string[];
  locales: string[];
  outputDirectory: string;
  omittedResources: string[]; // Resources without metadata
  malformedFiles: string[];
  hierarchicalConflicts: string[];
}
