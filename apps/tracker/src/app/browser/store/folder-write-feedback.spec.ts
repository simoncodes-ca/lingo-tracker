import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { ApiError, toApiError } from '../../shared/api-error/api-error';
import { feedbackText } from '../feedback';
import {
  createFolderFeedback,
  decideCreateFolder,
  decideMoveFolder,
  decideMoveResource,
  deleteFolderFeedback,
  moveFolderFeedback,
  moveResourceFeedback,
} from './folder-write-feedback';

const { TOAST, FOLDERPICKER } = TRACKER_TOKENS.BROWSER;
const folder = { name: 'new', fullPath: 'common.new', loaded: false };
const serverRefusal = toApiError(new HttpErrorResponse({ status: 409, error: { message: 'Already exists' } }));
const silentRefusal = new ApiError({ kind: 'other', status: 500 });
const silent = [{ kind: 'read-only' }, { kind: 'no-collection' }, { kind: 'stale-session' }] as const;

describe('folder write feedback', () => {
  describe('create', () => {
    it('is silent for a new folder and toasts an info for an existing one', () => {
      expect(createFolderFeedback({ kind: 'created', folder, created: true })).toBeNull();
      expect(createFolderFeedback({ kind: 'created', folder, created: false })).toEqual({
        tone: 'info',
        placement: 'toast',
        token: FOLDERPICKER.FOLDERALREADYEXISTS,
      });
    });

    it('puts a refusal inline under the input, with the server message as its detail', () => {
      expect(createFolderFeedback({ kind: 'refused', error: serverRefusal })).toEqual({
        tone: 'error',
        placement: 'inline',
        token: TOAST.CREATEFOLDERFAILED,
        detail: 'Already exists',
      });
    });

    it('falls back to the token wording when the failure has no message', () => {
      const feedback = createFolderFeedback({ kind: 'refused', error: silentRefusal });
      expect(feedback).toEqual({ tone: 'error', placement: 'inline', token: TOAST.CREATEFOLDERFAILED });
    });

    it.each(silent)('says nothing for $kind', (result) => {
      expect(createFolderFeedback(result)).toBeNull();
    });
  });

  describe('delete', () => {
    it('toasts a refusal and is otherwise silent', () => {
      expect(deleteFolderFeedback({ kind: 'refused', error: serverRefusal })).toEqual({
        tone: 'error',
        placement: 'toast',
        token: TOAST.DELETEFOLDERFAILED,
        detail: 'Already exists',
      });
      expect(deleteFolderFeedback({ kind: 'deleted', deleted: true })).toBeNull();
      expect(deleteFolderFeedback({ kind: 'read-only' })).toBeNull();
    });
  });

  describe('move folder', () => {
    it('toasts the move with the destination, naming the root by its label token', () => {
      expect(
        moveFolderFeedback({ kind: 'moved', folderName: 'buttons', destinationFolderPath: 'errors' }),
      ).toMatchObject({ tone: 'success', token: TOAST.FOLDERMOVEDX, params: { name: 'buttons', dest: 'errors' } });
      expect(moveFolderFeedback({ kind: 'moved', folderName: 'buttons', destinationFolderPath: '' })).toMatchObject({
        params: { name: 'buttons', dest: { token: FOLDERPICKER.ROOTLABEL } },
      });
    });

    it('tells the user only about a drop on the current parent', () => {
      expect(moveFolderFeedback({ kind: 'noop', reason: 'already-at-location' })).toEqual({
        tone: 'info',
        placement: 'toast',
        token: TOAST.FOLDERALREADYATLOCATION,
      });
      expect(moveFolderFeedback({ kind: 'noop', reason: 'same-folder' })).toBeNull();
      expect(moveFolderFeedback({ kind: 'invalid-drop' })).toBeNull();
    });

    it('toasts a refusal', () => {
      expect(moveFolderFeedback({ kind: 'refused', error: silentRefusal })).toEqual({
        tone: 'error',
        placement: 'toast',
        token: TOAST.MOVEFOLDERFAILED,
      });
    });
  });

  describe('move resource', () => {
    it('toasts the move, an already-there drop and a refusal', () => {
      expect(moveResourceFeedback({ kind: 'moved', entryKey: 'ok', destinationFolderPath: 'common' })).toMatchObject({
        tone: 'success',
        token: TOAST.RESOURCEMOVEDX,
        params: { name: 'ok', folder: 'common' },
      });
      expect(moveResourceFeedback({ kind: 'noop', reason: 'already-in-folder' })).toMatchObject({
        tone: 'info',
        token: TOAST.RESOURCEALREADYINFOLDER,
      });
      expect(moveResourceFeedback({ kind: 'refused', error: serverRefusal })).toMatchObject({
        tone: 'error',
        token: TOAST.MOVERESOURCEFAILED,
        detail: 'Already exists',
      });
      expect(moveResourceFeedback({ kind: 'stale-session' })).toBeNull();
    });
  });

  it('decides keep the result and add its feedback', () => {
    expect(decideCreateFolder({ kind: 'no-collection' })).toEqual({ kind: 'no-collection', feedback: null });
    expect(decideMoveFolder({ kind: 'noop', reason: 'same-folder' })).toEqual({
      kind: 'noop',
      reason: 'same-folder',
      feedback: null,
    });
    expect(decideMoveResource({ kind: 'noop', reason: 'already-in-folder' }).feedback?.tone).toBe('info');
  });

  describe('rendering', () => {
    const translate = (token: string, params?: Record<string, string | number>): string =>
      `${token}:${JSON.stringify(params ?? {})}`;

    it('translates a token parameter and leaves plain ones', () => {
      const feedback = moveFolderFeedback({ kind: 'moved', folderName: 'a', destinationFolderPath: '' });
      expect(feedback && feedbackText(feedback, translate)).toBe(
        `${TOAST.FOLDERMOVEDX}:{"name":"a","dest":"${FOLDERPICKER.ROOTLABEL}:{}"}`,
      );
    });

    it('prefers the failure detail to the token wording', () => {
      const feedback = createFolderFeedback({ kind: 'refused', error: serverRefusal });
      expect(feedback && feedbackText(feedback, translate)).toBe('Already exists');
    });
  });
});
