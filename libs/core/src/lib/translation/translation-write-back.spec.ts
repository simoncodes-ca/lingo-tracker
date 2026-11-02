import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESOURCE_ENTRIES_FILENAME, TRACKER_META_FILENAME } from '../../constants';
import { seedResources, testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import { writeJsonFile } from '../file-io/json-file-operations';
import { calculateChecksum } from '../resource/checksum';
// Standalone fixtures and readback retain unreported saves.
import { openUnreportedResourceFolder } from '../resource/resource-folder';
import { type ResourceMutation, resourceMutations } from '../resource/resource-mutation';
import { type PendingTranslation, snapshotTranslation, writeBackTranslations } from './translation-write-back';

vi.mock('../file-io/json-file-operations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../file-io/json-file-operations')>();
  return { ...actual, writeJsonFile: vi.fn(actual.writeJsonFile) };
});

async function failWrite(filePath: string) {
  const actual = await vi.importActual<typeof import('../file-io/json-file-operations')>(
    '../file-io/json-file-operations',
  );
  const error = new Error('write failed');
  const writer = vi.mocked(writeJsonFile);
  writer.mockImplementation((options) => {
    if (options.filePath === filePath) throw error;
    return actual.writeJsonFile(options);
  });
  return { error, restore: () => writer.mockImplementation(actual.writeJsonFile) };
}

describe('translation write-back', () => {
  const dir = useTempDir('translation-write-back-');
  const collected: ResourceMutation[] = [];
  const onMutation = (mutation: ResourceMutation): void => {
    collected.push(mutation);
  };
  const collection = () => testCollection(dir());
  const folderPath = () => join(dir(), 'common');
  const open = () => openUnreportedResourceFolder(folderPath(), collection());

  beforeEach(() => {
    collected.length = 0;
    vi.mocked(writeJsonFile).mockClear();
  });

  function prepare(): PendingTranslation {
    seedResources(collection(), {
      'common.save': { source: 'Save {name}', translations: { fr: { value: 'Save {name}', status: 'new' } } },
    });
    const current = open().get('save');
    if (!current) throw new Error('Missing fixture');
    vi.mocked(writeJsonFile).mockClear();
    return {
      entryKey: 'save',
      locale: 'fr',
      value: 'Enregistrer {{ name }}',
      snapshot: snapshotTranslation(current.entry.source, current.meta?.['fr']),
    };
  }

  function expectSkipped(pending: PendingTranslation): void {
    vi.mocked(writeJsonFile).mockClear();
    const result = writeBackTranslations(
      { ...collection(), onMutation: onMutation ?? (() => undefined) },
      folderPath(),
      [pending],
    );
    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual([pending]);
    expect(writeJsonFile).not.toHaveBeenCalled();
    expect(collected).toEqual([]);
  }

  it('snapshots the stored base checksum and optional target metadata', () => {
    expect(snapshotTranslation('Save {name}', undefined)).toEqual({
      baseChecksum: calculateChecksum('Save {name}'),
      targetChecksum: undefined,
      targetStatus: undefined,
    });
    const pending = prepare();
    expect(pending.snapshot).toMatchObject({ targetChecksum: calculateChecksum('Save {name}'), targetStatus: 'new' });
  });

  it('writes matching snapshots as translated, normalizes ICU, and returns the fresh folder', () => {
    const pending = prepare();
    const result = writeBackTranslations(
      { ...collection(), onMutation: onMutation ?? (() => undefined) },
      folderPath(),
      [pending],
    );
    expect(result.written).toEqual([pending]);
    expect(result.skipped).toEqual([]);
    expect(result.folder.treeEntry('save')).toMatchObject({
      translations: { fr: 'Enregistrer {name}' },
      metadata: { fr: { status: 'translated' } },
    });
    expect(open().treeEntry('save')).toEqual(result.folder.treeEntry('save'));
    expect(collected).toEqual([
      { kind: 'upsert', translationsFolder: dir(), key: 'common.save', entry: result.folder.treeEntry('save') },
    ]);
  });

  it('writes seeded copies with explicit new status', () => {
    const pending = { ...prepare(), value: 'Save {name}', status: 'new' as const };
    writeBackTranslations({ ...collection(), onMutation: () => undefined }, folderPath(), [pending]);
    expect(open().get('save')?.meta?.['fr']?.status).toBe('new');
  });

  it('writes a locale with no target metadata', () => {
    seedResources(collection(), { 'common.save': { source: 'Save' } });
    const pending: PendingTranslation = {
      entryKey: 'save',
      locale: 'fr',
      value: 'Enregistrer',
      snapshot: snapshotTranslation('Save', undefined),
    };
    expect(
      writeBackTranslations({ ...collection(), onMutation: () => undefined }, folderPath(), [pending]).written,
    ).toEqual([pending]);
    expect(open().get('save')?.meta?.['fr']?.status).toBe('translated');
  });

  it('skips when the stored base changes even if its metadata checksum did not change', () => {
    const pending = prepare();
    writeFileSync(
      join(folderPath(), RESOURCE_ENTRIES_FILENAME),
      JSON.stringify({ save: { source: 'Changed', fr: 'Save {name}' } }),
    );
    expectSkipped(pending);
    expect(open().get('save')?.entry.source).toBe('Changed');
  });

  it('skips when the target checksum changes but its status still needs work', () => {
    const pending = prepare();
    const folder = open();
    folder.setTranslation('save', 'fr', 'Humain', 'new');
    folder.save();
    expectSkipped(pending);
    expect(open().get('save')?.entry['fr']).toBe('Humain');
  });

  it('skips when the target status changes to another status that needs work', () => {
    const pending = prepare();
    const folder = open();
    folder.setStatus('save', 'fr', 'stale');
    folder.save();
    expectSkipped(pending);
    expect(open().get('save')?.meta?.['fr']?.status).toBe('stale');
  });

  it('skips a matching verified snapshot because the locale no longer needs translation', () => {
    prepare();
    const folder = open();
    folder.setStatus('save', 'fr', 'verified');
    folder.save();
    const current = folder.get('save');
    if (!current) throw new Error('Missing fixture');
    expectSkipped({
      entryKey: 'save',
      locale: 'fr',
      value: 'Machine',
      snapshot: snapshotTranslation(current.entry.source, current.meta?.['fr']),
    });
    expect(open().get('save')?.meta?.['fr']?.status).toBe('verified');
  });

  it('skips a matching translated snapshot because the locale no longer needs translation', () => {
    prepare();
    const folder = open();
    folder.setStatus('save', 'fr', 'translated');
    folder.save();
    const current = folder.get('save');
    if (!current) throw new Error('Missing fixture');
    expectSkipped({
      entryKey: 'save',
      locale: 'fr',
      value: 'Machine',
      snapshot: snapshotTranslation(current.entry.source, current.meta?.['fr']),
    });
  });

  it('skips an entry removed while its folder still has another entry', () => {
    const pending = prepare();
    const folder = open();
    folder.setBase('cancel', 'Cancel');
    folder.remove('save');
    folder.save();
    expectSkipped(pending);
    expect(open().keys()).toEqual(['cancel']);
  });

  it('skips when both folder files are missing without recreating them', () => {
    const pending = prepare();
    unlinkSync(join(folderPath(), RESOURCE_ENTRIES_FILENAME));
    unlinkSync(join(folderPath(), TRACKER_META_FILENAME));
    expectSkipped(pending);
    expect(existsSync(join(folderPath(), RESOURCE_ENTRIES_FILENAME))).toBe(false);
    expect(existsSync(join(folderPath(), TRACKER_META_FILENAME))).toBe(false);
  });

  it('saves once for multiple entries and locales with caller-supplied mutations', () => {
    const pending = prepare();
    seedResources(collection(), { 'common.cancel': { source: 'Cancel' } });
    const other: PendingTranslation = {
      entryKey: 'cancel',
      locale: 'fr',
      value: 'Annuler',
      snapshot: snapshotTranslation('Cancel', undefined),
    };
    const es: PendingTranslation = {
      ...pending,
      locale: 'es',
      value: 'Guardar {name}',
      snapshot: snapshotTranslation('Save {name}', undefined),
    };
    vi.mocked(writeJsonFile).mockClear();
    const result = writeBackTranslations(
      { ...collection(), onMutation: onMutation ?? (() => undefined) },
      folderPath(),
      [pending, other, es],
    );
    expect(result.written).toEqual([pending, other, es]);
    expect(writeJsonFile).toHaveBeenCalledTimes(2);
    expect(open().treeEntry('save')?.translations).toEqual({ fr: 'Enregistrer {name}', es: 'Guardar {name}' });
    expect(open().treeEntry('cancel')?.translations).toEqual({ fr: 'Annuler' });
    expect(collected).toEqual(
      ['save', 'cancel'].map((key) => resourceMutations.upsert(dir(), `common.${key}`, open().treeEntry(key))),
    );
  });

  it('does not save or report mutations for an empty pending list', () => {
    prepare();
    const saved = vi.fn(() => [resourceMutations.reindex(dir())]);
    expect(
      writeBackTranslations({ ...collection(), onMutation: onMutation ?? (() => undefined) }, folderPath(), []).written,
    ).toEqual([]);
    expect(writeJsonFile).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    expect(collected).toEqual([]);
  });

  it('reports the fresh stored entry only after both files are saved', () => {
    const pending = prepare();
    const sink = vi.fn((mutation: ResourceMutation) => {
      expect(writeJsonFile).toHaveBeenCalledTimes(2);
      expect(mutation).toEqual(resourceMutations.upsert(dir(), 'common.save', open().treeEntry('save')));
    });
    writeBackTranslations({ ...collection(), onMutation: sink }, folderPath(), [pending]);
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it('reports reindex and rethrows the original error after a partial save', async () => {
    const pending = prepare();
    const metadataPath = join(folderPath(), TRACKER_META_FILENAME);
    const saved = vi.fn(() => [resourceMutations.reindex(dir())]);
    const { error, restore } = await failWrite(metadataPath);
    try {
      expect(() =>
        writeBackTranslations({ ...collection(), onMutation: onMutation ?? (() => undefined) }, folderPath(), [
          pending,
        ]),
      ).toThrow(error);
      expect(collected).toEqual([resourceMutations.reindex(dir())]);
      expect(saved).not.toHaveBeenCalled();
      expect(readFileSync(join(folderPath(), RESOURCE_ENTRIES_FILENAME), 'utf8')).toContain('Enregistrer {name}');
    } finally {
      restore();
    }
  });

  it('preserves a sibling entry written after the snapshot', () => {
    const pending = prepare();
    seedResources(collection(), { 'common.cancel': { source: 'Cancel', translations: { fr: 'Annuler' } } });
    const sibling = open().get('cancel');
    writeBackTranslations({ ...collection(), onMutation: () => undefined }, folderPath(), [pending]);
    expect(open().get('cancel')).toEqual(sibling);
  });

  it('propagates invalid JSON written after the snapshot without saving or reporting mutations', () => {
    const pending = prepare();
    writeFileSync(join(folderPath(), RESOURCE_ENTRIES_FILENAME), '{ invalid');
    expect(() =>
      writeBackTranslations({ ...collection(), onMutation: onMutation ?? (() => undefined) }, folderPath(), [pending]),
    ).toThrow();
    expect(writeJsonFile).not.toHaveBeenCalled();
    expect(collected).toEqual([]);
  });
});
