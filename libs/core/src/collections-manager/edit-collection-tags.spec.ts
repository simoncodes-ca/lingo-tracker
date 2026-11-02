import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_FILENAME } from '../constants';
import { loadConfig } from '../lib/config/config-file-operations';
import { openCollection } from '../lib/config/open-collection';
import { ConfigChangedError, InvalidCollectionError } from '../lib/errors/lingo-tracker-error';
import { editCollectionTags } from './edit-collection-tags';

describe('editCollectionTags', () => {
  let cwd: string;
  const read = (): string => readFileSync(join(cwd, CONFIG_FILENAME), 'utf8');
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'tags-'));
    writeFileSync(
      join(cwd, CONFIG_FILENAME),
      JSON.stringify({
        baseLocale: 'en',
        locales: ['en'],
        collections: { app: { translationsFolder: './app', tags: ['existing-tag'] } },
      }),
    );
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  const edit = (changes: Parameters<typeof editCollectionTags>[1]): Promise<string[]> => {
    const collection = openCollection(loadConfig({ cwd }), 'app', { cwd });
    return editCollectionTags(collection, changes);
  };

  it('normalizes added tags and removes existing tags', async () => {
    expect(await edit({ add: ['New Feature'], remove: ['existing-tag'] })).toEqual(['new-feature']);
    expect(JSON.parse(read()).collections.app.tags).toEqual(['new-feature']);
  });

  it('set replaces and empty set clears tags', async () => {
    expect(await edit({ set: ['Alpha', 'beta', 'Alpha'] })).toEqual(['alpha', 'beta']);
    expect(await edit({ set: [] })).toEqual([]);
    expect(JSON.parse(read()).collections.app.tags).toBeUndefined();
  });

  it('refuses mixed set and add without writing', async () => {
    const before = read();
    let thrown: unknown;
    try {
      await edit({ set: ['foo'], add: ['bar'] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidCollectionError);
    expect((thrown as InvalidCollectionError).kind).toBe('invalid');
    expect((thrown as InvalidCollectionError).problem).toBe('tag-conflict');
    expect(read()).toBe(before);
  });

  it('refuses a stale collection and keeps the other writer’s bytes', async () => {
    const collection = openCollection(loadConfig({ cwd }), 'app', { cwd });
    const other = `${read()}\n`;
    writeFileSync(join(cwd, CONFIG_FILENAME), other);
    const onMutation = vi.fn();
    await expect(
      editCollectionTags({ ...collection, onMutation: onMutation ?? collection.onMutation }, { add: ['new'] }),
    ).rejects.toThrow(ConfigChangedError);
    expect(onMutation).not.toHaveBeenCalled();
    expect(read()).toBe(other);
  });

  it('refuses an empty edit without writing', async () => {
    const before = read();
    let thrown: unknown;
    try {
      await edit({});
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(InvalidCollectionError);
    expect((thrown as InvalidCollectionError).problem).toBe('tag-missing');
    expect(read()).toBe(before);
  });

  it('reindexes a changed registration once and allows read-only tag edits', async () => {
    const config = loadConfig({ cwd });
    config.collections['app'].readOnly = true;
    writeFileSync(join(cwd, CONFIG_FILENAME), JSON.stringify(config));
    const onMutation = vi.fn();
    const collection = openCollection(loadConfig({ cwd }), 'app', { cwd });
    await expect(
      editCollectionTags({ ...collection, onMutation: onMutation ?? collection.onMutation }, { set: ['New'] }),
    ).resolves.toEqual(['new']);
    expect(onMutation.mock.calls).toEqual([[{ kind: 'reindex', translationsFolder: join(cwd, 'app') }]]);
  });

  it('refuses invalid tag list shapes before writes or reindexing', async () => {
    const before = read();
    const onMutation = vi.fn();
    const collection = openCollection(loadConfig({ cwd }), 'app', { cwd });
    const edit = { add: [42] } as unknown as Parameters<typeof editCollectionTags>[1];
    await expect(
      editCollectionTags({ ...collection, onMutation: onMutation ?? collection.onMutation }, edit),
    ).rejects.toThrow(InvalidCollectionError);
    expect(read()).toBe(before);
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('does not reindex an unchanged tag registration', async () => {
    const onMutation = vi.fn();
    const collection = openCollection(loadConfig({ cwd }), 'app', { cwd });
    await expect(
      editCollectionTags({ ...collection, onMutation: onMutation ?? collection.onMutation }, { add: ['existing-tag'] }),
    ).resolves.toEqual(['existing-tag']);
    expect(onMutation).not.toHaveBeenCalled();
  });
});
