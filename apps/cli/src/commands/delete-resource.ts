import prompts from 'prompts';
import { deleteResource } from '@simoncodes-ca/core';
import {
  loadConfiguration,
  parseCommaSeparatedList,
  promptForCollection,
  resolveCollection,
} from '../utils';

export interface DeleteResourceOptions {
  collection?: string;
  key?: string;
  yes?: boolean;
}

export async function deleteResourceCommand(options: DeleteResourceOptions): Promise<void> {
  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  // Prompt for collection first
  const collectionName = await promptForCollection(config, options.collection);
  if (!collectionName) return;

  // Validate collection exists
  const collection = resolveCollection(collectionName, config, cwd);
  if (!collection) return;

  // Prompt for other fields
  const answers = await promptForMissing(options);

  // Parse keys
  const keys = parseCommaSeparatedList(answers.key) || [];

  if (keys.length === 0) {
    console.log('❌ No valid keys provided.');
    return;
  }

  // Show confirmation unless --yes flag or non-TTY mode
  if (!options.yes && process.stdout.isTTY) {
    const confirmed = await confirmDeletion(keys);
    if (!confirmed) {
      console.log('❌ Delete resource cancelled.');
      return;
    }
  }

  try {
    const result = deleteResource(
      collection.translationsFolderPath,
      { keys }
    );

    if (result.entriesDeleted === 0) {
      console.log('⚠️  No resources were deleted.');
    } else {
      console.log(`✅ Deleted ${result.entriesDeleted} resource(s)`);
    }

    if (result.errors && result.errors.length > 0) {
      console.log('\n⚠️  Some operations failed:');
      for (const error of result.errors) {
        console.log(`   - ${error.key}: ${error.error}`);
      }
    }
  } catch (e: unknown) {
    console.log(`❌ ${e instanceof Error ? e.message : 'Failed to delete resource'}`);
  }
}

async function promptForMissing(
  options: DeleteResourceOptions
): Promise<{ key: string }> {
  const responses: Partial<{ key: string }> = {};
  const questions: prompts.PromptObject[] = [];

  if (!options.key) {
    questions.push({
      type: 'text',
      name: 'key',
      message: 'Resource key(s) (single key or comma-separated)',
      validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
    });
  }

  if (questions.length > 0 && process.stdout.isTTY) {
    const result = await prompts(questions, {
      onCancel: () => {
        throw new Error('Delete resource cancelled');
      },
    });
    Object.assign(responses, result);
  } else if (questions.length > 0) {
    if (!options.key) throw new Error('Missing required option: key');
  }

  return {
    key: options.key ?? (responses.key as string),
  };
}

async function confirmDeletion(keys: string[]): Promise<boolean> {
  console.log('\nYou are about to delete:');

  if (keys.length === 1) {
    console.log(`  ${keys[0]}`);
  } else {
    console.log(`  ${keys.length} resources:`);
    for (const key of keys) {
      console.log(`  - ${key}`);
    }
  }

  console.log('\n⚠️  This will remove translations for all locales.');

  const response = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: 'Are you sure?',
    initial: false,
  });

  return response.confirmed === true;
}
