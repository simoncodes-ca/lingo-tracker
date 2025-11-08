import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import prompts from 'prompts';
import type { LingoTrackerConfig, TranslationStatus } from '@simoncodes-ca/core';

export interface AddResourceOptions {
  collection?: string;
  key?: string;
  value?: string;
  comment?: string;
  tags?: string;
  targetFolder?: string;
  translations?: Array<{
    locale: string;
    value: string;
    status: TranslationStatus;
  }>;
}

export async function addResourceCommand(options: AddResourceOptions): Promise<void> {
  const cwd = process.env.INIT_CWD || process.cwd();
  const { CONFIG_FILENAME, addResource } = await import('@simoncodes-ca/core');
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
  const collection = answers.collection;
  const collectionConfig = config.collections?.[collection];

  if (!collectionConfig) {
    console.log(`❌ Collection "${collection}" not found.`);
    return;
  }

  try {
    // Check if resource already exists
    const { resolveResourceKey, splitResolvedKey } = await import('@simoncodes-ca/core');
    const resolvedKey = resolveResourceKey(answers.key, answers.targetFolder || undefined);
    const { folderPath, entryKey } = splitResolvedKey(resolvedKey);
    
    const fullFolderPath = folderPath.length
      ? join(collectionConfig.translationsFolder, ...folderPath)
      : collectionConfig.translationsFolder;
    
    const entryResourcePath = resolve(cwd, fullFolderPath, 'resource_entries.json');
    const resourceExists = existsSync(entryResourcePath) && hasEntryKey(entryResourcePath, entryKey);

    if (resourceExists) {
      if (process.stdout.isTTY) {
        // Interactive mode: prompt for confirmation
        const confirm = await prompts({
          type: 'confirm',
          name: 'value',
          message: `Resource "${resolvedKey}" already exists. Overwrite?`,
          initial: false,
        });

        if (!confirm.value) {
          console.log('❌ Add resource cancelled.');
          return;
        }
      } 
    }

    const tagsArray = answers.tags ? answers.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const baseLocale = collectionConfig.baseLocale || config.baseLocale;
    const locales = collectionConfig.locales || config.locales || [];
    
    // Build translations: use provided translations or create entries for all non-base locales with base value
    let translations: Array<{ locale: string; value: string; status: TranslationStatus }> | undefined;
    
    if (answers.translations && answers.translations.length > 0) {
      translations = answers.translations;
    } else {
      // Create entries for all non-base locales with base value and 'new' status
      const nonBaseLocales = locales.filter(locale => locale !== baseLocale);
      if (nonBaseLocales.length > 0) {
        translations = nonBaseLocales.map(locale => ({
          locale,
          value: answers.value,
          status: 'new' as TranslationStatus,
        }));
      }
    }
    
    const result = addResource(
      resolve(cwd, collectionConfig.translationsFolder),
      {
        key: answers.key,
        baseValue: answers.value,
        comment: answers.comment || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
        targetFolder: answers.targetFolder || undefined,
        baseLocale,
        translations: translations && translations.length > 0 ? translations : undefined,
      },
      { cwd }
    );

    console.log(`✅ Resource added: ${result.resolvedKey}`);
    if (result.created) {
      console.log('   (newly created)');
    }
  } catch (e: unknown) {
    console.log(`❌ ${e instanceof Error ? e.message : 'Failed to add resource'}`);
  }
}

async function promptForMissing(
  options: AddResourceOptions,
  config: LingoTrackerConfig
): Promise<{
  collection: string;
  key: string;
  value: string;
  comment: string;
  tags: string;
  targetFolder: string;
  translations?: Array<{
    locale: string;
    value: string;
    status: TranslationStatus;
  }>;
}> {
  const responses: Partial<{
    collection: string;
    key: string;
    value: string;
    comment: string;
    tags: string;
    targetFolder: string;
    translations?: Array<{
      locale: string;
      value: string;
      status: TranslationStatus;
    }>;
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
      message: 'Resource key (dot-delimited, e.g., apps.common.buttons.ok)',
      validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
    });
  }

  if (!options.value) {
    questions.push({
      type: 'text',
      name: 'value',
      message: 'Base value (source text)',
      validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
    });
  }

  if (!options.comment) {
    questions.push({
      type: 'text',
      name: 'comment',
      message: 'Comment (optional, press enter to skip)',
    });
  }

  if (!options.tags) {
    questions.push({
      type: 'text',
      name: 'tags',
      message: 'Tags (optional, comma-separated)',
    });
  }

  if (!options.targetFolder) {
    questions.push({
      type: 'text',
      name: 'targetFolder',
      message: 'Target folder (optional, dot-delimited override)',
    });
  }

  if (questions.length > 0 && process.stdout.isTTY) {
    const result = await prompts(questions, {
      onCancel: () => {
        throw new Error('Add resource cancelled');
      },
    });
    Object.assign(responses, result);
  } else if (questions.length > 0) {
    if (!options.collection) throw new Error('Missing required option: collection');
    if (!options.key) throw new Error('Missing required option: key');
    if (!options.value) throw new Error('Missing required option: value');
  }

  // Handle translations in interactive mode
  let translations: Array<{ locale: string; value: string; status: TranslationStatus }> | undefined;
  if (!options.translations && process.stdout.isTTY) {
    const collection = options.collection ?? (responses.collection as string);
    const collectionConfig = config.collections?.[collection];
    const baseLocale = collectionConfig?.baseLocale || config.baseLocale;
    const locales = collectionConfig?.locales || config.locales || [];
    
    const nonBaseLocales = locales.filter(locale => locale !== baseLocale);
    
    if (nonBaseLocales.length > 0) {
      const shouldAddTranslations = await prompts({
        type: 'confirm',
        name: 'value',
        message: 'Add translations for other locales?',
        initial: false,
      });

      if (shouldAddTranslations.value) {
        translations = [];
        for (const locale of nonBaseLocales) {
          const translationPrompt = await prompts({
            type: 'text',
            name: 'value',
            message: `Translation for ${locale} (press enter to use base value)`,
          });
          
          const baseValue = options.value ?? (responses.value as string);
          const translationValue = translationPrompt.value || baseValue;
          
          const statusPrompt = await prompts({
            type: 'select',
            name: 'value',
            message: `Status for ${locale}`,
            choices: [
              { title: 'new', value: 'new' },
              { title: 'translated', value: 'translated' },
              { title: 'verified', value: 'verified' },
            ],
            initial: 1, // Default to 'translated'
          });
          
          translations.push({
            locale,
            value: translationValue,
            status: statusPrompt.value as TranslationStatus,
          });
        }
      }
    }
  }

  return {
    collection: options.collection ?? (responses.collection as string),
    key: options.key ?? (responses.key as string),
    value: options.value ?? (responses.value as string),
    comment: options.comment ?? (responses.comment as string) ?? '',
    tags: options.tags ?? (responses.tags as string) ?? '',
    targetFolder: options.targetFolder ?? (responses.targetFolder as string) ?? '',
    translations: options.translations || translations,
  };
}

/**
 * Checks if a resource entry already exists in a file.
 */
function hasEntryKey(filePath: string, entryKey: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const data = JSON.parse(content) as Record<string, unknown>;
    return entryKey in data;
  } catch {
    return false;
  }
}

