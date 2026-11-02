import type { Collection } from '@simoncodes-ca/core';
import { describeTreeRead } from './tree-response.mapper';

const collection: Collection = {
  runtime: 'transloco-messageformat',
  onMutation: () => undefined,
  name: 'test',
  translationsFolder: '/t',
  baseLocale: 'en',
  locales: ['en'],
  targetLocales: [],
  translationConfig: undefined,
  tags: [],
  readOnly: false,
  config: { translationsFolder: '/t' },
  termFiles: {
    protectedTerms: { path: '/terms', explicit: false },
    preferredTerminology: { path: '/preferred', explicit: false },
  },
};

describe('describeTreeRead', () => {
  it('describes an index already running', () => {
    expect(describeTreeRead({ status: 'indexing' }, collection, undefined)).toStrictEqual({
      httpStatus: 202,
      body: {
        status: 'indexing',
        message: 'Collection is currently being indexed. Please try again shortly.',
      },
    });
  });

  it('describes indexing started by the read', () => {
    expect(describeTreeRead({ status: 'not-started' }, collection, undefined)).toStrictEqual({
      httpStatus: 202,
      body: {
        status: 'not-ready',
        message: 'Collection indexing started. Please try again shortly.',
      },
    });
  });

  it('describes a retry after an indexing error', () => {
    expect(describeTreeRead({ status: 'error' }, collection, undefined)).toStrictEqual({
      httpStatus: 202,
      body: {
        status: 'not-ready',
        message: 'Cache indexing failed, re-indexing collection. Please try again shortly.',
      },
    });
  });
  it('maps a ready read to the tree body with HTTP 200', () => {
    expect(
      describeTreeRead(
        { status: 'ready', tree: { folderPathSegments: [], resources: [], children: [] } },
        collection,
        'true',
      ),
    ).toStrictEqual({ httpStatus: 200, body: { path: '', resources: [], children: [] } });
  });
});
