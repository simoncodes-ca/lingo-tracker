import type { PromptContext } from '../runner/command-runner';
import { collectionFlag, defineFlags, flagName, yesFlag } from '../runner/flag-record';
import { selectionPrompt } from '../utils/prompt-utils';
import type { NormalizeOptions } from './normalize';

const allFlag = { flags: '--all', description: 'Normalize all collections' };

export const NORMALIZE_FLAGS = defineFlags<
  NormalizeOptions,
  PromptContext<'many'>,
  NormalizeOptions & { collectionOrAll?: string }
>()({
  collection: {
    selection: { prompt: 'collectionOrAll', allFlag: 'all' },
    ...collectionFlag(`Collection name (required unless ${flagName(allFlag)})`),
    prompt: (options, { config }) => {
      const collections = Object.keys(config.collections ?? {});
      if (options.collection || options.all || collections.length === 0) {
        return [];
      }
      return [
        selectionPrompt({
          mode: 'single',
          name: 'collectionOrAll',
          message: 'Select collection to normalize',
          choices: collections,
          allTitle: 'All collections',
        }),
      ];
    },
  },
  all: allFlag,
  dryRun: { flags: '--dry-run', description: 'Preview changes without applying them' },
  json: { flags: '--json', description: 'Output results as JSON' },
  yes: yesFlag,
});

export const NORMALIZE_REGISTRATION = {
  name: 'normalize',
  description: 'Normalize translation resources (fix checksums, add missing locales, clean up empty folders)',
  flags: NORMALIZE_FLAGS,
};

/** Derived once for the workflow's required-selection check. */
export const NORMALIZE_SELECTION_ERROR = `Missing required option in non-interactive mode: ${flagName(NORMALIZE_FLAGS.collection)} or ${flagName(NORMALIZE_FLAGS.all)}`;
