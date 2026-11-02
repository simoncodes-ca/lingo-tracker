import type { PromptContext } from '../runner/command-runner';
import { collectionFlag, defineFlags, flagName } from '../runner/flag-record';
import type { FindSimilarOptions } from './find-similar';
import { parseMaxResults } from './find-similar-options';
export const DEFAULT_MAX_RESULTS = 5;

export const FIND_SIMILAR_FLAGS = defineFlags<FindSimilarOptions, PromptContext<'read'>>()({
  collection: collectionFlag('Name of the collection to search'),
  value: {
    flags: '--value <text>',
    description: 'Base locale text to search for similar values',
    prompt: (options) =>
      (options.value ?? '').trim().length === 0
        ? [{ type: 'text', name: 'value', message: 'Base locale text to search for' }]
        : [],
  },
  maxResults: {
    runtimeDefault: DEFAULT_MAX_RESULTS,
    flags: '--max-results <n>',
    description: `Maximum number of results to return (default: ${DEFAULT_MAX_RESULTS})`,
    helpDefault: String(DEFAULT_MAX_RESULTS),
    parse: parseMaxResults,
  },
});

export const FIND_SIMILAR_REGISTRATION = {
  name: 'find-similar',
  description: 'Find existing translation resources with similar base locale values',
  flags: FIND_SIMILAR_FLAGS,
};

export const FIND_SIMILAR_BLANK_VALUE_ERROR = `${flagName(FIND_SIMILAR_FLAGS.value)} must not be blank`;
