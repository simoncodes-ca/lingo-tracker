import { describe, expect, it } from 'vitest';
import { MemoryStorageAdapter } from '../../shared/storage/keyed-storage';
import {
  defaultDraft,
  EXPORT_DRAFT_STORAGE_KEY,
  fromExportRequest,
  persistDraft,
  readPersistedDraft,
  toExportRequest,
} from './export-draft';

const context = { collectionNames: ['main', 'other'], locales: ['fr', 'ja'] };

describe('export draft', () => {
  it('defaults to a translator handoff and the configured output folder', () => {
    expect(defaultDraft()).toMatchObject({
      format: 'xliff',
      statuses: ['new', 'stale'],
      allCollections: true,
      allLocales: true,
      outputDirectory: 'dist/lingo-export',
      protectedTermNotes: true,
    });
    expect(defaultDraft({ exportFolder: 'handoff' }).outputDirectory).toBe('handoff');
  });

  it('omits all selections, empty optional fields and JSON for XLIFF', () => {
    const draft = defaultDraft();
    draft.json.rich = true;
    draft.outputDirectory = '  ';
    expect(toExportRequest(draft, context)).toEqual({
      format: 'xliff',
      statuses: ['new', 'stale'],
      protectedTermNotes: true,
    });
  });

  it('narrows explicit selections to context and trims optional text', () => {
    const draft = defaultDraft();
    Object.assign(draft, {
      allCollections: false,
      collections: ['main', 'gone'],
      allLocales: false,
      locales: ['fr', 'gone'],
      outputDirectory: ' out ',
      filenamePattern: ' {locale} ',
      tags: ['ui'],
    });
    expect(toExportRequest(draft, context)).toMatchObject({
      collections: ['main'],
      locales: ['fr'],
      outputDirectory: 'out',
      filenamePattern: '{locale}',
      tags: ['ui'],
    });
  });

  it('drops rich dependencies while preserving their raw draft values', () => {
    const draft = defaultDraft();
    draft.format = 'json';
    draft.json.includeBase = true;
    expect(toExportRequest(draft, context).json).toEqual({ structure: 'hierarchical', rich: false });
    draft.json.rich = true;
    expect(toExportRequest(draft, context).json).toMatchObject({ includeBase: true, basePropertyName: 'baseValue' });
    expect(draft.json.includeBase).toBe(true);
  });

  it('round trips an explicit Retry request without losing choices', () => {
    const request = {
      format: 'json' as const,
      collections: ['main'],
      locales: ['fr'],
      statuses: ['verified' as const],
      tags: ['release'],
      outputDirectory: 'out',
      filenamePattern: '{locale}',
      protectedTermNotes: false,
      json: {
        structure: 'flat' as const,
        rich: true,
        includeBase: true,
        basePropertyName: 'source',
        includeStatus: true,
        includeComment: true,
        includeTags: true,
      },
    };
    expect(toExportRequest(fromExportRequest(request), context)).toEqual(request);
    expect(fromExportRequest({ format: 'xliff' })).toEqual(defaultDraft());
  });

  it('round trips remembered options without either collection or locale selections', () => {
    const storage = new MemoryStorageAdapter();
    const draft = fromExportRequest({
      format: 'json',
      collections: ['main'],
      locales: ['fr'],
      statuses: ['verified'],
      tags: ['x'],
      json: { rich: true, includeBase: true },
    });
    persistDraft(draft, () => storage);
    const raw = storage.getItem(EXPORT_DRAFT_STORAGE_KEY) ?? '';
    for (const field of ['collections', 'locales', 'allCollections', 'allLocales'])
      expect(Object.keys(JSON.parse(raw))).not.toContain(field);
    expect(readPersistedDraft(() => storage)).toEqual({
      ...draft,
      allCollections: true,
      collections: [],
      allLocales: true,
      locales: [],
    });
  });

  it('ignores corrupt, unavailable and invalid persisted fields', () => {
    const storage = new MemoryStorageAdapter();
    storage.setItem(EXPORT_DRAFT_STORAGE_KEY, '{broken');
    expect(readPersistedDraft(() => storage)).toBeUndefined();
    expect(
      readPersistedDraft(() => {
        throw new Error('blocked');
      }),
    ).toBeUndefined();
    expect(() =>
      persistDraft(defaultDraft(), () => {
        throw new Error('blocked');
      }),
    ).not.toThrow();
    storage.setItem(
      EXPORT_DRAFT_STORAGE_KEY,
      JSON.stringify({ format: 'yaml', outputDirectory: 4, collections: ['main'], json: { rich: 'yes' } }),
    );
    expect(readPersistedDraft(() => storage)).toEqual(defaultDraft());
  });
  it('keeps JSON defaults when Retry options explicitly contain undefined', () => {
    const draft = fromExportRequest({
      format: 'json',
      json: {
        structure: undefined,
        rich: undefined,
        includeBase: undefined,
        basePropertyName: undefined,
        includeStatus: undefined,
        includeComment: undefined,
        includeTags: undefined,
      },
    });
    expect(draft.json).toEqual(defaultDraft().json);
    const partial = fromExportRequest({
      format: 'json',
      json: { structure: 'flat', rich: true, includeBase: undefined, includeStatus: false, basePropertyName: '' },
    });
    expect(partial.json).toEqual({
      ...defaultDraft().json,
      structure: 'flat',
      rich: true,
      includeStatus: false,
      basePropertyName: '',
    });
  });

  it('restores default statuses when the persisted selection is empty', () => {
    const storage = new MemoryStorageAdapter();
    for (const statuses of [[], ['unknown']]) {
      storage.setItem(EXPORT_DRAFT_STORAGE_KEY, JSON.stringify({ format: 'json', statuses }));
      expect(readPersistedDraft(() => storage)?.statuses).toEqual(['new', 'stale']);
    }
    storage.setItem(EXPORT_DRAFT_STORAGE_KEY, JSON.stringify({ statuses: ['verified'] }));
    expect(readPersistedDraft(() => storage)?.statuses).toEqual(['verified']);
  });
});
