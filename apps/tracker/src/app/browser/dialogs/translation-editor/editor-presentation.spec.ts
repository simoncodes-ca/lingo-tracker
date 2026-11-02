import { signal } from '@angular/core';
import { findPreferredTermFindings } from '@simoncodes-ca/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { EditorEntryForm } from './editor-entry-form';
import { EditorPresentation, type EditorPresentationState } from './editor-presentation';

const tokens = TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR;
const translate = (token: string, params?: Record<string, string | number>): string =>
  params?.['count'] !== undefined ? `${token} ${params['count']}` : token;

describe('EditorPresentation', () => {
  let entry: EditorEntryForm;
  let presentation: EditorPresentation;
  const editMode = signal(false);
  const readOnly = signal(false);
  const baseValueError = signal(false);
  const otherLocales = signal(['fr', 'de']);
  const similarCount = signal(0);
  const folder = signal('common.buttons');
  const needWorkCount = signal(0);
  const findings = signal<ReturnType<typeof findPreferredTermFindings>>([]);
  const activeLang = signal('en');

  beforeEach(() => {
    entry = new EditorEntryForm();
    editMode.set(false);
    readOnly.set(false);
    baseValueError.set(false);
    otherLocales.set(['fr', 'de']);
    similarCount.set(0);
    folder.set('common.buttons');
    needWorkCount.set(0);
    findings.set([]);
    activeLang.set('en');
    const state: EditorPresentationState = {
      isEditMode: editMode,
      isReadOnly: readOnly,
      otherLocales,
      similarCount,
      entry: { form: entry.form, needWorkCount, showBaseValueError: baseValueError },
      preferredTermFindings: findings,
      location: { selectedFolderPath: folder },
    };
    presentation = new EditorPresentation(state, { baseLocale: 'en' }, { translate, activeLang });
  });

  afterEach(() => {
    entry.destroy();
    vi.restoreAllMocks();
  });

  it('should return correct error message for required key', () => {
    entry.form.controls.key.setValue('');
    entry.form.controls.key.markAsTouched();
    expect(presentation.getKeyErrorMessage()).toBe(tokens.KEYREQUIRED);
  });

  it('should return correct error message for invalid pattern', () => {
    entry.form.controls.key.setValue('test key');
    entry.form.controls.key.markAsTouched();
    expect(presentation.getKeyErrorMessage()).toBe(tokens.KEYPATTERNERROR);
  });

  it('returns no key error message for a valid key', () => {
    entry.form.controls.key.setValue('valid_key');
    expect(presentation.getKeyErrorMessage()).toBe('');
  });

  it('should display correct save button label in edit mode', () => {
    editMode.set(true);
    expect(presentation.saveButtonLabel()).toBe(tokens.UPDATEBUTTON);
  });

  it('should display correct save button label in create mode', () => {
    expect(presentation.saveButtonLabel()).toBe(tokens.SAVEBUTTON);
  });

  it('selects the title and subtitle for create and edit modes', () => {
    expect(presentation.dialogTitle()).toBe(tokens.CREATETITLE);
    expect(presentation.dialogSubtitle()).toBe(tokens.CREATESUBTITLEX);
    editMode.set(true);
    expect(presentation.dialogTitle()).toBe(tokens.EDITTITLE);
    expect(presentation.dialogSubtitle()).toBe(tokens.EDITSUBTITLEX);
  });

  it('names locales in the active language and derives the base locale name', () => {
    expect(presentation.getLocaleDisplayName('fr-CA')).toBe(
      new Intl.DisplayNames(['en'], { type: 'language' }).of('fr-CA'),
    );
    expect(presentation.baseLocaleName()).toBe('English');
    activeLang.set('fr');
    expect(presentation.getLocaleDisplayName('en')).toBe('anglais');
    expect(presentation.baseLocaleName()).toBe('anglais');
  });

  it('uses an empty name for a missing locale and uppercase fallback names', () => {
    expect(presentation.getLocaleDisplayName(undefined)).toBe('');
    expect(presentation.getLocaleDisplayName('')).toBe('');
    vi.spyOn(Intl.DisplayNames.prototype, 'of').mockReturnValue('zz');
    expect(presentation.getLocaleDisplayName('zz')).toBe('ZZ');
    vi.mocked(Intl.DisplayNames.prototype.of).mockReturnValue(undefined);
    expect(presentation.getLocaleDisplayName('zz')).toBe('ZZ');
    expect(presentation.getLocaleDisplayName('invalid_locale')).toBe('INVALID_LOCALE');
  });

  it('uses uppercase locale codes when the active language is invalid', () => {
    activeLang.set('invalid_locale');
    expect(presentation.getLocaleDisplayName('fr')).toBe('FR');
  });

  it('summarizes the folder and similar count, including the root folder', () => {
    expect(presentation.contextSummary()).toBe('common.buttons');
    similarCount.set(2);
    expect(presentation.contextSummary()).toBe(`common.buttons · ${tokens.CONTEXT.SIMILARCOUNTX} 2`);
    folder.set('');
    expect(presentation.contextSummary()).toBe(
      `${TRACKER_TOKENS.BROWSER.FOLDERPICKER.ROOTLABEL} · ${tokens.CONTEXT.SIMILARCOUNTX} 2`,
    );
    similarCount.set(0);
    expect(presentation.contextSummary()).toBe(TRACKER_TOKENS.BROWSER.FOLDERPICKER.ROOTLABEL);
  });

  it('summarizes auto-translated locales for creates and needs-work locales for edits', () => {
    expect(presentation.otherLocalesSummary()).toBe(`${tokens.AUTOTRANSLATEDX} 2`);
    otherLocales.set([]);
    expect(presentation.otherLocalesSummary()).toBe(`${tokens.AUTOTRANSLATEDX} 0`);
    editMode.set(true);
    expect(presentation.otherLocalesSummary()).toBe(`${tokens.NEEDWORKX} 0`);
    needWorkCount.set(1);
    expect(presentation.otherLocalesSummary()).toBe(`${tokens.NEEDWORKX} 1`);
  });

  it('describes the base value with the hint or error and current advisories', () => {
    expect(presentation.preferredTermAdvisoriesId).toBe('translation-editor-preferred-terms');
    expect(presentation.baseValueDescribedBy()).toBe('translation-editor-icu-hint');
    baseValueError.set(true);
    expect(presentation.baseValueDescribedBy()).toBe('translation-editor-base-value-error');
    findings.set(findPreferredTermFindings('foo', [{ discouraged: 'foo', preferred: 'bar' }]));
    expect(presentation.baseValueDescribedBy()).toBe(
      'translation-editor-base-value-error translation-editor-preferred-terms',
    );
    baseValueError.set(false);
    expect(presentation.baseValueDescribedBy()).toBe('translation-editor-icu-hint translation-editor-preferred-terms');
    findings.set([]);
    expect(presentation.baseValueDescribedBy()).toBe('translation-editor-icu-hint');
  });

  it('joins only the applicable ids for aria-describedby', () => {
    expect(presentation.describedBy(presentation.baseValueDescribedBy(), presentation.runtimeAdvisoryId)).toBe(
      'translation-editor-icu-hint translation-editor-runtime-advisory',
    );
    expect(presentation.describedBy(false, null)).toBeNull();
    expect(presentation.describedBy(false, presentation.localeRuntimeAdvisoryId(2))).toBe(
      'translation-editor-locale-runtime-advisory-2',
    );
  });

  it('builds braced-placeholder params only when the control has the error', () => {
    const control = entry.form.controls.baseValue;
    control.setValue('Hi {{name}}');
    expect(presentation.bracedPlaceholderParams(control)).toBeUndefined();

    control.setValue('Hi {{{name}}}');
    expect(presentation.bracedPlaceholderParams(control)).toEqual({
      placeholder: '<code>&#123;&#123;name&#125;&#125;</code>',
      example: "<code>'&#123;'&#123;&#123;name&#125;&#125;'&#125;'</code>",
    });
  });

  it('escapes a hostile placeholder name in the braced-placeholder params', () => {
    const control = entry.form.controls.baseValue;
    control.setErrors({ bracedPlaceholder: { name: '<img src=x onerror=alert(1)>' } });
    const params = presentation.bracedPlaceholderParams(control);

    expect(params).toBeDefined();
    expect(params?.placeholder).not.toContain('<img');
    expect(params?.placeholder).toContain('&#60;img');
    expect(params?.example).toContain('&#60;img');
    expect(params?.example).not.toContain('<img');
  });

  it('keeps the app-owned ICU placeholder markup', () => {
    expect(presentation.icuPlaceholderMarkup).toBe('<code>&#123;count&#125;</code>');
  });

  it('explains a disabled other-locales row only when no other locales exist', () => {
    expect(presentation.otherLocalesDisabledTooltip()).toBe('');
    otherLocales.set([]);
    expect(presentation.otherLocalesDisabledTooltip()).toBe(tokens.NOOTHERLOCALESTOOLTIP);
  });

  it('explains a disabled location trigger only in read-only mode', () => {
    expect(presentation.locationDisabledTooltip()).toBe('');
    readOnly.set(true);
    expect(presentation.locationDisabledTooltip()).toBe(tokens.READONLYTABTOOLTIP);
  });

  it('uses the shared status label tokens', () => {
    expect(presentation.statusLabelToken('new')).toBe(TRACKER_TOKENS.BROWSER.STATUS.NEW);
    expect(presentation.statusLabelToken('translated')).toBe(TRACKER_TOKENS.BROWSER.STATUS.TRANSLATED);
  });
});
