import * as path from 'path';
import * as fs from 'fs';
import prompts from 'prompts';
import {
  LingoTrackerConfig,
  ExportOptions,
  ExportFormat,
  TranslationStatus,
  loadResourcesFromCollections,
  filterResources,
  validateOutputDirectory,
  exportToJson,
  exportToXliff,
  generateExportSummary,
  ExportResult,
} from '@simoncodes-ca/core';
import {
  loadConfiguration,
  parseCommaSeparatedList,
  processMultiselectWithAll,
  multiselectResultToString,
  ConsoleFormatter,
  ErrorMessages,
} from '../utils';

export interface ExportCommandOptions {
  format?: ExportFormat;
  collection?: string;
  locale?: string;
  status?: string;
  tags?: string;
  output?: string;
  structure?: 'flat' | 'hierarchical';
  rich?: boolean;
  includeBase?: boolean;
  includeStatus?: boolean;
  includeComment?: boolean;
  includeTags?: boolean;
  filename?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export async function exportCommand(options: ExportCommandOptions): Promise<void> {
  const loaded = loadConfiguration();
  if (!loaded) return;
  const { config, cwd } = loaded;

  let answers;
  try {
    answers = await promptForMissing(options, config);
  } catch (error) {
    if ((error as Error).message === 'Export cancelled') {
      ConsoleFormatter.error(ErrorMessages.OPERATION_CANCELLED('Export'));
      return;
    }
    throw error;
  }

  if (!answers.format) {
    ConsoleFormatter.error('Format is required. Use --format or run in interactive mode.');
    process.exit(1);
  }

  // Update options with answers
  options.format = answers.format;
  options.collection = answers.collection;
  options.locale = answers.locale;
  options.status = answers.status;
  options.tags = answers.tags;
  options.output = answers.output;
  options.structure = answers.structure;
  options.rich = answers.rich;
  options.includeBase = answers.includeBase;
  options.includeStatus = answers.includeStatus;
  options.includeComment = answers.includeComment;
  options.includeTags = answers.includeTags;
  options.filename = answers.filename;
  options.dryRun = answers.dryRun;
  options.verbose = answers.verbose;

  // Resolve output directory
  const outputDir = options.output
    ? path.resolve(cwd, options.output)
    : path.resolve(cwd, config.exportFolder || 'dist/lingo-export');

  try {
    validateOutputDirectory(outputDir);
  } catch (error) {
    ConsoleFormatter.error((error as Error).message);
    process.exit(1);
  }

  // Resolve collections
  const collectionNames = parseCommaSeparatedList(options.collection);

  const allCollections = Object.entries(config.collections || {}).map(([name, col]) => ({
    name,
    path: col.translationsFolder,
  }));

  const collectionsToProcess = allCollections.filter((c) => !collectionNames || collectionNames.includes(c.name));

  if (collectionsToProcess.length === 0) {
    ConsoleFormatter.warning('No matching collections found.');
    return;
  }

  // Resolve locales
  const localeNames = parseCommaSeparatedList(options.locale);
  const targetLocales = (config.locales || []).filter(
    (l: string) => l !== config.baseLocale && (!localeNames || localeNames.includes(l)),
  );

  if (targetLocales.length === 0) {
    ConsoleFormatter.warning('No target locales selected.');
    return;
  }

  // Resolve status and tags
  const statusFilter = parseCommaSeparatedList(options.status)?.map((s) => s as TranslationStatus);
  const tagFilter = parseCommaSeparatedList(options.tags);

  ConsoleFormatter.progress(`Exporting to ${options.format.toUpperCase()}...`);
  ConsoleFormatter.indent(`Collections: ${collectionsToProcess.map((c) => c.name).join(', ')}`);
  ConsoleFormatter.indent(`Locales: ${targetLocales.join(', ')}`);
  ConsoleFormatter.indent(`Output: ${outputDir}`);
  if (options.dryRun) ConsoleFormatter.indent('[DRY RUN]');

  // Load resources
  const allResources = loadResourcesFromCollections(
    collectionsToProcess.map((c) => ({
      name: c.name,
      path: path.resolve(cwd, c.path),
    })),
  );

  const exportOptions: ExportOptions = {
    format: options.format,
    outputDirectory: outputDir,
    collections: collectionsToProcess.map((c) => c.name),
    locales: targetLocales,
    status: statusFilter,
    tags: tagFilter,
    filenamePattern: options.filename,
    dryRun: options.dryRun,
    verbose: options.verbose,
    jsonStructure: options.structure,
    richJson: options.rich,
    includeBase: options.includeBase,
    includeStatus: options.includeStatus,
    includeComment: options.includeComment,
    includeTags: options.includeTags,
    onProgress: options.verbose ? (msg) => console.log(`   ${msg}`) : undefined,
  };

  const totalFiles = 0;
  let totalResources = 0;
  const allWarnings: string[] = [];
  const allErrors: string[] = [];
  const allFilesCreated: string[] = [];

  for (const locale of targetLocales) {
    const filtered = filterResources(allResources, locale, statusFilter, tagFilter);

    if (filtered.length === 0) {
      if (options.verbose) console.log(`   Skipping ${locale}: No matching resources.`);
      continue;
    }

    try {
      let result: ExportResult;
      if (options.format === 'xliff') {
        result = await exportToXliff(filtered, { ...exportOptions, locales: [locale] }, config.baseLocale);
      } else {
        result = exportToJson(filtered, { ...exportOptions, locales: [locale] }, config.baseLocale);
      }

      totalResources += result.resourcesExported;
      allWarnings.push(...result.warnings);
      allErrors.push(...result.errors);
      allErrors.push(...result.hierarchicalConflicts);
      allFilesCreated.push(...result.filesCreated);

      if (result.filesCreated.length > 0) {
        ConsoleFormatter.indent(
          `✅ ${locale}: Exported ${result.resourcesExported} resources to ${result.filesCreated.join(', ')}`,
        );
      } else if (result.errors.length > 0) {
        ConsoleFormatter.indent(`❌ ${locale}: Failed`);
      }
    } catch (error) {
      ConsoleFormatter.indent(`❌ ${locale}: Export failed - ${(error as Error).message}`);
      allErrors.push(`Export for locale ${locale} failed: ${(error as Error).message}`);
    }
  }

  ConsoleFormatter.section('Export Summary');
  ConsoleFormatter.keyValue('Files Created', totalFiles);
  ConsoleFormatter.keyValue('Resources Exported', totalResources);

  if (allWarnings.length > 0) {
    console.log('');
    ConsoleFormatter.warning(`Warnings (${allWarnings.length}):`);
    allWarnings.forEach((w) => ConsoleFormatter.indent(`- ${w}`));
  }

  if (allErrors.length > 0) {
    console.log('');
    ConsoleFormatter.error(`Errors (${allErrors.length}):`);
    allErrors.forEach((e) => ConsoleFormatter.indent(`- ${e}`));
    if (!options.dryRun) process.exitCode = 1;
  }

  // Generate and write summary
  const summary = generateExportSummary(
    {
      format: options.format,
      filesCreated: allFilesCreated,
      resourcesExported: totalResources,
      warnings: allWarnings,
      errors: allErrors.filter((e) => !e.includes('Conflict')),
      collections: collectionsToProcess.map((c) => c.name),
      locales: targetLocales,
      outputDirectory: outputDir,
      omittedResources: [],
      malformedFiles: [],
      hierarchicalConflicts: allErrors.filter((e) => e.includes('Conflict')),
    },
    exportOptions,
  );

  const summaryPath = path.join(outputDir, 'export-summary.md');
  if (!options.dryRun) {
    fs.writeFileSync(summaryPath, summary);
    console.log(`\n📄 Summary written to: ${summaryPath}`);
  } else {
    console.log('\n📄 Summary (Dry Run):');
    console.log(summary);
  }
}

async function promptForMissing(
  options: ExportCommandOptions,
  config: LingoTrackerConfig,
): Promise<{
  format?: ExportFormat;
  collection?: string;
  locale?: string;
  status?: string;
  tags?: string;
  output?: string;
  structure?: 'flat' | 'hierarchical';
  rich?: boolean;
  includeBase?: boolean;
  includeStatus?: boolean;
  includeComment?: boolean;
  includeTags?: boolean;
  filename?: string;
  dryRun?: boolean;
  verbose?: boolean;
}> {
  const responses: Partial<{
    format: ExportFormat;
    collection: string;
    locale: string;
    status: string;
    tags: string;
    output: string;
    structure: 'flat' | 'hierarchical';
    rich: boolean;
    includeBase: boolean;
    includeStatus: boolean;
    includeComment: boolean;
    includeTags: boolean;
    filename: string;
    dryRun: boolean;
    verbose: boolean;
  }> = {};

  const collectionNames = Object.keys(config.collections || {});
  const targetLocales = (config.locales || []).filter((l: string) => l !== config.baseLocale);

  const questions: prompts.PromptObject[] = [];

  // Format selection (required)
  if (!options.format) {
    questions.push({
      type: 'select',
      name: 'format',
      message: 'Select export format',
      choices: [
        { title: 'XLIFF 1.2 (for translation tools)', value: 'xliff' },
        { title: 'JSON (for runtime bundles)', value: 'json' },
      ],
      initial: 0,
    });
  }

  // Collection selection
  if (!options.collection) {
    questions.push({
      type: 'multiselect',
      name: 'collections',
      message: 'Select collections to export',
      choices: [
        { title: 'All Collections', value: '__ALL__', selected: true },
        ...collectionNames.map((name) => ({ title: name, value: name })),
      ],
      hint: 'Space to select. Return to submit',
      instructions: false,
    });
  }

  // Locale selection
  if (!options.locale) {
    questions.push({
      type: 'multiselect',
      name: 'locales',
      message: 'Select target locales to export',
      choices: [
        { title: 'All Target Locales', value: '__ALL__', selected: true },
        ...targetLocales.map((l: string) => ({ title: l, value: l })),
      ],
      hint: 'Space to select. Return to submit',
      instructions: false,
    });
  }

  // Status filter
  if (!options.status) {
    questions.push({
      type: 'multiselect',
      name: 'statusFilter',
      message: 'Filter by translation status',
      choices: [
        { title: 'New (not yet translated)', value: 'new', selected: true },
        { title: 'Stale (source changed)', value: 'stale', selected: true },
        {
          title: 'Translated (has translation)',
          value: 'translated',
          selected: false,
        },
        { title: 'Verified (reviewed)', value: 'verified', selected: false },
      ],
      hint: 'Space to select. Return to submit',
      instructions: false,
    });
  }

  // Tags filter
  if (!options.tags) {
    questions.push({
      type: 'text',
      name: 'tags',
      message: 'Filter by tags (comma-separated, optional)',
      initial: '',
    });
  }

  // Output directory
  if (!options.output) {
    const defaultOutput = config.exportFolder || 'dist/lingo-export';
    questions.push({
      type: 'text',
      name: 'output',
      message: 'Output directory',
      initial: defaultOutput,
    });
  }

  // Format-specific questions (only shown based on format selection)
  if (!options.format || options.format === 'json') {
    // JSON structure
    if (options.structure === undefined) {
      questions.push({
        type: (_prev: unknown, values: { format?: string; rich?: boolean }) => {
          const selectedFormat = options.format || values.format;
          return selectedFormat === 'json' ? 'select' : null;
        },
        name: 'structure',
        message: 'JSON structure type',
        choices: [
          { title: 'Hierarchical (nested objects)', value: 'hierarchical' },
          { title: 'Flat (dot-delimited keys)', value: 'flat' },
        ],
        initial: 0,
      });
    }

    // Rich JSON
    if (options.rich === undefined) {
      questions.push({
        type: (_prev: unknown, values: { format?: string; rich?: boolean }) => {
          const selectedFormat = options.format || values.format;
          return selectedFormat === 'json' ? 'toggle' : null;
        },
        name: 'rich',
        message: 'Use rich JSON objects (include metadata)?',
        initial: false,
        active: 'Yes',
        inactive: 'No',
      });
    }

    // Include base value
    if (options.includeBase === undefined) {
      questions.push({
        type: (_prev: unknown, values: { format?: string; rich?: boolean }) => {
          const selectedFormat = options.format || values.format;
          const isRich = options.rich !== undefined ? options.rich : values.rich;
          return selectedFormat === 'json' && isRich ? 'toggle' : null;
        },
        name: 'includeBase',
        message: 'Include base locale value in rich objects?',
        initial: false,
        active: 'Yes',
        inactive: 'No',
      });
    }

    // Include status
    if (options.includeStatus === undefined) {
      questions.push({
        type: (_prev: unknown, values: { format?: string; rich?: boolean }) => {
          const selectedFormat = options.format || values.format;
          const isRich = options.rich !== undefined ? options.rich : values.rich;
          return selectedFormat === 'json' && isRich ? 'toggle' : null;
        },
        name: 'includeStatus',
        message: 'Include translation status in rich objects?',
        initial: false,
        active: 'Yes',
        inactive: 'No',
      });
    }

    // Include comment
    if (options.includeComment === undefined) {
      questions.push({
        type: (_prev: unknown, values: { format?: string; rich?: boolean }) => {
          const selectedFormat = options.format || values.format;
          const isRich = options.rich !== undefined ? options.rich : values.rich;
          return selectedFormat === 'json' && isRich ? 'toggle' : null;
        },
        name: 'includeComment',
        message: 'Include comments in rich objects?',
        initial: true,
        active: 'Yes',
        inactive: 'No',
      });
    }

    // Include tags
    if (options.includeTags === undefined) {
      questions.push({
        type: (_prev: unknown, values: { format?: string; rich?: boolean }) => {
          const selectedFormat = options.format || values.format;
          const isRich = options.rich !== undefined ? options.rich : values.rich;
          return selectedFormat === 'json' && isRich ? 'toggle' : null;
        },
        name: 'includeTags',
        message: 'Include tags array in rich objects?',
        initial: false,
        active: 'Yes',
        inactive: 'No',
      });
    }
  }

  // Custom filename pattern
  if (!options.filename) {
    questions.push({
      type: 'text',
      name: 'filename',
      message: 'Custom filename pattern (optional, e.g., "translations-{locale}.{ext}")',
      initial: '',
    });
  }

  // Dry run
  if (options.dryRun === undefined) {
    questions.push({
      type: 'toggle',
      name: 'dryRun',
      message: 'Dry run (preview without writing files)?',
      initial: false,
      active: 'Yes',
      inactive: 'No',
    });
  }

  // Verbose
  if (options.verbose === undefined) {
    questions.push({
      type: 'toggle',
      name: 'verbose',
      message: 'Verbose output (show detailed progress)?',
      initial: false,
      active: 'Yes',
      inactive: 'No',
    });
  }

  if (questions.length > 0 && process.stdout.isTTY) {
    const result = await prompts(questions, {
      onCancel: () => {
        throw new Error('Export cancelled');
      },
    });

    Object.assign(responses, result);

    // Handle multiselect "All" options
    if (result.collections) {
      const selected = processMultiselectWithAll(result.collections, collectionNames);
      responses.collection = multiselectResultToString(selected);
    }

    if (result.locales) {
      const selected = processMultiselectWithAll(result.locales, targetLocales);
      responses.locale = multiselectResultToString(selected);
    }

    if (result.statusFilter) {
      responses.status = result.statusFilter.join(',');
    }
  } else if (questions.length > 0 && !process.stdout.isTTY) {
    // Non-TTY mode - require format to be provided
    if (!options.format) {
      throw new Error(ErrorMessages.MISSING_OPTION('format'));
    }
  }

  return {
    format: options.format ?? responses.format,
    collection: options.collection ?? responses.collection,
    locale: options.locale ?? responses.locale,
    status: options.status ?? responses.status,
    tags: options.tags ?? (responses.tags || undefined),
    output: options.output ?? (responses.output || undefined),
    structure: options.structure ?? responses.structure ?? 'hierarchical',
    rich: options.rich ?? responses.rich ?? false,
    includeBase: options.includeBase ?? responses.includeBase ?? false,
    includeStatus: options.includeStatus ?? responses.includeStatus ?? false,
    includeComment: options.includeComment ?? responses.includeComment ?? true,
    includeTags: options.includeTags ?? responses.includeTags ?? false,
    filename: options.filename ?? (responses.filename || undefined),
    dryRun: options.dryRun ?? responses.dryRun ?? false,
    verbose: options.verbose ?? responses.verbose ?? false,
  };
}
