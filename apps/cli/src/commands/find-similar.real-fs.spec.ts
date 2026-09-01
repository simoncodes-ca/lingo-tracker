import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addResourceCommand } from '../add-resource/add-resource';
import { findSimilarCommand } from './find-similar';

/**
 * End-to-end coverage against a real translations folder on disk: a value added
 * through `add-resource` must be reported by `find-similar` as a 100% match in
 * the same run. This is the level at which the scoring bug was visible to users.
 */
describe('find-similar (real fs)', () => {
  let projectDir: string;
  let originalInitCwd: string | undefined;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'lingo-find-similar-'));
    mkdirSync(join(projectDir, 'i18n-source'), { recursive: true });
    writeFileSync(
      join(projectDir, '.lingo-tracker.json'),
      JSON.stringify({
        baseLocale: 'en',
        locales: ['en', 'fr'],
        collections: { main: { translationsFolder: 'i18n-source' } },
      }),
    );

    originalInitCwd = process.env.INIT_CWD;
    process.env.INIT_CWD = projectDir;

    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = originalInitCwd;
    }
    rmSync(projectDir, { recursive: true, force: true });
  });

  function loggedLines(): string[] {
    return vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
  }

  /**
   * Adds a resource and asserts it really landed on disk, so a silently failing
   * `add-resource` cannot make a later "no match" assertion pass vacuously.
   */
  async function addResource(key: string, value: string): Promise<void> {
    await addResourceCommand({ collection: 'main', key, value });

    const folder = join(projectDir, 'i18n-source', ...key.split('.').slice(0, -1));
    const entriesPath = join(folder, 'resource_entries.json');
    expect(existsSync(entriesPath)).toBe(true);
    expect(readFileSync(entriesPath, 'utf-8')).toContain(value);

    vi.mocked(console.log).mockClear();
  }

  it('reports a 100% match for a multi-word value added in the same run', async () => {
    await addResource('common.button.addItem', 'Add Item');

    await findSimilarCommand({ collection: 'main', value: 'Add Item' });

    expect(loggedLines()).toContain('  common.button.addItem → "Add Item" (similarity: 100%)');
  });

  it('reports a 100% match for a single-character value added in the same run', async () => {
    await addResource('labels.singleChar', 'x');

    await findSimilarCommand({ collection: 'main', value: 'x' });

    expect(loggedLines()).toContain('  labels.singleChar → "x" (similarity: 100%)');
  });

  // The keys below deliberately avoid containing the query text: searchTranslations
  // classifies a key match as 'partial-key', which find-similar filters out before
  // scoring, so a key-shaped fixture would never reach the threshold logic at all.
  it('reports a near match that clears the threshold', async () => {
    await addResource('labels.pastTense', 'saved');

    await findSimilarCommand({ collection: 'main', value: 'save' });

    expect(loggedLines()).toContain('  labels.pastTense → "saved" (similarity: 80%)');
  });

  it('rejects a candidate that reaches scoring but falls below the threshold', async () => {
    // 'delete risk' contains the query, so it survives the substring pre-filter
    // in searchTranslations and is actually scored: 1 - 5/11 ≈ 0.545 < 0.8.
    await addResource('labels.destructiveAction', 'delete risk');

    // The same fixture matches on its exact value, proving the candidate is
    // reachable and that the rejection above is the threshold, not the pre-filter.
    await findSimilarCommand({ collection: 'main', value: 'delete risk' });
    expect(loggedLines()).toContain('  labels.destructiveAction → "delete risk" (similarity: 100%)');
    vi.mocked(console.log).mockClear();

    await findSimilarCommand({ collection: 'main', value: 'delete' });

    expect(loggedLines()).toContain('No similar values found for "delete".');
  });

  it('reports no match for a value that was never added', async () => {
    await addResource('labels.greeting', 'Hello world');

    await findSimilarCommand({ collection: 'main', value: 'Completely unrelated' });

    expect(loggedLines()).toContain('No similar values found for "Completely unrelated".');
  });
});
