import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../i18n-types/tracker-resources';
import { fakeDialog, fakeEnv } from '../../../testing/form-submit-env';
import { toApiError } from '../../shared/api-error/api-error';
import type { CollectionDraftResult } from './collection-draft';
import { CollectionForm } from './collection-form';
import type { CollectionFormDialogData } from './collection-form-dialog-data';

const forms: CollectionForm[] = [];
function build(data: CollectionFormDialogData = { mode: 'create' }, env = fakeEnv()): CollectionForm {
  const form = new CollectionForm(data, env);
  forms.push(form);
  return form;
}

afterEach(() => {
  for (const form of forms) form.destroy();
  forms.length = 0;
});

const editData: CollectionFormDialogData = {
  mode: 'edit',
  name: 'my-app',
  config: {
    translationsFolder: './i18n',
    baseLocale: 'en',
    locales: ['en', 'es', 'fr-ca'],
    protectedTerms: ['iPhone', 'Node.js'],
    protectedTermsFile: 'i18n/terms.json',
    protectedTermsFilePath: '/project/i18n/terms.json',
  },
};

function addLocale(form: CollectionForm, locale: string): void {
  form.addLocaleInput.setValue(locale);
  form.addLocale();
}

function fillValid(form: CollectionForm): void {
  form.form.controls.name.setValue('my-collection');
  form.form.controls.translationsFolder.setValue('./i18n');
}

describe('CollectionForm — create mode', () => {
  it('starts blank and is not an edit', () => {
    const form = build();
    expect(form.isEditMode).toBe(false);
    expect(form.draft()).toMatchObject({ name: '', translationsFolder: '', locales: [], readOnly: false });
  });

  it('feeds typed name and folder into the draft', () => {
    const form = build();
    fillValid(form);
    expect(form.draft()).toMatchObject({ name: 'my-collection', translationsFolder: './i18n' });
  });

  it('defaults read-only when the typed folder is under node_modules', () => {
    const form = build();
    form.form.controls.translationsFolder.setValue('./node_modules/pkg/i18n');

    expect(form.readOnly()).toBe(true);
    expect(form.isNodeModulesPath()).toBe(true);
  });

  it('keeps read-only off after the user toggles it off and changes the folder', () => {
    const form = build();
    form.form.controls.translationsFolder.setValue('./node_modules/pkg/i18n');
    form.setReadOnly(false);
    expect(form.readOnly()).toBe(false);

    form.form.controls.translationsFolder.setValue('./node_modules/other/i18n');
    expect(form.readOnly()).toBe(false);
  });

  it('adds a valid locale and auto-sets it as base', () => {
    const form = build();
    addLocale(form, 'en');

    expect(form.locales()).toEqual(['en']);
    expect(form.draft().baseLocale).toBe('en');
    expect(form.addLocaleInput.value).toBe('');
    expect(form.addLocaleInput.errors).toBeNull();
  });

  it('adds a second locale without changing base', () => {
    const form = build();
    addLocale(form, 'en');
    addLocale(form, 'fr-ca');

    expect(form.locales()).toEqual(['en', 'fr-ca']);
    expect(form.draft().baseLocale).toBe('en');
  });

  it('rejects an invalid locale format and keeps the typed text', () => {
    const form = build();
    addLocale(form, 'xx-invalid-code');

    expect(form.locales()).toEqual([]);
    expect(form.addLocaleInput.hasError('invalidLocale')).toBe(true);
    expect(form.addLocaleInput.value).toBe('xx-invalid-code');
  });

  it('rejects a duplicate locale', () => {
    const form = build();
    addLocale(form, 'en');
    addLocale(form, 'en');

    expect(form.locales()).toEqual(['en']);
    expect(form.addLocaleInput.hasError('duplicateLocale')).toBe(true);
  });

  it('ignores a blank locale input', () => {
    const form = build();
    addLocale(form, '  ');

    expect(form.locales()).toEqual([]);
    expect(form.addLocaleInput.errors).toBeNull();
  });

  it('normalizes a locale to lowercase on add', () => {
    const form = build();
    addLocale(form, 'EN');

    expect(form.locales()).toEqual(['en']);
  });

  it('removes a locale', () => {
    const form = build();
    addLocale(form, 'en');
    addLocale(form, 'es');

    form.removeLocale(1);

    expect(form.locales()).toEqual(['en']);
  });

  it('promotes the first remaining locale to base when the base is removed', () => {
    const form = build();
    addLocale(form, 'en');
    addLocale(form, 'es');
    form.removeLocale(0);

    expect(form.draft().baseLocale).toBe('es');
  });

  it('clears the base locale when the last locale is removed', () => {
    const form = build();
    addLocale(form, 'en');
    form.removeLocale(0);

    expect(form.locales()).toEqual([]);
    expect(form.draft().baseLocale).toBe('');
  });

  it('lets a listed locale become the base', () => {
    const form = build();
    addLocale(form, 'en');
    addLocale(form, 'fr-ca');

    form.setBaseLocale('fr-ca');

    expect(form.draft().baseLocale).toBe('fr-ca');
    expect(form.isBaseLocale('fr-ca')).toBe(true);
    expect(form.isBaseLocale('en')).toBe(false);
  });

  it('ignores a base locale that is not in the list', () => {
    const form = build();
    addLocale(form, 'en');

    form.setBaseLocale('de');

    expect(form.draft().baseLocale).toBe('en');
  });

  it('explains the locale list: inherit when empty, base choice once there is one', () => {
    const form = build();
    const empty = form.localesHintToken();
    addLocale(form, 'en');
    expect(form.localesHintToken()).not.toBe(empty);
  });

  it('keeps the tags and protected terms disclosure closed when there is nothing in it', () => {
    const form = build();
    expect(form.advancedOpen()).toBe(false);
    form.toggleAdvanced();
    expect(form.advancedOpen()).toBe(true);
  });

  it('marks required fields touched instead of passing when invalid', () => {
    const form = build();

    expect(form.validate()).toBe(false);

    expect(form.form.controls.name.touched).toBe(true);
    expect(form.showNameError).toBe(true);
    expect(form.showFolderError).toBe(true);
  });

  it('passes validation once name and folder are filled', () => {
    const form = build();
    fillValid(form);

    expect(form.validate()).toBe(true);
  });

  it('builds the result with locales and base', () => {
    const form = build();
    fillValid(form);
    addLocale(form, 'en');

    expect(form.result()).toEqual({
      name: 'my-collection',
      config: {
        translationsFolder: './i18n',
        locales: ['en'],
        baseLocale: 'en',
        readOnly: false,
        tags: [],
        protectedTermsFile: '',
      },
    });
  });

  it('sends an empty locales list and omits baseLocale when no locales were added', () => {
    const form = build();
    fillValid(form);

    const { config } = form.result();
    expect(config.locales).toEqual([]);
    expect(config).not.toHaveProperty('baseLocale');
    expect(config.tags).toEqual([]);
  });

  it('adds a tag normalized and deduplicated, and removes it', () => {
    const form = build();
    form.addTag(' Design System ');
    form.addTag('design-system');
    form.addTag('  ');

    expect(form.tags()).toEqual(['design-system']);
    form.removeTag('design-system');
    expect(form.tags()).toEqual([]);
  });

  it('adds a protected term preserving casing, trimmed, deduped case-sensitively', () => {
    const form = build();
    form.addProtectedTerm(' iPhone ');
    form.addProtectedTerm('Node.js');
    form.addProtectedTerm('iPhone');

    expect(form.protectedTerms()).toEqual(['iPhone', 'Node.js']);
  });

  it('removes a protected term', () => {
    const form = build();
    form.addProtectedTerm('iPhone');
    form.addProtectedTerm('C++');
    form.removeProtectedTerm('iPhone');

    expect(form.protectedTerms()).toEqual(['C++']);
  });

  it('does not allow editing protected terms without a terms file, and sends no terms', () => {
    const form = build();
    fillValid(form);
    form.addProtectedTerm('iPhone');

    expect(form.canEditProtectedTerms()).toBe(false);
    const { config } = form.result();
    expect(config).not.toHaveProperty('protectedTerms');
    expect(config.protectedTermsFile).toBe('');
  });

  it('clears a refusal on the next edit of a field, a locale or read-only, but not of tags', () => {
    const form = build();
    form.attempt.fail(['nope']);
    form.addTag('ui');
    expect(form.submitError()).toBe('nope');

    form.form.controls.translationsFolder.setValue('./other');
    expect(form.submitError()).toBeNull();

    form.attempt.fail(['nope']);
    addLocale(form, 'en');
    expect(form.submitError()).toBeNull();

    form.attempt.fail(['nope']);
    form.setReadOnly(true);
    expect(form.submitError()).toBeNull();
  });
});

describe('CollectionForm — edit mode', () => {
  it('is an edit and locks the name', () => {
    const form = build(editData);
    expect(form.isEditMode).toBe(true);
    expect(form.form.controls.name.disabled).toBe(true);
    expect(form.form.controls.name.value).toBe('my-app');
  });

  it('pre-populates folder, locales, base locale and terms from the config', () => {
    const form = build(editData);

    expect(form.form.controls.translationsFolder.value).toBe('./i18n');
    expect(form.locales()).toEqual(['en', 'es', 'fr-ca']);
    expect(form.draft().baseLocale).toBe('en');
    expect(form.protectedTerms()).toEqual(['iPhone', 'Node.js']);
  });

  it('allows editing protected terms once a terms file is configured', () => {
    const form = build(editData);

    expect(form.canEditProtectedTerms()).toBe(true);
    expect(form.protectedTermsFilePath()).toBe('/project/i18n/terms.json');
  });

  it('returns protected terms and preserves the file pointer in the result config', () => {
    const form = build(editData);
    form.addProtectedTerm('C++');

    expect(form.result().config).toEqual(
      expect.objectContaining({
        protectedTerms: ['iPhone', 'Node.js', 'C++'],
        protectedTermsFile: 'i18n/terms.json',
      }),
    );
  });

  it('sends an empty protectedTermsFile and no terms when the collection has no terms file, so the API drops it', () => {
    const form = build({
      mode: 'edit',
      name: 'my-app',
      config: { translationsFolder: './i18n', protectedTerms: ['iPhone'] },
    });

    const { config } = form.result();
    expect(config.protectedTermsFile).toBe('');
    expect(config).not.toHaveProperty('protectedTerms');
  });

  it('keeps stored protected terms verbatim, including untrimmed values and duplicates', () => {
    const dirtyTerms = ['a', ' a', 'b'];
    const form = build({
      mode: 'edit',
      name: 'my-app',
      config: { translationsFolder: './i18n', protectedTerms: dirtyTerms, protectedTermsFile: 'i18n/terms.json' },
    });

    expect(form.protectedTerms()).toEqual(dirtyTerms);
    form.addProtectedTerm(' a ');
    expect(form.protectedTerms()).toEqual(dirtyTerms);
    expect(form.result().config.protectedTerms).toEqual(dirtyTerms);
  });

  it('reports the removed original locales for the confirmation', () => {
    const form = build(editData);
    expect(form.removedLocales()).toEqual([]);

    form.removeLocale(2);
    expect(form.removedLocales()).toEqual(['fr-ca']);

    addLocale(form, 'de');
    expect(form.removedLocales()).toEqual(['fr-ca']);
    expect(form.result().config.locales).toEqual(['en', 'es', 'de']);
  });

  it('keeps the base locale when another locale is removed', () => {
    const form = build(editData);
    form.removeLocale(1);
    expect(form.draft().baseLocale).toBe('en');
  });

  it('does not remove the base locale', () => {
    const form = build(editData);
    form.removeLocale(0);
    expect(form.locales()).toEqual(['en', 'es', 'fr-ca']);
  });

  it('does not offer a remove control for the base locale', () => {
    const form = build(editData);
    expect(form.canRemoveLocale(0)).toBe(false);
    expect(form.canRemoveLocale(1)).toBe(true);
  });

  it('does not let the base locale change', () => {
    const form = build(editData);
    form.setBaseLocale('es');
    expect(form.draft().baseLocale).toBe('en');
  });

  it('opens the disclosure when protected terms already exist, or tags do', () => {
    expect(build(editData).advancedOpen()).toBe(true);
    const tagged = build({ mode: 'edit', name: 'a', config: { translationsFolder: './i18n', tags: ['ui'] } });
    expect(tagged.advancedOpen()).toBe(true);
  });

  it('keeps a stored read-only false when the folder changes to node_modules', () => {
    const form = build({
      mode: 'edit',
      name: 'writable-app',
      config: { translationsFolder: './i18n', readOnly: false },
    });

    form.form.controls.translationsFolder.setValue('./node_modules/pkg/i18n');

    expect(form.readOnly()).toBe(false);
    expect(form.isNodeModulesPath()).toBe(true);
  });

  it('marks and locks an inherited base locale without writing it into the collection', () => {
    const form = build({
      mode: 'edit',
      name: 'inherits-base',
      config: { translationsFolder: './i18n', locales: ['en', 'de'] },
      effectiveBaseLocale: 'en',
    });

    expect(form.displayedBaseLocale()).toBe('en');
    expect(form.isBaseLocale('en')).toBe(true);
    expect(form.canRemoveLocale(0)).toBe(false);
    expect(form.canRemoveLocale(1)).toBe(true);
    expect(form.result().config).not.toHaveProperty('baseLocale');
  });

  it('sends an empty locales array when every locale is removed, so the API can inherit global locales', () => {
    // No inherited and no own base: every locale stays removable down to zero.
    const form = build({
      mode: 'edit',
      name: 'my-app',
      config: { translationsFolder: './i18n', locales: ['en', 'de'] },
    });

    form.removeLocale(1);
    form.removeLocale(0);

    expect(form.result().config.locales).toEqual([]);
  });

  it('sends the exact payload with an empty tags list when every tag is removed, so the API clears them', () => {
    const form = build({
      mode: 'edit',
      name: 'my-app',
      config: { translationsFolder: './i18n', baseLocale: 'en', locales: ['en'], tags: ['ui', 'legacy'] },
    });

    form.removeTag('ui');
    form.removeTag('legacy');

    expect(form.result()).toEqual({
      name: 'my-app',
      config: {
        translationsFolder: './i18n',
        locales: ['en'],
        baseLocale: 'en',
        readOnly: false,
        tags: [],
        protectedTermsFile: '',
      },
    });
  });
});

const rejection = (status: number, body: object) =>
  throwError(() => toApiError(new HttpErrorResponse({ status, error: { statusCode: status, ...body } })));

describe('CollectionForm — submit', () => {
  const setup = (data: CollectionFormDialogData = { mode: 'create' }) => {
    const env = fakeEnv();
    const form = build(data, env);
    if (data.mode === 'create') fillValid(form);
    const dialog = fakeDialog<CollectionDraftResult>();
    const create = vi.fn((_result: CollectionDraftResult) => of(null));
    const update = vi.fn((_name: string, _patch: { name: string | undefined }, _result: CollectionDraftResult) =>
      of(null),
    );
    const submit = () => form.submit({ dialog, write: { create, update } });
    return { env, form, dialog, create, update, submit };
  };

  it.each([false, true])(
    'prepares removed locales with confirmation=%s and an explicit error reset',
    async (confirmed) => {
      const { form, env, update, submit } = setup(editData);
      form.removeLocale(1);
      form.attempt.fail(['previous refusal']);
      const result = vi.spyOn(form, 'result');
      let answer: (value: boolean) => void = () => undefined;
      const confirm = vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            answer = resolve;
          }),
      );
      env.confirm = confirm;
      const attempt = submit();
      expect(confirm).toHaveBeenCalledExactlyOnceWith({
        title: TRACKER_TOKENS.COLLECTIONS.DIALOG.REMOVECONFIRMTITLE,
        message: { token: TRACKER_TOKENS.COLLECTIONS.DIALOG.REMOVECONFIRMBODY, params: { locales: 'es' } },
        confirmButtonText: TRACKER_TOKENS.COMMON.ACTIONS.SAVE,
        actionType: 'destructive',
      });
      expect(result).not.toHaveBeenCalled();
      expect(form.submitError()).toBe('previous refusal');
      answer(confirmed);
      await attempt;
      expect(result).toHaveBeenCalledTimes(confirmed ? 1 : 0);
      expect(update).toHaveBeenCalledTimes(confirmed ? 1 : 0);
      expect(form.submitError()).toBe(confirmed ? null : 'previous refusal');
    },
  );

  it('builds a result without clearing refusal rendering data', () => {
    const { form } = setup();
    form.attempt.fail(['previous refusal']);
    form.result();
    expect(form.submitError()).toBe('previous refusal');
  });

  it('creates the collection and closes only once the write has been accepted', () => {
    const { form, dialog, create, submit } = setup();
    const write = new Subject<null>();
    create.mockReturnValue(write);

    submit();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-collection' }));
    expect(dialog.close).not.toHaveBeenCalled();

    write.next(null);
    expect(dialog.close).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-collection' }));
    expect(form.saving()).toBe(true);
  });

  it('updates under the existing name and omits an unchanged rename', () => {
    const { dialog, create, update, submit } = setup(editData);
    submit();
    expect(update).toHaveBeenCalledWith('my-app', { name: undefined }, expect.objectContaining({ name: 'my-app' }));
    expect(create).not.toHaveBeenCalled();
    expect(dialog.close).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-app' }));
  });

  it('shows a taken name on the name field and keeps the dialog open', () => {
    const { form, dialog, create, submit } = setup();
    create.mockReturnValue(rejection(409, { message: 'taken', error: 'Conflict' }));

    submit();

    expect(dialog.close).not.toHaveBeenCalled();
    expect(form.saving()).toBe(false);
    expect(form.showNameConflict).toBe(true);
    expect(form.submitError()).toBeNull();

    form.form.controls.name.setValue('other');
    expect(form.showNameConflict).toBe(false);
    expect(form.form.controls.name.valid).toBe(true);
  });

  it('shows any other refusal on submitError, keeps what was typed, and clears it on the next edit', () => {
    const { form, dialog, create, submit } = setup();
    create.mockReturnValue(rejection(400, { message: 'folder must be a string', error: 'Bad Request' }));

    submit();

    expect(dialog.close).not.toHaveBeenCalled();
    expect(form.submitError()).toBe('folder must be a string');
    expect(form.form.controls.name.value).toBe('my-collection');
    expect(form.form.controls.name.valid).toBe(true);

    form.form.controls.translationsFolder.setValue('./other');
    expect(form.submitError()).toBeNull();
  });

  it('shows a locked-name conflict on submitError, since the name field cannot take it', () => {
    const { form, update, submit } = setup(editData);
    update.mockReturnValue(rejection(409, { message: 'already exists' }));
    submit();
    expect(form.submitError()).toBe('already exists');
  });

  it('falls back to the create-failed text for a refusal without a message', () => {
    const { form, create, submit } = setup();
    create.mockReturnValue(rejection(500, { error: 'Internal Server Error' }));
    submit();
    expect(form.submitError()).toBe(TRACKER_TOKENS.COLLECTIONS.TOAST.CREATEFAILED);
  });

  it('clears the previous refusal when the next submit starts', () => {
    const { form, dialog, create, submit } = setup();
    create.mockReturnValueOnce(rejection(400, { message: 'nope', error: 'Bad Request' }));
    submit();
    expect(form.submitError()).toBe('nope');

    create.mockReturnValue(new Subject<null>());
    submit();
    expect(form.submitError()).toBeNull();
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it('locks closing while the write is in flight and restores it after a refusal', () => {
    const { form, dialog, create, submit } = setup();
    const write = new Subject<null>();
    create.mockReturnValue(write);

    submit();
    expect(form.saving()).toBe(true);
    expect(dialog.disableClose).toBe(true);

    write.error(toApiError(new HttpErrorResponse({ status: 400, error: { message: 'nope' } })));
    expect(form.saving()).toBe(false);
    expect(dialog.disableClose).toBe(false);
  });

  it('ignores a second submit while the first is in flight', () => {
    const { create, submit } = setup();
    create.mockReturnValue(new Subject<null>());
    submit();
    submit();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('cancels an in-flight write when destroyed, without closing or reporting', () => {
    const { env, form, dialog, create, submit } = setup();
    const write = new Subject<null>();
    create.mockReturnValue(write);
    submit();

    env.destroy();
    write.next(null);

    expect(dialog.close).not.toHaveBeenCalled();
    expect(write.observed).toBe(false);
    expect(form.submitError()).toBeNull();
  });
});
