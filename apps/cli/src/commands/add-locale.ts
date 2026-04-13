import prompts from 'prompts';
import { addLocaleToCollection } from '@simoncodes-ca/core';
import { loadConfiguration, promptForCollection, resolveCollection, ConsoleFormatter } from '../utils';

export interface AddLocaleOptions {
  collection?: string;
  locale?: string;
}

export async function addLocaleCommand(options: AddLocaleOptions): Promise<void> {
  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  const collectionName = await promptForCollection(config, options.collection);
  if (!collectionName) return;

  const collection = resolveCollection(collectionName, config, cwd);
  if (!collection) return;

  let locale = options.locale;

  if (!locale) {
    if (!process.stdout.isTTY) {
      ConsoleFormatter.error('Missing required option: --locale');
      return;
    }

    const answer = await prompts(
      {
        type: 'text',
        name: 'locale',
        message: 'Enter locale to add (e.g. fr-ca, de, es)',
      },
      { onCancel: () => process.exit(0) },
    );

    locale = answer.locale as string;
  }

  if (!locale) return;

  try {
    const result = await addLocaleToCollection(collectionName, locale, { cwd });
    ConsoleFormatter.success(result.message);
    ConsoleFormatter.keyValue('Entries backfilled', result.entriesBackfilled);
    ConsoleFormatter.keyValue('Files updated', result.filesUpdated);
  } catch (e: unknown) {
    ConsoleFormatter.error(e instanceof Error ? e.message : 'Failed to add locale');
  }
}
