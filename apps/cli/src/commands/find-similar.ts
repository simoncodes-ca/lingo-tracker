import { type Collection, normalizeSearchRequest, readCollection, searchResources } from '@simoncodes-ca/core';
import { CommandOutput } from '../runner/command-output';
import { defineCommand } from '../runner/command-runner';
import { ConsoleFormatter } from '../utils';
import { DEFAULT_MAX_RESULTS, FIND_SIMILAR_BLANK_VALUE_ERROR, FIND_SIMILAR_FLAGS } from './find-similar-flags';

export interface FindSimilarOptions {
  collection?: string;
  value?: string;
  maxResults?: number;
}

export const findSimilarCommand = defineCommand<FindSimilarOptions>()({
  flags: FIND_SIMILAR_FLAGS,
  name: 'Find similar',
  collection: 'read',

  required: ['value', 'maxResults'],
  run: ({ collection, answers }) => {
    const request = normalizeSearchRequest(
      { query: answers.value, mode: 'similar-value', limit: answers.maxResults },
      DEFAULT_MAX_RESULTS,
    );
    if (request.kind === 'blank') throw new Error(FIND_SIMILAR_BLANK_VALUE_ERROR);
    reportSimilar(collection, request.query, request.limit);
  },
});

/** Prints the collection's base values that Resource Search's similar-value rule matches, best first. */
function reportSimilar(collection: Collection, query: string, limit: number): void {
  const { resources, warnings } = readCollection(collection);
  for (const warning of warnings) {
    ConsoleFormatter.warning(warning);
  }

  const matches = searchResources(resources, collection, query, { mode: 'similar-value', limit });
  if (matches.length === 0) {
    CommandOutput.log(`No similar values found for "${query}".`);
    return;
  }

  CommandOutput.log(`Similar values found for "${query}":`);
  for (const match of matches) {
    const pct = Math.round((match.similarity ?? 0) * 100);
    CommandOutput.log(`  ${match.key} → "${match.source}" (similarity: ${pct}%)`);
  }
}
