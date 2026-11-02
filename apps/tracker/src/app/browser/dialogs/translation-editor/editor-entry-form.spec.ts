import { signal } from '@angular/core';
import type { ResourceSummaryDto } from '@simoncodes-ca/data-transfer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorEntryForm } from './editor-entry-form';

describe('EditorEntryForm', () => {
  it('accepts dotted arguments in base and target fields with a Transloco runtime getter', () => {
    const entry = new EditorEntryForm(
      () => false,
      () => 'transloco',
    );
    try {
      entry.seed(['en', 'fr'], 'en', undefined, '');
      entry.form.controls.key.setValue('greeting');
      entry.form.controls.baseValue.setValue('Hello {user.name}');
      entry.getLocaleFormGroup(0).controls.value.setValue('Bonjour {user.name}');
      expect(entry.form.valid).toBe(true);
      entry.getLocaleFormGroup(0).controls.value.setValue('{{{user.name}}}');
      expect(entry.getLocaleFormGroup(0).controls.value.hasError('bracedPlaceholder')).toBe(true);
    } finally {
      entry.destroy();
    }
  });

  let form: EditorEntryForm;
  const resource = (overrides: Partial<ResourceSummaryDto> = {}): ResourceSummaryDto => ({
    fullKey: 'common.buttons.existing_key',
    folderPath: 'common.buttons',
    entryKey: 'existing_key',
    base: { locale: 'en', value: 'Existing Value' },
    targets: [
      { locale: 'fr', value: 'Valeur existante', status: 'translated', needsWork: false, sameAsBase: false },
      { locale: 'de', value: 'Vorhandener Wert', status: 'verified', needsWork: false, sameAsBase: false },
    ],
    tags: ['ui'],
    inheritedTags: [],
    ...overrides,
  });

  beforeEach(() => {
    form = new EditorEntryForm();
  });
  afterEach(() => form.destroy());

  it('should initialize form controls for all non-base locales', () => {
    form.seed(['en', 'fr', 'de'], 'en', undefined, '');
    expect(form.form.controls.translations.controls.map((control) => control.value.locale)).toEqual(['fr', 'de']);
  });

  it('should initialize all locale controls with empty values in create mode', () => {
    form.seed(['en', 'fr', 'de'], 'en', undefined, '');
    expect(form.localeSummaries()).toEqual([
      { locale: 'fr', value: '', status: 'new' },
      { locale: 'de', value: '', status: 'new' },
    ]);
  });

  it('should not require comment field', () => {
    form.form.controls.comment.setValue('');
    expect(form.form.controls.comment.valid).toBe(true);
  });

  it('should reject a braced placeholder in the base value and in a translation, but not an empty one', () => {
    form.seed(['en', 'fr'], 'en', undefined, '');
    const value = form.form.controls.translations.at(0).controls.value;

    form.form.controls.baseValue.setValue('Hi {{{name}}}');
    value.setValue('Salut {{{name}}}');
    expect(form.form.controls.baseValue.hasError('bracedPlaceholder')).toBe(true);
    expect(value.hasError('bracedPlaceholder')).toBe(true);

    value.setValue('');
    expect(value.valid).toBe(true);
  });

  it('should report the required error for a blank base value and accept a real one', () => {
    const baseValue = form.form.controls.baseValue;

    baseValue.setValue('   ');
    expect(baseValue.invalid).toBe(true);
    expect(baseValue.hasError('required')).toBe(true);

    baseValue.setValue('OK');
    expect(baseValue.valid).toBe(true);
  });

  it('should accept any comment value', () => {
    form.form.controls.comment.setValue('This is a comment for translators');
    expect(form.form.controls.comment.valid).toBe(true);
  });

  it('should pre-populate form with resource data', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource({ comment: 'Existing comment' }), 'common.buttons');
    expect(form.form.getRawValue()).toMatchObject({
      key: 'existing_key',
      baseValue: 'Existing Value',
      comment: 'Existing comment',
    });
    expect(form.tags()).toEqual(['ui']);
  });

  it('should handle missing base locale translation', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource({ base: { locale: 'en', value: '' } }), 'common.buttons');
    expect(form.form.controls.baseValue.value).toBe('');
  });

  it('should handle missing comment', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource(), 'common.buttons');
    expect(form.form.controls.comment.value).toBe('');
  });

  it('should pre-populate other locale translations in edit mode', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource(), 'common.buttons');
    expect(form.localeSummaries()).toEqual([
      { locale: 'fr', value: 'Valeur existante', status: 'translated' },
      { locale: 'de', value: 'Vorhandener Wert', status: 'verified' },
    ]);
  });

  it('uses the missing-metadata status for an absent target', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource({ targets: [] }), 'common.buttons');
    expect(form.localeSummaries()).toEqual([
      { locale: 'fr', value: '', status: 'new' },
      { locale: 'de', value: '', status: 'new' },
    ]);
  });

  it('counts only new and stale locale rows', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource(), 'common.buttons');
    form.form.controls.translations.at(0).controls.status.setValue('stale');
    expect(form.localesNeedingWork().map((locale) => locale.locale)).toEqual(['fr']);
    expect(form.needWorkCount()).toBe(1);
  });

  it('keeps the raw draft available when the form is disabled', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource(), 'common.buttons');
    form.form.disable({ emitEvent: false });
    expect(form.draft('common.buttons').translations).toHaveLength(2);
  });

  it('treats a typed-back field as unsaved work', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource(), 'common.buttons');
    form.form.controls.comment.setValue('changed');
    form.form.controls.comment.markAsDirty();
    form.form.controls.comment.setValue('');
    expect(form.hasUnsavedChanges('common.buttons')).toBe(true);
  });

  it('publishes a silent key write to the form snapshot', () => {
    form.seed(['en', 'fr', 'de'], 'en', undefined, '');
    form.form.controls.key.setValue('leaf', { emitEvent: false });
    form.publishSnapshot();
    expect(form.formState().key).toBe('leaf');
  });

  it('builds the complete draft from seeded fields, tags, folder and locale rows', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource({ comment: 'For translators' }), 'common.buttons');
    expect(form.draft('common.buttons')).toEqual({
      key: 'existing_key',
      baseValue: 'Existing Value',
      comment: 'For translators',
      folderPath: 'common.buttons',
      tags: ['ui'],
      translations: [
        { locale: 'fr', value: 'Valeur existante', status: 'translated' },
        { locale: 'de', value: 'Vorhandener Wert', status: 'verified' },
      ],
    });
  });

  it('has no unsaved changes right after seeding', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource(), 'common.buttons');
    expect(form.hasUnsavedChanges('common.buttons')).toBe(false);
  });

  it('detects an added or removed tag as unsaved work', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource(), 'common.buttons');
    form.addTag('browser');
    expect(form.tags()).toEqual(['ui', 'browser']);
    expect(form.hasUnsavedChanges('common.buttons')).toBe(true);
    form.removeTag('browser', []);
    expect(form.hasUnsavedChanges('common.buttons')).toBe(false);
    form.removeTag('ui', []);
    expect(form.hasUnsavedChanges('common.buttons')).toBe(true);
  });

  it('detects a folder-path change as unsaved work', () => {
    form.seed(['en', 'fr', 'de'], 'en', resource(), 'common.buttons');
    expect(form.hasUnsavedChanges('common.labels')).toBe(true);
  });

  it('derives live validity from the fields and the supplied collision signal', () => {
    const collision = signal(false);
    form.destroy();
    form = new EditorEntryForm(collision);
    form.seed(['en', 'fr'], 'en', undefined, '');
    expect(form.isFormValid()).toBe(false);
    form.form.patchValue({ key: 'ok', baseValue: 'OK' });
    expect(form.isFormValid()).toBe(true);
    collision.set(true);
    expect(form.isFormValid()).toBe(false);
    collision.set(false);
    expect(form.isFormValid()).toBe(true);
    form.getLocaleFormGroup(0).controls.value.setValue('Salut {{{name}}}');
    expect(form.isFormValid()).toBe(false);
    form.getLocaleFormGroup(0).controls.value.setValue('');
    expect(form.isFormValid()).toBe(true);
  });

  it('shows errors on touched invalid fields and hides them after correction', () => {
    form.seed(['en', 'fr'], 'en', undefined, '');
    expect(form.showKeyError()).toBe(false);
    expect(form.showBaseValueError()).toBe(false);
    expect(form.showLocaleValueError(0)).toBe(false);
    form.form.controls.key.markAsTouched();
    form.form.controls.baseValue.markAsTouched();
    form.getLocaleFormGroup(0).controls.value.markAsTouched();
    form.form.patchValue({ key: 'bad key', baseValue: 'Hi {{{name}}}' });
    form.getLocaleFormGroup(0).controls.value.setValue('Salut {{{name}}}');
    expect(form.showKeyError()).toBe(true);
    expect(form.showBaseValueError()).toBe(true);
    expect(form.showLocaleValueError(0)).toBe(true);
    form.form.patchValue({ key: 'ok', baseValue: 'OK' });
    form.getLocaleFormGroup(0).controls.value.setValue('');
    expect(form.showKeyError()).toBe(false);
    expect(form.showBaseValueError()).toBe(false);
    expect(form.showLocaleValueError(0)).toBe(false);
  });

  it('reveals untouched invalid fields after a submit attempt and tracks the first invalid locale', () => {
    form.seed(['en', 'fr', 'de'], 'en', undefined, '');
    form.getLocaleFormGroup(1).controls.value.setValue('Hallo {{{name}}}');
    expect(form.firstInvalidLocaleIndex()).toBe(1);
    expect(form.showKeyError()).toBe(false);
    expect(form.showBaseValueError()).toBe(false);
    expect(form.showLocaleValueError(1)).toBe(false);
    form.submitAttempted.set(true);
    expect(form.showKeyError()).toBe(true);
    expect(form.showBaseValueError()).toBe(true);
    expect(form.showLocaleValueError(1)).toBe(true);
    form.getLocaleFormGroup(0).controls.value.setValue('Salut {{{name}}}');
    expect(form.firstInvalidLocaleIndex()).toBe(0);
    form.getLocaleFormGroup(0).controls.value.setValue('');
    form.getLocaleFormGroup(1).controls.value.setValue('');
    expect(form.firstInvalidLocaleIndex()).toBe(-1);
    expect(form.showLocaleValueError(1)).toBe(false);
  });
});
