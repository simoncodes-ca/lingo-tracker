import prompts from 'prompts';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { normalize } from '@simoncodes-ca/core';
import {
  loadConfiguration,
  resolveCollection,
  ConsoleFormatter,
  ErrorMessages,
  aggregateNumericFields,
} from '../utils';

export interface NormalizeOptions {
  collection?: string;
  all?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

interface CollectionNormalizeResult {
  collectionName: string;
  entriesProcessed: number;
  localesAdded: number;
  filesCreated: number;
  filesUpdated: number;
  foldersRemoved: number;
}

interface NormalizeCommandResult {
  collections: CollectionNormalizeResult[];
  totals: {
    collectionsProcessed: number;
    entriesProcessed: number;
    localesAdded: number;
    filesCreated: number;
    filesUpdated: number;
    foldersRemoved: number;
  };
}

export async function normalizeCommand(options: NormalizeOptions): Promise<void> {
  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  const answers = await promptForMissing(options, config);

  // Determine which collections to process
  const collectionsToProcess: string[] = [];

  if (answers.all) {
    const collections = Object.keys(config.collections || {});
    if (collections.length === 0) {
      ConsoleFormatter.error(ErrorMessages.NO_COLLECTIONS);
      return;
    }
    collectionsToProcess.push(...collections);
  } else if (answers.collection) {
    collectionsToProcess.push(answers.collection);
  }

  // Process each collection
  const collectionResults: CollectionNormalizeResult[] = [];

  for (const collectionName of collectionsToProcess) {
    const collection = resolveCollection(collectionName, config, cwd);

    if (!collection) {
      continue;
    }

    const translationsFolder = collection.translationsFolderPath;
    const baseLocale = collection.config.baseLocale ?? config.baseLocale;
    const locales = collection.config.locales ?? config.locales;

    if (!options.json) {
      console.log('');
      ConsoleFormatter.progress(`Normalizing collection: ${collectionName}`);
      if (options.dryRun) {
        ConsoleFormatter.indent('(Dry run - no changes will be made)');
      }
    }

    try {
      const result = await normalize({
        translationsFolder,
        baseLocale,
        locales,
        dryRun: options.dryRun ?? false,
      });

      collectionResults.push({
        collectionName,
        entriesProcessed: result.entriesProcessed,
        localesAdded: result.localesAdded,
        filesCreated: result.filesCreated,
        filesUpdated: result.filesUpdated,
        foldersRemoved: result.foldersRemoved,
      });

      if (!options.json) {
        ConsoleFormatter.indent(`✅ Entries processed: ${result.entriesProcessed}`);
        ConsoleFormatter.indent(`✅ Locales added: ${result.localesAdded}`);
        ConsoleFormatter.indent(`✅ Files created: ${result.filesCreated}`);
        ConsoleFormatter.indent(`✅ Files updated: ${result.filesUpdated}`);
        ConsoleFormatter.indent(`✅ Folders removed: ${result.foldersRemoved}`);
      }
    } catch (e: unknown) {
      if (!options.json) {
        ConsoleFormatter.indent(`❌ ${e instanceof Error ? e.message : 'Failed to normalize collection'}`);
      }
    }
  }

  // Output results
  if (options.json) {
    const totals = {
      ...aggregateNumericFields(collectionResults, [
        'entriesProcessed',
        'localesAdded',
        'filesCreated',
        'filesUpdated',
        'foldersRemoved',
      ]),
      collectionsProcessed: collectionResults.length,
    };

    const output: NormalizeCommandResult = {
      collections: collectionResults,
      totals,
    };

    console.log(JSON.stringify(output, null, 2));
  } else if (collectionsToProcess.length > 1) {
    // Show summary for multiple collections
    const totals = {
      ...aggregateNumericFields(collectionResults, [
        'entriesProcessed',
        'localesAdded',
        'filesCreated',
        'filesUpdated',
        'foldersRemoved',
      ]),
      collectionsProcessed: collectionResults.length,
    };

    ConsoleFormatter.section(`Summary (${totals.collectionsProcessed} collections)`);
    ConsoleFormatter.keyValue('Total entries processed', totals.entriesProcessed);
    ConsoleFormatter.keyValue('Total locales added', totals.localesAdded);
    ConsoleFormatter.keyValue('Total files created', totals.filesCreated);
    ConsoleFormatter.keyValue('Total files updated', totals.filesUpdated);
    ConsoleFormatter.keyValue('Total folders removed', totals.foldersRemoved);

    if (options.dryRun) {
      console.log('');
      ConsoleFormatter.warning('Dry run completed - no changes were made.');
    }
  } else if (options.dryRun) {
    console.log('');
    ConsoleFormatter.warning('Dry run completed - no changes were made.');
  }
}

async function promptForMissing(
  options: NormalizeOptions,
  config: LingoTrackerConfig,
): Promise<{
  collection?: string;
  all: boolean;
}> {
  const responses: Partial<{
    collection: string;
    all: boolean;
  }> = {};

  const collections = Object.keys(config.collections || {});

  const questions: prompts.PromptObject[] = [];

  // If neither collection nor all flag provided, prompt for selection
  if (!options.collection && !options.all) {
    if (collections.length === 0) {
      ConsoleFormatter.error(ErrorMessages.NO_COLLECTIONS);
      throw new Error('No collections available');
    }

    // Create choices array with individual collections and "All collections" option
    const choices = [
      ...collections.map((c) => ({ title: c, value: c })),
      { title: 'All collections', value: '__ALL__' },
    ];

    questions.push({
      type: 'select',
      name: 'collectionOrAll',
      message: 'Select collection to normalize',
      choices,
    });
  }

  if (questions.length > 0 && process.stdout.isTTY) {
    const result = await prompts(questions, {
      onCancel: () => {
        throw new Error('Normalize cancelled');
      },
    });

    if (result.collectionOrAll === '__ALL__') {
      responses.all = true;

      // Show confirmation for --all mode
      console.log('');
      ConsoleFormatter.warning('This will normalize ALL collections in your project.');
      const confirmed = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: 'Are you sure?',
        initial: false,
      });

      if (!confirmed.confirmed) {
        ConsoleFormatter.error(ErrorMessages.OPERATION_CANCELLED('Normalize'));
        process.exit(0);
      }
    } else {
      responses.collection = result.collectionOrAll as string;
    }
  } else if (questions.length > 0) {
    // Non-TTY mode - require explicit flags
    if (!options.collection && !options.all) {
      throw new Error(ErrorMessages.MISSING_OPTIONS(['collection', 'all']));
    }
  }

  // Handle --all flag with confirmation
  if (options.all && process.stdout.isTTY && !responses.all) {
    console.log('');
    ConsoleFormatter.warning('This will normalize ALL collections in your project.');
    const confirmed = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: 'Are you sure?',
      initial: false,
    });

    if (!confirmed.confirmed) {
      ConsoleFormatter.error(ErrorMessages.OPERATION_CANCELLED('Normalize'));
      process.exit(0);
    }
  }

  return {
    collection: options.collection ?? responses.collection,
    all: options.all ?? responses.all ?? false,
  };
}
