import { computed, type Signal } from '@angular/core';
import type { AbstractControl } from '@angular/forms';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import type { TokenTranslator } from '../../../shared/translate-token';
import { statusLabelTokenFor } from '../../../shared/translation-status/translation-status-presentation';
import type { EditorAdvisories } from './editor-advisories';
import type { EditorEntryForm } from './editor-entry-form';
import type { EditorLocation } from './editor-location';

/** Read-only state needed to derive the editor's text, markup and aria IDs. */
export interface EditorPresentationState {
  readonly isEditMode: Signal<boolean>;
  readonly isReadOnly: Signal<boolean>;
  readonly otherLocales: Signal<readonly string[]>;
  readonly similarCount: Signal<number>;
  readonly entry: Pick<EditorEntryForm, 'needWorkCount' | 'form' | 'showBaseValueError'>;
  readonly preferredTermFindings: EditorAdvisories['preferredTermFindings'];
  readonly location: Pick<EditorLocation, 'selectedFolderPath'>;
}

export interface EditorPresentationOptions {
  translate: TokenTranslator;
  activeLang: () => string;
}

/** Display-only derivations for one editor; no injector, DOM or lifecycle required. */
export class EditorPresentation {
  readonly preferredTermAdvisoriesId = 'translation-editor-preferred-terms';
  readonly runtimeAdvisoryId = 'translation-editor-runtime-advisory';

  /** Id of the runtime advisory beside one locale's translation field. */
  localeRuntimeAdvisoryId(index: number): string {
    return `translation-editor-locale-runtime-advisory-${index}`;
  }

  /** Joins the ids that apply into an `aria-describedby` value, or `null` when none do. */
  describedBy(...ids: readonly (string | false | null)[]): string | null {
    const present = ids.filter((id): id is string => !!id);
    return present.length > 0 ? present.join(' ') : null;
  }

  /**
   * The base value's `aria-describedby`: the error or ICU hint as before, plus
   * the advisories while there are any.
   */
  readonly baseValueDescribedBy = computed(() => {
    const ids = [
      this.inputs.entry.showBaseValueError() ? 'translation-editor-base-value-error' : 'translation-editor-icu-hint',
    ];
    if (this.inputs.preferredTermFindings().length > 0) {
      ids.push(this.preferredTermAdvisoriesId);
    }
    return ids.join(' ');
  });

  readonly dialogTitle = computed(() =>
    this.inputs.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITTITLE
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATETITLE,
  );

  readonly dialogSubtitle = computed(() =>
    this.inputs.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITSUBTITLEX
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATESUBTITLEX,
  );

  readonly saveButtonLabel = computed(() =>
    this.inputs.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UPDATEBUTTON
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.SAVEBUTTON,
  );

  /** Transloco token for a status label, from the shared status presentation, so the spine never shows raw enum text. */
  readonly statusLabelToken = statusLabelTokenFor;

  /** Explains a disabled Other locales row instead of leaving it silently grey. */
  readonly otherLocalesDisabledTooltip = computed(() =>
    this.inputs.otherLocales().length === 0
      ? this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.NOOTHERLOCALESTOOLTIP)
      : '',
  );

  /** Explains a disabled location trigger instead of leaving it silently grey. */
  readonly locationDisabledTooltip = computed(() =>
    this.inputs.isReadOnly() ? this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.READONLYTABTOOLTIP) : '',
  );

  /** The base locale under a name a reader recognises ("English"), for the value label. */
  readonly baseLocaleName = computed(() => this.getLocaleDisplayName(this.data.baseLocale));

  /** The right-hand summary on the "Other locales" row, already localized. */
  readonly otherLocalesSummary = computed(() =>
    this.inputs.isEditMode()
      ? this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.NEEDWORKX, {
          count: this.inputs.entry.needWorkCount(),
        })
      : this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.AUTOTRANSLATEDX, {
          count: this.inputs.otherLocales().length,
        }),
  );

  /** The one-line summary the narrow "Context" disclosure carries. */
  readonly contextSummary = computed(() => {
    // The key itself is not summarised here: the footer carries it in full, and
    // the form's own key error carries the collision.
    const parts = [
      this.inputs.location.selectedFolderPath() ||
        this.options.translate(TRACKER_TOKENS.BROWSER.FOLDERPICKER.ROOTLABEL),
    ];
    if (this.inputs.similarCount() > 0) {
      parts.push(
        this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONTEXT.SIMILARCOUNTX, {
          count: this.inputs.similarCount(),
        }),
      );
    }
    return parts.join(' · ');
  });

  /**
   * App-owned markup, never translator input, so the ICU hint can carry a <code>
   * run. The braces are HTML entities: a literal `{count}` handed to Transloco
   * as a parameter is re-read as an ICU argument and resolves to `undefined`.
   */
  readonly icuPlaceholderMarkup = '<code>&#123;count&#125;</code>';

  /** Same entity trick as `icuPlaceholderMarkup`; the apostrophes are literal, not ICU quoting. */
  readonly icuQuotedBracesMarkup = "<code>'&#123;'name'&#125;'</code>";

  /**
   * The braced-placeholder error's params as markup, `undefined` without the error.
   * Braces are HTML entities for the same reason as `icuPlaceholderMarkup`. The
   * name is user text, so it is escaped.
   */
  bracedPlaceholderParams(control: AbstractControl): { placeholder: string; example: string } | undefined {
    const error: { name: string } | null = control.getError('bracedPlaceholder');
    if (!error) {
      return undefined;
    }
    const placeholder = `&#123;&#123;${escapeHtml(error.name)}&#125;&#125;`;
    return { placeholder: `<code>${placeholder}</code>`, example: `<code>'&#123;'${placeholder}'&#125;'</code>` };
  }

  /**
   * Renders a locale as a name the reader recognises ("French (Canada)") with
   * the raw code as the fallback, rather than shouting `FR-CA` at them.
   */
  getLocaleDisplayName(locale: string | undefined): string {
    if (!locale) {
      return '';
    }

    const code = locale.toUpperCase();
    try {
      const names = new Intl.DisplayNames([this.options.activeLang()], {
        type: 'language',
      });
      const name = names.of(locale);
      return name && name.toLowerCase() !== locale.toLowerCase() ? name : code;
    } catch {
      return code;
    }
  }

  getKeyErrorMessage(): string {
    const keyControl = this.inputs.entry.form.controls.key;

    if (keyControl.hasError('required')) {
      return TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYREQUIRED;
    }

    if (keyControl.hasError('pattern')) {
      return TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYPATTERNERROR;
    }

    return '';
  }

  constructor(
    private readonly inputs: EditorPresentationState,
    private readonly data: { readonly baseLocale: string },
    private readonly options: EditorPresentationOptions,
  ) {}
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"'{}]/g, (char) => `&#${char.charCodeAt(0)};`);
}
