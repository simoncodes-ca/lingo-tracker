import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addCollection } from '../../collections-manager/add-collection';
import { changeCollection } from '../../collections-manager/collection-change';
import { updateCollection } from '../../collections-manager/update-collection';
import type { LingoTrackerConfig } from '../../config/lingo-tracker-config';
import { RESOURCE_ENTRIES_FILENAME } from '../../constants';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { ConfigChangedError, CoreOperationError } from '../errors/lingo-tracker-error';
import type { ResourceEntries } from '../resource/resource-entry';
import { guardedConfigWrite, loadConfig } from './config-file-operations';
import { runConfigWriteTransaction } from './config-write-transaction';
import { openCollection } from './open-collection';
import { failure, written } from './project-terms-outcome.spec-helpers';
import { updateProjectTerms } from './update-project-terms';

describe('Config write transaction with real files', () => {
  const tempDir = useTempDir('config-transaction-');
  const setup = () => {
    const cwd = tempDir();
    const config: LingoTrackerConfig = {
      baseLocale: 'en',
      locales: ['en'],
      exportFolder: 'export',
      importFolder: 'import',
      protectedTermsFile: 'global.json',
      preferredTerminologyFile: 'preferred.json',
      collections: { app: { translationsFolder: 'i18n', protectedTermsFile: 'own.json' } },
    };
    writeFileSync(join(cwd, '.lingo-tracker.json'), `${JSON.stringify(config)}\n`);
    writeFileSync(join(cwd, 'global.json'), '["Global"]\n');
    writeFileSync(join(cwd, 'own.json'), '["Own"]\n');
    writeFileSync(join(cwd, 'preferred.json'), '[{"discouraged":"Old","preferred":"New"}]\n');
    return { projectRoot: cwd, sourceConfig: loadConfig({ cwd }) };
  };

  it('returns restoration evidence separately from a wrapped or reused error', () => {
    const path = join(tempDir(), 'terms.json');
    writeFileSync(path, '["Original"]');
    const original = new Error('write failed');
    const wrapped = new CoreOperationError('wrapped failure', { cause: original });
    const restored = runConfigWriteTransaction(
      [
        {
          path,
          write: () => {
            writeFileSync(path, 'partial');
            throw wrapped;
          },
        },
      ],
      () => true,
    );
    expect(restored).toEqual({ status: 'failed', error: wrapped, reverted: true });
    expect(readFileSync(path, 'utf8')).toBe('["Original"]');
    const refused = runConfigWriteTransaction(
      [
        {
          path,
          write: () => {
            writeFileSync(path, 'partial');
            throw wrapped;
          },
        },
      ],
      () => false,
    );
    expect(refused).toEqual({ status: 'failed', error: wrapped, reverted: false });
    expect(readFileSync(path, 'utf8')).toBe('partial');
    expect(wrapped.cause).toBe(original);
  });

  it('replaces only the collection file selected by the request', () => {
    const project = setup();
    const globalBefore = readFileSync(join(tempDir(), 'global.json'));
    const configBefore = readFileSync(join(tempDir(), '.lingo-tracker.json'));
    const result = updateProjectTerms(project, {
      protectedTerms: { target: { collection: 'app' }, change: { kind: 'replace', replace: ['New'] } },
    });
    expect(written(result)?.protectedTermsResult?.filePath).toBe(join(tempDir(), 'own.json'));
    expect(JSON.parse(readFileSync(join(tempDir(), 'own.json'), 'utf8'))).toEqual(['New']);
    expect(readFileSync(join(tempDir(), 'global.json'))).toEqual(globalBefore);
    expect(readFileSync(join(tempDir(), '.lingo-tracker.json'))).toEqual(configBefore);
  });

  it('restores config and an overwritten carried file when a later companion write fails', () => {
    const project = setup();
    const files = ['.lingo-tracker.json', 'global.json', 'own.json', 'preferred.json'];
    const before = files.map((file) => readFileSync(join(tempDir(), file)));
    mkdirSync(join(tempDir(), 'blocked.json'));
    const loaded = loadConfig({ cwd: tempDir() });
    loaded.preferredTerminologyFile = 'blocked.json';
    expect(
      failure(
        updateProjectTerms(
          { ...project, sourceConfig: loaded },
          {
            protectedTerms: { target: {}, change: { kind: 'view' }, file: 'own.json' },
            preferredTerminology: { set: [{ discouraged: 'Spend', preferred: 'Invest' }] },
          },
        ),
        'failed',
      ).error,
    ).toBeDefined();
    files.forEach((file, index) => {
      expect(readFileSync(join(tempDir(), file))).toEqual(before[index]);
    });
    expect(readdirSync(join(tempDir(), 'blocked.json'))).toEqual([]);
  });

  it('restores a registration and preserves companion files when add fails', () => {
    const project = setup();
    const before = readFileSync(join(tempDir(), '.lingo-tracker.json'));
    const ownBefore = readFileSync(join(tempDir(), 'own.json'));
    mkdirSync(join(tempDir(), 'blocked.json'));
    expect(() =>
      addCollection(
        project,
        'new',
        {
          translationsFolder: 'new',
          protectedTermsFile: 'blocked.json',
        },
        { protectedTerms: ['New'] },
      ),
    ).toThrow();
    expect(readFileSync(join(tempDir(), '.lingo-tracker.json'))).toEqual(before);
    expect(readFileSync(join(tempDir(), 'own.json'))).toEqual(ownBefore);
    expect(readdirSync(join(tempDir(), 'blocked.json'))).toEqual([]);
  });

  it('restores a changed registration when change fails', async () => {
    const project = setup();
    const before = readFileSync(join(tempDir(), '.lingo-tracker.json'));
    const ownBefore = readFileSync(join(tempDir(), 'own.json'));
    mkdirSync(join(tempDir(), 'blocked.json'));
    await expect(
      changeCollection(
        openCollection(project.sourceConfig, 'app', { cwd: tempDir() }),
        {
          patch: { protectedTermsFile: 'blocked.json' },
          newName: 'renamed',
        },
        { protectedTerms: ['New'] },
      ),
    ).rejects.toThrow();
    expect(readFileSync(join(tempDir(), '.lingo-tracker.json'))).toEqual(before);
    expect(readFileSync(join(tempDir(), 'own.json'))).toEqual(ownBefore);
    expect(existsSync(join(tempDir(), 'blocked.json'))).toBe(true);
  });

  it('keeps config consistent with a removed locale after a terms write fails', async () => {
    const project = setup();
    const config = { ...project.sourceConfig, locales: ['en', 'de'] };
    config.collections['app'].protectedTermsFile = 'blocked.json';
    writeFileSync(join(tempDir(), '.lingo-tracker.json'), JSON.stringify(config));
    const folder = join(tempDir(), 'i18n');
    seedResources(testCollection(folder, { locales: ['en', 'de'] }), {
      ok: { source: 'OK', translations: { de: 'Gut' } },
    });
    mkdirSync(join(tempDir(), 'blocked.json'));
    await expect(
      updateCollection(
        openCollection(loadConfig({ cwd: tempDir() }), 'app', { cwd: tempDir() }),
        undefined,
        { locales: ['en'] },
        { protectedTerms: ['X'] },
      ),
    ).rejects.toMatchObject({ code: 'EISDIR' });
    const stored = openCollection(loadConfig({ cwd: tempDir() }), 'app', { cwd: tempDir() });
    const entries: ResourceEntries = JSON.parse(readFileSync(join(folder, RESOURCE_ENTRIES_FILENAME), 'utf8'));
    expect(stored.locales).toEqual(['en']);
    expect(entries['ok']).toEqual({ source: 'OK' });
  });

  it('keeps config consistent with an added locale after a terms write fails', async () => {
    const project = setup();
    project.sourceConfig.collections['app'].protectedTermsFile = 'blocked.json';
    writeFileSync(join(tempDir(), '.lingo-tracker.json'), JSON.stringify(project.sourceConfig));
    const folder = join(tempDir(), 'i18n');
    seedResources(testCollection(folder, { locales: ['en'] }), { ok: { source: 'OK' } });
    mkdirSync(join(tempDir(), 'blocked.json'));
    await expect(
      updateCollection(
        openCollection(loadConfig({ cwd: tempDir() }), 'app', { cwd: tempDir() }),
        undefined,
        { locales: ['en', 'de'] },
        { protectedTerms: ['X'] },
      ),
    ).rejects.toMatchObject({ code: 'EISDIR' });
    const stored = openCollection(loadConfig({ cwd: tempDir() }), 'app', { cwd: tempDir() });
    const entries: ResourceEntries = JSON.parse(readFileSync(join(folder, RESOURCE_ENTRIES_FILENAME), 'utf8'));
    expect(stored.locales).toEqual(['en', 'de']);
    expect(entries['ok']).toEqual({ source: 'OK', de: 'OK' });
  });

  it('retains the carried file when concurrent config changes prevent restoration', () => {
    const project = setup();
    const configPath = join(tempDir(), '.lingo-tracker.json');
    const carriedPath = join(tempDir(), 'carried.json');
    const nextConfig = { ...project.sourceConfig, protectedTermsFile: 'carried.json' };
    const concurrent = `${JSON.stringify({ ...nextConfig, exportFolder: 'external' })}\n`;
    const original = new Error('companion failed');
    expect(() =>
      guardedConfigWrite(project).transaction(nextConfig, [
        { path: carriedPath, write: () => writeFileSync(carriedPath, '["Global"]\n') },
        {
          path: join(tempDir(), 'failed.json'),
          write: () => {
            writeFileSync(configPath, concurrent);
            throw original;
          },
        },
      ]),
    ).toThrow(original);
    expect(readFileSync(configPath, 'utf8')).toBe(concurrent);
    expect(readFileSync(carriedPath, 'utf8')).toBe('["Global"]\n');
    expect((original as Error & { cause?: unknown }).cause).toBeInstanceOf(ConfigChangedError);
  });

  it('does not restore config when the inner version check refuses our write', () => {
    const project = setup();
    const configPath = join(tempDir(), '.lingo-tracker.json');
    const concurrent = `${JSON.stringify({ ...project.sourceConfig, exportFolder: 'external' })}\n`;
    const nextConfig = { ...project.sourceConfig, importFolder: 'ours' };
    // Trigger a real external write during validation, after snapshots and before the inner guard.
    Object.defineProperty(nextConfig, 'baseLocale', {
      get: () => {
        writeFileSync(configPath, concurrent);
        return 'en';
      },
    });
    expect(() =>
      guardedConfigWrite(project).transaction(nextConfig, [
        { path: join(tempDir(), 'unused.json'), write: () => writeFileSync(join(tempDir(), 'unused.json'), '[]') },
      ]),
    ).toThrow(ConfigChangedError);
    expect(readFileSync(configPath, 'utf8')).toBe(concurrent);
    expect(existsSync(join(tempDir(), 'unused.json'))).toBe(false);
  });
});
