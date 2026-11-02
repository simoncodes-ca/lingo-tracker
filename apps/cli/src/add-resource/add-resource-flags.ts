import { addResourceFlags, collectionFlag, defineFlags } from '../runner/flag-record';
import { missingTextQuestions } from '../utils/prompt-utils';
import type { AddResourceOptions } from './add-resource';

export const ADD_RESOURCE_FLAGS = defineFlags<AddResourceOptions>()({
  collection: collectionFlag('Name of the collection'),
  ...addResourceFlags,
  override: { flags: '--override', description: 'Replace the resource if it already exists' },
  translations: {
    flags: '--translations <json>',
    description:
      'Optional translations as JSON array, e.g., \'[{"locale":"es","value":"Aplicar","status":"translated"}]\'',
  },
  key: {
    ...addResourceFlags.key,
    prompt: (options) =>
      missingTextQuestions(options, [
        { name: 'key', message: 'Resource key (dot-delimited, e.g., apps.common.buttons.ok)', required: true },
      ]),
  },
  value: {
    ...addResourceFlags.value,
    prompt: (options) =>
      missingTextQuestions(options, [{ name: 'value', message: 'Base value (source text)', required: true }]),
  },
  comment: {
    ...addResourceFlags.comment,
    prompt: (options) =>
      missingTextQuestions(options, [{ name: 'comment', message: 'Comment (optional, press enter to skip)' }]),
  },
  tags: {
    ...addResourceFlags.tags,
    prompt: (options) => missingTextQuestions(options, [{ name: 'tags', message: 'Tags (optional, comma-separated)' }]),
  },
  targetFolder: {
    ...addResourceFlags.targetFolder,
    prompt: (options) =>
      missingTextQuestions(options, [
        { name: 'targetFolder', message: 'Target folder (optional, dot-delimited override)' },
      ]),
  },
});

export const ADD_RESOURCE_REGISTRATION = {
  name: 'add-resource',
  description: 'Add a translation resource to a collection',
  flags: ADD_RESOURCE_FLAGS,
};
