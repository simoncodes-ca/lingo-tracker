import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { ResourceAlreadyExistsError, TranslationError } from '../errors/lingo-tracker-error';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
import { addResource, addResources } from './resource-entry';
import type { ResourceMutation } from './resource-mutation';

describe('resource-entry prepared adds', () => {
  const root = useTempDir('prepared-add-');
  const collection = () => testCollection(root(), { locales: ['en', 'fr', 'de'] });
  const automatic = () => ({
    ...collection(),
    translationConfig: { enabled: true, provider: 'google-translate' as const, apiKeyEnv: 'KEY' },
  });

  it('normalizes the ICU base, ignores a supplied base locale, and keeps supplied values and details without writing', async () => {
    const result = await addResource(collection(), {
      key: 'common.hello',
      baseValue: 'Hello {{ name }}',
      comment: 'Greeting',
      tags: [' UI '],
      translations: [
        { locale: 'en', value: 'Ignored' },
        { locale: 'fr', value: 'Bonjour {{ name }}', status: 'verified' },
      ],
    });
    expect(result.resolvedKey).toBe('common.hello');
    expect(result).not.toHaveProperty('skippedLocales');
    expect(JSON.parse(readFileSync(join(root(), 'common', 'resource_entries.json'), 'utf8'))).toEqual({
      hello: { source: 'Hello {name}', comment: 'Greeting', tags: ['ui'], fr: 'Bonjour {name}', de: 'Hello {name}' },
    });
    const metadata = JSON.parse(readFileSync(join(root(), 'common', 'tracker_meta.json'), 'utf8'));
    expect(metadata.hello.fr).toMatchObject({ status: 'verified' });
    expect(metadata.hello.de).toMatchObject({ status: 'new' });
    expect(metadata.hello.en).not.toHaveProperty('status');
    expect(result.translations).toEqual([
      { locale: 'fr', value: 'Bonjour {name}', status: 'verified' },
      { locale: 'de', value: 'Hello {name}', status: 'new' },
    ]);
  });

  it('seeds every missing locale with a new copy of the base when auto-translation is disabled', async () => {
    const result = await addResource(collection(), { key: 'common.ok', baseValue: 'New' });
    expect(result.translations).toEqual([
      { locale: 'fr', value: 'New', status: 'new' },
      { locale: 'de', value: 'New', status: 'new' },
    ]);
    expect(JSON.parse(readFileSync(join(root(), 'common', 'resource_entries.json'), 'utf8'))).toEqual({
      ok: { source: 'New', fr: 'New', de: 'New' },
    });
    expect(JSON.parse(readFileSync(join(root(), 'common', 'tracker_meta.json'), 'utf8'))).toMatchObject({
      ok: { fr: { status: 'new' }, de: { status: 'new' } },
    });
    expect(result.terminology).toEqual({ findings: [], problems: [] });
  });

  it('auto-translates only missing locales from the ICU base and retains the result without translating again at commit', async () => {
    const provider = new InMemoryTranslationProvider(({ text, targetLocale }) => {
      expect(existsSync(join(root(), 'common', 'resource_entries.json'))).toBe(false);
      expect(existsSync(join(root(), 'common', 'tracker_meta.json'))).toBe(false);
      return `[${targetLocale}] ${text}`;
    });
    const result = await addResource(
      automatic(),
      {
        key: 'common.hello',
        baseValue: 'Hello {{ name }}',
        translations: [{ locale: 'fr', value: 'Bonjour {name}' }],
      },
      { provider },
    );
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.[0]?.targetLocale).toBe('de');
    expect(result.translations).toEqual([
      { locale: 'fr', value: 'Bonjour {name}', status: 'translated' },
      { locale: 'de', value: '[de] Hello {name}', status: 'translated' },
    ]);
    expect(result.skippedLocales).toEqual([]);
  });

  it('collects terminology findings, translator problems and skipped-locale copies once before the write', async () => {
    writeFileSync(
      collection().termFiles.preferredTerminology.path,
      JSON.stringify([{ discouraged: 'Expenditure', preferred: 'Investment' }]),
    );
    const target = {
      ...automatic(),
      termFiles: {
        ...collection().termFiles,
        protectedTerms: { path: join(root(), 'missing-terms.json'), explicit: true },
      },
    };
    const baseValue = 'Expenditure {count, plural, other {items}}';
    const provider = new InMemoryTranslationProvider(() => {
      expect(existsSync(join(root(), 'budget'))).toBe(false);
      // Commit carries the captured advice, even when the rule file changes after preparation.
      writeFileSync(collection().termFiles.preferredTerminology.path, '[]');
      return 'Translated';
    });
    // A later batch item changes the rule file after the first item's preparation.
    const result = await addResources(
      target,
      [
        { key: 'budget.one', baseValue },
        { key: 'budget.two', baseValue: 'Later' },
      ],
      {
        provider,
      },
    );
    const stored = JSON.parse(readFileSync(join(root(), 'budget', 'resource_entries.json'), 'utf8'));
    expect(stored.one).toMatchObject({ source: baseValue, fr: baseValue, de: baseValue });
    expect(result.skippedLocales).toEqual(['fr', 'de']);
    expect(result.terminology.findings).toEqual([
      {
        key: 'budget.one',
        discouraged: 'Expenditure',
        preferred: 'Investment',
        message: 'consider "Investment" instead of "Expenditure"',
      },
    ]);
    expect(result.terminology).toEqual({
      findings: [
        {
          key: 'budget.one',
          discouraged: 'Expenditure',
          preferred: 'Investment',
          message: 'consider "Investment" instead of "Expenditure"',
        },
      ],
      problems: [expect.stringContaining('missing-terms.json')],
    });
    expect(result.terminology.problems).toHaveLength(1);
    expect(result.terminology.problems[0]).toContain('missing-terms.json');
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls.flat().map(({ text }) => text)).toEqual(['Later', 'Later']);
  });

  it('leaves preparation unwritten on provider failure and refuses a late conflict without emitting a mutation', async () => {
    const failure = new TranslationError('provider failed', 'SERVER_ERROR', false);
    await expect(
      addResource(
        automatic(),
        { key: 'common.ok', baseValue: 'OK' },
        {
          provider: new InMemoryTranslationProvider(() => {
            throw failure;
          }),
        },
      ),
    ).rejects.toBe(failure);
    expect(existsSync(join(root(), 'common'))).toBe(false);
    const mutations: ResourceMutation[] = [];
    let before: Buffer | undefined;
    await expect(
      addResource(
        { ...automatic(), onMutation: (mutation) => mutations.push(mutation) ?? automatic().onMutation },
        { key: 'common.ok', baseValue: 'OK' },
        {
          provider: new InMemoryTranslationProvider(() => {
            seedResources(collection(), { 'common.ok': { source: 'Concurrent' } });
            before = readFileSync(join(root(), 'common', 'resource_entries.json'));
            return 'Translated';
          }),
        },
      ),
    ).rejects.toThrow(ResourceAlreadyExistsError);
    expect(readFileSync(join(root(), 'common', 'resource_entries.json'))).toEqual(before);
    expect(mutations).toEqual([]);
  });

  it('rechecks a late conflict on a later prepared item before writing any batch item', async () => {
    const mutations: ResourceMutation[] = [];
    let concurrentEntries: Buffer | undefined;
    let concurrentMetadata: Buffer | undefined;
    const provider = new InMemoryTranslationProvider(({ text }) => {
      expect(existsSync(join(root(), 'earlier', 'resource_entries.json'))).toBe(false);
      expect(existsSync(join(root(), 'earlier', 'tracker_meta.json'))).toBe(false);
      if (text === 'Later') {
        seedResources(collection(), { 'later.two': { source: 'Concurrent' } });
        concurrentEntries = readFileSync(join(root(), 'later', 'resource_entries.json'));
        concurrentMetadata = readFileSync(join(root(), 'later', 'tracker_meta.json'));
      }
      return 'Translated';
    });
    await expect(
      addResources(
        { ...automatic(), onMutation: (mutation) => mutations.push(mutation) ?? automatic().onMutation },
        [
          { key: 'earlier.one', baseValue: 'Earlier' },
          { key: 'later.two', baseValue: 'Later' },
        ],
        { provider },
      ),
    ).rejects.toThrow(ResourceAlreadyExistsError);
    expect(provider.calls.flat().map(({ text }) => text)).toEqual(['Earlier', 'Earlier', 'Later', 'Later']);
    expect(existsSync(join(root(), 'earlier'))).toBe(false);
    expect(readFileSync(join(root(), 'later', 'resource_entries.json'))).toEqual(concurrentEntries);
    expect(readFileSync(join(root(), 'later', 'tracker_meta.json'))).toEqual(concurrentMetadata);
    expect(mutations).toEqual([]);
  });
});
