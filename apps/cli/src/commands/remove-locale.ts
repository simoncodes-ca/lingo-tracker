import prompts from 'prompts';
import { removeLocaleFromCollection } from '@simoncodes-ca/core';
import { loadConfiguration, promptForCollection, resolveCollection, ConsoleFormatter } from '../utils';

export interface RemoveLocaleOptions {
  collection?: string;
  locale?: string;
}

export async function removeLocaleCommand(options: RemoveLocaleOptions): Promise<void> {
  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  const collectionName = await promptForCollection(config, options.collection);
  if (!collectionName) return;

  const collection = resolveCollection(collectionName, config, cwd);
  if (!collection) return;

  const baseLocale = collection.config.baseLocale ?? config.baseLocale;
  const effectiveLocales = (collection.config.locales ?? config.locales ?? []).filter(
    (l) => baseLocale === undefined || l !== baseLocale,
  );

  let locale = options.locale;

  if (!locale) {
    if (!process.stdout.isTTY) {
      ConsoleFormatter.error('Missing required option: --locale');
      return;
    }

    if (effectiveLocales.length === 0) {
      ConsoleFormatter.error(`No removable locales in collection "${collectionName}".`);
      return;
    }

    const answer = await prompts(
      {
        type: 'select',
        name: 'locale',
        message: 'Select locale to remove',
        choices: effectiveLocales.map((l) => ({ title: l, value: l })),
      },
      { onCancel: () => process.exit(0) },
    );

    locale = answer.locale as string;
  }

  if (!locale) return;

  try {
    const result = await removeLocaleFromCollection(collectionName, locale, { cwd });
    ConsoleFormatter.success(result.message);
    ConsoleFormatter.keyValue('Entries purged', result.entriesPurged);
    ConsoleFormatter.keyValue('Files updated', result.filesUpdated);
  } catch (e: unknown) {
    ConsoleFormatter.error(e instanceof Error ? e.message : 'Failed to remove locale');
  }
}
