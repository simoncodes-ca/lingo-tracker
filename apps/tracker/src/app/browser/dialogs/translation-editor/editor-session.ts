import { computed, type Signal, signal } from '@angular/core';
import type {
  FolderNodeDto,
  LingoTrackerConfigDto,
  ResourceSummaryDto,
  SearchResultDto,
  TranslationStatus,
} from '@simoncodes-ca/data-transfer';
import { DEFAULT_APP_RUNTIME, type PreferredTermRule, TRANSLATION_STATUSES } from '@simoncodes-ca/domain';
import { Subscription } from 'rxjs';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { copyWithFeedback } from '../../../shared/clipboard';
import type { ConfirmationSpec, ConfirmOptions } from '../../../shared/confirm';
import type { NotificationService } from '../../../shared/notification';
import { hasSearchLength } from '../../../shared/search/search-minimum';
import { createFlash } from '../../../shared/timed-transients';
import type { TokenTranslator } from '../../../shared/translate-token';
import type { Feedback } from '../../feedback';
import type { SimilarValues } from '../../services/similar-values';
import type { BrowserStore } from '../../store/browser.store';
import { filterFolderTree } from '../../store/folder-tree.utils';
import { EditorAdvisories, suggestTags } from './editor-advisories';
import { EditorEntryForm } from './editor-entry-form';
import type { EditorFocus } from './editor-focus';
import { EditorLocation, type EditorLocationPeek } from './editor-location';
import { EditorPanels } from './editor-panels';
import { EditorPresentation } from './editor-presentation';
import { type EditorOutcome, type EditorReveal, type EditorSubmitDecision, EditorSubmitSession } from './editor-submit';
import { resolveDraftKey, type UnrenderableWrite } from './resource-entry-draft';

export interface TranslationEditorDialogData {
  mode: 'create' | 'edit';
  resource?: ResourceSummaryDto;
  collectionName: string;
  folderPath?: string;
  availableLocales: string[];
  baseLocale: string;
  /** When true, the dialog opens in view-only mode: inputs disabled, no save. */
  readOnly?: boolean;
}

/** External reads, writes and presentation supplied to one editor; no injector or DOM required. */
export interface EditorSessionOptions {
  browser: Pick<
    InstanceType<typeof BrowserStore>,
    'rootFolders' | 'currentFolderPath' | 'translations' | 'createResource' | 'updateResource'
  >;
  config: Signal<LingoTrackerConfigDto | null>;
  peek: EditorLocationPeek;
  similar: Pick<SimilarValues, 'suggestions'>;
  translate: TokenTranslator;
  activeLang: () => string;
  confirm: (spec: ConfirmationSpec, options?: ConfirmOptions) => Promise<boolean>;
  close: (outcome: EditorOutcome) => void;
  editorFocus: Pick<EditorFocus, 'request'>;
  feedbackText: (feedback: Feedback) => string;
  notifications: Pick<NotificationService, 'success' | 'error'>;
}

/** Composes one editor's form, location, advice, panels and save protocol into its view model. */
export class EditorSession {
  readonly #subscriptions = new Subscription();
  readonly #copyFlash = createFlash(1500);

  readonly presentation: EditorPresentation;

  readonly errorMessage = signal<string | null>(null);
  readonly entry: EditorEntryForm;
  readonly advisories: EditorAdvisories;

  /** True for a moment after the footer key is copied, so the button can confirm it. */
  readonly keyJustCopied = this.#copyFlash.active;

  /** The folder popover, locales drawer and context disclosure; the template binds to it directly. */
  readonly panels: EditorPanels;

  readonly tagInputText = signal('');
  readonly inheritedTagsList = computed(() => this.data.resource?.inheritedTags ?? []);

  readonly location: EditorLocation;
  readonly submit: EditorSubmitSession;

  readonly otherLocales = computed(() =>
    this.data.availableLocales.filter((locale) => locale !== this.data.baseLocale),
  );

  readonly translationStatusOptions: TranslationStatus[] = [...TRANSLATION_STATUSES];

  readonly isEditMode = computed(() => this.data.mode === 'edit');
  /** Whether the dialog is view-only because the collection is read-only. */
  readonly isReadOnly = computed(() => this.data.readOnly === true);
  readonly hasSearchQuery = computed(() => hasSearchLength(this.advisories.baseValueText().trim()));

  /** How many similar values are pinned in the context column right now. */
  readonly similarCount = computed(() => this.advisories.similarResources().length);

  /**
   * The similar-values block only exists once the search has hits to show. It
   * never stands in for a pending search: the results clear the moment the
   * English value changes, so an empty block would be a placeholder, not news.
   */
  readonly showSimilarContext = computed(() => this.similarCount() > 0);

  /** The key carrying the exact same text, or '' when no hit matches verbatim. */
  readonly exactMatchKey = computed(() => this.advisories.exactMatch()?.fullKey ?? '');

  /** Root folders narrowed by the popover's filter, pruned to the matching subtrees. */
  readonly filteredRootFolders = computed(() =>
    filterFolderTree(this.options.browser.rootFolders(), this.panels.folderFilter()),
  );

  /** The folder the popover's primary button would commit. */
  readonly popoverFolderPath = computed(() => this.panels.stagedFolderPath() ?? this.location.selectedFolderPath());

  readonly filteredTagSuggestions: Signal<string[]>;

  constructor(
    private readonly data: TranslationEditorDialogData,
    private readonly options: EditorSessionOptions,
  ) {
    this.entry = new EditorEntryForm(
      () => this.location.keyCollision(),
      () => this.options.config()?.runtime ?? DEFAULT_APP_RUNTIME,
    );
    this.panels = new EditorPanels({
      editorFocus: this.options.editorFocus,
      canOpenFolderPopover: () => !this.isReadOnly(),
      canOpenLocalesDrawer: () => this.otherLocales().length > 0,
    });
    this.advisories = new EditorAdvisories(this.options.config);
    this.location = new EditorLocation({
      collectionName: this.data.collectionName,
      mode: this.data.mode,
      original: this.data.resource,
      rootFolders: this.options.browser.rootFolders,
      browserFolderPath: this.options.browser.currentFolderPath,
      browserEntries: this.options.browser.translations,
      peek: this.options.peek,
      absorbedLabel: (folder) =>
        this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.LOCATIONFROMKEYX, { folder }),
      moreLabel: (count) =>
        this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONTEXT.MOREENTRIESX, { count }),
    });
    this.submit = new EditorSubmitSession({
      writes: {
        create: (dto) => this.options.browser.createResource(this.data.collectionName, dto),
        update: (dto) => this.options.browser.updateResource(this.data.collectionName, dto),
      },
      confirmUnrenderable: (findings) => this.#showRuntimeConfirmation(findings),
      confirmMissingComment: () => this.#showCommentConfirmation(),
      chooseConflict: (fullKey) => this.#showKeyConflictDialog(fullKey),
      onWriteStart: () => this.errorMessage.set(null),
    });
    this.filteredTagSuggestions = suggestTags({
      entries: options.browser.translations,
      inputText: this.tagInputText,
      tags: this.entry.tags,
      inheritedTags: this.inheritedTagsList,
    });
    this.presentation = new EditorPresentation(
      {
        isEditMode: this.isEditMode,
        isReadOnly: this.isReadOnly,
        otherLocales: this.otherLocales,
        similarCount: this.similarCount,
        entry: this.entry,
        preferredTermFindings: this.advisories.preferredTermFindings,
        location: this.location,
      },
      data,
      options,
    );
    this.#initialize();
  }

  #initialize(): void {
    // Initialize folder path from dialog data
    this.location.pick(this.data.folderPath || '');
    this.entry.seed(
      this.data.availableLocales,
      this.data.baseLocale,
      this.isEditMode() ? this.data.resource : undefined,
      this.location.selectedFolderPath(),
    );

    const baseValue = this.entry.form.controls.baseValue;
    this.advisories.observe(
      baseValue.value,
      baseValue.valueChanges,
      this.options.similar.suggestions(
        baseValue.valueChanges,
        this.data.collectionName,
        this.isEditMode() ? this.entry.initialBaseValue() : undefined,
        this.#originalEntry()?.fullKey,
      ),
    );

    this.#setupDottedKeyAbsorption();

    // View-only mode: lock down all inputs. Save is hidden in the template.
    if (this.isReadOnly()) {
      this.entry.form.disable({ emitEvent: false });
    }
  }

  /** True when closing now would throw away work the user has done. */
  hasUnsavedChanges(): boolean {
    if (this.isReadOnly() || this.submit.isSubmitting()) {
      return false;
    }
    return this.entry.hasUnsavedChanges(this.location.selectedFolderPath());
  }

  /** The entry an edit started from, or undefined in create mode. */
  #originalEntry(): ResourceSummaryDto | undefined {
    return this.isEditMode() ? this.data.resource : undefined;
  }

  destroy(): void {
    this.#copyFlash.destroy();
    this.#subscriptions.unsubscribe();
    this.advisories.destroy();
    this.entry.destroy();
    this.location.destroy();
  }

  /**
   * "Use …": rewrites the rule's discouraged term to the preferred spelling
   * through the ordinary value-change path, as if typed, and never saves. The
   * note goes at once rather than after the debounce, and the caret goes back
   * to the field because the button it was on no longer exists.
   */
  onApplyPreferredTerm(rule: PreferredTermRule): void {
    if (this.isReadOnly()) {
      return;
    }
    this.advisories.applyTerm(this.entry.form.controls.baseValue, rule);
    this.options.editorFocus.request('base-value');
  }

  /**
   * A dotted key typed into the single-segment key field moves its prefix into the
   * location pill; `absorbDottedKey` holds the rule.
   *
   * Listening on `valueChanges` covers every way text arrives: typed, pasted,
   * dropped, or completed by the browser. The segment validator stays on as the
   * backstop for characters that are invalid in any position.
   */
  #setupDottedKeyAbsorption(): void {
    this.location.typeKey(this.entry.form.controls.key.value);
    this.#subscriptions.add(
      this.entry.form.controls.key.valueChanges.subscribe((value) => {
        const absorbed = this.location.typeKey(value);
        if (!absorbed) {
          return;
        }

        this.#setKeyControl(absorbed.leaf);
      }),
    );
  }

  /** Writes the leaf without re-entering the key's valueChanges subscription. */
  #setKeyControl(leaf: string): void {
    const control = this.entry.form.controls.key;
    control.setValue(leaf, { emitEvent: false });
    control.markAsDirty();
    control.updateValueAndValidity({ emitEvent: false });
    this.entry.publishSnapshot();
  }

  /** Confirms the folder staged in the popover and closes it. */
  confirmStagedFolder(): void {
    const staged = this.panels.confirmStagedFolder();
    if (staged !== null) {
      this.location.pick(staged);
    }
  }

  /** Writes a status from the per-locale pill menu into the same FormArray as before. */
  setLocaleStatus(index: number, status: TranslationStatus): void {
    const group = this.entry.getLocaleFormGroup(index);
    group.controls.status.setValue(status);
    group.controls.status.markAsDirty();
  }

  async onCancel(): Promise<void> {
    // Escape and the close button reach here; an open panel is the nearest thing
    // to dismiss, so it goes first and the form stays untouched.
    if (this.panels.dismissNearest()) {
      return;
    }
    if (this.hasUnsavedChanges() && !(await this.#confirmDiscard())) {
      return;
    }
    this.options.close({ kind: 'cancelled' });
  }

  #confirmDiscard(): Promise<boolean> {
    const spec = {
      title: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.TITLE,
      message: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.MESSAGE,
      confirmButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.DISCARD,
      cancelButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.KEEPEDITING,
    };

    return this.options.confirm(spec, { width: '440px', disableClose: true });
  }

  onFolderConfirmed(folderPath: string): void {
    this.location.pick(folderPath);
  }

  onFolderCreated(folder: FolderNodeDto): void {
    // The store's createFolder already updated rootFolders; update the selection.
    this.location.pick(folder.fullPath);
    this.panels.stageFolder(folder.fullPath);
  }

  addTagValue(rawValue: string): void {
    this.entry.addTag(rawValue);
    this.tagInputText.set('');
  }

  removeTag(tag: string): void {
    this.entry.removeTag(tag, this.inheritedTagsList());
  }

  /**
   * Leaves for the entry that already holds this key. Same close payload as the
   * conflict dialog's "Edit existing", and the same unsaved-work guard as any
   * other way out of the dialog.
   */
  async openExistingResource(): Promise<void> {
    const existingKey = resolveDraftKey(this.entry.draft(this.location.selectedFolderPath()));

    if (this.hasUnsavedChanges() && !(await this.#confirmDiscard())) {
      return;
    }

    this.options.close({ kind: 'open-existing', fullKey: existingKey });
  }

  onSimilarResourceClick(result: SearchResultDto): void {
    this.#copyToClipboard(result.fullKey, this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYCOPIED));
  }

  /**
   * The footer is the only place the full dotted key is spelled out, so it is
   * also the place to take it from. Same clipboard path and same snackbar the
   * row's key chip uses, plus a check glyph while the toast is still up.
   */
  copyFullKey(): void {
    this.#copyToClipboard(
      this.location.fullKeyPreview(),
      this.options.translate(TRACKER_TOKENS.BROWSER.TOAST.COPIEDTOCLIPBOARD),
      () => this.#copyFlash.trigger(),
    );
  }

  #copyToClipboard(text: string, successMessage: string, onCopied?: () => void): void {
    const failedMessage = this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COPYFAILED);
    void copyWithFeedback(text, {
      successMessage,
      failedMessage,
      notifications: this.options.notifications,
      onCopied,
    });
  }

  async onSubmit(): Promise<void> {
    const decision = await this.submit.trigger({
      mode: this.data.mode,
      draft: this.entry.draft(this.location.selectedFolderPath()),
      original: this.#originalEntry(),
      readOnly: this.isReadOnly(),
      validation: {
        invalid: this.entry.form.invalid,
        keyInvalid: this.entry.form.controls.key.invalid,
        baseValueInvalid: this.entry.form.controls.baseValue.invalid,
        firstInvalidLocaleIndex: this.entry.firstInvalidLocaleIndex(),
      },
      collision: this.location.keyCollision(),
      runtime: this.options.config()?.runtime ?? DEFAULT_APP_RUNTIME,
      baseLocale: this.data.baseLocale,
    });
    this.#renderSubmitDecision(decision);
  }

  #applyReveal(reveal: EditorReveal): void {
    if (reveal.panels === 'locales') {
      this.panels.closeFolderPopover(false);
      this.panels.openLocalesDrawer();
    } else if (reveal.panels === 'close-all') {
      this.panels.closeAll();
    }
    this.options.editorFocus.request(reveal.focus);
  }

  #renderSubmitDecision(decision: EditorSubmitDecision): void {
    if (decision.kind === 'ignored') return;
    if (decision.kind === 'invalid') {
      this.entry.submitAttempted.set(true);
      this.entry.form.markAllAsTouched();
      this.errorMessage.set(this.options.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.FIXERRORS));
      this.#applyReveal(decision.reveal);
      return;
    }
    if (decision.kind === 'reveal') {
      this.#applyReveal(decision.reveal);
      return;
    }
    if (decision.kind === 'outcome') {
      this.options.close(decision.outcome);
      return;
    }

    this.errorMessage.set(this.options.feedbackText(decision.feedback));
  }

  #showKeyConflictDialog(existingKey: string): Promise<boolean> {
    const spec = {
      title: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.TITLE,
      message: {
        token: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.MESSAGEX,
        params: {
          key: existingKey,
        },
      },
      confirmButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.EDITEXISTING,
      cancelButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONFLICT.CHOOSEDIFFERENTKEY,
    };

    return this.options.confirm(spec, { width: '500px' });
  }

  #showRuntimeConfirmation(findings: readonly UnrenderableWrite[]): Promise<boolean> {
    const tokens = TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.RUNTIMECONFIRM;
    const details = findings
      .map(({ locale, kinds }) => `${this.presentation.getLocaleDisplayName(locale)}: ${kinds.join(', ')}`)
      .join('; ');
    const spec = {
      title: tokens.TITLE,
      message: { token: tokens.MESSAGEX, params: { details } },
      confirmButtonText: tokens.SAVEANYWAY,
      cancelButtonText: tokens.GOBACK,
    };

    return this.options.confirm(spec, { width: '460px', disableClose: true });
  }

  #showCommentConfirmation(): Promise<boolean> {
    const spec = {
      title: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.TITLE,
      message: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.MESSAGE,
      confirmButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.SAVEANYWAY,
      cancelButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.ADDCOMMENT,
    };

    return this.options.confirm(spec, { width: '400px', disableClose: true });
  }
}
