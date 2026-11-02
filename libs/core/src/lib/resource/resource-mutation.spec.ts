import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { testCollection, useTempDir } from '../../testing/temp-dir.spec-helpers';
import * as json from '../file-io/json-file-operations';
import { openResourceFolder, openUnreportedResourceFolder } from './resource-folder';
import type { ResourceMutation } from './resource-mutation';

describe('Resource Folder reporting', () => {
  const root = useTempDir('save-reporting-');
  it('delivers saved mutations after a successful save', () => {
    const events: string[] = [];
    const writer = vi.spyOn(json, 'writeJsonFile');
    const folder = openResourceFolder(
      root(),
      testCollection(root(), {
        onMutation: () => {
          expect(writer).toHaveBeenCalledTimes(2);
          events.push('upsert');
        },
      }),
    );
    try {
      folder.setBase('ok', 'OK');
      folder.save();
      expect(events).toEqual(['upsert']);
    } finally {
      writer.mockRestore();
    }
  });
  it('delivers one reindex and rethrows when the save fails', () => {
    const collected: ResourceMutation[] = [];
    const folder = openResourceFolder(root(), testCollection(root(), { onMutation: (m) => collected.push(m) }));
    folder.setBase('ok', 'OK');
    const failure = new Error('metadata write failed');
    const writer = vi.spyOn(json, 'writeJsonFile').mockImplementation(() => {
      throw failure;
    });
    try {
      expect(() => folder.save()).toThrow(failure);
      expect(collected).toEqual([{ kind: 'reindex', translationsFolder: root() }]);
    } finally {
      writer.mockRestore();
    }
  });
  it('leaves standalone fixture saves unreported', () => {
    // Standalone fixtures have no collection consumer.
    const folder = openUnreportedResourceFolder(join(root(), 'fixture'), {
      runtime: 'transloco-messageformat',
      baseLocale: 'en',
    });
    folder.setBase('ok', 'OK');
    expect(() => folder.save()).not.toThrow();
    expect(folder.treeEntry('ok')?.source).toBe('OK');
  });
});
