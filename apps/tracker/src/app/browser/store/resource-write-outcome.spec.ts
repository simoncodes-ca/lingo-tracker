import { describe, expect, it } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import {
  deleteFeedback,
  deleteOutcome,
  deleteRefusal,
  translateFeedback,
  translateOutcome,
  translateRefusal,
} from './resource-write-outcome';

const { TOAST } = TRACKER_TOKENS.BROWSER;
const toast = (tone: 'success' | 'info' | 'warning' | 'error', token: string, rest = {}) => ({
  tone,
  placement: 'toast',
  token,
  ...rest,
});

describe('resource action feedback', () => {
  describe('translate', () => {
    it('toasts one locale and several locales with their own wording', () => {
      expect(translateFeedback({ kind: 'translated', translatedCount: 1 })).toEqual([
        toast('success', TOAST.LOCALETRANSLATED),
      ]);
      expect(translateFeedback({ kind: 'translated', translatedCount: 3 })).toEqual([
        toast('success', TOAST.LOCALESTRANSLATEDX, { params: { count: 3 } }),
      ]);
    });

    it('says everything is up to date when nothing was translated or skipped', () => {
      expect(translateFeedback({ kind: 'up-to-date' })).toEqual([toast('info', TOAST.ALLLOCALESUPTODATE)]);
    });

    it('warns about skipped locales after the success of the others', () => {
      expect(translateFeedback({ kind: 'partial', translatedCount: 2, skippedLocales: ['fr', 'de'] })).toEqual([
        toast('success', TOAST.LOCALESTRANSLATEDX, { params: { count: 2 } }),
        toast('warning', TOAST.SKIPPEDLOCALESX, { params: { locales: 'fr, de' } }),
      ]);
    });

    it('only warns when every locale was skipped', () => {
      expect(translateFeedback({ kind: 'partial', translatedCount: 0, skippedLocales: ['fr'] })).toEqual([
        toast('warning', TOAST.SKIPPEDLOCALESX, { params: { locales: 'fr' } }),
      ]);
    });

    it('shows the message of a refusal, else the failure wording', () => {
      expect(translateRefusal(new Error('Quota')).feedback).toEqual([
        toast('error', TOAST.TRANSLATEFAILED, { detail: 'Quota' }),
      ]);
      expect(translateRefusal('boom').feedback).toEqual([toast('error', TOAST.TRANSLATEFAILED)]);
    });

    it('classifies a response by its counts', () => {
      expect(translateOutcome({ translatedCount: 2, skippedLocales: [] }).kind).toBe('translated');
      expect(translateOutcome({ translatedCount: 0, skippedLocales: [] }).kind).toBe('up-to-date');
      expect(translateOutcome({ translatedCount: 2, skippedLocales: ['fr'] }).kind).toBe('partial');
      expect(translateOutcome({ translatedCount: 0, skippedLocales: ['fr'] }).kind).toBe('partial');
    });
  });

  describe('delete', () => {
    it('toasts a success, a nothing-deleted failure and a refusal', () => {
      expect(deleteFeedback(deleteOutcome({ entriesDeleted: 1 }))).toEqual(toast('success', TOAST.RESOURCEDELETED));
      expect(deleteFeedback(deleteOutcome({ entriesDeleted: 0 }))).toEqual(toast('error', TOAST.DELETEFAILED));
      expect(deleteRefusal(new Error('Gone')).feedback).toEqual(toast('error', TOAST.DELETEFAILED, { detail: 'Gone' }));
    });
  });
});
