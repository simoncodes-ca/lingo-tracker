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
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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

  it('suggests an entry whose key contains the query text', async () => {
    // Regression for #75: searchTranslations classifies this entry as a key
    // match, which used to suppress it before scoring — hiding exactly the
    // well-named canonical key a caller most wants to reuse.
    await addResource('common.button.connect', 'Connect');

    await findSimilarCommand({ collection: 'main', value: 'Connect' });

    expect(loggedLines()).toContain('  common.button.connect → "Connect" (similarity: 100%)');
  });

  it('suggests both a key-matched and a value-matched entry holding the same value', async () => {
    await addResource('common.button.connect', 'Connect');
    await addResource('dialogs.secondaryAction', 'Connect');

    await findSimilarCommand({ collection: 'main', value: 'Connect' });

    const lines = loggedLines();
    expect(lines).toContain('  common.button.connect → "Connect" (similarity: 100%)');
    expect(lines).toContain('  dialogs.secondaryAction → "Connect" (similarity: 100%)');
    // The canonical key is listed at least as highly as the coincidental one.
    expect(lines.indexOf('  common.button.connect → "Connect" (similarity: 100%)')).toBeLessThan(
      lines.indexOf('  dialogs.secondaryAction → "Connect" (similarity: 100%)'),
    );
  });

  it('finds a match that many key hits would otherwise crowd out', async () => {
    // Regression for the candidate-budget half of #75: searchTranslations stops
    // walking once it has maxResults hits, so the candidate budget must exceed
    // the number of hits that precede a real match in the walk. 55 noise entries
    // are enough to exhaust any budget at or below the old cap of 50, and far
    // more than the display limit of 5. 'noise' sorts before 'zz', so the match
    // is walked last.
    for (let i = 0; i < 55; i++) {
      await addResource(`noise.cancelVariant${i}`, `Cancel the ${i} pending upload`);
    }
    await addResource('zz.dismiss', 'Cancel');

    await findSimilarCommand({ collection: 'main', value: 'Cancel' });

    expect(loggedLines()).toContain('  zz.dismiss → "Cancel" (similarity: 100%)');
  });

  it('still rejects a key-matched entry whose value is not similar', async () => {
    // The key contains the query but the value does not resemble it, so the
    // threshold must still discard it — key hits are scored, not waved through.
    await addResource('errors.connectTimeout', 'The connection attempt timed out');

    // The entry is reachable on its own value, so the rejection below is the
    // threshold rejecting it rather than the search never returning it.
    await findSimilarCommand({ collection: 'main', value: 'The connection attempt timed out' });
    expect(loggedLines()).toContain('  errors.connectTimeout → "The connection attempt timed out" (similarity: 100%)');
    vi.mocked(console.log).mockClear();

    await findSimilarCommand({ collection: 'main', value: 'Connect' });

    expect(loggedLines()).toContain('No similar values found for "Connect".');
  });

  it('reports no match for a value that was never added', async () => {
    await addResource('labels.greeting', 'Hello world');

    await findSimilarCommand({ collection: 'main', value: 'Completely unrelated' });

    expect(loggedLines()).toContain('No similar values found for "Completely unrelated".');
  });
});
