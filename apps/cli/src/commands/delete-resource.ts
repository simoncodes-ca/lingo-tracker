import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prompts from 'prompts';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { CONFIG_FILENAME, deleteResource } from '@simoncodes-ca/core';

export interface DeleteResourceOptions {
  collection?: string;
  key?: string;
  yes?: boolean;
}

export async function deleteResourceCommand(options: DeleteResourceOptions): Promise<void> {
  const cwd = process.env.INIT_CWD || process.cwd();
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
  const collectionConfig = config.collections?.[answers.collection];

  if (!collectionConfig) {
    console.log(`❌ Collection "${answers.collection}" not found.`);
    return;
  }

  // Parse keys from comma-separated string
  const keys = answers.key
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

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
      resolve(cwd, collectionConfig.translationsFolder),
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
  options: DeleteResourceOptions,
  config: LingoTrackerConfig
): Promise<{
  collection: string;
  key: string;
}> {
  const responses: Partial<{
    collection: string;
    key: string;
  }> = {};

  const collections = Object.keys(config.collections || {});

  const questions: prompts.PromptObject[] = [];

  if (!options.collection) {
    if (collections.length === 1) {
      responses.collection = collections[0];
    } else if (collections.length > 1) {
      questions.push({
        type: 'select',
        name: 'collection',
        message: 'Select collection',
        choices: collections.map(c => ({ title: c, value: c })),
      });
    } else {
      console.log('❌ No collections found. Run `lingo-tracker add-collection` first.');
      throw new Error('No collections available');
    }
  }

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
    if (!options.collection) throw new Error('Missing required option: collection');
    if (!options.key) throw new Error('Missing required option: key');
  }

  return {
    collection: options.collection ?? (responses.collection as string),
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
