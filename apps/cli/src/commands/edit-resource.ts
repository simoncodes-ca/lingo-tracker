import { resolve } from 'node:path';
import prompts from 'prompts';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { editResource } from '@simoncodes-ca/core';
import {
    loadConfiguration,
    parseCommaSeparatedList,
    promptForCollection,
    resolveCollection
} from '../utils';

export interface EditResourceOptions {
    collection?: string;
    key?: string;
    targetFolder?: string;
    baseValue?: string;
    comment?: string;
    tags?: string; // Comma separated
    locale?: string;
    localeValue?: string;
}

export async function editResourceCommand(options: EditResourceOptions): Promise<void> {
    const loaded = loadConfiguration({ exitOnError: false });
    if (!loaded) return;
    const { config, cwd } = loaded;

    const collectionName = await promptForCollection(config, options.collection);
    if (!collectionName) return;

    const collection = resolveCollection(collectionName, config, cwd);
    if (!collection) return;

    const answers = await promptForMissing(options, config, collectionName);

    // Prepare edit options
    const editOptions: {
        key: string;
        cwd: string;
        baseLocale: string;
        targetFolder?: string;
        baseValue?: string;
        comment?: string;
        tags?: string[];
        locales?: Record<string, { value: string }>;
    } = {
        key: answers.key,
        cwd: resolve(cwd),
        baseLocale: collection.config.baseLocale,
    };

    if (options.targetFolder) {
        editOptions.targetFolder = options.targetFolder;
    }

    if (answers.baseValue) {
        editOptions.baseValue = answers.baseValue;
    }

    if (options.comment) {
        editOptions.comment = options.comment;
    }

    if (options.tags) {
        editOptions.tags = parseCommaSeparatedList(options.tags);
    }

    if (options.locale && options.localeValue) {
        editOptions.locales = {
            [options.locale]: { value: options.localeValue }
        };
    } else if (options.locale || options.localeValue) {
        console.log('⚠️  Both --locale and --localeValue must be provided to update a translation.');
    }

    try {
        const result = editResource(
            collection.translationsFolderPath,
            editOptions
        );

        if (result.updated) {
            console.log(`✅ Resource "${result.resolvedKey}" updated successfully.`);
        } else {
            console.log(`ℹ️  ${result.message || 'No changes detected.'}`);
        }

    } catch (e: unknown) {
        console.log(`❌ ${e instanceof Error ? e.message : 'Failed to update resource'}`);
    }
}

async function promptForMissing(
    options: EditResourceOptions,
    _config: LingoTrackerConfig,
    _collectionName: string
): Promise<{
    key: string;
    baseValue?: string;
}> {
    const responses: Partial<{
        key: string;
        baseValue: string;
    }> = {};

    const questions: prompts.PromptObject[] = [];

    if (!options.key) {
        questions.push({
            type: 'text',
            name: 'key',
            message: 'Resource key',
            validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
        });
    }

    if (!options.baseValue) {
        questions.push({
            type: 'text',
            name: 'baseValue',
            message: 'New base value (leave empty to keep current)',
        });
    }

    if (questions.length > 0 && process.stdout.isTTY) {
        const result = await prompts(questions, {
            onCancel: () => {
                throw new Error('Edit resource cancelled');
            },
        });
        Object.assign(responses, result);
    } else if (questions.length > 0) {
        if (!options.key) throw new Error('Missing required option: key');
    }

    return {
        key: options.key ?? (responses.key as string),
        baseValue: options.baseValue ?? (responses.baseValue as string),
    };
}
