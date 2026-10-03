import { OverlayModule } from '@angular/cdk/overlay';
import { TextFieldModule } from '@angular/cdk/text-field';
import { CommonModule } from '@angular/common';
import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  HostListener,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { type FormControl, type FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, type MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type {
  FolderNodeDto,
  ResourceSummaryDto,
  SearchResultDto,
  TranslationStatus,
} from '@simoncodes-ca/data-transfer';
import { type PreferredTermRule, TRANSLATION_STATUSES } from '@simoncodes-ca/domain';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TRACKER_TOKENS } from '../../../../i18n-types/tracker-resources';
import { CollectionsStore } from '../../../collections/store/collections.store';
import { ChipInput } from '../../../shared/chip-input/chip-input';
import { copyToClipboard } from '../../../shared/clipboard';
import { injectConfirm } from '../../../shared/confirm';
import { NotificationService } from '../../../shared/notification';
import { hasSearchLength } from '../../../shared/search/search-minimum';
import { injectFlash, injectRestartableDelay } from '../../../shared/timed-transients';
import { statusLabelTokenFor } from '../../../shared/translation-status/translation-status-presentation';
import { injectFeedback } from '../../feedback';
import { FolderPeek } from '../../services/folder-peek';
import { SimilarValues } from '../../services/similar-values';
import { BrowserStore } from '../../store/browser.store';
import { filterFolderTree } from '../../store/folder-tree.utils';
import { EditorAdvisories, filteredEditorTagSuggestions } from './editor-advisories';
import { EditorEntryForm } from './editor-entry-form';
import { editorTagSuggestions } from './editor-entry-sources';
import { EditorLocation } from './editor-location';
import { type EditorOutcome, type EditorSubmitDecision, EditorSubmitSession } from './editor-submit';
import { FolderPicker } from './folder-picker/folder-picker';
import { PreferredTermAdvisories } from './preferred-term-advisories/preferred-term-advisories';
import { resolveDraftKey } from './resource-entry-draft';
import { SimilarTranslations } from './similar-translations';

/**
 * The id of the dialog's heading. The MatDialog container is labelled by this id
 * (`ariaLabelledBy`) and the template stamps it onto the `<h2>`, so the two can
 * never drift apart.
 */
export const TRANSLATION_EDITOR_TITLE_ID = 'translation-editor-title';

/** Id of the preferred-terminology advisories, joined to the base value's `aria-describedby`. */
export const PREFERRED_TERM_ADVISORIES_ID = 'translation-editor-preferred-terms';

export { PREFERRED_TERM_DEBOUNCE_MS } from './editor-advisories';

/** The collection and entry to edit, or the folder in which to create one. */
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

/**
 * How the editor closed: the one result its launcher (`TranslationEditorLauncher`) reads.
 * `skippedLocales` are the locales auto-translation skipped (for any reason, not only ICU format), possibly none.
 */
export type { EditorOutcome } from './editor-submit';

@Component({
  standalone: true,
  selector: 'app-translation-editor-dialog',
  templateUrl: './translation-editor-dialog.html',
  styleUrls: ['./translation-editor-dialog.scss', './translation-editor-context.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    OverlayModule,
    TextFieldModule,
    MatAutocompleteModule,
    SimilarTranslations,
    FolderPicker,
    TranslocoPipe,
    MatTooltipModule,
    PreferredTermAdvisories,
    ChipInput,
  ],
})
export class TranslationEditorDialog implements OnInit, OnDestroy, AfterViewInit {
  private readonly dialogRef = inject<MatDialogRef<TranslationEditorDialog, EditorOutcome>>(MatDialogRef);
  private readonly confirm = injectConfirm();
  private readonly feedback = injectFeedback();
  private readonly folderPeek = inject(FolderPeek).openFolderPeek();
  private readonly similarValues = inject(SimilarValues);
  private readonly browserStore = inject(BrowserStore);
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  readonly #collectionsStore = inject(CollectionsStore);
  private readonly destroy$ = new Subject<void>();

  readonly data = inject<TranslationEditorDialogData>(MAT_DIALOG_DATA);
  readonly TOKENS = TRACKER_TOKENS;
  /** Exposed to the template so the heading id matches the container's `aria-labelledby`. */
  readonly titleId = TRANSLATION_EDITOR_TITLE_ID;

  @ViewChild('keyInput') keyInput?: ElementRef<HTMLInputElement>;
  @ViewChild('baseValueInput') baseValueInput?: ElementRef<HTMLTextAreaElement>;
  /** The Comment field, so the empty-comment confirmation can hand the caret to it. */
  @ViewChild('commentInput') commentInput?: ElementRef<HTMLTextAreaElement>;
  /** The tree inside the location popover, so "New folder" can reuse its creation flow. */
  @ViewChild(FolderPicker) folderPicker?: FolderPicker;
  /** Focus anchors: opening a panel moves focus in, closing it hands focus back. */
  @ViewChild('locationPill') locationPill?: ElementRef<HTMLButtonElement>;
  @ViewChild('otherLocalesRow') otherLocalesRow?: ElementRef<HTMLButtonElement>;
  @ViewChild('folderFilterInput') folderFilterInput?: ElementRef<HTMLInputElement>;
  @ViewChild('drawerFirstControl') drawerFirstControl?: ElementRef<HTMLElement>;

  readonly #resetLocationFlash = injectRestartableDelay(900);
  readonly #keyCopiedFlash = injectFlash(1500);

  readonly errorMessage = signal<string | null>(null);
  readonly #entryForm = new EditorEntryForm();
  readonly #advisories = new EditorAdvisories(this.#collectionsStore.config);
  readonly similarResources = this.#advisories.similarResources;
  readonly isSearchingSimilar = this.#advisories.isSearchingSimilar;
  readonly baseValueLength = this.#advisories.baseValueLength;
  readonly baseValueText = this.#advisories.baseValueText;
  /** True while the location pill is highlighting a folder it just absorbed from the key field. */
  readonly locationAbsorbedFlash = signal(false);
  /** Live-region text announcing the same move to a screen reader, which cannot see the flash. */
  readonly locationAbsorbedMessage = signal('');
  /** Set once the user attempts to save, so errors surface on untouched fields too. */
  readonly submitAttempted = signal(false);
  /** True for a moment after the footer key is copied, so the button can confirm it. */
  readonly keyJustCopied = this.#keyCopiedFlash.active;

  /** The folder picker popover anchored to the location pill. */
  readonly isFolderPopoverOpen = signal(false);
  /** The folder staged inside the popover; only committed by "Use this folder". */
  readonly stagedFolderPath = signal<string | null>(null);
  /** Filter text typed in the popover, matched against folder paths. */
  readonly folderFilter = signal('');
  /** The other-locales drawer sliding over the context column. */
  readonly isLocalesDrawerOpen = signal(false);
  /** The context disclosure shown in place of the column below 1100px. */
  readonly isContextOpen = signal(false);

  /** Preferred-term findings follow the checked value held by Editor Advisories. */
  readonly preferredTermFindings = this.#advisories.preferredTermFindings;

  readonly preferredTermAdvisoriesId = PREFERRED_TERM_ADVISORIES_ID;

  /**
   * The base value's `aria-describedby`: the error or ICU hint as before, plus
   * the advisories while there are any.
   */
  readonly baseValueDescribedBy = computed(() => {
    const ids = [this.showBaseValueError() ? 'translation-editor-base-value-error' : 'translation-editor-icu-hint'];
    if (this.preferredTermFindings().length > 0) {
      ids.push(PREFERRED_TERM_ADVISORIES_ID);
    }
    return ids.join(' ');
  });

  readonly tagInputText = signal('');
  readonly tagsList = this.#entryForm.tags;
  readonly inheritedTagsList = computed(() => this.data.resource?.inheritedTags ?? []);

  readonly form = this.#entryForm.form;

  readonly #location = new EditorLocation({
    collectionName: this.data.collectionName,
    mode: this.data.mode,
    original: this.data.resource,
    rootFolders: this.browserStore.rootFolders,
    browserFolderPath: this.browserStore.currentFolderPath,
    browserEntries: this.browserStore.translations,
    peek: this.folderPeek,
    moreLabel: (count) =>
      this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONTEXT.MOREENTRIESX, { count }),
  });
  readonly #submit = new EditorSubmitSession({
    writes: {
      create: (dto) => this.browserStore.createResource(this.data.collectionName, dto),
      update: (dto) => this.browserStore.updateResource(this.data.collectionName, dto),
    },
    confirmMissingComment: () => this.#showCommentConfirmation(),
    chooseConflict: (fullKey) => this.#showKeyConflictDialog(fullKey),
    onWriteStart: () => this.errorMessage.set(null),
  });
  readonly isSubmitting = this.#submit.isSubmitting;
  readonly selectedFolderPath = this.#location.selectedFolderPath;
  readonly rootFolders = this.browserStore.rootFolders;

  readonly otherLocales = computed(() =>
    this.data.availableLocales.filter((locale) => locale !== this.data.baseLocale),
  );

  readonly translationStatusOptions: TranslationStatus[] = [...TRANSLATION_STATUSES];

  readonly isEditMode = computed(() => this.data.mode === 'edit');
  /** Whether the dialog is view-only because the collection is read-only. */
  readonly isReadOnly = computed(() => this.data.readOnly === true);
  readonly dialogTitle = computed(() =>
    this.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITTITLE
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATETITLE,
  );
  readonly dialogSubtitle = computed(() =>
    this.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.EDITSUBTITLEX
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CREATESUBTITLEX,
  );
  readonly saveButtonLabel = computed(() =>
    this.isEditMode()
      ? TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UPDATEBUTTON
      : TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.SAVEBUTTON,
  );
  readonly hasSearchQuery = computed(() => hasSearchLength(this.baseValueText().trim()));

  /** Form validity and errors react to the entry form's raw snapshot. */
  readonly #formState = this.#entryForm.formState;

  /** Live "this key is already taken in the target folder" state. */
  readonly keyCollision = this.#location.keyCollision;

  /** Live form validity, for the footer's earned check glyph. */
  readonly isFormValid = computed(() => {
    this.#formState();
    return this.form.valid && !this.keyCollision();
  });

  /** True once the key control is both invalid and worth complaining about. */
  readonly showKeyError = computed(() => {
    this.#formState();
    return this.form.controls.key.invalid && (this.form.controls.key.touched || this.submitAttempted());
  });

  /** True once the English value is both missing and worth complaining about. */
  readonly showBaseValueError = computed(() => {
    this.#formState();
    return this.form.controls.baseValue.invalid && (this.form.controls.baseValue.touched || this.submitAttempted());
  });

  /** Transloco token for a status label, from the shared status presentation, so the spine never shows raw enum text. */
  readonly statusLabelToken = statusLabelTokenFor;

  /** Explains a disabled Other locales row instead of leaving it silently grey. */
  readonly otherLocalesDisabledTooltip = computed(() =>
    this.otherLocales().length === 0
      ? this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.NOOTHERLOCALESTOOLTIP)
      : '',
  );

  /** Explains a disabled location trigger instead of leaving it silently grey. */
  readonly locationDisabledTooltip = computed(() =>
    this.isReadOnly() ? this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.READONLYTABTOOLTIP) : '',
  );

  /** The complete dot-delimited key, for the location pill's tooltip. */
  readonly fullKeyPreview = this.#location.fullKeyPreview;

  /** The base locale under a name a reader recognises ("English"), for the value label. */
  readonly baseLocaleName = computed(() => this.getLocaleDisplayName(this.data.baseLocale));

  /** The target folder split into the segments the location pill renders with `›` between them. */
  readonly folderSegments = this.#location.folderSegments;

  /** Every non-base locale with the value and status the form currently holds. */
  readonly localeSummaries = this.#entryForm.localeSummaries;

  /**
   * The locales a reviewer still owes work on. The context column lists these
   * alone: a locale that is already translated or verified is not news.
   */
  readonly localesNeedingWork = this.#entryForm.localesNeedingWork;

  /** Locales that are new or stale: the ones a reviewer still owes work on. */
  readonly needWorkCount = this.#entryForm.needWorkCount;

  /** The right-hand summary on the "Other locales" row, already localized. */
  readonly otherLocalesSummary = computed(() =>
    this.isEditMode()
      ? this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.NEEDWORKX, { count: this.needWorkCount() })
      : this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.AUTOTRANSLATEDX, {
          count: this.otherLocales().length,
        }),
  );

  /** How many similar values are pinned in the context column right now. */
  readonly similarCount = computed(() => this.similarResources().length);

  /**
   * The similar-values block only exists once the search has hits to show. It
   * never stands in for a pending search: the results clear the moment the
   * English value changes, so an empty block would be a placeholder, not news.
   */
  readonly showSimilarContext = computed(() => this.similarCount() > 0);

  /**
   * A pinned hit whose base value is the typed value, ignoring case. The entry
   * is not merely similar — it is the same string under a key that already
   * exists, which is the one case worth saying out loud.
   */
  readonly exactMatch = this.#advisories.exactMatch;

  /** The key carrying the exact same text, or '' when no hit matches verbatim. */
  readonly exactMatchKey = computed(() => this.exactMatch()?.fullKey ?? '');

  /** The one-line summary the narrow "Context" disclosure carries. */
  readonly contextSummary = computed(() => {
    // The key itself is not summarised here: the footer carries it in full, and
    // the form's own key error carries the collision.
    const parts = [
      this.selectedFolderPath() || this.transloco.translate(TRACKER_TOKENS.BROWSER.FOLDERPICKER.ROOTLABEL),
    ];
    if (this.similarCount() > 0) {
      parts.push(
        this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.CONTEXT.SIMILARCOUNTX, {
          count: this.similarCount(),
        }),
      );
    }
    return parts.join(' · ');
  });

  /** The mini tree in "Where it lands". */
  readonly contextTree = this.#location.contextTree;

  /** Root folders narrowed by the popover's filter, pruned to the matching subtrees. */
  readonly filteredRootFolders = computed(() => filterFolderTree(this.rootFolders(), this.folderFilter()));

  /** The folder the popover's primary button would commit. */
  readonly popoverFolderPath = computed(() => this.stagedFolderPath() ?? this.selectedFolderPath());

  /**
   * App-owned markup, never translator input, so the ICU hint can carry a <code>
   * run. The braces are HTML entities: a literal `{count}` handed to Transloco
   * as a parameter is re-read as an ICU argument and resolves to `undefined`.
   */
  readonly icuPlaceholderMarkup = '<code>&#123;count&#125;</code>';

  readonly allTagSuggestions = editorTagSuggestions(this.browserStore);

  readonly filteredTagSuggestions = computed(() =>
    filteredEditorTagSuggestions(
      this.tagInputText(),
      this.tagsList(),
      this.inheritedTagsList(),
      this.allTagSuggestions(),
    ),
  );

  ngOnInit(): void {
    // Initialize folder path from dialog data
    this.#location.pick(this.data.folderPath || '');
    this.#entryForm.seed(
      this.data.availableLocales,
      this.data.baseLocale,
      this.isEditMode() ? this.data.resource : undefined,
      this.selectedFolderPath(),
    );

    const baseValue = this.form.controls.baseValue;
    this.#advisories.observe(
      baseValue.value,
      baseValue.valueChanges,
      this.similarValues.suggestions(
        baseValue.valueChanges,
        this.data.collectionName,
        this.isEditMode() ? this.#entryForm.initialBaseValue() : undefined,
        this.#originalEntry()?.fullKey,
      ),
    );

    this.#setupDottedKeyAbsorption();

    // View-only mode: lock down all inputs. Save is hidden in the template.
    if (this.isReadOnly()) {
      this.form.disable({ emitEvent: false });
    }

    this.#guardAgainstAccidentalClose();
  }

  /**
   * Escape and backdrop clicks used to discard the whole form without a word.
   * Take ownership of both so an edited entry always gets a confirmation first.
   */
  #guardAgainstAccidentalClose(): void {
    this.dialogRef.disableClose = true;

    this.dialogRef
      .keydownEvents()
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          void this.onCancel();
        }
      });

    this.dialogRef
      .backdropClick()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        void this.onCancel();
      });
  }

  /** True when closing now would throw away work the user has done. */
  hasUnsavedChanges(): boolean {
    if (this.isReadOnly() || this.isSubmitting()) {
      return false;
    }
    return this.#entryForm.hasUnsavedChanges(this.selectedFolderPath());
  }

  /** The entry an edit started from, or undefined in create mode. */
  #originalEntry(): ResourceSummaryDto | undefined {
    return this.isEditMode() ? this.data.resource : undefined;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.#advisories.destroy();
    this.#entryForm.destroy();
    this.#location.destroy();
  }

  ngAfterViewInit(): void {
    this.dialogRef.afterOpened().subscribe(() => {
      if (this.isEditMode()) {
        this.baseValueInput?.nativeElement.focus();
      } else {
        this.keyInput?.nativeElement.focus();
      }
    });
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
    this.#advisories.applyTerm(this.form.controls.baseValue, rule);
    this.#focusOnceRendered(() => this.baseValueInput?.nativeElement);
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
    this.#location.typeKey(this.form.controls.key.value);
    this.form.controls.key.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      const absorbed = this.#location.typeKey(value);
      if (!absorbed) {
        return;
      }

      this.#setKeyControl(absorbed.leaf);

      if (absorbed.folder !== undefined) {
        this.#announceLocationAbsorbed(absorbed.folder);
      }
    });
  }

  /** Writes the leaf without re-entering the key's valueChanges subscription. */
  #setKeyControl(leaf: string): void {
    const control = this.form.controls.key;
    control.setValue(leaf, { emitEvent: false });
    control.markAsDirty();
    control.updateValueAndValidity({ emitEvent: false });
    this.#entryForm.publishSnapshot();
  }

  /**
   * The prefix leaves the field the user is looking at and lands in a pill above
   * it, so say so twice: a highlight for the eye, a live region for the reader.
   */
  #announceLocationAbsorbed(folderPath: string): void {
    this.locationAbsorbedMessage.set(
      this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.LOCATIONFROMKEYX, { folder: folderPath }),
    );

    this.locationAbsorbedFlash.set(false);
    // Let the class drop for a frame so a second paste re-runs the animation.
    requestAnimationFrame(() => this.locationAbsorbedFlash.set(true));
    this.#resetLocationFlash(() => this.locationAbsorbedFlash.set(false));
  }

  // Escape is handled through `dialogRef.keydownEvents()` in
  // `#guardAgainstAccidentalClose`. A window-scoped listener also fired for
  // keystrokes aimed at the confirmation dialogs stacked on top of this one,
  // closing the editor underneath them and destroying the form.

  @HostListener('window:keydown.control.enter', ['$event'])
  @HostListener('window:keydown.meta.enter', ['$event'])
  async onCtrlEnter(event: Event): Promise<void> {
    event.preventDefault();
    await this.onSubmit();
  }

  // ── Location popover ──────────────────────────────────────────────────────

  toggleFolderPopover(): void {
    if (this.isReadOnly()) {
      return;
    }
    if (this.isFolderPopoverOpen()) {
      this.closeFolderPopover();
      return;
    }
    this.openFolderPopover();
  }

  openFolderPopover(): void {
    if (this.isReadOnly()) {
      return;
    }
    this.stagedFolderPath.set(null);
    this.folderFilter.set('');
    this.isFolderPopoverOpen.set(true);
    this.#focusOnceRendered(() => this.folderFilterInput?.nativeElement);
  }

  /**
   * Confirm, Escape and a backdrop click all land here, so focus comes back to
   * the pill that opened the popover rather than the top of the dialog. The
   * `(detach)` binding fires a second time after we have already closed; the
   * `wasOpen` check keeps that from stealing focus from wherever it went next.
   */
  closeFolderPopover(restoreFocus = true): void {
    const wasOpen = this.isFolderPopoverOpen();
    this.isFolderPopoverOpen.set(false);
    this.stagedFolderPath.set(null);
    if (wasOpen && restoreFocus) {
      this.#focusOnceRendered(() => this.locationPill?.nativeElement);
    }
  }

  /** Opens the picker's own inline folder-name field under the staged folder. */
  startNewFolder(): void {
    this.folderPicker?.onAddFolder(this.popoverFolderPath());
  }

  onFolderFilterInput(event: Event): void {
    this.folderFilter.set((event.target as HTMLInputElement).value);
  }

  /** Confirms the folder staged in the popover and closes it. */
  confirmStagedFolder(): void {
    const staged = this.stagedFolderPath();
    if (staged !== null) {
      this.#location.pick(staged);
    }
    this.closeFolderPopover();
  }

  // ── Other-locales drawer ──────────────────────────────────────────────────

  openLocalesDrawer(): void {
    if (this.otherLocales().length === 0) {
      return;
    }
    this.isLocalesDrawerOpen.set(true);
    this.#focusOnceRendered(() => this.drawerFirstControl?.nativeElement);
  }

  /** Done, Escape and the back arrow all hand focus back to the row that opened it. */
  closeLocalesDrawer(restoreFocus = true): void {
    const wasOpen = this.isLocalesDrawerOpen();
    this.isLocalesDrawerOpen.set(false);
    if (wasOpen && restoreFocus) {
      this.#focusOnceRendered(() => this.otherLocalesRow?.nativeElement);
    }
  }

  /**
   * Focus after the view that holds the target exists. A microtask would run
   * before change detection has rendered a panel that was just opened.
   *
   * `afterFocus` runs on the same element once it holds focus, for callers that
   * also have a caret to place or a field to scroll into view.
   */
  #focusOnceRendered<T extends HTMLElement>(target: () => T | undefined, afterFocus?: (element: T) => void): void {
    setTimeout(() => {
      const element = target();
      if (!element) {
        return;
      }
      element.focus();
      afterFocus?.(element);
    });
  }

  toggleContext(): void {
    this.isContextOpen.update((open) => !open);
  }

  /** Writes a status from the per-locale pill menu into the same FormArray as before. */
  setLocaleStatus(index: number, status: TranslationStatus): void {
    const group = this.getLocaleFormGroup(index);
    group.controls.status.setValue(status);
    group.controls.status.markAsDirty();
  }

  async onCancel(): Promise<void> {
    // Escape and the close button reach here; an open panel is the nearest thing
    // to dismiss, so it goes first and the form stays untouched.
    if (this.isFolderPopoverOpen()) {
      this.closeFolderPopover();
      return;
    }
    if (this.isLocalesDrawerOpen()) {
      this.closeLocalesDrawer();
      return;
    }
    if (this.hasUnsavedChanges() && !(await this.#confirmDiscard())) {
      return;
    }
    this.#close({ kind: 'cancelled' });
  }

  #close(outcome: EditorOutcome): void {
    this.dialogRef.close(outcome);
  }

  #confirmDiscard(): Promise<boolean> {
    const spec = {
      title: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.TITLE,
      message: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.MESSAGE,
      confirmButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.DISCARD,
      cancelButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.UNSAVED.KEEPEDITING,
    };

    return this.confirm(spec, { width: '440px', disableClose: true });
  }

  /** The picker inside the popover stages a folder; the popover's button commits it. */
  onFolderStaged(folderPath: string): void {
    this.stagedFolderPath.set(folderPath);
  }

  onFolderConfirmed(folderPath: string): void {
    this.#location.pick(folderPath);
  }

  onFolderCreated(folder: FolderNodeDto): void {
    // The store's createFolder already updated rootFolders; update the selection.
    this.#location.pick(folder.fullPath);
    this.stagedFolderPath.set(folder.fullPath);
  }

  addTagValue(rawValue: string): void {
    this.#entryForm.addTag(rawValue);
    this.tagInputText.set('');
  }

  addTagFromAutocomplete(event: MatAutocompleteSelectedEvent, input: HTMLInputElement): void {
    this.addTagValue(event.option.value as string);
    input.value = '';
  }

  removeTag(tag: string): void {
    this.#entryForm.removeTag(tag, this.inheritedTagsList());
  }

  onTagInputChange(event: Event): void {
    this.tagInputText.set((event.target as HTMLInputElement).value);
  }

  /**
   * Leaves for the entry that already holds this key. Same close payload as the
   * conflict dialog's "Edit existing", and the same unsaved-work guard as any
   * other way out of the dialog.
   */
  async openExistingResource(): Promise<void> {
    const existingKey = resolveDraftKey(this.#entryForm.draft(this.selectedFolderPath()));

    if (this.hasUnsavedChanges() && !(await this.#confirmDiscard())) {
      return;
    }

    this.#close({ kind: 'open-existing', fullKey: existingKey });
  }

  onSimilarResourceClick(result: SearchResultDto): void {
    this.#copyToClipboard(result.fullKey, this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYCOPIED));
  }

  /**
   * The footer is the only place the full dotted key is spelled out, so it is
   * also the place to take it from. Same clipboard path and same snackbar the
   * row's key chip uses, plus a check glyph while the toast is still up.
   */
  copyFullKey(): void {
    this.#copyToClipboard(
      this.fullKeyPreview(),
      this.transloco.translate(TRACKER_TOKENS.BROWSER.TOAST.COPIEDTOCLIPBOARD),
      () => this.#keyCopiedFlash.trigger(),
    );
  }

  #copyToClipboard(text: string, successMessage: string, onCopied?: () => void): void {
    const failedMessage = this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COPYFAILED);
    void copyToClipboard(text).then((outcome) => {
      if (outcome === 'copied') {
        this.notifications.success(successMessage);
        onCopied?.();
      } else {
        this.notifications.error(failedMessage);
      }
    });
  }

  async onSubmit(): Promise<void> {
    const decision = await this.#submit.trigger({
      mode: this.data.mode,
      draft: this.#entryForm.draft(this.selectedFolderPath()),
      original: this.#originalEntry(),
      readOnly: this.isReadOnly(),
      invalid: this.form.invalid,
      collision: this.keyCollision(),
    });
    this.#renderSubmitDecision(decision);
  }

  /**
   * Names the problem, dismisses anything covering the form, and puts the caret
   * in the offending field.
   */
  #revealValidationFailure(): void {
    this.submitAttempted.set(true);
    this.form.markAllAsTouched();
    this.errorMessage.set(this.transloco.translate(TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.FIXERRORS));

    // Focus belongs to the offending field, not to whatever opened the panel.
    this.closeFolderPopover(false);
    this.closeLocalesDrawer(false);

    queueMicrotask(() => {
      const target = this.form.controls.key.invalid ? this.keyInput : this.baseValueInput;
      target?.nativeElement.focus();
    });
  }

  #renderSubmitDecision(decision: EditorSubmitDecision): void {
    if (decision.kind === 'ignored') return;
    if (decision.kind === 'invalid') {
      this.#revealValidationFailure();
      return;
    }
    if (decision.kind === 'focus-comment') {
      this.#focusCommentField();
      return;
    }
    if (decision.kind === 'outcome') {
      this.#close(decision.outcome);
      return;
    }

    this.errorMessage.set(this.feedback.text(decision.feedback));
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

    return this.confirm(spec, { width: '500px' });
  }

  #showCommentConfirmation(): Promise<boolean> {
    const spec = {
      title: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.TITLE,
      message: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.MESSAGE,
      confirmButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.SAVEANYWAY,
      cancelButtonText: TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.COMMENTCONFIRM.ADDCOMMENT,
    };

    return this.confirm(spec, { width: '400px', disableClose: true });
  }

  /**
   * "Add comment" asked for the Comment field, so put the caret in it. The
   * confirmation's focus trap hands focus back to the Save button as it closes,
   * and `afterClosed()` resolves in that same turn — deferring a task past it
   * (the `#focusOnceRendered` pattern) is what keeps CDK from taking it back.
   */
  #focusCommentField(): void {
    this.#focusOnceRendered(
      () => this.commentInput?.nativeElement,
      (textarea) => {
        // The field may be below the fold on a scrolled form.
        textarea.scrollIntoView?.({ block: 'nearest' });
        // Selects whatever is there, so a rewrite types over it; an empty field
        // just parks the caret.
        textarea.setSelectionRange(0, textarea.value.length);
      },
    );
  }

  getLocaleFormGroup(index: number): FormGroup<{
    locale: FormControl<string>;
    value: FormControl<string>;
    status: FormControl<TranslationStatus>;
  }> {
    return this.form.controls.translations.at(index) as FormGroup<{
      locale: FormControl<string>;
      value: FormControl<string>;
      status: FormControl<TranslationStatus>;
    }>;
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
      const names = new Intl.DisplayNames([this.transloco.getActiveLang()], { type: 'language' });
      const name = names.of(locale);
      return name && name.toLowerCase() !== locale.toLowerCase() ? name : code;
    } catch {
      return code;
    }
  }

  getKeyErrorMessage(): string {
    const keyControl = this.form.controls.key;

    if (keyControl.hasError('required')) {
      return TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYREQUIRED;
    }

    if (keyControl.hasError('pattern')) {
      return TRACKER_TOKENS.BROWSER.TRANSLATIONEDITOR.KEYPATTERNERROR;
    }

    return '';
  }
}
