import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { editCollectionCommand } from './edit-collection';
import { updateCollection } from '@simoncodes-ca/core';

vi.mock('node:fs');
vi.mock('@simoncodes-ca/core', async () => {
  const actual = await vi.importActual('@simoncodes-ca/core');
  return {
    ...actual,
    updateCollection: vi.fn().mockResolvedValue({ message: 'updated' }),
  };
});

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockUpdateCollection = vi.mocked(updateCollection);

describe('editCollectionCommand', () => {
  const mockConfig = {
    baseLocale: 'en',
    locales: ['en', 'fr'],
    collections: {
      myApp: {
        translationsFolder: './src/i18n',
        tags: ['existing-tag'],
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INIT_CWD = '/test/project';
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
    vi.mocked(writeFileSync).mockImplementation(() => undefined);
  });

  it('adds a new tag to the collection', async () => {
    await editCollectionCommand('myApp', { addTag: ['new-feature'] });

    expect(mockUpdateCollection).toHaveBeenCalledOnce();
    const [, , collectionArg] = mockUpdateCollection.mock.calls[0];
    expect(collectionArg.tags).toContain('existing-tag');
    expect(collectionArg.tags).toContain('new-feature');
  });

  it('normalizes tags on add', async () => {
    await editCollectionCommand('myApp', { addTag: ['New Feature'] });

    const [, , collectionArg] = mockUpdateCollection.mock.calls[0];
    expect(collectionArg.tags).toContain('new-feature');
    expect(collectionArg.tags).not.toContain('New Feature');
  });

  it('does not duplicate an already-existing tag', async () => {
    await editCollectionCommand('myApp', { addTag: ['existing-tag'] });

    const [, , collectionArg] = mockUpdateCollection.mock.calls[0];
    const count = (collectionArg.tags ?? []).filter((t: string) => t === 'existing-tag').length;
    expect(count).toBe(1);
  });

  it('removes a tag from the collection', async () => {
    await editCollectionCommand('myApp', { removeTag: ['existing-tag'] });

    const [, , collectionArg] = mockUpdateCollection.mock.calls[0];
    expect(collectionArg.tags).not.toContain('existing-tag');
  });

  it('replaces all tags with --set-tags', async () => {
    await editCollectionCommand('myApp', { setTags: 'alpha, beta' });

    const [, , collectionArg] = mockUpdateCollection.mock.calls[0];
    expect(collectionArg.tags).toEqual(['alpha', 'beta']);
  });

  it('clears all tags when --set-tags is empty string', async () => {
    await editCollectionCommand('myApp', { setTags: '' });

    const [, , collectionArg] = mockUpdateCollection.mock.calls[0];
    expect(collectionArg.tags).toEqual([]);
  });

  it('exits with error when --set-tags is combined with --add-tag', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await editCollectionCommand('myApp', { setTags: 'foo', addTag: ['bar'] });
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('exits with error when --set-tags is combined with --remove-tag', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await editCollectionCommand('myApp', { setTags: 'foo', removeTag: ['existing-tag'] });
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('exits with error when no options provided', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await editCollectionCommand('myApp', {});
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('exits with error when collection is not found', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    await editCollectionCommand('nonexistent', { addTag: ['foo'] });
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});
