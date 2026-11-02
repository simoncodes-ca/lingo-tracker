import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LingoTrackerConfig } from '../config/lingo-tracker-config';
import { CONFIG_FILENAME } from '../constants';
import { loadConfig } from '../lib/config/config-file-operations';
import { CollectionAlreadyExistsError, ConfigChangedError } from '../lib/errors/lingo-tracker-error';
import { useTempDir } from '../testing/temp-dir.spec-helpers';
import { addCollection } from './add-collection';

/** The write path only; what the record contains is specified in `lib/config/collection-entry.spec.ts`. */
describe('addCollection', () => {
  const tempDir = useTempDir();

  const config: LingoTrackerConfig = {
    exportFolder: 'dist/lingo-export',
    importFolder: 'dist/lingo-import',
    baseLocale: 'en',
    locales: ['en'],
    collections: { existing: { translationsFolder: './existing' } },
  };

  const readConfig = (): LingoTrackerConfig => JSON.parse(readFileSync(join(tempDir(), CONFIG_FILENAME), 'utf8'));

  it('writes the minimal record next to the existing collections', () => {
    writeFileSync(join(tempDir(), CONFIG_FILENAME), JSON.stringify(config));

    const result = addCollection({ projectRoot: tempDir(), sourceConfig: loadConfig({ cwd: tempDir() }) }, 'admin', {
      translationsFolder: '  ./admin  ',
      baseLocale: 'en',
      locales: ['en'],
      tags: ['Team X'],
    });

    expect(result.message).toBe('Collection "admin" added successfully');
    expect(readConfig()).toEqual({
      ...config,
      collections: {
        existing: { translationsFolder: './existing' },
        admin: { translationsFolder: './admin', tags: ['team-x'] },
      },
    });
  });

  it('reports one reindex for the normalized translations folder after writing config', () => {
    writeFileSync(join(tempDir(), CONFIG_FILENAME), JSON.stringify(config));
    const onMutation = vi.fn(() =>
      expect(readConfig().collections['admin']).toEqual({ translationsFolder: './admin' }),
    );

    addCollection(
      { ...{ projectRoot: tempDir(), sourceConfig: loadConfig({ cwd: tempDir() }) }, onMutation },
      'admin',
      { translationsFolder: '  ./admin  ' },
      {},
    );

    expect(onMutation).toHaveBeenCalledTimes(1);
    expect(onMutation).toHaveBeenCalledWith({
      kind: 'reindex',
      translationsFolder: join(tempDir(), 'admin'),
    });
  });

  it('does not report a mutation when registration fails', () => {
    writeFileSync(join(tempDir(), CONFIG_FILENAME), JSON.stringify(config));
    const onMutation = vi.fn();
    expect(() =>
      addCollection(
        { ...{ projectRoot: tempDir(), sourceConfig: loadConfig({ cwd: tempDir() }) }, onMutation },
        'existing',
        { translationsFolder: './new' },
        {},
      ),
    ).toThrow(CollectionAlreadyExistsError);
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('leaves the file untouched when the name is taken', () => {
    const written = JSON.stringify(config);
    writeFileSync(join(tempDir(), CONFIG_FILENAME), written);

    expect(() =>
      addCollection({ projectRoot: tempDir(), sourceConfig: loadConfig({ cwd: tempDir() }) }, 'existing', {
        translationsFolder: './new',
      }),
    ).toThrow(CollectionAlreadyExistsError);
    expect(readFileSync(join(tempDir(), CONFIG_FILENAME), 'utf8')).toBe(written);
  });

  it('refuses a stale project and keeps the other writer’s bytes', () => {
    writeFileSync(join(tempDir(), CONFIG_FILENAME), JSON.stringify(config));
    const project = { projectRoot: tempDir(), sourceConfig: loadConfig({ cwd: tempDir() }) };
    const other = `${JSON.stringify(config)}\n`;
    writeFileSync(join(tempDir(), CONFIG_FILENAME), other);
    expect(() => addCollection(project, 'admin', { translationsFolder: './admin' })).toThrow(ConfigChangedError);
    expect(readFileSync(join(tempDir(), CONFIG_FILENAME), 'utf8')).toBe(other);
  });
});
