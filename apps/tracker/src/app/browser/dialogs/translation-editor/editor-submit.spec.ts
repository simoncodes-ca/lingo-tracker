import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { ApiError, type ApiErrorKind } from '../../../shared/api-error/api-error';
import { feedbackText } from '../../feedback';
import {
  type EditorRefusal,
  EditorSubmitSession,
  type EditorSubmitTrigger,
  type EditorWrites,
  refusalDecision,
  submitEditor,
} from './editor-submit';
import type { ResourceEntryDraft } from './resource-entry-draft';

const draft: ResourceEntryDraft = {
  key: 'ok',
  folderPath: 'common.buttons',
  baseValue: 'OK',
  comment: 'Button',
  tags: [],
  translations: [],
};
const original: ResourceSummaryDto = {
  fullKey: 'common.buttons.ok',
  folderPath: 'common.buttons',
  entryKey: 'ok',
  base: { locale: 'en', value: 'OK' },
  targets: [],
  tags: [],
  inheritedTags: [],
};
const writes = (): EditorWrites => ({
  create: vi.fn(() => of({ entriesCreated: 1, created: true })),
  update: vi.fn(() => of({ resolvedKey: original.fullKey, updated: true })),
});
const error = (kind: ApiErrorKind): ApiError => new ApiError({ kind, status: 400, serverMessage: 'Server message' });

describe('submitEditor outcomes', () => {
  it('creates with the request key and skipped locales', async () => {
    const fake = writes();
    fake.create = vi.fn(() => of({ entriesCreated: 1, created: true, skippedLocales: ['fr'] }));
    expect(await firstValueFrom(submitEditor({ mode: 'create', draft, writes: fake }))).toEqual({
      kind: 'created',
      fullKey: 'common.buttons.ok',
      skippedLocales: ['fr'],
    });
    expect(fake.create).toHaveBeenCalledWith(expect.objectContaining({ key: 'common.buttons.ok' }));
  });

  it('keeps an empty create skipped-locales list', async () => {
    const fake = writes();
    fake.create = vi.fn(() => of({ entriesCreated: 1, created: true, skippedLocales: [] }));
    expect(await firstValueFrom(submitEditor({ mode: 'create', draft, writes: fake }))).toMatchObject({
      skippedLocales: [],
    });
  });

  it('defaults omitted create skipped locales to an empty list', async () => {
    expect(await firstValueFrom(submitEditor({ mode: 'create', draft, writes: writes() }))).toMatchObject({
      skippedLocales: [],
    });
  });

  it('saves an unchanged-folder edit with skipped locales', async () => {
    const fake = writes();
    fake.update = vi.fn(() => of({ resolvedKey: original.fullKey, updated: true, skippedLocales: ['de'] }));
    expect(await firstValueFrom(submitEditor({ mode: 'edit', draft, original, writes: fake }))).toEqual({
      kind: 'saved',
      fullKey: original.fullKey,
      skippedLocales: ['de'],
    });
  });

  it('keeps an empty update skipped-locales list', async () => {
    const fake = writes();
    fake.update = vi.fn(() => of({ resolvedKey: original.fullKey, updated: true, skippedLocales: [] }));
    expect(await firstValueFrom(submitEditor({ mode: 'edit', draft, original, writes: fake }))).toMatchObject({
      skippedLocales: [],
    });
  });

  it('defaults omitted update skipped locales to an empty list', async () => {
    expect(await firstValueFrom(submitEditor({ mode: 'edit', draft, original, writes: writes() }))).toMatchObject({
      skippedLocales: [],
    });
  });

  it('moves to a new folder and passes skipped locales through', async () => {
    const fake = writes();
    fake.update = vi.fn(() => of({ resolvedKey: original.fullKey, updated: true, skippedLocales: ['fr'] }));
    expect(
      await firstValueFrom(
        submitEditor({ mode: 'edit', draft: { ...draft, folderPath: 'other' }, original, writes: fake }),
      ),
    ).toEqual({
      kind: 'moved',
      fullKey: 'other.ok',
      folderPath: 'other',
      skippedLocales: ['fr'],
    });
    expect(fake.update).toHaveBeenCalledWith(expect.objectContaining({ moveTo: 'other' }));
  });

  it('moves to the collection root even when the server reports no update', async () => {
    const fake = writes();
    fake.update = vi.fn(() => of({ resolvedKey: original.fullKey, updated: false }));
    expect(
      await firstValueFrom(submitEditor({ mode: 'edit', draft: { ...draft, folderPath: '' }, original, writes: fake })),
    ).toEqual({
      kind: 'moved',
      fullKey: 'ok',
      folderPath: '',
      skippedLocales: [],
    });
  });

  it('cancels when the server found nothing to change', async () => {
    const fake = writes();
    fake.update = vi.fn(() => of({ resolvedKey: original.fullKey, updated: false, skippedLocales: ['fr'] }));
    expect(await firstValueFrom(submitEditor({ mode: 'edit', draft, original, writes: fake }))).toEqual({
      kind: 'cancelled',
    });
  });

  it('refuses an edit without its original entry', async () => {
    const fake = writes();
    expect(await firstValueFrom(submitEditor({ mode: 'edit', draft, writes: fake }))).toEqual({
      kind: 'missing-original',
    });
    expect(fake.update).not.toHaveBeenCalled();
  });

  it('lets a response-mapping failure propagate instead of classifying it as a write refusal', async () => {
    const fake = writes();
    fake.create = vi.fn(() =>
      of({
        entriesCreated: 1,
        created: true,
        get skippedLocales(): string[] {
          throw new Error('Malformed response');
        },
      }),
    );
    await expect(firstValueFrom(submitEditor({ mode: 'create', draft, writes: fake }))).rejects.toThrow(
      'Malformed response',
    );
  });
});

describe('submitEditor refusals', () => {
  for (const mode of ['create', 'edit'] as const) {
    const submitFailure = (failure: unknown) => {
      const fake = writes();
      if (mode === 'create') fake.create = vi.fn(() => throwError(() => failure));
      else fake.update = vi.fn(() => throwError(() => failure));
      return firstValueFrom(submitEditor({ mode, draft, original, writes: fake }));
    };

    it(`${mode} classifies a conflict for its original presentation`, async () => {
      const failure = error('conflict');
      expect(await submitFailure(failure)).toEqual(
        mode === 'create'
          ? { kind: 'conflict', key: original.fullKey, error: failure }
          : { kind: 'update-failed', error: failure },
      );
    });

    it(`${mode} classifies not found`, async () => {
      const failure = error('not-found');
      expect(await submitFailure(failure)).toEqual(
        mode === 'edit' ? { kind: 'not-found', error: failure } : { kind: 'create-failed', error: failure },
      );
    });

    it(`${mode} passes through an invalid server message`, async () => {
      const failure = error('invalid');
      expect(await submitFailure(failure)).toEqual({ kind: 'invalid', message: 'Server message', error: failure });
    });

    it(`${mode} classifies other API failures`, async () => {
      const failure = error('other');
      expect(await submitFailure(failure)).toEqual({
        kind: mode === 'create' ? 'create-failed' : 'update-failed',
        error: failure,
      });
    });

    it(`${mode} classifies non-API failures`, async () => {
      const failure = new Error('Unexpected');
      expect(await submitFailure(failure)).toEqual({ kind: 'unexpected', error: failure });
    });
  }
});

describe('editor submit gate through its session', () => {
  const blocked: EditorSubmitTrigger = {
    mode: 'create',
    draft: { ...draft, comment: '' },
    readOnly: true,
    validation: { invalid: true, keyInvalid: true, baseValueInvalid: true, firstInvalidLocaleIndex: -1 },
    collision: true,
    runtime: 'transloco',
    baseLocale: 'en',
  };
  const setup = () => {
    const fake = writes();
    const confirmMissingComment = vi.fn(async () => false);
    const chooseConflict = vi.fn(async () => false);
    const submit = new EditorSubmitSession({
      writes: fake,
      confirmUnrenderable: vi.fn(async () => true),
      confirmMissingComment,
      chooseConflict,
      onWriteStart: vi.fn(),
    });
    return { submit, fake, confirmMissingComment, chooseConflict };
  };

  it('returns read-only first', async () => {
    const { submit, fake, confirmMissingComment, chooseConflict } = setup();
    expect(await submit.trigger(blocked)).toEqual({ kind: 'ignored' });
    expect(fake.create).not.toHaveBeenCalled();
    expect(confirmMissingComment).not.toHaveBeenCalled();
    expect(chooseConflict).not.toHaveBeenCalled();
  });
  it('ignores a trigger while writing', async () => {
    const { submit } = setup();
    submit.phase.set('writing');
    expect(await submit.trigger({ ...blocked, readOnly: false })).toEqual({ kind: 'ignored' });
  });
  it('returns invalid before collision', async () => {
    const { submit, chooseConflict } = setup();
    expect(await submit.trigger({ ...blocked, readOnly: false })).toEqual({
      kind: 'invalid',
      reveal: { focus: 'key', panels: 'close-all' },
    });
    expect(chooseConflict).not.toHaveBeenCalled();
  });
  it('returns collision before confirmation', async () => {
    const { submit, chooseConflict, confirmMissingComment } = setup();
    expect(await submit.trigger({ ...blocked, readOnly: false, validation: { invalid: false } })).toEqual({
      kind: 'ignored',
    });
    expect(chooseConflict).toHaveBeenCalledExactlyOnceWith('common.buttons.ok');
    expect(confirmMissingComment).not.toHaveBeenCalled();
  });
  it('requests comment confirmation last', async () => {
    const { submit, confirmMissingComment } = setup();
    expect(
      await submit.trigger({ ...blocked, readOnly: false, validation: { invalid: false }, collision: false }),
    ).toEqual({
      kind: 'reveal',
      reveal: { focus: 'comment', panels: 'keep' },
    });
    expect(confirmMissingComment).toHaveBeenCalledTimes(1);
  });
  it('allows a valid confirmed submission', async () => {
    const { submit, fake } = setup();
    expect(
      await submit.trigger({ ...blocked, draft, readOnly: false, validation: { invalid: false }, collision: false }),
    ).toMatchObject({ kind: 'outcome' });
    expect(fake.create).toHaveBeenCalledTimes(1);
  });
});

describe('editor submit decision feedback', () => {
  const tokens = TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.ERROR;
  const failure = error('other');
  const cases: { refusal: Exclude<EditorRefusal, { kind: 'conflict' }>; token: string; detail?: string }[] = [
    { refusal: { kind: 'missing-original' }, token: tokens.MISSINGRESOURCE },
    { refusal: { kind: 'not-found', error: failure }, token: tokens.NOTFOUND },
    {
      refusal: { kind: 'invalid', message: failure.serverMessage, error: failure },
      token: tokens.INVALIDREQUEST,
      detail: 'Server message',
    },
    { refusal: { kind: 'create-failed', error: failure }, token: tokens.CREATEFAILED, detail: 'Server message' },
    { refusal: { kind: 'update-failed', error: failure }, token: tokens.UPDATEFAILED, detail: 'Server message' },
    { refusal: { kind: 'unexpected', error: new Error('Technical detail') }, token: tokens.UNEXPECTED },
  ];

  it('carries the existing token, detail, tone and placement for every message decision', () => {
    for (const { refusal, token, detail } of cases) {
      expect(refusalDecision(refusal)).toEqual({
        kind: 'message',
        feedback: { tone: 'error', placement: 'inline', token, ...(detail ? { detail } : {}) },
      });
    }
  });

  it('uses the existing fallback when invalid, create and update failures have no server message', () => {
    const failure = new ApiError({ kind: 'other', status: 500, message: 'Technical error' });
    const cases: { refusal: Exclude<EditorRefusal, { kind: 'conflict' }>; token: string }[] = [
      { refusal: { kind: 'invalid', message: undefined, error: failure }, token: tokens.INVALIDREQUEST },
      { refusal: { kind: 'create-failed', error: failure }, token: tokens.CREATEFAILED },
      { refusal: { kind: 'update-failed', error: failure }, token: tokens.UPDATEFAILED },
    ];
    for (const { refusal, token } of cases) {
      const decision = refusalDecision(refusal);
      expect(decision).toEqual({ kind: 'message', feedback: { tone: 'error', placement: 'inline', token } });
      if (decision.kind === 'message') {
        expect(feedbackText(decision.feedback, (value) => `Translated ${value}`)).toBe(`Translated ${token}`);
      }
    }
  });
});
