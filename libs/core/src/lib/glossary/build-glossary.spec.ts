import { describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { openCollection } from '../config/open-collection';
import {
  CollectionBaseLocaleMismatchError,
  GlossaryExtractorError,
  GlossaryNoCollectionsError,
} from '../errors/lingo-tracker-error';
import { readCollection, type StoredResource } from '../resource/read-collection';
import { buildGlossary } from './build-glossary';

vi.mock('../resource/read-collection', () => ({ readCollection: vi.fn() }));

const config: LingoTrackerConfig = {
  exportFolder: 'dist/export',
  importFolder: 'dist/import',
  baseLocale: 'en',
  locales: ['en', 'fr'],
  collections: {
    app: { translationsFolder: 'app' },
    spanish: { translationsFolder: 'spanish', locales: ['en', 'es'] },
    frenchBase: { translationsFolder: 'french-base', baseLocale: 'fr', locales: ['fr', 'es'] },
  },
};
const open = (name: string) => openCollection(config, name, { cwd: '/project' });
const stored = (
  key: string,
  source: string,
  translations: Record<string, string>,
  status: Record<string, 'new' | 'stale' | 'translated' | 'verified'>,
): StoredResource => ({
  fullKey: key,
  folderPath: '',
  entryKey: key,
  entry: {
    key,
    source,
    translations,
    metadata: Object.fromEntries(
      Object.entries(status).map(([locale, value]) => [locale, { checksum: 'x', status: value }]),
    ),
  },
  effectiveTags: [],
});

describe('buildGlossary', () => {
  it('keeps the existing single-collection JSON shape and defaults', () => {
    vi.mocked(readCollection).mockReturnValue({
      resources: [stored('save', 'Save', { fr: 'Enregistrer' }, { fr: 'verified' })],
      problems: [],
      warnings: [],
    });
    const { warnings, ...glossary } = buildGlossary([open('app')], 'Save');
    expect(glossary).toEqual({
      baseLocale: 'en',
      locales: ['fr'],
      source: { chars: 4, candidates: 1 },
      matchCount: 1,
      terms: [
        {
          key: 'save',
          collection: 'app',
          base: 'Save',
          matchedTerm: 'save',
          score: 1,
          translations: { fr: 'Enregistrer' },
          status: { fr: 'verified' },
        },
      ],
    });
    expect(glossary).not.toHaveProperty('readProblems');
    expect(warnings).toEqual([]);
  });

  it('uses a collection baseLocale and locales override instead of the global settings', () => {
    vi.mocked(readCollection).mockReturnValue({
      resources: [
        stored(
          'save',
          'Enregistrer',
          { fr: 'Enregistrer', es: 'Guardar', en: 'Save' },
          { fr: 'verified', es: 'verified', en: 'verified' },
        ),
      ],
      problems: [],
      warnings: [],
    });
    const result = buildGlossary([open('frenchBase')], 'Enregistrer');
    expect(result.baseLocale).toBe('fr');
    expect(result.locales).toEqual(['es']);
    expect(result.terms[0]?.translations).toEqual({ es: 'Guardar' });
  });

  it('uses each collection target list when base locales agree', () => {
    vi.mocked(readCollection).mockImplementation((collection) => ({
      resources: [
        collection.translationsFolder.endsWith('spanish')
          ? stored(
              'settings',
              'Settings',
              { fr: 'Paramètres', es: 'Configuración' },
              { fr: 'verified', es: 'verified' },
            )
          : stored('save', 'Save', { fr: 'Enregistrer', es: 'Guardar' }, { fr: 'verified', es: 'verified' }),
      ],
      problems: [],
      warnings: [],
    }));
    const result = buildGlossary([open('app'), open('spanish')], 'Save Settings');
    expect(result.locales).toEqual(['fr', 'es']);
    expect(result.terms.find((term) => term.collection === 'app')?.translations).toEqual({ fr: 'Enregistrer' });
    expect(result.terms.find((term) => term.collection === 'spanish')?.translations).toEqual({ es: 'Configuración' });
  });

  it('passes explicit locales through while excluding the base locale', () => {
    vi.mocked(readCollection).mockReturnValue({
      resources: [stored('save', 'Save', { fr: 'Enregistrer' }, { fr: 'verified' })],
      problems: [],
      warnings: [],
    });
    const result = buildGlossary([open('app')], 'Save', { locales: ['xx', 'fr', 'en'] });
    expect(result.locales).toEqual(['xx', 'fr']);
    expect(result.terms[0]?.translations).toEqual({ fr: 'Enregistrer' });
  });

  it('includes an unconfigured stored translation when explicitly requested', () => {
    vi.mocked(readCollection).mockReturnValue({
      resources: [stored('save', 'Save', { de: 'Speichern' }, { de: 'new' })],
      problems: [],
      warnings: [],
    });
    const result = buildGlossary([open('app')], 'Save', { locales: ['de'], includeAll: true });
    expect(result.locales).toEqual(['de']);
    expect(result.terms[0]?.translations).toEqual({ de: 'Speichern' });
    expect(result.matchCount).toBe(1);
  });

  it('rejects an empty collection set with a clear typed error', () => {
    vi.mocked(readCollection).mockClear();
    expect(() => buildGlossary([], 'Save')).toThrow(GlossaryNoCollectionsError);
    expect(() => buildGlossary([], 'Save')).toThrow('Cannot build a glossary without collections.');
    expect(readCollection).not.toHaveBeenCalled();
  });

  it('refuses collections with different base locales before reading', () => {
    vi.mocked(readCollection).mockClear();
    expect(() => buildGlossary([open('app'), open('frenchBase')], 'Save')).toThrow(CollectionBaseLocaleMismatchError);
    expect(readCollection).not.toHaveBeenCalled();
  });

  it('returns unreadable folders as warnings while keeping readable entries', () => {
    vi.mocked(readCollection).mockReturnValue({
      resources: [stored('save', 'Save', { fr: 'Enregistrer' }, { fr: 'verified' })],
      problems: [{ kind: 'unreadable', folderPath: 'bad', absolutePath: '/project/app/bad', message: 'bad JSON' }],
      warnings: ["Collection 'app': Skipped unreadable folder 'bad': bad JSON"],
    });
    const result = buildGlossary([open('app')], 'Save');
    expect(result.matchCount).toBe(1);
    expect(result.warnings).toEqual(["Collection 'app': Skipped unreadable folder 'bad': bad JSON"]);
    expect(result).not.toHaveProperty('readProblems');
  });

  it('filters new and stale translations unless includeAll is set', () => {
    vi.mocked(readCollection).mockReturnValue({
      resources: [stored('save', 'Save', { fr: 'Enregistrer' }, { fr: 'stale' })],
      problems: [],
      warnings: [],
    });
    expect(buildGlossary([open('app')], 'Save').matchCount).toBe(0);
    expect(buildGlossary([open('app')], 'Save', { includeAll: true }).matchCount).toBe(1);
  });

  it('treats null metadata as no status', () => {
    const resource = stored('save', 'Save', { fr: 'Enregistrer' }, {});
    const withNull: StoredResource = { ...resource, entry: { ...resource.entry, metadata: JSON.parse('{"fr":null}') } };
    vi.mocked(readCollection).mockReturnValue({ resources: [withNull], problems: [], warnings: [] });
    expect(buildGlossary([open('app')], 'Save', { includeAll: true }).matchCount).toBe(1);
  });

  it('accepts an injected extractor and types unavailable modes', () => {
    vi.mocked(readCollection).mockReturnValue({
      resources: [stored('save', 'Save', { fr: 'Enregistrer' }, { fr: 'verified' })],
      problems: [],
      warnings: [],
    });
    expect(buildGlossary([open('app')], 'irrelevant', { extractor: () => [{ term: 'save' }] }).matchCount).toBe(1);
    expect(() => buildGlossary([open('app')], 'Save', { extractor: 'ai' })).toThrow(GlossaryExtractorError);
  });
});
