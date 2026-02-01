import * as path from 'path';
import * as fs from 'fs';
import prompts from 'prompts';
import {
  LingoTrackerConfig,
  ImportOptions,
  ImportFormat,
  ImportStrategy,
  importFromJson,
  importFromXliff,
  detectImportFormat,
  ImportResult,
  generateImportSummary,
} from '@simoncodes-ca/core';
import {
  loadConfiguration,
  ConsoleFormatter,
  ErrorMessages,
  isInteractiveTerminal,
} from '../utils';

export const LARGE_FILE_SIZE_THRESHOLD = 5;

export interface ImportCommandOptions {
  format?: ImportFormat;
  source?: string;
  locale?: string;
  collection?: string;
  strategy?: ImportStrategy;
  updateComments?: boolean;
  updateTags?: boolean;
  preserveStatus?: boolean;
  createMissing?: boolean;
  validateBase?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export async function importCommand(
  options: ImportCommandOptions,
): Promise<void> {
  const loaded = loadConfiguration();
  if (!loaded) return;
  const { config, cwd } = loaded;

  const isTTY = isInteractiveTerminal();

  let answers;
  try {
    answers = await promptForMissing(options, config, isTTY);
  } catch (error) {
    if ((error as Error).message === 'Import cancelled') {
      ConsoleFormatter.error(ErrorMessages.OPERATION_CANCELLED('Import'));
      return;
    }
    throw error;
  }

  // Validate required options
  if (!answers.source) {
    ConsoleFormatter.error(
      'Source file is required. Use --source or run in interactive mode.',
    );
    process.exit(1);
  }

  if (!answers.locale) {
    ConsoleFormatter.error(
      'Target locale is required. Use --locale or run in interactive mode.',
    );
    process.exit(1);
  }

  // Check file size and warn if large
  try {
    const sourceFilePath = path.resolve(process.cwd(), answers.source);
    if (fs.existsSync(sourceFilePath)) {
      const stats = fs.statSync(sourceFilePath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB > LARGE_FILE_SIZE_THRESHOLD) {
        ConsoleFormatter.warning(
          `Large import file detected: ${fileSizeMB.toFixed(2)} MB`,
        );
        ConsoleFormatter.indent('Import may take longer than usual.');
      }
    }
  } catch (_error) {
    // File size check is non-critical, continue with import
  }

  // Update options with answers
  const finalOptions: ImportOptions = {
    source: answers.source,
    locale: answers.locale,
    collection: answers.collection,
    format: answers.format,
    strategy: answers.strategy || 'translation-service',
    updateComments: answers.updateComments,
    updateTags: answers.updateTags,
    preserveStatus: answers.preserveStatus,
    createMissing: answers.createMissing,
    validateBase: answers.validateBase !== false, // Default true
    dryRun: answers.dryRun || false,
    verbose: answers.verbose || false,
    onProgress: answers.verbose
      ? (msg: string) => console.log(`  ${msg}`)
      : undefined,
  };

  // Auto-detect format if not specified
  if (!finalOptions.format) {
    try {
      finalOptions.format = detectImportFormat(finalOptions.source);
      if (finalOptions.verbose) {
        console.log(`📋 Detected format: ${finalOptions.format}`);
      }
    } catch (error) {
      ConsoleFormatter.error((error as Error).message);
      process.exit(1);
    }
  }

  // Resolve translations folder
  const collectionConfig =
    finalOptions.collection && config.collections
      ? config.collections[finalOptions.collection]
      : undefined;

  // Collections have translationsFolder as required property
  // If no collection is specified, use default 'src/translations'
  const translationsFolder =
    collectionConfig?.translationsFolder || 'src/translations';

  const translationsFolderPath = path.resolve(cwd, translationsFolder);

  // Display import summary
  console.log('');
  ConsoleFormatter.progress('Starting import...');
  ConsoleFormatter.indent(`Format: ${finalOptions.format}`);
  ConsoleFormatter.indent(`Source: ${finalOptions.source}`);
  ConsoleFormatter.indent(`Locale: ${finalOptions.locale}`);
  ConsoleFormatter.indent(`Strategy: ${finalOptions.strategy}`);
  if (finalOptions.collection) {
    ConsoleFormatter.indent(`Collection: ${finalOptions.collection}`);
  }
  if (finalOptions.dryRun) {
    ConsoleFormatter.indent('Mode: DRY RUN (no changes will be made)');
  }
  console.log('');

  // Performance logging for verbose mode
  const startTime = Date.now();
  if (finalOptions.verbose) {
    console.log(`⏱️  Started at: ${new Date(startTime).toLocaleTimeString()}`);
  }

  let result: ImportResult;
  try {
    if (finalOptions.format === 'json') {
      result = importFromJson(translationsFolderPath, finalOptions);
    } else {
      result = await importFromXliff(translationsFolderPath, finalOptions);
    }
  } catch (error) {
    console.log('');
    ConsoleFormatter.error(`Import failed: ${(error as Error).message}`);
    process.exit(1);
  }

  // Log elapsed time in verbose mode
  const endTime = Date.now();
  const elapsedMs = endTime - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);

  if (finalOptions.verbose) {
    console.log(`\n⏱️  Completed at: ${new Date(endTime).toLocaleTimeString()}`);
    console.log(`⏱️  Elapsed time: ${elapsedSec}s (${elapsedMs}ms)`);
  }

  // Display results
  displayResults(result, finalOptions);

  // Generate and write summary
  if (!finalOptions.dryRun) {
    try {
      const summary = generateImportSummary(result, finalOptions);
      const summaryPath = path.join(
        translationsFolderPath,
        'import-summary.md',
      );
      fs.writeFileSync(summaryPath, summary, 'utf8');
      console.log('');
      console.log(`📄 Import summary written to: ${summaryPath}`);
    } catch (error) {
      ConsoleFormatter.warning(
        `Failed to write summary file: ${(error as Error).message}`,
      );
    }
  } else {
    // For dry-run, still generate summary but don't write to file
    const _summary = generateImportSummary(result, finalOptions);
    const summaryPath = path.join(translationsFolderPath, 'import-summary.md');
    console.log('');
    console.log(`📄 Import summary would be written to: ${summaryPath}`);
  }

  // Exit with appropriate code
  if (result.resourcesFailed > 0 || result.errors.length > 0) {
    process.exit(1);
  }
}

async function promptForMissing(
  options: ImportCommandOptions,
  config: LingoTrackerConfig,
  isTTY: boolean,
): Promise<ImportCommandOptions> {
  const answers = { ...options };

  // If not in TTY mode, return options as-is (non-interactive mode)
  if (!isTTY) {
    return answers;
  }

  // Prompt for source file
  if (!answers.source) {
    const sourceAnswer = await prompts({
      type: 'text',
      name: 'source',
      message: 'Enter path to import file:',
      validate: (value: string) => {
        if (!value || value.trim() === '') {
          return 'Source file is required';
        }
        const resolvedPath = path.resolve(process.cwd(), value);
        if (!fs.existsSync(resolvedPath)) {
          return `File not found: ${value}`;
        }
        return true;
      },
    });

    if (!sourceAnswer.source) {
      throw new Error('Import cancelled');
    }

    answers.source = sourceAnswer.source;
  }

  // Auto-detect format from source file extension
  if (!answers.format && answers.source) {
    try {
      answers.format = detectImportFormat(answers.source);
    } catch {
      // Will prompt if detection fails
    }
  }

  // Prompt for format if still not determined
  if (!answers.format) {
    const formatAnswer = await prompts({
      type: 'select',
      name: 'format',
      message: 'Select import format:',
      choices: [
        {
          title: 'JSON',
          value: 'json',
          description: 'JSON format (flat or hierarchical)',
        },
        {
          title: 'XLIFF 1.2',
          value: 'xliff',
          description: 'XLIFF format for professional translation services',
        },
      ],
    });

    if (!formatAnswer.format) {
      throw new Error('Import cancelled');
    }

    answers.format = formatAnswer.format;
  }

  // Get configured locales
  const configuredLocales = config.locales || [];
  const baseLocale = config.baseLocale || 'en';

  // For migration strategy, include base locale in the available choices
  const strategy = answers.strategy || 'translation-service';
  const allowBaseLocale = strategy === 'migration';
  const targetLocales = allowBaseLocale
    ? configuredLocales
    : configuredLocales.filter((loc) => loc !== baseLocale);

  // Prompt for target locale
  if (!answers.locale) {
    const localeAnswer = await prompts({
      type: targetLocales.length > 0 ? 'select' : 'text',
      name: 'locale',
      message: 'Select target locale for import:',
      choices:
        targetLocales.length > 0
          ? targetLocales.map((loc) => ({
              title: loc === baseLocale ? `${loc} (base locale)` : loc,
              value: loc,
            }))
          : undefined,
      validate:
        targetLocales.length === 0
          ? (value: string) => {
              if (!value || value.trim() === '') {
                return 'Locale is required';
              }
              if (value === baseLocale && !allowBaseLocale) {
                return `Cannot import into base locale "${baseLocale}" with strategy "${strategy}"`;
              }
              return true;
            }
          : undefined,
    });

    if (!localeAnswer.locale) {
      throw new Error('Import cancelled');
    }

    answers.locale = localeAnswer.locale;
  }

  // Prompt for collection if multiple exist
  const collections = Object.keys(config.collections || {});
  if (!answers.collection && collections.length > 1) {
    const collectionAnswer = await prompts({
      type: 'select',
      name: 'collection',
      message: 'Select collection:',
      choices: [
        { title: '(Default collection)', value: undefined },
        ...collections.map((name) => ({ title: name, value: name })),
      ],
    });

    if (
      collectionAnswer.collection === undefined &&
      !('collection' in collectionAnswer)
    ) {
      throw new Error('Import cancelled');
    }

    answers.collection = collectionAnswer.collection;
  }

  // Prompt for import strategy
  if (!answers.strategy) {
    const strategyAnswer = await prompts({
      type: 'select',
      name: 'strategy',
      message: 'Select import strategy:',
      choices: [
        {
          title: 'Translation Service',
          value: 'translation-service',
          description:
            'Import from professional translation services (default)',
        },
        {
          title: 'Verification',
          value: 'verification',
          description: 'Language expert verification workflow',
        },
        {
          title: 'Migration',
          value: 'migration',
          description: 'Migrate from another translation system',
        },
        {
          title: 'Update',
          value: 'update',
          description: 'Bulk update existing translations',
        },
      ],
    });

    if (!strategyAnswer.strategy) {
      throw new Error('Import cancelled');
    }

    answers.strategy = strategyAnswer.strategy;
  }

  // For migration strategy, ask about flags if not already set
  if (strategy === 'migration') {
    if (answers.updateComments === undefined) {
      const updateCommentsAnswer = await prompts({
        type: 'confirm',
        name: 'updateComments',
        message: 'Update comments from import data?',
        initial: true,
      });

      if (!('updateComments' in updateCommentsAnswer)) {
        throw new Error('Import cancelled');
      }

      answers.updateComments = updateCommentsAnswer.updateComments;
    }

    if (answers.updateTags === undefined) {
      const updateTagsAnswer = await prompts({
        type: 'confirm',
        name: 'updateTags',
        message: 'Update tags from import data?',
        initial: true,
      });

      if (!('updateTags' in updateTagsAnswer)) {
        throw new Error('Import cancelled');
      }

      answers.updateTags = updateTagsAnswer.updateTags;
    }

    if (answers.createMissing === undefined) {
      const createMissingAnswer = await prompts({
        type: 'confirm',
        name: 'createMissing',
        message: 'Create missing resources?',
        initial: true,
      });

      if (!('createMissing' in createMissingAnswer)) {
        throw new Error('Import cancelled');
      }

      answers.createMissing = createMissingAnswer.createMissing;
    }
  }

  return answers;
}

function displayResults(result: ImportResult, options: ImportOptions): void {
  ConsoleFormatter.section('Import Results');

  if (options.dryRun) {
    ConsoleFormatter.indent('Mode: DRY RUN (no changes were made)');
  }

  ConsoleFormatter.keyValue('Resources Imported', result.resourcesImported);
  ConsoleFormatter.keyValue('Resources Created', result.resourcesCreated);
  ConsoleFormatter.keyValue('Resources Updated', result.resourcesUpdated);

  if (result.resourcesSkipped > 0) {
    ConsoleFormatter.keyValue('Resources Skipped', result.resourcesSkipped);
  }

  if (result.resourcesFailed > 0) {
    ConsoleFormatter.keyValue('Resources Failed', result.resourcesFailed);
  }

  // Display status transitions
  if (result.statusTransitions && result.statusTransitions.length > 0) {
    console.log('');
    ConsoleFormatter.indent('Status Transitions:');
    for (const transition of result.statusTransitions) {
      const from = transition.from || 'none';
      const to = transition.to;
      ConsoleFormatter.indent(`${from} → ${to}: ${transition.count}`, 2);
    }
  }

  // Display files modified
  if (!options.dryRun && result.filesModified.length > 0) {
    console.log('');
    ConsoleFormatter.keyValue('Files Modified', result.filesModified.length);
    if (options.verbose) {
      result.filesModified.forEach((file) => {
        ConsoleFormatter.indent(file, 2);
      });
    }
  }

  // Display warnings
  if (result.warnings.length > 0) {
    console.log('');
    ConsoleFormatter.warning(`Warnings (${result.warnings.length}):`);
    result.warnings.slice(0, 10).forEach((warning) => {
      ConsoleFormatter.indent(warning);
    });
    if (result.warnings.length > 10) {
      ConsoleFormatter.indent(
        `... and ${result.warnings.length - 10} more warnings`,
      );
    }
  }

  // Display errors
  if (result.errors.length > 0) {
    console.log('');
    ConsoleFormatter.error(`Errors (${result.errors.length}):`);
    result.errors.slice(0, 10).forEach((error) => {
      ConsoleFormatter.indent(error);
    });
    if (result.errors.length > 10) {
      ConsoleFormatter.indent(
        `... and ${result.errors.length - 10} more errors`,
      );
    }
  }

  console.log('─'.repeat(50));

  // Summary message
  console.log('');
  if (options.dryRun) {
    ConsoleFormatter.success('Dry run complete. No changes were made.');
  } else if (result.resourcesFailed > 0 || result.errors.length > 0) {
    ConsoleFormatter.warning('Import completed with errors.');
  } else if (result.warnings.length > 0) {
    ConsoleFormatter.success('Import completed with warnings.');
  } else {
    ConsoleFormatter.success('Import completed successfully!');
  }
}
