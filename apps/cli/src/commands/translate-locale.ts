import prompts from 'prompts';
import { translateLocale } from '@simoncodes-ca/core';
import { loadConfiguration, resolveCollection, ConsoleFormatter, ErrorMessages } from '../utils';

export interface TranslateLocaleOptions {
  collection?: string;
  locale?: string;
  verbose?: boolean;
}

/**
 * CLI command that auto-translates all `new` and `stale` resources for a
 * single target locale within a collection.
 *
 * In TTY mode, missing `collection` and `locale` options trigger interactive
 * prompts. In non-TTY mode both flags are required.
 */
export async function translateLocaleCommand(options: TranslateLocaleOptions): Promise<void> {
  const loaded = loadConfiguration({ exitOnError: false });
  if (!loaded) return;
  const { config, cwd } = loaded;

  // -------------------------------------------------------------------------
  // Resolve collection
  // -------------------------------------------------------------------------

  let collectionName = options.collection;

  if (!collectionName) {
    const collectionNames = Object.keys(config.collections ?? {});

    if (collectionNames.length === 0) {
      ConsoleFormatter.error(ErrorMessages.NO_COLLECTIONS);
      return;
    }

    if (!process.stdout.isTTY) {
      ConsoleFormatter.error(ErrorMessages.MISSING_OPTION('collection'));
      return;
    }

    const answer = await prompts(
      {
        type: 'select',
        name: 'collection',
        message: 'Select collection to translate',
        choices: collectionNames.map((name) => ({ title: name, value: name })),
      },
      { onCancel: () => process.exit(0) },
    );

    collectionName = answer.collection as string;
  }

  const collection = resolveCollection(collectionName, config, cwd);
  if (!collection) return;

  // -------------------------------------------------------------------------
  // Validate translation is enabled
  // -------------------------------------------------------------------------

  const translationEnabled = collection.config.translation?.enabled ?? config.translation?.enabled ?? false;
  if (!translationEnabled) {
    ConsoleFormatter.error(
      `Auto-translation is not enabled for collection "${collectionName}". ` +
        `Set translation.enabled = true in your configuration.`,
    );
    return;
  }

  const baseLocale = collection.config.baseLocale ?? config.baseLocale ?? 'en';
  const allLocales = collection.config.locales ?? config.locales ?? [];

  const nonBaseLocales = allLocales.filter((locale) => locale !== baseLocale);

  if (nonBaseLocales.length === 0) {
    ConsoleFormatter.error(`No target locales configured. Add locales other than the base locale "${baseLocale}".`);
    return;
  }

  // -------------------------------------------------------------------------
  // Resolve target locale
  // -------------------------------------------------------------------------

  let targetLocale = options.locale;

  if (!targetLocale) {
    if (!process.stdout.isTTY) {
      ConsoleFormatter.error(ErrorMessages.MISSING_OPTION('locale'));
      return;
    }

    const answer = await prompts(
      {
        type: 'select',
        name: 'locale',
        message: 'Select target locale to translate',
        choices: nonBaseLocales.map((locale) => ({ title: locale, value: locale })),
      },
      { onCancel: () => process.exit(0) },
    );

    targetLocale = answer.locale as string;
  }

  if (targetLocale === baseLocale) {
    ConsoleFormatter.error(`Cannot translate to the base locale "${baseLocale}".`);
    return;
  }

  if (!allLocales.includes(targetLocale)) {
    ConsoleFormatter.error(`Locale "${targetLocale}" is not configured. Available locales: ${allLocales.join(', ')}`);
    return;
  }

  // -------------------------------------------------------------------------
  // Resolve translation config
  // -------------------------------------------------------------------------

  const translationConfig = collection.config.translation ?? config.translation;
  if (!translationConfig) {
    ConsoleFormatter.error('Translation configuration is missing. Check your .lingo-tracker.json.');
    return;
  }

  // -------------------------------------------------------------------------
  // Run translation
  // -------------------------------------------------------------------------

  const translationsFolder = collection.config.translationsFolder;

  console.log('');
  ConsoleFormatter.progress(`Translating locale '${targetLocale}' in collection '${collectionName}'...`);

  try {
    const result = await translateLocale({
      translationsFolder,
      translationConfig,
      targetLocale,
      baseLocale,
      allLocales,
      cwd,
      onProgress: options.verbose
        ? (progress) => {
            ConsoleFormatter.indent(
              `[batch ${progress.currentBatch}/${progress.totalBatches}] ` +
                `translated: ${progress.translatedCount}, skipped: ${progress.skippedCount}, failed: ${progress.failedCount}`,
            );
          }
        : undefined,
    });

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------

    console.log('');
    ConsoleFormatter.success(`Translated locale '${targetLocale}' in collection '${collectionName}'`);
    ConsoleFormatter.keyValue('Translated', result.translatedCount);
    ConsoleFormatter.keyValue('Skipped (ICU)', result.skippedCount);
    ConsoleFormatter.keyValue('Failed', result.failedCount);

    if (result.failures.length > 0) {
      console.log('');
      ConsoleFormatter.section('Failures');
      for (const failure of result.failures) {
        ConsoleFormatter.indent(`${failure.key}: ${failure.error}`);
      }
    }

    if (result.failedCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ConsoleFormatter.error(`Translation failed: ${message}`);
    process.exit(1);
  }
}
