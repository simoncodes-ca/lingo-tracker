import type { PromptContext } from '../runner/command-runner';
import { collectionSetupFlags, defineFlags } from '../runner/flag-record';
import { collectionSetupQuestions } from '../utils/prompt-utils';
import type { AddCollectionOptions } from './add-collection';
export const ADD_COLLECTION_FLAGS = defineFlags<AddCollectionOptions, PromptContext<'none'>>()({
  ...collectionSetupFlags,
  collectionName: {
    ...collectionSetupFlags.collectionName,
    prompt: (options, { config }) =>
      collectionSetupQuestions(options, config).filter((question) => question.name === 'collectionName'),
  },
  translationsFolder: {
    ...collectionSetupFlags.translationsFolder,
    prompt: (options, { config }) =>
      collectionSetupQuestions(options, config).filter((question) => question.name === 'translationsFolder'),
  },
  exportFolder: {
    ...collectionSetupFlags.exportFolder,
    prompt: (options, { config }) =>
      collectionSetupQuestions(options, config).filter((question) => question.name === 'exportFolder'),
  },
  importFolder: {
    ...collectionSetupFlags.importFolder,
    prompt: (options, { config }) =>
      collectionSetupQuestions(options, config).filter((question) => question.name === 'importFolder'),
  },
  baseLocale: {
    ...collectionSetupFlags.baseLocale,
    prompt: (options, { config }) =>
      collectionSetupQuestions(options, config).filter((question) => question.name === 'baseLocale'),
  },
  locales: {
    ...collectionSetupFlags.locales,
    prompt: (options, { config }) =>
      collectionSetupQuestions(options, config).filter((question) => question.name === 'locales'),
  },
  readOnly: {
    flags: '--no-read-only',
    description: 'Force the collection writable, overriding node_modules auto-detection',
    positive: {
      flags: '--read-only',
      description: 'Mark the collection as read-only (its resources cannot be modified)',
    },
  },
});
export const ADD_COLLECTION_REGISTRATION = {
  name: 'add-collection',
  description: 'Add a new translation collection to the project',
  flags: ADD_COLLECTION_FLAGS,
};
