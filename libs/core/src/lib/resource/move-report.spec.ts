import { describe, expect, it } from 'vitest';
import type { PruneResult } from './folder-pruning';
import { summarizeMovePruning } from './move-cleanup';
import { MoveReport } from './move-report';

function prune(report: MoveReport, source: string, result: PruneResult, empty: boolean): void {
  report.prune(summarizeMovePruning(result, [{ source, empty }]));
}

describe('Move Report', () => {
  it('finishes an empty move successfully without folder fields', () => {
    expect(new MoveReport().finish()).toEqual({ movedCount: 0, warnings: [], errors: [], outcome: 'succeeded' });
  });

  it('turns relocation collisions into warnings and preserves errors', () => {
    const report = new MoveReport();
    report.merge({ moved: [], collisions: [{ from: 'a.key', to: 'b.key' }], errors: ['Missing source'] });
    expect(report.finish()).toEqual({
      movedCount: 0,
      warnings: ['Destination key already exists: b.key. Use override option to force move.'],
      errors: ['Missing source'],
      outcome: 'failed',
    });
  });

  it('counts relocated entries and succeeds when only collisions remain', () => {
    const report = new MoveReport();
    report.merge({
      moved: [{ from: 'a.ok', to: 'b.ok', entry: { key: 'b.ok', source: 'OK', translations: {}, metadata: {} } }],
      collisions: [{ from: 'a.cancel', to: 'b.cancel' }],
      errors: [],
    });
    expect(report.finish()).toMatchObject({ movedCount: 1, outcome: 'succeeded', errors: [] });
    expect(report.finish().warnings).toHaveLength(1);
  });

  it('combines completed moves in order and fails even after partial success', () => {
    const report = new MoveReport();
    report.merge({ movedCount: 2, warnings: ['Skipped'], errors: [], outcome: 'succeeded' });
    report.warn('Kept');
    report.fail('Could not read');
    report.merge({ movedCount: 1, warnings: ['Collision'], errors: ['Missing'], outcome: 'failed' });
    expect(report.finish()).toEqual({
      movedCount: 3,
      warnings: ['Skipped', 'Kept', 'Collision'],
      errors: ['Could not read', 'Missing'],
      outcome: 'failed',
    });
  });

  it('succeeds with warnings alone and returns independent snapshots', () => {
    const report = new MoveReport();
    report.warn('Nothing moved');
    const first = report.finish();
    first.errors.push('Caller edit');
    expect(report.hasErrors).toBe(false);
    expect(report.finish().outcome).toBe('succeeded');
  });

  it('counts only the removed source folder', () => {
    const report = new MoveReport();
    prune(report, 'src', { removed: ['src.child', 'src'], kept: [], problems: [] }, false);
    expect(report.finish(true).foldersDeleted).toBe(1);
  });

  it('reports protected content and entries that appeared again', () => {
    const report = new MoveReport();
    prune(
      report,
      'src',
      {
        removed: [],
        problems: [],
        kept: [
          { folderPath: 'src', reason: 'entries', entries: ['src/resource_entries.json'] },
          { folderPath: 'src.child', reason: 'content', entries: ['src/child/README.md'] },
        ],
      },
      false,
    );
    expect(report.finish(true)).toEqual({
      movedCount: 0,
      foldersDeleted: 0,
      errors: [],
      outcome: 'succeeded',
      warnings: [
        'Source folder kept: it has resources again: src/resource_entries.json',
        'Source folder kept: holds content that is not part of the collection: src/child/README.md',
      ],
    });
  });

  it('fails empty-source pruning but only warns after resources moved', () => {
    const pruning: PruneResult = {
      removed: [],
      kept: [],
      problems: [{ kind: 'not-removed', folderPath: 'src', absolutePath: '/collection/src', message: 'Denied' }],
    };
    const empty = new MoveReport();
    prune(empty, 'src', pruning, true);
    expect(empty.finish().errors).toEqual([
      "Failed to delete empty source folder: Could not remove folder 'src': Denied",
    ]);
    expect(empty.finish().outcome).toBe('failed');
    const moved = new MoveReport();
    prune(moved, 'src', pruning, false);
    expect(moved.finish().warnings).toEqual(["Could not remove folder 'src': Denied"]);
    expect(moved.finish().outcome).toBe('succeeded');
  });

  it('formats pruning problems through the same failure rule', () => {
    const report = new MoveReport();
    prune(
      report,
      'src',
      {
        removed: [],
        kept: [],
        problems: [{ kind: 'not-removed', folderPath: 'src', absolutePath: '/collection/src', message: 'Denied' }],
      },
      true,
    );
    expect(report.finish().errors).toEqual([
      "Failed to delete empty source folder: Could not remove folder 'src': Denied",
    ]);
  });
});
