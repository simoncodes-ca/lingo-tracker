import type { ExportPlanDto } from '@simoncodes-ca/data-transfer';
import { Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultDraft } from './export-draft';
import { ExportPreview, entryShape } from './export-preview';

const plan: ExportPlanDto = {
  format: 'xliff',
  outputDirectory: 'out',
  collections: ['main'],
  locales: ['fr'],
  files: [],
  skippedLocales: [],
  entriesTotal: 0,
  overwriteCount: 0,
  warnings: [],
  errors: [],
  hierarchicalConflicts: [],
};
afterEach(() => vi.useRealTimers());

describe('ExportPreview', () => {
  it('debounces the initial request and edits, marks stale immediately and cancels old dry runs', () => {
    vi.useFakeTimers();
    const changes = new Subject<void>();
    const cancelled = vi.fn();
    const result = new Subject<ExportPlanDto>();
    const dryRun = vi.fn(
      () =>
        new Observable<ExportPlanDto>((subscriber) => {
          const subscription = result.subscribe(subscriber);
          return () => {
            cancelled();
            subscription.unsubscribe();
          };
        }),
    );
    const preview = new ExportPreview({
      failureMessage: () => 'Preview failed',
      request: () => ({ format: 'xliff' }),
      dryRun,
    });
    const sub = preview.connect(changes);
    expect(preview.stale()).toBe(true);
    vi.advanceTimersByTime(299);
    expect(dryRun).not.toHaveBeenCalled();
    changes.next();
    vi.advanceTimersByTime(300);
    expect(dryRun).toHaveBeenCalledTimes(1);
    expect(preview.status()).toBe('loading');
    changes.next();
    vi.advanceTimersByTime(300);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(dryRun).toHaveBeenCalledTimes(2);
    result.next(plan);
    expect(preview.plan()).toEqual(plan);
    expect(preview.stale()).toBe(false);
    changes.next();
    expect(preview.stale()).toBe(true);
    sub.unsubscribe();
    expect(cancelled).toHaveBeenCalledTimes(2);
  });

  it('keeps the preview stale when an older response arrives during the next edit debounce', () => {
    vi.useFakeTimers();
    const changes = new Subject<void>();
    const old = new Subject<ExportPlanDto>();
    const dryRun = vi.fn().mockReturnValueOnce(old).mockReturnValue(of(plan));
    const preview = new ExportPreview({
      failureMessage: () => 'Preview failed',
      request: () => ({ format: 'xliff' }),
      dryRun,
    });
    const sub = preview.connect(changes);
    vi.advanceTimersByTime(300);
    changes.next();
    old.next(plan);
    expect(preview.stale()).toBe(true);
    expect(preview.plan()).toBeUndefined();
    vi.advanceTimersByTime(300);
    expect(preview.stale()).toBe(false);
    expect(preview.plan()).toEqual(plan);
    sub.unsubscribe();
  });

  it('retains the last plan on failure, exposes the error and recovers on the next edit', () => {
    vi.useFakeTimers();
    const changes = new Subject<void>();
    const dryRun = vi
      .fn()
      .mockReturnValueOnce(of(plan))
      .mockReturnValueOnce(throwError(() => new Error('Folder blocked')))
      .mockReturnValue(of(plan));
    const preview = new ExportPreview({
      failureMessage: () => 'Preview failed',
      request: () => ({ format: 'xliff' }),
      dryRun,
    });
    const sub = preview.connect(changes);
    vi.advanceTimersByTime(300);
    changes.next();
    vi.advanceTimersByTime(300);
    expect(preview.plan()).toEqual(plan);
    expect(preview.status()).toBe('error');
    expect(preview.error()).toBe('Folder blocked');
    expect(preview.stale()).toBe(false);
    changes.next();
    vi.advanceTimersByTime(300);
    expect(preview.error()).toBeUndefined();
    expect(preview.status()).toBe('ready');
    sub.unsubscribe();
  });

  it('uses the injected fallback when a dry run fails without a readable message', () => {
    vi.useFakeTimers();
    const failureMessage = vi.fn(() => 'The preview could not be checked');
    const preview = new ExportPreview({
      request: () => ({ format: 'xliff' }),
      dryRun: () => throwError(() => undefined),
      failureMessage,
    });
    const subscription = preview.connect(new Subject());
    vi.advanceTimersByTime(300);
    expect(failureMessage).toHaveBeenCalledOnce();
    expect(preview.error()).toBe('The preview could not be checked');
    expect(preview.status()).toBe('error');
    expect(preview.stale()).toBe(false);
    subscription.unsubscribe();
  });

  it('waits without an API request when the form cannot produce a request', () => {
    vi.useFakeTimers();
    const dryRun = vi.fn();
    const preview = new ExportPreview({ failureMessage: () => 'Preview failed', request: () => undefined, dryRun });
    const sub = preview.connect(new Subject());
    vi.advanceTimersByTime(300);
    expect(preview.status()).toBe('waiting');
    expect(preview.stale()).toBe(false);
    expect(dryRun).not.toHaveBeenCalled();
    sub.unsubscribe();
  });
});

describe('entryShape', () => {
  it('renders XLIFF with an optional note and escapes real example data', () => {
    const draft = defaultDraft();
    const shape = entryShape(draft, { key: 'app."save', baseValue: 'Save <&>', collection: 'main' });
    expect(shape.language).toBe('xml');
    expect(shape.lines.join('\n')).toContain('id="app.&quot;save"');
    expect(shape.lines.join('\n')).toContain('Save &lt;&amp;&gt;');
    expect(shape.lines.some((line) => line.includes('<note>'))).toBe(true);
    draft.protectedTermNotes = false;
    expect(entryShape(draft).lines.some((line) => line.includes('<note>'))).toBe(false);
  });

  it('renders plain hierarchical and flat JSON', () => {
    const draft = defaultDraft();
    draft.format = 'json';
    const nested = entryShape(draft);
    expect(nested.language).toBe('json');
    expect(JSON.parse(nested.lines.join('\n'))).toEqual({ buttons: { save: '…' } });
    draft.json.structure = 'flat';
    expect(JSON.parse(entryShape(draft).lines.join('\n'))).toEqual({ 'buttons.save': '…' });
  });

  it('adds rich properties only while enabled and uses the chosen base property', () => {
    const draft = defaultDraft();
    draft.format = 'json';
    Object.assign(draft.json, {
      rich: true,
      includeBase: true,
      basePropertyName: 'source',
      includeStatus: true,
      includeComment: true,
      includeTags: true,
      structure: 'flat',
    });
    const leaf = JSON.parse(entryShape(draft).lines.join('\n'))['buttons.save'];
    expect(leaf).toEqual({
      value: '…',
      source: 'Save changes',
      status: 'stale',
      comment: 'Primary action',
      tags: ['ui'],
      doNotTranslate: ['LingoTracker'],
    });
    Object.assign(draft.json, { includeBase: false, includeStatus: false, includeComment: false, includeTags: false });
    draft.protectedTermNotes = false;
    expect(JSON.parse(entryShape(draft).lines.join('\n'))['buttons.save']).toEqual({
      value: '…',
    });
  });
});
