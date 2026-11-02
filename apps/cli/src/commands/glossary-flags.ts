import { collectionFlag, defineFlags } from '../runner/flag-record';
import type { GlossaryCommandOptions } from './glossary';

export const GLOSSARY_FLAGS = defineFlags<GlossaryCommandOptions>()({
  text: { flags: '--text <text>', description: 'Inline text block to extract terms from' },
  input: { flags: '--input <file>', description: 'Path to a file whose contents are the input text block' },
  output: {
    flags: '--output <file>',
    description: 'Output JSON file path (default: ./lingo-tracker-glossary-<timestamp>.json)',
  },
  stdout: { flags: '--stdout', description: 'Print the glossary JSON to stdout instead of writing a file' },
  collection: collectionFlag('Limit matching to a single collection (default: all collections)'),
  locales: {
    list: 'optional',
    flags: '--locales <list>',
    description: 'Comma-separated locales to include (default: all configured locales)',
  },
  includeAll: {
    flags: '--include-all',
    description: 'Include new/stale entries (default: only translated + verified)',
  },
  extractor: {
    flags: '--extractor <mode>',
    description: 'Term extraction strategy',
    choices: ['ngram', 'ai'],
    defaultValue: 'ngram',
  },
});

export const GLOSSARY_REGISTRATION = {
  name: 'glossary',
  description: 'Extract translations for terms found in a block of text (e.g. for online help)',
  flags: GLOSSARY_FLAGS,
};
