import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { seedResources, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { openCollection } from '../config/open-collection';
import { writeJsonFile } from '../file-io/json-file-operations';
import { executeMove } from './execute-move';
import { planMove } from './move-plan';
import { relocateEntries } from './relocate-entries';
import type { ResourceMutation } from './resource-mutation';

vi.mock('../file-io/json-file-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../file-io/json-file-operations')>();
  return { ...actual, writeJsonFile: vi.fn(actual.writeJsonFile) };
});

describe('cross-collection mutation sinks (real fs)', () => {
  const root = useTempDir('move-sinks-');
  const setup = () => {
    const config: LingoTrackerConfig = {
      exportFolder: 'dist',
      importFolder: 'import',
      baseLocale: 'en',
      locales: ['en'],
      collections: { source: { translationsFolder: 'source' }, destination: { translationsFolder: 'destination' } },
    };
    const sourceMutations: ResourceMutation[] = [];
    const destinationMutations: ResourceMutation[] = [];
    const source = openCollection(config, 'source', {
      cwd: root(),
      onMutation: (mutation) => sourceMutations.push(mutation),
    });
    const destination = openCollection(config, 'destination', {
      cwd: root(),
      onMutation: (mutation) => destinationMutations.push(mutation),
    });
    seedResources(source, { 'old.ok': { source: 'OK' } });
    const plan = planMove({
      source,
      destination,
      selection: { kind: 'key', key: 'old.ok' },
      destinationPath: 'new.ok',
    });
    if (plan.kind !== 'entries') throw new Error('Expected entry move plan');
    return { source, destination, sourceMutations, destinationMutations, plan };
  };

  it('delivers removals and pruning to the source and upserts to the destination', () => {
    const { source, destination, sourceMutations, destinationMutations, plan } = setup();
    expect(relocateEntries(plan).errors).toEqual([]);
    expect(sourceMutations).toEqual([
      { kind: 'remove', translationsFolder: source.translationsFolder, key: 'old.ok' },
      { kind: 'remove-folder', translationsFolder: source.translationsFolder, path: 'old' },
    ]);
    expect(destinationMutations).toEqual([
      expect.objectContaining({ kind: 'upsert', translationsFolder: destination.translationsFolder, key: 'new.ok' }),
    ]);
  });

  it('sends all successful mutations to an explicit override in the existing order', () => {
    const { source, destination, sourceMutations, destinationMutations, plan } = setup();
    const mutations: ResourceMutation[] = [];
    relocateEntries(
      {
        ...plan,
        source: { ...plan.source, onMutation: (mutation) => mutations.push(mutation) ?? plan.source.onMutation },
        destination: {
          ...plan.destination,
          onMutation: (mutation) => mutations.push(mutation) ?? plan.destination.onMutation,
        },
      },
      {},
    );
    expect(sourceMutations).toEqual([]);
    expect(destinationMutations).toEqual([]);
    expect(mutations).toEqual([
      { kind: 'remove', translationsFolder: source.translationsFolder, key: 'old.ok' },
      expect.objectContaining({ kind: 'upsert', translationsFolder: destination.translationsFolder, key: 'new.ok' }),
      { kind: 'remove-folder', translationsFolder: source.translationsFolder, path: 'old' },
    ]);
  });

  it('delivers failure reindexes to each collection sink', () => {
    const { source, destination, sourceMutations, destinationMutations, plan } = setup();
    vi.mocked(writeJsonFile).mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    expect(relocateEntries(plan).errors).toEqual(['Failed to write the move: write failed']);
    expect(destinationMutations).toEqual([{ kind: 'reindex', translationsFolder: destination.translationsFolder }]);
    expect(sourceMutations).toEqual([{ kind: 'reindex', translationsFolder: source.translationsFolder }]);
  });

  it('sends failure reindexes to an override, destination before source', () => {
    const { source, destination, sourceMutations, destinationMutations, plan } = setup();
    const mutations: ResourceMutation[] = [];
    vi.mocked(writeJsonFile).mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    relocateEntries(
      {
        ...plan,
        source: { ...plan.source, onMutation: (mutation) => mutations.push(mutation) ?? plan.source.onMutation },
        destination: {
          ...plan.destination,
          onMutation: (mutation) => mutations.push(mutation) ?? plan.destination.onMutation,
        },
      },
      {},
    );
    expect(mutations).toEqual([
      { kind: 'reindex', translationsFolder: destination.translationsFolder },
      { kind: 'reindex', translationsFolder: source.translationsFolder },
    ]);
    expect(sourceMutations).toEqual([]);
    expect(destinationMutations).toEqual([]);
  });

  it('opens move destinations from the source project snapshot and inherits its sink', () => {
    const { source, sourceMutations, destinationMutations } = setup();
    expect(
      executeMove(source, { source: 'old.ok', destination: 'new.ok', toCollection: 'destination' }).movedCount,
    ).toBe(1);
    expect(sourceMutations).toEqual([
      { kind: 'remove', translationsFolder: source.translationsFolder, key: 'old.ok' },
      expect.objectContaining({ kind: 'upsert', translationsFolder: join(root(), 'destination'), key: 'new.ok' }),
      { kind: 'remove-folder', translationsFolder: source.translationsFolder, path: 'old' },
    ]);
    expect(destinationMutations).toEqual([]);
  });
});
