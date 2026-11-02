import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { EMPTY, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { ApiError } from '../../../shared/api-error/api-error';
import { EditorSubmitSession, type EditorSubmitTrigger } from './editor-submit';

const tokens = TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR;
const message = (token: string) => ({ kind: 'message', feedback: { tone: 'error', placement: 'inline', token } });

const input: EditorSubmitTrigger = {
  mode: 'create',
  draft: { key: ' ok ', folderPath: 'common', baseValue: 'OK', comment: 'Context', tags: [], translations: [] },
  readOnly: false,
  validation: { invalid: false },
  collision: false,
  runtime: 'transloco',
  baseLocale: 'en',
};

const original: ResourceSummaryDto = {
  fullKey: 'common.ok',
  folderPath: 'common',
  entryKey: 'ok',
  base: { locale: 'en', value: 'OK' },
  targets: [],
  tags: [],
  inheritedTags: [],
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function session(overrides: Partial<ConstructorParameters<typeof EditorSubmitSession>[0]> = {}) {
  const create = vi.fn(() => of({ entriesCreated: 1, created: true }));
  const update = vi.fn(() => of({ resolvedKey: 'common.ok', updated: true }));
  const confirmUnrenderable = vi.fn(async () => true);
  const confirmMissingComment = vi.fn(async () => true);
  const chooseConflict = vi.fn(async () => false);
  const onWriteStart = vi.fn();
  return {
    submit: new EditorSubmitSession({
      writes: { create, update },
      confirmUnrenderable,
      confirmMissingComment,
      chooseConflict,
      onWriteStart,
      ...overrides,
    }),
    create,
    update,
    confirmUnrenderable,
    confirmMissingComment,
    chooseConflict,
    onWriteStart,
  };
}

describe('EditorSubmitSession', () => {
  it('ignores a second trigger while the missing-comment confirmation is pending', async () => {
    const confirmation = deferred<boolean>();
    const harness = session({ confirmMissingComment: vi.fn(() => confirmation.promise) });
    const withoutComment = { ...input, draft: { ...input.draft, comment: '' } };
    const first = harness.submit.trigger(withoutComment);

    expect(harness.submit.phase()).toBe('confirming-comment');
    expect(await harness.submit.trigger(withoutComment)).toEqual({ kind: 'ignored' });
    confirmation.resolve(true);
    expect(await first).toMatchObject({ kind: 'outcome' });
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.create).toHaveBeenCalledWith(expect.objectContaining({ key: 'common.ok' }));
  });

  it('ignores a trigger during a write', async () => {
    const response = new Subject<{ entriesCreated: number; created: boolean }>();
    const harness = session({ writes: { create: vi.fn(() => response), update: vi.fn() } });
    const first = harness.submit.trigger(input);

    expect(harness.submit.phase()).toBe('writing');
    expect(harness.submit.isSubmitting()).toBe(true);
    expect(await harness.submit.trigger(input)).toEqual({ kind: 'ignored' });
    response.next({ entriesCreated: 1, created: true });
    response.complete();
    expect(await first).toMatchObject({ kind: 'outcome' });
    expect(harness.submit.phase()).toBe('done');
    expect(harness.submit.isSubmitting()).toBe(true);
    expect(await harness.submit.trigger(input)).toEqual({ kind: 'ignored' });
  });

  it('remembers Save Anyway after a refused write', async () => {
    const failure = new ApiError({ kind: 'other', status: 503 });
    const create = vi
      .fn()
      .mockReturnValueOnce(throwError(() => failure))
      .mockReturnValueOnce(of({ entriesCreated: 1, created: true }));
    const harness = session({ writes: { create, update: vi.fn() } });
    const withoutComment = { ...input, draft: { ...input.draft, comment: '' } };

    expect(await harness.submit.trigger(withoutComment)).toMatchObject(message(tokens.CREATEFAILED));
    expect(await harness.submit.trigger(withoutComment)).toMatchObject({ kind: 'outcome' });
    expect(harness.confirmMissingComment).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('allows the comment prompt again after Add Comment', async () => {
    const confirmMissingComment = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const harness = session({ confirmMissingComment });
    const withoutComment = { ...input, draft: { ...input.draft, comment: '' } };

    expect(await harness.submit.trigger(withoutComment)).toEqual({
      kind: 'reveal',
      reveal: { focus: 'comment', panels: 'keep' },
    });
    expect(await harness.submit.trigger(withoutComment)).toMatchObject({ kind: 'outcome' });
    expect(confirmMissingComment).toHaveBeenCalledTimes(2);
  });

  it('opens one conflict prompt for repeated triggers on a known collision', async () => {
    const choice = deferred<boolean>();
    const chooseConflict = vi.fn(() => choice.promise);
    const harness = session({ chooseConflict });
    const first = harness.submit.trigger({ ...input, collision: true });

    expect(harness.submit.phase()).toBe('choosing-conflict');
    expect(await harness.submit.trigger({ ...input, collision: true })).toEqual({ kind: 'ignored' });
    expect(chooseConflict).toHaveBeenCalledTimes(1);
    expect(chooseConflict).toHaveBeenCalledWith('common.ok');
    choice.resolve(false);
    expect(await first).toEqual({ kind: 'ignored' });
    expect(harness.submit.phase()).toBe('idle');
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('keeps a server conflict in the same session until the choice resolves', async () => {
    const choice = deferred<boolean>();
    const chooseConflict = vi.fn(() => choice.promise);
    const failure = new ApiError({ kind: 'conflict', status: 409 });
    const harness = session({
      writes: { create: vi.fn(() => throwError(() => failure)), update: vi.fn() },
      chooseConflict,
    });
    const first = harness.submit.trigger(input);
    await vi.waitFor(() => expect(harness.submit.phase()).toBe('choosing-conflict'));

    expect(await harness.submit.trigger(input)).toEqual({ kind: 'ignored' });
    expect(chooseConflict).toHaveBeenCalledTimes(1);
    choice.resolve(true);
    expect(await first).toEqual({ kind: 'outcome', outcome: { kind: 'open-existing', fullKey: 'common.ok' } });
    expect(harness.submit.isSubmitting()).toBe(true);
  });

  it('shows an unexpected message and returns to idle when a write completes empty', async () => {
    const harness = session({ writes: { create: vi.fn(() => EMPTY), update: vi.fn() } });

    expect(await harness.submit.trigger(input)).toEqual(message(tokens.UNEXPECTED));
    expect(harness.submit.phase()).toBe('idle');
    expect(harness.submit.isSubmitting()).toBe(false);
  });

  it('shows an unexpected message and returns to idle when a prompt rejects', async () => {
    const confirmMissingComment = vi.fn(async () => {
      throw new Error('Confirmation failed');
    });
    const harness = session({ confirmMissingComment });

    expect(await harness.submit.trigger({ ...input, draft: { ...input.draft, comment: '' } })).toEqual(
      message(tokens.UNEXPECTED),
    );
    expect(harness.submit.phase()).toBe('idle');
    expect(harness.submit.isSubmitting()).toBe(false);
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('shows an unexpected message and returns to idle when the conflict prompt rejects', async () => {
    const chooseConflict = vi.fn(async () => {
      throw new Error('Conflict prompt failed');
    });
    const harness = session({ chooseConflict });

    expect(await harness.submit.trigger({ ...input, collision: true })).toEqual(message(tokens.UNEXPECTED));
    expect(harness.submit.phase()).toBe('idle');
    expect(harness.submit.isSubmitting()).toBe(false);
  });

  it('maps each refusal to the dialog decision', async () => {
    const cases = [
      { mode: 'create', error: 'invalid', token: tokens.INVALIDREQUEST },
      { mode: 'create', error: 'not-found', token: tokens.CREATEFAILED },
      { mode: 'create', error: 'other', token: tokens.CREATEFAILED },
      { mode: 'edit', error: 'not-found', token: tokens.NOTFOUND },
      { mode: 'edit', error: 'invalid', token: tokens.INVALIDREQUEST },
      { mode: 'edit', error: 'conflict', token: tokens.UPDATEFAILED },
      { mode: 'edit', error: 'other', token: tokens.UPDATEFAILED },
    ] as const;

    for (const testCase of cases) {
      const failure = new ApiError({ kind: testCase.error, status: 400 });
      const writes = { create: vi.fn(() => throwError(() => failure)), update: vi.fn(() => throwError(() => failure)) };
      const harness = session({ writes });
      expect(await harness.submit.trigger({ ...input, mode: testCase.mode, original })).toEqual(
        message(testCase.token),
      );
    }

    const unexpected = new Error('offline');
    const harness = session({ writes: { create: vi.fn(() => throwError(() => unexpected)), update: vi.fn() } });
    expect(await harness.submit.trigger(input)).toEqual(message(tokens.UNEXPECTED));
    expect(await session().submit.trigger({ ...input, mode: 'edit' })).toEqual(message(tokens.MISSINGRESOURCE));
  });

  it('returns validation focus before prompts or writes', async () => {
    const harness = session();
    expect(
      await harness.submit.trigger({
        ...input,
        validation: { invalid: true, keyInvalid: true, baseValueInvalid: true, firstInvalidLocaleIndex: -1 },
        collision: true,
      }),
    ).toEqual({
      kind: 'invalid',
      reveal: { focus: 'key', panels: 'close-all' },
    });
    expect(harness.chooseConflict).not.toHaveBeenCalled();
    expect(harness.create).not.toHaveBeenCalled();
  });
  it.each([
    { keyInvalid: true, baseValueInvalid: true, firstInvalidLocaleIndex: 1, focus: 'key', panels: 'close-all' },
    { keyInvalid: true, baseValueInvalid: false, firstInvalidLocaleIndex: 1, focus: 'key', panels: 'close-all' },
    { keyInvalid: false, baseValueInvalid: true, firstInvalidLocaleIndex: 1, focus: 'base-value', panels: 'close-all' },
    {
      keyInvalid: false,
      baseValueInvalid: false,
      firstInvalidLocaleIndex: 1,
      focus: 'invalid-locale-value',
      panels: 'locales',
    },
    {
      keyInvalid: false,
      baseValueInvalid: false,
      firstInvalidLocaleIndex: -1,
      focus: 'base-value',
      panels: 'close-all',
    },
  ])('carries the reveal target for invalid fields: %o', async ({ focus, panels, ...validation }) => {
    const harness = session();
    expect(await harness.submit.trigger({ ...input, validation: { invalid: true, ...validation } })).toEqual({
      kind: 'invalid',
      reveal: { focus, panels },
    });
    expect(harness.confirmMissingComment).not.toHaveBeenCalled();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it('reveals the base value for a form-level error with no invalid field', async () => {
    const harness = session();
    expect(
      await harness.submit.trigger({
        ...input,
        validation: { invalid: true, keyInvalid: false, baseValueInvalid: false, firstInvalidLocaleIndex: -1 },
      }),
    ).toEqual({ kind: 'invalid', reveal: { focus: 'base-value', panels: 'close-all' } });
    expect(harness.create).not.toHaveBeenCalled();
  });
  describe('unrenderable confirmation', () => {
    const plural = '{count, plural, one {# item} other {# items}}';
    const flaggedBase = { ...input, draft: { ...input.draft, baseValue: plural } };
    const flaggedLocale = {
      ...input,
      draft: {
        ...input.draft,
        translations: [{ locale: 'fr', value: '{n, select, a {A} other {B}}', status: 'new' as const }],
      },
    };

    it('asks under transloco and writes after Save Anyway', async () => {
      const harness = session();
      expect(await harness.submit.trigger(flaggedBase)).toMatchObject({ kind: 'outcome' });
      expect(harness.confirmUnrenderable).toHaveBeenCalledExactlyOnceWith([
        { locale: 'en', value: plural, kinds: ['plural'] },
      ]);
      expect(harness.create).toHaveBeenCalledTimes(1);
    });

    it('does not ask for an unflagged value or under transloco-messageformat', async () => {
      const plain = session();
      expect(await plain.submit.trigger(input)).toMatchObject({ kind: 'outcome' });
      expect(plain.confirmUnrenderable).not.toHaveBeenCalled();

      const messageformat = session();
      expect(await messageformat.submit.trigger({ ...flaggedBase, runtime: 'transloco-messageformat' })).toMatchObject({
        kind: 'outcome',
      });
      expect(messageformat.confirmUnrenderable).not.toHaveBeenCalled();
      expect(messageformat.create).toHaveBeenCalledTimes(1);
    });

    it('does not write and focuses the base value when the base is flagged and the user goes back', async () => {
      const harness = session({ confirmUnrenderable: vi.fn(async () => false) });
      expect(await harness.submit.trigger(flaggedBase)).toEqual({
        kind: 'reveal',
        reveal: { focus: 'base-value', panels: 'close-all' },
      });
      expect(harness.create).not.toHaveBeenCalled();
      expect(harness.submit.phase()).toBe('idle');
    });

    it('opens the locales drawer when only a locale is flagged', async () => {
      const harness = session({ confirmUnrenderable: vi.fn(async () => false) });
      expect(await harness.submit.trigger(flaggedLocale)).toEqual({
        kind: 'reveal',
        reveal: { focus: 'drawer-first-control', panels: 'locales' },
      });
      expect(harness.create).not.toHaveBeenCalled();
    });

    it('does not ask again for the same findings after a failed write', async () => {
      const create = vi
        .fn()
        .mockReturnValueOnce(throwError(() => new ApiError({ kind: 'other', status: 503 })))
        .mockReturnValueOnce(of({ entriesCreated: 1, created: true }));
      const harness = session({ writes: { create, update: vi.fn() } });

      expect(await harness.submit.trigger(flaggedBase)).toMatchObject(message(tokens.CREATEFAILED));
      expect(await harness.submit.trigger(flaggedBase)).toMatchObject({ kind: 'outcome' });
      expect(harness.confirmUnrenderable).toHaveBeenCalledTimes(1);
    });

    it('asks again when the findings change', async () => {
      const failure = new ApiError({ kind: 'other', status: 503 });
      const create = vi
        .fn()
        .mockReturnValueOnce(throwError(() => failure))
        .mockReturnValueOnce(of({ entriesCreated: 1, created: true }));
      const harness = session({ writes: { create, update: vi.fn() } });

      await harness.submit.trigger(flaggedBase);
      await harness.submit.trigger({
        ...flaggedBase,
        draft: { ...flaggedBase.draft, baseValue: '{n, select, a {A} other {B}}' },
      });
      expect(harness.confirmUnrenderable).toHaveBeenCalledTimes(2);
    });

    it('asks again for a different value with the same locale and kind', async () => {
      const failure = new ApiError({ kind: 'other', status: 503 });
      const create = vi
        .fn()
        .mockReturnValueOnce(throwError(() => failure))
        .mockReturnValueOnce(of({ entriesCreated: 1, created: true }));
      const harness = session({ writes: { create, update: vi.fn() } });

      await harness.submit.trigger(flaggedBase);
      await harness.submit.trigger({
        ...flaggedBase,
        draft: { ...flaggedBase.draft, baseValue: '{count, plural, one {# thing} other {# things}}' },
      });
      expect(harness.confirmUnrenderable).toHaveBeenCalledTimes(2);
    });

    it('detects constructs in mixed Transloco and ICU syntax', async () => {
      const harness = session();
      const mixed = 'Hello {{name}}: {n, number}';
      await harness.submit.trigger({ ...input, draft: { ...input.draft, baseValue: mixed } });
      expect(harness.confirmUnrenderable).toHaveBeenCalledExactlyOnceWith([
        { locale: 'en', value: mixed, kinds: ['number'] },
      ]);
    });

    it('asks before the missing-comment confirmation', async () => {
      const order: string[] = [];
      const harness = session({
        confirmUnrenderable: vi.fn(async () => {
          order.push('runtime');
          return true;
        }),
        confirmMissingComment: vi.fn(async () => {
          order.push('comment');
          return true;
        }),
      });
      await harness.submit.trigger({ ...flaggedBase, draft: { ...flaggedBase.draft, comment: '' } });
      expect(order).toEqual(['runtime', 'comment']);
    });

    it('skips the comment prompt when the runtime prompt is declined', async () => {
      const harness = session({ confirmUnrenderable: vi.fn(async () => false) });
      await harness.submit.trigger({ ...flaggedBase, draft: { ...flaggedBase.draft, comment: '' } });
      expect(harness.confirmMissingComment).not.toHaveBeenCalled();
    });

    it('does not ask for an edit that leaves the flagged base value unchanged', async () => {
      const harness = session();
      const edit: EditorSubmitTrigger = {
        ...input,
        mode: 'edit',
        original: { ...original, base: { locale: 'en', value: plural } },
        draft: { ...input.draft, baseValue: plural },
      };
      await harness.submit.trigger(edit);
      expect(harness.confirmUnrenderable).not.toHaveBeenCalled();
      expect(harness.update).toHaveBeenCalledTimes(1);
    });
  });
});
