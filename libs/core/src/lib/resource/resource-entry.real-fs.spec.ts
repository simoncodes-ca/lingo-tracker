import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { ResourceAlreadyExistsError, ResourceNotFoundError, TranslationError } from '../errors/lingo-tracker-error';
import { InMemoryTranslationProvider } from '../machine-translation/in-memory-translation-provider';
import { calculateChecksum } from './checksum';
import { pruneEmptiedFolders } from './folder-pruning';
import { addResource, editResource, removeEntry } from './resource-entry';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from './resource-folder';
import type { ResourceMutation } from './resource-mutation';

describe('entry writes (real fs)', () => {
  const root = useTempDir('entry-write-');
  const collection = () => testCollection(root());
  const automatic = () =>
    testCollection(root(), {
      translationConfig: { enabled: true, provider: 'google-translate', apiKeyEnv: 'ENTRY_WRITE_TEST_KEY' },
    });
  const folder = () => openUnreportedResourceFolder(join(root(), 'buttons'), collection());
  const seed = () =>
    seedResources(collection(), {
      'buttons.ok': { source: 'OK', translations: { fr: { value: 'OK', status: 'new' }, es: 'Aceptar' } },
      'buttons.keep': { source: 'Keep' },
    });

  it('admits dotted ICU values on add and edit for a Transloco collection', async () => {
    const plain = { ...collection(), runtime: 'transloco' as const };
    await addResource(
      plain,
      {
        key: 'buttons.greeting',
        baseValue: 'Hello {user.name}',
        translations: [{ locale: 'fr', value: 'Bonjour {user.name}' }],
      },
      {},
    );
    expect(folder().get('greeting')?.entry).toMatchObject({
      source: 'Hello {user.name}',
      fr: 'Bonjour {user.name}',
    });
    await editResource(
      plain,
      'buttons.greeting',
      {
        baseValue: 'Welcome {user.name}',
        translations: { fr: { value: 'Bienvenue {user.name}' } },
      },
      {},
    );
    expect(folder().get('greeting')?.entry).toMatchObject({
      source: 'Welcome {user.name}',
      fr: 'Bienvenue {user.name}',
    });
  });

  it('adds ICU values, inferred and explicit statuses, details, and the exact saved upsert', async () => {
    const mutations: ResourceMutation[] = [];
    const result = await addResource(
      { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
      {
        key: 'buttons.ok',
        baseValue: 'Hello {{ name }}',
        comment: 'Greeting',
        tags: [' UI ', 'UI'],
        translations: [{ locale: 'fr', value: 'Bonjour {{ name }}', status: 'verified' }],
      },
      {},
    );
    const stored = folder().treeEntry('ok');
    expect(stored).toBeDefined();
    expect(result.created).toBe(true);
    expect(stored).toMatchObject({
      source: 'Hello {name}',
      comment: 'Greeting',
      tags: ['ui'],
      translations: { fr: 'Bonjour {name}', es: 'Hello {name}' },
    });
    expect(stored?.metadata).toEqual({
      en: { checksum: calculateChecksum('Hello {name}') },
      fr: {
        checksum: calculateChecksum('Bonjour {name}'),
        baseChecksum: calculateChecksum('Hello {name}'),
        status: 'verified',
      },
      es: {
        checksum: calculateChecksum('Hello {name}'),
        baseChecksum: calculateChecksum('Hello {name}'),
        status: 'new',
      },
    });
    expect(mutations).toEqual([{ kind: 'upsert', translationsFolder: root(), key: 'buttons.ok', entry: stored }]);
    expect(result.translations).toEqual([
      { locale: 'fr', value: 'Bonjour {name}', status: 'verified' },
      { locale: 'es', value: 'Hello {name}', status: 'new' },
    ]);
  });

  it('refuses an existing add before provider work and replaces only when requested', async () => {
    seed();
    const provider = new InMemoryTranslationProvider();
    const changes = { baseValue: 'Replace' };
    await expect(addResource(automatic(), { key: 'buttons.ok', ...changes }, { provider })).rejects.toThrow(
      ResourceAlreadyExistsError,
    );
    expect(provider.calls).toEqual([]);
    const result = await addResource(collection(), { key: 'buttons.ok', ...changes }, { onExisting: 'replace' });
    expect(result.created).toBe(false);
    expect(folder().treeEntry('ok')?.translations).toEqual({ fr: 'Replace', es: 'Replace' });
    expect(folder().keys()).toEqual(['ok', 'keep']);
  });

  it('leaves an add unwritten on provider failure and detects a late existence conflict', async () => {
    const changes = { baseValue: 'OK' };
    const failure = new TranslationError('FAILED', 'provider failed', false);
    await expect(
      addResource(
        automatic(),
        { key: 'buttons.ok', ...changes },
        {
          provider: new InMemoryTranslationProvider(() => {
            throw failure;
          }),
        },
      ),
    ).rejects.toBe(failure);
    expect(existsSync(join(root(), 'buttons'))).toBe(false);
    await expect(
      addResource(
        automatic(),
        { key: 'buttons.ok', ...changes },
        {
          provider: new InMemoryTranslationProvider(() => {
            seedResources(collection(), { 'buttons.ok': { source: 'Late' } });
            return 'Translated';
          }),
        },
      ),
    ).rejects.toThrow(ResourceAlreadyExistsError);
    expect(folder().get('ok')?.entry.source).toBe('Late');
  });

  it('returns no changes and preserves both files and the sink for an unchanged edit', async () => {
    seed();
    const files = ['resource_entries.json', 'tracker_meta.json'].map((name) => join(root(), 'buttons', name));
    const before = files.map((file) => readFileSync(file, 'utf8'));
    const mutations: ResourceMutation[] = [];
    expect(
      await editResource(
        { ...collection(), onMutation: (mutation) => mutations.push(mutation) ?? collection().onMutation },
        'buttons.ok',
        { baseValue: 'OK' },
        {},
      ),
    ).toEqual({
      resolvedKey: 'buttons.ok',
      updated: false,
      message: 'No changes detected',
    });
    expect(files.map((file) => readFileSync(file, 'utf8'))).toEqual(before);
    expect(mutations).toEqual([]);
  });

  it('applies staleness, seeds copies, and changes an unchanged translation status', async () => {
    seed();
    const result = await editResource(collection(), 'buttons.ok', {
      baseValue: 'Save',
      translations: { es: { value: 'Aceptar', status: 'verified' } },
    });
    expect(result.entry?.translations).toEqual({ fr: 'Save', es: 'Aceptar' });
    expect(result.entry?.metadata['fr'].status).toBe('new');
    expect(result.entry?.metadata['es'].status).toBe('verified');
    expect(result.entry?.metadata['fr'].baseChecksum).toBe(calculateChecksum('Save'));
    expect(folder().treeEntry('ok')).toEqual(result.entry);
  });

  it('saves phase one and its mutation before translation and keeps them on provider failure', async () => {
    seed();
    const mutations: ResourceMutation[] = [];
    const failure = new TranslationError('FAILED', 'provider failed', false);
    await expect(
      editResource(
        { ...automatic(), onMutation: (mutation) => mutations.push(mutation) ?? automatic().onMutation },
        'buttons.ok',
        { baseValue: 'Save' },
        {
          provider: new InMemoryTranslationProvider(() => {
            expect(folder().get('ok')?.entry.source).toBe('Save');
            expect(mutations.map(({ kind }) => kind)).toEqual(['upsert']);
            throw failure;
          }),
        },
      ),
    ).rejects.toBe(failure);
    expect(folder().get('ok')?.entry.source).toBe('Save');
    expect(folder().get('ok')?.meta?.['es'].status).toBe('stale');
  });

  it('keeps concurrent target edits and siblings while reporting ordered skips and fresh mutations', async () => {
    seed();
    const mutations: ResourceMutation[] = [];
    const result = await editResource(
      { ...automatic(), onMutation: (mutation) => mutations.push(mutation) ?? automatic().onMutation },
      'buttons.ok',
      { baseValue: 'Save' },
      {
        provider: new InMemoryTranslationProvider(({ targetLocale }) => {
          if (targetLocale === 'fr') {
            const current = folder();
            current.setTranslation('ok', 'fr', 'Manual', 'verified');
            current.setBase('sibling', 'Sibling');
            current.save();
          }
          return `Translated ${targetLocale}`;
        }),
      },
    );
    expect(result.skippedLocales).toEqual(['fr']);
    expect(result.entry?.translations).toEqual({ fr: 'Manual', es: 'Translated es' });
    expect(folder().has('sibling')).toBe(true);
    expect(mutations.map(({ kind }) => kind)).toEqual(['upsert', 'upsert']);
    expect(mutations[1]).toEqual({
      kind: 'upsert',
      translationsFolder: root(),
      key: 'buttons.ok',
      entry: result.entry,
    });
  });

  it('does not resurrect an entry deleted during translation', async () => {
    seed();
    await expect(
      editResource(
        automatic(),
        'buttons.ok',
        { baseValue: 'Save' },
        {
          provider: new InMemoryTranslationProvider(() => {
            const current = folder();
            current.remove('ok');
            current.save();
            return 'Translated';
          }),
        },
      ),
    ).rejects.toThrow(ResourceNotFoundError);
    expect(folder().has('ok')).toBe(false);
    expect(folder().has('keep')).toBe(true);
  });

  it('reports an emptied removal without pruning and uses the explicit sink over the default', () => {
    seedResources(collection(), { 'nested.child.ok': { source: 'OK' } });
    const inherited: ResourceMutation[] = [];
    const explicit: ResourceMutation[] = [];
    const result = removeEntry(
      {
        ...testCollection(root(), { onMutation: (mutation) => inherited.push(mutation) }),
        onMutation: (mutation) =>
          explicit.push(mutation) ??
          testCollection(root(), { onMutation: (mutation) => inherited.push(mutation) }).onMutation,
      },
      'nested.child.ok',
    );
    expect(result).toEqual({ resolvedKey: 'nested.child.ok', emptied: join(root(), 'nested', 'child') });
    expect(existsSync(join(root(), 'nested', 'child'))).toBe(true);
    expect(existsSync(join(root(), 'nested', 'child', 'resource_entries.json'))).toBe(false);
    expect(inherited).toEqual([]);
    expect(explicit).toEqual([{ kind: 'remove', translationsFolder: root(), key: 'nested.child.ok' }]);
    pruneEmptiedFolders(
      { ...collection(), onMutation: (mutation) => explicit.push(mutation) ?? collection().onMutation },
      result.emptied ? [result.emptied] : [],
      {},
    );
    expect(explicit.map(({ kind }) => kind)).toEqual(['remove', 'remove-folder', 'remove-folder']);
  });

  it('moves a saved edit and prunes after remove/upsert mutations', async () => {
    seedResources(collection(), { 'nested.child.ok': { source: 'OK' } });
    const mutations: ResourceMutation[] = [];
    const result = await editResource(
      testCollection(root(), { onMutation: (mutation) => mutations.push(mutation) }),
      'nested.child.ok',
      { comment: 'Context', moveTo: 'shared' },
    );
    expect(result.resolvedKey).toBe('shared.ok');
    expect(result.entry?.comment).toBe('Context');
    expect(existsSync(join(root(), 'nested'))).toBe(false);
    expect(mutations.map(({ kind }) => kind)).toEqual(['upsert', 'remove', 'upsert', 'remove-folder', 'remove-folder']);
  });
  it('returns advisory terminology under the final key after an edit moves the entry', async () => {
    seed();
    writeFileSync(
      collection().termFiles.preferredTerminology.path,
      JSON.stringify([{ discouraged: 'Expenditure', preferred: 'Investment', reason: 'Finance style guide' }]),
    );
    const result = await editResource(collection(), 'buttons.ok', {
      baseValue: 'Capital expenditure',
      moveTo: 'budget',
    });
    expect(result.terminology).toEqual({
      findings: [
        {
          key: 'budget.ok',
          discouraged: 'Expenditure',
          preferred: 'Investment',
          reason: 'Finance style guide',
          message: 'consider "Investment" instead of "Expenditure"',
        },
      ],
      problems: [],
    });
    expect(result.entry?.source).toBe('Capital expenditure');
  });
});
