import prompts from 'prompts';
import { moveResource } from '@simoncodes-ca/core';
import {
  loadConfiguration,
  promptForCollection,
  resolveCollection,
  executePromptsWithFallback,
  type ResolvedCollection,
} from '../utils';

export interface MoveResourceOptions {
  collection?: string;
  source?: string;
  dest?: string;
  destCollection?: string;
  override?: boolean;
  verbose?: boolean;
}

export async function moveResourceCommand(
  options: MoveResourceOptions,
): Promise<void> {
  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  // Prompt for source collection first
  const sourceCollectionName = await promptForCollection(
    config,
    options.collection,
  );
  if (!sourceCollectionName) return;

  // Validate source collection exists
  const sourceCollection = resolveCollection(sourceCollectionName, config, cwd);
  if (!sourceCollection) return;

  // Prompt for other fields
  const answers = await promptForMissing(options);

  // Handle optional destination collection
  let destCollection: ResolvedCollection | undefined;
  if (answers.destCollection) {
    destCollection = resolveCollection(answers.destCollection, config, cwd);
    if (!destCollection) return;
  }

  try {
    const result = moveResource(sourceCollection.translationsFolderPath, {
      source: answers.source,
      destination: answers.dest,
      override: options.override,
      destinationTranslationsFolder: destCollection?.translationsFolderPath,
    });

    if (result.movedCount > 0) {
      console.log(`✅ Moved ${result.movedCount} resource(s)`);
    } else {
      console.log('⚠️  No resources were moved.');
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of result.warnings) {
        console.log(`   - ${warning}`);
      }
    }

    if (result.errors && result.errors.length > 0) {
      console.log('\n❌ Errors:');
      for (const error of result.errors) {
        console.log(`   - ${error}`);
      }
    }
  } catch (e: unknown) {
    console.log(
      `❌ ${e instanceof Error ? e.message : 'Failed to move resource'}`,
    );
  }
}

async function promptForMissing(options: MoveResourceOptions): Promise<{
  source: string;
  dest: string;
  destCollection?: string;
}> {
  const questions: prompts.PromptObject[] = [];

  if (!options.source) {
    questions.push({
      type: 'text',
      name: 'source',
      message:
        'Source key or pattern (e.g. common.buttons.ok or common.buttons.*)',
      validate: (val: string) =>
        val && val.trim().length > 0 ? true : 'Required',
    });
  }

  if (!options.dest) {
    questions.push({
      type: 'text',
      name: 'dest',
      message: 'Destination key (e.g. common.actions.ok)',
      validate: (val: string) =>
        val && val.trim().length > 0 ? true : 'Required',
    });
  }

  const result = await executePromptsWithFallback({
    questions,
    currentValues: options,
    requiredFields: ['source', 'dest'],
    operationName: 'Move resource',
  });

  return {
    source: result.source as string,
    dest: result.dest as string,
    destCollection: result.destCollection as string | undefined,
  };
}
