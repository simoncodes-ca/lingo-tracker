import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prompts from 'prompts';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';

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
  const cwd = process.env.INIT_CWD || process.cwd();
  const { CONFIG_FILENAME, normalize } = await import('@simoncodes-ca/core');
  const configPath = resolve(cwd, CONFIG_FILENAME);

  let config: LingoTrackerConfig;
  try {
    const configContent = readFileSync(configPath, 'utf8');
    config = JSON.parse(configContent) as LingoTrackerConfig;
  } catch {
    console.log('❌ No Lingo Tracker configuration found. Run `lingo-tracker init` first.');
    return;
  }

  const answers = await promptForMissing(options, config);

  // Determine which collections to process
  const collectionsToProcess: string[] = [];

  if (answers.all) {
    const collections = Object.keys(config.collections || {});
    if (collections.length === 0) {
      console.log('❌ No collections found.');
      return;
    }
    collectionsToProcess.push(...collections);
  } else if (answers.collection) {
    collectionsToProcess.push(answers.collection);
  }

  // Process each collection
  const collectionResults: CollectionNormalizeResult[] = [];

  for (const collectionName of collectionsToProcess) {
    const collectionConfig = config.collections?.[collectionName];

    if (!collectionConfig) {
      console.log(`❌ Collection "${collectionName}" not found.`);
      continue;
    }

    const translationsFolder = resolve(cwd, collectionConfig.translationsFolder);
    const baseLocale = collectionConfig.baseLocale ?? config.baseLocale;
    const locales = collectionConfig.locales ?? config.locales;

    if (!options.json) {
      console.log(`\n🔄 Normalizing collection: ${collectionName}`);
      if (options.dryRun) {
        console.log('   (Dry run - no changes will be made)');
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
        console.log(`   ✅ Entries processed: ${result.entriesProcessed}`);
        console.log(`   ✅ Locales added: ${result.localesAdded}`);
        console.log(`   ✅ Files created: ${result.filesCreated}`);
        console.log(`   ✅ Files updated: ${result.filesUpdated}`);
        console.log(`   ✅ Folders removed: ${result.foldersRemoved}`);
      }
    } catch (e: unknown) {
      if (!options.json) {
        console.log(`   ❌ ${e instanceof Error ? e.message : 'Failed to normalize collection'}`);
      }
    }
  }

  // Output results
  if (options.json) {
    const totals = collectionResults.reduce(
      (acc, result) => ({
        collectionsProcessed: acc.collectionsProcessed + 1,
        entriesProcessed: acc.entriesProcessed + result.entriesProcessed,
        localesAdded: acc.localesAdded + result.localesAdded,
        filesCreated: acc.filesCreated + result.filesCreated,
        filesUpdated: acc.filesUpdated + result.filesUpdated,
        foldersRemoved: acc.foldersRemoved + result.foldersRemoved,
      }),
      {
        collectionsProcessed: 0,
        entriesProcessed: 0,
        localesAdded: 0,
        filesCreated: 0,
        filesUpdated: 0,
        foldersRemoved: 0,
      }
    );

    const output: NormalizeCommandResult = {
      collections: collectionResults,
      totals,
    };

    console.log(JSON.stringify(output, null, 2));
  } else if (collectionsToProcess.length > 1) {
    // Show summary for multiple collections
    const totals = collectionResults.reduce(
      (acc, result) => ({
        collectionsProcessed: acc.collectionsProcessed + 1,
        entriesProcessed: acc.entriesProcessed + result.entriesProcessed,
        localesAdded: acc.localesAdded + result.localesAdded,
        filesCreated: acc.filesCreated + result.filesCreated,
        filesUpdated: acc.filesUpdated + result.filesUpdated,
        foldersRemoved: acc.foldersRemoved + result.foldersRemoved,
      }),
      {
        collectionsProcessed: 0,
        entriesProcessed: 0,
        localesAdded: 0,
        filesCreated: 0,
        filesUpdated: 0,
        foldersRemoved: 0,
      }
    );

    console.log(`\n📊 Summary (${totals.collectionsProcessed} collections):`);
    console.log(`   Total entries processed: ${totals.entriesProcessed}`);
    console.log(`   Total locales added: ${totals.localesAdded}`);
    console.log(`   Total files created: ${totals.filesCreated}`);
    console.log(`   Total files updated: ${totals.filesUpdated}`);
    console.log(`   Total folders removed: ${totals.foldersRemoved}`);

    if (options.dryRun) {
      console.log('\n⚠️  Dry run completed - no changes were made.');
    }
  } else if (options.dryRun) {
    console.log('\n⚠️  Dry run completed - no changes were made.');
  }
}

async function promptForMissing(
  options: NormalizeOptions,
  config: LingoTrackerConfig
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
      console.log('❌ No collections found. Run `lingo-tracker add-collection` first.');
      throw new Error('No collections available');
    }

    // Create choices array with individual collections and "All collections" option
    const choices = [
      ...collections.map(c => ({ title: c, value: c })),
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
      console.log('\n⚠️  This will normalize ALL collections in your project.');
      const confirmed = await prompts({
        type: 'confirm',
        name: 'confirmed',
        message: 'Are you sure?',
        initial: false,
      });

      if (!confirmed.confirmed) {
        console.log('❌ Normalize cancelled.');
        process.exit(0);
      }
    } else {
      responses.collection = result.collectionOrAll as string;
    }
  } else if (questions.length > 0) {
    // Non-TTY mode - require explicit flags
    if (!options.collection && !options.all) {
      throw new Error('Missing required option: --collection or --all');
    }
  }

  // Handle --all flag with confirmation
  if (options.all && process.stdout.isTTY && !responses.all) {
    console.log('\n⚠️  This will normalize ALL collections in your project.');
    const confirmed = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: 'Are you sure?',
      initial: false,
    });

    if (!confirmed.confirmed) {
      console.log('❌ Normalize cancelled.');
      process.exit(0);
    }
  }

  return {
    collection: options.collection ?? responses.collection,
    all: options.all ?? responses.all ?? false,
  };
}
