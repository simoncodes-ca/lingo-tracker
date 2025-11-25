import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prompts from 'prompts';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { CONFIG_FILENAME, editResource } from '@simoncodes-ca/core';

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

    // Prepare edit options
    const editOptions: any = {
        key: answers.key,
        cwd: resolve(cwd),
        baseLocale: collectionConfig.baseLocale || config.baseLocale || 'en',
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
        editOptions.tags = options.tags.split(',').map(t => t.trim()).filter(Boolean);
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
            resolve(cwd, collectionConfig.translationsFolder),
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
    config: LingoTrackerConfig
): Promise<{
    collection: string;
    key: string;
    baseValue?: string;
}> {
    const responses: Partial<{
        collection: string;
        key: string;
        baseValue: string;
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
        if (!options.collection) throw new Error('Missing required option: collection');
        if (!options.key) throw new Error('Missing required option: key');
    }

    return {
        collection: options.collection ?? (responses.collection as string),
        key: options.key ?? (responses.key as string),
        baseValue: options.baseValue ?? (responses.baseValue as string),
    };
}
