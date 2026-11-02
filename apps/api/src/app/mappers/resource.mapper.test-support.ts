import type { Collection, ResourceTreeEntry } from '@simoncodes-ca/core';

/** In-memory mapper inputs; no config or resource files are read. */
export const collection: Collection = {
  runtime: 'transloco-messageformat',
  onMutation: () => undefined,
  name: 'test',
  translationsFolder: '/t',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  targetLocales: ['fr'],
  translationConfig: undefined,
  tags: ['collection'],
  termFiles: {
    protectedTerms: { path: '/t/protected.json', explicit: false },
    preferredTerminology: { path: '/t/terminology.json', explicit: false },
  },
  readOnly: false,
  config: { translationsFolder: '/t' },
};

export const entry: ResourceTreeEntry = {
  key: 'save',
  source: 'Save',
  translations: { fr: 'Enregistrer' },
  metadata: {
    en: { checksum: 'base' },
    fr: { checksum: 'target', baseChecksum: 'base', status: 'translated' },
  },
};
