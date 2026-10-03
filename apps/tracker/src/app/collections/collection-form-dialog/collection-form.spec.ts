import type { ValidationErrors } from '@angular/forms';
import { afterEach, describe, expect, it } from 'vitest';
import { CollectionForm } from './collection-form';
import type { CollectionFormDialogData } from './collection-form-dialog-data';

const forms: CollectionForm[] = [];
function build(
  data: CollectionFormDialogData = { mode: 'create' },
  nameValidator: (control: { value: unknown }) => ValidationErrors | null = () => null,
): CollectionForm {
  const form = new CollectionForm(data, nameValidator);
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

  it('shows a taken name as a conflict and clears it when the name changes', () => {
    const form = build({ mode: 'create' }, (control) => (control.value === 'taken' ? { nameExists: true } : null));
    form.form.controls.name.setValue('taken');
    form.form.controls.name.markAsTouched();
    expect(form.showNameConflict).toBe(true);
    expect(form.showNameError).toBe(true);

    form.form.controls.name.setValue('other');
    expect(form.showNameConflict).toBe(false);
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
    form.submitError.set('nope');
    form.addTag('ui');
    expect(form.submitError()).toBe('nope');

    form.form.controls.translationsFolder.setValue('./other');
    expect(form.submitError()).toBeNull();

    form.submitError.set('nope');
    addLocale(form, 'en');
    expect(form.submitError()).toBeNull();

    form.submitError.set('nope');
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
