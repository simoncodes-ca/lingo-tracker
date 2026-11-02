import { editCollectionTags, loadConfig } from '@simoncodes-ca/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidCollectionError } from '@simoncodes-ca/core/testing';
import { createCli } from '../program';
import { editCollectionCommand } from './edit-collection';

vi.mock('@simoncodes-ca/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simoncodes-ca/core')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
    editCollectionTags: vi.fn(),
  };
});

const mockEditCollectionTags = vi.mocked(editCollectionTags);

async function runCli(...args: string[]): Promise<void> {
  await createCli().parseAsync(['edit-collection', 'myApp', ...args], { from: 'user' });
}

describe('editCollectionCommand', () => {
  const mockConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
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
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockReturnValue(mockConfig);
    mockEditCollectionTags.mockResolvedValue(['existing-tag', 'new-feature']);
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('passes a trimmed --set-tags comma list to core', async () => {
    await runCli('--set-tags', 'a, b');
    expect(mockEditCollectionTags).toHaveBeenCalledWith(expect.objectContaining({ name: 'myApp' }), {
      add: [],
      remove: [],
      set: ['a', 'b'],
    });
    expect(process.exitCode).toBe(0);
  });

  it('passes an explicitly empty --set-tags list through the real registration', async () => {
    await runCli('--set-tags', '');
    expect(mockEditCollectionTags).toHaveBeenCalledWith(expect.objectContaining({ name: 'myApp' }), {
      add: [],
      remove: [],
      set: [],
    });
    expect(process.exitCode).toBe(0);
  });

  it('passes the stored collection with the new tags and the project root', async () => {
    await editCollectionCommand({ name: 'myApp', addTag: ['new-feature'] });

    expect(mockEditCollectionTags).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'myApp', sourceConfig: mockConfig, projectRoot: '/test/project' }),
      { add: ['new-feature'], remove: [], set: undefined },
    );
    expect(console.log).toHaveBeenCalledWith('✅ Collection "myApp" tags updated: existing-tag, new-feature');
    expect(process.exitCode).toBe(0);
  });

  it('adds a new tag to the collection', async () => {
    await editCollectionCommand({ name: 'myApp', addTag: ['new-feature'] });

    expect(mockEditCollectionTags).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'myApp', sourceConfig: mockConfig, projectRoot: '/test/project' }),
      { add: ['new-feature'], remove: [], set: undefined },
    );
    expect(console.log).toHaveBeenCalledWith('✅ Collection "myApp" tags updated: existing-tag, new-feature');
  });

  it('passes a raw tag to core and prints the tags core returns', async () => {
    await editCollectionCommand({ name: 'myApp', addTag: ['New Feature'] });

    expect(mockEditCollectionTags).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'myApp', sourceConfig: mockConfig, projectRoot: '/test/project' }),
      { add: ['New Feature'], remove: [], set: undefined },
    );
    expect(console.log).toHaveBeenCalledWith('✅ Collection "myApp" tags updated: existing-tag, new-feature');
  });

  it('does not duplicate an already-existing tag', async () => {
    mockEditCollectionTags.mockResolvedValueOnce(['existing-tag']);
    await editCollectionCommand({ name: 'myApp', addTag: ['existing-tag'] });

    expect(mockEditCollectionTags).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'myApp', sourceConfig: mockConfig, projectRoot: '/test/project' }),
      { add: ['existing-tag'], remove: [], set: undefined },
    );
    expect(console.log).toHaveBeenCalledWith('✅ Collection "myApp" tags updated: existing-tag');
  });

  it('removes a tag from the collection', async () => {
    mockEditCollectionTags.mockResolvedValueOnce([]);
    await editCollectionCommand({ name: 'myApp', removeTag: ['existing-tag'] });

    expect(mockEditCollectionTags).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'myApp', sourceConfig: mockConfig, projectRoot: '/test/project' }),
      { add: [], remove: ['existing-tag'], set: undefined },
    );
    expect(console.log).toHaveBeenCalledWith('✅ Collection "myApp" tags cleared');
  });

  it('replaces all tags with --set-tags', async () => {
    mockEditCollectionTags.mockResolvedValueOnce(['alpha', 'beta']);
    await editCollectionCommand({ name: 'myApp', setTags: ['alpha', 'beta'] });

    expect(mockEditCollectionTags).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'myApp', sourceConfig: mockConfig, projectRoot: '/test/project' }),
      { add: [], remove: [], set: ['alpha', 'beta'] },
    );
    expect(console.log).toHaveBeenCalledWith('✅ Collection "myApp" tags updated: alpha, beta');
  });

  it('clears all tags when --set-tags is empty string', async () => {
    mockEditCollectionTags.mockResolvedValueOnce([]);
    await editCollectionCommand({ name: 'myApp', setTags: [] });

    expect(mockEditCollectionTags).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'myApp', sourceConfig: mockConfig, projectRoot: '/test/project' }),
      { add: [], remove: [], set: [] },
    );
    expect(console.log).toHaveBeenCalledWith('✅ Collection "myApp" tags cleared');
  });

  it('exits 1 when --set-tags is combined with --add-tag', async () => {
    mockEditCollectionTags.mockImplementationOnce(() => {
      throw new InvalidCollectionError('A replacement list cannot be combined with additions or removals', {
        problem: 'tag-conflict',
      });
    });
    await editCollectionCommand({ name: 'myApp', setTags: ['foo'], addTag: ['bar'] });
    expect(mockEditCollectionTags).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith('❌ --set-tags cannot be combined with --add-tag or --remove-tag');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when --set-tags is combined with --remove-tag', async () => {
    mockEditCollectionTags.mockImplementationOnce(() => {
      throw new InvalidCollectionError('A replacement list cannot be combined with additions or removals', {
        problem: 'tag-conflict',
      });
    });
    await editCollectionCommand({ name: 'myApp', setTags: ['foo'], removeTag: ['existing-tag'] });
    expect(mockEditCollectionTags).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith('❌ --set-tags cannot be combined with --add-tag or --remove-tag');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when no options provided', async () => {
    mockEditCollectionTags.mockImplementationOnce(() => {
      throw new InvalidCollectionError('A tag edit needs a replacement, addition, or removal', {
        problem: 'tag-missing',
      });
    });
    await editCollectionCommand({ name: 'myApp' });
    expect(mockEditCollectionTags).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith('❌ Provide at least one of --add-tag, --remove-tag, or --set-tags');
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when collection is not found', async () => {
    await editCollectionCommand({ name: 'nonexistent', addTag: ['foo'] });
    expect(mockEditCollectionTags).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('❌ Collection "nonexistent" not found');
    expect(process.exitCode).toBe(1);
  });

  it('prints a typed core tag error and exits 1', async () => {
    mockEditCollectionTags.mockImplementationOnce(() => {
      throw new InvalidCollectionError('A tag edit needs a replacement, addition, or removal');
    });

    await editCollectionCommand({ name: 'myApp', addTag: ['beta'] });

    expect(mockEditCollectionTags).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'myApp', sourceConfig: mockConfig, projectRoot: '/test/project' }),
      { add: ['beta'], remove: [], set: undefined },
    );
    expect(console.error).toHaveBeenCalledWith('❌ A tag edit needs a replacement, addition, or removal');
    expect(process.exitCode).toBe(1);
  });
});
