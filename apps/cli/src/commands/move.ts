import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import prompts from 'prompts';
import type { LingoTrackerConfig } from '@simoncodes-ca/core';
import { CONFIG_FILENAME, moveResource } from '@simoncodes-ca/core';

export interface MoveResourceOptions {
    collection?: string;
    source?: string;
    dest?: string;
    destCollection?: string;
    override?: boolean;
    verbose?: boolean;
}

export async function moveResourceCommand(options: MoveResourceOptions): Promise<void> {
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

    let destTranslationsFolder: string | undefined;
    if (answers.destCollection) {
        const destCollectionConfig = config.collections?.[answers.destCollection];
        if (!destCollectionConfig) {
            console.log(`❌ Destination collection "${answers.destCollection}" not found.`);
            return;
        }
        destTranslationsFolder = resolve(cwd, destCollectionConfig.translationsFolder);
    }

    try {
        const result = moveResource(
            resolve(cwd, collectionConfig.translationsFolder),
            {
                source: answers.source,
                destination: answers.dest,
                override: options.override,
                destinationTranslationsFolder: destTranslationsFolder,
            }
        );

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
        console.log(`❌ ${e instanceof Error ? e.message : 'Failed to move resource'}`);
    }
}

async function promptForMissing(
    options: MoveResourceOptions,
    config: LingoTrackerConfig
): Promise<{
    collection: string;
    source: string;
    dest: string;
    destCollection?: string;
}> {
    const responses: Partial<{
        collection: string;
        source: string;
        dest: string;
        destCollection: string;
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
                message: 'Select source collection',
                choices: collections.map(c => ({ title: c, value: c })),
            });
        } else {
            console.log('❌ No collections found. Run `lingo-tracker add-collection` first.');
            throw new Error('No collections available');
        }
    }

    if (!options.source) {
        questions.push({
            type: 'text',
            name: 'source',
            message: 'Source key or pattern (e.g. common.buttons.ok or common.buttons.*)',
            validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
        });
    }

    if (!options.dest) {
        questions.push({
            type: 'text',
            name: 'dest',
            message: 'Destination key (e.g. common.actions.ok)',
            validate: (val: string) => (val && val.trim().length > 0 ? true : 'Required'),
        });
    }

    // Optional destCollection prompt could be added here, but for now we rely on flags or optional prompt if we want to be fancy.
    // Let's just return what we have from options if not prompted.

    if (questions.length > 0 && process.stdout.isTTY) {
        const result = await prompts(questions, {
            onCancel: () => {
                throw new Error('Move resource cancelled');
            },
        });
        Object.assign(responses, result);
    } else if (questions.length > 0) {
        if (!options.collection) throw new Error('Missing required option: collection');
        if (!options.source) throw new Error('Missing required option: source');
        if (!options.dest) throw new Error('Missing required option: dest');
    }

    return {
        collection: options.collection ?? (responses.collection as string),
        source: options.source ?? (responses.source as string),
        dest: options.dest ?? (responses.dest as string),
        destCollection: options.destCollection,
    };
}
